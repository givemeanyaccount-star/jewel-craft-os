import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  round2,
  round3,
  computeLineTotal,
  computeNetWeight,
  computeFineWeight,
  computeInvoiceTaxes,
  discountForTargetTotal,
  purityFactor,
  fineRateFromLine,
  fineEquivalentGrams,
} from "@/lib/format";
import { refundCalc, lineNet } from "@/lib/returns";
import {
  cacheInvoice,
  getCachedInvoice,
  listInvoiceSnapshots,
  searchCachedInvoices,
  enqueueReturn,
  getQueue,
  removeQueued,
  markQueuedError,
  saveLocalSelection,
  getLocalSelection,
  clearLocalSelection,
} from "@/lib/offlineReturns";

const EMPTY = undefined as unknown as number;

/* ------------------------------------------------------------------ */
/* 1. Rounding primitives                                              */
/* ------------------------------------------------------------------ */
describe("rounding primitives", () => {
  it("handles empty, null and NaN as 0", () => {
    for (const v of [EMPTY, null as any, "" as any, NaN, undefined]) {
      expect(round2(v)).toBe(0);
      expect(round3(v)).toBe(0);
    }
  });

  it("caps money at 2 and weights at 3 decimals (half-up)", () => {
    expect(round2(1234.5678)).toBe(1234.57);
    expect(round2(0.005)).toBe(0.01);
    expect(round3(12.34567)).toBe(12.346);
    expect(round3(0.0005)).toBe(0.001);
  });

  it("is float-safe for classic binary artefacts", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(8.165 * 3)).toBe(24.5);
  });
});

