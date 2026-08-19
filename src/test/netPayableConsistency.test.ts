import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  computeInvoiceTaxes,
  discountForTargetTotal,
  discountForTargetRefund,
  advanceReceivedFromPayments,
  refundPaidFromPayments,
  netPayableOf,
  refundDueOf,
  round2,
} from "@/lib/format";

/**
 * End-to-end check of the order-advance money trail:
 *
 *   Order advances ──► POS (old metal advance = pre-tax credit, cash advance = post-tax deduction,
 *                           excess advance = refund; both advances are adjustable per bill)
 *                 ──► checkout writes invoice + attaches/splits advance rows + a negative refund row
 *                 ──► InvoiceDetail / printed bill re-derive the same Net Payable and refund
 *
 * POS, InvoiceDetail and PrintDocument must all land on identical numbers.
 */

type Payment = { id: string; order_id: string | null; invoice_id: string | null; method: string; amount: number };

const SETTINGS = { vatRate: 13, vatEnabled: true, sdTaxRate: 0.5 };

/** POS pricing state for a bill pulled from an order. */
function posState(opts: {
  subtotal: number;
  stonesTotal: number;
  walkInOldMetal?: number;
  orderPayments: Payment[];
  manualPaid?: number;
  applyCash?: number;      // defaults to the whole cash advance
  applyOldMetal?: number;  // defaults to the whole old metal advance
  refundInput?: number;    // undefined = refund the whole excess
  targetNetPayable?: number;
  targetRefund?: number;
}) {
  const manualPaid = round2(opts.manualPaid ?? 0);
  // POS.loadOrder: split the order advances by type.
  const advanceOldMetal = round2(
    opts.orderPayments.filter((p) => p.method === "old_gold").reduce((a, p) => a + p.amount, 0),
  );
  const advanceCash = round2(
    opts.orderPayments.filter((p) => p.method !== "old_gold").reduce((a, p) => a + p.amount, 0),
  );
  const appliedOldMetalAdv = round2(Math.max(0, Math.min(opts.applyOldMetal ?? advanceOldMetal, advanceOldMetal)));
  const advanceRequested = round2(Math.max(0, Math.min(opts.applyCash ?? advanceCash, advanceCash)));
  // Applied old-metal advance joins the old metal credit so the SD tax base is right.
  const oldGoldCredit = round2((opts.walkInOldMetal ?? 0) + appliedOldMetalAdv);

  const base = { subtotal: opts.subtotal, stonesTotal: opts.stonesTotal, oldGoldCredit, ...SETTINGS };

  let discount = 0;
  if (opts.targetRefund != null) {
    discount = discountForTargetRefund({ ...base, advanceApplied: advanceRequested, targetRefund: opts.targetRefund });
  } else if (opts.targetNetPayable != null) {
    discount = discountForTargetTotal({ ...base, targetTotal: round2(opts.targetNetPayable + advanceRequested) });
  }

  const tax = computeInvoiceTaxes({ ...base, discount });
  const refundDue = refundDueOf(tax.total, advanceRequested);
  const refund = opts.refundInput == null
    ? refundDue
    : round2(Math.max(0, Math.min(opts.refundInput, refundDue)));
  const advanceConsumed = round2(advanceRequested - (refundDue - refund));
  const appliedAdvance = round2(advanceConsumed - refund);
  const netPayable = netPayableOf(tax.total, appliedAdvance);
  const paid = round2(manualPaid + appliedAdvance);
  const balance = round2(Math.max(0, tax.total - paid));

  return {
    discount, tax, advanceCash, advanceOldMetal, appliedOldMetalAdv, oldGoldCredit,
    advanceRequested, refundDue, refund, advanceConsumed, appliedAdvance, netPayable, paid, balance,
  };
}

/** POS.checkout: persist the invoice and attach/split the advances, exactly as the page does. */
function checkout(state: ReturnType<typeof posState>, orderPayments: Payment[], orderId: string) {
  const invoiceId = "inv-1";
  const invoice = {
    id: invoiceId,
    subtotal: state.tax.subtotal,
    stones_total: state.tax.stonesTotal,
    discount: state.tax.discount,
    vat_amount: state.tax.vat,
    sd_tax: state.tax.sdTax,
    old_gold_credit: state.tax.oldGoldCredit,
    total: state.tax.total,
    amount_paid: state.paid,
    balance_due: state.balance,
  };

  const rows: Payment[] = orderPayments.map((p) => ({ ...p }));

  const consume = (isOldMetal: boolean, want: number) => {
    let remaining = round2(want);
    for (const p of [...rows]) {
      if (remaining <= 0.004) break;
      if ((p.method === "old_gold") !== isOldMetal) continue;
      if (p.invoice_id != null || p.amount <= 0) continue;
      if (p.amount <= remaining + 0.004) {
        p.invoice_id = invoiceId;
        remaining = round2(remaining - p.amount);
      } else {
        p.amount = round2(p.amount - remaining);
        rows.push({ id: `${p.id}-split`, order_id: orderId, invoice_id: invoiceId, method: p.method, amount: remaining });
        remaining = 0;
      }
    }
  };
  consume(true, state.appliedOldMetalAdv);
  consume(false, state.advanceConsumed);

  if (state.refund > 0.004) {
    rows.push({ id: "refund", order_id: null, invoice_id: invoiceId, method: "cash", amount: round2(-state.refund) });
  }

  return { invoice, payments: rows };
}

