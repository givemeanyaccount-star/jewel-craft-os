import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { npr } from "@/lib/format";
import { Search, Plus } from "lucide-react";

const STATUSES = ["all", "issued", "partial", "paid", "cancelled", "refunded"];

export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("invoices")
      .select("*, customers(full_name, phone)")
      .order("issued_at", { ascending: false }).limit(300);
    setInvoices(data ?? []);
  }

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    return invoices.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (!ql) return true;
      return [i.invoice_number, i.customers?.full_name ?? "", i.customers?.phone ?? ""].some((f) => f.toLowerCase().includes(ql));
    });
  }, [invoices, q, status]);

  return (
    <AppLayout title="Invoices" actions={
      <Button size="sm" asChild><Link to="/pos"><Plus className="mr-1 h-4 w-4" /> New Sale</Link></Button>
    }>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search invoice # or customer..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead>
            <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No invoices</TableCell></TableRow>
              : filtered.map((i) => (
                <TableRow key={i.id} className="cursor-pointer">
                  <TableCell><Link to={`/invoices/${i.id}`} className="font-medium hover:underline">{i.invoice_number}</Link></TableCell>
                  <TableCell>{i.customers?.full_name ?? "Walk-in"}</TableCell>
                  <TableCell>{new Date(i.issued_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{npr(i.total)}</TableCell>
                  <TableCell className="text-right">{Number(i.balance_due) > 0 ? <span className="text-destructive">{npr(i.balance_due)}</span> : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{i.status}</Badge></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </AppLayout>
  );
}
