import { supabase } from "@/integrations/supabase/client";
import { fineRateFromLine, fineEquivalentGrams } from "@/lib/format";

/**
 * Fine (pure) metal rate helpers used to show the "equivalent fine weight"
 * of an old gold / old metal trade-in on sales documents.
 */

export type FineRates = Record<string, number>; // metal -> fine rate per gram

/** Latest fine rate per gram for every metal, derived from the newest rate row of each metal. */
export async function fetchLatestFineRates(): Promise<FineRates> {
  const { data } = await supabase
    .from("metal_rates")
    .select("metal, purity, rate_per_gram, effective_date")
    .order("effective_date", { ascending: false })
    .limit(200);
  const out: FineRates = {};
  for (const r of (data ?? []) as any[]) {
    const metal = r.metal as string;
    if (out[metal]) continue; // first row per metal is the most recent
    const fine = fineRateFromLine(Number(r.rate_per_gram), r.purity ?? "");
    if (fine > 0) out[metal] = fine;
  }
  return out;
}

/**
 * Fine rate to use for a document: prefer the highest-value line of the same metal
 * on the bill (converted up to fine), otherwise the latest market fine rate.
 */
export function billFineRate(
  items: Array<{ metal?: string | null; purity?: string | null; rate?: number | null; line_total?: number | null }>,
  metal: string,
  fallback: FineRates,
): number {
  const lines = (items ?? []).filter((i) => (i.metal ?? "") === metal && Number(i.rate ?? 0) > 0);
  if (lines.length) {
    const best = lines.reduce((a, b) => (Number(b.line_total ?? 0) > Number(a.line_total ?? 0) ? b : a));
    const fine = fineRateFromLine(Number(best.rate), best.purity ?? "");
    if (fine > 0) return fine;
  }
  return fallback[metal] ?? 0;
}

export const METAL_LABEL: Record<string, string> = {
  gold: "gold", silver: "silver", diamond: "diamond", other: "metal",
};

/** "≈ 1.786 g fine gold" — or null when no reliable rate exists. */
export function fineEquivalentNote(amount: number, fineRate: number, metal: string): string | null {
  const g = fineEquivalentGrams(amount, fineRate);
  if (!g) return null;
  return `≈ ${g.toFixed(3)} g fine ${METAL_LABEL[metal] ?? metal}`;
}
