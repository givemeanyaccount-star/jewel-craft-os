import { describe, it, expect } from "vitest";
import { visibleSections, badgeLabel, NAV_SECTIONS } from "@/lib/navConfig";

describe("navigation", () => {
  it("reports are grouped together", () => {
    const r = NAV_SECTIONS.find((s) => s.label === "Reports")!;
    expect(r.items.map((i) => i.to)).toEqual(["/reports/day-close", "/reports/sales", "/reports/stock", "/fiscal-years"]);
  });
  it("setup group starts collapsed", () => expect(NAV_SECTIONS.find((s) => s.label === "Setup")?.collapsedByDefault).toBe(true));
  it("hides links without permission and drops empty groups", () => {
    const s = visibleSections((p) => p === "pos_create_sale");
    expect(s.map((x) => x.label)).toEqual(["Sell", "Reports"]);
    expect(s[0].items.map((i) => i.to)).toEqual(["/pos", "/counter"]);
    expect(s[1].items.map((i) => i.to)).toEqual(["/reports/day-close"]);
  });
  it("badge hidden at zero and capped at 99+", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(7)).toBe("7");
    expect(badgeLabel(150)).toBe("99+");
  });
});
