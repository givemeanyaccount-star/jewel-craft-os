export const VAT_RATE = 13;
// Nepal SD tax: 0.5% on (gold + making + wastage − old gold credit).
// No minimum threshold; skipped when old gold credit covers the base.
export const SD_TAX_RATE = 0.5;

export interface TaxBreakdown {
  subtotal: number;        // sum of all line totals (metal + making + wastage + stones)
  stonesTotal: number;     // VAT-taxable portion only
  nonStoneTotal: number;   // gold + making + wastage (no VAT)
  discount: number;
  taxableStones: number;   // stones portion after proportional discount
  vat: number;             // VAT on stones only (0 when VAT is disabled in settings)
  sdTax: number;           // 0.5% of (gold + making + wastage − old gold credit)
  oldGoldCredit: number;
  total: number;
}

export function computeInvoiceTaxes(opts: {
  subtotal: number;
  stonesTotal: number;
  discount?: number;
  oldGoldCredit?: number;
  vatRate?: number;
  vatEnabled?: boolean;
  sdTaxRate?: number;
}): TaxBreakdown {
  const subtotal = Math.max(0, opts.subtotal || 0);
  const stonesTotal = Math.max(0, Math.min(opts.stonesTotal || 0, subtotal));
  const nonStoneTotal = subtotal - stonesTotal;
  const discount = Math.max(0, Math.min(opts.discount || 0, subtotal));
  const oldGoldCredit = Math.max(0, opts.oldGoldCredit || 0);
  const vatEnabled = opts.vatEnabled ?? true;
  const vatRate = vatEnabled ? (opts.vatRate ?? VAT_RATE) : 0;
  const sdRate = opts.sdTaxRate ?? SD_TAX_RATE;

  const postDiscount = Math.max(0, subtotal - discount);
  // proportionally allocate the discount to the stones portion for VAT base
  const stonesShare = subtotal > 0 ? stonesTotal / subtotal : 0;
  const taxableStones = Math.max(0, postDiscount * stonesShare);
  const vat = (taxableStones * vatRate) / 100;
  // SD tax: applies on (gold + making + wastage) AFTER deducting old gold credit.
  const nonStonePostDiscount = Math.max(0, postDiscount - taxableStones);
  const sdBase = Math.max(0, nonStonePostDiscount - oldGoldCredit);
  const sdTax = sdBase > 0 ? (sdBase * sdRate) / 100 : 0;
  const total = Math.max(0, postDiscount + vat + sdTax - oldGoldCredit);

  return { subtotal, stonesTotal, nonStoneTotal, discount, taxableStones, vat, sdTax, oldGoldCredit, total };
}

// Back-solve the discount so the final total equals a desired net amount.
export function discountForTargetTotal(opts: {
  subtotal: number;
  stonesTotal: number;
  oldGoldCredit?: number;
  targetTotal: number;
  vatRate?: number;
  vatEnabled?: boolean;
  sdTaxRate?: number;
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
  // Percentage purity, e.g. "91.6%" -> 0.916
  const pctMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pctMatch) return parseFloat(pctMatch[1]) / 100;
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

/** Convert a rate quoted for a given purity into the equivalent fine (pure) metal rate per gram. */
export function fineRateFromLine(ratePerGram: number, purity: string): number {
  const f = purityFactor(purity);
  if (!ratePerGram || !f) return 0;
  return ratePerGram / f;
}

/** Grams of fine metal an amount of money is worth at a given fine rate per gram. */
export function fineEquivalentGrams(amount: number, fineRatePerGram: number): number {
  if (!amount || !fineRatePerGram || fineRatePerGram <= 0) return 0;
  return amount / fineRatePerGram;
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
