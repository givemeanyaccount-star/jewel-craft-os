import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, ArrowLeft, Pencil, Hammer } from "lucide-react";
import { toast } from "sonner";

export default function Karigars() {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const nav = useNavigate();

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("karigars").select("*").order("name");
    setList(data ?? []);
  }

  return (
    <AppLayout title="Karigars" actions={
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => nav("/repairs")}><ArrowLeft className="mr-1 h-4 w-4" /> Back to Repairs</Button>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> New Karigar</Button>
      </div>
    }>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Specialty</TableHead>
              <TableHead>Payment terms</TableHead><TableHead className="w-10" />
            </TableRow></TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No karigars yet — add one here, or type a new name directly in any repair job form.
                </TableCell></TableRow>
              ) : list.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>{k.phone ?? "—"}</TableCell>
                  <TableCell>{k.specialty ?? "—"}</TableCell>
                  <TableCell>{k.payment_terms ?? "—"}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => { setEditing(k); setOpen(true); }}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <KarigarDialog open={open} onOpenChange={setOpen} karigar={editing} onSaved={() => { setOpen(false); load(); }} />
    </AppLayout>
  );
}

function KarigarDialog({ open, onOpenChange, karigar, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(karigar ? { ...karigar } : { name: "", phone: "", specialty: "", payment_terms: "", notes: "" });
  }, [karigar, open]);

  async function save() {
    if (!form.name?.trim()) return toast.error("Name required");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), phone: form.phone || null, specialty: form.specialty || null,
        payment_terms: form.payment_terms || null, notes: form.notes || null,
      };
      if (karigar?.id) {
        const { error } = await supabase.from("karigars").update(payload).eq("id", karigar.id);
        if (error) throw error;
        toast.success("Karigar updated");
      } else {
        const { error } = await supabase.from("karigars").insert(payload);
        if (error) throw error;
        toast.success("Karigar added");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Hammer className="h-5 w-5" /> {karigar ? "Edit Karigar" : "New Karigar"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Specialty</Label><Input placeholder="e.g. Stone setting, Polishing" value={form.specialty ?? ""} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
          <div><Label>Payment terms</Label><Input placeholder="e.g. Per-piece rate, Monthly salary" value={form.payment_terms ?? ""} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
