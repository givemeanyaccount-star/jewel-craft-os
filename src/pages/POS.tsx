import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Search, ShoppingCart } from "lucide-react";
import { npr, computeLineTotal, VAT_RATE, nextNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "credit", "old_gold", "other"];

interface CartRow {
  inventory_item_id: string | null;
  description: string;
  metal?: string; purity?: string;
  weight: number; rate: number; making_charge: number;
  wastage_amount: number; stone_value: number;
  quantity: number; line_total: number;
}

export default function POS() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [discount, setDiscount] = useState(0);
  const [oldGoldCredit, setOldGoldCredit] = useState(0);
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("customers").select("id, full_name, phone").order("full_name").then(({ data }) => setCustomers(data ?? []));
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!search.trim()) { setItems([]); return; }
      const s = search.trim();
      const { data } = await supabase.from("inventory_items")
        .select("*").eq("status", "in_stock")
        .or(`name.ilike.%${s}%,sku.ilike.%${s}%,qr_code.eq.${s},barcode.eq.${s}`)
        .limit(20);
      setItems(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  async function addToCart(item: any) {
    // fetch latest rate for this metal/purity
    const { data: rateRow } = await supabase.from("metal_rates")
      .select("rate_per_gram").eq("metal", item.metal).eq("purity", item.purity)
      .order("effective_date", { ascending: false }).limit(1).maybeSingle();
    const rate = Number(rateRow?.rate_per_gram ?? 0);
    const { making, wastageAmount, lineTotal } = computeLineTotal({
      netWeight: Number(item.net_weight), ratePerGram: rate,
      makingCharge: Number(item.making_charge), makingChargeType: item.making_charge_type as any,
      wastageType: item.wastage_type as any, wastageValue: Number(item.wastage_value),
      stoneValue: Number(item.stone_value), quantity: 1,
    });
    setCart((c) => [...c, {
      inventory_item_id: item.id,
      description: `${item.name} (${item.sku})`,
      metal: item.metal, purity: item.purity,
      weight: Number(item.net_weight), rate, making_charge: making,
      wastage_amount: wastageAmount, stone_value: Number(item.stone_value),
      quantity: 1, line_total: lineTotal,
    }]);
    setSearch(""); setItems([]);
  }

  function removeRow(idx: number) { setCart((c) => c.filter((_, i) => i !== idx)); }

  const subtotal = useMemo(() => cart.reduce((a, r) => a + r.line_total, 0), [cart]);
  const taxable = Math.max(0, subtotal - discount);
  const vat = taxable * VAT_RATE / 100;
  const total = Math.max(0, taxable + vat - oldGoldCredit);
  const balance = Math.max(0, total - paid);

  async function checkout() {
    if (cart.length === 0) return toast.error("Add at least one item");
    setSaving(true);
    try {
      const { data: seqVal, error: seqErr } = await supabase.rpc("nextval" as any, { sequence_name: "seq_invoice_no" } as any) as any;
      // Fallback if RPC isn't available — use timestamp
      const num = seqVal ? Number(seqVal) : Math.floor(Date.now() / 1000) % 100000;
      const invNumber = nextNumber("INV", num, 5);

      const status = paid >= total ? "paid" : paid > 0 ? "partial" : "issued";

      const { data: inv, error } = await supabase.from("invoices").insert({
        invoice_number: invNumber,
        customer_id: customerId,
        subtotal, vat_rate: VAT_RATE, vat_amount: vat,
        discount, old_gold_credit: oldGoldCredit, total,
        amount_paid: paid, balance_due: balance,
        notes: notes || null, status, created_by: user?.id,
      }).select().single();
      if (error) throw error;

      const lines = cart.map((r) => ({ invoice_id: inv.id, ...r }));
      const { error: lErr } = await supabase.from("invoice_items").insert(lines as any);
      if (lErr) throw lErr;

      if (paid > 0) {
        await supabase.from("payments").insert({
          invoice_id: inv.id, customer_id: customerId, amount: paid,
          method: method as any, created_by: user?.id,
        });
      }

      // mark inventory items as sold
      const itemIds = cart.map((r) => r.inventory_item_id).filter(Boolean) as string[];
      if (itemIds.length) {
        await supabase.from("inventory_items").update({ status: "sold" }).in("id", itemIds);
      }

      // adjust customer balance if credit
      if (balance > 0 && customerId) {
        const { data: cust } = await supabase.from("customers").select("balance").eq("id", customerId).single();
        await supabase.from("customers").update({ balance: Number(cust?.balance ?? 0) + balance }).eq("id", customerId);
      }

      toast.success(`Invoice ${invNumber} created`);
      nav(`/invoices/${inv.id}`);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <AppLayout title="New Sale (POS)">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent>
              <Select value={customerId ?? "walkin"} onValueChange={(v) => setCustomerId(v === "walkin" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkin">Walk-in customer</SelectItem>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone && `· ${c.phone}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Add items</CardTitle></CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Scan QR or search name / SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {items.length > 0 && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded border">
                  {items.map((i) => (
                    <button key={i.id} onClick={() => addToCart(i)}
                      className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted">
                      <div>
                        <div className="font-medium">{i.name}</div>
                        <div className="text-xs text-muted-foreground">{i.sku} · {i.metal} {i.purity} · {i.net_weight}g</div>
                      </div>
                      <Plus className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              )}

              <Table className="mt-3">
                <TableHeader><TableRow>
                  <TableHead>Item</TableHead><TableHead className="text-right">Wt</TableHead>
                  <TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Line</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {cart.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Cart is empty</TableCell></TableRow>
                    : cart.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell><div className="font-medium">{r.description}</div>
                          <div className="text-xs text-muted-foreground">{r.metal} {r.purity}</div></TableCell>
                        <TableCell className="text-right">{r.weight.toFixed(3)}g</TableCell>
                        <TableCell className="text-right">{npr(r.rate)}</TableCell>
                        <TableCell className="text-right font-medium">{npr(r.line_total)}</TableCell>
                        <TableCell><Button size="icon" variant="ghost" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Row label="Subtotal" value={npr(subtotal)} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <Input type="number" className="h-8 w-28 text-right" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
            </div>
            <Row label={`VAT (${VAT_RATE}%)`} value={npr(vat)} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Old gold credit</span>
              <Input type="number" className="h-8 w-28 text-right" value={oldGoldCredit} onChange={(e) => setOldGoldCredit(Number(e.target.value) || 0)} />
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-semibold"><span>Total</span><span>{npr(total)}</span></div>
            <div>
              <Label>Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount received</Label>
              <Input type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value) || 0)} />
              <div className="mt-1 text-right text-xs text-muted-foreground">Balance: {npr(balance)}</div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={checkout} disabled={saving || cart.length === 0}>
              {saving ? "Processing..." : "Complete Sale"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
