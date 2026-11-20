import { cn } from "@/lib/utils";

export function StatStrip({ items, className }: { items: { label: string; value: string; sub?: string }[]; className?: string }) {
  return (
    <div className={cn("mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4", className)}>
      {items.map((s) => (
        <div key={s.label} className="bg-card px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</div>
          <div className="truncate text-base font-semibold tabular-nums">{s.value}</div>
          {s.sub && <div className="truncate text-[11px] text-muted-foreground">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}
