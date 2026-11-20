import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface AttentionItem { label: string; count: number; to: string; tone?: "warn" | "info" }

export function AttentionList({ items }: { items: AttentionItem[] }) {
  const shown = items.filter((i) => i.count > 0);
  return (
    <section aria-label="Needs attention" className="rounded-lg border bg-card">
      <h3 className="border-b px-4 py-2 text-sm font-semibold">Needs attention</h3>
      {shown.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">All clear — nothing waiting.</p>
      ) : (
        <ul className="divide-y">
          {shown.map((i) => (
            <li key={i.label}>
              <Link to={i.to} className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50">
                <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${i.tone === "warn" ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}>{i.count}</span>
                <span className="flex-1">{i.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TodayStrip({ cells }: { cells: { label: string; value: string; to: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {cells.map((c) => (
        <Link key={c.label} to={c.to} className="rounded-lg border bg-card px-3 py-2 hover:bg-muted/50">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
          <div className="truncate text-lg font-semibold tabular-nums">{c.value}</div>
        </Link>
      ))}
    </div>
  );
}
