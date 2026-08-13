import { supabase } from "@/integrations/supabase/client";
import { computeLineTotal, computeNetWeight, nextNumber, round2 } from "@/lib/format";

export const ORDER_ITEM_FLOW = ["pending", "assigned", "in_progress", "received", "in_stock", "billed"] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_FLOW)[number] | "cancelled";

export const ORDER_ITEM_LABEL: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  in_progress: "In Production",
  received: "Received from Karigar",
  in_stock: "In Stock",
  billed: "Billed",
  cancelled: "Cancelled",
};

export const ORDER_ITEM_COLOR: Record<string, string> = {
  pending: "bg-slate-200 text-slate-800",
  assigned: "bg-indigo-200 text-indigo-900",
  in_progress: "bg-amber-200 text-amber-900",
  received: "bg-blue-200 text-blue-900",
  in_stock: "bg-emerald-200 text-emerald-900",
  billed: "bg-gray-800 text-white",
  cancelled: "bg-destructive/15 text-destructive",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  in_production: "In Production",
  ready: "Ready to bill",
  completed: "Completed",
  cancelled: "Cancelled",
};

export interface RateLookup {
  rate: number;
  effective_date: string | null;
  exact: boolean;
}

/** Rate for a metal/purity effective on or before `date` (YYYY-MM-DD). */
export async function fetchRateOn(metal: string, purity: string, date: string): Promise<RateLookup> {
  const { data } = await supabase
    .from("metal_rates")
    .select("rate_per_gram, effective_date")
    .eq("metal", metal as any)
    .eq("purity", purity)
    .lte("effective_date", date)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { rate: 0, effective_date: null, exact: false };
  return {
    rate: Number(data.rate_per_gram ?? 0),
    effective_date: data.effective_date,
    exact: data.effective_date === date,
  };
}

/** Latest known rate for a metal/purity, regardless of date. */
export async function fetchLatestRate(metal: string, purity: string): Promise<RateLookup> {
  const { data } = await supabase
    .from("metal_rates")
    .select("rate_per_gram, effective_date")
    .eq("metal", metal as any)
    .eq("purity", purity)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { rate: 0, effective_date: null, exact: false };
  return { rate: Number(data.rate_per_gram ?? 0), effective_date: data.effective_date, exact: true };
}

export interface OrderLineInput {
  quantity?: number;
  expected_gross_weight?: number;
  expected_stone_weight?: number;
  expected_net_weight?: number;
  rate?: number;
  making_input?: number;
  making_type?: string;
  wastage_input?: number;
  wastage_type?: string;
  stone_value?: number;
}

/** Estimated money value of an order line, using the same pricing engine as POS. */
export function estimateOrderLine(l: OrderLineInput): number {
  const net = Number(
    l.expected_net_weight ??
      computeNetWeight(Number(l.expected_gross_weight ?? 0), Number(l.expected_stone_weight ?? 0)),
  );
  const { lineTotal } = computeLineTotal({
    netWeight: net,
    ratePerGram: Number(l.rate ?? 0),
    makingCharge: Number(l.making_input ?? 0),
    makingChargeType: (l.making_type ?? "per_gram") as any,
    wastageType: (l.wastage_type ?? "percentage") as any,
    wastageValue: Number(l.wastage_input ?? 0),
    stoneValue: Number(l.stone_value ?? 0),
    quantity: Number(l.quantity ?? 1),
  });
  return round2(lineTotal);
}

export function nextOrderNo() {
  return nextNumber("ORD", Math.floor(Date.now() / 1000) % 100000, 5);
}

export async function logOrderItemStatus(entry: {
  order_item_id: string;
  status: OrderItemStatus;
  karigar_id?: string | null;
  karigar_name?: string | null;
  gross_weight?: number | null;
  stone_weight?: number | null;
  net_weight?: number | null;
  note?: string | null;
  changed_by?: string | null;
}) {
  await supabase.from("order_item_status_log").insert(entry as any);
}

/** Roll the header status up from its lines. */
export function rollupOrderStatus(items: Array<{ status: string }>): string {
  const live = items.filter((i) => i.status !== "cancelled");
  if (!live.length) return items.length ? "cancelled" : "open";
  if (live.every((i) => i.status === "billed")) return "completed";
  if (live.every((i) => i.status === "in_stock" || i.status === "billed")) return "ready";
  if (live.some((i) => i.status === "assigned" || i.status === "in_progress" || i.status === "received")) return "in_production";
  return "open";
}

export async function syncOrderStatus(orderId: string) {
  const { data: items } = await supabase.from("order_items").select("status, estimated_amount").eq("order_id", orderId);
  if (!items) return;
  const status = rollupOrderStatus(items as any);
  const estimated_total = round2(
    (items as any[]).filter((i) => i.status !== "cancelled").reduce((a, i) => a + Number(i.estimated_amount ?? 0), 0),
  );
  await supabase.from("orders").update({ status: status as any, estimated_total }).eq("id", orderId);
}

/** Total advance recorded against an order. */
export async function fetchOrderAdvance(orderId: string): Promise<number> {
  const { data } = await supabase.from("payments").select("amount").eq("order_id", orderId);
  return round2((data ?? []).reduce((a: number, p: any) => a + Number(p.amount ?? 0), 0));
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export interface OrderDashboardStats {
  open: number;
  dueThisWeek: number;
  readyToBill: number;
  advanceHeld: number;
}

export async function orderDashboardStats(): Promise<OrderDashboardStats> {
  const today = todayISO();
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("orders")
    .select("id, status, promised_date, advance_paid, order_items(status)")
    .in("status", ["open", "in_production", "ready"]);
  const rows = (data ?? []) as any[];
  return {
    open: rows.length,
    dueThisWeek: rows.filter((o) => o.promised_date && o.promised_date >= today && o.promised_date <= weekAhead).length,
    readyToBill: rows.filter((o) => (o.order_items ?? []).some((i: any) => i.status === "in_stock")).length,
    advanceHeld: round2(rows.reduce((a, o) => a + Number(o.advance_paid ?? 0), 0)),
  };
}
