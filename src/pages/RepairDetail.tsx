import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Printer } from "lucide-react";
import { npr, gms, computeNetWeight } from "@/lib/format";
import { toast } from "sonner";
import logoUrl from "@/assets/logo.png";

const STATUS_FLOW = ["received", "in_progress", "quality_check", "ready", "delivered"];
const STATUS_LABEL: Record<string, string> = {
  received: "Received", in_progress: "In Progress", quality_check: "Quality Check", ready: "Ready", delivered: "Delivered",
};
const STATUS_COLOR: Record<string, string> = {
  received: "bg-slate-200 text-slate-800", in_progress: "bg-amber-200 text-amber-900",
  quality_check: "bg-blue-200 text-blue-900", ready: "bg-emerald-200 text-emerald-900", delivered: "bg-gray-800 text-white",
};

export default function RepairDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [repair, setRepair] = useState<any>(null);
  const [karigarName, setKarigarName] = useState<string>("");
  const [deliveryForm, setDeliveryForm] = useState({ gross_weight_out: "", stone_weight_out: "", final_cost: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    if (!id) return;
    const { data } = await supabase.from("repairs").select("*, customers(full_name, phone, address)").eq("id", id).single();
    setRepair(data);
    if (data?.assigned_karigar) {
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", data.assigned_karigar).single();
      setKarigarName(prof?.full_name ?? "");
    }
    if (data) {
      setDeliveryForm({
        gross_weight_out: data.gross_weight_out ?? "",
        stone_weight_out: data.stone_weight_out ?? "",
        final_cost: data.final_cost ?? data.estimated_cost ?? "",
      });
    }
  }

  async function advanceStatus(next: string) {
    if (!repair) return;
    setSaving(true);
    try {
      const patch: any = { status: next };
      if (next === "ready" || next === "delivered") {
        const grossOut = Number(deliveryForm.gross_weight_out) || 0;
        const stoneOut = Number(deliveryForm.stone_weight_out) || 0;
        patch.gross_weight_out = grossOut;
        patch.stone_weight_out = stoneOut;
        patch.net_weight_out = computeNetWeight(grossOut, stoneOut);
        patch.final_cost = Number(deliveryForm.final_cost) || repair.estimated_cost;
      }
      if (next === "delivered") patch.delivered_at = new Date().toISOString();
      const { error } = await supabase.from("repairs").update(patch).eq("id", repair.id);
      if (error) throw error;
      toast.success(`Status updated to ${STATUS_LABEL[next]}`);
      load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  if (!repair) return <AppLayout><p>Loading...</p></AppLayout>;

  const currentIdx = STATUS_FLOW.indexOf(repair.status);
  const nextStatus = STATUS_FLOW[currentIdx + 1];
  const weightMismatch = repair.net_weight_out != null && repair.net_weight_out < repair.net_weight_in;

  return (
    <AppLayout title={repair.repair_no} actions={
      <>
        <Button size="sm" variant="outline" onClick={() => nav(-1)} className="no-print"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        <Button size="sm" variant="outline" onClick={() => window.print()} className="no-print"><Printer className="mr-1 h-4 w-4" /> Print Receipt</Button>
      </>
    }>
      <div className="print-only mb-6 flex items-center justify-between border-b-2 border-black pb-4">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="JewelMaster" className="h-14 w-14 object-contain" />
          <div>
            <div className="text-xl font-bold tracking-tight">JewelMaster</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-gray-600">Fine Jewellery · Kathmandu, Nepal</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-gray-500">Repair Receipt</div>
          <div className="text-lg font-semibold">{repair.repair_no}</div>
          <div className="text-[10px] text-gray-600">{new Date(repair.received_at).toLocaleString()}</div>
        </div>
      </div>

      <div className="print-shell grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Repair {repair.repair_no}</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                {repair.customers?.full_name ?? "Walk-in"} {repair.customers?.phone && `· ${repair.customers.phone}`}
              </div>
            </div>
            <Badge className={STATUS_COLOR[repair.status]}>{STATUS_LABEL[repair.status]}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label className="text-xs text-muted-foreground">Item</Label><p>{repair.item_description}</p></div>
              <div><Label className="text-xs text-muted-foreground">Issue</Label><p>{repair.issue_description}</p></div>
              <div><Label className="text-xs text-muted-foreground">Metal / Purity</Label><p className="capitalize">{repair.metal} {repair.purity}</p></div>
              <div><Label className="text-xs text-muted-foreground">Assigned Karigar</Label><p>{karigarName || "Unassigned"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Expected Delivery</Label><p>{repair.expected_delivery ? new Date(repair.expected_delivery).toLocaleDateString() : "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Estimated Cost</Label><p>{npr(repair.estimated_cost)}</p></div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-medium">Weight Record</div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><span className="text-xs text-muted-foreground block">Gross in</span>{gms(repair.gross_weight_in)}</div>
                <div><span className="text-xs text-muted-foreground block">Stone in</span>{gms(repair.stone_weight_in)}</div>
                <div><span className="text-xs text-muted-foreground block">Net in</span>{gms(repair.net_weight_in)}</div>
                <div />
                <div><span className="text-xs text-muted-foreground block">Gross out</span>{repair.gross_weight_out != null ? gms(repair.gross_weight_out) : "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Stone out</span>{repair.stone_weight_out != null ? gms(repair.stone_weight_out) : "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Net out</span>{repair.net_weight_out != null ? gms(repair.net_weight_out) : "—"}</div>
                <div>
                  {weightMismatch && <Badge variant="destructive" className="no-print">Weight loss vs intake</Badge>}
                </div>
              </div>
            </div>

            {repair.special_notes && (
              <div><Label className="text-xs text-muted-foreground">Special Notes</Label><p className="text-sm">{repair.special_notes}</p></div>
            )}

            {repair.status === "delivered" && (
              <div className="rounded bg-secondary p-3">
                <div className="text-xs text-muted-foreground">Final Cost Paid</div>
                <div className="text-xl font-semibold">{npr(repair.final_cost ?? repair.estimated_cost)}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="no-print">
          <CardHeader><CardTitle className="text-base">Update Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {nextStatus === "ready" || nextStatus === "delivered" || repair.status === "ready" || repair.status === "quality_check" ? (
              <>
                <div><Label>Gross wt out (g)</Label><Input type="number" step="0.001" value={deliveryForm.gross_weight_out} onChange={(e) => setDeliveryForm({ ...deliveryForm, gross_weight_out: e.target.value })} /></div>
                <div><Label>Stone wt out (g)</Label><Input type="number" step="0.001" value={deliveryForm.stone_weight_out} onChange={(e) => setDeliveryForm({ ...deliveryForm, stone_weight_out: e.target.value })} /></div>
                <div><Label>Final cost (NPR)</Label><Input type="number" value={deliveryForm.final_cost} onChange={(e) => setDeliveryForm({ ...deliveryForm, final_cost: e.target.value })} /></div>
              </>
            ) : null}

            {nextStatus ? (
              <Button className="w-full" disabled={saving} onClick={() => advanceStatus(nextStatus)}>
                Mark as {STATUS_LABEL[nextStatus]}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Repair complete — delivered.</p>
            )}

            <div className="pt-2 text-xs text-muted-foreground">
              Flow: {STATUS_FLOW.map((s) => STATUS_LABEL[s]).join(" → ")}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
