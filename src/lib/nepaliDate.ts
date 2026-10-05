// Nepali (Bikram Sambat) date helpers
import NepaliDate from "nepali-date-converter";

/** Returns BS date as YYYY/M/D, e.g. 2083/4/15 */
export function toBS(input: string | Date | null | undefined): string {
  if (!input) return "";
  try {
    const d = typeof input === "string"
      ? (/^\d{4}-\d{2}-\d{2}$/.test(input) ? new Date(Number(input.slice(0, 4)), Number(input.slice(5, 7)) - 1, Number(input.slice(8, 10))) : new Date(input))
      : input;
    if (isNaN(d.getTime())) return "";
    const n = new NepaliDate(d);
    return `${n.getYear()}/${n.getMonth() + 1}/${n.getDate()}`;
  } catch {
    return "";
  }
}

/** AD date as YYYY-MM-DD */
export function toADDate(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** AD date + 12h time, e.g. 2026-07-31 07:33 PM */
export function toADDateTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  let h = d.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${toADDate(d)} ${p(h)}:${p(d.getMinutes())} ${ap}`;
}

const NP_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
export function toNepaliDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => NP_DIGITS[Number(d)]);
}

export const BS_MONTHS = [
  "Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];

/** Parse an AD "YYYY-MM-DD" (or ISO) as a local date. */
function parseAD(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** AD YYYY-MM-DD -> BS parts (month 0-based). */
export function adToBSParts(ad: string): { y: number; m: number; d: number } | null {
  const date = parseAD(ad);
  if (!date) return null;
  try {
    const n = new NepaliDate(date);
    return { y: n.getYear(), m: n.getMonth(), d: n.getDate() };
  } catch { return null; }
}

/** BS parts (month 0-based) -> AD YYYY-MM-DD. */
export function bsToAD(y: number, m: number, d: number): string {
  try { return toADDate(new NepaliDate(y, m, d).toJsDate()); } catch { return ""; }
}

/** Number of days in a BS month. */
export function bsMonthDays(y: number, m: number): number {
  try {
    const start = new NepaliDate(y, m, 1).toJsDate().getTime();
    const next = (m === 11 ? new NepaliDate(y + 1, 0, 1) : new NepaliDate(y, m + 1, 1)).toJsDate().getTime();
    return Math.round((next - start) / 86400000);
  } catch { return 30; }
}

/** BS date for display, e.g. 2083 Ashwin 19. Accepts date-only strings without timezone drift. */
export function toBSLong(input: string | Date | null | undefined): string {
  if (!input) return "";
  const ad = typeof input === "string" ? (/^\d{4}-\d{2}-\d{2}$/.test(input) ? input : toADDate(input)) : toADDate(input);
  const p = adToBSParts(ad);
  return p ? `${p.y} ${BS_MONTHS[p.m]} ${p.d}` : "";
}
