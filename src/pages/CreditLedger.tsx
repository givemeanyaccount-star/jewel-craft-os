import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { npr } from "@/lib/format";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

interface Group {
  customerId: string | null;
  name: string;
  phone: string | null;
  billed: number;
  paid: number;
  outstanding: number;
  invoices: any[];
}

export default function CreditLedger() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("invoices")
      .select("id, invoice_number, total, amount_paid, balance_due, issued_at, status, customer_id, customers(full_name, phone)")
      .gt("balance_due", 0)
      .not("status", "in", "(cancelled,refunded)")
      .order("issued_at", { ascending: false });

    const map = new Map<string, Group>();
    for (const inv of data ?? []) {
      const key = inv.customer_id ?? "walkin";
      const g = map.get(key) ?? {
        customerId: inv.customer_id,
        name: (inv as any).customers?.full_name ?? "Walk-in customer",
        phone: (inv as any).customers?.phone ?? null,
        billed: 0, paid: 0, outstanding: 0, invoices: [],
      };
      g.billed += Number(inv.total);
      g.paid += Number(inv.amount_paid);
      g.outstanding += Number(inv.balance_due);
      g.invoices.push(inv);
      map.set(key, g);
    }
    setGroups([...map.values()].sort((a, b) => b.outstanding - a.outstanding));
  }

  const ql = q.toLowerCase().trim();
  const filtered = groups.filter((g) => !ql || g.name.toLowerCase().includes(ql) || (g.phone ?? "").includes(ql));
  const totalOutstanding = filtered.reduce((a, g) => a + g.outstanding, 0);

  return (
    <AppLayout title="Pending Credit">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search customer or phone..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rounded-md border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total outstanding: </span>
          <span className="font-semibold text-destructive">{npr(totalOutstanding)}</span>
        </div>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Billed</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
            <TableHead className="text-right">Invoices</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No outstanding credit</TableCell></TableRow>
            ) : filtered.map((g) => {
              const key = g.customerId ?? "walkin";
              const open = openId === key;
              return (
                <Fragment key={key}>
                  <TableRow className="cursor-pointer" onClick={() => setOpenId(open ? null : key)}>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {g.name}
                      </div>
                      {g.phone && <div className="pl-5 text-xs text-muted-foreground">{g.phone}</div>}
                    </TableCell>
                    <TableCell className="text-right">{npr(g.billed)}</TableCell>
                    <TableCell className="text-right">{npr(g.paid)}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">{npr(g.outstanding)}</TableCell>
                    <TableCell className="text-right">{g.invoices.length}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={5} className="p-0">
                        <div className="divide-y">
                          {g.invoices.map((inv) => (
                            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                              <div>
                                <Link to={`/invoices/${inv.id}`} className="font-medium hover:underline">{inv.invoice_number}</Link>
                                <span className="ml-2 text-xs text-muted-foreground">{new Date(inv.issued_at).toLocaleDateString()}</span>
                                <Badge variant="outline" className="ml-2 capitalize">{inv.status}</Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                <span>Total {npr(inv.total)}</span>
                                <span>Paid {npr(inv.amount_paid)}</span>
                                <span className="font-medium text-destructive">Due {npr(inv.balance_due)}</span>
                                <Button asChild size="sm" variant="outline"><Link to={`/invoices/${inv.id}`}>Open</Link></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </AppLayout>
  );
}
