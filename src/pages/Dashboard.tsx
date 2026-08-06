import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/hooks/useAuth";
import { npr } from "@/lib/format";
import { DailyRateDialog, todayIsoDate } from "@/components/DailyRateDialog";
import { Package, Receipt, Users, Coins, TrendingUp, AlertCircle, Wrench, CircleDollarSign } from "lucide-react";

const REPAIR_STAGES = [
  { key: "received", label: "Received" },
  { key: "in_progress", label: "In progress" },
  { key: "quality_check", label: "Quality check" },
  { key: "ready", label: "Ready for pickup" },
] as const;

interface Stats {
  itemsInStock: number;
  itemsSoldToday: number;
  salesToday: number;
  pendingBalance: number;
  customers: number;
  oldGoldToday: number;
  latestGoldRate: number | null;
  creditCustomers: number;
}

export default function Dashboard() {
  const { roles, rolesError } = useAuth();
  const { hasPermission } = usePermission();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [repairCounts, setRepairCounts] = useState<Record<string, number>>({});
  const [missingIdCount, setMissingIdCount] = useState(0);
  const [rateDialog, setRateDialog] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [itemsAgg, soldToday, invoicesToday, balance, customers, oldGold, rate, recent, repairs, todayRate, missingId] = await Promise.all([
      supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("status", "in_stock"),
      supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("status", "sold").gte("updated_at", todayIso),
      supabase.from("invoices").select("total").gte("issued_at", todayIso).neq("status", "cancelled"),
      supabase.from("invoices").select("balance_due, customer_id").gt("balance_due", 0),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("old_gold_purchases").select("total_amount").gte("purchased_at", todayIso),
      supabase.from("metal_rates").select("rate_per_gram, effective_date").eq("metal", "gold").eq("purity", "24K").order("effective_date", { ascending: false }).limit(1),
      supabase.from("invoices").select("id, invoice_number, total, balance_due, issued_at, customers(full_name)").order("issued_at", { ascending: false }).limit(8),
      supabase.from("repair_items").select("status"),
      supabase.from("metal_rates").select("id").eq("effective_date", todayIsoDate()).limit(1),
      supabase.from("old_gold_purchases").select("id", { count: "exact", head: true })
        .or("id_doc_type.is.null,id_doc_number.is.null,id_doc_image_url.is.null"),
    ]);


    setStats({
      itemsInStock: itemsAgg.count ?? 0,
      itemsSoldToday: soldToday.count ?? 0,
      salesToday: (invoicesToday.data ?? []).reduce((a, b) => a + Number(b.total), 0),
      pendingBalance: (balance.data ?? []).reduce((a, b) => a + Number(b.balance_due), 0),
      customers: customers.count ?? 0,
      oldGoldToday: (oldGold.data ?? []).reduce((a, b) => a + Number(b.total_amount), 0),
      latestGoldRate: rate.data?.[0]?.rate_per_gram ?? null,
      creditCustomers: new Set((balance.data ?? []).map((b: any) => b.customer_id ?? "walkin")).size,
    });
    setRecentInvoices(recent.data ?? []);
    const rc: Record<string, number> = {};
    for (const r of repairs.data ?? []) rc[r.status] = (rc[r.status] ?? 0) + 1;
    setRepairCounts(rc);
    setMissingIdCount(missingId.count ?? 0);
    if ((todayRate.data ?? []).length === 0) setRateDialog(true);
  }


  const cards = [
    { label: "Today's Sales", value: npr(stats?.salesToday ?? 0), icon: Receipt, hint: `${stats?.itemsSoldToday ?? 0} items sold` },
    { label: "Items in Stock", value: stats?.itemsInStock ?? 0, icon: Package, hint: "Available across showcases", asLink: "/inventory" },
    { label: "Outstanding Credit", value: npr(stats?.pendingBalance ?? 0), icon: AlertCircle, hint: `${stats?.creditCustomers ?? 0} customers with dues`, asLink: "/credit" },
    { label: "Customers", value: stats?.customers ?? 0, icon: Users, hint: "Total in CRM", asLink: "/customers" },
    { label: "Old Gold Today", value: npr(stats?.oldGoldToday ?? 0), icon: Coins, hint: "Purchased today" },
    { label: "Gold Rate (24K)", value: stats?.latestGoldRate ? npr(stats.latestGoldRate) + "/g" : "—", icon: TrendingUp, hint: "Latest entry", asLink: "/rates" },
  ];

  return (
    <AppLayout title="Dashboard">
      {(rolesError || roles.length === 0) && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <div className="font-medium text-destructive">
              {rolesError ? "Could not load your permissions" : "No roles assigned"}
            </div>
            <p className="text-muted-foreground">
              {rolesError
                ? "Your access rights could not be read, so menus and data may be hidden. Try signing out and back in, or contact an administrator."
                : "Your account has no roles yet, so most features are hidden. Ask an administrator to assign you a role."}
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

        {cards.map((c) => {
          const Card_ = (
            <Card key={c.label} className="transition hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                <c.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tracking-tight">{c.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
              </CardContent>
            </Card>
          );
          return c.asLink ? <Link key={c.label} to={c.asLink}>{Card_}</Link> : Card_;
        })}
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Invoices</CardTitle>
          <Button asChild size="sm" variant="outline"><Link to="/invoices">View all</Link></Button>
        </CardHeader>
        <CardContent>
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="divide-y">
              {recentInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{inv.invoice_number}</div>
                    <div className="truncate text-xs text-muted-foreground">{inv.customers?.full_name ?? "Walk-in"} · {new Date(inv.issued_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{npr(inv.total)}</div>
                    {Number(inv.balance_due) > 0 && <Badge variant="outline" className="mt-0.5 text-xs">Due {npr(inv.balance_due)}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {hasPermission("repair_manage") && (
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> Repair Jobs</CardTitle>
          <Button asChild size="sm" variant="outline"><Link to="/repairs">View all</Link></Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {REPAIR_STAGES.map((s) => (
            <Link key={s.key} to="/repairs" className="rounded-md border p-3 transition hover:bg-muted/50">
              <div className="text-2xl font-semibold">{repairCounts[s.key] ?? 0}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </Link>
          ))}
        </CardContent>
      </Card>
      )}

      {hasPermission("credit_view") && (
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-primary" /> Pending Credit</CardTitle>
          <Button asChild size="sm" variant="outline"><Link to="/credit">Open credit ledger</Link></Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {npr(stats?.pendingBalance ?? 0)} outstanding across {stats?.creditCustomers ?? 0} customer(s), including partially paid invoices.
        </CardContent>
      </Card>
      )}

      <DailyRateDialog open={rateDialog} onOpenChange={setRateDialog} onSaved={load} />
    </AppLayout>
  );
}
