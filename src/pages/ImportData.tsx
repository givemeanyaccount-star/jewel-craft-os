import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/DateField";
import { DateText } from "@/components/DateText";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { npr, round2 } from "@/lib/format";
import {
  STOCK_COLUMNS, BILL_COLUMNS, PAY_METHODS, parseStockRows, groupBillRows, billTotalOf,
  type StockRow, type BillDraft,
} from "@/lib/importParse";

const PURITIES = ["24K", "22K", "18K", "14K", "999", "925"];

function downloadTemplate(name: string, cols: string[], sample: (string | number)[]) {
  const ws = XLSX.utils.aoa_to_sheet([cols, sample]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${name}-template.xlsx`);
}

async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
}

export default function ImportData() {
  const { hasRole } = useAuth();
  const [goLive, setGoLive] = useState<string>("");
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("app_settings").select("id, go_live_date").limit(1).maybeSingle().then(({ data }) => {
      setSettingsId(data?.id ?? null); setGoLive((data as any)?.go_live_date ?? "");
    });
  }, []);

  async function saveGoLive(v: string) {
    setGoLive(v);
    if (!settingsId) return;
    const { error } = await supabase.from("app_settings").update({ go_live_date: v || null } as any).eq("id", settingsId);
    if (error) toast.error(error.message); else toast.success("Go-live date saved");
  }

  if (!hasRole("admin") && !hasRole("manager")) return <AppLayout title="Bring over old records"><p>Access denied.</p></AppLayout>;

  return (
    <AppLayout title="Bring over old records">
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="w-56">
            <Label>Started using this app on</Label>
            <DateField value={goLive} onChange={saveGoLive} showToggle />
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            Records from the old software must be dated <strong>before</strong> this day. Bills brought over keep their
            old numbers, are marked "Imported", and do not use up this app's bill numbers.
          </p>
        </CardContent>
      </Card>
      <Tabs defaultValue="stock">
        <TabsList className="flex-wrap">
          <TabsTrigger value="stock">Stock items (file)</TabsTrigger>
          <TabsTrigger value="bills">Past bills (file)</TabsTrigger>
          <TabsTrigger value="manual">Enter a past bill</TabsTrigger>
        </TabsList>
        <TabsContent value="stock"><StockImport /></TabsContent>
        <TabsContent value="bills"><BillImport goLive={goLive || null} /></TabsContent>
        <TabsContent value="manual"><ManualBill goLive={goLive || null} /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function StockImport() {
  const { user } = useAuth();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [busy, setBusy] = useState(false);
  const good = rows.filter((r) => !r.errors.length);

  async function onFile(f?: File) {
    if (!f) return;
    try { setRows(parseStockRows(await readSheet(f), PURITIES)); } catch (e: any) { toast.error(`Could not read the file: ${e.message}`); }
  }

  async function run() {
    setBusy(true);
    try {
      const [{ data: cats }, { data: locs }] = await Promise.all([
        supabase.from("categories").select("id, name"), supabase.from("locations").select("id, name"),
      ]);
      const catId = new Map((cats ?? []).map((c: any) => [c.name.toLowerCase(), c.id]));
      const locId = new Map((locs ?? []).map((c: any) => [c.name.toLowerCase(), c.id]));
      let done = 0;
      for (const r of good) {
        let cid: string | null = null;
        if (r.category) {
          cid = catId.get(r.category.toLowerCase()) ?? null;
          if (!cid) {
            const { data } = await supabase.from("categories").insert({ name: r.category }).select("id").single();
            cid = data?.id ?? null; if (cid) catId.set(r.category.toLowerCase(), cid);
          }
        }
        let lid: string | null = null;
        if (r.location) {
          lid = locId.get(r.location.toLowerCase()) ?? null;
          if (!lid) {
            const { data } = await supabase.from("locations").insert({ name: r.location }).select("id").single();
            lid = data?.id ?? null; if (lid) locId.set(r.location.toLowerCase(), lid);
          }
        }
        let sku = `JM-${Date.now().toString().slice(-6)}${done}`;
        if (cid) { const { data } = await supabase.rpc("next_category_sku", { _category_id: cid }); if (data) sku = data as string; }
        const { error } = await supabase.from("inventory_items").insert({
          sku, qr_code: sku, name: r.name, category_id: cid, location_id: lid, metal: r.metal as any, purity: r.purity,
          gross_weight: r.gross_weight, stone_weight: r.stone_weight, net_weight: r.net_weight, fine_weight: r.fine_weight,
          making_charge: r.making_charge, making_charge_type: r.making_charge_type, wastage_type: r.wastage_type as any,
          wastage_value: r.wastage_value, stone_value: r.stone_value, status: "in_stock",
          received_from: r.received_from || null,
          received_at: r.received_at ? `${r.received_at}T12:00:00+05:45` : null,
          legacy_code: r.legacy_code || null, barcode: r.legacy_code || null, created_by: user?.id,
        } as any);
        if (error) throw new Error(`Row ${r.row}: ${error.message}`);
        done++;
      }
      toast.success(`${done} stock items added`);
      setRows([]);
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Stock items</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate("stock", STOCK_COLUMNS,
            ["Gold bangle", "Bangles", "gold", "22K", 20.5, 0.5, 1200, "per_gram", 8, "percentage", 0, "Showcase 1", "2081-06-15 BS", "Ram Suppliers", "OLD-0012"])}>
            <Download className="mr-1 h-4 w-4" /> Download template
          </Button>
          <Label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm">
            <Upload className="h-4 w-4" /> Upload filled file
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">Dates can be English (2024-09-30) or Nepali (2081-06-14 BS). Old codes are kept so already-printed tags still scan.</p>
        {rows.length > 0 && (
          <>
            <div className="max-h-[50vh] overflow-auto rounded border">
              <Table>
                <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Name</TableHead><TableHead>Purity</TableHead><TableHead className="text-right">Gross g</TableHead><TableHead>Received</TableHead><TableHead>Old code</TableHead><TableHead>Check</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.row} className={r.errors.length ? "bg-destructive/10" : ""}>
                      <TableCell>{r.row}</TableCell><TableCell>{r.name}</TableCell><TableCell>{r.purity}</TableCell>
                      <TableCell className="text-right">{r.gross_weight.toFixed(3)}</TableCell>
                      <TableCell>{r.received_at ? <DateText value={r.received_at} /> : "—"}</TableCell>
                      <TableCell>{r.legacy_code || "—"}</TableCell>
                      <TableCell className={r.errors.length ? "text-destructive text-xs" : "text-xs"}>{r.errors.join("; ") || "OK"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button disabled={busy || !good.length} onClick={run}>
              {busy ? "Adding…" : `Add ${good.length} items`}{rows.length > good.length ? ` (skip ${rows.length - good.length} with problems)` : ""}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

async function importBill(b: BillDraft) {
  const { error } = await supabase.rpc("import_past_invoice" as any, {
    _bill: {
      legacy_number: b.legacy_number, bill_date: b.bill_date, customer_name: b.customer_name,
      customer_phone: b.customer_phone, discount: b.discount, tax: b.tax, total: billTotalOf(b),
      amount_paid: b.amount_paid ?? billTotalOf(b), payment_method: b.payment_method, items: b.items,
    },
  });
  if (error) throw error;
}

function BillImport({ goLive }: { goLive: string | null }) {
  const [raw, setRaw] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const bills = useMemo(() => groupBillRows(raw, goLive), [raw, goLive]);
  const good = bills.filter((b) => !b.errors.length);

  async function onFile(f?: File) {
    if (!f) return;
    try { setRaw(await readSheet(f)); } catch (e: any) { toast.error(`Could not read the file: ${e.message}`); }
  }
  async function run() {
    setBusy(true);
    let ok = 0; const failed: string[] = [];
    for (const b of good) {
      try { await importBill(b); ok++; } catch (e: any) { failed.push(`${b.legacy_number}: ${e.message}`); }
    }
    setBusy(false);
    if (ok) toast.success(`${ok} past bills brought over`);
    if (failed.length) toast.error(failed.slice(0, 3).join("\n") + (failed.length > 3 ? `\n…and ${failed.length - 3} more` : ""));
    if (!failed.length) setRaw([]);
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Past sales bills</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate("past-bills", BILL_COLUMNS,
            ["S-1045", "2081-05-20 BS", "Sita Shrestha", "9841000000", "Gold chain", "gold", "22K", 11.664, 13000, 1500, 0, 0, 1, "", 0, 0, "", "", "cash"])}>
            <Download className="mr-1 h-4 w-4" /> Download template
          </Button>
          <Label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm">
            <Upload className="h-4 w-4" /> Upload filled file
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">One line per item; lines with the same old bill number make one bill. Leave line total, total or amount paid blank to have them worked out. Unpaid amounts go to the customer's balance owed.</p>
        {bills.length > 0 && (
          <>
            <div className="max-h-[50vh] overflow-auto rounded border">
              <Table>
                <TableHeader><TableRow><TableHead>Old bill</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Items</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Check</TableHead></TableRow></TableHeader>
                <TableBody>
                  {bills.map((b, i) => (
                    <TableRow key={i} className={b.errors.length ? "bg-destructive/10" : ""}>
                      <TableCell>{b.legacy_number || "—"}</TableCell>
                      <TableCell>{b.bill_date ? <DateText value={b.bill_date} /> : "—"}</TableCell>
                      <TableCell>{b.customer_name || "Walk-in"}{b.customer_phone && <span className="text-xs text-muted-foreground"> · {b.customer_phone}</span>}</TableCell>
                      <TableCell className="text-right">{b.items.length}</TableCell>
                      <TableCell className="text-right">{npr(billTotalOf(b))}</TableCell>
                      <TableCell className="text-right">{npr(b.amount_paid ?? billTotalOf(b))}</TableCell>
                      <TableCell className={b.errors.length ? "text-destructive text-xs" : "text-xs"}>{b.errors.join("; ") || "OK"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button disabled={busy || !good.length} onClick={run}>
              {busy ? "Bringing over…" : `Bring over ${good.length} bills`}{bills.length > good.length ? ` (skip ${bills.length - good.length} with problems)` : ""}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type Line = BillDraft["items"][number];
const emptyLine = (): Line => ({ description: "", metal: "gold", purity: "22K", weight: 0, rate: 0, making_charge: 0, wastage_amount: 0, stone_value: 0, quantity: 1, line_total: 0 });

function ManualBill({ goLive }: { goLive: string | null }) {
  const [num, setNum] = useState(""); const [date, setDate] = useState("");
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [discount, setDiscount] = useState(0); const [tax, setTax] = useState(0);
  const [paid, setPaid] = useState<number | null>(null); const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);

  const calc = lines.map((l) => ({ ...l, line_total: round2(l.weight * l.rate + l.making_charge + l.wastage_amount + l.stone_value) }));
  const total = round2(calc.reduce((a, l) => a + l.line_total, 0) - discount + tax);
  const maxDate = goLive ? new Date(new Date(`${goLive}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) : undefined;
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    if (!num.trim()) return toast.error("Enter the old bill number");
    if (!date) return toast.error("Enter the bill date");
    if (goLive && date >= goLive) return toast.error(`Past bills must be dated before ${goLive}`);
    if (!calc.some((l) => l.line_total > 0)) return toast.error("Add at least one item with an amount");
    setBusy(true);
    try {
      await importBill({ legacy_number: num.trim(), bill_date: date, customer_name: name, customer_phone: phone,
        discount, tax, total, amount_paid: paid ?? total, payment_method: method,
        items: calc.filter((l) => l.line_total > 0), errors: [], rows: [] });
      toast.success(`Past bill ${num} saved`);
      setNum(""); setLines([emptyLine()]); setDiscount(0); setTax(0); setPaid(null);
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Enter a past bill by hand</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div><Label>Old bill number</Label><Input value={num} onChange={(e) => setNum(e.target.value)} /></div>
          <div><Label>Bill date</Label><DateField value={date} onChange={setDate} max={maxDate} showToggle /></div>
          <div><Label>Customer name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div className="space-y-2">
          {calc.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded border p-2 sm:grid-cols-8">
              <div className="col-span-2"><Label className="text-xs">Item</Label><Input value={l.description} onChange={(e) => set(i, { description: e.target.value })} /></div>
              <div><Label className="text-xs">Purity</Label>
                <Select value={l.purity} onValueChange={(v) => set(i, { purity: v, metal: ["999", "925"].includes(v) ? "silver" : "gold" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PURITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-xs">Weight g</Label><NumberField value={l.weight} onChange={(v) => set(i, { weight: v })} /></div>
              <div><Label className="text-xs">Rate /g</Label><NumberField value={l.rate} onChange={(v) => set(i, { rate: v })} /></div>
              <div><Label className="text-xs">Making</Label><NumberField value={l.making_charge} onChange={(v) => set(i, { making_charge: v })} /></div>
              <div><Label className="text-xs">Wastage रू</Label><NumberField value={l.wastage_amount} onChange={(v) => set(i, { wastage_amount: v })} /></div>
              <div className="flex items-end justify-between gap-1">
                <span className="pb-2 text-sm font-medium">{npr(l.line_total)}</span>
                <Button size="icon" variant="ghost" aria-label="Remove item" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus className="mr-1 h-4 w-4" /> Add item</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><Label>Discount</Label><NumberField value={discount} onChange={setDiscount} /></div>
          <div><Label>Tax</Label><NumberField value={tax} onChange={setTax} /></div>
          <div><Label>Amount paid (blank = full)</Label><NumberField value={paid ?? total} onChange={(v) => setPaid(v)} /></div>
          <div><Label>Paid by</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAY_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">Total {npr(total)}</span>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save past bill"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Past bills don't print, don't take items out of stock, and can't be edited after saving.</p>
      </CardContent>
    </Card>
  );
}
