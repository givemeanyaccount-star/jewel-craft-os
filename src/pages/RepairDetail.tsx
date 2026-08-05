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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Printer, Eye, ReceiptText, History, PencilLine } from "lucide-react";
import { npr, gms, computeNetWeight } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import logoUrl from "@/assets/logo.png";
import { getSignedUrls } from "@/lib/storage";
import { STATUS_LABEL, STATUS_COLOR } from "./Repairs";
import { KarigarSelect, useKarigars } from "@/components/KarigarSelect";

const STATUS_FLOW = ["received", "in_progress", "quality_check", "ready", "delivered"];

export default function RepairDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { karigars, refresh: refreshKarigars } = useKarigars();
  const [repair, setRepair] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [karigarNames, setKarigarNames] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [docType, setDocType] = useState<"estimate" | "final" | null>(null);
  const [workflowItem, setWorkflowItem] = useState<any>(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    if (!id) return;
    const { data: r } = await supabase.from("repairs").select("*, customers(full_name, phone, address)").eq("id", id).single();
    setRepair(r);
    const { data: its } = await supabase.from("repair_items").select("*").eq("repair_id", id).order("created_at");
    setItems(its ?? []);

    const karigarIds = Array.from(new Set((its ?? []).map((i) => i.karigar_id).filter(Boolean)));
    if (karigarIds.length) {
      const { data: ks } = await supabase.from("karigars").select("id, name").in("id", karigarIds);
      setKarigarNames(Object.fromEntries((ks ?? []).map((k) => [k.id, k.name])));
    }
    const allPhotos = (its ?? []).flatMap((i) => i.photos ?? []);
    if (allPhotos.length) setPhotoUrls(await getSignedUrls("customer-docs", allPhotos));
  }

  if (!repair) return <AppLayout><p>Loading...</p></AppLayout>;

  const allDelivered = items.length > 0 && items.every((i) => i.status === "delivered");

  return (
    <AppLayout title={repair.repair_no} actions={
      <>
        <Button size="sm" variant="outline" onClick={() => nav(-1)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        <Button size="sm" variant="outline" onClick={() => setDocType("estimate")}><Eye className="mr-1 h-4 w-4" /> Preview Estimate</Button>
        <Button size="sm" variant={allDelivered ? "default" : "outline"} disabled={!allDelivered} onClick={() => setDocType("final")}>
          <ReceiptText className="mr-1 h-4 w-4" /> Final Receipt {!allDelivered && "(after delivery)"}
        </Button>
      </>
    }>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Repair {repair.repair_no}</CardTitle>
              <div className="text-sm text-muted-foreground">
                {repair.customers?.full_name ?? "Walk-in"} {repair.customers?.phone && `· ${repair.customers.phone}`}
                {repair.expected_delivery && <> · Expected: {new Date(repair.expected_delivery).toLocaleDateString()}</>}
              </div>
              {repair.special_notes && <p className="mt-1 text-sm">{repair.special_notes}</p>}
            </CardHeader>
          </Card>

          {items.map((it) => (
            <RepairItemCard
              key={it.id}
              item={it}
              karigarName={it.karigar_id ? (karigarNames[it.karigar_id] ?? karigars.find((k) => k.id === it.karigar_id)?.name) : it.karigar_name}
              photoUrls={photoUrls}
              karigars={karigars}
              onKarigarCreated={refreshKarigars}
              onAssigned={load}
              onOpenWorkflow={() => setWorkflowItem(it)}
            />
          ))}
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{items.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Estimated total</span><span>{npr(items.reduce((s, i) => s + Number(i.estimated_cost || 0), 0))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivered</span><span>{items.filter((i) => i.status === "delivered").length} / {items.length}</span></div>
            {allDelivered && (
              <div className="flex justify-between border-t pt-2 font-medium"><span>Final total (actual)</span><span>{npr(items.reduce((s, i) => s + Number(i.final_cost ?? i.estimated_cost ?? 0), 0))}</span></div>
            )}
          </CardContent>
        </Card>
      </div>

      <ReceiptDialog docType={docType} onOpenChange={(v: boolean) => !v && setDocType(null)} repair={repair} items={items} />
      <WorkflowDialog item={workflowItem} onOpenChange={(v: boolean) => !v && setWorkflowItem(null)} onSaved={load} />
    </AppLayout>
  );
}

function RepairItemCard({ item, karigarName, photoUrls, onOpenWorkflow }: any) {
  const weightMismatch = item.net_weight_out != null && item.net_weight_out < item.net_weight_in;
  const [showHistory, setShowHistory] = useState(false);
  const [log, setLog] = useState<any[]>([]);

  async function toggleHistory() {
    if (!showHistory && log.length === 0) {
      const { data } = await supabase.from("repair_item_status_log").select("*").eq("repair_item_id", item.id).order("changed_at");
      setLog(data ?? []);
    }
    setShowHistory(!showHistory);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <div className="font-medium">{item.item_description}</div>
          <div className="text-sm text-muted-foreground">{item.issue_description}</div>
        </div>
        <Badge className={STATUS_COLOR[item.status]}>{STATUS_LABEL[item.status]}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><span className="text-xs text-muted-foreground block">Metal / Purity</span><span className="capitalize">{item.metal} {item.purity}</span></div>
          <div><span className="text-xs text-muted-foreground block">Karigar</span>{karigarName || "Unassigned"}</div>
          <div><span className="text-xs text-muted-foreground block">Net wt in</span>{gms(item.net_weight_in)}</div>
          <div><span className="text-xs text-muted-foreground block">Net wt out</span>{item.net_weight_out != null ? gms(item.net_weight_out) : "—"}{weightMismatch && <Badge variant="destructive" className="ml-1">weight loss</Badge>}</div>
        </div>

        {item.photos?.length > 0 && (
          <div className="flex gap-2">
            {item.photos.map((p: string) => photoUrls[p] && (
              <a key={p} href={photoUrls[p]} target="_blank" rel="noreferrer">
                <img src={photoUrls[p]} className="h-16 w-16 rounded object-cover" />
              </a>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {item.status !== "delivered" && (
            <Button size="sm" onClick={onOpenWorkflow}><PencilLine className="mr-1 h-3.5 w-3.5" /> Update Status</Button>
          )}
          <Button size="sm" variant="outline" onClick={toggleHistory}><History className="mr-1 h-3.5 w-3.5" /> {showHistory ? "Hide" : "Show"} History</Button>
        </div>

        {item.status === "delivered" && (
          <p className="text-sm text-muted-foreground">Delivered — {npr(item.final_cost ?? item.estimated_cost)} paid.</p>
        )}

        {showHistory && (
          <div className="space-y-2 rounded border p-3">
            {log.length === 0 ? <p className="text-xs text-muted-foreground">No history yet</p> : log.map((l) => (
              <div key={l.id} className="border-b pb-1.5 text-xs last:border-0 last:pb-0">
                <div className="flex justify-between">
                  <span className="font-medium">{STATUS_LABEL[l.status]}</span>
                  <span className="text-muted-foreground">{new Date(l.changed_at).toLocaleString()}</span>
                </div>
                {l.karigar_name && <div className="text-muted-foreground">Karigar: {l.karigar_name}</div>}
                {l.net_weight_out != null && <div className="text-muted-foreground">Weight out: {gms(l.net_weight_out)}</div>}
                {l.note && <div className="mt-0.5">{l.note}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkflowDialog({ item, onOpenChange, onSaved }: any) {
  const { user } = useAuth();
  const { karigars, refresh: refreshKarigars } = useKarigars();
  const [status, setStatus] = useState("");
  const [karigarId, setKarigarId] = useState<string | null>(null);
  const [karigarName, setKarigarName] = useState("");
  const [grossOut, setGrossOut] = useState<any>("");
  const [stoneOut, setStoneOut] = useState<any>("");
  const [finalCost, setFinalCost] = useState<any>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setStatus(item.status);
    setKarigarId(item.karigar_id);
    setKarigarName(item.karigar_name ?? "");
    setGrossOut(item.gross_weight_out ?? "");
    setStoneOut(item.stone_weight_out ?? "");
    setFinalCost(item.final_cost ?? item.estimated_cost ?? "");
    setNote("");
  }, [item]);

  if (!item) return null;

  const currentIdx = STATUS_FLOW.indexOf(item.status);
  const availableStatuses = STATUS_FLOW.slice(currentIdx); // stay at current, or move forward
  const movingToDeliverable = status === "ready" || status === "delivered";

  async function save() {
    setSaving(true);
    try {
      const netOut = (grossOut !== "" || stoneOut !== "") ? computeNetWeight(Number(grossOut) || 0, Number(stoneOut) || 0) : item.net_weight_out;
      const patch: any = { status, karigar_id: karigarId, karigar_name: karigarId ? null : (karigarName || null) };
      if (grossOut !== "") patch.gross_weight_out = Number(grossOut) || 0;
      if (stoneOut !== "") patch.stone_weight_out = Number(stoneOut) || 0;
      if (grossOut !== "" || stoneOut !== "") patch.net_weight_out = netOut;
      if (movingToDeliverable && finalCost !== "") patch.final_cost = Number(finalCost) || 0;

      const { error } = await supabase.from("repair_items").update(patch).eq("id", item.id);
      if (error) throw error;

      await supabase.from("repair_item_status_log").insert({
        repair_item_id: item.id, status: status as any,
        karigar_id: karigarId, karigar_name: karigarId ? karigars.find((k) => k.id === karigarId)?.name : karigarName || null,
        gross_weight_out: grossOut !== "" ? Number(grossOut) : null,
        stone_weight_out: stoneOut !== "" ? Number(stoneOut) : null,
        net_weight_out: (grossOut !== "" || stoneOut !== "") ? netOut : null,
        note: note || null, changed_by: user?.id,
      });

      toast.success(`${item.item_description} updated`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Update — {item.item_description}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{availableStatuses.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Karigar</Label>
            <KarigarSelect karigars={karigars} value={karigarId} valueName={karigarName} onChange={(id, name) => { setKarigarId(id); setKarigarName(name); }} onKarigarCreated={refreshKarigars} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Gross weight out (g)</Label><Input type="number" step="0.001" value={grossOut} onChange={(e) => setGrossOut(e.target.value)} /></div>
            <div><Label className="text-xs">Stone weight out (g)</Label><Input type="number" step="0.001" value={stoneOut} onChange={(e) => setStoneOut(e.target.value)} /></div>
          </div>
          {movingToDeliverable && <div><Label className="text-xs">Final cost (NPR)</Label><Input type="number" value={finalCost} onChange={(e) => setFinalCost(e.target.value)} /></div>}
          <div><Label>Note for this update</Label><Textarea rows={2} placeholder="What was done at this stage..." value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Update"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({ docType, onOpenChange, repair, items }: any) {
  if (!repair || !docType) return null;
  const isFinal = docType === "final";
  const costOf = (it: any) => (isFinal ? Number(it.final_cost ?? it.estimated_cost ?? 0) : Number(it.estimated_cost ?? 0));
  const total = items.reduce((s: number, i: any) => s + costOf(i), 0);
  const printId = `repair-print-${docType}`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{isFinal ? "Final Receipt (Actual Cost)" : "Estimate — Internal Preview"}</DialogTitle></DialogHeader>

        {!isFinal && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            This is an internal estimate for staff reference — not the official receipt. The official receipt is generated once all items are delivered.
          </div>
        )}

        <div id={printId} className="rounded border bg-white p-6 text-black">
          <div className="mb-4 flex items-center justify-between border-b-2 border-black pb-4">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="JewelMaster" className="h-14 w-14 object-contain" />
              <div>
                <div className="text-xl font-bold tracking-tight">JewelMaster</div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-gray-600">Fine Jewellery · Kathmandu, Nepal</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-gray-500">{isFinal ? "Repair Receipt (Delivered)" : "Repair Estimate (Not Official)"}</div>
              <div className="text-lg font-semibold">{repair.repair_no}</div>
              <div className="text-[10px] text-gray-600">{isFinal ? new Date().toLocaleString() : new Date(repair.received_at).toLocaleString()}</div>
            </div>
          </div>

          <div className="mb-3 text-sm">
            <div><strong>Customer:</strong> {repair.customers?.full_name ?? "Walk-in"} {repair.customers?.phone && `· ${repair.customers.phone}`}</div>
            {repair.expected_delivery && <div><strong>Expected delivery:</strong> {new Date(repair.expected_delivery).toLocaleDateString()}</div>}
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1">Item</th><th>Metal</th><th className="text-right">Net wt</th><th className="text-right">{isFinal ? "Cost" : "Est. Cost"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id} className="border-b">
                  <td className="py-1">{it.item_description}</td>
                  <td className="capitalize">{it.metal} {it.purity}</td>
                  <td className="text-right">{gms(isFinal ? (it.net_weight_out ?? it.net_weight_in) : it.net_weight_in)}</td>
                  <td className="text-right">{npr(costOf(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 text-right text-base font-semibold">Total: {npr(total)}</div>
          {repair.special_notes && <div className="mt-3 text-xs text-gray-600">Notes: {repair.special_notes}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => printArea(printId)}><Printer className="mr-1 h-4 w-4" /> Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function printArea(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.write(`<html><head><title>Repair Receipt</title>
    <style>body{font-family:sans-serif;margin:20px;} table{width:100%;border-collapse:collapse;} @page{size:A4;margin:10mm;}</style>
  </head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 300);
}
