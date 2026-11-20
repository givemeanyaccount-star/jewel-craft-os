import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/hooks/useAuth";
import { ADJUSTMENT_REASONS, canReview } from "@/lib/weightAdjustment";

const fmt = (v: number) => Number(v).toFixed(3);
const delta = (a: number, b: number) => { const d = Math.round((b - a) * 1000) / 1000; return `${d >= 0 ? "+" : ""}${d.toFixed(3)}`; };
const statusVariant = { pending: "secondary", approved: "default", rejected: "destructive" } as const;

export default function WeightAdjustments() {
  const { hasPermission } = usePermission();
  const auth = useAuth() as any;
  const userId: string | undefined = auth.user?.id;
  const isAdmin: boolean = (auth.roles ?? []).includes("admin");
  const canApprove = hasPermission("inventory_adjust_approve");
  const [status, setStatus] = useState("pending");
  const [review, setReview] = useState<{ row: any; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);

  async function runAi(id: string) {
    setAiBusy(id);
    const { data, error } = await supabase.functions.invoke("weight-adjustment-review", { body: { adjustment_id: id } });
    setAiBusy(null);
    if (error || (data as any)?.error) {
      let msg = (data as any)?.error;
      try { msg = msg ?? (await (error as any)?.context?.json())?.error; } catch { /* ignore */ }
      return toast.error(msg ?? "AI review failed");
    }
    qc.invalidateQueries({ queryKey: ["weight-adjustments"] });
  }
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["weight-adjustments", status], enabled: hasPermission("inventory_view"),
    queryFn: async () => {
      let q = supabase.from("inventory_weight_adjustments").select("*, inventory_items(name, purity, metal)").order("requested_at", { ascending: false }).limit(300);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q; if (error) throw error; return data ?? [];
    },
  });

  async function submitReview() {
    if (!review) return;
    setBusy(true);
    const { error } = await supabase.rpc("review_inventory_weight_adjustment", { _id: review.row.id, _approve: review.approve, _note: note });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(review.approve ? "Approved — stock weights updated" : "Rejected");
    setReview(null); setNote(""); qc.invalidateQueries({ queryKey: ["weight-adjustments"] });
  }

  const reasonLabel = (v: string) => ADJUSTMENT_REASONS.find(r => r.value === v)?.label ?? v;
  return (
    <AppLayout title="Weight Adjustments">
      <p className="mb-3 text-sm text-muted-foreground">Request changes from an item's page using “Adjust weight”. Changes within tolerance apply at once; larger ones are flagged for approval. Every step is in the audit log.</p>
      <Tabs value={status} onValueChange={setStatus} className="mb-3">
        <TabsList><TabsTrigger value="pending">Pending</TabsTrigger><TabsTrigger value="approved">Approved</TabsTrigger><TabsTrigger value="rejected">Rejected</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList>
      </Tabs>
      {list.isLoading ? <p className="text-muted-foreground">Loading…</p> : (list.data ?? []).length === 0 ? <p className="text-muted-foreground">No adjustments here.</p> : (
        <div className="grid gap-3">
          {(list.data ?? []).map((r: any) => (
            <Card key={r.id}><CardContent className="grid gap-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to={`/inventory/${r.inventory_item_id}`} className="font-medium hover:underline">{r.sku} · {r.inventory_items?.name}</Link>
                <div className="flex flex-wrap gap-1">
                  {r.auto_applied ? <Badge variant="secondary">Within tolerance · auto-applied</Badge>
                    : r.within_tolerance === false && <Badge variant="destructive">Flagged · above ±{Number(r.tolerance_grams ?? 0).toFixed(3)} g</Badge>}
                  <Badge variant={statusVariant[r.status as keyof typeof statusVariant]} className="capitalize">{r.status}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                <span>Gross: {fmt(r.old_gross_weight)} → <b>{fmt(r.new_gross_weight)}</b></span>
                <span>Stone: {fmt(r.old_stone_weight)} → <b>{fmt(r.new_stone_weight)}</b></span>
                <span>Net: {fmt(r.old_net_weight)} → <b>{fmt(r.new_net_weight)}</b> ({delta(r.old_net_weight, r.new_net_weight)} g)</span>
                <span>Fine: {fmt(r.old_fine_weight)} → <b>{fmt(r.new_fine_weight)}</b> ({delta(r.old_fine_weight, r.new_fine_weight)} g)</span>
              </div>
              <div><span className="text-muted-foreground">{reasonLabel(r.reason_type)}:</span> {r.reason}</div>
              <div className="text-xs text-muted-foreground">Requested by {r.requested_by_email ?? "—"} on {new Date(r.requested_at).toLocaleString()}
                {r.reviewed_at && <> · {r.status} by {r.reviewed_by_email ?? "—"} on {new Date(r.reviewed_at).toLocaleString()}{r.review_note ? ` — “${r.review_note}”` : ""}</>}</div>
              {r.ai_summary && (
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="mb-1 flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" /> AI risk:
                    <Badge variant={r.ai_risk_level === "high" ? "destructive" : r.ai_risk_level === "medium" ? "secondary" : "outline"} className="capitalize">{r.ai_risk_level}</Badge>
                    <span className="text-xs font-normal text-muted-foreground">suggests {r.ai_summary.recommendation}</span>
                  </div>
                  <p>{r.ai_summary.summary}</p>
                  {r.ai_summary.inconsistencies?.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{r.ai_summary.inconsistencies.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>}
                  <p className="mt-1 text-[10px] text-muted-foreground">AI advice only — the decision is yours.</p>
                </div>
              )}
              {r.status === "pending" && canApprove && (
                <Button size="sm" variant="outline" className="w-fit" disabled={aiBusy === r.id} onClick={() => runAi(r.id)}>
                  <Sparkles className="mr-1 h-4 w-4" /> {aiBusy === r.id ? "Reviewing…" : r.ai_summary ? "Re-run AI review" : "Review with AI"}
                </Button>
              )}
              {canReview({ canApprove, isAdmin, userId, requestedBy: r.requested_by, status: r.status }) && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setReview({ row: r, approve: true })}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setReview({ row: r, approve: false })}>Reject</Button>
                </div>
              )}
              {r.status === "pending" && canApprove && !isAdmin && r.requested_by === userId && <p className="text-xs text-muted-foreground">Another approver must review your own request.</p>}
            </CardContent></Card>
          ))}
        </div>
      )}
      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{review?.approve ? "Approve" : "Reject"} adjustment · {review?.row.sku}</DialogTitle></DialogHeader>
          <Textarea value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder={review?.approve ? (review.row.within_tolerance ? "Note (optional)" : "Approval note (required for flagged changes)") : "Why is this rejected? (required)"} />
          <DialogFooter><Button disabled={busy || ((!review?.approve || !review?.row.within_tolerance) && note.trim().length < 3)} onClick={submitReview}>{busy ? "Saving…" : "Confirm"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
