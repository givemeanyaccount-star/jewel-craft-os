export const VAT_RATE = 13;
// Nepal SD tax: 0.5% on (gold + making + wastage − old metal credit).
// No minimum threshold; skipped when old metal credit covers the base.
export const SD_TAX_RATE = 0.5;

/** Round half-up (away from zero) to a fixed number of decimals, float-safe. */
export function roundTo(n: number, decimals: number) {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  const f = Math.pow(10, decimals);
  // toPrecision(12) folds binary representation noise (e.g. 2449.4999999999995 -> 2449.5)
  // before rounding, so values like 8.165 * 3 round to 24.50 instead of 24.49.
  const scaled = Number((Math.abs(v) * f).toPrecision(12));
  const rounded = Math.round(scaled) / f;
  return v < 0 ? -rounded : rounded;
}
/** Money: always 2 decimals. */
export const round2 = (n: number) => roundTo(Number(n) || 0, 2);
/** Weights: always 3 decimals. */
export const round3 = (n: number) => roundTo(Number(n) || 0, 3);


export interface TaxBreakdown {
  subtotal: number;        // sum of all line totals (metal + making + wastage + stones)
  stonesTotal: number;     // VAT-taxable portion only
  nonStoneTotal: number;   // gold + making + wastage (no VAT)
  discount: number;
  taxableStones: number;   // stones portion after proportional discount
  vat: number;             // VAT on stones only (0 when VAT is disabled in settings)
  sdTax: number;           // 0.5% of (gold + making + wastage − old metal credit)
  oldGoldCredit: number;   // credit offered
  creditApplied: number;   // part of the credit the bill could absorb
  creditUnused: number;    // surplus credit — refundable, never swallowed
  grossTotal: number;      // bill value before the old metal credit (goods + taxes)
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
  // SD tax: applies on (gold + making + wastage) AFTER deducting old metal credit.
  const nonStonePostDiscount = Math.max(0, postDiscount - taxableStones);
  const sdBase = Math.max(0, nonStonePostDiscount - oldGoldCredit);
  const sdTax = sdBase > 0 ? (sdBase * sdRate) / 100 : 0;
  const total = Math.max(0, postDiscount + vat + sdTax - oldGoldCredit);

  return {
    subtotal: round2(subtotal), stonesTotal: round2(stonesTotal), nonStoneTotal: round2(nonStoneTotal),
    discount: round2(discount), taxableStones: round2(taxableStones), vat: round2(vat), sdTax: round2(sdTax),
    oldGoldCredit: round2(oldGoldCredit), total: round2(total),
  };
}

/**
 * Cash-type advances collected on a linked order and settled against this bill.
 * Old-metal advances are excluded: they are already deducted through the invoice's
 * old metal credit line (pre-tax), so counting them here would double-deduct.
 * Shared by POS, InvoiceDetail and the printed bill so all three agree.
 */
export function advanceReceivedFromPayments(
  payments: Array<{ order_id?: string | null; method?: string | null; amount?: number | string | null }> = [],
): number {
  return round2(payments
    .filter((p) => p?.order_id && p?.method !== "old_gold")
    .reduce((s, p) => s + (Number(p?.amount ?? 0) || 0), 0));
}

/** What the customer still has to settle now, after the cash advance is deducted. */
export function netPayableOf(total: number, advanceReceived: number): number {
  return round2(Math.max(0, (Number(total) || 0) - (Number(advanceReceived) || 0)));
}

/** Money handed back when the advance applied to a bill exceeds its total. */
export function refundDueOf(total: number, advanceApplied: number): number {
  return round2(Math.max(0, (Number(advanceApplied) || 0) - (Number(total) || 0)));
}

/**
 * Refunds recorded against an invoice are negative payment rows (money out).
 * Shared by POS, InvoiceDetail and the printed bill so all three agree.
 */
export function refundPaidFromPayments(
  payments: Array<{ amount?: number | string | null }> = [],
): number {
  return round2(payments
    .reduce((s, p) => s + Math.min(0, Number(p?.amount ?? 0) || 0), 0) * -1);
}

/**
 * One reconciliation of a bill's money, shared by the invoice screen and the printed
 * bill so both always show identical figures.
 *
 *   Old metal + advance applied + at-sale payments − refund issued = total received
 *   Net payable = net total − advance applied
 *   Balance due = net payable − at-sale payments + refund issued
 */
