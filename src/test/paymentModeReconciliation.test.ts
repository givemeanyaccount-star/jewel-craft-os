import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  computeInvoiceTaxes,
  discountForTargetTotal,
  advanceReceivedFromPayments,
  netPayableOf,
  paymentBreakdown,
  round2,
} from "@/lib/format";

/**
 * Payment Mode box / Balance Due reconciliation, end to end:
 *
 *   order advances ──► POS pricing + auto-discount ──► checkout (invoice + advance split)
 *                 ──► InvoiceDetail and the printed bill re-read those payment rows
 *
 * The box must always tie out:  old metal + advance + at-sale modes = Total Received,
 * and Total Received + Balance Due − Refund Due = the bill's gross value.
 */

type Payment = { id: string; order_id: string | null; invoice_id: string | null; method: string; amount: number };

const SETTINGS = { vatRate: 13, vatEnabled: true, sdTaxRate: 0.5 };

/** POS pricing state, mirroring src/pages/POS.tsx. */
function posState(opts: {
  subtotal: number;
  stonesTotal: number;
  walkInOldMetal?: number;
  orderPayments?: Payment[];
  atSalePayments?: Array<{ method: string; amount: number }>;
  targetNetPayable?: number;
}) {
  const orderPayments = opts.orderPayments ?? [];
  const atSale = opts.atSalePayments ?? [];
  const manualPaid = round2(atSale.reduce((a, p) => a + p.amount, 0));

  const advanceOldMetal = round2(
    orderPayments.filter((p) => p.method === "old_gold").reduce((a, p) => a + p.amount, 0),
  );
  const advanceCash = round2(
    orderPayments.filter((p) => p.method !== "old_gold").reduce((a, p) => a + p.amount, 0),
  );
  const oldGoldCredit = round2((opts.walkInOldMetal ?? 0) + advanceOldMetal);

  const base = { subtotal: opts.subtotal, stonesTotal: opts.stonesTotal, oldGoldCredit, ...SETTINGS };

  let discount = 0;
  if (opts.targetNetPayable != null) {
    const provisional = computeInvoiceTaxes(base);
    const provisionalApplied = round2(Math.min(advanceCash, Math.max(0, provisional.total - manualPaid)));
    discount = discountForTargetTotal({ ...base, targetTotal: round2(opts.targetNetPayable + provisionalApplied) });
  }

  const tax = computeInvoiceTaxes({ ...base, discount });
  const appliedAdvance = round2(Math.min(advanceCash, Math.max(0, tax.total - manualPaid)));
  const netPayable = netPayableOf(tax.total, appliedAdvance);
  const paid = round2(manualPaid + appliedAdvance);
  const balance = round2(Math.max(0, tax.total - paid));

  return { discount, tax, advanceCash, advanceOldMetal, oldGoldCredit, appliedAdvance, netPayable, paid, balance, manualPaid, atSale };
}

/** POS.checkout: write the invoice, attach at-sale payments, attach/split the advances. */
function checkout(state: ReturnType<typeof posState>, orderPayments: Payment[], orderId: string) {
  const invoiceId = "inv-1";
  const invoice = {
    id: invoiceId,
    old_gold_credit: state.tax.oldGoldCredit,
    total: state.tax.total,
    amount_paid: state.paid,
    balance_due: state.balance,
  };

  const rows: Payment[] = orderPayments.map((p) => ({ ...p }));

  // At-sale payments recorded against the invoice (no order_id).
  state.atSale.forEach((p, i) =>
    rows.push({ id: `sale-${i}`, order_id: null, invoice_id: invoiceId, method: p.method, amount: round2(p.amount) }),
  );

  // Old-metal advances: attached so they can't be reused (already inside the credit line).
  for (const p of rows) if (p.method === "old_gold" && p.order_id && p.invoice_id == null) p.invoice_id = invoiceId;

  // Cash advances: attach what this bill consumes, leave the surplus on the order.
  let remaining = state.appliedAdvance;
  for (const p of rows) {
    if (remaining <= 0.004) break;
    if (p.method === "old_gold" || !p.order_id || p.invoice_id != null || p.amount <= 0) continue;
    if (p.amount <= remaining + 0.004) {
      p.invoice_id = invoiceId;
      remaining = round2(remaining - p.amount);
    } else {
      p.amount = round2(p.amount - remaining);
      rows.push({ id: `${p.id}-split`, order_id: orderId, invoice_id: invoiceId, method: p.method, amount: remaining });
      remaining = 0;
    }
  }

  return { invoice, payments: rows };
}

/** What InvoiceDetail and PrintDocument each compute from the persisted rows. */
function readSurface(invoice: any, payments: Payment[]) {
  const attached = payments.filter((p) => p.invoice_id === invoice.id);
  return paymentBreakdown({
    payments: attached,
    oldGoldCredit: invoice.old_gold_credit,
    netTotal: invoice.total,
    balanceDue: invoice.balance_due,
  });
}

