import { supabase } from "@/integrations/supabase/client";
import { round2, computeNetWeight } from "@/lib/format";

/**
 * WASTAGE MODEL — read this before changing any math in here.
 *
 * Wastage is NOT shrinkage the shop writes off. It is metal-denominated compensation
 * PAID TO the karigar, on top of his cash making charge. So a karigar's outstanding
 * metal obligation is:
 *
 *     owed back = issued weight - finished piece weight - wastage allowance
 *
 * Issue 100g, receive a 95g piece against a 5g allowance -> fully settled (0g owed).
 * Receive only 93g against the same allowance -> 2g still unaccounted for.
 */

export type MakingRateType = "per_gram" | "percentage" | "flat";
export type WastageType = "percentage" | "weight";

export function wastageGrams(type: WastageType | string | null, value: number, issuedWeight: number): number {
  if (!value) return 0;
  if (type === "weight") return round2(value);
  return round2(issuedWeight * (value / 100)); // percentage of issued metal
}

export function makingChargeAmount(
  type: MakingRateType | string | null, rate: number,
  finishedNetWeight: number, metalRatePerGram: number, quantity = 1,
): number {
  if (!rate) return 0;
  if (type === "percentage") return round2(finishedNetWeight * metalRatePerGram * (rate / 100));
  if (type === "flat") return round2(rate * (quantity || 1));
  return round2(rate * finishedNetWeight); // per_gram
}

/** Metal still owed by the karigar on a single issued job. */
export function metalOwed(issuedWeight: number, receivedNetWeight: number, wastageAllowance: number): number {
  return round2(issuedWeight - receivedNetWeight - wastageAllowance);
}

export interface ProductionRow {
  id: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  description: string;
  metal: string;
  purity: string;
  quantity: number;
  expectedNetWeight: number;
  rate: number;
  status: string;
  karigarId: string | null;
  karigarName: string | null;
  issuedAt: string | null;
  issuedGrossWeight: number;
  receivedNetWeight: number;
  wastageAllowance: number;
  owedBack: number;
  daysHeld: number | null;
  promisedDate: string | null;
  photos: string[];
  makingType: string | null;
  makingRate: number | null;
  wastageType: string | null;
  wastageValue: number | null;
}

function days(from: string | null) {
  if (!from) return null;
  return Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000);
}

function toRow(o: any, receivedByItem: Record<string, number>): ProductionRow {
  const issued = Number(o.issued_gross_weight ?? 0);
  const received = receivedByItem[o.id] ?? Number(o.received_net_weight ?? 0);
  const allowance = o.karigar_wastage_grams != null
    ? Number(o.karigar_wastage_grams)
    : wastageGrams(o.karigar_wastage_type ?? o.wastage_type, Number(o.karigar_wastage_value ?? o.wastage_input ?? 0), issued);
  return {
    id: o.id,
    orderId: o.order_id,
    orderNo: o.orders?.order_no ?? "—",
    customerName: o.orders?.customers?.full_name ?? "—",
    description: o.description,
    metal: o.metal, purity: o.purity, quantity: Number(o.quantity ?? 1),
    expectedNetWeight: Number(o.expected_net_weight ?? 0),
    rate: Number(o.rate ?? 0),
    status: o.status,
    karigarId: o.karigar_id, karigarName: o.karigar_name ?? null,
    issuedAt: o.issued_at,
    issuedGrossWeight: issued,
    receivedNetWeight: received,
    wastageAllowance: allowance,
    owedBack: o.issued_at ? metalOwed(issued, received, allowance) : 0,
    daysHeld: days(o.issued_at),
    promisedDate: o.orders?.promised_date ?? null,
    photos: o.photos ?? [],
    makingType: o.karigar_making_type ?? null,
    makingRate: o.karigar_making_rate != null ? Number(o.karigar_making_rate) : null,
    wastageType: o.karigar_wastage_type ?? o.wastage_type ?? null,
    wastageValue: o.karigar_wastage_value != null ? Number(o.karigar_wastage_value) : Number(o.wastage_input ?? 0),
  };
}

const ACTIVE_ORDER_STATUSES = ["pending", "assigned", "in_progress", "received"];

