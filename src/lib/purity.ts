import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for the metals and purities the shop trades in.
 * Gold: 24K (fine), 22K (916), 18K (750), 14K (585).
 * Silver: 999 (fine), 925 (sterling).
 */

export const METALS = ["gold", "silver"] as const;
/** Metals allowed on inventory items (non-metal stock still needs diamond/other). */
export const ITEM_METALS = ["gold", "silver", "diamond", "other"] as const;

export const GOLD_PURITIES = ["24K", "22K", "18K", "14K"] as const;
export const SILVER_PURITIES = ["999", "925"] as const;

/** Exact purity factors (not raw karat/24). */
export const PURITY_FACTORS: Record<string, number> = {
  "24K": 1,
  "22K": 0.916,
  "18K": 0.75,
  "14K": 0.585,
  "999": 0.999,
  "925": 0.925,
};

export const PURITY_LABELS: Record<string, string> = {
  "24K": "24K (fine gold)",
  "22K": "22K (916)",
  "18K": "18K (750)",
  "14K": "14K (585)",
  "999": "999 (fine silver)",
  "925": "925 (sterling)",
};

export const ALL_PURITIES = [...GOLD_PURITIES, ...SILVER_PURITIES];

export function purityOptions(metal?: string | null): string[] {
  if (metal === "silver") return [...SILVER_PURITIES];
  if (metal === "gold") return [...GOLD_PURITIES];
  return ALL_PURITIES;
}

export function purityLabel(p: string) {
  return PURITY_LABELS[p] ?? p;
}

/** Derive the rate for a purity from the fine (24K / 999) rate of that metal. */
export function derivedRate(fineRate: number, purity: string): number {
  const f = PURITY_FACTORS[purity] ?? 1;
  return Math.round(fineRate * f * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Custom-purity toggle (app_settings.allow_custom_purity)             */
/* ------------------------------------------------------------------ */

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export async function fetchAllowCustomPurity(): Promise<boolean> {
  if (cached !== null) return cached;
  if (!inflight) {
    inflight = supabase
      .from("app_settings")
      .select("allow_custom_purity")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        cached = (data as any)?.allow_custom_purity ?? true;
        return cached!;
      });
  }
  return inflight;
}

export function resetAllowCustomPurityCache(value?: boolean) {
  cached = value ?? null;
  inflight = null;
}

export function useAllowCustomPurity(): boolean {
  const [allowed, setAllowed] = useState<boolean>(cached ?? true);
  useEffect(() => {
    let active = true;
    fetchAllowCustomPurity().then((v) => { if (active) setAllowed(v); });
    return () => { active = false; };
  }, []);
  return allowed;
}
