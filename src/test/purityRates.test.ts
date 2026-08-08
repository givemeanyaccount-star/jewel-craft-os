import { describe, it, expect } from "vitest";
import {
  GOLD_PURITIES, SILVER_PURITIES, PURITY_FACTORS, PURITY_LABELS,
  purityOptions, purityLabel, derivedRate, ALL_PURITIES,
} from "@/lib/purity";
import {
  purityFactor, computeFineWeight, computeNetWeight, computeLineTotal,
  computeInvoiceTaxes, fineRateFromLine, round2, round3,
} from "@/lib/format";

/* ------------------------------------------------------------------ */
/* 1. Standard category lists                                          */
/* ------------------------------------------------------------------ */

describe("purity categories", () => {
  it("gold has exactly 24K/22K/18K/14K", () => {
    expect([...GOLD_PURITIES]).toEqual(["24K", "22K", "18K", "14K"]);
    expect(purityOptions("gold")).toEqual(["24K", "22K", "18K", "14K"]);
  });

  it("silver has exactly 999/925", () => {
    expect([...SILVER_PURITIES]).toEqual(["999", "925"]);
    expect(purityOptions("silver")).toEqual(["999", "925"]);
  });

  it("drops removed karats and platinum entirely", () => {
    for (const gone of ["20K", "9K", "platinum", "PT950"]) {
      expect(ALL_PURITIES).not.toContain(gone);
    }
  });

  it("falls back to the full list for unknown/absent metals", () => {
    expect(purityOptions(null)).toEqual(["24K", "22K", "18K", "14K", "999", "925"]);
    expect(purityOptions("diamond")).toEqual(ALL_PURITIES);
  });

  it("labels show the fineness", () => {
    expect(purityLabel("22K")).toBe("22K (916)");
    expect(purityLabel("18K")).toBe("18K (750)");
    expect(purityLabel("14K")).toBe("14K (585)");
    expect(purityLabel("999")).toBe("999 (fine silver)");
    expect(purityLabel("925")).toBe("925 (sterling)");
    expect(purityLabel("91.6%")).toBe("91.6%"); // custom purity passes through
  });
});

/* ------------------------------------------------------------------ */
/* 2. Factors — exact, not karat/24                                    */
/* ------------------------------------------------------------------ */

