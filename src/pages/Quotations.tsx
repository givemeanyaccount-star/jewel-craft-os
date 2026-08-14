import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Search, FileText, Eye, Pencil, CalendarIcon, ShoppingCart } from "lucide-react";
import {
  npr, nextNumber, computeInvoiceTaxes, discountForTargetTotal,
  round2,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { QRScanButton } from "@/components/QRScanButton";
import { toast } from "sonner";
import { CartRow, recompute, lineDisplay, Detail } from "@/pages/POS";
import { ItemDialog } from "@/pages/Inventory";
import { deleteQuotation, releaseQuotationItems, reserveQuotationItems, sweepExpiredQuotations } from "@/lib/quotations";

const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

export default function Quotations() {
  const { user, hasRole } = useAuth();
  const nav = useNavigate();
  const canWrite = hasRole("admin") || hasRole("manager") || hasRole("sales");
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  useEffect(() => { init(); }, []);
  async function init() {
    await sweepExpiredQuotations();
    load();
  }
  async function load() {
    const { data } = await supabase.from("quotations")
      .select("*, customers(full_name)").order("created_at", { ascending: false }).limit(200);
    setList(data ?? []);
  }

  async function remove(q: any) {
    if (!confirm(`Delete quotation ${q.quote_number}? Reserved items will return to stock.`)) return;
    try {
      await deleteQuotation(q.id);
      toast.success("Quotation deleted");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  function convert(q: any) {
    nav("/pos", { state: { quotationId: q.id, quoteNumber: q.quote_number } });
  }

  return (
    <AppLayout title="Quotations" actions={canWrite && (
      <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> New Quotation</Button>
    )}>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Quote #</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead>
            <TableHead>Valid until</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {list.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No quotations</TableCell></TableRow>
              : list.map((q) => (
                <TableRow key={q.id} className="cursor-pointer" onClick={() => nav(`/quotations/${q.id}`)}>
                  <TableCell className="font-medium">{q.quote_number}</TableCell>
                  <TableCell>{q.customers?.full_name ?? "—"}</TableCell>
                  <TableCell>{new Date(q.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{q.valid_until ? new Date(q.valid_until).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={q.status === "expired" ? "destructive" : "secondary"} className="capitalize">{q.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{npr(q.total)}</TableCell>
                  <TableCell className="w-40" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-0.5">
                      <Button size="icon" variant="ghost" title="View" onClick={() => nav(`/quotations/${q.id}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canWrite && q.status !== "expired" && (
                        <>
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => { setEditing(q); setOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Convert to sale" onClick={() => convert(q)}>
                            <ShoppingCart className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {canWrite && q.status === "expired" && (
                        <Button size="icon" variant="ghost" title="Delete expired quotation" onClick={() => remove(q)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <QuotationBuilder open={open} onOpenChange={setOpen} userId={user?.id ?? null} editing={editing}
        onSaved={(id) => { setOpen(false); setEditing(null); load(); if (id) nav(`/quotations/${id}`); }} />
    </AppLayout>
  );
}

function QuotationBuilder({ open, onOpenChange, userId, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; userId: string | null;
  editing: any | null; onSaved: (id?: string) => void;
}) {
  const { settings } = useAppSettings();
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [discount, setDiscount] = useState(0);
  const [oldGoldCredit, setOldGoldCredit] = useState(0);
  const [targetTotal, setTargetTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [validDays, setValidDays] = useState(7);
  const [validUntil, setValidUntil] = useState<string>(isoDate(new Date(Date.now() + 7 * 86400000)));
  const [saving, setSaving] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<{ row: number; item: any } | null>(null);
  const [originalItemIds, setOriginalItemIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase.from("customers").select("id, full_name, phone").order("full_name").then(({ data }) => setCustomers(data ?? []));
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCategories(data ?? []));
    supabase.from("locations").select("id, name").order("name").then(({ data }) => setLocations(data ?? []));
  }, [open]);

  // Load an existing quotation for editing, or reset for a new one
  useEffect(() => {
    if (!open) return;
    if (!editing) {
      setCustomerId(null); setCart([]); setDiscount(0); setOldGoldCredit(0); setNotes("");
      setTargetTotal(""); setValidDays(7); setValidUntil(isoDate(new Date(Date.now() + 7 * 86400000)));
      setOriginalItemIds([]);
      return;
    }
    (async () => {
      const { data: lines } = await supabase.from("quotation_items").select("*").eq("quotation_id", editing.id);
      setCustomerId(editing.customer_id);
      setDiscount(Number(editing.discount ?? 0));
      setOldGoldCredit(Number(editing.old_gold_credit ?? 0));
      setNotes(editing.notes ?? "");
      setValidUntil(editing.valid_until ? String(editing.valid_until).slice(0, 10) : isoDate(new Date()));
      setOriginalItemIds((lines ?? []).map((l: any) => l.inventory_item_id).filter(Boolean));
      setCart((lines ?? []).map((l: any) => recompute({
        inventory_item_id: l.inventory_item_id,
        description: l.description,
        metal: l.metal ?? undefined, purity: l.purity ?? undefined,
        gross_weight: Number(l.gross_weight ?? 0),
        stone_weight: Number(l.stone_weight ?? 0),
        weight: Number(l.weight ?? 0),
        rate: Number(l.rate ?? 0),
        making_charge: Number(l.making_charge ?? 0),
        wastage_amount: Number(l.wastage_amount ?? 0),
        stone_value: Number(l.stone_value ?? 0),
        quantity: Number(l.quantity ?? 1),
        line_total: Number(l.line_total ?? 0),
        making_input: Number(l.making_input ?? 0),
        making_type: (l.making_type ?? "per_gram") as any,
        wastage_input: Number(l.wastage_input ?? 0),
        wastage_type: (l.wastage_type ?? "percentage") as any,
      })));
    })();
  }, [open, editing]);

  useEffect(() => {
    if (!open) return;
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
  }, [search, categoryId, open]);

  async function fetchRate(metal: string, purity: string): Promise<number> {
    const { data } = await supabase.from("metal_rates")
      .select("rate_per_gram").eq("metal", metal as any).eq("purity", purity)
      .order("effective_date", { ascending: false }).limit(1).maybeSingle();
    return Number(data?.rate_per_gram ?? 0);
  }

  async function addToCart(item: any) {
    const rate = await fetchRate(item.metal, item.purity);
    if (!rate) toast.warning(`No ${item.metal} ${item.purity} rate set.`);
    const row: CartRow = {
      inventory_item_id: item.id,
      description: `${item.name} (${item.sku})`,
      metal: item.metal, purity: item.purity,
      gross_weight: Number(item.gross_weight ?? item.net_weight ?? 0),
      stone_weight: Number(item.stone_weight ?? 0),
      weight: Number(item.net_weight),
      rate, making_charge: 0, wastage_amount: 0,
      stone_value: Number(item.stone_value ?? 0),
      quantity: 1, line_total: 0,
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
      .or(`qr_code.eq.${trimmed},sku.eq.${trimmed},barcode.eq.${trimmed}`).maybeSingle();
    if (!data) return toast.error("No in-stock item for: " + trimmed);
    addToCart(data);
  }

  const subtotal = useMemo(() => round2(cart.reduce((a, r) => a + r.line_total, 0)), [cart]);
  const stonesTotal = useMemo(() => round2(cart.reduce((a, r) => a + (Number(r.stone_value) || 0) * (r.quantity || 1), 0)), [cart]);
  const tax = useMemo(() => computeInvoiceTaxes({
    subtotal, stonesTotal, discount, oldGoldCredit,
    vatRate: settings.vat_rate, vatEnabled: settings.vat_enabled, sdTaxRate: settings.sd_tax_rate,
  }), [subtotal, stonesTotal, discount, oldGoldCredit, settings]);

  function applyTargetTotal() {
    const t = Number(targetTotal);
    if (!t || t <= 0) return toast.error("Enter target net amount");
    const d = discountForTargetTotal({ subtotal, stonesTotal, oldGoldCredit, targetTotal: t,
      vatRate: settings.vat_rate, vatEnabled: settings.vat_enabled, sdTaxRate: settings.sd_tax_rate });
    setDiscount(d);
    toast.success(`Discount set to ${npr(d)}`);
  }

  function applyValidDays(days: number) {
    setValidDays(days);
    if (days > 0) setValidUntil(isoDate(new Date(Date.now() + days * 86400000)));
  }

  async function save() {
    if (!customerId) return toast.error("Select a customer for this quotation");
    if (cart.length === 0) return toast.error("Add at least one item");
    if (cart.some((r) => r.rate <= 0)) return toast.error("One or more lines have no rate.");
    setSaving(true);
    try {
      const payload = {
        customer_id: customerId,
        subtotal, stones_total: stonesTotal,
        vat_rate: settings.vat_enabled ? settings.vat_rate : 0, vat_amount: tax.vat,
        sd_tax_rate: settings.sd_tax_rate, sd_tax: tax.sdTax,
        luxury_tax_rate: 0, luxury_tax: 0,
        old_gold_credit: oldGoldCredit,
        discount, total: tax.total, notes: notes || null,
        valid_until: validUntil || null,
      };

      let quotationId = editing?.id as string | undefined;
      let quoteNumber = editing?.quote_number as string | undefined;

      if (editing) {
        const { error } = await supabase.from("quotations").update(payload as any).eq("id", editing.id);
        if (error) throw error;
        const { error: dErr } = await supabase.from("quotation_items").delete().eq("quotation_id", editing.id);
        if (dErr) throw dErr;
      } else {
        const { data: qNum, error: numErr } = await supabase.rpc("next_document_number", { p_prefix: "Q", p_pad: 5 });
        if (numErr) throw numErr;
        quoteNumber = qNum;
        const { data: q, error } = await supabase.from("quotations").insert({
          ...payload, quote_number: quoteNumber, status: "draft", created_by: userId,
        } as any).select().single();
        if (error) throw error;
        quotationId = q.id;
      }

      const lines = cart.map((r) => ({
        quotation_id: quotationId,
        inventory_item_id: r.inventory_item_id,
        description: r.description,
        metal: r.metal, purity: r.purity,
        gross_weight: r.gross_weight, stone_weight: r.stone_weight,
        weight: r.weight, rate: r.rate,
        making_charge: r.making_charge, making_input: r.making_input, making_type: r.making_type,
        wastage_amount: r.wastage_amount, wastage_input: r.wastage_input, wastage_type: r.wastage_type,
        stone_value: r.stone_value, quantity: r.quantity, line_total: r.line_total,
      }));
      const { error: lErr } = await supabase.from("quotation_items").insert(lines as any);
      if (lErr) throw lErr;

      // Reserve current items, release any that were dropped while editing
      const currentIds = cart.map((r) => r.inventory_item_id).filter(Boolean) as string[];
      await reserveQuotationItems(currentIds);
      const dropped = originalItemIds.filter((id) => !currentIds.includes(id));
      await releaseQuotationItems(dropped);

      toast.success(`Quotation ${quoteNumber} saved — items reserved`);
      onSaved(quotationId);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" /> {editing ? `Edit Quotation ${editing.quote_number}` : "New Quotation"}
        </DialogTitle></DialogHeader>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div>
              <Label>Customer *</Label>
              <Select value={customerId ?? ""} onValueChange={(v) => setCustomerId(v)}>
                <SelectTrigger className={!customerId ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select customer (required)" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone && `· ${c.phone}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
              <Button size="sm" variant="secondary" onClick={() => setNewItemOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> New item
              </Button>
            </div>
            {items.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded border">
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
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Net Wt</TableHead>
                <TableHead className="text-right">Rate/g</TableHead>
                <TableHead className="text-right">Stone</TableHead>
                <TableHead className="text-right">Line</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {cart.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No items</TableCell></TableRow>
                  : cart.map((r, i) => {
                    const d = lineDisplay(r);
                    return (
                      <Fragment key={i}>
                        <TableRow>
                          <TableCell>
                            <div className="font-medium">{r.description}</div>
                            <div className="text-xs text-muted-foreground">{r.metal} {r.purity}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <NumberField decimals={3} className="h-8 w-20 text-right" value={r.weight}
                              onChange={(v) => updateRow(i, { weight: v })} />
                          </TableCell>
                          <TableCell className="text-right">
                            <NumberField className={`h-8 w-28 text-right ${r.rate <= 0 ? "border-destructive" : ""}`}
                              value={r.rate} onChange={(v) => updateRow(i, { rate: v })} />
                          </TableCell>
                          <TableCell className="text-right">
                            <NumberField className="h-8 w-24 text-right" value={r.stone_value}
                              onChange={(v) => updateRow(i, { stone_value: v })} />
                          </TableCell>
                          <TableCell className="text-right font-medium">{npr(r.line_total)}</TableCell>
                          <TableCell className="flex gap-0.5">
                            {r.raw_item && (
                              <Button size="icon" variant="ghost" onClick={() => setEditItem({ row: i, item: r.raw_item })}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                        <TableRow className="border-b bg-muted/30 hover:bg-muted/30">
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
          </div>

          <Card className="h-fit">
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{npr(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">  Stones (VAT-able)</span><span>{npr(stonesTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">  Gold + Making + Wastage</span><span>{npr(tax.nonStoneTotal)}</span></div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <NumberField className="h-8 w-28 text-right" value={discount}
                  onChange={(v) => { setDiscount(v); setTargetTotal(""); }} />
              </div>
              {settings.vat_enabled && <div className="flex justify-between"><span className="text-muted-foreground">VAT {settings.vat_rate}% (stones)</span><span>{npr(tax.vat)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">SD tax {settings.sd_tax_rate}%</span><span>{npr(tax.sdTax)}</span></div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Old metal credit</span>
                <NumberField className="h-8 w-28 text-right" value={oldGoldCredit}
                  onChange={(v) => setOldGoldCredit(v)} />
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{npr(tax.total)}</span></div>
              <div className="rounded-md border bg-muted/40 p-2">
                <Label className="text-xs">Set net amount (auto-discount)</Label>
                <div className="mt-1 flex gap-2">
                  <NumberField placeholder="e.g. 150000" value={targetTotal} onChange={(v) => setTargetTotal(v ? String(v) : "")} />
                  <Button size="sm" variant="secondary" onClick={applyTargetTotal}>Apply</Button>
                </div>
              </div>
              <div>
                <Label>Valid for (days)</Label>
                <NumberField decimals={0} value={validDays} onChange={(v) => applyValidDays(v)} />
              </div>
              <div>
                <Label>Or pick expiry date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !validUntil && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {validUntil ? format(new Date(validUntil), "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={validUntil ? new Date(validUntil) : undefined}
                      onSelect={(d) => d && setValidUntil(isoDate(d))}
                      initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || cart.length === 0 || !customerId}>
            {saving ? "Saving..." : editing ? "Update Quotation" : "Save Quotation"}
          </Button>
        </DialogFooter>

        <ItemDialog open={newItemOpen} onOpenChange={setNewItemOpen}
          editing={null} cats={categories as any} locs={locations as any}
          onSaved={(created) => {
            setNewItemOpen(false);
            if (created) { addToCart(created); toast.success(`${created.sku} added`); }
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
      </DialogContent>
    </Dialog>
  );
}