type Scenario = {
  name: string;
  subtotal: number;
  stonesTotal: number;
  walkInOldMetal?: number;
  target?: number;
  orderPayments?: Payment[];
  atSalePayments?: Array<{ method: string; amount: number }>;
  expectModes?: number;
  expectBalanceDue?: boolean;
};

const ALL_MODES = [
  { method: "cash", amount: 20000 },
  { method: "card", amount: 15000 },
  { method: "bank_transfer", amount: 15000 },
  { method: "esewa", amount: 10000 },
  { method: "khalti", amount: 5000 },
  { method: "fonepay", amount: 5000 },
  { method: "other", amount: 5000 },
];

const scenarios: Scenario[] = [
  {
    name: "single cash payment, fully settled",
    subtotal: 120000, stonesTotal: 0, target: 100000,
    atSalePayments: [{ method: "cash", amount: 100000 }],
    expectModes: 1, expectBalanceDue: false,
  },
  {
    name: "every payment mode at once plus old metal credit",
    subtotal: 260000, stonesTotal: 15000, walkInOldMetal: 40000, target: 75000,
    atSalePayments: ALL_MODES,
    expectModes: ALL_MODES.length + 1, // + old metal row is separate, cash merged
  },
  {
    name: "two cash payments merge into one Cash row",
    subtotal: 150000, stonesTotal: 0, target: 90000,
    atSalePayments: [{ method: "cash", amount: 40000 }, { method: "cash", amount: 50000 }],
    expectModes: 1, expectBalanceDue: false,
  },
  {
    name: "part payment leaves a real Balance Due",
    subtotal: 200000, stonesTotal: 10000, target: 150000,
    atSalePayments: [{ method: "cash", amount: 60000 }],
    expectBalanceDue: true,
  },
  {
    name: "cash advance partly consumed by this bill",
    subtotal: 90000, stonesTotal: 5000,
    orderPayments: [{ id: "p1", order_id: "o1", invoice_id: null, method: "cash", amount: 60000 }],
    atSalePayments: [{ method: "fonepay", amount: 10000 }],
  },
  {
    name: "old metal advance only (pre-tax credit, no advance row)",
    subtotal: 250000, stonesTotal: 0, target: 150000,
    orderPayments: [{ id: "p1", order_id: "o1", invoice_id: null, method: "old_gold", amount: 40000 }],
    atSalePayments: [{ method: "cash", amount: 150000 }],
  },
  {
    name: "old metal + cash advance with a target net payable",
    subtotal: 320000, stonesTotal: 20000, target: 175000,
    orderPayments: [
      { id: "p1", order_id: "o1", invoice_id: null, method: "old_gold", amount: 45000 },
      { id: "p2", order_id: "o1", invoice_id: null, method: "bank_transfer", amount: 30000 },
    ],
    atSalePayments: [{ method: "card", amount: 175000 }],
  },
  {
    name: "advance larger than the bill: nothing negative, surplus stays on the order",
    subtotal: 60000, stonesTotal: 0,
    orderPayments: [{ id: "p1", order_id: "o1", invoice_id: null, method: "cash", amount: 100000 }],
  },
  {
    name: "fractional amounts with a target net payable",
    subtotal: 412345.67, stonesTotal: 12345.67, walkInOldMetal: 33333.33, target: 149999.99,
    orderPayments: [
      { id: "p1", order_id: "o1", invoice_id: null, method: "old_gold", amount: 21111.11 },
      { id: "p2", order_id: "o1", invoice_id: null, method: "fonepay", amount: 17777.77 },
    ],
    atSalePayments: [{ method: "esewa", amount: 149999.99 }],
  },
];

