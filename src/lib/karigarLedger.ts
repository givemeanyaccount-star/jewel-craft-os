import { supabase } from "@/integrations/supabase/client";
import { round2 } from "@/lib/format";
import { wastageGrams, metalOwed } from "@/lib/production";

/**
 * Wastage is metal PAID TO the karigar, not shrinkage the shop absorbs.
 * A job is settled when: issued - received - wastage allowance = 0.
 * See src/lib/production.ts for the full model.
 */

export interface MetalBalanceRow {
  metal: string;
  outstandingGrams: number;
  jobCount: number;
}

export interface OutstandingJobRow {
  type: "order" | "repair";
  id: string;
  refId: string;
  refNo: string;
  description: string;
  metal: string;
  outstandingWeight: number;
  heldSince: string;
  daysHeld: number;
}

export interface WastageRow {
  type: "order" | "repair";
  refNo: string;
  description: string;
  issued: number;
  received: number;
  allowance: number;
  balance: number;
  flagged: boolean;
}

export interface KarigarLedger {
  metalBalances: MetalBalanceRow[];
  outstandingJobs: OutstandingJobRow[];
  wastage: WastageRow[];
  completedJobsValue: number;
  totalPaid: number;
  payments: any[];
}

function daysBetween(from: string) {
  return Math.floor((Date.now() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

export async function fetchKarigarLedger(karigarId: string): Promise<KarigarLedger> {
  const [orderItemsRes, repairItemsRes, paymentsRes, accrualsRes] = await Promise.all([
    supabase.from("order_items").select("*, orders(order_no)").eq("karigar_id", karigarId),
    supabase.from("repair_items").select("*, repairs(repair_no, received_at)").eq("karigar_id", karigarId),
    supabase.from("karigar_payments").select("*").eq("karigar_id", karigarId).order("payment_date", { ascending: false }),
    supabase.from("karigar_accruals").select("amount").eq("karigar_id", karigarId),
  ]);

  const orderItems = orderItemsRes.data ?? [];
  const repairItems = repairItemsRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const accruals = accrualsRes.data ?? [];

  // Multi-batch receipts, needed to net out partial receiving against issued weight.
  const orderItemIds = orderItems.map((o: any) => o.id);
  let receiptsByItem: Record<string, number> = {};
  if (orderItemIds.length) {
    const { data: receipts } = await supabase.from("order_item_receipts").select("order_item_id, received_gross_weight").in("order_item_id", orderItemIds);
    for (const r of receipts ?? []) {
      receiptsByItem[r.order_item_id] = (receiptsByItem[r.order_item_id] ?? 0) + Number(r.received_gross_weight ?? 0);
    }
  }

  const balanceByMetal: Record<string, { grams: number; jobs: number }> = {};
  const outstandingJobs: OutstandingJobRow[] = [];
  const wastage: WastageRow[] = [];

  const OPEN_ORDER_STATUSES = new Set(["pending", "assigned", "in_progress"]);
  const CLOSED_ORDER_STATUSES = new Set(["received", "in_stock", "billed"]);

  for (const o of orderItems as any[]) {
    const received = receiptsByItem[o.id] ?? Number(o.received_net_weight ?? 0);
    const issued = Number(o.issued_gross_weight ?? 0);
    const allowance = o.karigar_wastage_grams != null
      ? Number(o.karigar_wastage_grams)
      : wastageGrams(o.karigar_wastage_type ?? o.wastage_type, Number(o.karigar_wastage_value ?? o.wastage_input ?? 0), issued);

    if (o.issued_at && OPEN_ORDER_STATUSES.has(o.status)) {
      const outstanding = round2(issued - received);
      if (outstanding > 0.001) {
        const metal = o.issued_metal ?? o.metal;
        balanceByMetal[metal] = balanceByMetal[metal] ?? { grams: 0, jobs: 0 };
        balanceByMetal[metal].grams += outstanding;
        balanceByMetal[metal].jobs += 1;
        outstandingJobs.push({
          type: "order", id: o.id, refId: o.order_id, refNo: o.orders?.order_no ?? "—",
          description: o.description, metal, outstandingWeight: outstanding,
          heldSince: o.issued_at, daysHeld: daysBetween(o.issued_at),
        });
      }
    }

    if (o.issued_at && CLOSED_ORDER_STATUSES.has(o.status) && issued > 0) {
      const balance = metalOwed(issued, received, allowance);
      wastage.push({
        type: "order", refNo: o.orders?.order_no ?? "—", description: o.description,
        issued, received, allowance, balance, flagged: balance > 0.001,
      });
    }
  }

  for (const r of repairItems as any[]) {
    if (r.status !== "delivered" && r.status !== "ready") {
      const outstanding = Number(r.net_weight_in ?? 0);
      if (outstanding > 0.001) {
        balanceByMetal[r.metal] = balanceByMetal[r.metal] ?? { grams: 0, jobs: 0 };
        balanceByMetal[r.metal].grams += outstanding;
        balanceByMetal[r.metal].jobs += 1;
        const heldSince = r.repairs?.received_at ?? r.created_at;
        outstandingJobs.push({
          type: "repair", id: r.id, refId: r.repair_id, refNo: r.repairs?.repair_no ?? "—",
          description: r.item_description, metal: r.metal,
          outstandingWeight: outstanding, heldSince, daysHeld: daysBetween(heldSince),
        });
      }
    }

    if (r.net_weight_out != null) {
      const issued = Number(r.net_weight_in ?? 0);
      const received = Number(r.net_weight_out ?? 0);
      const balance = round2(issued - received);
      wastage.push({
        type: "repair", refNo: r.repairs?.repair_no ?? "—", description: r.item_description,
        issued, received, allowance: 0, balance, flagged: balance > 0.001,
      });
    }
  }

  const metalBalances: MetalBalanceRow[] = Object.entries(balanceByMetal).map(([metal, v]) => ({
    metal, outstandingGrams: round2(v.grams), jobCount: v.jobs,
  }));
  outstandingJobs.sort((a, b) => b.daysHeld - a.daysHeld);

  const totalPaid = round2((payments as any[]).reduce((s, p) => s + Number(p.amount ?? 0), 0));
  const completedJobsValue = round2((accruals as any[]).reduce((s, a) => s + Number(a.amount ?? 0), 0));

  return { metalBalances, outstandingJobs, wastage, completedJobsValue, totalPaid, payments };
}

/** Shop-wide outstanding metal across every karigar, for the dashboard summary tile. */
export async function fetchShopWideKarigarMetal(): Promise<{ totalGrams: number; karigarCount: number; overdueCount: number }> {
  const [orderItemsRes, repairItemsRes] = await Promise.all([
    supabase.from("order_items").select("id, karigar_id, issued_at, issued_gross_weight, received_gross_weight, status").not("karigar_id", "is", null),
    supabase.from("repair_items").select("id, karigar_id, net_weight_in, status, created_at").not("karigar_id", "is", null),
  ]);

  const openOrderStatuses = new Set(["pending", "assigned", "in_progress"]);
  const orderItems = (orderItemsRes.data ?? []).filter((o: any) => o.issued_at && openOrderStatuses.has(o.status));
  const orderItemIds = orderItems.map((o: any) => o.id);
  let receiptsByItem: Record<string, number> = {};
  if (orderItemIds.length) {
    const { data: receipts } = await supabase.from("order_item_receipts").select("order_item_id, received_gross_weight").in("order_item_id", orderItemIds);
    for (const r of receipts ?? []) receiptsByItem[r.order_item_id] = (receiptsByItem[r.order_item_id] ?? 0) + Number(r.received_gross_weight ?? 0);
  }

  const karigarSet = new Set<string>();
  let totalGrams = 0;
  let overdueCount = 0;

  for (const o of orderItems as any[]) {
    const outstanding = Number(o.issued_gross_weight ?? 0) - (receiptsByItem[o.id] ?? Number(o.received_gross_weight ?? 0));
    if (outstanding > 0.001) {
      totalGrams += outstanding;
      karigarSet.add(o.karigar_id);
      if (daysBetween(o.issued_at) > 14) overdueCount += 1;
    }
  }

  for (const r of (repairItemsRes.data ?? []) as any[]) {
    if (r.status !== "delivered" && r.status !== "ready" && Number(r.net_weight_in ?? 0) > 0.001) {
      totalGrams += Number(r.net_weight_in ?? 0);
      karigarSet.add(r.karigar_id);
      if (daysBetween(r.created_at) > 14) overdueCount += 1;
    }
  }

  return { totalGrams: round2(totalGrams), karigarCount: karigarSet.size, overdueCount };
}
