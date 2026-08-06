// Amount in words, Indian/Nepali numbering (lakh, crore)
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ` ${ONES[o]}` : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** e.g. 600000 -> "Six Lakh only", 1234.50 -> "One Thousand Two Hundred Thirty Four and Fifty Paisa only" */
export function amountInWords(value: number | string | null | undefined): string {
  const num = Math.abs(Number(value ?? 0));
  if (!isFinite(num)) return "";
  const rupees = Math.floor(num);
  const paisa = Math.round((num - rupees) * 100);

  if (rupees === 0 && paisa === 0) return "Zero only";

  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;

  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  let out = parts.join(" ").trim();
  if (paisa) out += `${out ? " and " : ""}${twoDigits(paisa)} Paisa`;
  return `${out} only`;
}
