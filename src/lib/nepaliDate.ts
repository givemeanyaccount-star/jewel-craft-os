// Nepali (Bikram Sambat) date helpers
import NepaliDate from "nepali-date-converter";

/** Returns BS date as YYYY/M/D, e.g. 2083/4/15 */
export function toBS(input: string | Date | null | undefined): string {
  if (!input) return "";
  try {
    const d = typeof input === "string" ? new Date(input) : input;
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
