import { describe, expect, it } from "vitest";
import { adjustmentPreview, canReview } from "@/lib/weightAdjustment";

const cur = { gross_weight: 10, stone_weight: 1, net_weight: 9, fine_weight: 8.244 };
describe("weight adjustment", () => {
  it("recomputes net and fine from new gross/stone", () => {
    const p = adjustmentPreview(cur, 9.5, 1, "22K");
    expect(p.net).toBe(8.5); expect(p.fine).toBe(7.786); expect(p.netDelta).toBe(-0.5); expect(p.changed).toBe(true);
  });
  it("rejects stone heavier than gross", () => expect(adjustmentPreview(cur, 1, 2, "22K").valid).toBe(false));
  it("flags unchanged weights", () => expect(adjustmentPreview(cur, 10, 1, "22K").changed).toBe(false));
  it("blocks reviewing own request unless admin", () => {
    expect(canReview({ canApprove: true, isAdmin: false, userId: "u", requestedBy: "u", status: "pending" })).toBe(false);
    expect(canReview({ canApprove: true, isAdmin: true, userId: "u", requestedBy: "u", status: "pending" })).toBe(true);
    expect(canReview({ canApprove: true, isAdmin: false, userId: "m", requestedBy: "u", status: "approved" })).toBe(false);
  });
});
