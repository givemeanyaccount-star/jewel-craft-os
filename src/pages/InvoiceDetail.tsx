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
import { ArrowLeft, Printer, Plus } from "lucide-react";
import { npr } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "credit", "old_gold", "other"];

export default function InvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [inv, setInv] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [payOpen, setPayOpen] = useState(false);

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

  if (!inv) return <AppLayout><p>Loading...</p></AppLayout>;

  return (
    <AppLayout title={inv.invoice_number} actions={
      <>
        <Button size="sm" variant="outline" onClick={() => nav(-1)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button>
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
                <TableHead>Item</TableHead><TableHead className="text-right">Wt</TableHead>
                <TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Making</TableHead>
                <TableHead className="text-right">Wastage</TableHead><TableHead className="text-right">Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><div className="font-medium">{r.description}</div>
                      <div className="text-xs text-muted-foreground">{r.metal} {r.purity}</div></TableCell>
                    <TableCell className="text-right">{r.weight}g</TableCell>
                    <TableCell className="text-right">{npr(r.rate)}</TableCell>
                    <TableCell className="text-right">{npr(r.making_charge)}</TableCell>
                    <TableCell className="text-right">{npr(r.wastage_amount)}</TableCell>
                    <TableCell className="text-right font-medium">{npr(r.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 ml-auto max-w-sm space-y-1.5 text-sm">
              <Row label="Subtotal" value={npr(inv.subtotal)} />
              <Row label="Discount" value={`- ${npr(inv.discount)}`} />
              <Row label={`VAT ${inv.vat_rate}%`} value={npr(inv.vat_amount)} />
              <Row label="Old gold credit" value={`- ${npr(inv.old_gold_credit)}`} />
              <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{npr(inv.total)}</span></div>
              <Row label="Paid" value={npr(inv.amount_paid)} />
              <div className="flex justify-between font-medium"><span>Balance due</span><span className={Number(inv.balance_due) > 0 ? "text-destructive" : ""}>{npr(inv.balance_due)}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Payments</CardTitle>
            {Number(inv.balance_due) > 0 && <Button size="sm" onClick={() => setPayOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add</Button>}
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

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} invoice={inv} userId={user?.id ?? null} onSaved={() => { setPayOpen(false); load(); }} />
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
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
