import { escapeHtml } from "@/lib/html";
import { gramsToTola, npr } from "@/lib/format";

/** Fields that can be placed on either flap of a DYMO 30373 barbell tag. */
export type TagField = "sku" | "name" | "metal" | "net" | "gross" | "stone" | "wastage" | "making" | "legacy" | "shop" | "custom" | "stoneValue" | "purity" | "category";
export type TagFieldStyle = { prefix?: string; sizePt?: number; bold?: boolean };
export type TagUnit = "g" | "tola" | "both";
/** Label stock. rattail = DYMO/HL-30373 rat-tail price tag (default); barbell = 54×11 mm two-flap tag. */
export type TagStock = "rattail" | "barbell";
export type TagTemplate = {
  stock: TagStock;
  left: TagField[];
  right: TagField[];
  showQr: boolean;
  qrSide: "left" | "right";
  unit: TagUnit;
  fontPt: number;
  shopName: string;
  customText: string;
  /** Per-field overrides: label prefix, text size, boldness. */
  styles: Partial<Record<TagField, TagFieldStyle>>;
  /** Nudge in mm for printers that feed slightly off. */
  offsetXmm: number;
  offsetYmm: number;
  /** QR and logo edge length in mm. */
  qrMm: number;
  logoMm: number;
  /** Multiplies every text size (1 = 100%). */
  scale: number;
  showLogo: boolean;
  logoSide: "left" | "right";
  /** Small data URL, stored on this device. */
  logo: string;
};

export const TAG_FIELD_LABELS: Record<TagField, string> = {
  sku: "Item code", name: "Item name", metal: "Metal & purity", net: "Net weight", gross: "Gross weight",
  stone: "Stone weight", wastage: "Wastage", making: "Making charge", legacy: "Old record no.", shop: "Shop name", custom: "Custom text",
  stoneValue: "Stone price", purity: "Purity", category: "Category",
};

export const TAG_STOCKS: Record<TagStock, { label: string; width: number; height: number; zoneW: number; zoneH: number; gap: number; vertical: boolean; zones: [string, string]; paper: string }> = {
  /** 15/16" × 7/8" head (≈24 × 22 mm); tail is unprinted. Split into top and bottom halves. */
  rattail: { label: "Rat-tail 30373 (24 × 22 mm)", width: 24, height: 22, zoneW: 24, zoneH: 11, gap: 0, vertical: true, zones: ["Top", "Bottom"], paper: "30373 Price Tag (rat tail)" },
  /** 54 × 11 mm, two ~19 mm printable flaps around a 16 mm loop. */
  barbell: { label: "Barbell (54 × 11 mm)", width: 54, height: 11, zoneW: 19, zoneH: 11, gap: 16, vertical: false, zones: ["Front", "Back"], paper: "Barbell jewellery (54 × 11 mm)" },
};
export const tagGeom = (t: Pick<TagTemplate, "stock">) => TAG_STOCKS[t.stock] ?? TAG_STOCKS.rattail;

export const DEFAULT_TAG: TagTemplate = {
  stock: "rattail",
  left: ["sku", "purity"], right: ["gross", "net", "stoneValue"],
  showQr: true, qrSide: "left", unit: "g", fontPt: 5.5, shopName: "", customText: "", styles: {}, offsetXmm: 0, offsetYmm: 0,
  qrMm: 9, logoMm: 6, scale: 1, showLogo: false, logoSide: "left", logo: "",
};
/** Built-in starting layout for each tag type. */
export const builtinTag = (stock: TagStock): TagTemplate => ({ ...DEFAULT_TAG, stock, styles: {} });

const STOCK_KEY = "jm.tagStock";
const workKey = (s: TagStock) => `jm.tagTemplate.v2.${s}`;
const defKey = (s: TagStock) => `jm.tagDefault.${s}`;
const read = (k: string): Partial<TagTemplate> | null => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
/** The user's saved default for this tag type, else the built-in layout. */
export function loadTagDefault(stock: TagStock): TagTemplate {
  return { ...builtinTag(stock), ...(read(defKey(stock)) ?? {}), stock };
}
export function saveTagDefault(t: TagTemplate) { localStorage.setItem(defKey(t.stock), JSON.stringify(t)); }
/** Working design for a tag type (falls back to its default). */
export function loadTagTemplate(stock?: TagStock): TagTemplate {
  const s: TagStock = stock ?? ((localStorage.getItem(STOCK_KEY) as TagStock) || "rattail");
  const work = read(workKey(s));
  return work ? { ...builtinTag(s), ...work, stock: s } : loadTagDefault(s);
}
export function saveTagTemplate(t: TagTemplate) {
  localStorage.setItem(workKey(t.stock), JSON.stringify(t)); localStorage.setItem(STOCK_KEY, t.stock);
}

export type TagItem = {
  sku: string; name?: string | null; metal?: string | null; purity?: string | null; legacy_code?: string | null;
  net_weight?: number | null; gross_weight?: number | null; stone_weight?: number | null;
  wastage_value?: number | null; wastage_type?: string | null; making_charge?: number | null; making_charge_type?: string | null;
  stone_value?: number | null; category?: string | null; categories?: { name?: string | null } | null;
};

export function formatWeight(g: number, unit: TagUnit) {
  const t = gramsToTola(g).toFixed(3);
  if (unit === "tola") return `${t}T`;
  if (unit === "both") return `${g.toFixed(3)}g/${t}T`;
  return `${g.toFixed(3)}g`;
}