/* ------------------------------------------------------------------ */
/* 2. POS / quotation line pricing (shared engine)                     */
/* ------------------------------------------------------------------ */
describe("POS & quotation line pricing", () => {
  it("returns all zeros for an empty line", () => {
    const r = computeLineTotal({
      netWeight: 0, ratePerGram: 0, makingCharge: 0, makingChargeType: "fixed",
      wastageType: "fixed", wastageValue: 0, stoneValue: 0,
    });
    expect(r).toEqual({ metalValue: 0, making: 0, wastageAmount: 0, lineTotal: 0 });
  });

  it("computes per-gram making + percentage wastage with 2-decimal money", () => {
    const r = computeLineTotal({
      netWeight: 10.567, ratePerGram: 14523.75, makingCharge: 850, makingChargeType: "per_gram",
      wastageType: "percentage", wastageValue: 12.5, stoneValue: 4500.5,
    });
    expect(r.metalValue).toBe(round2(10.567 * 14523.75));
    expect(r.making).toBe(round2(850 * 10.567));
    expect(r.wastageAmount).toBe(round2((10.567 * 14523.75 * 12.5) / 100));
    expect(r.lineTotal).toBe(
      round2(10.567 * 14523.75 + 850 * 10.567 + (10.567 * 14523.75 * 12.5) / 100 + 4500.5)
    );
    // never more than 2 decimals
    expect(String(r.lineTotal).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("handles weight-based wastage and quantity multiples", () => {
    const r = computeLineTotal({
      netWeight: 5, ratePerGram: 10000, makingCharge: 10, makingChargeType: "percentage",
      wastageType: "weight", wastageValue: 0.375, stoneValue: 0, quantity: 3,
    });
    expect(r.metalValue).toBe(50000);
    expect(r.making).toBe(5000);
    expect(r.wastageAmount).toBe(3750);
    expect(r.lineTotal).toBe(round2((50000 + 5000 + 3750) * 3));
  });

  it("net weight never goes negative and keeps 3 decimals", () => {
    expect(computeNetWeight(10.1234, 2.4321)).toBe(7.691);
    expect(computeNetWeight(1, 5)).toBe(0);
    expect(computeNetWeight(EMPTY, EMPTY)).toBe(0);
  });

  it("resolves karat, fineness, percentage and custom purities", () => {
    expect(purityFactor("24K")).toBeCloseTo(1, 6);
    expect(purityFactor("22K")).toBeCloseTo(0.916, 6);
    expect(purityFactor("999")).toBe(0.999);
    expect(purityFactor("91.6%")).toBeCloseTo(0.916, 6);
    expect(purityFactor("")).toBe(1);
    expect(computeFineWeight(10.567, "22K")).toBe(round3(10.567 * (22 / 24)));
  });
});

/* ------------------------------------------------------------------ */
/* 3. Invoice totals & taxes                                           */
/* ------------------------------------------------------------------ */
describe("invoice totals and taxes", () => {
  it("is fully zero-safe with empty input", () => {
    const t = computeInvoiceTaxes({ subtotal: 0, stonesTotal: 0 });
    expect(t.total).toBe(0);
    expect(t.vat).toBe(0);
    expect(t.sdTax).toBe(0);
  });

  it("charges VAT on stones only and SD tax on the non-stone base", () => {
    const t = computeInvoiceTaxes({ subtotal: 100000, stonesTotal: 20000, vatRate: 13, sdTaxRate: 0.5 });
    expect(t.nonStoneTotal).toBe(80000);
    expect(t.vat).toBe(round2(20000 * 0.13));
    expect(t.sdTax).toBe(round2(80000 * 0.005));
    expect(t.total).toBe(round2(100000 + 2600 + 400));
  });

  it("skips VAT when disabled in settings", () => {
    const t = computeInvoiceTaxes({ subtotal: 100000, stonesTotal: 20000, vatEnabled: false });
    expect(t.vat).toBe(0);
  });

  it("allocates discount proportionally to the stones VAT base", () => {
    const t = computeInvoiceTaxes({ subtotal: 100000, stonesTotal: 20000, discount: 10000, vatRate: 13, sdTaxRate: 0.5 });
    expect(t.taxableStones).toBe(18000);
    expect(t.vat).toBe(round2(18000 * 0.13));
    expect(t.sdTax).toBe(round2(72000 * 0.005));
  });

  it("drops SD tax entirely when old gold credit covers the non-stone base", () => {
    const t = computeInvoiceTaxes({ subtotal: 50000, stonesTotal: 0, oldGoldCredit: 60000 });
    expect(t.sdTax).toBe(0);
    expect(t.total).toBe(0); // never negative
  });

  it("clamps out-of-range stones and discount instead of producing garbage", () => {
    const t = computeInvoiceTaxes({ subtotal: 1000, stonesTotal: 99999, discount: 99999 });
    expect(t.stonesTotal).toBe(1000);
    expect(t.discount).toBe(1000);
    expect(t.total).toBe(0);
    const neg = computeInvoiceTaxes({ subtotal: -500, stonesTotal: -10, discount: -10 });
    expect(neg.subtotal).toBe(0);
    expect(neg.total).toBe(0);
  });

  it("keeps every returned amount at 2 decimals with high-precision inputs", () => {
    const t = computeInvoiceTaxes({ subtotal: 98765.4321, stonesTotal: 1234.5678, discount: 111.1111, vatRate: 13, sdTaxRate: 0.5 });
    for (const v of [t.subtotal, t.stonesTotal, t.discount, t.vat, t.sdTax, t.total]) {
      expect(v).toBe(round2(v));
    }
  });

  it("back-solves a discount that lands on the requested net amount", () => {
    const base = { subtotal: 250000, stonesTotal: 30000, vatRate: 13, sdTaxRate: 0.5 };
    for (const target of [200000, 123456.78, 1]) {
      const d = discountForTargetTotal({ ...base, targetTotal: target });
      const t = computeInvoiceTaxes({ ...base, discount: d });
      expect(Math.abs(t.total - target)).toBeLessThan(1);
    }
  });

  it("returns 0 discount for an empty cart or zero target", () => {
    expect(discountForTargetTotal({ subtotal: 0, stonesTotal: 0, targetTotal: 5000 })).toBe(0);
    expect(discountForTargetTotal({ subtotal: 1000, stonesTotal: 0, targetTotal: 0 })).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Purchases & old gold                                             */
/* ------------------------------------------------------------------ */
describe("purchases and old gold valuation", () => {
  it("totals a purchase to 2 decimals from 3-decimal weights", () => {
    const rows = [
      { net: 12.345, rate: 13111.11, making: 1500, qty: 2 },
      { net: 0.001, rate: 13111.11, making: 0, qty: 1 },
      { net: 0, rate: 0, making: 0, qty: 1 },
    ];
    const total = round2(rows.reduce((s, r) => s + (round2(r.net * r.rate) + r.making) * r.qty, 0));
    expect(total).toBe(round2((round2(12.345 * 13111.11) + 1500) * 2 + round2(0.001 * 13111.11)));
    expect(total).toBe(round2(total));
  });

  it("values old gold by fine weight at the converted fine rate", () => {
    const gross = 15.678, stone = 1.234;
    const net = computeNetWeight(gross, stone);
    expect(net).toBe(14.444);
    const fine = computeFineWeight(net, "91.6%");
    expect(fine).toBe(round3(14.444 * 0.916));
    const fineRate = fineRateFromLine(14000, "22K"); // 22K rate -> fine rate
    expect(fineRate).toBeCloseTo(14000 / 0.916, 6);
    expect(round2(fine * fineRate)).toBe(round2(fine * fineRate));
  });

  it("returns 0 fine-equivalent grams for empty amounts or rates", () => {
    expect(fineEquivalentGrams(0, 15000)).toBe(0);
    expect(fineEquivalentGrams(15000, 0)).toBe(0);
    expect(fineEquivalentGrams(EMPTY, EMPTY)).toBe(0);
    expect(fineEquivalentGrams(150000, 15000)).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Sales returns pro-rata maths                                     */
/* ------------------------------------------------------------------ */
describe("sales return pro-rata refund", () => {
  const invoiceLines = [
    { id: "a", line_total: 125000.456 },
    { id: "b", line_total: 48999.994 },
    { id: "c", line_total: 0 },
  ];
  const grossAll = invoiceLines.reduce((s, l) => s + l.line_total, 0);
  const discountRatio = 5000 / grossAll;
  const taxTotal = 2345.67;

  it("returns zeros when nothing is selected", () => {
    const c = refundCalc([], { discountRatio, taxTotal, grossAll });
    expect(c).toEqual({ gross: 0, discount: 0, taxRetained: 0, total: 0 });
  });

  it("refunds net of the pro-rata discount and retains tax", () => {
    const c = refundCalc([invoiceLines[0]], { discountRatio, taxTotal, grossAll });
    expect(c.gross).toBe(round2(125000.456));
    expect(c.discount).toBe(round2(125000.456 * discountRatio));
    expect(c.total).toBe(round2(c.gross - c.discount));
    expect(c.taxRetained).toBe(round2(taxTotal * (c.gross / grossAll)));
    expect(c.total).toBeLessThan(c.gross); // tax is never refunded
  });

  it("a full return reconciles to the whole invoice net and full tax", () => {
    const c = refundCalc(invoiceLines, { discountRatio, taxTotal, grossAll });
    expect(c.gross).toBe(round2(grossAll));
    expect(c.discount).toBeCloseTo(5000, 2);
    expect(c.taxRetained).toBe(round2(taxTotal));
  });

  it("per-line nets sum back to the return total (no rounding drift > 1 paisa/line)", () => {
    const nets = invoiceLines.map((l) => lineNet(l.line_total, discountRatio));
    const sum = round2(nets.reduce((s, n) => s + n.net, 0));
    const c = refundCalc(invoiceLines, { discountRatio, taxTotal, grossAll });
    expect(Math.abs(sum - c.total)).toBeLessThanOrEqual(0.03);
  });

  it("guards against a zero-value invoice (no divide-by-zero)", () => {
    const c = refundCalc([{ line_total: 0 }], { discountRatio: 0, taxTotal: 0, grossAll: 0 });
    expect(c.taxRetained).toBe(0);
    expect(Number.isFinite(c.total)).toBe(true);
  });

  it("treats empty/null line totals as zero", () => {
    const c = refundCalc([{ line_total: null }, { line_total: undefined }, { line_total: "" }], {
      discountRatio: 0.1, taxTotal: 100, grossAll: 1000,
    });
    expect(c.gross).toBe(0);
    expect(c.total).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Offline cache, draft and sync queue                              */
/* ------------------------------------------------------------------ */
describe("offline returns cache and sync queue", () => {
  const snapshotFor = (n: number) => ({
    id: `inv-${n}`,
    invoice_number: `INV-26-${String(n).padStart(5, "0")}`,
    customers: { full_name: n % 2 ? "Sita Shrestha" : "Ram Bahadur" },
    total: 1000 * n,
  });

  beforeEach(async () => {
    await clearLocalSelection();
  });

  it("caches an invoice and reads it back offline", async () => {
    await cacheInvoice(snapshotFor(1), [{ id: "l1", line_total: 500 }]);
    const snap = await getCachedInvoice("inv-1");
    expect(snap?.invoice.invoice_number).toBe("INV-26-00001");
    expect(snap?.items).toHaveLength(1);
    expect(snap?.cachedAt).toBeTruthy();
  });

  it("caps the cache at 25 invoices, keeping the newest", async () => {
    for (let i = 1; i <= 30; i++) {
      await cacheInvoice(snapshotFor(i), []);
    }
    const all = await listInvoiceSnapshots();
    expect(all.length).toBeLessThanOrEqual(25);
    expect(await getCachedInvoice("inv-30")).toBeTruthy();
  });

  it("searches cached invoices by number and customer name", async () => {
    const byNumber = await searchCachedInvoices("INV-26-00030");
    expect(byNumber.map((s) => s.invoice.id)).toContain("inv-30");
    const byName = await searchCachedInvoices("ram bahadur");
    expect(byName.length).toBeGreaterThan(0);
    expect(await searchCachedInvoices("does-not-exist")).toHaveLength(0);
  });

  it("persists and clears the in-progress selection", async () => {
    await saveLocalSelection({
      invoiceId: "inv-1",
      lines: { l1: { selected: true, disposition: "restock" } },
      method: "cash",
      reason: "size mismatch",
      draftId: null,
    });
    const sel = await getLocalSelection();
    expect(sel?.lines.l1.selected).toBe(true);
    expect(sel?.savedAt).toBeTruthy();
    await clearLocalSelection();
    expect(await getLocalSelection()).toBeUndefined();
  });

  it("queues a return offline, flags errors, and drains on sync", async () => {
    const queued = await enqueueReturn({
      invoiceId: "inv-1",
      invoiceNumber: "INV-26-00001",
      customerName: "Sita Shrestha",
      snapshot: { invoice: snapshotFor(1), items: [], cachedAt: new Date().toISOString() },
      selectedIds: ["l1"],
      dispositions: { l1: "restock" },
      calc: { gross: 125000.46, discount: 4090.91, taxRetained: 1500.5, total: 120909.55 },
      discountRatio: 0.0327,
      method: "cash",
      reason: "size mismatch",
      draftId: null,
    });
    expect(queued.clientId).toBeTruthy();
    expect((await getQueue()).length).toBe(1);

    await markQueuedError(queued.clientId, "offline");
    expect((await getQueue())[0].error).toBe("offline");

    // amounts survive the round-trip with no precision loss
    expect((await getQueue())[0].calc.total).toBe(120909.55);

    await removeQueued(queued.clientId);
    expect(await getQueue()).toHaveLength(0);
  });
});
