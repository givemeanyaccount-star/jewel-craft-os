import { describe, it, expect } from "vitest";
import {
  TOLA_GRAMS,
  gramsToTola,
  tolaToGrams,
  ratePerTola,
  ratePerGramFromTola,
  gmsWithTola,
} from "@/lib/format";

describe("tola conversions", () => {
  it("uses the Nepali bullion standard", () => {
    expect(TOLA_GRAMS).toBe(11.6638);
    expect(tolaToGrams(1)).toBe(11.664);
    expect(gramsToTola(11.6638)).toBe(1);
  });

  it("round-trips 3-decimal gram weights within a milligram", () => {
    for (const g of [0.5, 1.234, 9.999, 11.664, 25, 116.638, 500.123]) {
      const back = tolaToGrams(gramsToTola(g));
      expect(Math.abs(back - g)).toBeLessThanOrEqual(0.001);
    }
  });

  it("round-trips tola entry back to the same tola figure", () => {
    for (const t of [0.25, 1, 2.5, 10.75]) {
      expect(gramsToTola(tolaToGrams(t))).toBeCloseTo(t, 3);
    }
  });

  it("converts rates both ways on the paisa grid", () => {
    const perGram = 15250;
    const perTola = ratePerTola(perGram);
    expect(perTola).toBe(177872.95);
    expect(ratePerGramFromTola(perTola)).toBeCloseTo(perGram, 1);
  });

  it("handles null and zero safely", () => {
    expect(gramsToTola(null)).toBe(0);
    expect(tolaToGrams(undefined)).toBe(0);
    expect(ratePerTola(null)).toBe(0);
  });

  it("shows grams first with tola alongside", () => {
    expect(gmsWithTola(11.6638)).toBe("11.664 g (1.0000 tola)");
  });
});