export const DEFAULT_PREFIX: Partial<Record<TagField, string>> = { net: "N", gross: "G", stone: "S", stoneValue: "St Rs", wastage: "W", making: "M" };

function fieldValue(f: TagField, it: TagItem, t: TagTemplate): string | null {
  const w = (v: number | null | undefined) => formatWeight(Number(v ?? 0), t.unit);
  switch (f) {
    case "sku": return it.sku;
    case "name": return it.name || null;
    case "metal": return [it.metal === "silver" ? "AG" : it.metal === "gold" ? "AU" : it.metal, it.purity].filter(Boolean).join(" ") || null;
    case "net": return w(it.net_weight);
    case "gross": return w(it.gross_weight);
    case "stone": return Number(it.stone_weight ?? 0) > 0 ? w(it.stone_weight) : null;
    case "wastage": return Number(it.wastage_value ?? 0) > 0 ? `${it.wastage_value}${it.wastage_type === "percentage" ? "%" : it.wastage_type === "weight" ? "g" : ""}` : null;
    case "making": return Number(it.making_charge ?? 0) > 0 ? `${it.making_charge}${it.making_charge_type === "percentage" ? "%" : it.making_charge_type === "per_gram" ? "/g" : ""}` : null;
    case "legacy": return it.legacy_code || null;
    case "shop": return t.shopName || null;
    case "custom": return t.customText || null;
    case "stoneValue": return Number(it.stone_value ?? 0) > 0 ? npr(Number(it.stone_value), { withSymbol: false }) : null;
    case "purity": return it.purity || null;
    case "category": return it.category || it.categories?.name || null;
  }
}

export function fieldText(f: TagField, it: TagItem, t: TagTemplate): string | null {
  const v = fieldValue(f, it, t);
  if (v == null) return null;
  const prefix = (t.styles?.[f]?.prefix ?? DEFAULT_PREFIX[f] ?? "").trim();
  return prefix ? `${prefix} ${v}` : v;
}

export function fieldStyle(f: TagField, t: TagTemplate) {
  const s = t.styles?.[f] ?? {};
  return { sizePt: +((s.sizePt ?? t.fontPt) * (t.scale || 1)).toFixed(2), bold: s.bold ?? true };
}

function flapHtml(fields: TagField[], it: TagItem, t: TagTemplate, qr?: string, logo?: string) {
  const lines = fields.map((f) => { const txt = fieldText(f, it, t); if (!txt) return ""; const st = fieldStyle(f, t); return `<div class="l" style="font-size:${st.sizePt}pt;font-weight:${st.bold ? 700 : 400}">${escapeHtml(txt)}</div>`; }).join("");
  return `<div class="flap">${logo ? `<img class="logo" src="${logo}"/>` : ""}${qr ? `<img class="qr" src="${qr}"/>` : ""}<div class="txt">${lines}</div></div>`;
}

/** One page per tag, sized exactly to the 30373 label. */
export function renderTags(items: { item: TagItem; qr?: string }[], t: TagTemplate) {
  const html = items.map(({ item, qr }, i) => `<div class="tag${i ? " pd-break-before" : ""}">
    ${flapHtml(t.left, item, t, t.showQr && t.qrSide === "left" ? qr : undefined, t.showLogo && t.logo && t.logoSide === "left" ? t.logo : undefined)}
    <div class="loop"></div>
    ${flapHtml(t.right, item, t, t.showQr && t.qrSide === "right" ? qr : undefined, t.showLogo && t.logo && t.logoSide === "right" ? t.logo : undefined)}
  </div>`).join("");
  const g = tagGeom(t);
  const css = `
    @page { size: ${g.width}mm ${g.height}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; }
    .tag { width: ${g.width}mm; height: ${g.height}mm; display: flex; flex-direction: ${g.vertical ? "column" : "row"}; overflow: hidden; box-sizing: border-box;
      transform: translate(${t.offsetXmm}mm, ${t.offsetYmm}mm); }
    .flap { width: ${g.zoneW}mm; height: ${g.zoneH}mm; display: flex; align-items: center; gap: 0.6mm; padding: 0.5mm 0.8mm; box-sizing: border-box; overflow: hidden; }
    .loop { width: ${g.vertical ? 0 : g.gap}mm; flex: none; }
    .logo { width: ${t.logoMm || 6}mm; height: ${t.logoMm || 6}mm; flex: none; object-fit: contain; }
    .qr { width: ${t.qrMm || 9}mm; height: ${t.qrMm || 9}mm; flex: none; image-rendering: pixelated; }
    .txt { min-width: 0; line-height: 1.12; font-size: ${t.fontPt * (t.scale || 1)}pt; font-weight: 700; }
    .l { white-space: nowrap; overflow: hidden; text-overflow: clip; }
  `;
  return { html, css };
}

/** Repeat each item by its copy count (1–50, default 1), keeping order. */
export function expandCopies<T extends { sku: string }>(items: T[], copies?: Record<string, number>): T[] {
  return items.flatMap((it) => Array(clampCopies(copies?.[it.sku])).fill(it));
}
export function totalCopies(items: { sku: string }[], copies?: Record<string, number>) {
  return items.reduce((s, it) => s + clampCopies(copies?.[it.sku]), 0);
}
export function clampCopies(n: number | undefined) {
  const v = Math.floor(Number(n ?? 1));
  return Number.isFinite(v) ? Math.min(50, Math.max(1, v)) : 1;
}