export interface ReconcileInput {
  total: number;                 // invoice net total (already after old metal credit and taxes)
  oldGoldCredit?: number;
  vat?: number;
  sdTax?: number;
  balanceDue?: number | null;    // persisted value wins when present
  keptOnOrder?: number;          // advance left on the order for later batches
  payments?: Array<{ order_id?: string | null; method?: string | null; amount?: number | string | null }>;
}

export interface Reconciliation {
  oldGold: number;
  advanceApplied: number;
  modeRows: Array<[string, number]>;
  atSaleTotal: number;
  refundPaid: number;
  keptOnOrder: number;
  taxes: number;
  totalReceived: number;
  netPayable: number;
  balanceDue: number;
}

export function reconcile(input: ReconcileInput): Reconciliation {
  const payments = input.payments ?? [];
  const oldGold = round2(Number(input.oldGoldCredit ?? 0) || 0);
  const advanceApplied = advanceReceivedFromPayments(payments);
  const refundPaid = refundPaidFromPayments(payments);

  const m = new Map<string, number>();
  for (const p of payments) {
    const amt = Number(p?.amount ?? 0) || 0;
    if (amt < 0) continue;                  // refund — its own line
    if (p?.method === "old_gold") continue; // already in the old metal line
    if (p?.order_id) continue;              // counted as advance
    const key = String(p?.method ?? "other");
    m.set(key, round2((m.get(key) ?? 0) + amt));
  }
  const modeRows = Array.from(m.entries()).filter(([, v]) => v !== 0);
  const atSaleTotal = round2(modeRows.reduce((s, [, v]) => s + v, 0));

  const total = Number(input.total ?? 0) || 0;
  const netPayable = netPayableOf(total, advanceApplied);
  const totalReceived = round2(oldGold + advanceApplied + atSaleTotal - refundPaid);
  const balanceDue = round2(Math.max(0, input.balanceDue != null
    ? Number(input.balanceDue) || 0
    : netPayable - atSaleTotal + refundPaid));

  return {
    oldGold, advanceApplied, modeRows, atSaleTotal, refundPaid,
    keptOnOrder: round2(Math.max(0, Number(input.keptOnOrder ?? 0) || 0)),
    taxes: round2((Number(input.vat ?? 0) || 0) + (Number(input.sdTax ?? 0) || 0)),
    totalReceived, netPayable, balanceDue,
  };
}

/** Back-solve the discount so the refund handed back equals a desired amount. */

export function discountForTargetRefund(opts: {
  subtotal: number;
  stonesTotal: number;
  oldGoldCredit?: number;
  advanceApplied: number;
  targetRefund: number;
  vatRate?: number;
  vatEnabled?: boolean;
  sdTaxRate?: number;
}): number {
  const target = Math.max(0, (Number(opts.advanceApplied) || 0) - (Number(opts.targetRefund) || 0));
  return discountForTargetTotal({ ...opts, targetTotal: target });
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

/** 1 tola = 11.6638 grams (Nepali bullion standard). */
export const TOLA_GRAMS = 11.6638;

export function perTola(ratePerGram: number | null | undefined) {
  return Number(ratePerGram ?? 0) * TOLA_GRAMS;
}

export function perTenGrams(ratePerGram: number | null | undefined) {
  return Number(ratePerGram ?? 0) * 10;
}

/** Compact NPR for tight card layouts: रू 1.24L / रू 2.4Cr */
export function nprShort(n: number | null | undefined) {
  const v = Number(n ?? 0);
  const a = Math.abs(v);
  if (a >= 1e7) return `रू ${(v / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `रू ${(v / 1e5).toFixed(2)}L`;
  return npr(v);
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
  return round3(Math.max(0, (gross || 0) - (stone || 0)));
}

export function purityFactor(purity: string): number {
  if (!purity) return 1;
  const trimmed = purity.trim().toUpperCase();
  // Exact factors for the standard categories.
  const STANDARD: Record<string, number> = {
    "24K": 1, "22K": 0.916, "18K": 0.75, "14K": 0.585, "999": 0.999, "925": 0.925,
  };
  if (STANDARD[trimmed] !== undefined) return STANDARD[trimmed];
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
  return round3(netWeight * purityFactor(purity));
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
  return { metalValue: round2(metalValue), making: round2(making), wastageAmount: round2(wastageAmount), lineTotal: round2(lineTotal) };
}

export function nextNumber(prefix: string, seq: number, pad = 5) {
  const yy = new Date().getFullYear().toString().slice(-2);
  return `${prefix}-${yy}-${String(seq).padStart(pad, "0")}`;
}
