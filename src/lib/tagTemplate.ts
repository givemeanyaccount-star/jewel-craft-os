import { escapeHtml } from "@/lib/html";
import { gramsToTola } from "@/lib/format";

/** Fields that can be placed on either flap of a DYMO 30373 barbell tag. */
export type TagField = "sku" | "name" | "metal" | "net" | "gross" | "stone" | "wastage" | "making" | "legacy" | "shop" | "custom";
export type TagFieldStyle = { prefix?: string; sizePt?: number; bold?: boolean };
export type TagUnit = "g" | "tola" | "both";
export type TagTemplate = {
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
};

export const TAG_FIELD_LABELS: Record<TagField, string> = {
  sku: "Item code", name: "Item name", metal: "Metal & purity", net: "Net weight", gross: "Gross weight",
  stone: "Stone weight", wastage: "Wastage", making: "Making charge", legacy: "Old record no.", shop: "Shop name", custom: "Custom text",
};

/** DYMO 30373: 54 × 11 mm, two ~19 mm printable flaps around a 16 mm loop. */
export const TAG_MM = { width: 54, height: 11, flap: 19 };

export const DEFAULT_TAG: TagTemplate = {
  left: ["metal", "legacy"], right: ["sku", "net", "gross", "stone"],
  showQr: true, qrSide: "left", unit: "g", fontPt: 5.5, shopName: "", customText: "", styles: {}, offsetXmm: 0, offsetYmm: 0,
};

const KEY = "jm.tagTemplate.v1";
export function loadTagTemplate(): TagTemplate {
  try { const raw = localStorage.getItem(KEY); return raw ? { ...DEFAULT_TAG, styles: {}, ...JSON.parse(raw) } : DEFAULT_TAG; } catch { return DEFAULT_TAG; }
}
export function saveTagTemplate(t: TagTemplate) { localStorage.setItem(KEY, JSON.stringify(t)); }

export type TagItem = {
  sku: string; name?: string | null; metal?: string | null; purity?: string | null; legacy_code?: string | null;
  net_weight?: number | null; gross_weight?: number | null; stone_weight?: number | null;
  wastage_value?: number | null; wastage_type?: string | null; making_charge?: number | null; making_charge_type?: string | null;
};

export function formatWeight(g: number, unit: TagUnit) {
  const t = gramsToTola(g).toFixed(3);
  if (unit === "tola") return `${t}T`;
  if (unit === "both") return `${g.toFixed(3)}g/${t}T`;
  return `${g.toFixed(3)}g`;
}

export const DEFAULT_PREFIX: Partial<Record<TagField, string>> = { net: "N", gross: "G", stone: "S", wastage: "W", making: "M" };

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
  return { sizePt: s.sizePt ?? t.fontPt, bold: s.bold ?? true };
}

function flapHtml(fields: TagField[], it: TagItem, t: TagTemplate, qr?: string) {
  const lines = fields.map((f) => { const txt = fieldText(f, it, t); if (!txt) return ""; const st = fieldStyle(f, t); return `<div class="l" style="font-size:${st.sizePt}pt;font-weight:${st.bold ? 700 : 400}">${escapeHtml(txt)}</div>`; }).join("");
  return `<div class="flap">${qr ? `<img class="qr" src="${qr}"/>` : ""}<div class="txt">${lines}</div></div>`;
}

/** One page per tag, sized exactly to the 30373 label. */
export function renderTags(items: { item: TagItem; qr?: string }[], t: TagTemplate) {
  const html = items.map(({ item, qr }, i) => `<div class="tag${i ? " pd-break-before" : ""}">
    ${flapHtml(t.left, item, t, t.showQr && t.qrSide === "left" ? qr : undefined)}
    <div class="loop"></div>
    ${flapHtml(t.right, item, t, t.showQr && t.qrSide === "right" ? qr : undefined)}
  </div>`).join("");
  const loop = TAG_MM.width - TAG_MM.flap * 2;
  const css = `
    @page { size: ${TAG_MM.width}mm ${TAG_MM.height}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; }
    .tag { width: ${TAG_MM.width}mm; height: ${TAG_MM.height}mm; display: flex; overflow: hidden; box-sizing: border-box;
      transform: translate(${t.offsetXmm}mm, ${t.offsetYmm}mm); }
    .flap { width: ${TAG_MM.flap}mm; height: ${TAG_MM.height}mm; display: flex; align-items: center; gap: 0.6mm; padding: 0.5mm 0.8mm; box-sizing: border-box; overflow: hidden; }
    .loop { width: ${loop}mm; }
    .qr { width: 9mm; height: 9mm; flex: none; image-rendering: pixelated; }
    .txt { min-width: 0; line-height: 1.12; font-size: ${t.fontPt}pt; font-weight: 700; }
    .l { white-space: nowrap; overflow: hidden; text-overflow: clip; }
  `;
  return { html, css };
}
