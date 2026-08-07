import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Undo2, Printer, RotateCcw, Loader2, Save, Wifi, WifiOff, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { npr } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { openPrintPreview } from "@/components/PrintPreview";
import { CreditNote, type CreditNoteData, type CreditNoteLine } from "@/components/returns/CreditNote";
import { ReturnsHistory, type ReturnRecord } from "@/components/returns/ReturnsHistory";
import {
  discardDraft,
  lineNet,
  processReturn,
  refundCalc,
  saveDraft,
  voidReturn,
  creditNoteNumberFor,
  type Disposition,
} from "@/lib/returns";
import {
  cacheInvoice,
  clearLocalSelection,
  enqueueReturn,
  getCachedInvoice,
  getLocalSelection,
  getQueue,
  listInvoiceSnapshots,
  markQueuedError,
  removeQueued,
  saveLocalSelection,
  searchCachedInvoices,
  type QueuedReturn,
} from "@/lib/offlineReturns";
import { fetchLineCodes, resolveScannedCode, withCodes } from "@/lib/scanMatch";
import { QRScanButton } from "@/components/QRScanButton";

const REFUND_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"];

interface LineState { selected: boolean; disposition: Disposition }

export default function SalesReturns() {
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const canProcess = hasPermission("invoice_cancel_refund");
  const [params] = useSearchParams();
  const online = useOnlineStatus();

  const [tab, setTab] = useState<"new" | "history">("new");
  const [historyKey, setHistoryKey] = useState(0);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<CreditNoteData | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);
  const [company, setCompany] = useState<any>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const skipAutosave = useRef(false);

  const [queue, setQueue] = useState<QueuedReturn[]>([]);
  const [cachedCount, setCachedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const flushing = useRef(false);

  const refreshOfflineState = useCallback(async () => {
    setQueue(await getQueue());
    setCachedCount((await listInvoiceSnapshots()).length);
  }, []);

  useEffect(() => {
    supabase.from("company_profile").select("name_en, address, phone1, pan_no").maybeSingle()
      .then(({ data }) => setCompany(data));
    void refreshOfflineState();
  }, [refreshOfflineState]);

  // Search invoices — server when online, local cache when offline
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setFromCache(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      if (!online) {
        const snaps = await searchCachedInvoices(q);
        if (!cancelled) {
          setResults(snaps.map((s) => ({ ...s.invoice, __cachedAt: s.cachedAt })));
          setFromCache(true);
          setSearching(false);
        }
        return;
      }
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
      if (!cancelled) { setResults(rows as any[]); setFromCache(false); setSearching(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, online]);

  const applyLoaded = useCallback(
    (inv: any, its: any[], restored: Record<string, LineState> | null, resumeDraftId: string | null) => {
      skipAutosave.current = true;
      setInvoice(inv);
      setItems(its);
      const init: Record<string, LineState> = {};
      for (const it of its.filter((i: any) => !i.returned_at)) {
        init[it.id] = restored?.[it.id] ?? { selected: false, disposition: "restock" };
      }
      setLines(init);
      setDraftId(resumeDraftId);
      setDraftSavedAt(null);
      setNote(null);
      setQueuedNotice(null);
      setResults([]);
      setQuery("");
    },
    []
  );

  // Scan → highlight helpers
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashLine = useCallback((id: string) => {
    setHighlightId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setHighlightId(null), 2200);
    setTimeout(() => rowRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }, []);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);


  const loadInvoice = useCallback(
    async (id: string, opts?: { draftId?: string; restore?: Record<string, LineState>; selectItemId?: string }) => {
      let inv: any = null;
      let its: any[] = [];

      if (online) {
        const [{ data: i }, { data: rows }] = await Promise.all([
          supabase.from("invoices").select("*, customers(full_name, phone)").eq("id", id).maybeSingle(),
          supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
        ]);
        inv = i;
        its = rows ?? [];
        if (inv) {
          try {
            its = withCodes(its, await fetchLineCodes(its));
          } catch { /* codes are best-effort */ }
          await cacheInvoice(inv, its);
        }
      }

      if (!inv) {
        const snap = await getCachedInvoice(id);
        if (!snap) return toast.error(online ? "Invoice not found" : "This invoice is not available offline");
        inv = snap.invoice;
        its = snap.items;
        if (!online) toast.info(`Loaded from the offline cache (${new Date(snap.cachedAt).toLocaleString()})`);
      }

      let restored = opts?.restore ?? null;
      if (opts?.draftId && online) {
        const { data: dItems } = await supabase
          .from("sales_return_items")
          .select("invoice_item_id, disposition")
          .eq("return_id", opts.draftId);
        restored = {};
        for (const d of dItems ?? []) {
          if (d.invoice_item_id) restored[d.invoice_item_id] = { selected: true, disposition: (d.disposition as Disposition) ?? "restock" };
        }
      }

      applyLoaded(inv, its, restored, opts?.draftId ?? null);
      if (opts?.selectItemId) {
        const target = its.find((i: any) => i.id === opts.selectItemId);
        if (target && !target.returned_at) {
          setLines((p) => ({ ...p, [target.id]: { disposition: p[target.id]?.disposition ?? "restock", selected: true } }));
          flashLine(target.id);
          toast.success(`Selected ${target.description}`);
        }
      }
      void refreshOfflineState();
      return its as any[];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [online, applyLoaded, refreshOfflineState]
  );

  // Preload an invoice from the URL, otherwise restore the last local selection
  const bootstrapped = useRef(false);
  useEffect(() => {
    const id = params.get("invoice");
    if (id) { void loadInvoice(id); bootstrapped.current = true; return; }
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      const sel = await getLocalSelection();
      if (!sel) return;
      await loadInvoice(sel.invoiceId, { draftId: sel.draftId ?? undefined, restore: sel.lines });
      setMethod(sel.method ?? "cash");
      setReason(sel.reason ?? "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const returnable = items.filter((i) => !i.returned_at);
  const grossAll = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
  const subtotal = Number(invoice?.subtotal ?? grossAll);
  const flatDiscount = Number(invoice?.discount ?? 0);
  const taxTotal = Number(invoice?.vat_amount ?? 0) + Number(invoice?.sd_tax ?? 0) + Number(invoice?.luxury_tax ?? 0);
  const discountRatio = subtotal > 0 ? Math.max(0, Math.min(1, flatDiscount / subtotal)) : 0;

  const selected = returnable.filter((i) => lines[i.id]?.selected);

  const calc = useMemo(
    () => refundCalc(selected, { discountRatio, taxTotal, grossAll }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected.map((s) => s.id).join(","), discountRatio, taxTotal, grossAll]
  );

  function netFor(it: any) {
    return lineNet(it.line_total, discountRatio);
  }

  // Mirror the selection locally, and save the server draft when online
  useEffect(() => {
    if (note || !invoice || !canProcess) return;
    if (skipAutosave.current) { skipAutosave.current = false; return; }
    if (selected.length === 0 && !draftId) return;

    const handle = setTimeout(async () => {
      await saveLocalSelection({ invoiceId: invoice.id, lines, method, reason, draftId });
      if (!online) { setDraftSavedAt(new Date().toISOString()); return; }
      try {
        setSavingDraft(true);
        const id = await saveDraft({
          id: draftId,
          invoiceId: invoice.id,
          customerId: invoice.customer_id ?? null,
          method,
          reason,
          calc,
          userId: user?.id ?? null,
          lines: selected.map((it) => {
            const { original, discount, net } = netFor(it);
            return {
              invoice_item_id: it.id,
              description: it.description ?? "Item",
              purity: it.purity ?? null,
              qty: Number(it.quantity ?? 1),
              original, discount, net,
              disposition: lines[it.id]?.disposition ?? "restock",
              inventory_item_id: it.inventory_item_id ?? null,
            };
          }),
        });
        setDraftId(id);
        setDraftSavedAt(new Date().toISOString());
        setHistoryKey((k) => k + 1);
      } catch (e) {
        console.error("draft save failed", e);
      } finally {
        setSavingDraft(false);
      }
    }, 800);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, JSON.stringify(lines), method, reason, note, canProcess, online]);

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
      const dispositions = Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, v.disposition])) as Record<string, Disposition>;

      if (!online) {
        await enqueueReturn({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customers?.full_name ?? "",
          snapshot: { invoice, items, cachedAt: new Date().toISOString() },
          selectedIds: selected.map((s) => s.id),
          dispositions,
          calc,
          discountRatio,
          method,
          reason,
          draftId,
        });
        await clearLocalSelection();
        await refreshOfflineState();
        setQueuedNotice(creditNoteNumberFor());
        toast.success("Queued — this return will process as soon as you're back online");
        return;
      }

      const { number, noteLines } = await processReturn({
        draftId,
        invoice,
        selected,
        dispositions,
        calc,
        discountRatio,
        method,
        reason,
        userId: user?.id ?? null,
        returnableCount: returnable.length,
        itemCount: items.length,
      });

      await clearLocalSelection();
      setDraftId(null);
      setDraftSavedAt(null);
      setHistoryKey((k) => k + 1);
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

  /** Submit queued returns one by one, oldest first. */
  const flushQueue = useCallback(async () => {
    if (flushing.current || !online || !canProcess) return;
    const pending = await getQueue();
    if (!pending.length) return;
    flushing.current = true;
    setSyncing(true);
    try {
      for (const q of pending) {
        try {
          const { data: inv } = await supabase
            .from("invoices").select("*, customers(full_name, phone)").eq("id", q.invoiceId).maybeSingle();
          const { data: its } = await supabase
            .from("invoice_items").select("*").eq("invoice_id", q.invoiceId).order("created_at");
          if (!inv) throw new Error("Invoice no longer exists");

          const rows = its ?? [];
          const stillOpen = rows.filter((r: any) => q.selectedIds.includes(r.id) && !r.returned_at);
          if (!stillOpen.length) {
            await removeQueued(q.clientId);
            toast.info(`Queued return for ${q.invoiceNumber} was already processed elsewhere`);
            continue;
          }

          const gAll = rows.reduce((s: number, i: any) => s + (Number(i.line_total) || 0), 0);
          const tax = Number(inv.vat_amount ?? 0) + Number(inv.sd_tax ?? 0) + Number(inv.luxury_tax ?? 0);
          const sub = Number(inv.subtotal ?? gAll);
          const ratio = sub > 0 ? Math.max(0, Math.min(1, Number(inv.discount ?? 0) / sub)) : 0;
          const c = refundCalc(stillOpen, { discountRatio: ratio, taxTotal: tax, grossAll: gAll });

          const { number } = await processReturn({
            draftId: q.draftId,
            invoice: inv,
            selected: stillOpen,
            dispositions: q.dispositions,
            calc: c,
            discountRatio: ratio,
            method: q.method,
            reason: q.reason,
            userId: user?.id ?? null,
            returnableCount: rows.filter((r: any) => !r.returned_at).length,
            itemCount: rows.length,
          });
          await removeQueued(q.clientId);
          toast.success(`Queued return synced · ${number}`);
        } catch (e: any) {
          await markQueuedError(q.clientId, e.message ?? "Sync failed");
          toast.error(`Could not sync return for ${q.invoiceNumber}: ${e.message ?? "unknown error"}`);
        }
      }
      await refreshOfflineState();
      setHistoryKey((k) => k + 1);
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [online, canProcess, user?.id, refreshOfflineState]);

  useEffect(() => {
    if (online) void flushQueue();
  }, [online, flushQueue]);

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
    skipAutosave.current = true;
    setNote(null); setQueuedNotice(null); setInvoice(null); setItems([]); setLines({});
    setReason(""); setMethod("cash"); setDraftId(null); setDraftSavedAt(null);
    void clearLocalSelection();
  }

  // ---- History actions ----
  async function handleResume(r: ReturnRecord) {
    setTab("new");
    await loadInvoice(r.invoice_id, { draftId: r.id });
    setMethod(r.method ?? "cash");
    setReason(r.reason ?? "");
    toast.success("Draft reopened");
  }

  async function handleDiscard(r: ReturnRecord) {
    if (!window.confirm("Discard this draft return?")) return;
    setRowBusy(r.id);
    try {
      await discardDraft(r.id);
      if (draftId === r.id) reset();
      setHistoryKey((k) => k + 1);
      toast.success("Draft discarded");
    } catch (e: any) {
      toast.error(e.message ?? "Could not discard the draft");
    } finally { setRowBusy(null); }
  }

  async function handleVoid(r: ReturnRecord) {
    const why = window.prompt(
      `Void credit note ${r.credit_note_number}? This reverses the restock, the refund payment and the invoice balances.\n\nReason (optional):`,
      ""
    );
    if (why === null) return;
    setRowBusy(r.id);
    try {
      await voidReturn(r.id, { userId: user?.id ?? null, reason: why });
      setHistoryKey((k) => k + 1);
      toast.success("Credit note voided and reversed");
    } catch (e: any) {
      toast.error(e.message ?? "Could not void the credit note");
    } finally { setRowBusy(null); }
  }

  async function handleView(r: ReturnRecord) {
    const { data: rItems } = await supabase.from("sales_return_items").select("*").eq("return_id", r.id);
    const noteLines: CreditNoteLine[] = (rItems ?? []).map((l: any) => ({
      description: l.description,
      purity: l.purity,
      qty: Number(l.qty ?? 1),
      original: Number(l.original),
      discount: Number(l.discount),
      net: Number(l.net),
    }));
    setNote({
      number: r.credit_note_number ?? "",
      at: r.processed_at ?? r.created_at,
      invoiceNumber: r.invoices?.invoice_number ?? "",
      invoiceDate: r.invoices?.issued_at ?? r.created_at,
      customerName: r.invoices?.customers?.full_name ?? "",
      customerPhone: r.invoices?.customers?.phone ?? null,
      company,
      lines: noteLines,
      gross: Number(r.gross), discount: Number(r.discount),
      taxRetained: Number(r.tax_retained), total: Number(r.total),
      method: r.method, reason: r.reason ?? undefined,
    });
    setTab("new");
  }

  async function handleRemoveQueued(q: QueuedReturn) {
    if (!window.confirm(`Remove the queued return for ${q.invoiceNumber}? It will not be processed.`)) return;
    await removeQueued(q.clientId);
    await refreshOfflineState();
    toast.success("Queued return removed");
  }

  return (
    <AppLayout title="Sales Return Management">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={online ? "secondary" : "destructive"} className="gap-1">
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {online ? "Online" : "Offline"}
        </Badge>
        <span>{cachedCount} invoice{cachedCount === 1 ? "" : "s"} cached for offline lookup</span>
        {queue.length > 0 && (
          <Badge variant="outline" className="gap-1">
            <CloudUpload className="h-3 w-3" /> {queue.length} queued
          </Badge>
        )}
        {syncing && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Syncing…</span>}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="new">New return</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          {queuedNotice ? (
            <Card>
              <CardContent className="space-y-3 p-6 text-sm">
                <div className="flex items-center gap-2 text-base font-semibold">
                  <CloudUpload className="h-4 w-4" /> Queued — will process when you're back online
                </div>
                <p className="text-muted-foreground">
                  The return for invoice {invoice?.invoice_number} is saved on this device. Provisional reference{" "}
                  <span className="font-medium">{queuedNotice}</span>. The final credit note number is issued when it syncs.
                </p>
                <Button variant="outline" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" /> New return</Button>
              </CardContent>
            </Card>
          ) : note ? (
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
                      placeholder={online ? "Search by invoice number or customer name…" : "Search cached invoices…"}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {searching && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Searching…</div>}
                    {!online && <p className="text-xs text-muted-foreground">Offline — searching the {cachedCount} invoices cached on this device.</p>}
                    {results.length > 0 && (
                      <div className="divide-y rounded-md border">
                        {results.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => loadInvoice(r.id)}
                            className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/60"
                          >
                            <div>
                              <div className="flex items-center gap-2 font-medium">
                                {r.invoice_number}
                                {fromCache && <Badge variant="outline" className="text-[10px]">Cached</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {r.customers?.full_name ?? "—"} · {new Date(r.issued_at).toLocaleDateString()}
                                {r.__cachedAt ? ` · saved ${new Date(r.__cachedAt).toLocaleDateString()}` : ""}
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base"><Undo2 className="h-4 w-4" /> Refund calculation</CardTitle>
                      {(draftId || savingDraft || draftSavedAt) && (
                        <Badge variant="secondary" className="gap-1 text-[11px]">
                          {savingDraft ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          {savingDraft ? "Saving draft" : online ? "Draft saved" : "Saved on device"}
                        </Badge>
                      )}
                    </div>
                    {draftSavedAt && !savingDraft && (
                      <p className="text-[11px] text-muted-foreground">Last saved {new Date(draftSavedAt).toLocaleTimeString()}</p>
                    )}
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
                      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : online ? <Undo2 className="mr-1 h-4 w-4" /> : <CloudUpload className="mr-1 h-4 w-4" />}
                      {online ? "Process Return & Generate Credit Note" : "Queue return for sync"}
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
        </TabsContent>

        <TabsContent value="history">
          <ReturnsHistory
            refreshKey={historyKey}
            busyId={rowBusy}
            canWrite={canProcess}
            queued={queue}
            syncing={syncing}
            onSyncNow={flushQueue}
            onRemoveQueued={handleRemoveQueued}
            onResume={handleResume}
            onView={handleView}
            onVoid={handleVoid}
            onDiscard={handleDiscard}
          />
        </TabsContent>
      </Tabs>
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
