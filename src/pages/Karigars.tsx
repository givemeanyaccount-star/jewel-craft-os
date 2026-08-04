import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, ArrowLeft, Pencil, Hammer, X } from "lucide-react";
import { npr, gms } from "@/lib/format";
import { STATUS_LABEL, STATUS_COLOR } from "./Repairs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Karigars() {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const nav = useNavigate();

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("karigars").select("*").order("name");
    setList(data ?? []);
  }

  useEffect(() => {
    if (!selected) { setJobs([]); return; }
    let cancelled = false;
    setLoadingJobs(true);
    supabase
      .from("repair_items")
      .select("*, repairs(id, repair_no, received_at, expected_delivery, delivered_at, customers(full_name, phone))")
      .eq("karigar_id", selected.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(error.message);
        setJobs(data ?? []);
        setLoadingJobs(false);
      });
    return () => { cancelled = true; };
  }, [selected]);

  const active = jobs.filter((j) => j.status !== "delivered").length;
  const totalCost = jobs.reduce((s, j) => s + Number(j.final_cost ?? j.estimated_cost ?? 0), 0);

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
                <TableRow
                  key={k.id}
                  onClick={() => setSelected(selected?.id === k.id ? null : k)}
                  className={cn("cursor-pointer", selected?.id === k.id && "bg-muted/60")}
                >
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>{k.phone ?? "—"}</TableCell>
                  <TableCell>{k.specialty ?? "—"}</TableCell>
                  <TableCell>{k.payment_terms ?? "—"}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(k); setOpen(true); }}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2"><Hammer className="h-5 w-5" /> {selected.name} — repair jobs</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {jobs.length} job{jobs.length === 1 ? "" : "s"} · {active} active · {npr(totalCost)} total charges
              </p>
              {selected.notes && <p className="mt-1 text-sm text-muted-foreground">{selected.notes}</p>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingJobs ? (
              <p className="p-6 text-center text-muted-foreground">Loading jobs…</p>
            ) : jobs.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">No repair jobs assigned to this karigar yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Repair #</TableHead><TableHead>Customer</TableHead><TableHead>Item / Issue</TableHead>
                    <TableHead>Metal</TableHead><TableHead className="text-right">Wt in</TableHead>
                    <TableHead className="text-right">Wt out</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Cost</TableHead><TableHead>Received</TableHead><TableHead>Due</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {jobs.map((j) => {
                      const r = j.repairs;
                      return (
                        <TableRow key={j.id}>
                          <TableCell className="font-medium">
                            {r ? <Link to={`/repairs/${r.id}`} className="text-primary hover:underline">{r.repair_no}</Link> : "—"}
                          </TableCell>
                          <TableCell>{r?.customers?.full_name ?? "—"}</TableCell>
                          <TableCell className="max-w-[240px]">
                            <div className="truncate">{j.item_description}</div>
                            <div className="truncate text-xs text-muted-foreground">{j.issue_description}</div>
                          </TableCell>
                          <TableCell className="capitalize">{j.metal}{j.purity ? ` · ${j.purity}` : ""}</TableCell>
                          <TableCell className="text-right">{gms(Number(j.net_weight_in ?? 0))}</TableCell>
                          <TableCell className="text-right">{j.net_weight_out != null ? gms(Number(j.net_weight_out)) : "—"}</TableCell>
                          <TableCell><Badge className={STATUS_COLOR[j.status]}>{STATUS_LABEL[j.status]}</Badge></TableCell>
                          <TableCell className="text-right">{npr(Number(j.final_cost ?? j.estimated_cost ?? 0))}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{r?.received_at ? new Date(r.received_at).toLocaleDateString() : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{r?.expected_delivery ? new Date(r.expected_delivery).toLocaleDateString() : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
