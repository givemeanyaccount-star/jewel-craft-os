import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { npr } from "@/lib/format";

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

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Recent invoices &amp; purchases
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link to="/invoices">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {entries.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="divide-y">
            {entries.map((e) => {
              const b = BADGE[e.kind];
              return (
                <Link
                  key={`${e.kind}-${e.id}`}
                  to={e.to}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
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
