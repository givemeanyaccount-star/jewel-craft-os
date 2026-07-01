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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Search, ShoppingCart, RefreshCw, UserPlus, Coins } from "lucide-react";
import {
  npr, computeLineTotal, VAT_RATE, LUXURY_TAX_RATE, LUXURY_TAX_THRESHOLD,
  nextNumber, computeInvoiceTaxes, discountForTargetTotal,
  computeNetWeight, computeFineWeight,
} from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { QRScanButton } from "@/components/QRScanButton";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "credit", "old_gold", "other"];
const OG_METALS = ["gold", "silver", "platinum"];
const OG_PURITIES = ["24K", "22K", "20K", "18K", "999", "925"];

interface CartRow {
  inventory_item_id: string | null;
  description: string;
  metal?: string; purity?: string;
  weight: number;
  rate: number;
  making_charge: number;       // computed money amount
  wastage_amount: number;      // computed money amount
  stone_value: number;
  quantity: number;
  line_total: number;
  // raw rule fields (kept for live recompute)
  making_input: number;
  making_type: "per_gram" | "fixed" | "percentage";
  wastage_input: number;
  wastage_type: "percentage" | "weight" | "fixed";
}

function recompute(r: CartRow): CartRow {
  const { making, wastageAmount, lineTotal } = computeLineTotal({
    netWeight: r.weight,
    ratePerGram: r.rate,
    makingCharge: r.making_input,
    makingChargeType: r.making_type,
    wastageType: r.wastage_type,
    wastageValue: r.wastage_input,
    stoneValue: r.stone_value,
    quantity: r.quantity,
  });
  return { ...r, making_charge: making, wastage_amount: wastageAmount, line_total: lineTotal };
}

