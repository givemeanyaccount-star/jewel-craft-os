import { useState } from "react";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ADJUSTMENT_REASONS, adjustmentPreview } from "@/lib/weightAdjustment";
import { gmsWithTola } from "@/lib/format";

export function WeightAdjustmentDialog({ item, onDone }: { item: any; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [gross, setGross] = useState(String(item.gross_weight));
  const [stone, setStone] = useState(String(item.stone_weight));
  const [reasonType, setReasonType] = useState("reweigh");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const p = adjustmentPreview(item, Number(gross), Number(stone), item.purity);
  const ok = p.valid && p.changed && reason.trim().length >= 3;

  async function submit() {
    setBusy(true);
    const { error } = await supabase.rpc("request_inventory_weight_adjustment", {
      _item_id: item.id, _gross: Number(gross), _stone: Number(stone), _fine: p.fine, _reason_type: reasonType, _reason: reason,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Adjustment sent for approval");
    setOpen(false); setReason(""); onDone?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="w-full"><Scale className="mr-1 h-4 w-4" /> Adjust weight</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Request weight adjustment · {item.sku}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Gross weight (g)</Label><Input type="number" step="0.001" value={gross} onChange={e => setGross(e.target.value)} /></div>
            <div><Label>Stone weight (g)</Label><Input type="number" step="0.001" value={stone} onChange={e => setStone(e.target.value)} /></div>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Net now → new</span>
            <span>{gmsWithTola(item.net_weight)} → <b>{p.net.toFixed(3)} g</b> ({p.netDelta >= 0 ? "+" : ""}{p.netDelta.toFixed(3)})</span>
            <span className="text-muted-foreground">Fine now → new</span>
            <span>{Number(item.fine_weight).toFixed(3)} g → <b>{p.fine.toFixed(3)} g</b> ({p.fineDelta >= 0 ? "+" : ""}{p.fineDelta.toFixed(3)})</span>
          </div>
          {!p.valid && <p className="text-sm text-destructive">Gross must be above 0 and stone weight cannot exceed gross.</p>}
          <div><Label>Reason</Label>
            <Select value={reasonType} onValueChange={setReasonType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ADJUSTMENT_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Details (required)</Label><Textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="e.g. Re-weighed on counter scale after polishing" /></div>
          <p className="text-xs text-muted-foreground">Stock weights change only after a manager approves.</p>
        </div>
        <DialogFooter><Button disabled={!ok || busy} onClick={submit}>{busy ? "Sending…" : "Send for approval"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