describe("purity factors", () => {
  it("uses the exact standard factors", () => {
    expect(PURITY_FACTORS).toMatchObject({
      "24K": 1, "22K": 0.916, "18K": 0.75, "14K": 0.585, "999": 0.999, "925": 0.925,
    });
  });

  it("purityFactor agrees with the shared table", () => {
    for (const p of ALL_PURITIES) expect(purityFactor(p)).toBe(PURITY_FACTORS[p]);
  });

  it("22K is 0.916, not 22/24", () => {
    expect(purityFactor("22K")).toBe(0.916);
    expect(purityFactor("22K")).not.toBeCloseTo(22 / 24, 5);
  });

  it("still resolves custom purities when the toggle allows them", () => {
    expect(purityFactor("91.6%")).toBeCloseTo(0.916, 6);
    expect(purityFactor("21K")).toBeCloseTo(21 / 24, 6);
    expect(purityFactor("916")).toBeCloseTo(0.916, 6);
    expect(purityFactor("")).toBe(1);
    expect(purityFactor("nonsense")).toBe(1);
  });

  it("is case and whitespace tolerant", () => {
    expect(purityFactor(" 22k ")).toBe(0.916);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Derived rates from a single fine rate                            */
/* ------------------------------------------------------------------ */

describe("derived rates", () => {
  const goldFine = 19850.75; // per gram, 24K
  const silverFine = 245.4;  // per gram, 999

  it("derives the full gold sheet from the 24K rate", () => {
    expect(derivedRate(goldFine, "24K")).toBe(19850.75);
    expect(derivedRate(goldFine, "22K")).toBe(18183.29); // 19850.75 * 0.916
    expect(derivedRate(goldFine, "18K")).toBe(14888.06); // * 0.75
    expect(derivedRate(goldFine, "14K")).toBe(11612.69); // * 0.585
  });

  it("derives the silver sheet from the pure silver rate", () => {
    // the entered rate is for pure silver; 999 carries its own 0.999 fineness
    expect(derivedRate(silverFine, "999")).toBe(245.15); // 245.4 * 0.999
    expect(derivedRate(silverFine, "925")).toBe(227.0);  // 245.4 * 0.925
  });

  it("rounds derived rates to 2 decimals (half-up)", () => {
    // 1000.05 * 0.916 = 916.0458 -> 916.05
    expect(derivedRate(1000.05, "22K")).toBe(916.05);
    // 100.1 * 0.585 = 58.5585 -> 58.56
    expect(derivedRate(100.1, "14K")).toBe(58.56);
    expect(Number.isInteger(derivedRate(10, "24K") * 100)).toBe(true);
  });

  it("derived rates are monotonically ordered by purity", () => {
    const sheet = GOLD_PURITIES.map((p) => derivedRate(goldFine, p));
    expect(sheet).toEqual([...sheet].sort((a, b) => b - a));
  });

  it("treats a zero or unknown purity safely", () => {
    expect(derivedRate(0, "22K")).toBe(0);
    expect(derivedRate(1000, "PT950")).toBe(1000); // unknown -> factor 1
  });

  it("round-trips a derived rate back to the fine rate", () => {
    const r22 = derivedRate(goldFine, "22K");
    expect(fineRateFromLine(r22, "22K")).toBeCloseTo(goldFine, 1);
    const r925 = derivedRate(silverFine, "925");
    expect(fineRateFromLine(r925, "925")).toBeCloseTo(silverFine, 1);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Fine weight & rounding                                           */
/* ------------------------------------------------------------------ */

describe("fine weight and rounding", () => {
  it("computes fine weight at 3 decimals per purity", () => {
    const net = computeNetWeight(12.5, 0.75); // 11.75 g
    expect(net).toBe(11.75);
    expect(computeFineWeight(net, "24K")).toBe(11.75);
    expect(computeFineWeight(net, "22K")).toBe(10.763); // 10.763
    expect(computeFineWeight(net, "18K")).toBe(8.813);  // 8.8125 -> 8.813 (half-up)
    expect(computeFineWeight(net, "14K")).toBe(6.874);  // 6.87375
    expect(computeFineWeight(net, "999")).toBe(11.738);
    expect(computeFineWeight(net, "925")).toBe(10.869); // 10.86875 -> 10.869
  });

  it("rounds money to 2 and weights to 3 decimals, half-up and float-safe", () => {
    expect(round2(2449.4999999999995)).toBe(2449.5);
    expect(round2(8.165 * 3)).toBe(24.5);
    expect(round3(8.8125)).toBe(8.813);
    expect(round3(-1.0005)).toBe(-1.001);
    expect(round2(NaN)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Totals built on derived rates                                    */
/* ------------------------------------------------------------------ */

describe("totals from derived rates", () => {
  const goldFine = 20000;

  function line(purity: string) {
    return computeLineTotal({
      netWeight: 10,
      ratePerGram: derivedRate(goldFine, purity),
      makingCharge: 500, makingChargeType: "per_gram",
      wastageType: "percentage", wastageValue: 5,
      stoneValue: 2500,
    });
  }

  it("prices a 22K line off the derived rate", () => {
    const l = line("22K");
    expect(l.metalValue).toBe(183200);   // 10 * 18320
    expect(l.making).toBe(5000);
    expect(l.wastageAmount).toBe(9160);  // 5% of metal value
    expect(l.lineTotal).toBe(199860);    // + 2500 stones
  });

  it("scales exactly with the purity factor across the gold sheet", () => {
    const fine = line("24K").metalValue;
    expect(line("22K").metalValue).toBe(round2(fine * 0.916));
    expect(line("18K").metalValue).toBe(round2(fine * 0.75));
    expect(line("14K").metalValue).toBe(round2(fine * 0.585));
  });

  it("scales for silver 925 off the 999 rate", () => {
    const r999 = derivedRate(250, "999");
    const r925 = derivedRate(250, "925");
    const a = computeLineTotal({ netWeight: 100, ratePerGram: r999, makingCharge: 0, makingChargeType: "fixed", wastageType: "fixed", wastageValue: 0, stoneValue: 0 });
    const b = computeLineTotal({ netWeight: 100, ratePerGram: r925, makingCharge: 0, makingChargeType: "fixed", wastageType: "fixed", wastageValue: 0, stoneValue: 0 });
    expect(a.lineTotal).toBe(24975);  // 100 * 249.75
    expect(b.lineTotal).toBe(23125);  // 100 * 231.25
  });

  it("carries a 22K line through invoice taxes (VAT on stones only)", () => {
    const l = line("22K");
    const tax = computeInvoiceTaxes({ subtotal: l.lineTotal, stonesTotal: 2500, vatRate: 13, sdTaxRate: 0.5 });
    expect(tax.nonStoneTotal).toBe(197360);
    expect(tax.vat).toBe(325);        // 13% of 2500
    expect(tax.sdTax).toBe(986.8);    // 0.5% of non-stone total
    expect(tax.total).toBe(round2(199860 + 325 + 986.8));
  });

  it("custom-purity lines total consistently with their percentage", () => {
    const custom = computeLineTotal({
      netWeight: 10, ratePerGram: round2(goldFine * 0.916),
      makingCharge: 500, makingChargeType: "per_gram",
      wastageType: "percentage", wastageValue: 5, stoneValue: 2500,
    });
    // "91.6%" custom purity must price identically to the standard 22K category
    expect(purityFactor("91.6%")).toBeCloseTo(purityFactor("22K"), 6);
    expect(custom.lineTotal).toBe(line("22K").lineTotal);
  });
});
