import { Fragment, useEffect, useMemo, useState } from "react";
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
import { Plus, Trash2, Search, ShoppingCart, RefreshCw, UserPlus, Coins, Pencil } from "lucide-react";
import {
  npr, computeLineTotal, SD_TAX_RATE,
  nextNumber, computeInvoiceTaxes, discountForTargetTotal,
  computeNetWeight, computeFineWeight, purityFactor,
} from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { QRScanButton } from "@/components/QRScanButton";
import { PuritySelect } from "@/components/PuritySelect";
import { useAppSettings } from "@/hooks/useAppSettings";
import { ItemDialog } from "@/pages/Inventory";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "credit", "old_gold", "other"];
const OG_METALS = ["gold", "silver", "platinum"];
const OG_PURITIES = ["24K", "22K", "20K", "18K", "999", "925"];

export interface CartRow {
  inventory_item_id: string | null;
  description: string;
  metal?: string; purity?: string;
  gross_weight: number;
  stone_weight: number;
  weight: number;              // net weight
  rate: number;
  making_charge: number;       // computed money amount
  wastage_amount: number;      // computed money amount
  stone_value: number;
  quantity: number;
  line_total: number;
  making_input: number;
  making_type: "per_gram" | "fixed" | "percentage";
  wastage_input: number;
  wastage_type: "percentage" | "weight" | "fixed";
  raw_item?: any; // full inventory row for editing
}

interface PayLine { method: string; amount: number; }

