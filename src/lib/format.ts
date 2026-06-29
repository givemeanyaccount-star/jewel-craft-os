export const VAT_RATE = 13;
// Nepal Luxury Tax (Luxury Tax Act 2081/2024): 2% on pre-VAT amount for gold jewellery
// (including diamonds, pearls, gemstones) when a single transaction exceeds NPR 1,000,000.
export const LUXURY_TAX_RATE = 2;
export const LUXURY_TAX_THRESHOLD = 1_000_000;

export interface TaxBreakdown {
  subtotal: number;        // sum of all line totals (metal + making + wastage + stones)
  stonesTotal: number;     // VAT-taxable portion only
  nonStoneTotal: number;   // gold + making + wastage (no VAT)
  discount: number;
  taxableStones: number;   // stones portion after proportional discount
  vat: number;             // VAT on stones only
  luxuryTax: number;       // 2% of pre-VAT (post-discount) subtotal if > threshold
  oldGoldCredit: number;
  total: number;
}

export function computeInvoiceTaxes(opts: {
  subtotal: number;
  stonesTotal: number;
  discount?: number;
  oldGoldCredit?: number;
  vatRate?: number;
  luxuryTaxRate?: number;
  luxuryTaxThreshold?: number;
}): TaxBreakdown {
  const subtotal = Math.max(0, opts.subtotal || 0);
  const stonesTotal = Math.max(0, Math.min(opts.stonesTotal || 0, subtotal));
  const nonStoneTotal = subtotal - stonesTotal;
  const discount = Math.max(0, Math.min(opts.discount || 0, subtotal));
  const oldGoldCredit = Math.max(0, opts.oldGoldCredit || 0);
  const vatRate = opts.vatRate ?? VAT_RATE;
  const luxRate = opts.luxuryTaxRate ?? LUXURY_TAX_RATE;
  const luxThreshold = opts.luxuryTaxThreshold ?? LUXURY_TAX_THRESHOLD;

  const postDiscount = Math.max(0, subtotal - discount);
  // proportionally allocate the discount to the stones portion for VAT base
  const stonesShare = subtotal > 0 ? stonesTotal / subtotal : 0;
  const taxableStones = Math.max(0, postDiscount * stonesShare);
  const vat = (taxableStones * vatRate) / 100;
  const luxuryTax = postDiscount > luxThreshold ? (postDiscount * luxRate) / 100 : 0;
  const total = Math.max(0, postDiscount + vat + luxuryTax - oldGoldCredit);

  return { subtotal, stonesTotal, nonStoneTotal, discount, taxableStones, vat, luxuryTax, oldGoldCredit, total };
}

// Back-solve the discount so the final total equals a desired net amount.
export function discountForTargetTotal(opts: {
  subtotal: number;
  stonesTotal: number;
  oldGoldCredit?: number;
  targetTotal: number;
  vatRate?: number;
  luxuryTaxRate?: number;
  luxuryTaxThreshold?: number;
}): number {
  const subtotal = Math.max(0, opts.subtotal || 0);
  const target = Math.max(0, opts.targetTotal || 0);
  if (subtotal <= 0) return 0;
  // binary search for discount in [0, subtotal]
  let lo = 0, hi = subtotal, best = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const t = computeInvoiceTaxes({ ...opts, discount: mid }).total;
    if (t > target) lo = mid; else { hi = mid; best = mid; }
    if (Math.abs(t - target) < 0.01) { best = mid; break; }
  }
  return Math.round(best * 100) / 100;
}

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
