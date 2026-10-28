// Pure helpers for bringing records over from the previous software.
// Kept free of database calls so they can be unit-tested.
import { bsToAD } from "@/lib/nepaliDate";
import { computeNetWeight, computeFineWeight, round2 } from "@/lib/format";

export const METALS = ["gold", "silver", "diamond", "other"] as const;
export const PAY_METHODS = ["cash", "bank_transfer", "esewa", "khalti", "fonepay", "credit", "other"];

const n = (v: unknown) => {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(x) ? x : NaN;
};
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/**
 * Reads a date cell: "2024-03-15" (AD), "BS 2080-12-02" / "2080-12-02 BS" (Nepali),
 * a bare year ≥ 2060 is taken as BS, or an Excel serial number. Returns AD YYYY-MM-DD or null.
 */
export function parseDateCell(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const raw = String(v).trim();
  const isBS = /bs/i.test(raw);
  const m = raw.replace(/bs/ig, "").trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 32) return null;
  if (isBS || y >= 2060) {
    try { return bsToAD(y, mo, d); } catch { return null; }
  }
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Lower-cases and strips spaces/punctuation so "Gross Weight (g)" matches "gross_weight". */
const key = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export function normaliseRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[key(k)] = v;
  return out;
}

export const STOCK_COLUMNS = ["name", "category", "metal", "purity", "gross_weight", "stone_weight",
  "making_charge", "making_type", "wastage_value", "wastage_type", "stone_value", "location",
  "received_date", "supplier", "old_code"];

export const BILL_COLUMNS = ["old_bill_number", "bill_date", "customer_name", "customer_phone",
  "description", "metal", "purity", "weight", "rate", "making_charge", "wastage_amount", "stone_value",
  "quantity", "line_total", "discount", "tax", "total", "amount_paid", "payment_method"];

export interface StockRow {
  row: number; errors: string[];
  name: string; category: string; metal: string; purity: string;
  gross_weight: number; stone_weight: number; net_weight: number; fine_weight: number;
  making_charge: number; making_charge_type: string; wastage_value: number; wastage_type: string;
  stone_value: number; location: string; received_at: string | null; received_from: string; legacy_code: string;
}

export function parseStockRows(rows: Record<string, unknown>[], validPurities: string[]): StockRow[] {
  const seen = new Set<string>();
  return rows.map((r0, i) => {
    const r = normaliseRow(r0);
    const errors: string[] = [];
    const metal = (s(r.metal) || "gold").toLowerCase();
    const purity = s(r.purity).toUpperCase().replace(/^(\d{2})$/, "$1K");
    const gross = n(r.gross_weight), stone = n(r.stone_weight);
    if (!s(r.name)) errors.push("name missing");
    if (!METALS.includes(metal as any)) errors.push(`unknown metal "${metal}"`);
    if (!purity) errors.push("purity missing");
    else if ((metal === "gold" || metal === "silver") && !validPurities.includes(purity)) errors.push(`purity "${purity}" not allowed`);
    if (!(gross > 0)) errors.push("gross weight must be above 0");
    if (isNaN(stone) || stone < 0 || stone > gross) errors.push("stone weight invalid");
    for (const f of ["making_charge", "wastage_value", "stone_value"]) if (isNaN(n(r[f]))) errors.push(`${f.replace("_", " ")} not a number`);
    const recv = s(r.received_date) ? parseDateCell(r.received_date) : null;
    if (s(r.received_date) && !recv) errors.push("received date not understood");
    const code = s(r.old_code);
    if (code) { if (seen.has(code)) errors.push("duplicate old code"); seen.add(code); }
    const net = computeNetWeight(gross || 0, stone || 0);
    const mt = s(r.making_type).toLowerCase();
    const wt = s(r.wastage_type).toLowerCase();
    return {
      row: i + 2, errors,
      name: s(r.name), category: s(r.category), metal, purity,
      gross_weight: gross || 0, stone_weight: stone || 0, net_weight: net, fine_weight: computeFineWeight(net, purity),
      making_charge: n(r.making_charge) || 0,
      making_charge_type: mt.startsWith("fix") ? "fixed" : mt.startsWith("per") || !mt ? "per_gram" : mt,
      wastage_value: n(r.wastage_value) || 0,
      wastage_type: wt.startsWith("w") || wt === "g" ? "weight" : wt.startsWith("f") ? "fixed" : "percentage",
      stone_value: n(r.stone_value) || 0, location: s(r.location),
      received_at: recv, received_from: s(r.supplier), legacy_code: code,
    };
  });
}

