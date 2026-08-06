import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { npr } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ActivityEntry {
  id: string;
  kind: "sale" | "purchase" | "oldgold";
  ref: string;
  party: string;
  at: string;
  amount: number;
  to: string;
}

const BADGE: Record<ActivityEntry["kind"], { label: string; cls: string }> = {
  sale: { label: "Sale", cls: "bg-primary/10 text-primary" },
  purchase: { label: "Purchase", cls: "bg-accent/20 text-accent-foreground" },
  oldgold: { label: "Old gold", cls: "bg-muted text-muted-foreground" },
};

type Filter = "all" | ActivityEntry["kind"];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sale", label: "Sales" },
  { key: "purchase", label: "Purchases" },
  { key: "oldgold", label: "Old gold" },
];

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.kind === filter)),
    [entries, filter]
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 py-3">
        <CardTitle className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Recent invoices &amp; purchases
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/40 p-0.5">
            {FILTERS.map((f) => {
              const count = f.key === "all" ? entries.length : entries.filter((e) => e.kind === f.key).length;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    filter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/invoices">View all</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-0">
        {shown.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="divide-y">
            {shown.map((e) => {
              const b = BADGE[e.kind];
              return (
                <Link
                  key={`${e.kind}-${e.id}`}
                  to={e.to}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${b.cls}`}>{b.label}</span>
                      <span className="truncate text-sm font-medium">{e.ref}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {e.party} · {new Date(e.at).toLocaleString()}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{npr(e.amount)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
