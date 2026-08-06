import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { npr } from "@/lib/format";

const STAGES = [
  { key: "in_progress", label: "In workshop" },
  { key: "quality_check", label: "Quality check" },
  { key: "ready", label: "Ready to pickup" },
] as const;

export function OutstandingCreditCard({ amount, customers }: { amount: number; customers: number }) {
  return (
    <Link to="/credit">
      <Card className="h-full border-0 bg-primary text-primary-foreground shadow-md transition hover:shadow-lg">
        <CardContent className="p-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">Outstanding credit</p>
          <p className="text-2xl font-semibold text-accent">{npr(amount)}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary-foreground/10">
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, customers * 12)}%` }} />
          </div>
          <p className="mt-2 text-xs opacity-70">{customers} customer(s) with dues</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export function RepairStagesCard({ counts }: { counts: Record<string, number> }) {
  return (
    <Link to="/repairs">
      <Card className="h-full transition hover:shadow-md">
        <CardContent className="p-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Repairs by stage</p>
          <div className="space-y-2.5">
            {STAGES.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-semibold">{String(counts[s.key] ?? 0).padStart(2, "0")}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function PendingCreditCard({ amount, customers }: { amount: number; customers: number }) {
  return (
    <Link to="/credit">
      <Card className="h-full transition hover:shadow-md">
        <CardContent className="p-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Pending credit</p>
          <p className="text-xl font-semibold">{customers} account(s)</p>
          <p className="mt-1 text-xs text-muted-foreground">{npr(amount)} awaiting collection, including partial payments.</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export function MissingIdCard({ count }: { count: number }) {
  return (
    <Link to="/purchases?tab=oldgold&missingId=1">
      <Card className="h-full border-destructive/30 bg-destructive/5 transition hover:shadow-md">
        <CardContent className="flex h-full flex-col justify-between p-6">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-destructive">
              <AlertCircle className="h-3.5 w-3.5" /> Old gold alert
            </p>
            <p className="text-sm font-medium text-destructive">
              Missing ID documentation for {count} trade-in{count === 1 ? "" : "s"}.
            </p>
          </div>
          <span className="mt-4 text-xs font-bold uppercase text-destructive underline">Review records</span>
        </CardContent>
      </Card>
    </Link>
  );
}

export function TodaySalesCard({ amount, items }: { amount: number; items: number }) {
  return (
    <Link to="/invoices">
      <Card className="h-full transition hover:shadow-md">
        <CardContent className="p-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Today's sales</p>
          <p className="text-xl font-semibold">{npr(amount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{items} item(s) sold today</p>
        </CardContent>
      </Card>
    </Link>
  );
}