/** What InvoiceDetail and PrintDocument each read: payments filtered to this invoice. */
function readSurface(invoice: { total: number }, payments: Payment[], invoiceId: string) {
  const attached = payments.filter((p) => p.invoice_id === invoiceId);
  const advanceReceived = advanceReceivedFromPayments(attached);
  const refundPaid = refundPaidFromPayments(attached);
  return { advanceReceived, refundPaid, netPayable: netPayableOf(invoice.total, advanceReceived) };
}

const scenarios = [
  {
    name: "cash advance only, fully consumed",
    subtotal: 250000, stonesTotal: 0, target: 180000,
    orderPayments: [{ id: "p1", order_id: "o1", invoice_id: null, method: "cash", amount: 25000 }],
  },
  {
    name: "old metal advance only (pre-tax credit, no advance line on the bill)",
    subtotal: 250000, stonesTotal: 0, target: 150000,
    orderPayments: [{ id: "p1", order_id: "o1", invoice_id: null, method: "old_gold", amount: 40000 }],
  },
  {
    name: "old metal + cash advance together",
    subtotal: 320000, stonesTotal: 20000, target: 175000,
    orderPayments: [
      { id: "p1", order_id: "o1", invoice_id: null, method: "old_gold", amount: 45000 },
      { id: "p2", order_id: "o1", invoice_id: null, method: "bank_transfer", amount: 30000 },
    ],
  },
  {
    name: "walk-in old metal plus both advance types and a fractional target",
    subtotal: 412345.67, stonesTotal: 12345.67, walkInOldMetal: 33333.33, target: 149999.99,
    orderPayments: [
      { id: "p1", order_id: "o1", invoice_id: null, method: "old_gold", amount: 21111.11 },
      { id: "p2", order_id: "o1", invoice_id: null, method: "fonepay", amount: 17777.77 },
    ],
  },
] as const;

