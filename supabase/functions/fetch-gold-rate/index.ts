// Fetches today's gold/silver rate from FENEGOSIDA (Federation of Nepal Gold and
// Silver Dealers Association — the official price-setting body) and upserts into
// metal_rates for the requested purities. Falls back to scraping HTML.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const PURITY_FACTORS: Record<string, number> = {
  "24K": 24 / 24,
  "22K": 22 / 24,
  "20K": 20 / 24,
  "18K": 18 / 24,
  "14K": 14 / 24,
  "999": 0.999,
  "925": 0.925,
};

async function scrape(): Promise<{ fineGoldPer10g: number; silverPer10g: number; source: string }> {
  const res = await fetch("https://www.fenegosida.org/", {
    headers: { "user-agent": "Mozilla/5.0 JewelMasterOS/1.0" },
  });
  if (!res.ok) throw new Error(`FENEGOSIDA fetch failed: ${res.status}`);
  const html = await res.text();
  // Match "FINE GOLD (9999)per 10 grmNrs 254800/-" etc.
  const gold = html.match(/FINE\s*GOLD[^<]*?per\s*10\s*gr?m[^0-9]*([0-9,]+)/i);
  const silver = html.match(/SILVER[^<]*?per\s*10\s*gr?m[^0-9]*([0-9,.]+)/i);
  if (!gold) throw new Error("Could not parse FINE GOLD from FENEGOSIDA page");
  const fineGoldPer10g = Number(gold[1].replace(/,/g, ""));
  const silverPer10g = silver ? Number(silver[1].replace(/,/g, "")) : 0;
  return { fineGoldPer10g, silverPer10g, source: "fenegosida.org" };
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

    const { fineGoldPer10g, silverPer10g, source } = await scrape();
    const goldPerGram999 = fineGoldPer10g / 10; // 9999 fine basis

    const today = new Date().toISOString().slice(0, 10);
    const rows: any[] = [];
    // Gold rows: 24K, 22K, 20K, 18K, 14K, 999
    for (const purity of ["999", "24K", "22K", "20K", "18K", "14K"]) {
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
