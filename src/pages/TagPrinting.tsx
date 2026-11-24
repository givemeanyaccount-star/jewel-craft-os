import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Printer, Search, Palette, Tag, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRScanButton } from "@/components/QRScanButton";
import { TagPrintDialog } from "@/components/inventory/TagPrintDialog";
import { gms } from "@/lib/format";
import { clampCopies } from "@/lib/tagTemplate";
import { filterTagItems, type TagFilter, type TagListItem } from "@/lib/tagFilters";
import { cn } from "@/lib/utils";

export default function TagPrinting() {
  const [params, setParams] = useSearchParams();
  const designer = params.get("design") === "1";
  const f: TagFilter = {
    q: params.get("q") ?? "", category: params.get("cat") ?? "all", metal: params.get("metal") ?? "all",
    status: params.get("status") ?? "in_stock", added: (params.get("added") as TagFilter["added"]) ?? "any",
    unprinted: params.get("unprinted") === "1",
  };
  const setF = (k: string, v: string) => { const p = new URLSearchParams(params); if (!v || v === "all" || v === "any" || v === "0") p.delete(k); else p.set(k, v); setParams(p, { replace: true }); };

  const [items, setItems] = useState<TagListItem[]>([]);
  const [printed, setPrinted] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [sel, setSel] = useState<Record<string, number>>({}); // id -> copies
  const [loading, setLoading] = useState(true);
  const [designOpen, setDesignOpen] = useState(designer);

  async function load() {
    setLoading(true);
    const all: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("inventory_items")
        .select("id, sku, name, metal, purity, gross_weight, net_weight, stone_weight, category_id, status, qr_code, legacy_code, barcode, created_at, description")
        .order("created_at", { ascending: false }).range(from, from + 999);
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const [{ data: c }, { data: pr }] = await Promise.all([
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("inventory_tag_prints").select("item_id").limit(10000),
    ]);
    setItems(all); setCats(c ?? []); setPrinted(new Set((pr ?? []).map((r) => r.item_id))); setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const catName = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c.name])), [cats]);
  const shown = useMemo(() => filterTagItems(items, f, printed), [items, params, printed]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = items.filter((i) => sel[i.id]);
  const copies = Object.fromEntries(chosen.map((i) => [i.sku, sel[i.id]]));
  const totalTags = chosen.reduce((s, i) => s + sel[i.id], 0);
  const allShownSelected = shown.length > 0 && shown.every((i) => sel[i.id]);

  const toggle = (id: string) => setSel((s) => { const n = { ...s }; if (n[id]) delete n[id]; else n[id] = 1; return n; });
  const toggleAll = () => setSel((s) => {
    const n = { ...s };
    if (allShownSelected) shown.forEach((i) => delete n[i.id]); else shown.forEach((i) => { n[i.id] ||= 1; });
    return n;
  });

  async function logPrints() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("inventory_tag_prints").insert(chosen.map((i) => ({ item_id: i.id, copies: sel[i.id], printed_by: u.user!.id })));
    setPrinted((p) => new Set([...p, ...chosen.map((i) => i.id)]));
    setSel({});
  }

  return (
    <AppLayout title="Print Tags" actions={
      <Button size="sm" variant="outline" onClick={() => setDesignOpen(true)}><Palette className="mr-1 h-4 w-4" /> Tag design</Button>
    }>
      <TagPrintDialog items={[]} trigger={null} open={designOpen} onOpenChange={(o) => { setDesignOpen(o); if (!o && designer) setF("design", ""); }} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input autoFocus className="pl-8" placeholder="Item code, old record no. or name" value={f.q} onChange={(e) => setF("q", e.target.value)} />
        </div>
        <QRScanButton onScan={(code) => setF("q", code)} />
        <Select value={f.metal} onValueChange={(v) => setF("metal", v)}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All metals</SelectItem>{["gold", "silver", "diamond", "other"].map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.status} onValueChange={(v) => setF("status", v === "in_stock" ? "" : v)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="in_stock">In stock</SelectItem><SelectItem value="reserved">Reserved</SelectItem><SelectItem value="any_status">Any status</SelectItem></SelectContent>
        </Select>
        <Select value={f.added} onValueChange={(v) => setF("added", v)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Added any time</SelectItem><SelectItem value="today">Added today</SelectItem><SelectItem value="week">Last 7 days</SelectItem><SelectItem value="month">Last 30 days</SelectItem></SelectContent>
        </Select>
        <Button size="sm" variant={f.unprinted ? "default" : "outline"} onClick={() => setF("unprinted", f.unprinted ? "" : "1")}>
          <Tag className="mr-1 h-4 w-4" /> Not yet printed
        </Button>
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {[{ id: "all", name: "All" }, ...cats].map((c) => (
          <button key={c.id} onClick={() => setF("cat", c.id)}
            className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs", f.category === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
        <label className="flex items-center gap-2"><Checkbox checked={allShownSelected} onCheckedChange={toggleAll} /> Select all shown ({shown.length})</label>
        {chosen.length > 0 && <button className="flex items-center gap-1 hover:text-foreground" onClick={() => setSel({})}><X className="h-3.5 w-3.5" /> Clear</button>}
      </div>

      <div className="divide-y rounded-md border bg-card pb-0">
        {loading && <p className="p-4 text-sm text-muted-foreground">Loading items…</p>}
        {!loading && !shown.length && <p className="p-4 text-sm text-muted-foreground">No items match. Try another code or category.</p>}
        {shown.slice(0, 300).map((i) => (
          <div key={i.id} className={cn("flex items-center gap-3 px-3 py-2", sel[i.id] && "bg-accent/50")}>
            <Checkbox checked={!!sel[i.id]} onCheckedChange={() => toggle(i.id)} />
            <button className="min-w-0 flex-1 text-left" onClick={() => toggle(i.id)}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="font-mono">{i.sku}</span>
                {i.legacy_code && <span className="text-xs text-muted-foreground">({i.legacy_code})</span>}
                {!printed.has(i.id) && <Badge variant="secondary" className="text-[10px]">new</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {i.name} · {catName[i.category_id ?? ""] ?? "—"} · {i.purity} · Net {gms(Number(i.net_weight))}
              </div>
            </button>
            {sel[i.id] ? (
              <Input type="number" min={1} max={50} aria-label="Copies" className="h-8 w-16" value={sel[i.id]}
                onChange={(e) => setSel((s) => ({ ...s, [i.id]: clampCopies(Number(e.target.value)) }))} />
            ) : <Link to={`/inventory/${i.id}`} className="text-xs text-muted-foreground hover:underline">View</Link>}
          </div>
        ))}
        {shown.length > 300 && <p className="p-3 text-xs text-muted-foreground">Showing first 300 of {shown.length}. Narrow the search to see more.</p>}
      </div>

      {chosen.length > 0 && (
        <div className="sticky bottom-16 z-20 mt-3 flex items-center justify-between gap-2 rounded-md border bg-card p-3 shadow-lg md:bottom-3">
          <span className="text-sm">{chosen.length} item{chosen.length > 1 ? "s" : ""} · {totalTags} tag{totalTags > 1 ? "s" : ""}</span>
          <TagPrintDialog items={chosen as any} copies={copies} onPrinted={logPrints}
            trigger={<Button><Printer className="mr-1 h-4 w-4" /> Print selected</Button>} />
        </div>
      )}
    </AppLayout>
  );
}
