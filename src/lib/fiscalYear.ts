import { adToBSParts, bsToAD } from "./nepaliDate";

export interface FiscalPeriod { bs_year: number; label: string; starts_on: string; ends_on: string }

export function fiscalPeriod(bsYear: number): FiscalPeriod {
  const starts_on = bsToAD(bsYear, 3, 1);
  const next = bsToAD(bsYear + 1, 3, 1);
  if (!starts_on || !next) throw new Error("Fiscal year is outside the supported Nepali calendar.");
  const end = new Date(`${next}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return { bs_year: bsYear, label: `${bsYear}/${String(bsYear + 1).slice(-2)}`, starts_on, ends_on: end.toISOString().slice(0, 10) };
}

export function fiscalPeriodForDate(ad: string): FiscalPeriod {
  const bs = adToBSParts(ad);
  if (!bs) throw new Error("Invalid fiscal-year date.");
  return fiscalPeriod(bs.m >= 3 ? bs.y : bs.y - 1);
}

export function nepalToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function fiscalBillNumber(bsYear: number, sequence: number, pad = 5): string {
  return `INV-${bsYear}-${String(bsYear + 1).slice(-2)}-${String(sequence).padStart(pad, "0")}`;
}