import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermission } from "@/hooks/usePermission";
import { supabase } from "@/integrations/supabase/client";
import { filterStock, loadAllStock, stockBalances, stockTotals, stockWeight, type StockItem } from "@/lib/stockReport";

type Option = { id: string; name: string };
const initialFilters = { category: "all", location: "all", metal: "all", purity: "all", status: "live", search: "" };

export default function StockReport() {
  const { hasPermission } = usePermission();
  const allowed = hasPermission("report_view");
  const [filters, setFilters] = useState(initialFilters);
  const [unit, setUnit] = useState("g");
  const [view, setView] = useState("category");
  const report = useQuery({
    queryKey: ["live-stock-report"], enabled: allowed, refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [items, categories, locations] = await Promise.all([
        loadAllStock<StockItem>((from, to) => supabase.from("inventory_items")
          .select("id, sku, legacy_code, name, metal, purity, status, category_id, location_id, gross_weight, stone_weight, net_weight, fine_weight")
          .in("status", ["in_stock", "reserved"]).order("id").range(from, to)),
        loadAllStock<Option>((from, to) => supabase.from("categories").select("id, name").order("id").range(from, to)),
        loadAllStock<Option>((from, to) => supabase.from("locations").select("id, name").order("id").range(from, to)),
      ]);
      return { items, categories, locations };
    },
  });
  const items = report.data?.items ?? [];
  const categories = report.data?.categories ?? [];
  const locations = report.data?.locations ?? [];
  const categoryName = (id: string | null) => categories.find(c => c.id === id)?.name ?? "Uncategorized";
  const locationName = (id: string | null) => locations.find(l => l.id === id)?.name ?? "Unassigned";
  const filtered = useMemo(() => filterStock(items, filters), [items, filters]);
  const totals = useMemo(() => stockTotals(filtered), [filtered]);
  const balances = useMemo(() => stockBalances(filtered, view === "purity").sort((a, b) =>
    categoryName(a.categoryId).localeCompare(categoryName(b.categoryId)) || a.metal.localeCompare(b.metal) || a.purity.localeCompare(b.purity)
  ), [filtered, view, categories]);
  const metals = [...new Set(items.map(i => i.metal))].sort();
  const purities = [...new Set(items.filter(i => filters.metal === "all" || i.metal === filters.metal).map(i => i.purity))].sort();
  const weight = (value: number) => stockWeight(value, unit);
  const update = (key: keyof typeof filters, value: string) => setFilters(current => ({ ...current, [key]: value }));

  function exportCsv() {
    const weights = (row: { gross: number; stone: number; net: number; fine: number }) => [weight(row.gross), weight(row.stone), weight(row.net), weight(row.fine)];
    const headers = view === "items"
      ? ["SKU", "Old record", "Item", "Category", "Metal", "Purity", "Location", "Status", `Gross (${unit})`, `Stone (${unit})`, `Net (${unit})`, `Fine (${unit})`]
      : ["Category", "Metal", ...(view === "purity" ? ["Purity"] : []), "Pieces", "Available", "Reserved", `Gross (${unit})`, `Stone (${unit})`, `Net (${unit})`, `Fine (${unit})`];
    const rows = view === "items" ? filtered.map(i => [i.sku, i.legacy_code ?? "", i.name, categoryName(i.category_id), i.metal, i.purity, locationName(i.location_id), i.status, ...weights({ gross: i.gross_weight, stone: i.stone_weight, net: i.net_weight, fine: i.fine_weight })])
      : balances.map(r => [categoryName(r.categoryId), r.metal, ...(view === "purity" ? [r.purity] : []), r.pieces, r.available, r.reserved, ...weights(r)]);
    const csv = [headers, ...rows].map(row => row.map(value => {
      const text = String(value);
      return `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `live-stock-${view}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!allowed) return <AppLayout title="Stock & Metal Report"><p>Access denied.</p></AppLayout>;

  return <AppLayout title="Stock & Metal Report">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground" aria-live="polite">
        {report.isFetching ? "Updating stock…" : report.dataUpdatedAt ? `Last updated ${new Date(report.dataUpdatedAt).toLocaleString("en-GB", { timeZone: "Asia/Kathmandu" })} · Nepal time` : "Live stock"}
      </div>
      <div className="flex flex-wrap gap-2">
        <Tabs value={unit} onValueChange={setUnit} aria-label="Weight unit"><TabsList><TabsTrigger value="g">Grams</TabsTrigger><TabsTrigger value="tola">Tola</TabsTrigger></TabsList></Tabs>
        <Button variant="outline" size="sm" disabled={report.isFetching} onClick={() => report.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        <Button variant="outline" size="sm" disabled={!filtered.length || report.isError} onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
      </div>
    </div>

    <section className="mb-6 grid grid-cols-2 gap-4 border-y py-5 lg:grid-cols-4" aria-label="Stock totals">
      {[{ label: "Pieces", value: totals.pieces.toLocaleString(), detail: `${totals.available} available · ${totals.reserved} reserved` },
        { label: `Gross weight (${unit})`, value: weight(totals.gross) },
        { label: `Stone weight (${unit})`, value: weight(totals.stone) },
        { label: `Net weight (${unit})`, value: weight(totals.net) }].map(stat => <div key={stat.label} className="min-w-0">
          <div className="text-xs text-muted-foreground">{stat.label}</div><div className="break-words text-xl font-semibold tabular-nums">{report.isLoading || report.isError ? "—" : stat.value}</div>
          {stat.detail && <div className="text-xs text-muted-foreground">{!report.isError && stat.detail}</div>}
        </div>)}
    </section>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-1"><Label htmlFor="stock-search">Search items</Label><Input id="stock-search" placeholder="Item, SKU or old record" value={filters.search} onChange={e => update("search", e.target.value)} /></div>
      {[
        { key: "category" as const, label: "Category", options: [{ id: "all", name: "All categories" }, ...[...categories].sort((a, b) => a.name.localeCompare(b.name)), { id: "uncategorized", name: "Uncategorized" }] },
        { key: "metal" as const, label: "Metal", options: [{ id: "all", name: "All metals" }, ...metals.map(id => ({ id, name: id }))] },
        { key: "purity" as const, label: "Purity", options: [{ id: "all", name: "All purities" }, ...purities.map(id => ({ id, name: id }))] },
        { key: "location" as const, label: "Location", options: [{ id: "all", name: "All locations" }, ...locations, { id: "unassigned", name: "Unassigned" }] },
        { key: "status" as const, label: "Stock status", options: [{ id: "live", name: "Available + reserved" }, { id: "in_stock", name: "Available only" }, { id: "reserved", name: "Reserved only" }] },
      ].map(control => <div key={control.key} className="space-y-1">
        <Label htmlFor={`stock-${control.key}`}>{control.label}</Label>
        <Select value={filters[control.key]} onValueChange={value => control.key === "metal" ? setFilters(current => ({ ...current, metal: value, purity: "all" })) : update(control.key, value)}>
          <SelectTrigger id={`stock-${control.key}`} className="capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>{control.options.map(option => <SelectItem key={option.id} value={option.id} className="capitalize">{option.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>)}
      <div className="flex items-end"><Button variant="ghost" onClick={() => setFilters(initialFilters)}>Clear filters</Button></div>
    </div>

    <Tabs value={view} onValueChange={setView} className="mb-4"><TabsList className="max-w-full"><TabsTrigger value="category">By category</TabsTrigger><TabsTrigger value="purity">By purity</TabsTrigger><TabsTrigger value="items">Items</TabsTrigger></TabsList></Tabs>
    {report.isError ? <div role="alert" className="border border-destructive p-4 text-sm text-destructive">Could not update stock. {report.error.message} <Button variant="outline" size="sm" onClick={() => report.refetch()}>Retry</Button></div> : <Table>
      <TableHeader><TableRow>
        {view === "items" ? <><TableHead>Item / SKU</TableHead><TableHead>Category</TableHead><TableHead>Metal</TableHead><TableHead>Purity</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead></> : <><TableHead>Category</TableHead><TableHead>Metal</TableHead>{view === "purity" && <TableHead>Purity</TableHead>}<TableHead className="text-right">Pieces</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right">Reserved</TableHead></>}
        {["Gross", "Stone", "Net", "Fine"].map(label => <TableHead key={label} className="text-right whitespace-nowrap">{label} ({unit})</TableHead>)}
      </TableRow></TableHeader>
      <TableBody>
        {report.isLoading || filtered.length === 0 ? <TableRow><TableCell colSpan={11} className="py-10 text-center text-muted-foreground">{report.isLoading ? "Loading stock…" : "No live stock matches these filters."}</TableCell></TableRow> : view === "items" ? filtered.map(item => <TableRow key={item.id}>
          <TableCell className="min-w-40">{hasPermission("inventory_view") ? <Link className="font-medium hover:underline" to={`/inventory/${item.id}`}>{item.name}</Link> : item.name}<div className="text-xs text-muted-foreground">{item.sku}{item.legacy_code && ` · ${item.legacy_code}`}</div></TableCell>
          <TableCell>{categoryName(item.category_id)}</TableCell><TableCell className="capitalize">{item.metal}</TableCell><TableCell>{item.purity}</TableCell><TableCell>{locationName(item.location_id)}</TableCell><TableCell>{item.status === "reserved" ? "Reserved" : "Available"}</TableCell>
          {[item.gross_weight, item.stone_weight, item.net_weight, item.fine_weight].map((value, index) => <TableCell key={index} className="text-right tabular-nums">{weight(value)}</TableCell>)}
        </TableRow>) : balances.map(row => <TableRow key={row.key}>
          <TableCell className="font-medium">{categoryName(row.categoryId)}</TableCell><TableCell className="capitalize">{row.metal}</TableCell>{view === "purity" && <TableCell>{row.purity}</TableCell>}
          {[row.pieces, row.available, row.reserved].map((value, index) => <TableCell key={index} className="text-right tabular-nums">{value}</TableCell>)}
          {[row.gross, row.stone, row.net, row.fine].map((value, index) => <TableCell key={index} className="text-right tabular-nums">{weight(value)}</TableCell>)}
        </TableRow>)}
      </TableBody>
    </Table>}
    {!report.isError && filtered.length > 0 && <section className="mt-6 border-t pt-4" aria-label="Fine metal balances">
      <h2 className="mb-3 text-sm font-semibold">Fine metal balances ({unit})</h2>
      <div className="flex flex-wrap gap-x-8 gap-y-3">{[...new Set(filtered.map(item => item.metal))].sort().map(metal => <div key={metal}>
        <span className="mr-3 text-sm capitalize text-muted-foreground">{metal}</span><span className="font-semibold tabular-nums">{weight(stockTotals(filtered.filter(item => item.metal === metal)).fine)}</span>
      </div>)}</div>
    </section>}
  </AppLayout>;
}