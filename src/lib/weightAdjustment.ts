import { computeFineWeight, computeNetWeight } from "@/lib/format";

export const ADJUSTMENT_REASONS = [
  { value: "reweigh", label: "Re-weighed / scale correction" },
  { value: "polish_loss", label: "Polishing or repair loss" },
  { value: "stone_change", label: "Stone added / removed" },
  { value: "entry_error", label: "Data entry error" },
  { value: "other", label: "Other" },
] as const;

export type AdjustmentStatus = "pending" | "approved" | "rejected";

export function adjustmentPreview(
  current: { gross_weight: number; stone_weight: number; net_weight: number; fine_weight: number },
  gross: number, stone: number, purity: string,
) {
  const net = computeNetWeight(gross, stone);
  const fine = computeFineWeight(net, purity);
  const valid = gross > 0 && stone >= 0 && stone <= gross;
  const changed = Math.round(gross * 1000) !== Math.round(Number(current.gross_weight) * 1000)
    || Math.round(stone * 1000) !== Math.round(Number(current.stone_weight) * 1000);
  return { net, fine, valid, changed, netDelta: Math.round((net - Number(current.net_weight)) * 1000) / 1000,
    fineDelta: Math.round((fine - Number(current.fine_weight)) * 1000) / 1000 };
}

/** Reviewer may act unless reviewing their own request (admins are exempt). */
export function canReview(opts: { canApprove: boolean; isAdmin: boolean; userId?: string | null; requestedBy?: string | null; status: string }) {
  if (opts.status !== "pending" || !opts.canApprove) return false;
  return opts.isAdmin || !opts.userId || opts.userId !== opts.requestedBy;
}
