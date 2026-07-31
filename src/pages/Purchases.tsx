import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ShoppingCart, Users, Coins } from "lucide-react";
import { npr, gms, computeNetWeight, nextNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const METALS = ["gold", "silver", "platinum"];
const PURITIES = ["24K", "22K", "20K", "18K", "999", "925"];

function blankItem() {
  return { item_name: "", metal: "gold", purity: "22K", gross_weight: 0, stone_weight: 0, rate_per_gram: 0, making_charge: 0, quantity: 1 };
}

export default function Purchases() {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("purchases").select("*, suppliers(name), purchase_items(id)").order("purchase_date", { ascending: false }).limit(300);
    setList(data ?? []);
  }

  return (
    <AppLayout title="Purchase Documentation" actions={
      <div className="flex gap-2">
        <Button size="sm" variant="outline" asChild><Link to="/suppliers"><Users className="mr-1 h-4 w-4" /> Suppliers</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/purchases/old-gold"><Coins className="mr-1 h-4 w-4" /> Old Gold Purchase</Link></Button>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New Purchase</Button>
      </div>
    }>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Purchase No</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead>
              <TableHead>Items</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Total</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {list.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No purchases yet</TableCell></TableRow>
                : list.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => nav(`/purchases/${p.id}`)}>
                    <TableCell className="font-medium">{p.purchase_no}</TableCell>
                    <TableCell>{p.suppliers?.name ?? "—"}</TableCell>
                    <TableCell>{new Date(p.purchase_date).toLocaleDateString()}</TableCell>
                    <TableCell>{p.purchase_items?.length ?? 0}</TableCell>
                    <TableCell className="capitalize">{p.payment_status}</TableCell>
                    <TableCell className="text-right font-medium">{npr(p.total_amount)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NewPurchaseDialog open={open} onOpenChange={setOpen} onSaved={(id: string) => { setOpen(false); load(); nav(`/purchases/${id}`); }} />
    </AppLayout>
  );
}

function NewPurchaseDialog({ open, onOpenChange, onSaved }: any) {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [items, setItems] = useState<any[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("suppliers").select("id, name").order("name").then(({ data }) => setSuppliers(data ?? []));
    setForm({ supplier_id: "", purchase_date: new Date().toISOString().slice(0, 10), invoice_no: "", notes: "" });
    setItems([blankItem()]);
  }, [open]);

  function updateItem(i: number, patch: any) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function itemTotal(it: any) {
    const net = computeNetWeight(Number(it.gross_weight) || 0, Number(it.stone_weight) || 0);
    return (net * (Number(it.rate_per_gram) || 0) + (Number(it.making_charge) || 0)) * (Number(it.quantity) || 1);
  }
  const grandTotal = items.reduce((sum, it) => sum + itemTotal(it), 0);

  async function save() {
    if (!items.length || items.some((it) => !it.item_name?.trim())) return toast.error("Every line item needs a name");
    setSaving(true);
    try {
      const num = Math.floor(Date.now() / 1000) % 100000;
      const purchaseNo = nextNumber("PUR", num, 5);
      const { data: purchase, error } = await supabase.from("purchases").insert({
        purchase_no: purchaseNo,
        supplier_id: form.supplier_id || null,
        purchase_date: form.purchase_date,
        invoice_no: form.invoice_no || null,
        total_amount: grandTotal,
        payment_status: "paid",
        notes: form.notes || null,
        created_by: user?.id,
      }).select("id").single();
      if (error) throw error;

      const rows = items.map((it) => {
        const net = computeNetWeight(Number(it.gross_weight) || 0, Number(it.stone_weight) || 0);
        return {
          purchase_id: purchase.id,
          item_name: it.item_name.trim(),
          metal: it.metal, purity: it.purity,
          gross_weight: Number(it.gross_weight) || 0,
          stone_weight: Number(it.stone_weight) || 0,
          net_weight: net,
          rate_per_gram: Number(it.rate_per_gram) || 0,
          making_charge: Number(it.making_charge) || 0,
          quantity: Number(it.quantity) || 1,
          total_cost: itemTotal(it),
        };
      });
      const { error: itemErr } = await supabase.from("purchase_items").insert(rows);
      if (itemErr) throw itemErr;

      toast.success(`Purchase ${purchaseNo} recorded`);
      onSaved(purchase.id);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> New Purchase</DialogTitle></DialogHeader>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Supplier</Label>
            <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Purchase date</Label><Input type="date" value={form.purchase_date ?? ""} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
          <div><Label>Supplier's invoice no.</Label><Input value={form.invoice_no ?? ""} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} /></div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Line Items</Label>
            <Button size="sm" variant="outline" onClick={() => setItems([...items, blankItem()])}><Plus className="mr-1 h-3 w-3" /> Add Item</Button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded border p-3 md:grid-cols-8">
              <div className="col-span-2"><Label className="text-xs">Item name</Label><Input value={it.item_name} onChange={(e) => updateItem(i, { item_name: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Metal</Label>
                <Select value={it.metal} onValueChange={(v) => updateItem(i, { metal: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METALS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Purity</Label>
                <Select value={it.purity} onValueChange={(v) => updateItem(i, { purity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PURITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Gross (g)</Label><Input type="number" step="0.001" value={it.gross_weight} onChange={(e) => updateItem(i, { gross_weight: e.target.value })} /></div>
              <div><Label className="text-xs">Stone (g)</Label><Input type="number" step="0.001" value={it.stone_weight} onChange={(e) => updateItem(i, { stone_weight: e.target.value })} /></div>
              <div><Label className="text-xs">Rate/g</Label><Input type="number" value={it.rate_per_gram} onChange={(e) => updateItem(i, { rate_per_gram: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Making charge (NPR)</Label><Input type="number" value={it.making_charge} onChange={(e) => updateItem(i, { making_charge: e.target.value })} /></div>
              <div><Label className="text-xs">Qty</Label><Input type="number" value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></div>
              <div className="col-span-2 flex items-end justify-between">
                <div><span className="text-xs text-muted-foreground block">Net wt</span>{gms(computeNetWeight(Number(it.gross_weight) || 0, Number(it.stone_weight) || 0))}</div>
                <div className="text-right"><span className="text-xs text-muted-foreground block">Line total</span>{npr(itemTotal(it))}</div>
              </div>
              <div className="flex items-end">
                {items.length > 1 && <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 rounded bg-secondary p-3 text-center">
          <div className="text-xs text-muted-foreground">Grand Total (paid in full)</div>
          <div className="text-2xl font-semibold">{npr(grandTotal)}</div>
        </div>

        <div><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Record Purchase"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
