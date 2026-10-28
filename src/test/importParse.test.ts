import { describe, it, expect } from "vitest";
import { parseDateCell, parseStockRows, groupBillRows } from "@/lib/importParse";

describe("old-software import", () => {
  it("reads AD, BS and Excel dates", () => {
    expect(parseDateCell("2024-03-15")).toBe("2024-03-15");
    expect(parseDateCell("BS 2083-07-11")).toBe("2026-10-28");
    expect(parseDateCell(45366)).toBe("2024-03-15");
    expect(parseDateCell("2024-02-30")).toBeNull();
  });

  it("rejects a past bill dated on or after the go-live date", () => {
    const rows = [{ "Old bill number": "A1", "Bill date": "2026-11-01", Description: "Ring", Weight: 10, Rate: 100 }];
    expect(groupBillRows(rows, "2026-11-01")[0].errors.join()).toMatch(/before go-live/);
    expect(groupBillRows(rows, "2026-11-02")[0].errors).toEqual([]);
  });

  it("groups item lines by old bill number and totals them", () => {
    const bills = groupBillRows([
      { old_bill_number: "B7", bill_date: "2025-01-01", description: "Chain", line_total: 1000 },
      { old_bill_number: "B7", bill_date: "2025-01-01", description: "Ring", line_total: 500 },
    ], null);
    expect(bills).toHaveLength(1);
    expect(bills[0].total).toBe(1500);
  });

  it("flags stock rows with bad weights or purity", () => {
    const [ok, bad] = parseStockRows([
      { name: "Bangle", metal: "gold", purity: "22", gross_weight: 20, stone_weight: 1 },
      { name: "X", metal: "gold", purity: "21K", gross_weight: 0 },
    ], ["24K", "22K", "18K", "14K", "999", "925"]);
    expect(ok.errors).toEqual([]);
    expect(ok.purity).toBe("22K");
    expect(ok.net_weight).toBe(19);
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});
