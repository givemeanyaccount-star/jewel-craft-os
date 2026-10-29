import { describe, expect, it } from "vitest";
import { fiscalBillNumber, fiscalPeriod, fiscalPeriodForDate, nepalToday } from "../lib/fiscalYear";
import { adToBSParts, bsToAD, bsMonthDays } from "../lib/nepaliDate";

describe("Nepali fiscal books", () => {
  it("starts on Shrawan 1", () => {
    expect(adToBSParts(fiscalPeriod(2083).starts_on)).toEqual({ y: 2083, m: 3, d: 1 });
  });
  it("ends on the actual final Ashadh day with no gap", () => {
    for (const year of [2081, 2082, 2083, 2084]) {
      const p = fiscalPeriod(year);
      expect(adToBSParts(p.ends_on)).toEqual({ y: year + 1, m: 2, d: bsMonthDays(year + 1, 2) });
      expect(new Date(`${fiscalPeriod(year + 1).starts_on}T00:00:00Z`).getTime() - new Date(`${p.ends_on}T00:00:00Z`).getTime()).toBe(86400000);
    }
  });
  it("assigns Ashadh and Shrawan transactions to different years", () => {
    expect(fiscalPeriodForDate(bsToAD(2083, 2, 31)).bs_year).toBe(2082);
    expect(fiscalPeriodForDate(bsToAD(2083, 3, 1)).bs_year).toBe(2083);
  });
  it("restarts sale numbers at 1 with unique fiscal-year prefixes", () => {
    expect(fiscalBillNumber(2083, 1)).toBe("INV-2083-84-00001");
    expect(fiscalBillNumber(2084, 1)).toBe("INV-2084-85-00001");
  });
  it("uses Nepal midnight rather than UTC midnight", () => {
    expect(nepalToday(new Date("2026-07-16T18:15:00Z"))).toBe("2026-07-17");
    expect(nepalToday(new Date("2026-07-16T18:14:59Z"))).toBe("2026-07-16");
  });
});