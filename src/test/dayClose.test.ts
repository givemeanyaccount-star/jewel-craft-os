import { describe, expect, it } from "vitest";
import {
  advanceMovement, nepalDate, reconciliationDifference, settlementTotals,
  type AdvanceEvent, type DayClosePayment, type OldMetalPayout,
} from "@/lib/dayClose";
import { CUSTOMER_ADVANCE_REF } from "@/lib/format";

const payment = (value: Partial<DayClosePayment>): DayClosePayment => ({
  id: value.id ?? Math.random().toString(), amount: 0, method: "cash", paid_at: "2026-11-20T06:00:00Z", ...value,
});

describe("day-close settlement totals", () => {
  it("uses the Nepal calendar day at the UTC boundary", () => {
    expect(nepalDate("2026-11-19T18:30:00Z")).toBe("2026-11-20");
    expect(nepalDate("2026-11-19T18:14:59Z")).toBe("2026-11-19");
  });

  it("nets receipts, refunds and standalone old-metal payouts by channel", () => {
    const payments = [
      payment({ id: "sale", amount: 10000, method: "cash" }),
      payment({ id: "refund", amount: -500, method: "cash" }),
      payment({ id: "wallet", amount: 2000, method: "esewa" }),
      payment({ id: "credit", amount: 8000, method: "credit" }),
      payment({ id: "trade", amount: 3000, method: "old_gold", reference: "OG-1" }),
    ];
    const purchases: OldMetalPayout[] = [
      { id: "o1", receipt_number: "OG-1", total_amount: 3000, payment_method: "cash", purchased_at: "2026-11-20T07:00:00Z" },
      { id: "o2", receipt_number: "OG-2", total_amount: 1000, payment_method: "cash", purchased_at: "2026-11-20T07:00:00Z" },
    ];
    const result = settlementTotals(payments, purchases, "2026-11-20");
    expect(result.channels.find((row) => row.method === "cash")).toEqual({ method: "cash", received: 10000, paidOut: 1500, expected: 8500 });
    expect(result.channels.find((row) => row.method === "esewa")?.expected).toBe(2000);
    expect(result.expected).toBe(10500);
    expect(result.oldMetalCredit).toBe(3000);
    expect(result.creditSales).toBe(8000);
  });

  it("does not count an applied advance as new money on its bill date", () => {
    const result = settlementTotals([
      payment({ id: "old", amount: 5000, paid_at: "2026-11-19T06:00:00Z", order_id: "order" }),
      payment({ id: "today", amount: 2500, paid_at: "2026-11-20T06:00:00Z" }),
    ], [], "2026-11-20");
    expect(result.expected).toBe(2500);
  });
});

describe("held advance movement", () => {
  it("keeps the unused part of a partially applied order advance", () => {
    const rows = [
      payment({ id: "remaining", amount: 600, order_id: "o1", paid_at: "2026-11-19T06:00:00Z" }),
      payment({ id: "used", amount: 400, order_id: "o1", invoice_id: "i1", paid_at: "2026-11-19T06:00:00Z", invoices: { issued_at: "2026-11-20T08:00:00Z" } }),
    ];
    const result = advanceMovement(rows, [], "2026-11-20");
    expect(result).toMatchObject({ opening: 1000, received: 0, applied: 400, closing: 600, orderHeld: 600 });
  });

  it("uses customer audit events for application, adjustment and reversal", () => {
    const events: AdvanceEvent[] = [
      { id: "e1", customer_id: "c1", event: "created", amount: 1000, paid_at: "2026-11-19T06:00:00Z", created_at: "2026-11-20T01:00:00Z" },
      { id: "e2", customer_id: "c1", event: "applied", amount: -200, created_at: "2026-11-20T08:00:00Z" },
      { id: "e3", customer_id: "c1", event: "adjusted", amount: 50, created_at: "2026-11-20T09:00:00Z" },
      { id: "e4", customer_id: "c1", event: "reversed", amount: -50, created_at: "2026-11-20T10:00:00Z" },
    ];
    const result = advanceMovement([], events, "2026-11-20");
    expect(result).toMatchObject({ opening: 1000, received: 0, applied: 200, adjustments: 50, reversed: 50, closing: 800, customerHeld: 800 });
  });

  it("supports legacy customer advances without duplicating audited customers", () => {
    const legacy = payment({ id: "legacy", customer_id: "old", amount: 700, reference: CUSTOMER_ADVANCE_REF, paid_at: "2026-11-20T06:00:00Z" });
    const audited = payment({ id: "audited", customer_id: "new", amount: 900, reference: CUSTOMER_ADVANCE_REF, paid_at: "2026-11-20T06:00:00Z" });
    const events: AdvanceEvent[] = [{ id: "e1", customer_id: "new", event: "created", amount: 900, paid_at: "2026-11-20T06:00:00Z", created_at: "2026-11-20T06:00:00Z" }];
    const result = advanceMovement([legacy, audited], events, "2026-11-20");
    expect(result.received).toBe(1600);
    expect(result.closing).toBe(1600);
  });
});

describe("bank reconciliation", () => {
  it("returns a signed difference only after an actual figure is entered", () => {
    expect(reconciliationDifference(1000, "")).toBeNull();
    expect(reconciliationDifference(1000, "1200.50")).toBe(200.5);
    expect(reconciliationDifference(1000, "900")).toBe(-100);
  });
});
