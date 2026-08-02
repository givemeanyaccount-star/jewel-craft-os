import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function Suppliers() {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setList(data ?? []);
  }

  return (
    <AppLayout title="Suppliers" actions={
      <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> New Supplier</Button>
    }>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Contact Person</TableHead><TableHead>Phone</TableHead>
              <TableHead>PAN/VAT</TableHead><TableHead>City</TableHead><TableHead className="w-10" />
            </TableRow></TableHeader>
            <TableBody>
              {list.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No suppliers yet</TableCell></TableRow>
                : list.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.contact_person ?? "—"}</TableCell>
                    <TableCell>{s.phone ?? "—"}</TableCell>
                    <TableCell>{s.pan_vat_number ?? "—"}</TableCell>
                    <TableCell>{s.city ?? "—"}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <SupplierDialog open={open} onOpenChange={setOpen} supplier={editing} onSaved={() => { setOpen(false); load(); }} />
    </AppLayout>
  );
}

function SupplierDialog({ open, onOpenChange, supplier, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(supplier ? { ...supplier } : { name: "", contact_person: "", phone: "", pan_vat_number: "", address: "", city: "", notes: "" });
  }, [supplier, open]);

  async function save() {
    if (!form.name?.trim()) return toast.error("Supplier name required");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), contact_person: form.contact_person || null, phone: form.phone || null,
        pan_vat_number: form.pan_vat_number || null, address: form.address || null,
        city: form.city || null, notes: form.notes || null,
      };
      if (supplier?.id) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", supplier.id);
        if (error) throw error;
        toast.success("Supplier updated");
      } else {
        const { error } = await supabase.from("suppliers").insert(payload);
        if (error) throw error;
        toast.success("Supplier added");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{supplier ? "Edit Supplier" : "New Supplier"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Contact person</Label><Input value={form.contact_person ?? ""} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>PAN/VAT number</Label><Input value={form.pan_vat_number ?? ""} onChange={(e) => setForm({ ...form, pan_vat_number: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Address</Label><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
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
