export const VAT_RATE = 13;

export function npr(n: number | null | undefined, opts: { withSymbol?: boolean } = { withSymbol: true }) {
  const v = Number(n ?? 0);
  const s = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  return opts.withSymbol ? `रू ${s}` : s;
}

export function gms(n: number | null | undefined, decimals = 3) {
  return `${Number(n ?? 0).toFixed(decimals)} g`;
}

export interface WeightInputs {
  gross: number;
  stone: number;
  purity: string; // e.g. "22K", "18K", "999"
}

export function computeNetWeight(gross: number, stone: number) {
  return Math.max(0, (gross || 0) - (stone || 0));
}

export function purityFactor(purity: string): number {
  if (!purity) return 1;
  const trimmed = purity.trim().toUpperCase();
  const karatMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*K$/);
  if (karatMatch) return parseFloat(karatMatch[1]) / 24;
  const fineness = parseFloat(trimmed); // e.g. 999, 916, 750
  if (!isNaN(fineness) && fineness > 1) return fineness / 1000;
  if (!isNaN(fineness)) return fineness;
  return 1;
}

export function computeFineWeight(netWeight: number, purity: string) {
  return netWeight * purityFactor(purity);
}

export interface PricingInputs {
  netWeight: number;
  ratePerGram: number;
  makingCharge: number;
  makingChargeType: "per_gram" | "fixed" | "percentage";
  wastageType: "percentage" | "weight" | "fixed";
  wastageValue: number;
  stoneValue: number;
  quantity?: number;
}

export function computeLineTotal(p: PricingInputs) {
  const qty = p.quantity ?? 1;
  const metalValue = p.netWeight * p.ratePerGram;
  let making = 0;
  if (p.makingChargeType === "per_gram") making = p.makingCharge * p.netWeight;
  else if (p.makingChargeType === "percentage") making = (metalValue * p.makingCharge) / 100;
  else making = p.makingCharge;

  let wastageAmount = 0;
  if (p.wastageType === "percentage") wastageAmount = (metalValue * p.wastageValue) / 100;
  else if (p.wastageType === "weight") wastageAmount = p.wastageValue * p.ratePerGram;
  else wastageAmount = p.wastageValue;

  const lineTotal = (metalValue + making + wastageAmount + p.stoneValue) * qty;
  return { metalValue, making, wastageAmount, lineTotal };
}

export function nextNumber(prefix: string, seq: number, pad = 5) {
  const yy = new Date().getFullYear().toString().slice(-2);
  return `${prefix}-${yy}-${String(seq).padStart(pad, "0")}`;
}
