import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { UnitNumberField } from "@/components/ui/unit-number-field";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { purityFactor } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

const GOLD_PURITIES = ["24K", "22K", "18K", "14K"];

export function todayIsoDate() { return new Date().toISOString().slice(0, 10); }

/** True when no metal rate has been recorded for today. */
export async function needsDailyRates(): Promise<boolean> {
  const { count } = await supabase.from("metal_rates")
    .select("id", { count: "exact", head: true })
    .eq("effective_date", todayIsoDate());
  return (count ?? 0) === 0;
}

export function DailyRateDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [gold, setGold] = useState<Record<string, string>>({});
  const [silverFine, setSilverFine] = useState("");
  const [silver925, setSilver925] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGold({}); setSilverFine(""); setSilver925("");
  }, [open]);

  function setBase(v: string) {
    const base = Number(v) || 0;
    const next: Record<string, string> = { "24K": v };
    for (const p of GOLD_PURITIES.slice(1)) {
      next[p] = base ? (Math.round(base * purityFactor(p) * 100) / 100).toString() : "";
    }
    setGold(next);
  }

  function setFineSilver(v: string) {
    setSilverFine(v);
    const base = Number(v) || 0;
    setSilver925(base ? (Math.round(base * 0.925 * 100) / 100).toString() : "");
  }

  async function pullFenegosida() {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-gold-rate");
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const { data: rows } = await supabase.from("metal_rates")
        .select("metal, purity, rate_per_gram").eq("effective_date", todayIsoDate());
      const g24 = rows?.find((r) => r.metal === "gold" && r.purity === "24K");
      if (g24) setBase(String(g24.rate_per_gram));
      const s999 = rows?.find((r) => r.metal === "silver" && r.purity === "999");
      if (s999) setFineSilver(String(s999.rate_per_gram));
      toast.success("Pulled today's rates from FENEGOSIDA");
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`);
    } finally { setFetching(false); }
  }

  async function save() {
    const rows: any[] = [];
    const date = todayIsoDate();
    for (const p of GOLD_PURITIES) {
      const v = Number(gold[p]);
      if (v > 0) rows.push({ metal: "gold", purity: p, rate_per_gram: v, effective_date: date, source: "daily-setup", created_by: user?.id });
    }
    if (Number(silverFine) > 0) rows.push({ metal: "silver", purity: "999", rate_per_gram: Number(silverFine), effective_date: date, source: "daily-setup", created_by: user?.id });
    if (Number(silver925) > 0) rows.push({ metal: "silver", purity: "925", rate_per_gram: Number(silver925), effective_date: date, source: "daily-setup", created_by: user?.id });
    if (!rows.length) return toast.error("Enter at least the 24K gold rate");
    setSaving(true);
    const { error } = await supabase.from("metal_rates").upsert(rows, { onConflict: "metal,purity,effective_date" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Saved ${rows.length} rates for today`);
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set today's metal rates</DialogTitle>
          <DialogDescription>
            Enter the fine gold (24K) rate per gram — 22K (916), 18K (750) and 14K (585) are derived automatically and stay editable.
          </DialogDescription>
        </DialogHeader>

        <Button variant="outline" size="sm" className="w-fit" onClick={pullFenegosida} disabled={fetching}>
          <Download className="mr-1 h-4 w-4" /> {fetching ? "Fetching..." : "Pull from FENEGOSIDA"}
        </Button>

        <div className="space-y-3">
          <div>
            <Label>Gold 24K (fine) rate *</Label>
            <UnitNumberField mode="rate" value={Number(gold["24K"] ?? 0) || 0} onChange={(v) => setBase(v ? String(v) : "")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {GOLD_PURITIES.slice(1).map((p) => (
              <div key={p}>
                <Label>Gold {p}</Label>
                <UnitNumberField mode="rate" value={Number(gold[p] ?? 0) || 0}
                  onChange={(v) => setGold({ ...gold, [p]: v ? String(v) : "" })} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            <div>
              <Label>Fine silver (999)</Label>
              <UnitNumberField mode="rate" value={Number(silverFine) || 0} onChange={(v) => setFineSilver(v ? String(v) : "")} />
            </div>
            <div>
              <Label>Silver 925</Label>
              <UnitNumberField mode="rate" value={Number(silver925) || 0} onChange={(v) => setSilver925(v ? String(v) : "")} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Later</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save today's rates"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
