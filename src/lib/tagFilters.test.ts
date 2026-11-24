import { describe, it, expect } from "vitest";
import { filterTagItems, type TagListItem } from "./tagFilters";
import { expandCopies, totalCopies } from "./tagTemplate";

const base = { metal: "gold", purity: "22K", net_weight: 1, gross_weight: 1, status: "in_stock", qr_code: null, barcode: null, legacy_code: null, created_at: "2026-11-20T00:00:00Z" };
const items: TagListItem[] = [
  { ...base, id: "1", sku: "RG-0012", name: "Ring", category_id: "rings" },
  { ...base, id: "2", sku: "RG-001", name: "Ring", category_id: "rings", legacy_code: "OLD-7" },
  { ...base, id: "3", sku: "NK-001", name: "Necklace", category_id: "necklace", status: "sold" },
];
const f = { q: "", category: "all", metal: "all", status: "in_stock", added: "any" as const, unprinted: false };

describe("tag item filters", () => {
  it("hides sold items by default", () => expect(filterTagItems(items, f, new Set()).map((i) => i.id)).toEqual(["1", "2"]));
  it("filters by category", () => expect(filterTagItems(items, { ...f, category: "necklace", status: "any_status" }, new Set()).map((i) => i.id)).toEqual(["3"]));
  it("puts the exact code first", () => expect(filterTagItems(items, { ...f, q: "rg-001" }, new Set())[0].id).toBe("2"));
  it("finds by old record number", () => expect(filterTagItems(items, { ...f, q: "old-7" }, new Set()).map((i) => i.id)).toEqual(["2"]));
  it("not-yet-printed hides printed items", () => expect(filterTagItems(items, { ...f, unprinted: true }, new Set(["1"])).map((i) => i.id)).toEqual(["2"]));
});

describe("tag copies", () => {
  it("repeats items by copies", () => expect(expandCopies([{ sku: "A" }, { sku: "B" }], { A: 3 }).map((i) => i.sku)).toEqual(["A", "A", "A", "B"]));
  it("caps copies at 50", () => expect(totalCopies([{ sku: "A" }], { A: 99 })).toBe(50));
});
