import { Card, CardContent } from "@/components/ui/card";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { npr, perTenGrams, perTola } from "@/lib/format";

export interface RatePoint {
  date: string;
  rate: number;
}

export function RateCard({
  label,
  ratePerGram,
  history,
}: {
  label: string;
  ratePerGram: number | null;
  history?: RatePoint[];
}) {
  const points = history ?? [];
  const rising = points.length > 1 ? points[points.length - 1].rate >= points[0].rate : true;
  const stroke = rising ? "hsl(var(--primary))" : "hsl(var(--destructive))";

  return (
    <Card className="transition hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">{label}</span>
          <div className="mt-1 truncate text-2xl font-semibold tracking-tight">
            {ratePerGram ? npr(perTola(ratePerGram)) : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">/ tola</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {ratePerGram ? npr(perTenGrams(ratePerGram)) : "—"}
            <span className="ml-1 text-xs opacity-70">/ 10 g</span>
          </div>
        </div>
        {points.length > 1 && (
          <div className="h-10 w-20 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <Line type="monotone" dataKey="rate" stroke={stroke} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