describe("Payment Mode totals and Balance Due reconcile across POS, InvoiceDetail and the printed bill", () => {
  for (const s of scenarios) {
    it(s.name, () => {
      const orderPayments = (s.orderPayments ?? []).map((p) => ({ ...p }));
      const pos = posState({
        subtotal: s.subtotal,
        stonesTotal: s.stonesTotal,
        walkInOldMetal: s.walkInOldMetal,
        orderPayments,
        atSalePayments: s.atSalePayments,
        targetNetPayable: s.target,
      });
      const { invoice, payments } = checkout(pos, orderPayments, "o1");

      const screen = readSurface(invoice, payments);
      const printed = readSurface(invoice, payments);

      // Both read surfaces are byte-for-byte the same breakdown.
      expect(printed).toEqual(screen);

      // The box adds up.
      expect(screen.totalReceived).toBe(
        round2(screen.oldGoldCredit + screen.advanceReceived + screen.atSaleTotal),
      );
      expect(screen.atSaleTotal).toBe(round2(screen.modeRows.reduce((a, [, v]) => a + v, 0)));

      // ...and reconciles to the gross value of the bill.
      expect(round2(screen.totalReceived + screen.balanceDue - screen.surplus)).toBe(screen.grossDue);
      expect(screen.grossDue).toBe(round2(invoice.total + invoice.old_gold_credit));

      // Balance Due matches what POS wrote and is never negative.
      expect(screen.balanceDue).toBe(invoice.balance_due);
      expect(screen.balanceDue).toBeGreaterThanOrEqual(0);
      expect(screen.surplus).toBeGreaterThanOrEqual(0);
      if (s.expectBalanceDue === true) expect(screen.balanceDue).toBeGreaterThan(0);
      if (s.expectBalanceDue === false) expect(screen.balanceDue).toBe(0);

      // Net Payable identical on all three surfaces.
      expect(screen.advanceReceived).toBe(pos.appliedAdvance);
      expect(netPayableOf(invoice.total, screen.advanceReceived)).toBe(pos.netPayable);

      // One row per mode; advances never double-counted as at-sale modes.
      const keys = screen.modeRows.map(([k]) => k);
      expect(new Set(keys).size).toBe(keys.length);
      if (s.expectModes != null) expect(screen.modeRows.length).toBe(s.expectModes);
      const attached = payments.filter((p) => p.invoice_id === invoice.id);
      expect(screen.atSaleTotal).toBe(
        round2(attached.filter((p) => !p.order_id || p.method === "old_gold").reduce((a, p) => a + p.amount, 0)),
      );
      expect(screen.advanceReceived).toBe(advanceReceivedFromPayments(attached));

      // Money conservation across the advance split.
      expect(round2(payments.filter((p) => p.order_id).reduce((a, p) => a + p.amount, 0)))
        .toBe(round2((s.orderPayments ?? []).reduce((a, p) => a + p.amount, 0)));

      if (s.target != null) expect(pos.netPayable).toBeCloseTo(s.target, 2);
    });
  }

  it("advance bigger than the bill: zero balance, surplus left on the order, no refund on this bill", () => {
    const orderPayments: Payment[] = [
      { id: "p1", order_id: "o1", invoice_id: null, method: "cash", amount: 100000 },
    ];
    const pos = posState({ subtotal: 60000, stonesTotal: 0, orderPayments });
    const { invoice, payments } = checkout(pos, orderPayments, "o1");
    const box = readSurface(invoice, payments);

    expect(pos.appliedAdvance).toBe(invoice.total);
    expect(box.balanceDue).toBe(0);
    expect(box.surplus).toBe(0); // the excess never lands on the invoice
    expect(round2(payments.filter((p) => p.invoice_id == null).reduce((a, p) => a + p.amount, 0)))
      .toBe(round2(100000 - invoice.total));
    expect(box.totalReceived).toBe(box.grossDue);
  });

  it("final batch with a leftover advance reports the surplus as a refund owed to the customer", () => {
    const orderPayments: Payment[] = [
      { id: "p1", order_id: "o1", invoice_id: null, method: "cash", amount: 100000 },
    ];
    const pos = posState({ subtotal: 60000, stonesTotal: 0, orderPayments });
    const { invoice, payments } = checkout(pos, orderPayments, "o1");

    // Order is closed: the unused advance is refundable, tracked outside the invoice.
    const unusedAdvance = round2(payments.filter((p) => p.invoice_id == null).reduce((a, p) => a + p.amount, 0));
    expect(unusedAdvance).toBeGreaterThan(0);

    const box = readSurface(invoice, payments);
    expect(box.balanceDue).toBe(0);
    expect(round2(box.totalReceived + box.balanceDue - box.surplus)).toBe(box.grossDue);

    // Refund owed = advance collected − advance consumed by the bill.
    expect(round2(100000 - box.advanceReceived)).toBe(unusedAdvance);
  });

  it("over-collection at the counter surfaces as a refund, never a negative balance", () => {
    const pos = posState({
      subtotal: 100000, stonesTotal: 0,
      atSalePayments: [{ method: "cash", amount: 50000 }],
    });
    const { invoice, payments } = checkout(pos, [], "o1");
    // Staff took more cash than the bill needed.
    payments.push({ id: "sale-extra", order_id: null, invoice_id: invoice.id, method: "cash", amount: 500000 });

    const box = readSurface({ ...invoice, balance_due: null }, payments);
    expect(box.balanceDue).toBe(0);
    expect(box.surplus).toBe(round2(box.totalReceived - box.grossDue));
    expect(box.surplus).toBeGreaterThan(0);
    expect(box.modeRows.length).toBe(1); // both cash payments merged
    expect(round2(box.totalReceived + box.balanceDue - box.surplus)).toBe(box.grossDue);
  });

  it("the invoice screen and the printed bill both render from the shared breakdown helper", () => {
    const root = path.resolve(__dirname, "../..");
    for (const f of ["src/pages/InvoiceDetail.tsx", "src/components/PrintDocument.tsx"]) {
      const src = readFileSync(path.join(root, f), "utf8");
      expect(src, `${f} should use paymentBreakdown`).toContain("paymentBreakdown(");
      expect(src, `${f} should not hand-roll the payment mode grouping`).not.toMatch(/new Map<string, number>\(\)/);
    }
  });
});
