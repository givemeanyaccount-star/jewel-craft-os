/**
 * Removing a job bill.
 *
 * A finished order or repair sometimes needs its printed bill taken back —
 * wrong figures, a duplicate, a customer who wants it re-issued. Only the bill
 * document goes: the order/repair, its items and its history stay exactly as
 * they are, so the job can simply be billed again.
 *
 * Posted counter sales are never removed this way — those keep the
 * cancel-with-reason flow.
 */

import { supabase } from "@/integrations/supabase/client";
import { syncOrderStatus } from "@/lib/orders";

export interface JobBill {
  id: string;
  invoice_number: string;
  total: number;
  issued_at: string;
}

/** Bills raised against an order. */
export async function fetchOrderBills(orderId: string): Promise<JobBill[]> {
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, issued_at")
    .eq("order_id", orderId)
    .order("issued_at", { ascending: false });
  return (data ?? []) as JobBill[];
}

/**
 * Delete one order bill and put the goods back where they were before billing:
 * produced pieces return to reserved stock and the order lines become billable
 * again.
 */
export async function removeOrderBill(orderId: string, invoiceId: string) {
  const { data: lines } = await supabase
    .from("invoice_items").select("inventory_item_id").eq("invoice_id", invoiceId);
  const itemIds = (lines ?? []).map((l: any) => l.inventory_item_id).filter(Boolean);

  if (itemIds.length) {
    const { error } = await supabase
      .from("inventory_items").update({ status: "reserved" as any }).in("id", itemIds);
    if (error) throw error;
  }

  const back = await supabase.from("order_items")
    .update({ invoice_id: null, billed_qty: 0, status: "in_stock" as any })
    .eq("invoice_id", invoiceId);
  if (back.error) throw back.error;

  const rec = await supabase.from("order_item_receipts")
    .update({ invoice_id: null, status: "in_stock" as any })
    .eq("invoice_id", invoiceId);
  if (rec.error) throw rec.error;

  const pay = await supabase.from("payments").delete().eq("invoice_id", invoiceId);
  if (pay.error) throw pay.error;

  const li = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (li.error) throw li.error;

  const inv = await supabase.from("invoices").delete().eq("id", invoiceId).select("id");
  if (inv.error) throw inv.error;
  if (!inv.data?.length) throw new Error("Only an administrator can remove a posted bill.");

  await syncOrderStatus(orderId);
}

/**
 * Clear a delivered repair's final charges so the final receipt can be worked
 * out and printed again. The repair, its items and the work history are kept.
 */
export async function removeRepairBill(repairId: string) {
  const { error } = await supabase
    .from("repair_items").update({ final_cost: null }).eq("repair_id", repairId);
  if (error) throw error;
}
