import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { nprShort, npr } from "@/lib/format";
import { ChartTooltipRow, ChartTooltipShell, formatFullDate } from "./ChartTooltip";

export interface VolumePoint {
  day: string;
  date?: string;
  sales: number;
  purchases: number;
}

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">
          Daily Volume <span className="font-normal text-muted-foreground">(7 days)</span>
        </CardTitle>
        <div className="flex gap-3 text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Sales
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Purchases
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-2">
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={10} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tickFormatter={(v) => nprShort(v).replace("रू ", "")}
                tickLine={false}
                axisLine={false}
                fontSize={10}
                width={48}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                wrapperStyle={{ outline: "none", zIndex: 30 }}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as VolumePoint;
                  const total = (p.sales || 0) + (p.purchases || 0);
                  return (
                    <ChartTooltipShell title={p.date ? formatFullDate(p.date) : p.day}>
                      <ChartTooltipRow color="hsl(var(--primary))" label="Sales" value={npr(p.sales || 0)} />
                      <ChartTooltipRow color="hsl(var(--accent))" label="Purchases" value={npr(p.purchases || 0)} />
                      <div className="mt-1 border-t border-border pt-1">
                        <ChartTooltipRow label="Total" value={npr(total)} />
                      </div>
                    </ChartTooltipShell>
                  );
                }}
              />
              <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} maxBarSize={14} />
              <Bar dataKey="purchases" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
