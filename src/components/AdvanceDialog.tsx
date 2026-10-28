import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/DateField";
import { DateText } from "@/components/DateText";
import { todayISO } from "@/lib/orders";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { npr, round2, CUSTOMER_ADVANCE_REF } from "@/lib/format";
import { OldGoldForm, OldGoldSaveResult } from "@/components/OldGoldForm";
import { PickedCustomer } from "@/components/CustomerSelector";
import { printOldMetalReceipt } from "@/lib/oldMetalReceipt";

const EVENT_LABEL: Record<string, string> = { created: "Created", applied: "Applied to bill", adjusted: "Adjusted", reversed: "Reversed" };
const PAYMENT_METHODS = ["cash", "bank_transfer", "esewa", "khalti", "fonepay", "other"];

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
  /** Leave empty to record a customer advance balance (not tied to an order). */
  orderId?: string | null;
  orderNo?: string | null;
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
  const [paidOn, setPaidOn] = useState(todayISO());
  const [history, setHistory] = useState<any[]>([]);
  const [editing, setEditing] = useState<{ id: string; mode: "adjust" | "reverse"; amount: number } | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editReason, setEditReason] = useState("");

  async function submitEdit() {
    if (!editing) return;
    const { error } = editing.mode === "adjust"
      ? await supabase.rpc("adjust_customer_advance" as any, { _payment_id: editing.id, _new_amount: round2(editAmount), _reason: editReason })
      : await supabase.rpc("reverse_customer_advance" as any, { _payment_id: editing.id, _reason: editReason });
    if (error) return toast.error(error.message);
    toast.success(editing.mode === "adjust" ? "Advance adjusted" : "Advance reversed");
    setEditing(null); setEditReason("");
    await loadEntries(); onChanged?.();
  }

  useEffect(() => {
    if (!open) return;
    setAmount(0); setMethod("cash"); setReference(""); setPaidOn(todayISO());
    loadEntries();
  }, [open]);

  async function loadEntries() {
    let q = supabase.from("payments").select("*");
    q = orderId ? q.eq("order_id", orderId)
      : q.eq("customer_id", customerId).is("order_id", null).is("invoice_id", null).eq("reference", CUSTOMER_ADVANCE_REF);
    const { data } = await q.order("paid_at", { ascending: false });
    setEntries(data ?? []);
    if (!orderId) {
      const { data: ev } = await supabase.from("customer_advance_events" as any).select("*")
        .eq("customer_id", customerId).order("created_at", { ascending: false }).limit(100);
      setHistory((ev ?? []) as any[]);
    }
  }

  async function recordPayment(amt: number, m: string, ref: string | null) {
    if (!orderId) {
      const { error: rErr } = await supabase.rpc("record_customer_advance" as any, {
        _customer_id: customerId, _amount: round2(amt), _method: m, _paid_on: paidOn || todayISO(), _reference: ref,
      });
      if (rErr) throw rErr;
      await loadEntries(); onChanged?.(); return;
    }
    const { error } = await supabase.from("payments").insert({
      order_id: orderId || null, customer_id: customerId, amount: round2(amt),
      method: m as any, reference: orderId ? ref : CUSTOMER_ADVANCE_REF,
      paid_at: new Date(`${paidOn || todayISO()}T12:00:00+05:45`).toISOString(),
      notes: orderId
        ? `Advance for order ${orderNo} paid on ${paidOn || todayISO()}`
        : `Customer advance paid on ${paidOn || todayISO()}${ref ? ` · ${ref}` : ""}`,
      created_by: userId,
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
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> {orderId ? `Advances — ${orderNo}` : `Advance balance — ${customer?.full_name ?? "customer"}`}</DialogTitle></DialogHeader>

        {entries.length > 0 && (
          <div className="rounded border p-2">
            <div className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">
              <span>{orderId ? "Recorded so far" : "Unused balance"}</span><span>{npr(runningTotal)}</span>
            </div>
            <div className="max-h-28 space-y-1 overflow-y-auto">
              {entries.map((p) => (
                <div key={p.id} className="flex justify-between text-xs">
                  <span className="capitalize"><DateText value={p.paid_at?.slice(0, 10)} /> · {p.method?.replace("_", " ")} {p.reference && p.reference !== "CUST_ADVANCE" && `· ${p.reference}`}</span>
                  <span className="flex items-center gap-1">
                    {npr(p.amount)}
                    {!orderId && (
                      <>
                        <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[11px]"
                          onClick={() => { setEditing({ id: p.id, mode: "adjust", amount: Number(p.amount) }); setEditAmount(Number(p.amount)); setEditReason(""); }}>Adjust</Button>
                        <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[11px] text-destructive"
                          onClick={() => { setEditing({ id: p.id, mode: "reverse", amount: Number(p.amount) }); setEditReason(""); }}>Reverse</Button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {editing && (
          <div className="space-y-2 rounded border border-primary/40 p-2">
            <div className="text-sm font-medium">
              {editing.mode === "adjust" ? "Adjust advance" : `Reverse advance of ${npr(editing.amount)}`}
            </div>
            {editing.mode === "adjust" && (
              <div><Label className="text-xs">New amount</Label><NumberField value={editAmount} onChange={setEditAmount} className="text-right" /></div>
            )}
            <div><Label className="text-xs">Reason (required)</Label><Input value={editReason} onChange={(e) => setEditReason(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submitEdit} disabled={editReason.trim().length < 3}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}

        <div><Label>Date paid</Label><DateField value={paidOn} max={todayISO()} clearable={false} showToggle onChange={setPaidOn} /></div>
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
                  {orderId && <SelectItem value="old_gold">Old metal trade-in</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference (optional)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            <Button className="w-full" onClick={saveSimple}>Add This Advance</Button>
          </div>
        )}

        {!orderId && history.length > 0 && (
          <div className="rounded border p-2">
            <div className="mb-1 text-xs font-medium text-muted-foreground">History</div>
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="border-b pb-1 text-xs last:border-0">
                  <div className="flex justify-between gap-2">
                    <span><span className="font-medium">{EVENT_LABEL[h.event] ?? h.event}</span> · <DateText value={String(h.created_at).slice(0, 10)} /> {new Date(h.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className={Number(h.amount) < 0 ? "text-destructive" : ""}>{Number(h.amount) > 0 ? "+" : ""}{npr(h.amount)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    by {h.actor_email ?? "unknown"}
                    {h.paid_at && <> · advance paid <DateText value={String(h.paid_at).slice(0, 10)} /></>}
                    {h.old_amount != null && h.new_amount != null && <> · {npr(h.old_amount)} → {npr(h.new_amount)}</>}
                    {h.invoice_number && <> · bill {h.invoice_number}</>}
                    {h.reason && <> · “{h.reason}”</>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
