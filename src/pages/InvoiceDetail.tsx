import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Printer, Plus, Ban, Undo2 } from "lucide-react";
import { PrintDocument, printDocument } from "@/components/PrintDocument";
import { npr } from "@/lib/format";
import { fetchLatestFineRates, billFineRate, fineEquivalentNote, type FineRates } from "@/lib/fineEquivalent";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { CancelInvoiceDialog } from "@/components/CancelInvoiceDialog";
import { ReturnItemsDialog } from "@/components/ReturnItemsDialog";
import logoUrl from "@/assets/logo.png";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "credit", "old_gold", "other"];

function rowMath(r: any) {
  const netWt = Number(r.weight ?? 0);
  const rate = Number(r.rate ?? 0);
  const wastageWt = r.wastage_type === "weight" ? Number(r.wastage_input ?? 0) : (rate > 0 ? Number(r.wastage_amount ?? 0) / rate : 0);
  const totalWt = netWt + wastageWt;
  const goldAmt = totalWt * rate;
  const stoneAmt = Number(r.stone_value ?? 0);
  const making = Number(r.making_charge ?? 0);
  const qty = Number(r.quantity ?? 1);
  const rowTotal = (goldAmt + stoneAmt + making) * qty;
  return { netWt, rate, wastageWt, totalWt, goldAmt, stoneAmt, making, qty, rowTotal };
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const [inv, setInv] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [fineRates, setFineRates] = useState<FineRates>({});
  const [tradeMetal, setTradeMetal] = useState<string>("gold");

  useEffect(() => { fetchLatestFineRates().then(setFineRates); }, []);
  useEffect(() => {
    if (!id) return;
    supabase.from("old_gold_purchases").select("metal, total_amount")
      .eq("linked_invoice_id", id).order("total_amount", { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]?.metal) setTradeMetal(data[0].metal as string); });
  }, [id]);

  useEffect(() => { load(); }, [id]);
  async function load() {
    if (!id) return;
    const [i, it, p] = await Promise.all([
      supabase.from("invoices").select("*, customers(*)").eq("id", id).single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id),
      supabase.from("payments").select("*").eq("invoice_id", id).order("paid_at"),
    ]);
    setInv(i.data); setItems(it.data ?? []); setPayments(p.data ?? []);
  }

  const oldGoldEq = inv && Number(inv.old_gold_credit) > 0
    ? fineEquivalentNote(Number(inv.old_gold_credit), billFineRate(items, tradeMetal, fineRates), tradeMetal)
    : null;


  if (!inv) return <AppLayout><p>Loading...</p></AppLayout>;

  const cancellable = inv.status === "issued" || inv.status === "partial";
  const returnableInvoice = cancellable || inv.status === "paid";

  return (
    <AppLayout title={inv.invoice_number} actions={
      <>
        <Button size="sm" variant="outline" onClick={() => nav(-1)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        <Button size="sm" variant="outline" onClick={() => printDocument(`invoice-print-${inv.id}`, `Invoice ${inv.invoice_number}`)}><Printer className="mr-1 h-4 w-4" /> Print</Button>
        {cancellable && hasPermission("invoice_cancel_refund") && (
          <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)}>
            <Undo2 className="mr-1 h-4 w-4" /> Return item(s)
          </Button>
        )}
        {cancellable && hasPermission("invoice_cancel_refund") && (
          <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
            <Ban className="mr-1 h-4 w-4" /> Cancel invoice
          </Button>
        )}
      </>
    }>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Invoice {inv.invoice_number}</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                {inv.customers?.full_name ?? "Walk-in"} · {new Date(inv.issued_at).toLocaleString()}
              </div>
            </div>
            <Badge className="capitalize">{inv.status}</Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Purity</TableHead>
                <TableHead className="text-right">Net Wt</TableHead>
                <TableHead className="text-right">Wastage Wt</TableHead>
                <TableHead className="text-right">Total Wt</TableHead>
                <TableHead className="text-right">Rate/g</TableHead>
                <TableHead className="text-right">Gold Amt</TableHead>
                <TableHead className="text-right">Stone Amt</TableHead>
                <TableHead className="text-right">Making</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((r) => {
                  const m = rowMath(r);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.description}</div>
                        <div className="text-xs text-muted-foreground">{r.metal}{m.qty > 1 ? ` · ×${m.qty}` : ""}</div>
                      </TableCell>
                      <TableCell className="text-right">{r.purity ?? "-"}</TableCell>
                      <TableCell className="text-right">{m.netWt.toFixed(3)} g</TableCell>
                      <TableCell className="text-right">
                        <div>{m.wastageWt.toFixed(3)} g</div>
                        {r.wastage_type && <div className="text-[10px] text-muted-foreground">({formatBasis(r.wastage_type, r.wastage_input)})</div>}
                      </TableCell>
                      <TableCell className="text-right">{m.totalWt.toFixed(3)} g</TableCell>
                      <TableCell className="text-right">{npr(m.rate)}</TableCell>
                      <TableCell className="text-right">{npr(m.goldAmt)}</TableCell>
                      <TableCell className="text-right">{npr(m.stoneAmt)}</TableCell>
                      <TableCell className="text-right">
                        <div>{npr(m.making)}</div>
                        {r.making_type && <div className="text-[10px] text-muted-foreground">({formatMaking(r.making_type, r.making_input)})</div>}
                      </TableCell>
                      <TableCell className="text-right font-medium">{npr(m.rowTotal)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="mt-4 ml-auto max-w-sm space-y-1.5 text-sm">
              <Row label="Subtotal" value={npr(inv.subtotal)} />
              {Number(inv.stones_total) > 0 && <Row label="  Stones (VAT-able)" value={npr(inv.stones_total)} />}
              <Row label="Discount" value={`- ${npr(inv.discount)}`} />
              {Number(inv.vat_amount) > 0 && <Row label={`VAT ${inv.vat_rate}% (stones only)`} value={npr(inv.vat_amount)} />}
              {Number(inv.sd_tax) > 0 && <Row label={`SD tax ${inv.sd_tax_rate}% (gold + making − old gold)`} value={npr(inv.sd_tax)} />}
              {Number(inv.luxury_tax) > 0 && <Row label={`Luxury tax ${inv.luxury_tax_rate}% (gold + making − old gold)`} value={npr(inv.luxury_tax)} />}
              <Row label="Old gold credit" value={`- ${npr(inv.old_gold_credit)}`} />
              {oldGoldEq && <div className="text-right text-xs text-muted-foreground">{oldGoldEq}</div>}

              <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{npr(inv.total)}</span></div>
              <Row label="Paid" value={npr(inv.amount_paid)} />
              <div className="flex justify-between font-medium"><span>Balance due</span><span className={Number(inv.balance_due) > 0 ? "text-destructive" : ""}>{npr(inv.balance_due)}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Payments</CardTitle>
            {Number(inv.balance_due) > 0 && hasPermission("pos_create_sale") && (
              <Button size="sm" onClick={() => setPayOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add</Button>
            )}
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet</p> :
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex justify-between border-b pb-2 text-sm last:border-0">
                    <div>
                      <div className="font-medium">{npr(p.amount)}</div>
                      <div className="text-xs text-muted-foreground capitalize">{p.method.replace("_", " ")}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(p.paid_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            }
          </CardContent>
        </Card>
      </div>

      {/* Hidden, print-only, isolated layout — matches the store's official bill */}
      <PrintDocument kind="invoice" doc={inv} items={items} payments={payments}
        domId={`invoice-print-${inv.id}`} />

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} invoice={inv} userId={user?.id ?? null} onSaved={() => { setPayOpen(false); load(); }} />
      <CancelInvoiceDialog open={cancelOpen} onOpenChange={setCancelOpen} invoice={inv} items={items}
        userId={user?.id ?? null} onDone={load} />
      <ReturnItemsDialog open={returnOpen} onOpenChange={setReturnOpen} invoice={inv} items={items}
        userId={user?.id ?? null} onDone={load} />
    </AppLayout>
  );
}



