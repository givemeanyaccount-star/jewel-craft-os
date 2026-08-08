import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { npr } from "@/lib/format";

const REFUND_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"];

/**
 * Guided cancellation of an issued / partially-paid invoice:
 * refund handling, inventory restock, and linked old-gold reversal.
 */
export function CancelInvoiceDialog({ open, onOpenChange, invoice, items, userId, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: any;
  items: any[];
  userId: string | null;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(true);
  const [refundMethod, setRefundMethod] = useState("cash");
  const [refundAmount, setRefundAmount] = useState(0);
  const [restock, setRestock] = useState(true);
  const [recreateMissing, setRecreateMissing] = useState(true);
  const [oldGold, setOldGold] = useState<any[]>([]);
  const [reverseOldGold, setReverseOldGold] = useState(false);
  const [busy, setBusy] = useState(false);

  const paid = Number(invoice?.amount_paid ?? 0);
  const linkedCount = items.filter((i) => i.inventory_item_id).length;
  const unlinkedCount = items.length - linkedCount;

  useEffect(() => {
    if (!open || !invoice) return;
    setReason(""); setRefund(paid > 0); setRefundMethod("cash"); setRefundAmount(paid);
    setRestock(true); setRecreateMissing(true); setReverseOldGold(false);
    supabase.from("old_gold_purchases").select("id, receipt_number, total_amount")
      .eq("linked_invoice_id", invoice.id)
      .then(({ data }) => setOldGold(data ?? []));
  }, [open, invoice, paid]);

  async function confirm() {
    if (!invoice) return;
    setBusy(true);
    try {
      // 1. Refund any money received.
      const amt = Math.min(Math.max(0, Number(refundAmount) || 0), paid);
      if (refund && amt > 0) {
        const { error } = await supabase.from("payments").insert({
          invoice_id: invoice.id, customer_id: invoice.customer_id,
          amount: -amt, method: refundMethod as any,
          reference: "Refund on cancellation", notes: reason || null, created_by: userId,
        } as any);
        if (error) throw error;
      }

      // 2. Restore stock.
      if (restock) {
        const ids = items.map((i) => i.inventory_item_id).filter(Boolean) as string[];
        if (ids.length) {
          const { error } = await supabase.from("inventory_items").update({ status: "in_stock" }).in("id", ids);
          if (error) throw error;
        }
        if (recreateMissing) {
          const orphans = items.filter((i) => !i.inventory_item_id);
          for (const o of orphans) {
            const net = Number(o.weight ?? 0);
            await supabase.from("inventory_items").insert({
              sku: `RET-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`,
              name: o.description ?? "Returned item",
              metal: (o.metal ?? "gold") as any,
              purity: o.purity ?? "22K",
              gross_weight: Number(o.gross_weight ?? net),
              stone_weight: Number(o.stone_weight ?? 0),
              net_weight: net,
              fine_weight: net,
              making_charge: Number(o.making_input ?? 0),
              making_charge_type: o.making_type ?? "per_gram",
              wastage_type: (o.wastage_type ?? "percentage") as any,
              wastage_value: Number(o.wastage_input ?? 0),
              stone_value: Number(o.stone_value ?? 0),
              status: "returned" as any,
              received_from: `Cancelled invoice ${invoice.invoice_number}`,
              created_by: userId,
            } as any);
          }
        }
      }

      // 3. Reverse linked old-gold purchases if requested.
      if (reverseOldGold && oldGold.length) {
        await supabase.from("old_gold_purchases")
          .update({ linked_invoice_id: null, notes: `Reversed — invoice ${invoice.invoice_number} cancelled` })
          .in("id", oldGold.map((o) => o.id));
      }

      // 4. Release the customer's outstanding credit for this invoice.
      if (invoice.customer_id && Number(invoice.balance_due) > 0) {
        const { data: c } = await supabase.from("customers").select("balance").eq("id", invoice.customer_id).maybeSingle();
        await supabase.from("customers")
          .update({ balance: Math.max(0, Number(c?.balance ?? 0) - Number(invoice.balance_due)) })
          .eq("id", invoice.customer_id);
      }

      // 5. Close the invoice out.
      const status = refund && amt > 0 ? "refunded" : "cancelled";
      const { error: uErr } = await supabase.from("invoices").update({
        status: status as any,
        amount_paid: refund ? Math.max(0, paid - amt) : paid,
        balance_due: 0,
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason || null,
        restocked: restock,
      } as any).eq("id", invoice.id);
      if (uErr) throw uErr;

      toast.success(`Invoice ${status}`);
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cancel invoice {invoice?.invoice_number}</DialogTitle>
          <DialogDescription>Choose how payments, stock and old gold should be handled.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Reason</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer returned goods, billing error..." />
          </div>

          {paid > 0 && (
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox id="refund" checked={refund} onCheckedChange={(v) => setRefund(!!v)} />
                <Label htmlFor="refund">Refund the {npr(paid)} received</Label>
              </div>
              {refund && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Amount</Label>
                    <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(Number(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label className="text-xs">Refund via</Label>
                    <Select value={refundMethod} onValueChange={setRefundMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{REFUND_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="restock" checked={restock} onCheckedChange={(v) => setRestock(!!v)} />
              <Label htmlFor="restock">Return items to inventory ({linkedCount} linked)</Label>
            </div>
            {restock && unlinkedCount > 0 && (
              <div className="mt-2 flex items-center gap-2 pl-6">
                <Checkbox id="recreate" checked={recreateMissing} onCheckedChange={(v) => setRecreateMissing(!!v)} />
                <Label htmlFor="recreate" className="text-xs">
                  Create {unlinkedCount} new inventory item(s) with the same details for lines not linked to stock
                </Label>
              </div>
            )}
          </div>

          {oldGold.length > 0 && (
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">Linked old gold purchase(s)</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {oldGold.map((o) => `${o.receipt_number} · ${npr(o.total_amount)}`).join(", ")}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Checkbox id="revog" checked={reverseOldGold} onCheckedChange={(v) => setReverseOldGold(!!v)} />
                <Label htmlFor="revog" className="text-xs">Unlink from this invoice (keep the purchase record)</Label>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep invoice</Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "Processing..." : "Confirm cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
