import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Coins } from "lucide-react";
import { npr, gms, computeNetWeight, computeFineWeight, nextNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { uploadImage } from "@/lib/storage";
import { toast } from "sonner";

const ID_TYPES = ["citizenship", "passport", "license", "national_id", "other"];
const METALS = ["gold", "silver", "platinum"];
const PURITIES = ["24K", "22K", "20K", "18K", "999", "925"];
const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "credit", "other"];

export default function OldGold() {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const { hasRole } = useAuth();
  const canWrite = hasRole("admin") || hasRole("manager") || hasRole("sales");

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("old_gold_purchases").select("*").order("purchased_at", { ascending: false }).limit(200);
    setList(data ?? []);
  }

  return (
    <AppLayout title="Old Gold Purchase" actions={canWrite && (
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New Purchase</Button>
    )}>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Receipt</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead>
            <TableHead>Metal</TableHead><TableHead className="text-right">Net wt</TableHead>
            <TableHead className="text-right">Fine</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No purchases yet</TableCell></TableRow>
              : list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.receipt_number}</TableCell>
                  <TableCell><div>{p.customer_name}</div><div className="text-xs text-muted-foreground">{p.customer_phone}</div></TableCell>
                  <TableCell>{new Date(p.purchased_at).toLocaleDateString()}</TableCell>
                  <TableCell className="capitalize">{p.metal} {p.purity}</TableCell>
                  <TableCell className="text-right">{gms(p.net_weight)}</TableCell>
                  <TableCell className="text-right">{gms(p.fine_weight)}</TableCell>
                  <TableCell className="text-right font-medium">{npr(p.total_amount)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <OldGoldDialog open={open} onOpenChange={setOpen} onSaved={() => { setOpen(false); load(); }} />
    </AppLayout>
  );
}

function OldGoldDialog({ open, onOpenChange, onSaved }: any) {
  const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const [idFile, setIdFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      customer_name: "", customer_phone: "", id_doc_type: "citizenship", id_doc_number: "",
      metal: "gold", purity: "22K", gross_weight: 0, stone_weight: 0,
      rate_per_gram: 0, deduction: 0, payment_method: "cash", notes: "",
    });
    setIdFile(null); setPhotoFile(null);
  }, [open]);

  const net = computeNetWeight(Number(form.gross_weight || 0), Number(form.stone_weight || 0));
  const fine = computeFineWeight(net, form.purity || "");
  const total = Math.max(0, fine * Number(form.rate_per_gram || 0) - Number(form.deduction || 0));

  async function save() {
    if (!form.customer_name?.trim()) return toast.error("Customer name required");
    if (!form.gross_weight) return toast.error("Weight required");
    if (!form.rate_per_gram) return toast.error("Rate required");
    setSaving(true);
    try {
      let idPath = null, photoPath = null;
      if (idFile) idPath = await uploadImage("customer-docs", idFile, "oldgold-ids/");
      if (photoFile) photoPath = await uploadImage("customer-docs", photoFile, "oldgold-photos/");
      const num = Math.floor(Date.now() / 1000) % 100000;
      const receipt = nextNumber("OG", num, 5);
      const { error } = await supabase.from("old_gold_purchases").insert({
        receipt_number: receipt,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone || null,
        id_doc_type: form.id_doc_type, id_doc_number: form.id_doc_number || null,
        id_doc_image_url: idPath, customer_photo_url: photoPath,
        metal: form.metal, purity: form.purity,
        gross_weight: Number(form.gross_weight), stone_weight: Number(form.stone_weight) || 0,
        net_weight: net, fine_weight: fine,
        rate_per_gram: Number(form.rate_per_gram), deduction: Number(form.deduction) || 0,
        total_amount: total, payment_method: form.payment_method, notes: form.notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success(`Receipt ${receipt} created`);
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Coins className="h-5 w-5" /> Old Gold Purchase</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Customer name *</Label><Input value={form.customer_name ?? ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.customer_phone ?? ""} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
          <div><Label>ID type</Label>
            <Select value={form.id_doc_type} onValueChange={(v) => setForm({ ...form, id_doc_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ID_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>ID number</Label><Input value={form.id_doc_number ?? ""} onChange={(e) => setForm({ ...form, id_doc_number: e.target.value })} /></div>
          <div><Label>ID photo</Label><Input type="file" accept="image/*" onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} /></div>
          <div><Label>Customer photo</Label><Input type="file" accept="image/*" capture="environment" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} /></div>

          <div><Label>Metal</Label>
            <Select value={form.metal} onValueChange={(v) => setForm({ ...form, metal: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METALS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Purity</Label>
            <Select value={form.purity} onValueChange={(v) => setForm({ ...form, purity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PURITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Gross wt (g)</Label><Input type="number" step="0.001" value={form.gross_weight ?? 0} onChange={(e) => setForm({ ...form, gross_weight: e.target.value })} /></div>
          <div><Label>Stone wt (g)</Label><Input type="number" step="0.001" value={form.stone_weight ?? 0} onChange={(e) => setForm({ ...form, stone_weight: e.target.value })} /></div>
          <div><Label>Net (auto)</Label><Input readOnly value={net.toFixed(3)} className="bg-muted" /></div>
          <div><Label>Fine (auto)</Label><Input readOnly value={fine.toFixed(3)} className="bg-muted" /></div>
          <div><Label>Rate per gram (fine)</Label><Input type="number" value={form.rate_per_gram ?? 0} onChange={(e) => setForm({ ...form, rate_per_gram: e.target.value })} /></div>
          <div><Label>Deduction</Label><Input type="number" value={form.deduction ?? 0} onChange={(e) => setForm({ ...form, deduction: e.target.value })} /></div>
          <div className="md:col-span-2 rounded bg-secondary p-3 text-center">
            <div className="text-xs text-muted-foreground">Total payable</div>
            <div className="text-2xl font-semibold">{npr(total)}</div>
          </div>
          <div><Label>Payment method</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create Receipt"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
