// Wipes all shop data for a fresh setup. Admin only; requires the admin's password
// again and the exact phrase "RESET SHOP". Keeps users, roles, permissions,
// metal rates and the audit log.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BUCKETS = ["customer-docs", "product-images"];

async function emptyBucket(supa: any, bucket: string, prefix = ""): Promise<number> {
  let removed = 0;
  for (;;) {
    const { data, error } = await supa.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error || !data?.length) break;
    const files = data.filter((f: any) => f.id).map((f: any) => (prefix ? `${prefix}/${f.name}` : f.name));
    const folders = data.filter((f: any) => !f.id).map((f: any) => (prefix ? `${prefix}/${f.name}` : f.name));
    for (const f of folders) removed += await emptyBucket(supa, bucket, f);
    if (files.length) {
      await supa.storage.from(bucket).remove(files);
      removed += files.length;
    }
    if (!files.length) break;
  }
  return removed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u } = await userClient.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Please sign in again" }, 401);
    const { data: roles } = await supa.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r: any) => r.role === "admin")) return json({ error: "Only an admin can reset the shop" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "counts") {
      const tables = ["customers", "inventory_items", "invoices", "quotations", "orders", "repairs", "payments", "purchases", "old_gold_purchases", "karigars", "suppliers"];
      const out: Record<string, number> = {};
      for (const t of tables) {
        const { count } = await supa.from(t).select("id", { count: "exact", head: true });
        out[t] = count ?? 0;
      }
      return json({ counts: out });
    }

    if (action !== "confirm") return json({ error: "Unknown action" }, 400);
    if (body.phrase !== "RESET SHOP") return json({ error: "Type RESET SHOP exactly to confirm" }, 400);
    const password = String(body.password ?? "");
    if (!password || !user.email) return json({ error: "Enter your password" }, 400);

    // Re-check the password with a fresh sign-in, so an unattended open session is not enough.
    const fresh = createClient(url, anon, { auth: { persistSession: false } });
    const { error: pwErr } = await fresh.auth.signInWithPassword({ email: user.email, password });
    if (pwErr) {
      await supa.from("audit_logs").insert({ actor_id: user.id, actor_email: user.email, action: "shop_reset_denied", details: { reason: "wrong password" } });
      return json({ error: "That password is not correct. If you sign in with Google, set a password in User management first." }, 403);
    }

    const { data: counts, error } = await supa.rpc("reset_shop_data", { _actor: user.id, _actor_email: user.email });
    if (error) throw error;
    let files = 0;
    for (const b of BUCKETS) files += await emptyBucket(supa, b);
    return json({ ok: true, removed: counts, files });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
