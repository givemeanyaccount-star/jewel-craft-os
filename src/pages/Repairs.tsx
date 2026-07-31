import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Wrench, Trash2, Hammer, X } from "lucide-react";
import { npr, gms, computeNetWeight, nextNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { uploadImage } from "@/lib/storage";
import { toast } from "sonner";
import { ImageCaptureButton } from "@/components/ImageCapture";
import { KarigarSelect, useKarigars } from "@/components/KarigarSelect";

const METALS = ["gold", "silver", "platinum"];
const PURITIES = ["24K", "22K", "20K", "18K", "999", "925"];
const STATUS_FLOW = ["received", "in_progress", "quality_check", "ready", "delivered"];
export const STATUS_LABEL: Record<string, string> = {
  received: "Received", in_progress: "In Progress", quality_check: "Quality Check", ready: "Ready", delivered: "Delivered",
};
export const STATUS_COLOR: Record<string, string> = {
  received: "bg-slate-200 text-slate-800", in_progress: "bg-amber-200 text-amber-900",
  quality_check: "bg-blue-200 text-blue-900", ready: "bg-emerald-200 text-emerald-900", delivered: "bg-gray-800 text-white",
};

function overallStatus(items: any[]) {
  if (!items.length) return "received";
  const idx = items.map((it) => STATUS_FLOW.indexOf(it.status));
  return STATUS_FLOW[Math.min(...idx)];
}

function blankItem() {
  return {
    key: crypto.randomUUID(), item_description: "", issue_description: "",
    metal: "gold", purity: "22K", gross_weight_in: 0, stone_weight_in: 0,
    karigar_id: null as string | null, karigar_name: "", estimated_cost: 0, photoFiles: [] as File[],
  };
}

export default function Repairs() {
  const [list, setList] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from("repairs")
      .select("*, customers(full_name, phone), repair_items(id, item_description, status, estimated_cost)")
      .order("received_at", { ascending: false })
      .limit(300);
    setList(data ?? []);
  }

  const filtered = statusFilter === "all" ? list : list.filter((r) => overallStatus(r.repair_items ?? []) === statusFilter);

  return (
    <AppLayout
      title="Repairs & Service"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild><Link to="/repairs/karigars"><Hammer className="mr-1 h-4 w-4" /> Karigars</Link></Button>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New Repair Receipt</Button>
        </div>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <Label className="text-sm text-muted-foreground">Filter:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.keys(STATUS_LABEL).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repair No</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead className="text-right">Est. Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No repairs yet</TableCell></TableRow>
              ) : filtered.map((r) => {
                const items = r.repair_items ?? [];
                const status = overallStatus(items);
                const total = items.reduce((s: number, it: any) => s + Number(it.estimated_cost || 0), 0);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => nav(`/repairs/${r.id}`)}>
                    <TableCell className="font-medium">{r.repair_no}</TableCell>
                    <TableCell>
                      <div>{r.customers?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.customers?.phone}</div>
                    </TableCell>
                    <TableCell>
                      {items.length} item{items.length !== 1 ? "s" : ""}
                      <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                        {items.map((it: any) => it.item_description).join(", ")}
                      </div>
                    </TableCell>
                    <TableCell><Badge className={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Badge></TableCell>
                    <TableCell>{r.expected_delivery ? new Date(r.expected_delivery).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">{npr(total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NewRepairDialog open={open} onOpenChange={setOpen} onSaved={(id: string) => { setOpen(false); load(); nav(`/repairs/${id}`); }} />
    </AppLayout>
  );
}

function NewRepairDialog({ open, onOpenChange, onSaved }: any) {
  const { user } = useAuth();
  const { karigars, refresh: refreshKarigars } = useKarigars();
  const [customers, setCustomers] = useState<any[]>([]);
  const [header, setHeader] = useState<any>({});
  const [items, setItems] = useState<any[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("customers").select("id, full_name, phone").order("full_name").then(({ data }) => setCustomers(data ?? []));
    setHeader({ customer_id: "", expected_delivery: "", special_notes: "" });
    setItems([blankItem()]);
  }, [open]);

  function updateItem(key: string, patch: any) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  async function save() {
    if (items.some((it) => !it.item_description?.trim())) return toast.error("Every item needs a description");
    if (items.some((it) => !it.issue_description?.trim())) return toast.error("Every item needs an issue description");
    setSaving(true);
    try {
      const num = Math.floor(Date.now() / 1000) % 100000;
      const repairNo = nextNumber("REP", num, 5);
      const { data: repair, error } = await supabase.from("repairs").insert({
        repair_no: repairNo,
        customer_id: header.customer_id || null,
        expected_delivery: header.expected_delivery || null,
        special_notes: header.special_notes || null,
        created_by: user?.id,
      }).select("id").single();
      if (error) throw error;

      for (const it of items) {
        const photoPaths: string[] = [];
        for (const f of it.photoFiles as File[]) {
          photoPaths.push(await uploadImage("customer-docs", f, "repairs-intake/"));
        }
        const netIn = computeNetWeight(Number(it.gross_weight_in) || 0, Number(it.stone_weight_in) || 0);
        const { error: itErr } = await supabase.from("repair_items").insert({
          repair_id: repair.id,
          item_description: it.item_description.trim(),
          issue_description: it.issue_description.trim(),
          metal: it.metal, purity: it.purity,
          gross_weight_in: Number(it.gross_weight_in) || 0,
          stone_weight_in: Number(it.stone_weight_in) || 0,
          net_weight_in: netIn,
          karigar_id: it.karigar_id, karigar_name: it.karigar_name || null,
          estimated_cost: Number(it.estimated_cost) || 0,
          photos: photoPaths,
        });
        if (itErr) throw itErr;
      }

      toast.success(`Repair ${repairNo} created with ${items.length} item(s)`);
      onSaved(repair.id);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> New Repair Receipt</DialogTitle></DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Customer</Label>
            <Select value={header.customer_id} onValueChange={(v) => setHeader({ ...header, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone && `· ${c.phone}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Expected delivery</Label><Input type="date" value={header.expected_delivery ?? ""} onChange={(e) => setHeader({ ...header, expected_delivery: e.target.value })} /></div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Items ({items.length})</Label>
            <Button size="sm" variant="outline" onClick={() => setItems([...items, blankItem()])}><Plus className="mr-1 h-3 w-3" /> Add Another Item</Button>
          </div>

          {items.map((it, idx) => {
            const netIn = computeNetWeight(Number(it.gross_weight_in) || 0, Number(it.stone_weight_in) || 0);
            return (
              <div key={it.key} className="rounded border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Item {idx + 1}</span>
                  {items.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeItem(it.key)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="md:col-span-2"><Label className="text-xs">Item description *</Label><Input value={it.item_description} onChange={(e) => updateItem(it.key, { item_description: e.target.value })} placeholder="e.g. Gold bangle" /></div>
                  <div className="md:col-span-2"><Label className="text-xs">Issue *</Label><Textarea rows={2} value={it.issue_description} onChange={(e) => updateItem(it.key, { issue_description: e.target.value })} placeholder="e.g. Clasp broken" /></div>
                  <div>
                    <Label className="text-xs">Metal</Label>
                    <Select value={it.metal} onValueChange={(v) => updateItem(it.key, { metal: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{METALS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Purity</Label>
                    <Select value={it.purity} onValueChange={(v) => updateItem(it.key, { purity: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PURITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Gross wt in (g)</Label><Input type="number" step="0.001" value={it.gross_weight_in} onChange={(e) => updateItem(it.key, { gross_weight_in: e.target.value })} /></div>
                  <div><Label className="text-xs">Stone wt in (g)</Label><Input type="number" step="0.001" value={it.stone_weight_in} onChange={(e) => updateItem(it.key, { stone_weight_in: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label className="text-xs">Net weight in (auto)</Label><Input readOnly value={gms(netIn)} className="bg-muted" /></div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Assign karigar</Label>
                    <KarigarSelect
                      karigars={karigars}
                      value={it.karigar_id}
                      valueName={it.karigar_name}
                      onChange={(id, name) => updateItem(it.key, { karigar_id: id, karigar_name: name })}
                      onKarigarCreated={refreshKarigars}
                    />
                  </div>
                  <div><Label className="text-xs">Estimated cost (NPR)</Label><Input type="number" value={it.estimated_cost} onChange={(e) => updateItem(it.key, { estimated_cost: e.target.value })} /></div>
                  <div>
                    <Label className="text-xs mb-1 block">Intake photos</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {(it.photoFiles as File[]).map((f, i) => (
                        <div key={i} className="relative">
                          <img src={URL.createObjectURL(f)} className="h-12 w-12 rounded object-cover" />
                          <button type="button" className="absolute -right-1 -top-1 rounded-full bg-destructive text-white" onClick={() => updateItem(it.key, { photoFiles: it.photoFiles.filter((_: any, fi: number) => fi !== i) })}>
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <ImageCaptureButton label="Add" onCapture={(f) => updateItem(it.key, { photoFiles: [...it.photoFiles, f] })} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div><Label>Special notes (whole receipt)</Label><Textarea rows={2} value={header.special_notes ?? ""} onChange={(e) => setHeader({ ...header, special_notes: e.target.value })} /></div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : `Create Repair Receipt (${items.length} item${items.length !== 1 ? "s" : ""})`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
