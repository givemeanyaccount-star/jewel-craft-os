import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/hooks/useAuth";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RateCard, RatePoint } from "@/components/dashboard/RateCard";
import { RateTrendChart } from "@/components/dashboard/RateTrendChart";
import { VolumeChart, VolumePoint } from "@/components/dashboard/VolumeChart";
import { ActivityLog, ActivityEntry } from "@/components/dashboard/ActivityLog";
import {
  MissingIdCard,
  OutstandingCreditCard,
  PendingCreditCard,
  PendingQuotationsCard,
  RepairStagesCard,
  TodaySalesCard,
} from "@/components/dashboard/OpsCards";
import { pendingQuotationStats, sweepExpiredQuotations, PendingQuotationStats } from "@/lib/quotations";
import { DailyRateDialog, todayIsoDate } from "@/components/DailyRateDialog";
import { AlertCircle } from "lucide-react";

interface Stats {
  itemsSoldToday: number;
  salesToday: number;
  pendingBalance: number;
  creditCustomers: number;
}

const DAY = 24 * 60 * 60 * 1000;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { roles, rolesError } = useAuth();
  const { hasPermission } = usePermission();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [repairCounts, setRepairCounts] = useState<Record<string, number>>({});
  const [missingIdCount, setMissingIdCount] = useState(0);
  const [rateDialog, setRateDialog] = useState(false);
  const [rates, setRates] = useState<Record<string, { latest: number | null; history: RatePoint[] }>>({});
  const [volume, setVolume] = useState<VolumePoint[]>([]);
  const [quoteStats, setQuoteStats] = useState<PendingQuotationStats>({ count: 0, value: 0, expiringSoon: 0 });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const weekAgo = new Date(today.getTime() - 6 * DAY);
    const weekAgoIso = weekAgo.toISOString();
    const weekAgoDate = dayKey(weekAgo);

    const [
      soldToday,
      invoicesToday,
      balance,
      recentInvoices,
      recentPurchases,
      recentOldGold,
      repairs,
      todayRate,
      missingId,
      rateHistory,
      weekInvoices,
      weekPurchases,
      weekOldGold,
    ] = await Promise.all([
      supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("status", "sold").gte("updated_at", todayIso),
      supabase.from("invoices").select("total").gte("issued_at", todayIso).neq("status", "cancelled"),
      supabase.from("invoices").select("balance_due, customer_id").gt("balance_due", 0),
      supabase
        .from("invoices")
        .select("id, invoice_number, total, issued_at, customers(full_name)")
        .order("issued_at", { ascending: false })
        .limit(8),
      supabase
        .from("purchases")
        .select("id, purchase_no, total_amount, purchase_date, suppliers(name)")
        .order("purchase_date", { ascending: false })
        .limit(5),
      supabase
        .from("old_gold_purchases")
        .select("id, receipt_number, total_amount, purchased_at, customer_name")
        .order("purchased_at", { ascending: false })
        .limit(5),
      supabase.from("repair_items").select("status"),
      supabase.from("metal_rates").select("id").eq("effective_date", todayIsoDate()).limit(1),
      supabase
        .from("old_gold_purchases")
        .select("id", { count: "exact", head: true })
        .or("id_doc_type.is.null,id_doc_number.is.null,id_doc_image_url.is.null"),
      supabase
        .from("metal_rates")
        .select("metal, purity, rate_per_gram, effective_date")
        .gte("effective_date", weekAgoDate)
        .order("effective_date", { ascending: true }),
      supabase.from("invoices").select("total, issued_at").gte("issued_at", weekAgoIso).neq("status", "cancelled"),
      supabase.from("purchases").select("total_amount, purchase_date").gte("purchase_date", weekAgoDate),
      supabase.from("old_gold_purchases").select("total_amount, purchased_at").gte("purchased_at", weekAgoIso),
    ]);

    const balanceRows = balance.data ?? [];
    setStats({
      itemsSoldToday: soldToday.count ?? 0,
      salesToday: (invoicesToday.data ?? []).reduce((a, b) => a + Number(b.total), 0),
      pendingBalance: balanceRows.reduce((a, b) => a + Number(b.balance_due), 0),
      creditCustomers: new Set(balanceRows.map((b: any) => b.customer_id ?? "walkin")).size,
    });

    const rc: Record<string, number> = {};
    for (const r of repairs.data ?? []) rc[r.status] = (rc[r.status] ?? 0) + 1;
    setRepairCounts(rc);
    setMissingIdCount(missingId.count ?? 0);
    await sweepExpiredQuotations();
    setQuoteStats(await pendingQuotationStats());
    if ((todayRate.data ?? []).length === 0 && hasPermission("metal_rate_manage")) setRateDialog(true);

    // ── metal rates ───────────────────────────────────────
    const grouped: Record<string, { latest: number | null; history: RatePoint[] }> = {};
    for (const r of rateHistory.data ?? []) {
      const key = `${r.metal}:${r.purity}`;
      grouped[key] ??= { latest: null, history: [] };
      grouped[key].history.push({ date: r.effective_date, rate: Number(r.rate_per_gram) });
      grouped[key].latest = Number(r.rate_per_gram);
    }
    setRates(grouped);

    // ── daily volume ──────────────────────────────────────
    const buckets: Record<string, VolumePoint> = {};
    const order: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY);
      const k = dayKey(d);
      order.push(k);
      buckets[k] = { day: d.toLocaleDateString(undefined, { weekday: "short" }), date: k, sales: 0, purchases: 0 };
    }
    for (const inv of weekInvoices.data ?? []) {
      const k = dayKey(new Date(inv.issued_at));
      if (buckets[k]) buckets[k].sales += Number(inv.total);
    }
    for (const p of weekPurchases.data ?? []) {
      const k = String(p.purchase_date).slice(0, 10);
      if (buckets[k]) buckets[k].purchases += Number(p.total_amount);
    }
    for (const g of weekOldGold.data ?? []) {
      const k = dayKey(new Date(g.purchased_at));
      if (buckets[k]) buckets[k].purchases += Number(g.total_amount);
    }
    setVolume(order.map((k) => buckets[k]));

    // ── activity log ──────────────────────────────────────
    const entries: ActivityEntry[] = [
      ...(recentInvoices.data ?? []).map((i: any) => ({
        id: i.id,
        kind: "sale" as const,
        ref: i.invoice_number,
        party: i.customers?.full_name ?? "Walk-in",
        at: i.issued_at,
        amount: Number(i.total),
        to: `/invoices/${i.id}`,
      })),
      ...(recentPurchases.data ?? []).map((p: any) => ({
        id: p.id,
        kind: "purchase" as const,
        ref: p.purchase_no,
        party: p.suppliers?.name ?? "Supplier",
        at: new Date(p.purchase_date).toISOString(),
        amount: Number(p.total_amount),
        to: `/purchases/${p.id}`,
      })),
      ...(recentOldGold.data ?? []).map((g: any) => ({
        id: g.id,
        kind: "oldgold" as const,
        ref: g.receipt_number,
        party: g.customer_name ?? "Walk-in",
        at: g.purchased_at,
        amount: Number(g.total_amount),
        to: `/purchases?tab=oldgold`,
      })),
    ]
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 12);
    setActivity(entries);
  }

  const gold24 = rates["gold:24K"];
  const gold22 = rates["gold:22K"];
  const silver = rates["silver:999"] ?? rates["silver:925"];

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-4">
        {(rolesError || roles.length === 0) && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
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

        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">Dashboard</h2>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              JewelMaster OS · Kathmandu
            </p>
          </div>
          <QuickActions />
        </div>

        {/* Rates + trend side by side */}
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="grid gap-4 sm:grid-cols-3 xl:col-span-5 xl:auto-rows-min xl:grid-cols-1">
            <RateCard label="Gold 24K" ratePerGram={gold24?.latest ?? null} history={gold24?.history} />
            <RateCard label="Gold 22K" ratePerGram={gold22?.latest ?? null} />
            <RateCard label="Silver" ratePerGram={silver?.latest ?? null} history={silver?.history} />
          </div>
          <div className="xl:col-span-7">
            <RateTrendChart goldHistory={gold24?.history} silverHistory={silver?.history} />
          </div>
        </div>

        {/* Ops & alerts */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <OutstandingCreditCard amount={stats?.pendingBalance ?? 0} customers={stats?.creditCustomers ?? 0} />
          <RepairStagesCard counts={repairCounts} />
          <PendingCreditCard amount={stats?.pendingBalance ?? 0} customers={stats?.creditCustomers ?? 0} />
          <PendingQuotationsCard count={quoteStats.count} value={quoteStats.value} expiringSoon={quoteStats.expiringSoon} />
          {missingIdCount > 0 && hasPermission("old_gold_purchase") ? (
            <MissingIdCard count={missingIdCount} />
          ) : (
            <TodaySalesCard amount={stats?.salesToday ?? 0} items={stats?.itemsSoldToday ?? 0} />
          )}
        </div>

        {/* Chart + activity */}
        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <div className="xl:col-span-1">
            <VolumeChart data={volume} />
          </div>
          <div className="xl:col-span-2">
            <ActivityLog entries={activity} />
          </div>
        </div>
      </div>

      {hasPermission("metal_rate_manage") && (
        <DailyRateDialog open={rateDialog} onOpenChange={setRateDialog} onSaved={load} />
      )}
    </AppLayout>
  );
}
