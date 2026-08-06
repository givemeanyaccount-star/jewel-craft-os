import { useEffect, useState } from "react";
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

import { Printer, Undo2 } from "lucide-react";

const REFUND_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"];

interface ReturnLine {
  itemId: string;
  selected: boolean;
  disposition: "restock" | "new_inventory";
  refundAmount: number;
}

/**
 * Return specific item(s) from an otherwise-valid invoice. The rest of the invoice
 * stays intact; only the selected line(s) are reversed. For each returned item, staff
 * chooses whether it goes back to inventory as-is (offering a tag re-print) or is
 * treated as raw material and listed as a brand-new inventory item.
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

  useEffect(() => {
    if (!open) return;
    setReason(""); setRefundMethod("cash"); setPrintTargets([]);
    const init: Record<string, ReturnLine> = {};
    for (const it of returnable) {
      init[it.id] = { itemId: it.id, selected: false, disposition: "restock", refundAmount: Number(it.line_total) || 0 };
    }
    setLines(init);
  }, [open]);

  const selectedLines = Object.values(lines).filter((l) => l.selected);
  const totalRefund = selectedLines.reduce((s, l) => s + (Number(l.refundAmount) || 0), 0);

  function patch(id: string, p: Partial<ReturnLine>) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  async function confirm() {
    if (!invoice) return;
    if (selectedLines.length === 0) return toast.error("Select at least one item to return");
    setBusy(true);
    try {
      const paid = Number(invoice.amount_paid ?? 0);
      const refundAmt = Math.min(totalRefund, paid);

      if (refundAmt > 0) {
        const { error } = await supabase.from("payments").insert({
          invoice_id: invoice.id, customer_id: invoice.customer_id,
          amount: -refundAmt, method: refundMethod as any,
          reference: "Partial return refund", notes: reason || null, created_by: userId,
        } as any);
        if (error) throw error;
      }

      const createdInventory: any[] = [];

      for (const line of selectedLines) {
        const it = items.find((i) => i.id === line.itemId);
        if (!it) continue;

        let newInvItemId: string | null = null;

        if (line.disposition === "restock") {
          if (it.inventory_item_id) {
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
              stone_value: Number(it.stone_value ?? 0), status: "returned" as any,
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
            status: "returned" as any, received_from: `Returned as raw material — invoice ${invoice.invoice_number}`,
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
      }

      const newTotal = Math.max(0, Number(invoice.total) - totalRefund);
      const newPaid = Math.max(0, paid - refundAmt);
      const newBalance = Math.max(0, newTotal - newPaid);
      await supabase.from("invoices").update({
        total: newTotal, amount_paid: newPaid, balance_due: newBalance,
        status: newBalance > 0 ? "partial" : newPaid > 0 ? "paid" : "refunded",
      } as any).eq("id", invoice.id);

      if (invoice.customer_id) {
        const { data: c } = await supabase.from("customers").select("balance").eq("id", invoice.customer_id).maybeSingle();
        const delta = Math.max(0, Number(invoice.balance_due) - newBalance);
        if (delta > 0) await supabase.from("customers").update({ balance: Math.max(0, Number(c?.balance ?? 0) - delta) }).eq("id", invoice.customer_id);
      }

      toast.success(`${selectedLines.length} item(s) returned`);
      setPrintTargets(createdInventory);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  if (printTargets.length > 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Return complete</DialogTitle><DialogDescription>Print tags for the returned item(s) now, or later from Inventory / Tag Print.</DialogDescription></DialogHeader>
          <div className="space-y-2">
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
          <DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5" /> Return item(s) — {invoice?.invoice_number}</DialogTitle>
          <DialogDescription>Only the items you select are reversed. The rest of the invoice stays as-is.</DialogDescription>
        </DialogHeader>

        {returnable.length === 0 ? (
          <p className="text-sm text-muted-foreground">All items on this invoice have already been returned.</p>
        ) : (
          <div className="space-y-3">
            {returnable.map((it) => {
              const line = lines[it.id];
              if (!line) return null;
              return (
                <div key={it.id} className="rounded border p-3">
                  <div className="flex items-start gap-2">
                    <Checkbox checked={line.selected} onCheckedChange={(v) => patch(it.id, { selected: !!v })} className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{it.description}</div>
                        <div className="text-sm">{npr(it.line_total)}</div>
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">{it.metal} {it.purity} · {Number(it.weight).toFixed(3)}g {it.inventory_item_id ? "· linked to inventory" : "· not linked to inventory"}</div>

                      {line.selected && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Disposition</Label>
                            <Select value={line.disposition} onValueChange={(v: any) => patch(it.id, { disposition: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="restock">Return to inventory as-is (offer tag print)</SelectItem>
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
                  <div className="flex items-end justify-end">
                    <Badge variant="outline">Total refund: {npr(totalRefund)}</Badge>
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

function printTag(item: { sku: string; name: string }) {
  openPrintPreview({
    title: `Tag ${item.sku}`,
    html: `<div class="tag"><div class="name">${item.name}</div><div class="sku">${item.sku}</div></div>`,
    css: `body{font-family:sans-serif;margin:0;padding:8mm;}
      .tag{border:1px dashed #999;padding:6mm;width:60mm;}
      .name{font-size:11px;font-weight:600;}
      .sku{font-size:9px;color:#555;margin-top:2mm;}
      @page{size:auto;margin:5mm;}`,
  });
}

