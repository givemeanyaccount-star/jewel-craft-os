import { supabase } from "@/integrations/supabase/client";
import type { CreditNoteLine } from "@/components/returns/CreditNote";

export type Disposition = "restock" | "new_inventory";
export type ReturnStatus = "draft" | "processed" | "voided";

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface RefundCalc {
  gross: number;
  discount: number;
  taxRetained: number;
  total: number;
}

/** Pro-rata refund maths: discount ratio applied per line, tax retained in full. */
export function refundCalc(
  selected: any[],
  opts: { discountRatio: number; taxTotal: number; grossAll: number }
): RefundCalc {
  const gross = selected.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
  const discount = round2(gross * opts.discountRatio);
  const taxRetained = opts.grossAll > 0 ? round2(opts.taxTotal * (gross / opts.grossAll)) : 0;
  return { gross: round2(gross), discount, taxRetained, total: round2(gross - discount) };
}

export function lineNet(lineTotal: number, discountRatio: number) {
  const original = round2(Number(lineTotal) || 0);
  const discount = round2(original * discountRatio);
  return { original, discount, net: round2(original - discount) };
}

export function creditNoteNumberFor(seq?: number) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const tail = seq ?? Math.floor(Math.random() * 9000 + 1000);
  return `CN-${ymd}-${String(tail).padStart(4, "0")}`;
}

export interface DraftPayload {
  id?: string | null;
  invoiceId: string;
  customerId: string | null;
  method: string;
  reason: string;
  calc: RefundCalc;
  userId?: string | null;
  lines: {
    invoice_item_id: string;
    description: string;
    purity: string | null;
    qty: number;
    original: number;
    discount: number;
    net: number;
    disposition: Disposition;
    inventory_item_id: string | null;
  }[];
}

/** Create or update the draft record for the in-progress return. Returns the draft id. */
export async function saveDraft(p: DraftPayload): Promise<string> {
  const row = {
    invoice_id: p.invoiceId,
    customer_id: p.customerId,
    method: p.method,
    reason: p.reason || null,
    gross: p.calc.gross,
    discount: p.calc.discount,
    tax_retained: p.calc.taxRetained,
    total: p.calc.total,
    status: "draft" as const,
  };

  let id = p.id ?? null;
  if (id) {
    const { error } = await supabase.from("sales_returns").update(row).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("sales_returns")
      .insert({ ...row, created_by: p.userId ?? null })
      .select("id")
      .single();
    if (error) throw error;
    id = data.id;
  }

  await supabase.from("sales_return_items").delete().eq("return_id", id!);
  if (p.lines.length) {
    const { error } = await supabase
      .from("sales_return_items")
      .insert(p.lines.map((l) => ({ ...l, return_id: id! })));
    if (error) throw error;
  }
  return id!;
}

export async function discardDraft(id: string) {
  await supabase.from("sales_return_items").delete().eq("return_id", id);
  const { error } = await supabase.from("sales_returns").delete().eq("id", id);
  if (error) throw error;
}

export interface ProcessArgs {
  draftId: string | null;
  invoice: any;
  selected: any[];
  dispositions: Record<string, Disposition>;
  calc: RefundCalc;
  discountRatio: number;
  method: string;
  reason: string;
  userId?: string | null;
  returnableCount: number;
  itemCount: number;
}

export interface ProcessResult {
  returnId: string;
  number: string;
  noteLines: CreditNoteLine[];
}

