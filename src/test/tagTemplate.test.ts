import { describe, it, expect } from "vitest";
import { DEFAULT_TAG, fieldText, renderTags } from "@/lib/tagTemplate";
const item = { sku: "RNG-0012", metal: "gold", purity: "22K", net_weight: 4.25, gross_weight: 4.5, stone_weight: 0 };
describe("DYMO 30373 tag", () => {
  it("sizes the page to 54 × 11 mm", () => expect(renderTags([{ item }], DEFAULT_TAG).css).toContain("size: 54mm 11mm"));
  it("hides zero stone weight", () => expect(fieldText("stone", item, DEFAULT_TAG)).toBeNull());
  it("prints weights with 3 decimals", () => expect(fieldText("net", item, DEFAULT_TAG)).toBe("N 4.250g"));
  it("one page per tag", () => expect(renderTags([{ item }, { item }], DEFAULT_TAG).html.match(/pd-break-before/g)?.length).toBe(1));
});
describe("tag field customisation", () => {
  it("custom label replaces default prefix", () => expect(fieldText("net", item, { ...DEFAULT_TAG, styles: { net: { prefix: "Net" } } })).toBe("Net 4.250g"));
  it("empty label shows value only", () => expect(fieldText("net", item, { ...DEFAULT_TAG, styles: { net: { prefix: "" } } })).toBe("4.250g"));
  it("per-field size is printed", () => expect(renderTags([{ item }], { ...DEFAULT_TAG, styles: { sku: { sizePt: 7 } } }).html).toContain("font-size:7pt"));
});