export function recompute(r: CartRow): CartRow {
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

// Derive display values matching the sales invoice columns.
export function lineDisplay(r: {
  weight?: number; rate?: number; wastage_type?: string; wastage_input?: number; wastage_amount?: number;
  stone_value?: number; making_charge?: number; quantity?: number; gross_weight?: number; stone_weight?: number;
}) {
  const netWt = Number(r.weight ?? 0);
  const rate = Number(r.rate ?? 0);
  const wastageWt = r.wastage_type === "weight"
    ? Number(r.wastage_input ?? 0)
    : (rate > 0 ? Number(r.wastage_amount ?? 0) / rate : 0);
  const totalWt = netWt + wastageWt;
  const goldAmt = totalWt * rate;
  const stoneAmt = Number(r.stone_value ?? 0);
  const making = Number(r.making_charge ?? 0);
  const qty = Number(r.quantity ?? 1);
  const rowTotal = (goldAmt + stoneAmt + making) * qty;
  const grossWt = Number(r.gross_weight ?? 0);
  const stoneWt = Number(r.stone_weight ?? 0);
  return { netWt, rate, wastageWt, totalWt, goldAmt, stoneAmt, making, qty, rowTotal, grossWt, stoneWt };
}

export default function POS() {
  const { user } = useAuth();
  const { settings } = useAppSettings();
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
  const [payments, setPayments] = useState<PayLine[]>([{ method: "cash", amount: 0 }]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<{ row: number; item: any } | null>(null);

  const [newCustOpen, setNewCustOpen] = useState(false);
  const [ogOpen, setOgOpen] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);

  useEffect(() => { loadCustomers(); }, []);
  async function loadCustomers() {
    const { data } = await supabase.from("customers").select("id, full_name, phone").order("full_name");
    setCustomers(data ?? []);
  }
  useEffect(() => {
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCategories(data ?? []));
    supabase.from("locations").select("id, name").order("name").then(({ data }) => setLocations(data ?? []));
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
      gross_weight: Number(item.gross_weight ?? item.net_weight ?? 0),
      stone_weight: Number(item.stone_weight ?? 0),
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
      raw_item: item,
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
    vatRate: settings.vat_rate, vatEnabled: settings.vat_enabled, sdTaxRate: settings.sd_tax_rate,
  }), [subtotal, stonesTotal, discount, oldGoldCredit, settings]);

  const paid = useMemo(() => payments.reduce((a, p) => a + (Number(p.amount) || 0), 0), [payments]);
  const balance = Math.max(0, tax.total - paid);

  function applyTargetTotal() {
    const t = Number(targetTotal);
    if (!t || t <= 0) return toast.error("Enter target net amount");
    const d = discountForTargetTotal({
      subtotal, stonesTotal, oldGoldCredit, targetTotal: t,
      vatRate: settings.vat_rate, vatEnabled: settings.vat_enabled, sdTaxRate: settings.sd_tax_rate,
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
        vat_rate: settings.vat_enabled ? settings.vat_rate : 0, vat_amount: tax.vat,
        sd_tax_rate: settings.sd_tax_rate, sd_tax: tax.sdTax,
        luxury_tax_rate: 0, luxury_tax: 0,
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
        gross_weight: r.gross_weight,
        stone_weight: r.stone_weight,
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

      const validPays = payments.filter((p) => Number(p.amount) > 0);
      if (validPays.length) {
        await supabase.from("payments").insert(validPays.map((p) => ({
          invoice_id: inv.id, customer_id: customerId, amount: Number(p.amount),
          method: p.method as any, created_by: user?.id,
        })));
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
              <div className="flex gap-2">
                <Select value={customerId ?? "walkin"} onValueChange={(v) => setCustomerId(v === "walkin" ? null : v)}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walkin">Walk-in customer</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone && `· ${c.phone}`}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setNewCustOpen(true)}>
                  <UserPlus className="mr-1 h-4 w-4" /> New
                </Button>
              </div>
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
                <QRScanButton onScan={handleScan} />
                <Button size="sm" variant="secondary" onClick={() => setNewItemOpen(true)} title="Create new item and add to sale">
                  <Plus className="mr-1 h-4 w-4" /> New item
                </Button>
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
                  <TableHead className="text-right">Net Wt (g)</TableHead>
                  <TableHead className="text-right">Rate/g</TableHead>
                  <TableHead className="text-right">Stone</TableHead>
                  <TableHead className="text-right">Line</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {cart.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Cart is empty</TableCell></TableRow>
                    : cart.map((r, i) => {
                      const d = lineDisplay(r);
                      return (
                      <Fragment key={i}>
                      <TableRow key={i}>
                        <TableCell>
                          <div className="font-medium">{r.description}</div>
                          <div className="text-xs text-muted-foreground">{r.metal} {r.purity}</div>
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
                        <TableCell className="flex gap-0.5">
                          {r.raw_item && (
                            <Button size="icon" variant="ghost" title="Edit inventory details"
                              onClick={() => setEditItem({ row: i, item: r.raw_item })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                      <TableRow key={`${i}-d`} className="border-b bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={6} className="py-2">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4 lg:grid-cols-6">
                            <Detail label="Purity" value={r.purity ?? "-"} />
                            <Detail label="Gross wt" value={`${d.grossWt.toFixed(3)} g`} />
                            <Detail label="Stone wt" value={`${d.stoneWt.toFixed(3)} g`} />
                            <Detail label="Net wt" value={`${d.netWt.toFixed(3)} g`} />
                            <Detail label="Wastage wt" value={`${d.wastageWt.toFixed(3)} g`} />
                            <Detail label="Total wt" value={`${d.totalWt.toFixed(3)} g`} />
                            <Detail label="Gold amt" value={npr(d.goldAmt)} />
                            <Detail label="Stone amt" value={npr(d.stoneAmt)} />
                            <Detail label="Making" value={npr(d.making)} />
                            <Detail label="Qty" value={String(d.qty)} />
                          </div>
                        </TableCell>
                      </TableRow>
                      </Fragment>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Row label="Subtotal" value={npr(subtotal)} />
            <Row label={settings.vat_enabled ? "  Stones (VAT-able)" : "  Stones"} value={npr(stonesTotal)} />
            <Row label="  Gold + Making + Wastage" value={npr(tax.nonStoneTotal)} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <Input type="number" className="h-8 w-28 text-right" value={discount}
                onChange={(e) => { setDiscount(Number(e.target.value) || 0); setTargetTotal(""); }} />
            </div>
            {settings.vat_enabled && <Row label={`VAT ${settings.vat_rate}% (stones only)`} value={npr(tax.vat)} />}
            <Row label={`SD tax ${settings.sd_tax_rate}% (gold+making − old gold)`} value={npr(tax.sdTax)} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Old gold credit</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setOgOpen(true)} title="New old gold purchase">
                  <Coins className="h-3.5 w-3.5" />
                </Button>
                <Input type="number" className="h-8 w-28 text-right" value={oldGoldCredit} onChange={(e) => setOldGoldCredit(Number(e.target.value) || 0)} />
              </div>
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
              <div className="flex items-center justify-between">
                <Label>Payments</Label>
                <Button size="sm" variant="ghost"
                  onClick={() => setPayments((p) => [...p, { method: "cash", amount: Math.max(0, tax.total - paid) }])}>
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
              <div className="mt-1 space-y-2">
                {payments.map((p, i) => (
                  <div key={i} className="flex gap-1">
                    <Select value={p.method} onValueChange={(v) => setPayments((arr) => arr.map((x, j) => j === i ? { ...x, method: v } : x))}>
                      <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" className="h-9 w-28 text-right" value={p.amount}
                      onChange={(e) => setPayments((arr) => arr.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) || 0 } : x))} />
                    {payments.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-9 w-9"
                        onClick={() => setPayments((arr) => arr.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Paid: {npr(paid)}</span>
                <span>Balance: {npr(balance)}</span>
              </div>
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

      <NewCustomerDialog open={newCustOpen} onOpenChange={setNewCustOpen}
        onSaved={async (id) => { setNewCustOpen(false); await loadCustomers(); setCustomerId(id); }} />
      <OldGoldQuickDialog open={ogOpen} onOpenChange={setOgOpen} userId={user?.id ?? null}
        customerId={customerId} customers={customers}
        onSaved={(amount) => { setOgOpen(false); setOldGoldCredit(amount); toast.success(`Old gold credit set to ${npr(amount)}`); }} />
      <ItemDialog open={newItemOpen} onOpenChange={setNewItemOpen}
        editing={null} cats={categories as any} locs={locations as any}
        onSaved={(created) => {
          setNewItemOpen(false);
          if (created) { addToCart(created); toast.success(`${created.sku} added to sale`); }
        }} />
      <ItemDialog open={!!editItem} onOpenChange={(v) => !v && setEditItem(null)}
        editing={editItem?.item ?? null} cats={categories as any} locs={locations as any}
        onSaved={async () => {
          if (!editItem) return;
          const { data } = await supabase.from("inventory_items").select("*").eq("id", editItem.item.id).maybeSingle();
          if (data) {
            setCart((c) => c.map((r, i) => i === editItem.row ? recompute({
              ...r,
              description: `${data.name} (${data.sku})`,
              metal: data.metal, purity: data.purity,
              gross_weight: Number(data.gross_weight ?? data.net_weight ?? 0),
              stone_weight: Number(data.stone_weight ?? 0),
              weight: Number(data.net_weight),
              stone_value: Number(data.stone_value ?? 0),
              making_input: Number(data.making_charge ?? 0),
              making_type: (data.making_charge_type ?? "per_gram") as any,
              wastage_input: Number(data.wastage_value ?? 0),
              wastage_type: (data.wastage_type ?? "percentage") as any,
              raw_item: data,
            }) : r));
            toast.success("Item updated");
          }
          setEditItem(null);
        }} />
    </AppLayout>
  );
}

function NewCustomerDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: (id: string) => void;
}) {
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setName(""); setPhone(""); setEmail(""); setAddress(""); } }, [open]);
  async function save() {
    if (!full_name.trim()) return toast.error("Name required");
    setSaving(true);
    const { data, error } = await supabase.from("customers").insert({
      full_name: full_name.trim(), phone: phone || null, email: email || null, address: address || null,
    } as any).select("id").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    onSaved(data.id);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name *</Label><Input value={full_name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OldGoldQuickDialog({ open, onOpenChange, userId, customerId, customers, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; userId: string | null;
  customerId: string | null; customers: any[]; onSaved: (amount: number) => void;
}) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    const cust = customers.find((c) => c.id === customerId);
    setForm({
      customer_name: cust?.full_name ?? "", customer_phone: cust?.phone ?? "",
      id_doc_type: "citizenship", id_doc_number: "",
      metal: "gold", purity: "22K", gross_weight: 0, stone_weight: 0,
      rate_per_gram: 0, deduction: 0, payment_method: "old_gold", notes: "",
    });
  }, [open, customerId, customers]);
  const net = computeNetWeight(Number(form.gross_weight || 0), Number(form.stone_weight || 0));
  const fine = computeFineWeight(net, form.purity || "");
  const total = Math.max(0, fine * Number(form.rate_per_gram || 0) - Number(form.deduction || 0));

  async function save() {
    if (!form.customer_name?.trim()) return toast.error("Customer name required");
    if (!form.gross_weight) return toast.error("Weight required");
    if (!form.rate_per_gram) return toast.error("Rate required");
    setSaving(true);
    try {
      const num = Math.floor(Date.now() / 1000) % 100000;
      const receipt = nextNumber("OG", num, 5);
      const { error } = await supabase.from("old_gold_purchases").insert({
        receipt_number: receipt,
        customer_name: form.customer_name.trim(), customer_phone: form.customer_phone || null,
        id_doc_type: form.id_doc_type, id_doc_number: form.id_doc_number || null,
        metal: form.metal, purity: form.purity,
        gross_weight: Number(form.gross_weight), stone_weight: Number(form.stone_weight) || 0,
        net_weight: net, fine_weight: fine,
        rate_per_gram: Number(form.rate_per_gram), deduction: Number(form.deduction) || 0,
        total_amount: total, payment_method: form.payment_method, notes: form.notes || null,
        created_by: userId,
      } as any);
      if (error) throw error;
      toast.success(`Receipt ${receipt} created`);
      onSaved(total);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Coins className="h-5 w-5" /> Old Gold Purchase</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Customer name *</Label><Input value={form.customer_name ?? ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.customer_phone ?? ""} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
          <div><Label>ID number</Label><Input value={form.id_doc_number ?? ""} onChange={(e) => setForm({ ...form, id_doc_number: e.target.value })} /></div>
          <div><Label>Metal</Label>
            <Select value={form.metal} onValueChange={(v) => setForm({ ...form, metal: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{OG_METALS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Purity</Label>
            <Select value={form.purity} onValueChange={(v) => setForm({ ...form, purity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{OG_PURITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Gross wt (g)</Label><Input type="number" step="0.001" value={form.gross_weight ?? 0} onChange={(e) => setForm({ ...form, gross_weight: e.target.value })} /></div>
          <div><Label>Stone wt (g)</Label><Input type="number" step="0.001" value={form.stone_weight ?? 0} onChange={(e) => setForm({ ...form, stone_weight: e.target.value })} /></div>
          <div><Label>Net (auto)</Label><Input readOnly value={net.toFixed(3)} className="bg-muted" /></div>
          <div><Label>Fine (auto)</Label><Input readOnly value={fine.toFixed(3)} className="bg-muted" /></div>
          <div><Label>Rate/g (fine)</Label><Input type="number" value={form.rate_per_gram ?? 0} onChange={(e) => setForm({ ...form, rate_per_gram: e.target.value })} /></div>
          <div><Label>Deduction</Label><Input type="number" value={form.deduction ?? 0} onChange={(e) => setForm({ ...form, deduction: e.target.value })} /></div>
          <div className="md:col-span-2 rounded bg-secondary p-3 text-center">
            <div className="text-xs text-muted-foreground">Purchase total → applies as old gold credit</div>
            <div className="text-2xl font-semibold">{npr(total)}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create & Apply"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/50 pb-0.5 sm:justify-start sm:gap-1 sm:border-0">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
