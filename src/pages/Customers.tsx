import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, User, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { npr } from "@/lib/format";
import { uploadImage } from "@/lib/storage";
import { ImageCaptureButton } from "@/components/ImageCapture";
import { findSimilarCustomers, checkCustomerDuplicate, SimilarCustomer } from "@/lib/customerDuplicates";

const ID_TYPES = ["citizenship", "passport", "license", "national_id", "other"];

export default function Customers() {
  const { hasRole } = useAuth();
  const canWrite = hasRole("admin") || hasRole("manager") || hasRole("sales");
  const [customers, setCustomers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("customers").select("*").order("full_name").limit(500);
    setCustomers(data ?? []);
  }

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    if (!ql) return customers;
    return customers.filter((c) => [c.full_name, c.phone, c.email, c.id_doc_number].some((f) => (f ?? "").toLowerCase().includes(ql)));
  }, [customers, q]);

  return (
    <AppLayout title="Customers" actions={canWrite && (
      <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> New Customer</Button>
    )}>
      <div className="mb-4 relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search by name, phone, email or ID..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <User className="h-10 w-10 opacity-40" />
          <p>No customers yet.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="transition hover:shadow-md cursor-pointer" onClick={() => canWrite && (setEditing(c), setOpen(true))}>
              <CardContent className="p-4">
                <div className="font-medium">{c.full_name}</div>
                <div className="text-sm text-muted-foreground">{c.phone || "—"} · {c.city || ""}</div>
                {c.email && <div className="text-xs text-muted-foreground truncate">{c.email}</div>}
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">Balance</span>
                  <span className={Number(c.balance) > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>{npr(c.balance)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CustomerDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => { setOpen(false); load(); }} />
    </AppLayout>
  );
}

function CustomerDialog({ open, onOpenChange, editing, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [idFile, setIdFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [similar, setSimilar] = useState<SimilarCustomer[]>([]);

  useEffect(() => {
    setForm(editing ?? { full_name: "", phone: "", email: "", address: "", city: "Kathmandu", credit_limit: 0 });
    setIdFile(null);
    setPhotoFile(null);
    setSimilar([]);
  }, [editing, open]);

  async function onNameChange(name: string) {
    setForm({ ...form, full_name: name });
    const matches = await findSimilarCustomers(name, editing?.id);
    setSimilar(matches);
  }

  async function save() {
    if (!form.full_name?.trim()) return toast.error("Full name required");

    const dup = await checkCustomerDuplicate({
      phone: form.phone, id_doc_type: form.id_doc_type, id_doc_number: form.id_doc_number, excludeId: editing?.id,
    });
    if (dup.blocked) return toast.error(dup.reason);

    setSaving(true);
    try {
      let docPath = form.id_doc_image_url ?? null;
      if (idFile) docPath = await uploadImage("customer-docs", idFile, "ids/");
      let photoPath = form.photo_url ?? null;
      if (photoFile) photoPath = await uploadImage("customer-docs", photoFile, "customer-photos/");
      const payload: any = {
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        id_doc_type: form.id_doc_type || null,
        id_doc_number: form.id_doc_number || null,
        id_doc_image_url: docPath,
        photo_url: photoPath,
        notes: form.notes || null,
        credit_limit: Number(form.credit_limit) || 0,
      };
      if (editing) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
        if (error) throw error; toast.success("Customer updated");
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error; toast.success("Customer created");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Full name</Label>
            <Input value={form.full_name ?? ""} onChange={(e) => onNameChange(e.target.value)} />
            {similar.length > 0 && (
              <div className="mt-1.5 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <div className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Similar names already exist:</div>
                <ul className="space-y-0.5">
                  {similar.map((s) => <li key={s.id}>· {s.full_name} {s.phone && `(${s.phone})`}</li>)}
                </ul>
              </div>
            )}
          </div>
          <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>Credit limit (रू)</Label><Input type="number" value={form.credit_limit ?? 0} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Address</Label><Textarea rows={2} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>ID document type</Label>
            <Select value={form.id_doc_type ?? undefined} onValueChange={(v) => setForm({ ...form, id_doc_type: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{ID_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>ID number</Label><Input value={form.id_doc_number ?? ""} onChange={(e) => setForm({ ...form, id_doc_number: e.target.value })} /></div>
          <div>
            <Label className="mb-1 block">ID photo</Label>
            <PhotoField file={idFile} existingUrl={form.id_doc_image_url} onCapture={setIdFile} />
          </div>
          <div>
            <Label className="mb-1 block">Customer photo</Label>
            <PhotoField file={photoFile} existingUrl={form.photo_url} onCapture={setPhotoFile} />
          </div>
          <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhotoField({ file, existingUrl, onCapture }: { file: File | null; existingUrl?: string | null; onCapture: (f: File) => void }) {
  const preview = file ? URL.createObjectURL(file) : null;
  return (
    <div className="flex items-center gap-2">
      {preview ? <img src={preview} className="h-12 w-12 rounded object-cover" /> : existingUrl ? (
        <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">On file</div>
      ) : null}
      <ImageCaptureButton label={file || existingUrl ? "Retake" : "Capture"} onCapture={onCapture} />
    </div>
  );
}
