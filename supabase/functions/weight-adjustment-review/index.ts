import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateResponse, GatewayError } from "npm:@lovable.dev/ai-gateway";
import { z } from "npm:zod@3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({ adjustment_id: z.string().uuid() });

const schema = {
  type: "object", additionalProperties: false,
  required: ["risk_level", "inconsistencies", "summary", "recommendation"],
  properties: {
    risk_level: { type: "string", enum: ["low", "medium", "high"] },
    inconsistencies: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    recommendation: { type: "string", enum: ["approve", "investigate", "reject"] },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "Missing authorization" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Invalid session" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("user_has_permission", { _uid: u.user.id, _perm: "inventory_adjust_approve" });
    if (!allowed) return json({ error: "Only approvers can run an AI review" }, 403);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Invalid request" }, 400);

    const { data: adj } = await admin.from("inventory_weight_adjustments").select("*").eq("id", parsed.data.adjustment_id).maybeSingle();
    if (!adj) return json({ error: "Adjustment not found" }, 404);
    const { data: item } = await admin.from("inventory_items")
      .select("sku, legacy_code, name, metal, purity, gross_weight, stone_weight, net_weight, fine_weight, status, received_at, created_at, categories(name), locations(name)")
      .eq("id", adj.inventory_item_id).maybeSingle();
    const { data: history } = await admin.from("inventory_weight_adjustments")
      .select("requested_at, requested_by_email, status, auto_applied, within_tolerance, reason_type, reason, old_gross_weight, new_gross_weight, old_stone_weight, new_stone_weight, old_net_weight, new_net_weight, old_fine_weight, new_fine_weight, reviewed_by_email, review_note")
      .eq("inventory_item_id", adj.inventory_item_id).neq("id", adj.id).order("requested_at", { ascending: false }).limit(50);
    const { count: requesterCount } = await admin.from("inventory_weight_adjustments")
      .select("id", { count: "exact", head: true }).eq("requested_by", adj.requested_by)
      .gte("requested_at", new Date(Date.now() - 30 * 864e5).toISOString());
    const { data: settings } = await admin.from("app_settings").select("weight_tolerance_grams").limit(1).maybeSingle();

    const facts = {
      tolerance_grams: settings?.weight_tolerance_grams,
      request: {
        requested_at: adj.requested_at, requested_by: adj.requested_by_email, reason_type: adj.reason_type, reason: adj.reason,
        within_tolerance: adj.within_tolerance,
        old: { gross: adj.old_gross_weight, stone: adj.old_stone_weight, net: adj.old_net_weight, fine: adj.old_fine_weight },
        new: { gross: adj.new_gross_weight, stone: adj.new_stone_weight, net: adj.new_net_weight, fine: adj.new_fine_weight },
      },
      item, previous_adjustments_for_item: history ?? [], requester_requests_last_30_days: requesterCount ?? 0,
    };

    const res = await generateResponse({
      model: "openai/gpt-6-astra",
      instructions: "You audit stock weight adjustments for a Nepali jewellery shop. Weights are grams. Purity factors: 24K=1, 22K=0.916, 18K=0.75, 14K=0.585, silver 999=0.999, 925=0.925; fine = net x factor. Look for inconsistencies: stone weight above gross, net not equal gross minus stone, fine not matching purity, change larger than tolerance, repeated or cumulative losses on the item, many requests by the same staff member, reason that does not fit the direction or size of the change (e.g. 'polishing loss' with a weight gain, 'stone change' with no stone weight change), items reserved for a customer. Be concise and factual; mention numbers. Do not invent facts.",
      input: [{ role: "user", content: `Assess this adjustment and return JSON.\n${JSON.stringify(facts)}` }],
      text: { format: { type: "json_schema", name: "weight_risk", strict: true, schema } },
    } as any);

    const out = (res as any).output_text ?? ((res as any).output ?? [])
      .flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
    let result: any;
    try { result = JSON.parse(out); } catch { return json({ error: "The AI returned an unreadable answer. Try again." }, 502); }

    await admin.from("inventory_weight_adjustments").update({
      ai_risk_level: result.risk_level, ai_summary: result, ai_reviewed_at: new Date().toISOString(),
    }).eq("id", adj.id);
    await admin.from("audit_logs").insert({
      actor_id: u.user.id, actor_email: u.user.email, action: "inventory_weight_adjustment_ai_review",
      details: { adjustment_id: adj.id, sku: adj.sku, risk_level: result.risk_level, summary: result.summary },
    });
    return json({ result });
  } catch (e) {
    if (e instanceof GatewayError) {
      const status = (e as any).httpStatus;
      if (status === 429) return json({ error: "AI is busy right now. Please try again in a minute." }, 429);
      if (status === 402) return json({ error: "AI credits are used up. Add credits in workspace settings." }, 402);
      console.error("gateway", (e as any).code, (e as any).ids);
      return json({ error: "AI review failed. Please try again." }, 502);
    }
    console.error(e);
    return json({ error: "Something went wrong" }, 500);
  }
});
