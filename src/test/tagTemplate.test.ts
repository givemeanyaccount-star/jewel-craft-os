import { describe, it, expect } from "vitest";
import { DEFAULT_TAG, fieldText, renderTags, saveTagDefault, loadTagDefault } from "@/lib/tagTemplate";
const item = { sku: "RNG-0012", metal: "gold", purity: "22K", net_weight: 4.25, gross_weight: 4.5, stone_weight: 0 };
describe("DYMO 30373 tag", () => {
  it("defaults to the rat-tail tag", () => expect(DEFAULT_TAG.stock).toBe("rattail"));
  it("rat-tail page is 24 × 22 mm", () => expect(renderTags([{ item }], DEFAULT_TAG).css).toContain("size: 24mm 22mm"));
  it("barbell page is 54 × 11 mm", () => expect(renderTags([{ item }], { ...DEFAULT_TAG, stock: "barbell" }).css).toContain("size: 54mm 11mm"));
  it("hides zero stone weight", () => expect(fieldText("stone", item, DEFAULT_TAG)).toBeNull());
  it("prints weights with 3 decimals", () => expect(fieldText("net", item, DEFAULT_TAG)).toBe("N 4.250g"));
  it("one page per tag", () => expect(renderTags([{ item }, { item }], DEFAULT_TAG).html.match(/pd-break-before/g)?.length).toBe(1));
});
describe("tag field customisation", () => {
  it("custom label replaces default prefix", () => expect(fieldText("net", item, { ...DEFAULT_TAG, styles: { net: { prefix: "Net" } } })).toBe("Net 4.250g"));
  it("empty label shows value only", () => expect(fieldText("net", item, { ...DEFAULT_TAG, styles: { net: { prefix: "" } } })).toBe("4.250g"));
  it("per-field size is printed", () => expect(renderTags([{ item }], { ...DEFAULT_TAG, styles: { sku: { sizePt: 7 } } }).html).toContain("font-size:7pt"));
});
describe("tag fields and defaults", () => {
  const it2 = { ...item, stone_value: 4500 };
  it("stone price prints with St Rs", () => expect(fieldText("stoneValue", it2, DEFAULT_TAG)).toBe("St Rs 4,500.00"));
  it("zero stone price is hidden", () => expect(fieldText("stoneValue", { ...item, stone_value: 0 }, DEFAULT_TAG)).toBeNull());
  it("default top = code, purity with QR", () => { expect(DEFAULT_TAG.left).toEqual(["sku", "purity"]); expect(DEFAULT_TAG.showQr && DEFAULT_TAG.qrSide).toBe("left"); });
  it("default bottom = gross, net, stone price", () => expect(DEFAULT_TAG.right).toEqual(["gross", "net", "stoneValue"]));
  it("scale changes printed size", () => expect(renderTags([{ item }], { ...DEFAULT_TAG, scale: 2, styles: { sku: { sizePt: 5 } } }).html).toContain("font-size:10pt"));
  it("logo printed only when on", () => {
    const t = { ...DEFAULT_TAG, logo: "data:image/png;base64,AA" };
    expect(renderTags([{ item }], t).html).not.toContain('class="logo"');
    expect(renderTags([{ item }], { ...t, showLogo: true }).html).toContain('class="logo"');
  });
  it("defaults are saved per tag type", () => {
    saveTagDefault({ ...DEFAULT_TAG, stock: "barbell", left: ["name"] });
    expect(loadTagDefault("barbell").left).toEqual(["name"]);
    expect(loadTagDefault("rattail").left).toEqual(["sku", "purity"]);
  });
});
