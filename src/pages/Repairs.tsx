import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Plus, Wrench } from "lucide-react";
import { npr, gms, computeNetWeight, nextNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { uploadImage } from "@/lib/storage";
import { toast } from "sonner";

const METALS = ["gold", "silver", "platinum"];
const PURITIES = ["24K", "22K", "20K", "18K", "999", "925"];

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  in_progress: "In Progress",
  quality_check: "Quality Check",
  ready: "Ready",
  delivered: "Delivered",
};

const STATUS_COLOR: Record<string, string> = {
  received: "bg-slate-200 text-slate-800",
  in_progress: "bg-amber-200 text-amber-900",
  quality_check: "bg-blue-200 text-blue-900",
  ready: "bg-emerald-200 text-emerald-900",
  delivered: "bg-gray-800 text-white",
};

export default function Repairs() {
  const [list, setList] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from("repairs")
      .select("*, customers(full_name, phone)")
      .order("received_at", { ascending: false })
      .limit(300);
    setList(data ?? []);
  }

  const filtered = statusFilter === "all" ? list : list.filter((r) => r.status === statusFilter);

  return (
    <AppLayout
      title="Repairs & Service"
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Repair
        </Button>
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
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No repairs yet</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => nav(`/repairs/${r.id}`)}>
                  <TableCell className="font-medium">{r.repair_no}</TableCell>
                  <TableCell>
                    <div>{r.customers?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.customers?.phone}</div>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.item_description}</TableCell>
                  <TableCell><Badge className={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge></TableCell>
                  <TableCell>{r.expected_delivery ? new Date(r.expected_delivery).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right">{npr(r.estimated_cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NewRepairDialog open={open} onOpenChange={setOpen} onSaved={(id) => { setOpen(false); load(); nav(`/repairs/${id}`); }} />
    </AppLayout>
  );
}

function NewRepairDialog({ open, onOpenChange, onSaved }: any) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [karigars, setKarigars] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("customers").select("id, full_name, phone").order("full_name").then(({ data }) => setCustomers(data ?? []));
    supabase.from("user_roles").select("user_id, profiles!inner(full_name)").eq("role", "karigar").then(({ data }) => {
      setKarigars((data ?? []).map((d: any) => ({ id: d.user_id, name: d.profiles?.full_name || "Unnamed" })));
    });
    setForm({
      customer_id: "", item_description: "", issue_description: "",
      metal: "gold", purity: "22K", gross_weight_in: 0, stone_weight_in: 0,
      assigned_karigar: "", estimated_cost: 0, expected_delivery: "", special_notes: "",
    });
    setPhotoFile(null);
  }, [open]);

  const netIn = computeNetWeight(Number(form.gross_weight_in || 0), Number(form.stone_weight_in || 0));

  async function save() {
    if (!form.item_description?.trim()) return toast.error("Item description required");
    if (!form.issue_description?.trim()) return toast.error("Issue description required");
    setSaving(true);
    try {
      let photoPath: string | null = null;
      if (photoFile) photoPath = await uploadImage("customer-docs", photoFile, "repairs-intake/");
      const num = Math.floor(Date.now() / 1000) % 100000;
      const repairNo = nextNumber("REP", num, 5);
      const { data, error } = await supabase.from("repairs").insert({
        repair_no: repairNo,
        customer_id: form.customer_id || null,
        item_description: form.item_description.trim(),
        issue_description: form.issue_description.trim(),
        metal: form.metal, purity: form.purity,
        gross_weight_in: Number(form.gross_weight_in) || 0,
        stone_weight_in: Number(form.stone_weight_in) || 0,
        net_weight_in: netIn,
        assigned_karigar: form.assigned_karigar || null,
        estimated_cost: Number(form.estimated_cost) || 0,
        expected_delivery: form.expected_delivery || null,
        special_notes: form.special_notes || null,
        photos: photoPath ? [photoPath] : [],
        created_by: user?.id,
      }).select("id").single();
      if (error) throw error;
      toast.success(`Repair ${repairNo} created`);
      onSaved(data.id);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> New Repair Job</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Customer</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone && `· ${c.phone}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Item description *</Label>
            <Input value={form.item_description ?? ""} onChange={(e) => setForm({ ...form, item_description: e.target.value })} placeholder="e.g. Gold bangle, 2 pieces" />
          </div>
          <div className="md:col-span-2">
            <Label>Issue description *</Label>
            <Textarea rows={2} value={form.issue_description ?? ""} onChange={(e) => setForm({ ...form, issue_description: e.target.value })} placeholder="e.g. Clasp broken, needs resizing" />
          </div>
          <div>
            <Label>Metal</Label>
            <Select value={form.metal} onValueChange={(v) => setForm({ ...form, metal: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METALS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Purity</Label>
            <Select value={form.purity} onValueChange={(v) => setForm({ ...form, purity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PURITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Gross wt in (g)</Label><Input type="number" step="0.001" value={form.gross_weight_in ?? 0} onChange={(e) => setForm({ ...form, gross_weight_in: e.target.value })} /></div>
          <div><Label>Stone wt in (g)</Label><Input type="number" step="0.001" value={form.stone_weight_in ?? 0} onChange={(e) => setForm({ ...form, stone_weight_in: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Net weight in (auto)</Label><Input readOnly value={gms(netIn)} className="bg-muted" /></div>
          <div>
            <Label>Assign karigar</Label>
            <Select value={form.assigned_karigar} onValueChange={(v) => setForm({ ...form, assigned_karigar: v })}>
              <SelectTrigger><SelectValue placeholder="Select karigar" /></SelectTrigger>
              <SelectContent>{karigars.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Estimated cost (NPR)</Label><Input type="number" value={form.estimated_cost ?? 0} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} /></div>
          <div><Label>Expected delivery</Label><Input type="date" value={form.expected_delivery ?? ""} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} /></div>
          <div><Label>Intake photo</Label><Input type="file" accept="image/*" capture="environment" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} /></div>
          <div className="md:col-span-2"><Label>Special notes</Label><Textarea rows={2} value={form.special_notes ?? ""} onChange={(e) => setForm({ ...form, special_notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create Repair Job"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
