import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { Download, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { fiscalPeriodForDate, nepalToday } from "@/lib/fiscalYear";
import { npr } from "@/lib/format";
import { toBSLong } from "@/lib/nepaliDate";

type Year = { bs_year: number; label: string; starts_on: string; ends_on: string; activated_at: string | null; closed_at: string | null };
type BookRow = Record<string, unknown>;
type Books = Record<string, unknown> & { balances?: Record<string, BookRow[]> };
type Archive = { label: string; closed_at: string | null; opening: Books | null; books: Books };
const bookLabels: Record<string, string> = { sales: "Sales", sale_items: "Sale items", receipts: "Receipts", purchases: "Purchases", purchase_items: "Purchase items", old_metal: "Old metal", returns: "Returns", return_items: "Return items", advance_history: "Advance history", karigar_charges: "Karigar charges", karigar_payments: "Karigar payments" };
const balanceLabels: Record<string, string> = { stock: "Stock", receivables: "Receivables", unused_advances: "Unused advances", open_orders: "Open orders", open_order_items: "Order work in progress", open_repairs: "Repair work in progress", supplier_purchases_unpaid: "Unpaid supplier purchases", karigar_balances: "Karigar balances" };

export default function FiscalYears() {
  const [years, setYears] = useState<Year[]>([]);
  const [selected, setSelected] = useState(String(fiscalPeriodForDate(nepalToday()).bs_year));
  const [archive, setArchive] = useState<Archive | null>(null);
  const [busy, setBusy] = useState(false);
  const year = years.find(y => String(y.bs_year) === selected);

  async function load() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("read_fiscal_books", { _year: Number(selected) });
      if (error) throw error;
      setArchive(data as unknown as Archive);
      const res = await supabase.from("fiscal_years").select("bs_year,label,starts_on,ends_on,activated_at,closed_at").order("bs_year", { ascending: false });
      if (res.error) throw res.error;
      setYears(res.data ?? []);
    } catch (error) { setArchive(null); toast.error(error instanceof Error ? error.message : String((error as {message?: string}).message ?? error)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [selected]);

  function download() {
    if (!archive || !year) return;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Field: "Fiscal year", Value: archive.label }, { Field: "Start (AD)", Value: year.starts_on }, { Field: "End (AD)", Value: year.ends_on },
      { Field: "Status", Value: archive.closed_at ? "Closed archive" : "Provisional books" },
      { Field: "Captured at", Value: String(archive.books.captured_at ?? "") },
      { Field: "Scope", Value: "Operational books only; excludes photos, auth accounts and full database structure." },
      { Field: "Opening basis", Value: archive.opening?.activation_snapshot ? "Balances at feature activation, not a reconstructed historical opening." : "Prior fiscal year closing balances." },
      { Field: "Supplier balances", Value: "Unpaid purchase amounts, not a reconciled supplier general ledger." },
    ]), "Manifest");
    function sheet(label: string, rows: BookRow[]) {
      const safe = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("vat_")).map(([key, value]) => [key, typeof value === "object" && value !== null ? JSON.stringify(value) : value])));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safe.length ? safe : [{ Status: "No records" }]), label.slice(0,31));
    }
    for (const [key, label] of Object.entries(bookLabels)) sheet(label, (archive.books[key] ?? []) as BookRow[]);
    for (const [key, label] of Object.entries(balanceLabels)) {
      sheet(`Closing ${label}`, archive.books.balances?.[key] ?? []);
      sheet(`Opening ${label}`, archive.opening?.balances?.[key] ?? []);
    }
    XLSX.writeFile(workbook, `fiscal-books-${archive.label.replace("/", "-")}${archive.closed_at ? "-closed" : "-provisional"}.xlsx`);
  }

  const balances = archive?.books.balances;
  return <AppLayout title="Fiscal Years">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-5">
      <div className="space-y-2"><div className="text-sm font-medium">Fiscal year</div>
        <Select value={selected} onValueChange={setSelected}><SelectTrigger className="w-44"><SelectValue placeholder={selected} /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y.bs_year} value={String(y.bs_year)}>{y.label}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        <Button disabled={busy || !archive} onClick={download}><Download className="mr-2 h-4 w-4" />Download books</Button></div>
    </div>
    {year && <section className="mb-6 space-y-2">
      <div className="flex items-center gap-3"><h2 className="text-xl font-semibold">{year.label}</h2><Badge variant="secondary">{year.closed_at ? "Closed" : year.activated_at ? "Open" : year.starts_on > nepalToday() ? "Upcoming" : "Historical · not closed"}</Badge></div>
      <p className="text-sm text-muted-foreground">{toBSLong(year.starts_on)} – {toBSLong(year.ends_on)}</p>
      <p className="text-xs text-muted-foreground">{year.starts_on} – {year.ends_on} AD{year.closed_at ? ` · Archived ${new Date(year.closed_at).toLocaleString()}` : ""}</p>
      {archive?.opening?.activation_snapshot && <p className="text-sm text-muted-foreground">Opening figures captured when fiscal books were enabled; historical opening balances are not reconstructed.</p>}
    </section>}
    {busy ? <p className="text-muted-foreground">Loading books…</p> : archive && <>
      <div className="mb-6 grid gap-5 border-y py-5 sm:grid-cols-3">
        <div><div className="text-sm text-muted-foreground">Stock items carried</div><div className="text-xl font-semibold">{balances?.stock?.length ?? 0}</div></div>
        <div><div className="text-sm text-muted-foreground">Customer credit outstanding</div><div className="text-xl font-semibold">{npr((balances?.receivables ?? []).reduce((n,r) => n + Number(r.balance_due ?? 0),0))}</div></div>
        <div><div className="text-sm text-muted-foreground">Unused advances</div><div className="text-xl font-semibold">{npr((balances?.unused_advances ?? []).reduce((n,r) => n + Number(r.amount ?? 0),0))}</div></div>
      </div>
      <Table><TableHeader><TableRow><TableHead>Book</TableHead><TableHead className="text-right">Records</TableHead></TableRow></TableHeader><TableBody>
        {Object.entries(bookLabels).map(([key,label]) => <TableRow key={key}><TableCell>{label}</TableCell><TableCell className="text-right">{((archive.books[key] ?? []) as BookRow[]).length}</TableCell></TableRow>)}
      </Table>
      {year && <Button asChild variant="outline" className="mt-5"><Link to={`/reports/sales?from=${year.starts_on}&to=${year.ends_on}`}><FileText className="mr-2 h-4 w-4" />View sales for this year</Link></Button>}
    </>}
  </AppLayout>;
}