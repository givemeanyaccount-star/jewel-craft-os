import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { npr, perTenGrams, perTola } from "@/lib/format";
import { ChartTooltipRow, ChartTooltipShell, formatFullDate } from "./ChartTooltip";
import type { RatePoint } from "./RateCard";

const GOLD = "hsl(var(--primary))";
const SILVER = "hsl(var(--accent))";

type Row = { date: string; day: string; gold: number | null; silver: number | null };

function build(gold: RatePoint[] = [], silver: RatePoint[] = []): Row[] {
  const g = new Map(gold.map((p) => [p.date, p.rate]));
  const s = new Map(silver.map((p) => [p.date, p.rate]));
  const rows: Row[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let lastG: number | null = null;
  let lastS: number | null = null;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    lastG = g.get(key) ?? lastG;
    lastS = s.get(key) ?? lastS;
    rows.push({
      date: key,
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      gold: lastG,
      silver: lastS,
    });
  }
  return rows;
}

export function RateTrendChart({
  goldHistory,
  silverHistory,
}: {
  goldHistory?: RatePoint[];
  silverHistory?: RatePoint[];
}) {
  const data = build(goldHistory, silverHistory);
  const hasData = data.some((r) => r.gold !== null || r.silver !== null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Rate trend · last 7 days
        </CardTitle>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: GOLD }} /> Gold 24K
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: SILVER }} /> Silver
          </span>
        </div>
      </CardHeader>
      <CardContent className="h-[240px] pt-2">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                yAxisId="gold"
                tickLine={false}
                axisLine={false}
                width={54}
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => Math.round(perTola(v) / 1000) + "k"}
              />
              <YAxis
                yAxisId="silver"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={48}
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => Math.round(perTola(v)).toString()}
              />
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                wrapperStyle={{ outline: "none" }}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as Row;
                  return (
                    <ChartTooltipShell title={formatFullDate(row.date)}>
                      {row.gold != null && (
                        <>
                          <ChartTooltipRow color={GOLD} label="Gold 24K" value={`${npr(perTola(row.gold))} / tola`} />
                          <ChartTooltipRow label="Per 10 g" value={npr(perTenGrams(row.gold))} muted />
                        </>
                      )}
                      {row.silver != null && (
                        <>
                          <ChartTooltipRow color={SILVER} label="Silver" value={`${npr(perTola(row.silver))} / tola`} />
                          <ChartTooltipRow label="Per 10 g" value={npr(perTenGrams(row.silver))} muted />
                        </>
                      )}
                    </ChartTooltipShell>
                  );
                }}
              />
              <Line
                yAxisId="gold"
                type="monotone"
                dataKey="gold"
                stroke={GOLD}
                strokeWidth={2}
                dot={{ r: 2, fill: GOLD }}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="silver"
                type="monotone"
                dataKey="silver"
                stroke={SILVER}
                strokeWidth={2}
                dot={{ r: 2, fill: SILVER }}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No rate history yet — set daily rates to build the trend.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
