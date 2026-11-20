import { describe, it, expect } from "vitest";
import { invoiceTotals, inventoryTotals, orderTotals } from "@/lib/listTotals";

describe("list totals", () => {
  it("cancelled invoices count but add no value or weight", () => {
    const t = invoiceTotals([
      { status: "paid", total: 1000, balance_due: 0, invoice_items: [{ weight: 10, quantity: 1 }] },
      { status: "issued", total: 500.5, balance_due: 200, invoice_items: [{ weight: 2.5, quantity: 2 }] },
      { status: "cancelled", total: 9999, balance_due: 9999, invoice_items: [{ weight: 50 }] },
    ]);
    expect(t).toEqual({ count: 3, value: 1500.5, balance: 200, weight: 15 });
  });
  it("stock value uses fine weight × metal rate plus stones", () => {
    const t = inventoryTotals([
      { metal: "gold", net_weight: 10, fine_weight: 9.167, stone_value: 1000 },
      { metal: "silver", net_weight: 20, fine_weight: 18.5, stone_value: 0 },
    ], { gold: 22000, silver: 280 });
    expect(t).toEqual({ count: 2, value: 207854, weight: 30, fine: 27.667 });
  });
  it("orders fall back to item estimates when no order total", () => {
    const t = orderTotals([
      { advance_paid: 5000, estimated_total: 0, order_items: [{ estimated_amount: 3000, expected_net_weight: 4, quantity: 2 }] },
      { advance_paid: 0, estimated_total: 10000, order_items: [] },
    ]);
    expect(t).toEqual({ count: 2, value: 13000, advance: 5000, weight: 8 });
  });
});
