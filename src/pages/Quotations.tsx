import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, FileText, Printer } from "lucide-react";
import { npr, computeLineTotal, VAT_RATE, nextNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface QRow {
  inventory_item_id: string | null; description: string;
  metal?: string; purity?: string;
  weight: number; rate: number; making_charge: number;
  wastage_amount: number; stone_value: number;
  quantity: number; line_total: number;
}

export default function Quotations() {
  const { user, hasRole } = useAuth();
  const canWrite = hasRole("admin") || hasRole("manager") || hasRole("sales");
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("quotations")
      .select("*, customers(full_name)").order("created_at", { ascending: false }).limit(200);
    setList(data ?? []);
  }

  return (
    <AppLayout title="Quotations" actions={canWrite && (
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New Quotation</Button>
    )}>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Quote #</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No quotations</TableCell></TableRow>
              : list.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{q.quote_number}</TableCell>
                  <TableCell>{q.customers?.full_name ?? "—"}</TableCell>
                  <TableCell>{new Date(q.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="capitalize">{q.status}</TableCell>
                  <TableCell className="text-right">{npr(q.total)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <QuotationBuilder open={open} onOpenChange={setOpen} userId={user?.id ?? null} onSaved={() => { setOpen(false); load(); }} />
    </AppLayout>
  );
}

function QuotationBuilder({ open, onOpenChange, userId, onSaved }: any) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [rows, setRows] = useState<QRow[]>([]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => { if (open) supabase.from("customers").select("id, full_name, phone").order("full_name").then(({ data }) => setCustomers(data ?? [])); }, [open]);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!search.trim()) { setItems([]); return; }
      const s = search.trim();
      const { data } = await supabase.from("inventory_items").select("*").eq("status", "in_stock")
        .or(`name.ilike.%${s}%,sku.ilike.%${s}%`).limit(15);
      setItems(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  async function addItem(item: any) {
    const { data: rateRow } = await supabase.from("metal_rates").select("rate_per_gram").eq("metal", item.metal).eq("purity", item.purity).order("effective_date", { ascending: false }).limit(1).maybeSingle();
    const rate = Number(rateRow?.rate_per_gram ?? 0);
    const { making, wastageAmount, lineTotal } = computeLineTotal({
      netWeight: Number(item.net_weight), ratePerGram: rate,
      makingCharge: Number(item.making_charge), makingChargeType: item.making_charge_type as any,
      wastageType: item.wastage_type as any, wastageValue: Number(item.wastage_value),
      stoneValue: Number(item.stone_value), quantity: 1,
    });
    setRows((r) => [...r, {
      inventory_item_id: item.id, description: `${item.name} (${item.sku})`,
      metal: item.metal, purity: item.purity,
      weight: Number(item.net_weight), rate, making_charge: making, wastage_amount: wastageAmount,
      stone_value: Number(item.stone_value), quantity: 1, line_total: lineTotal,
    }]);
    setSearch(""); setItems([]);
  }

  const subtotal = useMemo(() => rows.reduce((a, r) => a + r.line_total, 0), [rows]);
  const taxable = Math.max(0, subtotal - discount);
  const vat = taxable * VAT_RATE / 100;
  const total = taxable + vat;

  async function save() {
    if (rows.length === 0) return toast.error("Add at least one item");
    setSaving(true);
    try {
      const num = Math.floor(Date.now() / 1000) % 100000;
      const qNumber = nextNumber("Q", num, 5);
      const { data: q, error } = await supabase.from("quotations").insert({
        quote_number: qNumber, customer_id: customerId, status: "draft",
        subtotal, vat_amount: vat, discount, total, notes: notes || null,
        valid_until: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), created_by: userId,
      }).select().single();
      if (error) throw error;
      const lines = rows.map((r) => ({ quotation_id: q.id, ...r }));
      const { error: lErr } = await supabase.from("quotation_items").insert(lines as any);
      if (lErr) throw lErr;
      toast.success(`Quotation ${qNumber} saved`);
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>New Quotation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Customer</Label>
            <Select value={customerId ?? undefined} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Add items</Label>
            <Input placeholder="Search inventory..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {items.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded border">
                {items.map((i) => (
                  <button key={i.id} onClick={() => addItem(i)} className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted">
                    <span>{i.name} <span className="text-muted-foreground">({i.sku})</span></span>
                    <Plus className="h-4 w-4" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Item</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Total</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No items</TableCell></TableRow>
                : rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.description}</TableCell>
                    <TableCell className="text-right">{npr(r.rate)}</TableCell>
                    <TableCell className="text-right">{npr(r.line_total)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => setRows(rows.filter((_, x) => x !== i))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{npr(subtotal)}</span></div>
            <div className="flex items-center justify-between"><span>Discount</span>
              <Input type="number" className="h-8 w-24" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} /></div>
            <div className="flex justify-between"><span>VAT {VAT_RATE}%</span><span>{npr(vat)}</span></div>
            <div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{npr(total)}</span></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Quotation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
