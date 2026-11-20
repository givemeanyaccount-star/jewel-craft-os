import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const SHOWN = [["gold", "24K", "24K"], ["gold", "22K", "22K"], ["silver", "999", "Silver"]] as const;
const TOLA = 11.6638;

export function RateTicker({ className }: { className?: string }) {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [stale, setStale] = useState(false);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("metal_rates").select("metal, purity, rate_per_gram, effective_date")
        .order("effective_date", { ascending: false }).limit(30);
      const out: Record<string, number> = {};
      let latest = "";
      for (const r of data ?? []) {
        const k = `${r.metal}:${r.purity}`;
        if (out[k] == null) out[k] = Number(r.rate_per_gram);
        if (!latest) latest = r.effective_date;
      }
      setRates(out);
      setStale(latest !== new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" }));
    })();
  }, []);
  return (
    <Link to="/rates" title={stale ? "Today's rate is not set yet" : "Today's rates per tola"}
      className={cn("items-center gap-3 rounded-md border bg-muted/40 px-2.5 py-1 text-xs hover:bg-muted", className)}>
      {stale && <span className="h-2 w-2 rounded-full bg-destructive" aria-label="Rate not updated today" />}
      {SHOWN.map(([m, p, label]) => {
        const v = rates[`${m}:${p}`];
        return (
          <span key={label} className="whitespace-nowrap">
            <span className="text-muted-foreground">{label}</span>{" "}
            <strong className="tabular-nums">{v ? Math.round(v * TOLA).toLocaleString("en-IN") : "—"}</strong>
          </span>
        );
      })}
      <span className="text-muted-foreground">/tola</span>
    </Link>
  );
}
