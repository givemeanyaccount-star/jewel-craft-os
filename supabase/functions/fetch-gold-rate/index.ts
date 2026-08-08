// Fetches today's gold/silver rate from FENEGOSIDA (Federation of Nepal Gold and
// Silver Dealers Association — the official price-setting body) and upserts into
// metal_rates for the requested purities. Falls back to scraping HTML.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const PURITY_FACTORS: Record<string, number> = {
  "24K": 1,
  "22K": 0.916,
  "18K": 0.75,
  "14K": 0.585,
  "999": 0.999,
  "925": 0.925,
};

const API_URL = "https://api.fenegosida.org/api/website/v1/Dashboard/today";

function pick(rows: any[], keywords: string[]): number {
  const row = rows.find((r) =>
    keywords.every((k) => String(r?.rateType ?? "").toLowerCase().includes(k.toLowerCase()))
  );
  const v = Number(row?.todayBaseRatePerGram ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** FENEGOSIDA's site is a SPA — read its public JSON API instead of scraping HTML. */
async function scrape(): Promise<{ fineGoldPer10g: number; silverPer10g: number; source: string }> {
  const res = await fetch(API_URL, {
    headers: { "user-agent": "Mozilla/5.0 JewelMasterOS/1.0", accept: "application/json" },
  });
  if (!res.ok) throw new Error(`FENEGOSIDA fetch failed: ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected FENEGOSIDA API response");

  // "छापावाल सुन (१० ग्राम)" = fine/hallmark gold per 10 g; fall back to tola (11.6638 g).
  let fineGoldPer10g = pick(rows, ["छापावाल", "ग्राम"]) || pick(rows, ["तेजाबी", "ग्राम"]);
  if (!fineGoldPer10g) {
    const tola = pick(rows, ["छापावाल", "तोला"]) || pick(rows, ["तेजाबी", "तोला"]);
    if (tola) fineGoldPer10g = (tola / 11.6638) * 10;
  }
  let silverPer10g = pick(rows, ["चाँदी", "ग्राम"]);
  if (!silverPer10g) {
    const tola = pick(rows, ["चाँदी", "तोला"]);
    if (tola) silverPer10g = (tola / 11.6638) * 10;
  }
  if (!fineGoldPer10g) throw new Error("Could not read fine gold rate from FENEGOSIDA");
  return {
    fineGoldPer10g: Math.round(fineGoldPer10g * 100) / 100,
    silverPer10g: Math.round(silverPer10g * 100) / 100,
    source: "fenegosida.org",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Verify the caller is signed in.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only roles allowed to write metal rates may trigger the sync.
    const { data: roleRows } = await supa
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const allowed = ["admin", "manager", "accountant"];
    if (!roleRows?.some((r: { role: string }) => allowed.includes(r.role))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const { fineGoldPer10g, silverPer10g, source } = await scrape();
    const goldPerGram999 = fineGoldPer10g / 10; // 9999 fine basis

    const today = new Date().toISOString().slice(0, 10);
    const rows: any[] = [];
    // Gold rows: 24K (fine), 22K (916), 18K (750), 14K (585)
    for (const purity of ["24K", "22K", "18K", "14K"]) {
      const factor = PURITY_FACTORS[purity];
      rows.push({
        metal: "gold",
        purity,
        rate_per_gram: Math.round(goldPerGram999 * factor * 100) / 100,
        effective_date: today,
        source,
        created_by: userData.user.id,
      });
    }
    if (silverPer10g > 0) {
      rows.push({
        metal: "silver",
        purity: "925",
        rate_per_gram: Math.round((silverPer10g / 10) * 0.925 * 100) / 100,
        effective_date: today,
        source,
        created_by: userData.user.id,
      });
      rows.push({
        metal: "silver",
        purity: "999",
        rate_per_gram: Math.round((silverPer10g / 10) * 100) / 100,
        effective_date: today,
        source,
        created_by: userData.user.id,
      });
    }

    // Upsert by (metal, purity, effective_date)
    const { error } = await supa.from("metal_rates").upsert(rows, {
      onConflict: "metal,purity,effective_date",
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, source, fineGoldPer10g, silverPer10g, count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
