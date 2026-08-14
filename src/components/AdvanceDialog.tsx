import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumberField } from "@/components/ui/number-field";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { npr, round2 } from "@/lib/format";
import { OldGoldForm, OldGoldSaveResult } from "@/components/OldGoldForm";
import { PickedCustomer } from "@/components/CustomerSelector";
import { printOldMetalReceipt } from "@/lib/oldMetalReceipt";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"];

/**
 * Records one or more advance payments against an order, in a single session,
 * each with its own payment method -- including old-metal trade-in, which
 * routes through the same shared OldGoldForm used everywhere else. Used both
 * right after booking a new order and from the order detail page, so old-metal
 * advances are available in exactly one place, not just one of the two.
 */
export function AdvanceDialog({
  open, onOpenChange, orderId, orderNo, customerId, customer, userId, onChanged, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  orderNo: string;
  customerId: string;
  customer?: PickedCustomer | null;
  userId?: string;
  /** Fires after every successful entry, so the host can refresh its own totals. */
  onChanged?: () => void;
  /** Fires when the user is finished adding advances and closes the dialog. */
  onDone?: () => void;
}) {
  const [entries, setEntries] = useState<any[]>([]);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount(0); setMethod("cash"); setReference("");
    loadEntries();
  }, [open]);

  async function loadEntries() {
    const { data } = await supabase.from("payments").select("*").eq("order_id", orderId).order("paid_at", { ascending: false });
    setEntries(data ?? []);
  }

  async function recordPayment(amt: number, m: string, ref: string | null) {
    const { error } = await supabase.from("payments").insert({
      order_id: orderId, customer_id: customerId, amount: round2(amt),
      method: m as any, reference: ref,
      notes: `Advance for order ${orderNo}`, created_by: userId,
    } as any);
    if (error) throw error;
    const { data: pays } = await supabase.from("payments").select("amount").eq("order_id", orderId);
    const total = round2((pays ?? []).reduce((a: number, p: any) => a + Number(p.amount ?? 0), 0));
    await supabase.from("orders").update({ advance_paid: total }).eq("id", orderId);
    await loadEntries();
    onChanged?.();
  }

  async function saveSimple() {
    if (amount <= 0) return toast.error("Enter an amount");
    try {
      await recordPayment(amount, method, reference || null);
      toast.success("Advance recorded — add another, or Done when finished");
      setAmount(0); setReference("");
    } catch (e: any) { toast.error(e.message); }
  }

  async function onOldMetalSaved(result: OldGoldSaveResult) {
    try {
      await recordPayment(result.total, "old_gold", result.receiptNumber);
      toast.success("Old metal advance recorded");
      if (window.confirm("Print the old metal purchase receipt now?")) {
        await printOldMetalReceipt(result.id, `Advance on order ${orderNo}`);
      }
      setMethod("cash");
    } catch (e: any) { toast.error(e.message); }
  }

  const runningTotal = round2(entries.reduce((s, p) => s + Number(p.amount ?? 0), 0));

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) onDone?.();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Advances — {orderNo}</DialogTitle></DialogHeader>

        {entries.length > 0 && (
          <div className="rounded border p-2">
            <div className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">
              <span>Recorded so far</span><span>{npr(runningTotal)}</span>
            </div>
            <div className="max-h-28 space-y-1 overflow-y-auto">
              {entries.map((p) => (
                <div key={p.id} className="flex justify-between text-xs">
                  <span className="capitalize">{p.method?.replace("_", " ")} {p.reference && `· ${p.reference}`}</span>
                  <span>{npr(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {method === "old_gold" ? (
          <>
            <Button size="sm" variant="ghost" className="w-fit" onClick={() => setMethod("cash")}>&larr; Use cash/bank instead</Button>
            <OldGoldForm compact submitLabel="Record & Apply as Advance"
              initialCustomer={customer ?? null} onSaved={onOldMetalSaved} />
          </>
        ) : (
          <div className="space-y-3">
            <div><Label>Amount</Label><NumberField value={amount} onChange={setAmount} className="text-right" /></div>
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
                  <SelectItem value="old_gold">Old metal trade-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference (optional)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            <Button className="w-full" onClick={saveSimple}>Add This Advance</Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