/** Persist the return: restock, refund payment, invoice + customer balances, credit note record. */
export async function processReturn(a: ProcessArgs): Promise<ProcessResult> {
  const { invoice, selected, calc, method, reason, userId } = a;
  const number = creditNoteNumberFor();
  const paid = Number(invoice.amount_paid ?? 0);
  const refundAmt = Math.min(calc.total, paid);

  if (refundAmt > 0) {
    const { error } = await supabase.from("payments").insert({
      invoice_id: invoice.id,
      customer_id: invoice.customer_id,
      amount: -refundAmt,
      method: method as any,
      reference: number,
      notes: reason || null,
      created_by: userId ?? null,
    } as any);
    if (error) throw error;
  }

  const noteLines: CreditNoteLine[] = [];
  const returnItems: any[] = [];

  for (const it of selected) {
    const disposition = a.dispositions[it.id] ?? "restock";
    const { original, discount, net } = lineNet(it.line_total, a.discountRatio);
    let newInvItemId: string | null = null;

    if (disposition === "restock" && it.inventory_item_id) {
      await supabase.from("inventory_items").update({ status: "in_stock" as any }).eq("id", it.inventory_item_id);
    } else {
      const prefix = disposition === "restock" ? "RET" : "RTM";
      if (disposition !== "restock" && it.inventory_item_id) {
        await supabase.from("inventory_items").update({ status: "melted" as any }).eq("id", it.inventory_item_id);
      }
      const sku = `${prefix}-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
      const { data: created, error: cErr } = await supabase
        .from("inventory_items")
        .insert({
          sku,
          name: disposition === "restock" ? (it.description ?? "Returned item") : `${it.description ?? "Item"} (raw material)`,
          metal: (it.metal ?? "gold") as any,
          purity: it.purity ?? "22K",
          gross_weight: Number(it.gross_weight ?? it.weight ?? 0),
          stone_weight: Number(it.stone_weight ?? 0),
          net_weight: Number(it.weight ?? 0),
          fine_weight: Number(it.weight ?? 0),
          making_charge: disposition === "restock" ? Number(it.making_input ?? 0) : 0,
          making_charge_type: it.making_type ?? "per_gram",
          wastage_type: (disposition === "restock" ? (it.wastage_type ?? "percentage") : "percentage") as any,
          wastage_value: disposition === "restock" ? Number(it.wastage_input ?? 0) : 0,
          stone_value: disposition === "restock" ? Number(it.stone_value ?? 0) : 0,
          status: "in_stock" as any,
          received_from: `Sales return ${number} — invoice ${invoice.invoice_number}`,
          created_by: userId ?? null,
        } as any)
        .select("id")
        .single();
      if (cErr) throw cErr;
      newInvItemId = created.id;
    }

    const { error: uErr } = await supabase
      .from("invoice_items")
      .update({
        returned_at: new Date().toISOString(),
        return_disposition: disposition,
        return_reason: [number, reason].filter(Boolean).join(" · "),
        refund_amount: net,
        new_inventory_item_id: newInvItemId,
      })
      .eq("id", it.id);
    if (uErr) throw uErr;

    noteLines.push({ description: it.description ?? "Item", purity: it.purity, qty: Number(it.quantity ?? 1), original, discount, net });
    returnItems.push({
      invoice_item_id: it.id,
      description: it.description ?? "Item",
      purity: it.purity ?? null,
      qty: Number(it.quantity ?? 1),
      original,
      discount,
      net,
      disposition,
      inventory_item_id: it.inventory_item_id ?? null,
      new_inventory_item_id: newInvItemId,
    });
  }

  const newTotal = Math.max(0, round2(Number(invoice.total) - calc.total));
  const newPaid = Math.max(0, round2(paid - refundAmt));
  const newBalance = Math.max(0, round2(newTotal - newPaid));
  const allReturned = a.selected.length === a.returnableCount && a.returnableCount === a.itemCount;
  await supabase
    .from("invoices")
    .update({
      total: newTotal,
      amount_paid: newPaid,
      balance_due: newBalance,
      status: allReturned && newTotal === 0 ? "refunded" : newBalance > 0 ? "partial" : newPaid > 0 ? "paid" : "refunded",
    } as any)
    .eq("id", invoice.id);

  if (invoice.customer_id) {
    const { data: c } = await supabase.from("customers").select("balance").eq("id", invoice.customer_id).maybeSingle();
    const delta = Math.max(0, Number(invoice.balance_due ?? 0) - newBalance);
    if (delta > 0) {
      await supabase.from("customers").update({ balance: Math.max(0, Number(c?.balance ?? 0) - delta) }).eq("id", invoice.customer_id);
    }
  }

  // Promote the draft (or create the record outright) to processed
  const record = {
    invoice_id: invoice.id,
    customer_id: invoice.customer_id ?? null,
    credit_note_number: number,
    status: "processed" as const,
    method,
    reason: reason || null,
    gross: calc.gross,
    discount: calc.discount,
    tax_retained: calc.taxRetained,
    total: calc.total,
    refund_paid: refundAmt,
    processed_at: new Date().toISOString(),
    processed_by: userId ?? null,
  };

  let returnId = a.draftId ?? null;
  if (returnId) {
    const { error } = await supabase.from("sales_returns").update(record).eq("id", returnId);
    if (error) throw error;
    await supabase.from("sales_return_items").delete().eq("return_id", returnId);
  } else {
    const { data, error } = await supabase
      .from("sales_returns")
      .insert({ ...record, created_by: userId ?? null })
      .select("id")
      .single();
    if (error) throw error;
    returnId = data.id;
  }
  if (returnItems.length) {
    const { error } = await supabase
      .from("sales_return_items")
      .insert(returnItems.map((r) => ({ ...r, return_id: returnId! })));
    if (error) throw error;
  }

  return { returnId: returnId!, number, noteLines };
}

/** Reverse a processed return: stock, refund payment, invoice and customer balances. */
export async function voidReturn(returnId: string, opts: { userId?: string | null; reason?: string }) {
  const { data: rec, error } = await supabase.from("sales_returns").select("*").eq("id", returnId).maybeSingle();
  if (error) throw error;
  if (!rec) throw new Error("Return not found");
  if (rec.status !== "processed") throw new Error("Only a processed credit note can be voided");

  const { data: rItems } = await supabase.from("sales_return_items").select("*").eq("return_id", returnId);

  for (const r of rItems ?? []) {
    if (r.invoice_item_id) {
      await supabase
        .from("invoice_items")
        .update({
          returned_at: null,
          return_disposition: null,
          return_reason: null,
          refund_amount: null,
          new_inventory_item_id: null,
        })
        .eq("id", r.invoice_item_id);
    }
    if (r.new_inventory_item_id) {
      await supabase.from("inventory_items").delete().eq("id", r.new_inventory_item_id);
    }
    if (r.inventory_item_id) {
      await supabase.from("inventory_items").update({ status: "sold" as any }).eq("id", r.inventory_item_id);
    }
  }

  if (rec.credit_note_number) {
    await supabase.from("payments").delete().eq("invoice_id", rec.invoice_id).eq("reference", rec.credit_note_number);
  }

  const { data: inv } = await supabase.from("invoices").select("*").eq("id", rec.invoice_id).maybeSingle();
  if (inv) {
    const newTotal = round2(Number(inv.total) + Number(rec.total));
    const newPaid = round2(Number(inv.amount_paid) + Number(rec.refund_paid));
    const newBalance = Math.max(0, round2(newTotal - newPaid));
    await supabase
      .from("invoices")
      .update({
        total: newTotal,
        amount_paid: newPaid,
        balance_due: newBalance,
        status: (newBalance > 0 ? (newPaid > 0 ? "partial" : "issued") : "paid") as any,
      } as any)
      .eq("id", inv.id);

    if (inv.customer_id) {
      const { data: c } = await supabase.from("customers").select("balance").eq("id", inv.customer_id).maybeSingle();
      const delta = Math.max(0, newBalance - Number(inv.balance_due ?? 0));
      if (delta > 0) {
        await supabase.from("customers").update({ balance: round2(Number(c?.balance ?? 0) + delta) }).eq("id", inv.customer_id);
      }
    }
  }

  const { error: vErr } = await supabase
    .from("sales_returns")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: opts.userId ?? null,
      void_reason: opts.reason || null,
    })
    .eq("id", returnId);
  if (vErr) throw vErr;
}