export interface BillDraft {
  legacy_number: string; bill_date: string | null; customer_name: string; customer_phone: string;
  discount: number; tax: number; total: number | null; amount_paid: number | null; payment_method: string;
  items: { description: string; metal: string; purity: string; weight: number; rate: number;
    making_charge: number; wastage_amount: number; stone_value: number; quantity: number; line_total: number }[];
  errors: string[]; rows: number[];
}

/** Groups item lines by old bill number into one bill each, and checks the figures. */
export function groupBillRows(rows: Record<string, unknown>[], goLive: string | null): BillDraft[] {
  const bills = new Map<string, BillDraft>();
  rows.forEach((r0, i) => {
    const r = normaliseRow(r0);
    const num = s(r.old_bill_number);
    const k = num || `__row${i}`;
    let b = bills.get(k);
    if (!b) {
      const date = parseDateCell(r.bill_date);
      b = {
        legacy_number: num, bill_date: date, customer_name: s(r.customer_name), customer_phone: s(r.customer_phone),
        discount: n(r.discount) || 0, tax: n(r.tax) || 0,
        total: s(r.total) ? n(r.total) : null, amount_paid: s(r.amount_paid) ? n(r.amount_paid) : null,
        payment_method: (s(r.payment_method) || "cash").toLowerCase().replace(/\s+/g, "_"),
        items: [], errors: [], rows: [],
      };
      if (!num) b.errors.push("old bill number missing");
      if (!date) b.errors.push("bill date missing or not understood");
      else if (goLive && date >= goLive) b.errors.push(`dated ${date}, must be before go-live ${goLive}`);
      if (!PAY_METHODS.includes(b.payment_method)) b.errors.push(`payment method "${b.payment_method}" unknown`);
      bills.set(k, b);
    }
    b.rows.push(i + 2);
    const weight = n(r.weight), rate = n(r.rate), making = n(r.making_charge) || 0;
    const wastage = n(r.wastage_amount) || 0, stoneV = n(r.stone_value) || 0;
    const qty = Math.max(1, Math.round(n(r.quantity) || 1));
    if (isNaN(weight) || isNaN(rate)) b.errors.push(`row ${i + 2}: weight/rate not a number`);
    const lt = s(r.line_total) ? n(r.line_total) : round2((weight || 0) * (rate || 0) + making + wastage + stoneV);
    if (isNaN(lt)) b.errors.push(`row ${i + 2}: line total not a number`);
    b.items.push({
      description: s(r.description) || "Item", metal: (s(r.metal) || "gold").toLowerCase(), purity: s(r.purity).toUpperCase(),
      weight: weight || 0, rate: rate || 0, making_charge: making, wastage_amount: wastage, stone_value: stoneV,
      quantity: qty, line_total: round2(lt || 0),
    });
  });
  return Array.from(bills.values()).map((b) => {
    const sum = round2(b.items.reduce((a, x) => a + x.line_total, 0));
    const total = b.total ?? round2(sum - b.discount + b.tax);
    if (b.amount_paid !== null && b.amount_paid > total + 0.004) b.errors.push("amount paid is more than the total");
    return { ...b, total };
  });
}

export function billTotalOf(b: BillDraft): number {
  return b.total ?? round2(b.items.reduce((a, x) => a + x.line_total, 0) - b.discount + b.tax);
}
