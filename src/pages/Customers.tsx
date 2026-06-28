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
import { Plus, Search, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { npr } from "@/lib/format";
import { uploadImage } from "@/lib/storage";

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editing ?? { full_name: "", phone: "", email: "", address: "", city: "Kathmandu", credit_limit: 0 });
    setIdFile(null);
  }, [editing, open]);

  async function save() {
    if (!form.full_name?.trim()) return toast.error("Full name required");
    setSaving(true);
    try {
      let docPath = form.id_doc_image_url ?? null;
      if (idFile) docPath = await uploadImage("customer-docs", idFile, "ids/");
      const payload: any = {
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        id_doc_type: form.id_doc_type || null,
        id_doc_number: form.id_doc_number || null,
        id_doc_image_url: docPath,
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
          <div className="md:col-span-2"><Label>Full name</Label>
            <Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
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
          <div className="md:col-span-2"><Label>ID photo (optional)</Label>
            <Input type="file" accept="image/*" onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} /></div>
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
