import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Undo2, Printer, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { npr } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { openPrintPreview } from "@/components/PrintPreview";
import { CreditNote, creditNoteNumber, type CreditNoteData, type CreditNoteLine } from "@/components/returns/CreditNote";

const REFUND_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"];
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type Disposition = "restock" | "new_inventory";
interface LineState { selected: boolean; disposition: Disposition }

export default function SalesReturns() {
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const canProcess = hasPermission("invoice_cancel_refund");
  const [params] = useSearchParams();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<CreditNoteData | null>(null);
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    supabase.from("company_profile").select("name_en, address, phone1, pan_no").maybeSingle()
      .then(({ data }) => setCompany(data));
  }, []);

  // Search invoices by number or customer name
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, issued_at, total, status, customers(full_name, phone)")
        .neq("status", "cancelled")
        .or(`invoice_number.ilike.%${q}%,customers.full_name.ilike.%${q}%`)
        .order("issued_at", { ascending: false })
        .limit(25);
      let rows = data ?? [];
      if (!rows.length) {
        const { data: byName } = await supabase
          .from("invoices")
          .select("id, invoice_number, issued_at, total, status, customers!inner(full_name, phone)")
          .neq("status", "cancelled")
          .ilike("customers.full_name", `%${q}%`)
          .order("issued_at", { ascending: false })
          .limit(25);
        rows = byName ?? [];
      }
      if (!cancelled) { setResults(rows as any[]); setSearching(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  async function loadInvoice(id: string) {
    const [{ data: inv }, { data: its }] = await Promise.all([
      supabase.from("invoices").select("*, customers(full_name, phone)").eq("id", id).maybeSingle(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
    ]);
    if (!inv) return toast.error("Invoice not found");
    setInvoice(inv);
    setItems(its ?? []);
    const init: Record<string, LineState> = {};
    for (const it of (its ?? []).filter((i: any) => !i.returned_at)) {
      init[it.id] = { selected: false, disposition: "restock" };
    }
    setLines(init);
    setNote(null);
    setResults([]);
    setQuery("");
  }

  // Preload an invoice passed from the invoice detail page
  useEffect(() => {
    const id = params.get("invoice");
    if (id) loadInvoice(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const returnable = items.filter((i) => !i.returned_at);
  const grossAll = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
  const subtotal = Number(invoice?.subtotal ?? grossAll);
  const flatDiscount = Number(invoice?.discount ?? 0);
  const taxTotal = Number(invoice?.vat_amount ?? 0) + Number(invoice?.sd_tax ?? 0) + Number(invoice?.luxury_tax ?? 0);
  const discountRatio = subtotal > 0 ? Math.max(0, Math.min(1, flatDiscount / subtotal)) : 0;

  const selected = returnable.filter((i) => lines[i.id]?.selected);

  const calc = useMemo(() => {
    const gross = selected.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
    const discount = round2(gross * discountRatio);
    const total = round2(gross - discount);
    const taxRetained = grossAll > 0 ? round2(taxTotal * (gross / grossAll)) : 0;
    return { gross: round2(gross), discount, taxRetained, total };
  }, [selected, discountRatio, taxTotal, grossAll]);

  function netFor(it: any) {
    const original = Number(it.line_total) || 0;
    const discount = round2(original * discountRatio);
    return { original: round2(original), discount, net: round2(original - discount) };
  }

  function toggleAll(v: boolean) {
    setLines((prev) => {
      const next: Record<string, LineState> = {};
      for (const [k, l] of Object.entries(prev)) next[k] = { ...l, selected: v };
      return next;
    });
  }

  async function process() {
    if (!invoice || selected.length === 0) return toast.error("Select at least one item to return");
    setBusy(true);
    try {
      const number = creditNoteNumber();
      const paid = Number(invoice.amount_paid ?? 0);
      const refundAmt = Math.min(calc.total, paid);

      if (refundAmt > 0) {
        const { error } = await supabase.from("payments").insert({
          invoice_id: invoice.id, customer_id: invoice.customer_id,
          amount: -refundAmt, method: method as any,
          reference: number, notes: reason || null, created_by: user?.id ?? null,
        } as any);
        if (error) throw error;
      }

      const noteLines: CreditNoteLine[] = [];

      for (const it of selected) {
        const disposition = lines[it.id]?.disposition ?? "restock";
        const { original, discount, net } = netFor(it);
        let newInvItemId: string | null = null;

        if (disposition === "restock" && it.inventory_item_id) {
          await supabase.from("inventory_items").update({ status: "in_stock" as any }).eq("id", it.inventory_item_id);
        } else {
          const prefix = disposition === "restock" ? "RET" : "RTM";
          if (disposition !== "restock" && it.inventory_item_id) {
            await supabase.from("inventory_items").update({ status: "melted" as any }).eq("id", it.inventory_item_id);
          }
          const sku = `${prefix}-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
          const { data: created, error: cErr } = await supabase.from("inventory_items").insert({
            sku,
            name: disposition === "restock" ? (it.description ?? "Returned item") : `${it.description ?? "Item"} (raw material)`,
            metal: (it.metal ?? "gold") as any, purity: it.purity ?? "22K",
            gross_weight: Number(it.gross_weight ?? it.weight ?? 0), stone_weight: Number(it.stone_weight ?? 0),
            net_weight: Number(it.weight ?? 0), fine_weight: Number(it.weight ?? 0),
            making_charge: disposition === "restock" ? Number(it.making_input ?? 0) : 0,
            making_charge_type: it.making_type ?? "per_gram",
            wastage_type: (disposition === "restock" ? (it.wastage_type ?? "percentage") : "percentage") as any,
            wastage_value: disposition === "restock" ? Number(it.wastage_input ?? 0) : 0,
            stone_value: disposition === "restock" ? Number(it.stone_value ?? 0) : 0,
            status: "in_stock" as any,
            received_from: `Sales return ${number} — invoice ${invoice.invoice_number}`,
            created_by: user?.id ?? null,
          } as any).select("id").single();
          if (cErr) throw cErr;
          newInvItemId = created.id;
        }

        const { error: uErr } = await supabase.from("invoice_items").update({
          returned_at: new Date().toISOString(),
          return_disposition: disposition,
          return_reason: [number, reason].filter(Boolean).join(" · "),
          refund_amount: net,
          new_inventory_item_id: newInvItemId,
        }).eq("id", it.id);
        if (uErr) throw uErr;

        noteLines.push({
          description: it.description ?? "Item",
          purity: it.purity,
          qty: Number(it.quantity ?? 1),
          original, discount, net,
        });
      }

      const newTotal = Math.max(0, round2(Number(invoice.total) - calc.total));
      const newPaid = Math.max(0, round2(paid - refundAmt));
      const newBalance = Math.max(0, round2(newTotal - newPaid));
      const allReturned = selected.length === returnable.length && returnable.length === items.length;
      await supabase.from("invoices").update({
        total: newTotal, amount_paid: newPaid, balance_due: newBalance,
        status: allReturned && newTotal === 0 ? "refunded" : newBalance > 0 ? "partial" : newPaid > 0 ? "paid" : "refunded",
      } as any).eq("id", invoice.id);

      if (invoice.customer_id) {
        const { data: c } = await supabase.from("customers").select("balance").eq("id", invoice.customer_id).maybeSingle();
        const delta = Math.max(0, Number(invoice.balance_due ?? 0) - newBalance);
        if (delta > 0) {
          await supabase.from("customers").update({ balance: Math.max(0, Number(c?.balance ?? 0) - delta) }).eq("id", invoice.customer_id);
        }
      }

      setNote({
        number,
        at: new Date().toISOString(),
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invoice.issued_at,
        customerName: invoice.customers?.full_name ?? "",
        customerPhone: invoice.customers?.phone ?? null,
        company,
        lines: noteLines,
        gross: calc.gross, discount: calc.discount, taxRetained: calc.taxRetained, total: calc.total,
        method, reason,
      });
      toast.success(`Return processed · ${number}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not process the return");
    } finally { setBusy(false); }
  }

  function printNote() {
    const el = document.getElementById("credit-note-print");
    if (!el) return;
    openPrintPreview({
      title: `Credit Note ${note?.number ?? ""}`,
      fileName: note?.number ?? "credit-note",
      html: el.outerHTML,
      includeAppStyles: true,
      css: `body{background:#fff;color:#111} .credit-note{max-width:none;padding:0}`,
    });
  }

  function reset() {
    setNote(null); setInvoice(null); setItems([]); setLines({}); setReason(""); setMethod("cash");
  }

  return (
    <AppLayout title="Sales Return Management">
      {note ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={printNote}><Printer className="mr-1 h-4 w-4" /> Print Credit Note</Button>
            <Button variant="outline" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" /> New return</Button>
          </div>
          <div id="credit-note-print" className="rounded-lg border">
            <CreditNote data={note} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" /> Find the original invoice</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Search by invoice number or customer name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {searching && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Searching…</div>}
                {results.length > 0 && (
                  <div className="divide-y rounded-md border">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => loadInvoice(r.id)}
                        className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/60"
                      >
                        <div>
                          <div className="font-medium">{r.invoice_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.customers?.full_name ?? "—"} · {new Date(r.issued_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div>{npr(r.total)}</div>
                          <Badge variant="outline" className="capitalize">{r.status}</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {invoice && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Invoice {invoice.invoice_number}</CardTitle>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {invoice.customers?.full_name ?? "—"}
                        {invoice.customers?.phone ? ` · ${invoice.customers.phone}` : ""} · {new Date(invoice.issued_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge className="capitalize">{invoice.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Stat label="Pre-tax subtotal" value={npr(subtotal)} />
                    <Stat label="Flat discount" value={npr(flatDiscount)} />
                    <Stat label="Discount ratio" value={`${(discountRatio * 100).toFixed(2)}%`} />
                    <Stat label="Tax charged" value={npr(taxTotal)} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Line items</div>
                    {returnable.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <Checkbox
                          id="all"
                          checked={selected.length === returnable.length && returnable.length > 0}
                          onCheckedChange={(v) => toggleAll(Boolean(v))}
                        />
                        <Label htmlFor="all" className="cursor-pointer">Select all</Label>
                      </div>
                    )}
                  </div>

                  <div className="divide-y rounded-md border">
                    {items.map((it) => {
                      const done = Boolean(it.returned_at);
                      const st = lines[it.id];
                      const { original, discount, net } = netFor(it);
                      return (
                        <div key={it.id} className={`p-3 ${done ? "opacity-60" : ""}`}>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              className="mt-1"
                              disabled={done}
                              checked={!done && Boolean(st?.selected)}
                              onCheckedChange={(v) =>
                                setLines((p) => ({ ...p, [it.id]: { ...(p[it.id] ?? { disposition: "restock" as Disposition }), selected: Boolean(v) } }))
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{it.description}</span>
                                {it.purity && <span className="text-xs text-muted-foreground">{it.purity}</span>}
                                {done && <Badge variant="secondary">Returned</Badge>}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Qty {Number(it.quantity ?? 1)} · Original {npr(original)} · Discount − {npr(discount)} · Net refund {npr(net)}
                              </div>
                              {!done && st?.selected && (
                                <div className="mt-2 w-56">
                                  <Select
                                    value={st.disposition}
                                    onValueChange={(v) => setLines((p) => ({ ...p, [it.id]: { ...p[it.id], disposition: v as Disposition } }))}
                                  >
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="restock">Restock (same SKU)</SelectItem>
                                      <SelectItem value="new_inventory">Raw material</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                            <div className="text-right text-sm font-medium">{npr(net)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-4">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Undo2 className="h-4 w-4" /> Refund calculation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Line label="Gross return value" value={npr(calc.gross)} />
                <Line label="Pro-rata discount deducted" value={`− ${npr(calc.discount)}`} />
                <Line label="Non-refundable tax retained" value={npr(calc.taxRetained)} muted />
                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                  <span>Total refund due</span><span>{npr(calc.total)}</span>
                </div>

                <div className="space-y-2 pt-2">
                  <Label className="text-xs">Refund method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REFUND_METHODS.map((m) => (
                        <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label className="text-xs">Reason (optional)</Label>
                  <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for return" />
                </div>

                <Button
                  className="w-full"
                  disabled={!canProcess || busy || selected.length === 0}
                  onClick={process}
                >
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Undo2 className="mr-1 h-4 w-4" />}
                  Process Return &amp; Generate Credit Note
                </Button>
                {!canProcess && (
                  <p className="text-xs text-muted-foreground">You do not have permission to process returns.</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Taxes are strictly non-refundable and are retained in full.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