function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}

function formatMaking(type: string, input: number | null | undefined) {
  const v = Number(input ?? 0);
  if (type === "per_gram") return `${v}/g`;
  if (type === "percentage") return `${v}% of metal`;
  return `fixed ${v}`;
}
function formatBasis(type: string, input: number | null | undefined) {
  const v = Number(input ?? 0);
  if (type === "percentage") return `${v}% of metal`;
  if (type === "weight") return `${v}g × rate`;
  return `fixed ${v}`;
}

function PaymentDialog({ open, onOpenChange, invoice, userId, onSaved }: any) {
  const [amount, setAmount] = useState(invoice?.balance_due ?? 0);
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");

  useEffect(() => { setAmount(invoice?.balance_due ?? 0); }, [invoice, open]);

  async function save() {
    if (!amount || amount <= 0) return toast.error("Enter amount");
    const amt = Number(amount);
    const { error } = await supabase.from("payments").insert({
      invoice_id: invoice.id, customer_id: invoice.customer_id, amount: amt,
      method: method as any, reference: ref || null, created_by: userId,
    });
    if (error) return toast.error(error.message);
    const newPaid = Number(invoice.amount_paid) + amt;
    const newBal = Math.max(0, Number(invoice.total) - newPaid);
    const status = newBal === 0 ? "paid" : "partial";
    await supabase.from("invoices").update({ amount_paid: newPaid, balance_due: newBal, status }).eq("id", invoice.id);
    if (invoice.customer_id) {
      const { data: c } = await supabase.from("customers").select("balance").eq("id", invoice.customer_id).single();
      await supabase.from("customers").update({ balance: Math.max(0, Number(c?.balance ?? 0) - amt) }).eq("id", invoice.customer_id);
    }
    toast.success("Payment recorded");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div><Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Reference (optional)</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Txn id, cheque #..." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
