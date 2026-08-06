import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { npr } from "@/lib/format";
import { openPrintPreview } from "@/components/PrintPreview";
import { escapeHtml } from "@/lib/html";

import { Printer, Undo2, Receipt } from "lucide-react";

const REFUND_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"];

interface ReturnLine {
  itemId: string;
  selected: boolean;
  disposition: "restock" | "new_inventory";
  refundAmount: number;
}

/**
 * Return item(s) — or the whole sale — from an invoice. Refund values default to each
 * line's proportional share of the final bill, so discounts, taxes and old-gold credit
 * are spread across the returned lines instead of refunding the gross line total.
 */
export function ReturnItemsDialog({ open, onOpenChange, invoice, items, userId, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: any;
  items: any[];
  userId: string | null;
  onDone: () => void;
}) {
  const returnable = items.filter((i) => !i.returned_at);
  const [lines, setLines] = useState<Record<string, ReturnLine>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [printTargets, setPrintTargets] = useState<any[]>([]);
  const [receipt, setReceipt] = useState<any>(null);

  // Old gold trade-in linked to this sale
  const oldGoldCredit = Number(invoice?.old_gold_credit ?? 0);
  const [og, setOg] = useState<{ id: string | null; metal: string; fineWeight: number; derived: boolean }>(
    { id: null, metal: "gold", fineWeight: 0, derived: true },
  );
  const [ogMode, setOgMode] = useState<"metal" | "revalue">("metal");
  const [ogRate, setOgRate] = useState<number>(0);
  const [taxWithheld, setTaxWithheld] = useState<number>(0);
  const [taxEdited, setTaxEdited] = useState(false);

  const taxTotal = Number(invoice?.vat_amount ?? 0) + Number(invoice?.sd_tax ?? 0) + Number(invoice?.luxury_tax ?? 0);

  // Goods value of the bill: final total with taxes and old gold credit added back,
  // so both are settled once, explicitly, instead of hiding inside the line share.
  const factor = useMemo(() => {
    const gross = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
    const goods = Number(invoice?.total ?? 0) + taxTotal + oldGoldCredit;
    if (!gross || !goods) return 1;
    return Math.max(0, Math.min(1.5, goods / gross));
  }, [invoice, items]);

  function proportional(it: any) {
    return Math.round((Number(it.line_total) || 0) * factor * 100) / 100;
  }

  useEffect(() => {
    if (!open) return;
    setReason(""); setRefundMethod("cash"); setPrintTargets([]); setReceipt(null);
    setOgMode("metal"); setTaxEdited(false);
    const init: Record<string, ReturnLine> = {};
    for (const it of returnable) {
      init[it.id] = { itemId: it.id, selected: false, disposition: "restock", refundAmount: proportional(it) };
    }
    setLines(init);
  }, [open]);

  // Resolve the traded-in metal / fine weight for the old gold settlement panel.
  useEffect(() => {
    if (!open || !invoice?.id || oldGoldCredit <= 0) return;
    (async () => {
      const [{ data: purchases }, rates] = await Promise.all([
        supabase.from("old_gold_purchases").select("id, metal, fine_weight, rate_per_gram, total_amount, notes").eq("linked_invoice_id", invoice.id),
        fetchLatestFineRates(),
      ]);
      const rows = (purchases ?? []) as any[];
      if (rows.length) {
        const metal = rows[0].metal ?? "gold";
        const fine = rows.reduce((s, r) => s + (Number(r.fine_weight) || 0), 0);
        setOg({ id: rows.length === 1 ? rows[0].id : null, metal, fineWeight: fine, derived: false });
        setOgRate(Number(rows[0].rate_per_gram) || 0);
      } else {
        const metal = "gold";
        const rate = billFineRate(items, metal, rates);
        setOg({ id: null, metal, fineWeight: fineEquivalentGrams(oldGoldCredit, rate) || 0, derived: true });
        setOgRate(rate);
      }
    })();
  }, [open, invoice?.id]);

  const selectedLines = Object.values(lines).filter((l) => l.selected);
  const goodsRefund = selectedLines.reduce((s, l) => s + (Number(l.refundAmount) || 0), 0);
  const allSelected = returnable.length > 0 && selectedLines.length === returnable.length;
  const fullReturn = allSelected && returnable.length === items.length;

  // Default tax withheld = returned lines' share of every tax on the bill.
  const defaultTax = useMemo(() => {
    const gross = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
    const sel = selectedLines.reduce((s, l) => s + (Number(items.find((i) => i.id === l.itemId)?.line_total) || 0), 0);
    if (!gross || !taxTotal) return 0;
    return Math.round((taxTotal * sel / gross) * 100) / 100;
  }, [selectedLines, items, taxTotal]);

  useEffect(() => { if (!taxEdited) setTaxWithheld(defaultTax); }, [defaultTax, taxEdited]);

  const ogRevalued = Math.round((og.fineWeight * (Number(ogRate) || 0)) * 100) / 100;
  const showOgPanel = oldGoldCredit > 0 && fullReturn;
  const ogDeduction = showOgPanel ? (ogMode === "metal" ? oldGoldCredit : ogRevalued) : 0;
  const totalRefund = Math.max(0, Math.round((goodsRefund - (Number(taxWithheld) || 0) - ogDeduction) * 100) / 100);


  function patch(id: string, p: Partial<ReturnLine>) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  function toggleAll(v: boolean) {
    setLines((prev) => {
      const next: Record<string, ReturnLine> = {};
      for (const [k, l] of Object.entries(prev)) next[k] = { ...l, selected: v };
      return next;
    });
  }

  async function confirm() {
    if (!invoice) return;
    if (selectedLines.length === 0) return toast.error("Select at least one item to return");
    setBusy(true);
    try {
      const paid = Number(invoice.amount_paid ?? 0);
      const refundAmt = Math.min(totalRefund, paid);
      const creditReleased = Math.max(0, totalRefund - refundAmt);

      if (refundAmt > 0) {
        const { error } = await supabase.from("payments").insert({
          invoice_id: invoice.id, customer_id: invoice.customer_id,
          amount: -refundAmt, method: refundMethod as any,
          reference: "Sales return refund", notes: reason || null, created_by: userId,
        } as any);
        if (error) throw error;
      }

      const createdInventory: any[] = [];
      const receiptLines: any[] = [];

      for (const line of selectedLines) {
        const it = items.find((i) => i.id === line.itemId);
        if (!it) continue;

        let newInvItemId: string | null = null;

        if (line.disposition === "restock") {
          if (it.inventory_item_id) {
            // Same piece, same SKU/code — simply put it back on the shelf.
            await supabase.from("inventory_items").update({ status: "in_stock" }).eq("id", it.inventory_item_id);
            const { data: inv } = await supabase.from("inventory_items").select("id, sku, name").eq("id", it.inventory_item_id).single();
            if (inv) createdInventory.push(inv);
          } else {
            const sku = `RET-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
            const { data: created, error: cErr } = await supabase.from("inventory_items").insert({
              sku, name: it.description ?? "Returned item",
              metal: (it.metal ?? "gold") as any, purity: it.purity ?? "22K",
              gross_weight: Number(it.gross_weight ?? it.weight ?? 0), stone_weight: Number(it.stone_weight ?? 0),
              net_weight: Number(it.weight ?? 0), fine_weight: Number(it.weight ?? 0),
              making_charge: Number(it.making_input ?? 0), making_charge_type: it.making_type ?? "per_gram",
              wastage_type: (it.wastage_type ?? "percentage") as any, wastage_value: Number(it.wastage_input ?? 0),
              stone_value: Number(it.stone_value ?? 0), status: "in_stock" as any,
              received_from: `Returned from invoice ${invoice.invoice_number}`, created_by: userId,
            } as any).select("id, sku, name").single();
            if (cErr) throw cErr;
            newInvItemId = created.id;
            createdInventory.push(created);
          }
        } else {
          // Treat as raw material: always a fresh listing. Retire the original piece if one existed.
          if (it.inventory_item_id) {
            await supabase.from("inventory_items").update({ status: "melted" }).eq("id", it.inventory_item_id);
          }
          const sku = `RTM-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
          const { data: created, error: cErr } = await supabase.from("inventory_items").insert({
            sku, name: `${it.description ?? "Item"} (raw material)`,
            metal: (it.metal ?? "gold") as any, purity: it.purity ?? "22K",
            gross_weight: Number(it.gross_weight ?? it.weight ?? 0), stone_weight: Number(it.stone_weight ?? 0),
            net_weight: Number(it.weight ?? 0), fine_weight: Number(it.weight ?? 0),
            making_charge: 0, making_charge_type: "per_gram",
            wastage_type: "percentage" as any, wastage_value: 0, stone_value: 0,
            status: "in_stock" as any, received_from: `Returned as raw material — invoice ${invoice.invoice_number}`,
            created_by: userId,
          } as any).select("id, sku, name").single();
          if (cErr) throw cErr;
          newInvItemId = created.id;
          createdInventory.push(created);
        }

        await supabase.from("invoice_items").update({
          returned_at: new Date().toISOString(),
          return_disposition: line.disposition,
          return_reason: reason || null,
          refund_amount: line.refundAmount,
          new_inventory_item_id: newInvItemId,
        }).eq("id", it.id);

        receiptLines.push({
          description: it.description, metal: it.metal, purity: it.purity,
          weight: Number(it.weight ?? 0), gross: Number(it.line_total ?? 0),
          refund: Number(line.refundAmount) || 0,
          disposition: line.disposition,
        });
      }

      const newTotal = Math.max(0, Number(invoice.total) - totalRefund);
      const newPaid = Math.max(0, paid - refundAmt);
      const newBalance = Math.max(0, newTotal - newPaid);
      const fullReturn = selectedLines.length === returnable.length;
      await supabase.from("invoices").update({
        total: newTotal, amount_paid: newPaid, balance_due: newBalance,
        status: fullReturn && newTotal === 0 ? "refunded" : newBalance > 0 ? "partial" : newPaid > 0 ? "paid" : "refunded",
      } as any).eq("id", invoice.id);

      if (invoice.customer_id) {
        const { data: c } = await supabase.from("customers").select("balance").eq("id", invoice.customer_id).maybeSingle();
        const delta = Math.max(0, Number(invoice.balance_due) - newBalance);
        if (delta > 0) await supabase.from("customers").update({ balance: Math.max(0, Number(c?.balance ?? 0) - delta) }).eq("id", invoice.customer_id);
      }

      toast.success(`${selectedLines.length} item(s) returned`);
      setReceipt({
        invoiceNumber: invoice.invoice_number,
        customer: invoice.customers?.full_name ?? "",
        at: new Date(),
        lines: receiptLines,
        totalRefund, cashRefund: refundAmt, creditReleased,
        method: refundMethod, reason,
        factor,
      });
      setPrintTargets(createdInventory);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  if (receipt) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Return complete</DialogTitle>
            <DialogDescription>Print the refund receipt and, if needed, tags for the returned item(s).</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="rounded border p-3 text-sm">
              <div className="flex justify-between"><span>Refund total</span><span className="font-medium">{npr(receipt.totalRefund)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>Cash / method refund</span><span>{npr(receipt.cashRefund)}</span></div>
              {receipt.creditReleased > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground"><span>Credit written off</span><span>{npr(receipt.creditReleased)}</span></div>
              )}
              <Button size="sm" className="mt-3 w-full" onClick={() => printRefundReceipt(receipt)}>
                <Receipt className="mr-1 h-3.5 w-3.5" /> Print refund receipt
              </Button>
            </div>
            {printTargets.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <div><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.sku}</div></div>
                <Button size="sm" variant="outline" onClick={() => printTag(t)}><Printer className="mr-1 h-3.5 w-3.5" /> Print Tag</Button>
              </div>
            ))}
          </div>
          <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5" /> Sales return — {invoice?.invoice_number}</DialogTitle>
          <DialogDescription>
            Return single items or the whole sale. Refunds default to each line's share of the final bill
            {factor < 1 ? ` (${Math.round((1 - factor) * 1000) / 10}% discount/credit applied proportionally)` : ""}.
          </DialogDescription>
        </DialogHeader>

        {returnable.length === 0 ? (
          <p className="text-sm text-muted-foreground">All items on this invoice have already been returned.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded border p-2">
              <Checkbox id="allsel" checked={allSelected} onCheckedChange={(v) => toggleAll(!!v)} />
              <Label htmlFor="allsel" className="text-sm">Return the complete sale ({returnable.length} item{returnable.length > 1 ? "s" : ""})</Label>
            </div>
            {returnable.map((it) => {
              const line = lines[it.id];
              if (!line) return null;
              const gross = Number(it.line_total) || 0;
              return (
                <div key={it.id} className="rounded border p-3">
                  <div className="flex items-start gap-2">
                    <Checkbox checked={line.selected} onCheckedChange={(v) => patch(it.id, { selected: !!v })} className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{it.description}</div>
                        <div className="text-sm">{npr(gross)}</div>
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {it.metal} {it.purity} · {Number(it.weight).toFixed(3)}g {it.inventory_item_id ? "· linked to inventory" : "· not linked to inventory"}
                        {factor !== 1 && ` · share of bill ${npr(proportional(it))}`}
                      </div>

                      {line.selected && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Disposition</Label>
                            <Select value={line.disposition} onValueChange={(v: any) => patch(it.id, { disposition: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="restock">Return to inventory with same code/details</SelectItem>
                                <SelectItem value="new_inventory">Treat as raw material — list as new item</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Refund amount</Label>
                            <Input type="number" value={line.refundAmount} onChange={(e) => patch(it.id, { refundAmount: Number(e.target.value) || 0 })} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {selectedLines.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Refund via</Label>
                    <Select value={refundMethod} onValueChange={setRefundMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{REFUND_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col items-end justify-end gap-1">
                    <Badge variant="outline">Total refund: {npr(totalRefund)}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      Cash back {npr(Math.min(totalRefund, Number(invoice?.amount_paid ?? 0)))} · credit adjusted {npr(Math.max(0, totalRefund - Number(invoice?.amount_paid ?? 0)))}
                    </span>
                  </div>
                </div>
                <div><Label className="text-xs">Reason</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer changed mind, defect..." /></div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={busy || selectedLines.length === 0}>{busy ? "Processing..." : `Return ${selectedLines.length || ""} Item(s)`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function printRefundReceipt(r: any) {
  const rows = r.lines.map((l: any) => `
    <tr>
      <td>${escapeHtml(l.description ?? "")}<div class="sub">${escapeHtml(`${l.metal ?? ""} ${l.purity ?? ""}`.trim())} · ${Number(l.weight).toFixed(3)}g · ${l.disposition === "restock" ? "back to stock" : "raw material"}</div></td>
      <td class="r">${escapeHtml(npr(l.gross))}</td>
      <td class="r">${escapeHtml(npr(l.refund))}</td>
    </tr>`).join("");

  openPrintPreview({
    title: `Refund receipt — ${r.invoiceNumber}`,
    fileName: `Refund-${r.invoiceNumber}`,
    html: `
      <div class="doc">
        <h1>Refund / Sales Return Receipt</h1>
        <div class="meta">
          <div>Against invoice: <b>${escapeHtml(r.invoiceNumber)}</b></div>
          <div>Customer: ${escapeHtml(r.customer || "-")}</div>
          <div>Date: ${escapeHtml(r.at.toLocaleString())}</div>
        </div>
        <table>
          <thead><tr><th>Returned item</th><th class="r">Bill value</th><th class="r">Refund</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td class="r" colspan="2">Total refund</td><td class="r"><b>${escapeHtml(npr(r.totalRefund))}</b></td></tr>
            <tr><td class="r" colspan="2">Paid back (${escapeHtml(String(r.method).replace("_", " "))})</td><td class="r">${escapeHtml(npr(r.cashRefund))}</td></tr>
            ${r.creditReleased > 0 ? `<tr><td class="r" colspan="2">Adjusted against outstanding credit</td><td class="r">${escapeHtml(npr(r.creditReleased))}</td></tr>` : ""}
          </tfoot>
        </table>
        ${r.factor !== 1 ? `<p class="note">Refunds are computed on each item's proportional share of the final bill, after discount and credits (${Math.round(r.factor * 10000) / 100}% of gross line value).</p>` : ""}
        ${r.reason ? `<p class="note">Reason: ${escapeHtml(r.reason)}</p>` : ""}
        <div class="sign"><div>Customer signature</div><div>Authorised signature</div></div>
      </div>`,
    css: `.doc{font-family:system-ui,sans-serif;font-size:12px;color:#111;}
      h1{font-size:16px;margin:0 0 6mm;text-align:center;letter-spacing:.5px;}
      .meta{display:flex;justify-content:space-between;font-size:11px;margin-bottom:4mm;}
      table{width:100%;border-collapse:collapse;}
      th,td{border:1px solid #999;padding:2mm 2.5mm;text-align:left;vertical-align:top;}
      th{background:#f2f2f2;font-size:11px;}
      .r{text-align:right;}
      .sub{font-size:9px;color:#666;margin-top:1mm;}
      .note{font-size:10px;color:#555;margin-top:4mm;}
      .sign{display:flex;justify-content:space-between;margin-top:18mm;font-size:10px;color:#444;}`,
  });
}

function printTag(item: { sku: string; name: string }) {
  openPrintPreview({
    title: `Tag ${item.sku}`,
    html: `<div class="tag"><div class="name">${escapeHtml(item.name)}</div><div class="sku">${escapeHtml(item.sku)}</div></div>`,
    fileName: `Tag-${item.sku}`,
    page: "tag",
    hidePageNumbers: true,
    css: `.tag{border:1px dashed #999;padding:6mm;}
      .name{font-size:11px;font-weight:600;}
      .sku{font-size:9px;color:#555;margin-top:2mm;}`,
  });
}
