import { describe, expect, it } from "vitest";
import { filterStock, loadAllStock, stockBalances, stockTotals, stockWeight, type StockItem } from "@/lib/stockReport";

const item = (overrides: Partial<StockItem> = {}): StockItem => ({
  id: "1", sku: "R-1", legacy_code: null, name: "Ring", metal: "gold", purity: "22K",
  status: "in_stock", category_id: "rings", location_id: null,
  gross_weight: 12, stone_weight: 2, net_weight: 10, fine_weight: 9.167, ...overrides,
});

describe("live stock balances", () => {
  it("includes available and reserved stock but excludes sold and disposed items", () => {
    const items = ["in_stock", "reserved", "sold", "returned", "melted", "transferred"].map(status => item({ status }));
    expect(filterStock(items, { category: "all", location: "all", metal: "all", purity: "all", status: "live", search: "" }).map(i => i.status)).toEqual(["in_stock", "reserved"]);
  });
  it("totals stored gross, stone, net and fine weights without recalculating purity", () => {
    expect(stockTotals([item(), item({ status: "reserved", gross_weight: 5, stone_weight: 0.5, net_weight: 4.5, fine_weight: 3.375 })])).toEqual({ pieces: 2, available: 1, reserved: 1, gross: 17, stone: 2.5, net: 14.5, fine: 12.542 });
  });
  it("keeps category, metal and purity balances distinct", () => {
    const rows = [item(), item({ purity: "18K", fine_weight: 7.5 }), item({ metal: "silver", purity: "925", fine_weight: 9.25 }), item({ category_id: null })];
    expect(stockBalances(rows, true)).toHaveLength(4);
    const category = stockBalances(rows, false);
    expect(category).toHaveLength(3);
    expect(category.find(r => r.categoryId === "rings" && r.metal === "gold")?.fine).toBeCloseTo(16.667, 3);
  });
  it("applies purity and location filters to the same stock used for totals", () => {
    const rows = filterStock([item(), item({ location_id: "safe", purity: "18K" })], { category: "rings", location: "safe", metal: "gold", purity: "18K", status: "live", search: "ring" });
    expect(rows).toHaveLength(1);
    expect(rows[0].location_id).toBe("safe");
  });
  it("displays three decimals and converts grams to tola only after summing", () => {
    expect(stockWeight(11.6638, "tola")).toBe("1.000");
    expect(stockWeight(12.542, "g")).toBe("12.542");
  });
  it("loads inventory beyond the first page", async () => {
    const all = Array.from({ length: 1201 }, (_, id) => id);
    expect(await loadAllStock(async (from, to) => ({ data: all.slice(from, to + 1), error: null }))).toEqual(all);
  });
  it("does not report partial totals when a later page fails", async () => {
    await expect(loadAllStock(async from => from === 0 ? { data: Array(500).fill(1), error: null } : { data: null, error: { message: "Unavailable" } })).rejects.toThrow("Unavailable");
  });
});