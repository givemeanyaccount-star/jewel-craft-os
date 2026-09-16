import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, RefreshCw } from "lucide-react";
import { npr, gms, gramsToTola, round2 } from "@/lib/format";
import { usePermission } from "@/hooks/usePermission";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function shiftISO(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function monthStartISO() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

/** Wastage carried by a bill line, in grams. */
function lineWastageGrams(r: any) {
  const net = Number(r.weight ?? 0);
  const input = Number(r.wastage_input ?? 0);
  if (!input) return 0;
  if (r.wastage_type === "percentage") return (net * input) / 100;
  if (r.wastage_type === "weight") return input;
  return 0;
}

interface Row {
  id: string;
  date: string;
  number: string;
  customer: string;
  tola: number;
  wastage: number;
  netPayable: number;
  roundOff: number;
  status: string;
}

export default function SalesReport() {
  const nav = useNavigate();
  const { hasPermission } = usePermission();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, issued_at, status, total, round_off, old_gold_credit, customers(full_name), invoice_items(weight, wastage_input, wastage_type)")
      .gte("issued_at", `${from}T00:00:00`)
      .lte("issued_at", `${to}T23:59:59`)
      .order("issued_at", { ascending: false });
    setRows((data ?? []).map((inv: any) => {
      const items = inv.invoice_items ?? [];
      const grams = items.reduce((a: number, r: any) => a + Number(r.weight ?? 0), 0);
      return {
        id: inv.id,
        date: inv.issued_at,
        number: inv.invoice_number,
        customer: inv.customers?.full_name ?? "—",
        tola: round2(gramsToTola(grams)),
        wastage: items.reduce((a: number, r: any) => a + lineWastageGrams(r), 0),
        netPayable: Number(inv.total ?? 0),
        roundOff: Number(inv.round_off ?? 0),
        status: inv.status,
      };
    }));
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (status === "all" || r.status === status) &&
      (!q || r.number.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q)));
  }, [rows, status, search]);

  const totals = useMemo(() => filtered.reduce((a, r) => ({
    tola: a.tola + r.tola,
    wastage: a.wastage + r.wastage,
    net: a.net + r.netPayable,
    roundOff: a.roundOff + r.roundOff,
  }), { tola: 0, wastage: 0, net: 0, roundOff: 0 }), [filtered]);

  function exportCsv() {
    const head = ["Date", "Bill no.", "Customer", "Tola sold", "Wastage (g)", "Net payable", "Round-off", "Status"];
    const body = filtered.map((r) => [
      new Date(r.date).toLocaleDateString(), r.number, r.customer,
      r.tola.toFixed(3), r.wastage.toFixed(3), r.netPayable.toFixed(2), r.roundOff.toFixed(2), r.status,
    ]);
    const csv = [head, ...body].map((line) =>
      line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `sales-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!hasPermission("report_view") && !hasPermission("invoice_view")) {
    return <AppLayout title="Sales Report"><p>Access denied.</p></AppLayout>;
  }

  return (
    <AppLayout title="Sales Report" actions={
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
      </div>
    }>
      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {["issued", "partial", "paid", "cancelled", "refunded", "draft"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Search</Label>
            <Input placeholder="Bill no. or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-end gap-1">
            <Button size="sm" variant="outline" onClick={() => { setFrom(todayISO()); setTo(todayISO()); }}>Today</Button>
            <Button size="sm" variant="outline" onClick={() => { setFrom(shiftISO(6)); setTo(todayISO()); }}>This week</Button>
            <Button size="sm" variant="outline" onClick={() => { setFrom(monthStartISO()); setTo(todayISO()); }}>This month</Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Bills", value: String(filtered.length) },
          { label: "Tola sold", value: totals.tola.toFixed(3) },
          { label: "Wastage (g)", value: gms(totals.wastage) },
          { label: "Net payable", value: npr(totals.net) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Posted bills</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Bill no.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Tola sold</TableHead>
                <TableHead className="text-right">Wastage (g)</TableHead>
                <TableHead className="text-right">Net payable</TableHead>
                <TableHead className="text-right">Round-off</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No bills in this period.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => nav(`/invoices/${r.id}`)}>
                  <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{r.number}</TableCell>
                  <TableCell>{r.customer}</TableCell>
                  <TableCell className="text-right">{r.tola.toFixed(3)}</TableCell>
                  <TableCell className="text-right">{gms(r.wastage)}</TableCell>
                  <TableCell className="text-right">{npr(r.netPayable)}</TableCell>
                  <TableCell className="text-right">
                    {r.roundOff === 0 ? "—" : `${r.roundOff < 0 ? "− " : "+ "}${npr(Math.abs(r.roundOff))}`}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