export async function fetchProductionBoard(): Promise<{
  toIssue: ProductionRow[];
  inWorkshop: ProductionRow[];
  received: ProductionRow[];
}> {
  const { data, error } = await supabase
    .from("order_items")
    .select("*, orders(id, order_no, promised_date, status, customers(full_name))")
    .in("status", ACTIVE_ORDER_STATUSES)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const items = (data ?? []).filter((o: any) => o.orders?.status !== "cancelled");

  // Sum multi-batch receipts so partially-received lines show the real returned weight.
  const ids = items.map((o: any) => o.id);
  const receivedByItem: Record<string, number> = {};
  if (ids.length) {
    const { data: receipts } = await supabase
      .from("order_item_receipts").select("order_item_id, received_net_weight").in("order_item_id", ids);
    for (const r of receipts ?? []) {
      receivedByItem[r.order_item_id] = round2((receivedByItem[r.order_item_id] ?? 0) + Number(r.received_net_weight ?? 0));
    }
  }

  const rows = items.map((o: any) => toRow(o, receivedByItem));
  return {
    toIssue: rows.filter((r) => !r.issuedAt && r.status !== "received"),
    inWorkshop: rows.filter((r) => r.issuedAt && ["assigned", "in_progress"].includes(r.status)),
    received: rows.filter((r) => r.status === "received"),
  };
}

/** Issue metal to a karigar for one order line. */
export async function issueToKarigar(params: {
  orderItemId: string;
  karigarId: string | null;
  karigarName: string;
  metal: string;
  purity: string;
  grossWeight: number;
  stoneWeight?: number;
  wastageType: WastageType;
  wastageValue: number;
  makingType: MakingRateType;
  makingRate: number;
  userId?: string;
}) {
  const net = computeNetWeight(params.grossWeight, params.stoneWeight ?? 0);
  const allowance = wastageGrams(params.wastageType, params.wastageValue, params.grossWeight);

  const { error } = await supabase.from("order_items").update({
    karigar_id: params.karigarId,
    karigar_name: params.karigarId ? null : params.karigarName,
    issued_at: new Date().toISOString(),
    issued_metal: params.metal,
    issued_purity: params.purity,
    issued_gross_weight: params.grossWeight,
    issued_net_weight: net,
    karigar_wastage_type: params.wastageType,
    karigar_wastage_value: params.wastageValue,
    karigar_wastage_grams: allowance,
    karigar_making_type: params.makingType,
    karigar_making_rate: params.makingRate,
    status: "in_progress",
  } as any).eq("id", params.orderItemId);
  if (error) throw error;
}

/**
 * Receive a finished piece back from a karigar. Records the accrual (what he earned
 * for this job) so the payable balance is real rather than inferred from customer billing.
 */
export async function receiveFromKarigar(params: {
  row: ProductionRow;
  grossWeight: number;
  stoneWeight: number;
  note?: string;
  userId?: string;
}) {
  const { row } = params;
  const net = computeNetWeight(params.grossWeight, params.stoneWeight);

  const { error } = await supabase.from("order_items").update({
    received_at: new Date().toISOString(),
    received_gross_weight: params.grossWeight,
    received_stone_weight: params.stoneWeight,
    received_net_weight: net,
    karigar_making_amount: makingChargeAmount(row.makingType, row.makingRate ?? 0, net, row.rate, row.quantity),
    status: "received",
  } as any).eq("id", row.id);
  if (error) throw error;

  if (row.karigarId) {
    const amount = makingChargeAmount(row.makingType, row.makingRate ?? 0, net, row.rate, row.quantity);
    // upsert so re-receiving the same line corrects the accrual instead of double-counting
    await supabase.from("karigar_accruals").upsert({
      karigar_id: row.karigarId,
      source_type: "order", source_id: row.id,
      reference_no: row.orderNo, description: row.description,
      finished_net_weight: net, wastage_grams: row.wastageAllowance,
      making_type: row.makingType, making_rate: row.makingRate,
      amount, created_by: params.userId ?? null,
    } as any, { onConflict: "source_type,source_id" });
  }
}
