import { supabase } from "@/integrations/supabase/client";

/** Move inventory items between in_stock and reserved for quotation holds. */
export async function setItemsStatus(ids: (string | null | undefined)[], status: "reserved" | "in_stock") {
  const clean = ids.filter(Boolean) as string[];
  if (!clean.length) return;
  await supabase.from("inventory_items").update({ status }).in("id", clean);
}

export async function reserveQuotationItems(ids: (string | null | undefined)[]) {
  await setItemsStatus(ids, "reserved");
}

export async function releaseQuotationItems(ids: (string | null | undefined)[]) {
  await setItemsStatus(ids, "in_stock");
}

/** Item ids currently attached to a quotation. */
export async function quotationItemIds(quotationId: string): Promise<string[]> {
  const { data } = await supabase.from("quotation_items").select("inventory_item_id").eq("quotation_id", quotationId);
  return (data ?? []).map((r) => r.inventory_item_id).filter(Boolean) as string[];
}

/**
 * Mark quotations past their validity date as expired and release their reserved stock.
 * Runs on quotation list / dashboard load — cheap and immediate.
 */
export async function sweepExpiredQuotations(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("quotations")
    .select("id")
    .in("status", ["draft", "sent"])
    .not("valid_until", "is", null)
    .lt("valid_until", today);
  const ids = (data ?? []).map((q) => q.id);
  if (!ids.length) return 0;

  const { data: lines } = await supabase.from("quotation_items").select("inventory_item_id").in("quotation_id", ids);
  await releaseQuotationItems((lines ?? []).map((l) => l.inventory_item_id));
  await supabase.from("quotations").update({ status: "expired" }).in("id", ids);
  return ids.length;
}

/** Delete a quotation, its lines, and release any stock it was holding. */
export async function deleteQuotation(quotationId: string) {
  const ids = await quotationItemIds(quotationId);
  await supabase.from("quotation_items").delete().eq("quotation_id", quotationId);
  const { error } = await supabase.from("quotations").delete().eq("id", quotationId);
  if (error) throw error;
  await releaseQuotationItems(ids);
}

export interface PendingQuotationStats {
  count: number;
  value: number;
  expiringSoon: number;
}

export async function pendingQuotationStats(): Promise<PendingQuotationStats> {
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase.from("quotations").select("total, valid_until").in("status", ["draft", "sent"]);
  const rows = data ?? [];
  return {
    count: rows.length,
    value: rows.reduce((a, r) => a + Number(r.total ?? 0), 0),
    expiringSoon: rows.filter((r) => r.valid_until && String(r.valid_until) <= soon).length,
  };
}