describe("Net Payable is identical across POS, InvoiceDetail and the printed bill", () => {
  for (const s of scenarios) {
    it(s.name, () => {
      const orderPayments = s.orderPayments.map((p) => ({ ...p })) as Payment[];
      const pos = posState({
        subtotal: s.subtotal,
        stonesTotal: s.stonesTotal,
        walkInOldMetal: (s as any).walkInOldMetal,
        orderPayments,
        targetNetPayable: s.target,
      });

      const { invoice, payments } = checkout(pos, orderPayments, "o1");
      const invoiceDetail = readSurface(invoice, payments, invoice.id);
      const printed = readSurface(invoice, payments, invoice.id);

      // Same advance figure and same Net Payable everywhere.
      expect(invoiceDetail.advanceReceived).toBe(pos.appliedAdvance);
      expect(printed.advanceReceived).toBe(pos.appliedAdvance);
      expect(invoiceDetail.netPayable).toBe(pos.netPayable);
      expect(printed.netPayable).toBe(pos.netPayable);

      // The auto-discount hits the requested Net Payable when one was asked for.
      if (s.target != null) expect(pos.netPayable).toBeCloseTo(s.target, 2);

      // Old-metal advances never appear as an advance line — they live in the credit.
      expect(invoiceDetail.advanceReceived).toBe(
        round2(payments.filter((p) => p.invoice_id === invoice.id && p.method !== "old_gold")
          .reduce((a, p) => a + p.amount, 0)),
      );
      expect(invoice.old_gold_credit).toBe(pos.oldGoldCredit);

      // Money is conserved: nothing of the order advance is lost or double-counted.
      const totalAfter = round2(payments.reduce((a, p) => a + p.amount, 0));
      const totalBefore = round2(s.orderPayments.reduce((a, p) => a + p.amount, 0));
      expect(totalAfter).toBe(totalBefore);

      // Ledger identity: total = net payable + advance; balance = total − paid.
      expect(round2(pos.netPayable + pos.appliedAdvance)).toBe(pos.tax.total);
      expect(invoice.balance_due).toBe(round2(invoice.total - invoice.amount_paid));
    });
  }

  it("refunds the excess when the advance is larger than the bill", () => {
    const orderPayments: Payment[] = [
      { id: "p1", order_id: "o1", invoice_id: null, method: "cash", amount: 120000 },
    ];
    const pos = posState({ subtotal: 90000, stonesTotal: 0, orderPayments });
    const { invoice, payments } = checkout(pos, orderPayments, "o1");
    const read = readSurface(invoice, payments, invoice.id);

    expect(pos.refundDue).toBe(round2(120000 - invoice.total));
    expect(pos.refund).toBe(pos.refundDue);
    expect(pos.netPayable).toBe(0);
    expect(read.refundPaid).toBe(pos.refund);
    expect(read.netPayable).toBe(0);
    // Every rupee of the advance is either credited or handed back.
    expect(round2(pos.appliedAdvance + pos.refund)).toBe(120000);
    // Invoice payment rows sum to what the invoice says was paid.
    const attached = round2(payments.filter((p) => p.invoice_id === invoice.id).reduce((a, p) => a + p.amount, 0));
    expect(attached).toBe(invoice.amount_paid);
    expect(invoice.balance_due).toBe(0);
  });

  it("keeps part of the excess on the order when a smaller refund is paid out", () => {
    const orderPayments: Payment[] = [
      { id: "p1", order_id: "o1", invoice_id: null, method: "cash", amount: 120000 },
    ];
    const pos = posState({ subtotal: 90000, stonesTotal: 0, orderPayments, refundInput: 5000 });
    const { invoice, payments } = checkout(pos, orderPayments, "o1");
    const read = readSurface(invoice, payments, invoice.id);

    expect(pos.refund).toBe(5000);
    expect(read.refundPaid).toBe(5000);
    const leftOnOrder = round2(payments.filter((p) => p.invoice_id == null).reduce((a, p) => a + p.amount, 0));
    expect(leftOnOrder).toBe(round2(pos.refundDue - 5000));
    expect(round2(payments.reduce((a, p) => a + p.amount, 0))).toBe(round2(120000 - 5000));
    expect(read.netPayable).toBe(0);
  });

  it("saves the old metal advance for later items when it is not adjusted on this bill", () => {
    const orderPayments: Payment[] = [
      { id: "p1", order_id: "o1", invoice_id: null, method: "old_gold", amount: 60000 },
    ];
    const applied = posState({ subtotal: 200000, stonesTotal: 0, orderPayments });
    const half = posState({ subtotal: 200000, stonesTotal: 0, orderPayments, applyOldMetal: 25000 });
    const none = posState({ subtotal: 200000, stonesTotal: 0, orderPayments, applyOldMetal: 0 });

    expect(applied.oldGoldCredit).toBe(60000);
    expect(half.oldGoldCredit).toBe(25000);
    expect(none.oldGoldCredit).toBe(0);
    // Less credit applied ⇒ a bigger bill (and a bigger SD tax base).
    expect(none.tax.total).toBeGreaterThan(half.tax.total);
    expect(half.tax.total).toBeGreaterThan(applied.tax.total);

    const { invoice, payments } = checkout(half, orderPayments, "o1");
    expect(invoice.old_gold_credit).toBe(25000);
    const leftOnOrder = round2(payments.filter((p) => p.invoice_id == null).reduce((a, p) => a + p.amount, 0));
    expect(leftOnOrder).toBe(35000);
    expect(round2(payments.reduce((a, p) => a + p.amount, 0))).toBe(60000);
  });

  it("solves the discount so the refund equals the target", () => {
    const orderPayments: Payment[] = [
      { id: "p1", order_id: "o1", invoice_id: null, method: "cash", amount: 150000 },
    ];
    const pos = posState({ subtotal: 120000, stonesTotal: 8000, orderPayments, targetRefund: 45000 });
    const { invoice, payments } = checkout(pos, orderPayments, "o1");
    const read = readSurface(invoice, payments, invoice.id);

    // The solver works to the nearest paisa.
    expect(Math.abs(pos.refund - 45000)).toBeLessThanOrEqual(0.02);
    expect(read.refundPaid).toBe(pos.refund);
    expect(Math.abs(round2(invoice.total + pos.refund) - 150000)).toBeLessThanOrEqual(0.02);
    expect(read.netPayable).toBe(0);
  });

  it("keeps all three surfaces on the shared helpers (no local re-implementation)", () => {
    const root = path.resolve(__dirname, "../..");
    for (const f of ["src/pages/POS.tsx", "src/pages/InvoiceDetail.tsx", "src/components/PrintDocument.tsx"]) {
      const src = readFileSync(path.join(root, f), "utf8");
      expect(src, `${f} should use netPayableOf`).toContain("netPayableOf");
      expect(src, `${f} should not hand-roll the net payable subtraction`)
        .not.toMatch(/(total|netTotal)[^\n]*-\s*(applied)?[aA]dvance(Received)?/);
    }
  });
});
