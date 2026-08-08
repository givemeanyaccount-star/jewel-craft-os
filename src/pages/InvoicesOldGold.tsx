import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { npr, gms } from "@/lib/format";
import { Search } from "lucide-react";
import { InvoiceSubNav } from "./Invoices";

const SOURCE_FILTERS = ["all", "direct", "during_sale"];

export default function InvoicesOldGold() {
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase
      .from("old_gold_purchases")
      .select("*, customers(full_name, phone), invoices:linked_invoice_id(invoice_number)")
      .order("purchased_at", { ascending: false })
      .limit(500);
    setList(data ?? []);
  }

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    return list.filter((p) => {
      const isDirect = !p.linked_invoice_id;
      if (source === "direct" && !isDirect) return false;
      if (source === "during_sale" && isDirect) return false;
      if (!ql) return true;
      return [p.receipt_number, p.customers?.full_name ?? p.customer_name ?? "", p.customers?.phone ?? p.customer_phone ?? "", p.invoices?.invoice_number ?? ""]
        .some((f) => (f ?? "").toLowerCase().includes(ql));
    });
  }, [list, q, source]);

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, p) => s + Number(p.total_amount || 0), 0),
    netWeight: filtered.reduce((s, p) => s + Number(p.net_weight || 0), 0),
  }), [filtered]);

  return (
    <AppLayout title="Invoices">
      <InvoiceSubNav active="oldgold" />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search receipt, customer, or invoice #..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="direct">Direct purchase</SelectItem>
            <SelectItem value="during_sale">During a sale</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Receipts</div><div className="text-lg font-semibold">{totals.count}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total paid out</div><div className="text-lg font-semibold">{npr(totals.amount)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Net weight</div><div className="text-lg font-semibold">{gms(totals.netWeight)}</div></CardContent></Card>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Receipt</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead>
            <TableHead>Source</TableHead><TableHead>Metal</TableHead>
            <TableHead className="text-right">Net wt</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No old metal purchases</TableCell></TableRow>
              : filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.receipt_number}</TableCell>
                  <TableCell><div>{p.customers?.full_name ?? p.customer_name}</div><div className="text-xs text-muted-foreground">{p.customers?.phone ?? p.customer_phone}</div></TableCell>
                  <TableCell>{new Date(p.purchased_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {p.linked_invoice_id ? (
                      <Badge variant="outline">During sale {p.invoices?.invoice_number && (
                        <Link to={`/invoices/${p.linked_invoice_id}`} className="ml-1 underline">{p.invoices.invoice_number}</Link>
                      )}</Badge>
                    ) : <Badge variant="secondary">Direct purchase</Badge>}
                  </TableCell>
                  <TableCell className="capitalize">{p.metal} {p.purity}</TableCell>
                  <TableCell className="text-right">{gms(p.net_weight)}</TableCell>
                  <TableCell className="text-right font-medium">{npr(p.total_amount)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </AppLayout>
  );
}