export default function POS() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [todayRates, setTodayRates] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [discount, setDiscount] = useState(0);
  const [oldGoldCredit, setOldGoldCredit] = useState(0);
  const [targetTotal, setTargetTotal] = useState<string>("");
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [newCustOpen, setNewCustOpen] = useState(false);
  const [ogOpen, setOgOpen] = useState(false);

  useEffect(() => { loadCustomers(); }, []);
  async function loadCustomers() {
    const { data } = await supabase.from("customers").select("id, full_name, phone").order("full_name");
    setCustomers(data ?? []);
  }
  useEffect(() => {
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCategories(data ?? []));
    const today = new Date().toISOString().slice(0, 10);
    supabase.from("metal_rates").select("metal, purity, rate_per_gram, effective_date, source")
      .eq("effective_date", today).order("metal").then(({ data }) => setTodayRates(data ?? []));
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const s = search.trim();
      if (!s && categoryId === "all") { setItems([]); return; }
      let q = supabase.from("inventory_items").select("*").eq("status", "in_stock");
      if (categoryId !== "all") q = q.eq("category_id", categoryId);
      if (s) q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%,qr_code.eq.${s},barcode.eq.${s}`);
      const { data } = await q.limit(30);
      setItems(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [search, categoryId]);


  async function fetchRate(metal: string, purity: string): Promise<number> {
    const { data } = await supabase.from("metal_rates")
      .select("rate_per_gram").eq("metal", metal as any).eq("purity", purity)
      .order("effective_date", { ascending: false }).limit(1).maybeSingle();
    return Number(data?.rate_per_gram ?? 0);
  }

  async function addToCart(item: any) {
    const rate = await fetchRate(item.metal, item.purity);
    if (!rate) toast.warning(`No ${item.metal} ${item.purity} rate set — enter rate on the line or update Metal Rates.`);
    const row: CartRow = {
      inventory_item_id: item.id,
      description: `${item.name} (${item.sku})`,
      metal: item.metal, purity: item.purity,
      weight: Number(item.net_weight),
      rate,
      making_charge: 0,
      wastage_amount: 0,
      stone_value: Number(item.stone_value ?? 0),
      quantity: 1,
      line_total: 0,
      making_input: Number(item.making_charge ?? 0),
      making_type: (item.making_charge_type ?? "per_gram") as any,
      wastage_input: Number(item.wastage_value ?? 0),
      wastage_type: (item.wastage_type ?? "percentage") as any,
    };
    setCart((c) => [...c, recompute(row)]);
    setSearch(""); setItems([]);
  }

  function updateRow(idx: number, patch: Partial<CartRow>) {
    setCart((c) => c.map((r, i) => i === idx ? recompute({ ...r, ...patch }) : r));
  }
  function removeRow(idx: number) { setCart((c) => c.filter((_, i) => i !== idx)); }

  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const { data } = await supabase.from("inventory_items")
      .select("*").eq("status", "in_stock")
      .or(`qr_code.eq.${trimmed},sku.eq.${trimmed},barcode.eq.${trimmed}`)
      .maybeSingle();
    if (!data) return toast.error("No in-stock item for: " + trimmed);
    addToCart(data);
  }

  async function refreshAllRates() {
    const updated = await Promise.all(cart.map(async (r) => {
      if (!r.metal || !r.purity) return r;
      const rate = await fetchRate(r.metal, r.purity);
      return recompute({ ...r, rate: rate || r.rate });
    }));
    setCart(updated);
    toast.success("Rates refreshed");
  }

  const subtotal = useMemo(() => cart.reduce((a, r) => a + r.line_total, 0), [cart]);
  const stonesTotal = useMemo(() => cart.reduce((a, r) => a + (Number(r.stone_value) || 0) * (r.quantity || 1), 0), [cart]);

  const tax = useMemo(() => computeInvoiceTaxes({
    subtotal, stonesTotal, discount, oldGoldCredit,
    vatRate: VAT_RATE, luxuryTaxRate: LUXURY_TAX_RATE, luxuryTaxThreshold: LUXURY_TAX_THRESHOLD,
  }), [subtotal, stonesTotal, discount, oldGoldCredit]);

  const balance = Math.max(0, tax.total - paid);

  function applyTargetTotal() {
    const t = Number(targetTotal);
    if (!t || t <= 0) return toast.error("Enter target net amount");
    const d = discountForTargetTotal({
      subtotal, stonesTotal, oldGoldCredit, targetTotal: t,
    });
    setDiscount(d);
    toast.success(`Discount set to ${npr(d)} to reach ${npr(t)}`);
  }

  async function checkout() {
    if (cart.length === 0) return toast.error("Add at least one item");
    if (cart.some((r) => r.rate <= 0)) return toast.error("One or more lines have no rate. Set rate or update Metal Rates.");
    setSaving(true);
    try {
      const num = Math.floor(Date.now() / 1000) % 100000;
      const invNumber = nextNumber("INV", num, 5);
      const status = paid >= tax.total ? "paid" : paid > 0 ? "partial" : "issued";

      const { data: inv, error } = await supabase.from("invoices").insert({
        invoice_number: invNumber,
        customer_id: customerId,
        subtotal,
        stones_total: stonesTotal,
        vat_rate: VAT_RATE, vat_amount: tax.vat,
        luxury_tax_rate: LUXURY_TAX_RATE, luxury_tax: tax.luxuryTax,
        discount, old_gold_credit: oldGoldCredit, total: tax.total,
        amount_paid: paid, balance_due: balance,
        notes: notes || null, status, created_by: user?.id,
      } as any).select().single();
      if (error) throw error;

      const lines = cart.map((r) => ({
        invoice_id: inv.id,
        inventory_item_id: r.inventory_item_id,
        description: r.description,
        metal: r.metal, purity: r.purity,
        weight: r.weight, rate: r.rate,
        making_charge: r.making_charge,
        making_input: r.making_input, making_type: r.making_type,
        wastage_amount: r.wastage_amount,
        wastage_input: r.wastage_input, wastage_type: r.wastage_type,
        stone_value: r.stone_value,
        quantity: r.quantity,
        line_total: r.line_total,
      }));
      const { error: lErr } = await supabase.from("invoice_items").insert(lines as any);
      if (lErr) throw lErr;

      if (paid > 0) {
        await supabase.from("payments").insert({
          invoice_id: inv.id, customer_id: customerId, amount: paid,
          method: method as any, created_by: user?.id,
        });
      }

      const itemIds = cart.map((r) => r.inventory_item_id).filter(Boolean) as string[];
      if (itemIds.length) {
        await supabase.from("inventory_items").update({ status: "sold" }).in("id", itemIds);
      }

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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Add items</CardTitle>
              {cart.length > 0 && (
                <Button size="sm" variant="outline" onClick={refreshAllRates}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Refresh rates
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {todayRates.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2 rounded-md border bg-muted/40 p-2 text-xs">
                  <span className="font-medium">Today's rate:</span>
                  {todayRates.map((r, i) => (
                    <span key={i} className="rounded bg-background px-2 py-0.5">
                      <span className="capitalize">{r.metal}</span> {r.purity}: <strong>{npr(r.rate_per_gram)}</strong>/g
                    </span>
                  ))}
                  {todayRates[0]?.source && <span className="text-muted-foreground">· src: {todayRates[0].source}</span>}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="sm:w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Scan QR or search name / SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
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
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Wt (g)</TableHead>
                  <TableHead className="text-right">Rate/g</TableHead>
                  <TableHead className="text-right">Stone</TableHead>
                  <TableHead className="text-right">Line</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {cart.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Cart is empty</TableCell></TableRow>
                    : cart.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="font-medium">{r.description}</div>
                          <div className="text-xs text-muted-foreground">{r.metal} {r.purity}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Making: {npr(r.making_charge)} · Wastage: {npr(r.wastage_amount)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" className="h-8 w-20 text-right" value={r.weight}
                            onChange={(e) => updateRow(i, { weight: Number(e.target.value) || 0 })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" className={`h-8 w-28 text-right ${r.rate <= 0 ? "border-destructive" : ""}`}
                            value={r.rate} onChange={(e) => updateRow(i, { rate: Number(e.target.value) || 0 })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" className="h-8 w-24 text-right" value={r.stone_value}
                            onChange={(e) => updateRow(i, { stone_value: Number(e.target.value) || 0 })} />
                        </TableCell>
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
            <Row label="  Stones (VAT-able)" value={npr(stonesTotal)} />
            <Row label="  Gold + Making + Wastage" value={npr(tax.nonStoneTotal)} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <Input type="number" className="h-8 w-28 text-right" value={discount}
                onChange={(e) => { setDiscount(Number(e.target.value) || 0); setTargetTotal(""); }} />
            </div>
            <Row label={`VAT ${VAT_RATE}% (stones only)`} value={npr(tax.vat)} />
            <Row label={`Luxury tax ${LUXURY_TAX_RATE}% (gold+making − old gold, if > ${npr(LUXURY_TAX_THRESHOLD)})`} value={npr(tax.luxuryTax)} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Old gold credit</span>
              <Input type="number" className="h-8 w-28 text-right" value={oldGoldCredit} onChange={(e) => setOldGoldCredit(Number(e.target.value) || 0)} />
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-semibold"><span>Total</span><span>{npr(tax.total)}</span></div>

            <div className="rounded-md border bg-muted/40 p-2">
              <Label className="text-xs">Set net amount (auto-discount)</Label>
              <div className="mt-1 flex gap-2">
                <Input type="number" placeholder="e.g. 150000" value={targetTotal} onChange={(e) => setTargetTotal(e.target.value)} />
                <Button size="sm" variant="secondary" onClick={applyTargetTotal}>Apply</Button>
              </div>
            </div>

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
