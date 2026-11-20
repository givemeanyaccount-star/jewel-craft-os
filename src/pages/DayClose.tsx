import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { DateField } from "@/components/DateField";
import { DateText } from "@/components/DateText";
import { StatStrip } from "@/components/StatStrip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/usePermission";
import { supabase } from "@/integrations/supabase/client";
import {
  advanceMovement, isStandaloneOldMetalPayout, loadAllPages, nepalDate, paymentActivityLabel, reconciliationDifference,
  settlementTotals, type AdvanceEvent, type DayClosePayment, type OldMetalPayout,
} from "@/lib/dayClose";
import { nepalToday } from "@/lib/fiscalYear";
import { npr } from "@/lib/format";
import { modeLabel } from "@/lib/paymentLedger";
import { toBSLong } from "@/lib/nepaliDate";
import { Banknote, CheckCircle2, ChevronLeft, ChevronRight, Download, Printer, RefreshCw, WalletCards } from "lucide-react";
import { toast } from "sonner";

const ACTUAL_KEY = (date: string) => `jm.day-close.actual.${date}`;
const NOTES_KEY = (date: string) => `jm.day-close.notes.${date}`;

function shiftDay(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function timeInNepal(value: string): string {
  return new Date(value).toLocaleTimeString("en-NP", { timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit" });
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function DayClose() {
  const { hasPermission } = usePermission();
  const today = nepalToday();
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDateState] = useState(() => {
    const requested = searchParams.get("date") ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  });
  const [payments, setPayments] = useState<DayClosePayment[]>([]);
  const [events, setEvents] = useState<AdvanceEvent[]>([]);
  const [purchases, setPurchases] = useState<OldMetalPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actual, setActual] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [storageDate, setStorageDate] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  function setDate(next: string) {
    setDateState(next);
    const params = new URLSearchParams(searchParams);
    if (next === today) params.delete("date"); else params.set("date", next);
    setSearchParams(params, { replace: true });
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [paymentRows, eventRows, purchaseRows] = await Promise.all([
        loadAllPages<DayClosePayment>((from, to) => supabase.from("payments")
          .select("id, amount, method, paid_at, reference, notes, customer_id, invoice_id, order_id, customers(full_name), invoices(invoice_number, issued_at), orders(order_no)")
          .order("paid_at", { ascending: true }).range(from, to) as any),
        loadAllPages<AdvanceEvent>((from, to) => supabase.from("customer_advance_events" as any)
          .select("id, customer_id, payment_id, event, amount, paid_at, created_at")
          .order("created_at", { ascending: true }).range(from, to) as any),
        loadAllPages<OldMetalPayout>((from, to) => supabase.from("old_gold_purchases")
          .select("id, receipt_number, customer_name, total_amount, payment_method, purchased_at, linked_invoice_id")
          .order("purchased_at", { ascending: true }).range(from, to) as any),
      ]);
      setPayments(paymentRows); setEvents(eventRows); setPurchases(purchaseRows); setRefreshedAt(new Date());
    } catch (cause: any) {
      setError(cause?.message ?? "Could not load the day-close figures.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ACTUAL_KEY(date)) ?? "{}");
      setActual(saved && typeof saved === "object" ? saved : {});
      setNotes(localStorage.getItem(NOTES_KEY(date)) ?? "");
    } catch { setActual({}); setNotes(""); }
    setStorageDate(date);
  }, [date]);

  useEffect(() => {
    if (storageDate !== date) return;
    try {
      localStorage.setItem(ACTUAL_KEY(date), JSON.stringify(actual));
      localStorage.setItem(NOTES_KEY(date), notes);
    } catch { /* Private browsing or a full store must not block reconciliation. */ }
  }, [actual, notes, date, storageDate]);

  const settlement = useMemo(() => settlementTotals(payments, purchases, date), [payments, purchases, date]);
  const advances = useMemo(() => advanceMovement(payments, events, date), [payments, events, date]);
  const dayPayments = useMemo(() => payments.filter((payment) => nepalDate(payment.paid_at) === date)
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at)), [payments, date]);
  const dayPurchases = useMemo(() => {
    const tradeInReceipts = new Set(payments.filter((payment) => payment.method === "old_gold" && payment.reference).map((payment) => String(payment.reference)));
    return purchases.filter((purchase) => nepalDate(purchase.purchased_at) === date && isStandaloneOldMetalPayout(purchase, tradeInReceipts))
      .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at));
  }, [payments, purchases, date]);

  const activeChannels = settlement.channels.filter((row) => Math.abs(row.expected) > 0.004 || (actual[row.method] ?? "").trim());
  const complete = activeChannels.every((row) => (actual[row.method] ?? "").trim() !== "" && Number.isFinite(Number(actual[row.method])));
  const actualTotal = activeChannels.reduce((sum, row) => sum + (Number(actual[row.method]) || 0), 0);
  const totalDifference = complete ? totalDifferenceValue(activeChannels.reduce((sum, row) => sum + row.expected, 0), actualTotal) : null;
  const walletBank = settlement.channels.filter((row) => ["bank_transfer", "esewa", "khalti", "fonepay"].includes(row.method))
    .reduce((sum, row) => sum + row.expected, 0);

  function updateActual(method: string, value: string) {
    if (value && !/^\d*\.?\d{0,2}$/.test(value)) return;
    setActual((current) => ({ ...current, [method]: value }));
  }

  function exportCsv() {
    const lines: unknown[][] = [
      ["JewelMaster OS — Day Close"], ["AD date", date], ["BS date", toBSLong(date)], [],
      ["Settlement channel", "Received", "Paid out", "Expected", "Counted / statement", "Difference"],
      ...settlement.channels.map((row) => {
        const difference = reconciliationDifference(row.expected, actual[row.method] ?? "");
        return [modeLabel(row.method), row.received.toFixed(2), row.paidOut.toFixed(2), row.expected.toFixed(2), actual[row.method] ?? "", difference?.toFixed(2) ?? ""];
      }),
      [], ["Held advances", "Amount"],
      ["Opening", advances.opening.toFixed(2)], ["Received", advances.received.toFixed(2)],
      ["Applied to bills", advances.applied.toFixed(2)], ["Adjustments", advances.adjustments.toFixed(2)],
      ["Reversed", advances.reversed.toFixed(2)], ["Closing", advances.closing.toFixed(2)],
      ["Customer balances", advances.customerHeld.toFixed(2)], ["Order balances", advances.orderHeld.toFixed(2)],
      [], ["Old metal credit (non-cash)", settlement.oldMetalCredit.toFixed(2)], ["Credit sales (non-cash)", settlement.creditSales.toFixed(2)],
      [], ["Time", "Activity", "Customer", "Bill / order", "Method", "Received", "Paid out", "Reference"],
      ...dayPayments.map((payment) => [
        timeInNepal(payment.paid_at), paymentActivityLabel(payment), payment.customers?.full_name ?? "",
        payment.invoices?.invoice_number ?? payment.orders?.order_no ?? "", modeLabel(payment.method),
        Number(payment.amount) > 0 ? Number(payment.amount).toFixed(2) : "",
        Number(payment.amount) < 0 ? Math.abs(Number(payment.amount)).toFixed(2) : "", payment.reference ?? "",
      ]),
      ...dayPurchases.map((purchase) => [
        timeInNepal(purchase.purchased_at), "Old metal purchase payout", purchase.customer_name ?? "", purchase.receipt_number,
        modeLabel(purchase.payment_method), "", Number(purchase.total_amount).toFixed(2), purchase.receipt_number,
      ]),
      [], ["Reconciliation notes", notes],
    ];
    const blob = new Blob(["\ufeff", lines.map((line) => line.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `day-close-${date}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Day-close CSV downloaded");
  }

  if (!hasPermission("report_view") && !hasPermission("pos_create_sale")) {
    return <AppLayout title="Day Close"><p>Access denied.</p></AppLayout>;
  }

  return (
    <AppLayout title="Day Close" actions={
      <div className="flex gap-1 print:hidden">
        <Button size="sm" variant="outline" onClick={load} disabled={loading} aria-label="Refresh day close"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /><span className="hidden lg:inline"> Refresh</span></Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /><span className="hidden lg:inline"> Print</span></Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading}><Download className="h-4 w-4" /><span className="hidden lg:inline"> Export</span></Button>
      </div>
    }>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-end md:justify-between print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full min-w-0 sm:w-64"><Label>Close date</Label><DateField value={date} max={today} clearable={false} showToggle onChange={setDate} /></div>
          <div className="flex gap-1 pb-5">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setDate(today)}>Today</Button>
            <Button variant="outline" size="icon" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Live summary · nothing is locked<br />Payment dates use Nepal time{refreshedAt && <> · refreshed {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}
        </div>
      </div>

      <div className="mb-4 hidden print:block">
        <h2 className="text-xl font-semibold">Day Close — {date}</h2><p>Nepali date: {toBSLong(date)}</p>
      </div>

      {error && <Alert variant="destructive" className="mb-4"><AlertTitle>Could not load all figures</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <StatStrip items={[
        { label: "Net money in", value: npr(settlement.expected), sub: "After refunds and old-metal payouts" },
        { label: "Cash expected", value: npr(settlement.channels.find((row) => row.method === "cash")?.expected ?? 0), sub: "Receipts less cash paid out" },
        { label: "Wallets + bank", value: npr(walletBank), sub: "eSewa, Khalti, Fonepay, bank" },
        { label: "Advances held", value: npr(advances.closing), sub: `${npr(advances.customerHeld)} customers · ${npr(advances.orderHeld)} orders` },
      ]} />

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-5 w-5" /> Counter & bank reconciliation</CardTitle>
            {activeChannels.length > 0 && complete && totalDifference === 0 && <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Balanced</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">Expected comes from payment records. Enter the cash counted and each bank/wallet statement total; enter zero where there was no balance.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader><TableRow>
                <TableHead>Channel</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Paid out</TableHead>
                <TableHead className="text-right">Expected</TableHead><TableHead className="text-right">Counted / statement</TableHead><TableHead className="text-right">Difference</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {settlement.channels.map((row) => {
                  const difference = reconciliationDifference(row.expected, actual[row.method] ?? "");
                  return <TableRow key={row.method}>
                    <TableCell className="font-medium">{modeLabel(row.method)}</TableCell>
                    <TableCell className="text-right">{npr(row.received)}</TableCell>
                    <TableCell className="text-right">{row.paidOut ? npr(row.paidOut) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{npr(row.expected)}</TableCell>
                    <TableCell className="text-right print:hidden"><Input aria-label={`${modeLabel(row.method)} actual amount`} inputMode="decimal" className="ml-auto h-8 w-36 text-right" placeholder="Enter amount" value={actual[row.method] ?? ""} onChange={(event) => updateActual(row.method, event.target.value)} /></TableCell>
                    <TableCell className="hidden text-right print:table-cell">{actual[row.method] || "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${difference !== null && difference !== 0 ? "text-destructive" : ""}`}>
                      {difference === null ? "—" : `${difference > 0 ? "+" : difference < 0 ? "−" : ""}${npr(Math.abs(difference))}`}
                      {difference !== null && difference !== 0 && <span className="ml-1 text-xs font-normal">{difference > 0 ? "over" : "short"}</span>}
                    </TableCell>
                  </TableRow>;
                })}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{npr(settlement.channels.reduce((sum, row) => sum + row.received, 0))}</TableCell>
                  <TableCell className="text-right">{npr(settlement.channels.reduce((sum, row) => sum + row.paidOut, 0))}</TableCell>
                  <TableCell className="text-right">{npr(settlement.expected)}</TableCell>
                  <TableCell className="text-right">{activeChannels.some((row) => (actual[row.method] ?? "").trim()) ? npr(actualTotal) : "—"}</TableCell>
                  <TableCell className={`text-right ${totalDifference ? "text-destructive" : ""}`}>
                    {totalDifference === null ? `${activeChannels.filter((row) => !(actual[row.method] ?? "").trim()).length} figures needed` : `${totalDifference > 0 ? "+" : totalDifference < 0 ? "−" : ""}${npr(Math.abs(totalDifference))}`}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {(settlement.oldMetalCredit > 0 || settlement.creditSales > 0) && <div className="flex flex-wrap gap-x-6 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>Old metal credit (not cash): <strong>{npr(settlement.oldMetalCredit)}</strong></span>
            <span>Credit sales (not received): <strong>{npr(settlement.creditSales)}</strong></span>
          </div>}
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-5 w-5" /> Held advances</CardTitle><p className="text-xs text-muted-foreground">Cash-like advances only; old-metal credit is shown separately above.</p></CardHeader>
          <CardContent className="p-0"><Table><TableBody>
            {[
              ["Opening advance balance", advances.opening], ["Advances received on this date", advances.received],
              ["Applied to bills", -advances.applied], ["Adjustments", advances.adjustments], ["Reversed", -advances.reversed],
            ].map(([label, value]) => <TableRow key={String(label)}><TableCell>{label}</TableCell><TableCell className="text-right">{Number(value) < 0 ? "−" : ""}{npr(Math.abs(Number(value)))}</TableCell></TableRow>)}
            <TableRow className="bg-muted/40 font-semibold"><TableCell>Closing advance balance</TableCell><TableCell className="text-right">{npr(advances.closing)}</TableCell></TableRow>
            <TableRow><TableCell className="pl-6 text-muted-foreground">Customer advance balances</TableCell><TableCell className="text-right">{npr(advances.customerHeld)}</TableCell></TableRow>
            <TableRow><TableCell className="pl-6 text-muted-foreground">Order advance balances</TableCell><TableCell className="text-right">{npr(advances.orderHeld)}</TableCell></TableRow>
          </TableBody></Table></CardContent>
        </Card>
        <Card className="print:break-inside-avoid">
          <CardHeader className="pb-3"><CardTitle className="text-base">Reconciliation notes</CardTitle><p className="text-xs text-muted-foreground print:hidden">Actual figures and notes stay on this device for each date.</p></CardHeader>
          <CardContent><Textarea aria-label="Reconciliation notes" rows={7} placeholder="Deposit reference, counted by, explanation for over/short figures…" value={notes} onChange={(event) => setNotes(event.target.value)} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Payment activity · <DateText value={date} /></CardTitle><p className="text-xs text-muted-foreground">Standalone old-metal purchases are included as payouts in channel totals; trade-ins are non-cash and excluded.</p></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[800px]"><TableHeader><TableRow>
          <TableHead>Time</TableHead><TableHead>Activity</TableHead><TableHead>Customer</TableHead><TableHead>Bill / order</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Paid out</TableHead><TableHead>Reference</TableHead>
        </TableRow></TableHeader><TableBody>
          {loading ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading payment activity…</TableCell></TableRow>
            : dayPayments.length === 0 && dayPurchases.length === 0 ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No payment activity on this day.</TableCell></TableRow>
              : dayPayments.map((payment) => <TableRow key={payment.id}>
                <TableCell>{timeInNepal(payment.paid_at)}</TableCell><TableCell>{paymentActivityLabel(payment)}</TableCell><TableCell>{payment.customers?.full_name ?? "—"}</TableCell>
                <TableCell>{payment.invoice_id ? <Link className="font-medium hover:underline" to={`/invoices/${payment.invoice_id}`}>{payment.invoices?.invoice_number ?? "Open bill"}</Link> : payment.order_id ? <Link className="font-medium hover:underline" to={`/orders/${payment.order_id}`}>{payment.orders?.order_no ?? "Open order"}</Link> : "—"}</TableCell>
                <TableCell>{modeLabel(payment.method)}</TableCell><TableCell className="text-right">{Number(payment.amount) > 0 ? npr(Number(payment.amount)) : "—"}</TableCell><TableCell className="text-right">{Number(payment.amount) < 0 ? npr(Math.abs(Number(payment.amount))) : "—"}</TableCell><TableCell className="max-w-40 truncate">{payment.reference || "—"}</TableCell>
              </TableRow>)}
          {!loading && dayPurchases.map((purchase) => <TableRow key={`purchase-${purchase.id}`}>
            <TableCell>{timeInNepal(purchase.purchased_at)}</TableCell><TableCell>Old metal purchase payout</TableCell><TableCell>{purchase.customer_name ?? "—"}</TableCell>
            <TableCell>{purchase.receipt_number}</TableCell><TableCell>{modeLabel(purchase.payment_method)}</TableCell><TableCell className="text-right">—</TableCell>
            <TableCell className="text-right">{npr(Number(purchase.total_amount))}</TableCell><TableCell>{purchase.receipt_number}</TableCell>
          </TableRow>)}
        </TableBody></Table></div></CardContent>
      </Card>
    </AppLayout>
  );
}

function totalDifferenceValue(expected: number, actual: number): number {
  return Math.round((actual - expected) * 100) / 100;
}
