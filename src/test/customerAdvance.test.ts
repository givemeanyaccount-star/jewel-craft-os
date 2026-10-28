import { describe, it, expect } from "vitest";
import { reconcile, CUSTOMER_ADVANCE_REF } from "@/lib/format";

describe("customer advance balance on a bill", () => {
  it("counts saved advances paid on two dates as advance, not sale payments", () => {
    const rec = reconcile({
      total: 100000, oldGoldCredit: 0, vat: 0, sdTax: 0, roundOff: 0, balanceDue: 0, keptOnOrder: 0,
      payments: [
        { amount: 20000, method: "cash", reference: CUSTOMER_ADVANCE_REF, paid_at: "2026-09-01T06:15:00Z" },
        { amount: 30000, method: "esewa", reference: CUSTOMER_ADVANCE_REF, paid_at: "2026-10-01T06:15:00Z" },
        { amount: 50000, method: "cash" },
      ] as any,
    });
    expect(rec.advanceApplied).toBe(50000);
    expect(rec.netPayable).toBe(50000);
    expect(rec.modeRows).toEqual([["cash", 50000]]);
  });
});
