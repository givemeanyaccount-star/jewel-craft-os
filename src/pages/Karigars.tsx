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
import { Plus, ArrowLeft, Pencil, Hammer, X, Scale, AlertTriangle, Wallet } from "lucide-react";
import { npr, gms, round2 } from "@/lib/format";
import { STATUS_LABEL, STATUS_COLOR } from "./Repairs";
import { ORDER_ITEM_LABEL, ORDER_ITEM_COLOR } from "@/lib/orders";
import { fetchKarigarLedger, KarigarLedger } from "@/lib/karigarLedger";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Karigars() {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [orderJobs, setOrderJobs] = useState<any[]>([]);
  const [ledger, setLedger] = useState<KarigarLedger | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("karigars").select("*").order("name");
    setList(data ?? []);
  }

  useEffect(() => {
    if (!selected) { setJobs([]); setOrderJobs([]); setLedger(null); return; }
    loadLedger();
    supabase
      .from("order_items")
      .select("*, orders(id, order_no, order_date, promised_date, customers(full_name))")
      .eq("karigar_id", selected.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrderJobs(data ?? []));
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

  async function loadLedger() {
    if (!selected) return;
    setLoadingLedger(true);
    try { setLedger(await fetchKarigarLedger(selected.id)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoadingLedger(false); }
  }

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
        <KarigarLedgerSection karigar={selected} ledger={ledger} loading={loadingLedger}
          onRecordPayment={() => setPayOpen(true)} />
      )}

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

      {selected && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Hammer className="h-5 w-5" /> {selected.name} — custom order jobs</CardTitle>
            <p className="text-sm text-muted-foreground">
              {orderJobs.length} job{orderJobs.length === 1 ? "" : "s"} ·
              {" "}{orderJobs.filter((j) => !["billed", "in_stock", "cancelled"].includes(j.status)).length} in hand
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {orderJobs.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">No custom order items assigned to this karigar yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Order #</TableHead><TableHead>Customer</TableHead><TableHead>Item</TableHead>
                    <TableHead>Metal</TableHead><TableHead className="text-right">Issued wt</TableHead>
                    <TableHead className="text-right">Received wt</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Est. value</TableHead><TableHead>Promised</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {orderJobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell className="font-medium">
                          {j.orders ? <Link to={`/orders/${j.orders.id}`} className="text-primary hover:underline">{j.orders.order_no}</Link> : "—"}
                        </TableCell>
                        <TableCell>{j.orders?.customers?.full_name ?? "—"}</TableCell>
                        <TableCell className="max-w-[240px] truncate">{j.description}</TableCell>
                        <TableCell className="capitalize">{j.metal}{j.purity ? ` · ${j.purity}` : ""}</TableCell>
                        <TableCell className="text-right">{j.issued_weight != null ? gms(Number(j.issued_weight)) : "—"}</TableCell>
                        <TableCell className="text-right">{j.received_gross_weight != null ? gms(Number(j.received_gross_weight)) : "—"}</TableCell>
                        <TableCell><Badge className={ORDER_ITEM_COLOR[j.status]}>{ORDER_ITEM_LABEL[j.status]}</Badge></TableCell>
                        <TableCell className="text-right">{npr(Number(j.estimated_amount ?? 0))}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{j.orders?.promised_date ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <KarigarDialog open={open} onOpenChange={setOpen} karigar={editing} onSaved={() => { setOpen(false); load(); }} />
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} karigar={selected} onSaved={() => { setPayOpen(false); loadLedger(); }} />
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

function KarigarLedgerSection({ karigar, ledger, loading, onRecordPayment }: {
  karigar: any; ledger: KarigarLedger | null; loading: boolean; onRecordPayment: () => void;
}) {
  if (loading || !ledger) {
    return <Card className="mt-4"><CardContent className="p-6 text-center text-muted-foreground">Loading ledger…</CardContent></Card>;
  }

  const flaggedWastage = ledger.wastage.filter((w) => w.flagged);
  const overdueJobs = ledger.outstandingJobs.filter((j) => j.daysHeld > 14);
  const balance = round2(ledger.completedJobsValue - ledger.totalPaid);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4" /> Metal Balance</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {ledger.metalBalances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing outstanding — all metal accounted for.</p>
          ) : ledger.metalBalances.map((b) => (
            <div key={b.metal} className="flex items-center justify-between text-sm">
              <span className="capitalize">{b.metal} <span className="text-xs text-muted-foreground">({b.jobCount} job{b.jobCount === 1 ? "" : "s"})</span></span>
              <span className="font-semibold">{gms(b.outstandingGrams)}</span>
            </div>
          ))}
          {overdueJobs.length > 0 && (
            <div className="mt-2 flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {overdueJobs.length} job{overdueJobs.length === 1 ? "" : "s"} held over 14 days
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> Wastage Variance</CardTitle></CardHeader>
        <CardContent>
          {ledger.wastage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed jobs with weight data yet.</p>
          ) : (
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {ledger.wastage.slice(0, 8).map((w, i) => (
                <div key={i} className={cn("flex items-center justify-between rounded px-2 py-1 text-xs", w.flagged && "bg-destructive/10")}>
                  <span className="truncate">{w.refNo} · {w.description}</span>
                  <span className={cn("shrink-0 font-medium", w.flagged && "text-destructive")}>
                    {gms(w.actualLoss)}{w.expectedLoss != null && ` / exp. ${gms(w.expectedLoss)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {flaggedWastage.length > 0 && (
            <p className="mt-2 text-xs text-destructive">{flaggedWastage.length} job(s) lost more metal than priced in.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> Making Charges</CardTitle>
          <Button size="sm" variant="outline" onClick={onRecordPayment}>Record Payment</Button>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Completed jobs (reference value)</span><span>{npr(ledger.completedJobsValue)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Paid to karigar</span><span>{npr(ledger.totalPaid)}</span></div>
          <div className="flex justify-between border-t pt-1.5 font-medium"><span>Difference</span><span className={balance > 0 ? "text-amber-700" : ""}>{npr(balance)}</span></div>
          <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
            "Completed jobs" is the making-charge value billed to customers for this karigar's finished work — not necessarily their exact take-home if your shop keeps a margin. Use it as a reference alongside actual payments recorded below.
          </p>
          {ledger.payments.length > 0 && (
            <div className="mt-2 max-h-32 space-y-1 overflow-y-auto border-t pt-2">
              {ledger.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-xs text-muted-foreground">
                  <span>{new Date(p.payment_date).toLocaleDateString()} {p.method && `· ${p.method}`}</span>
                  <span>{npr(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentDialog({ open, onOpenChange, karigar, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; karigar: any; onSaved: () => void }) {
  const [amount, setAmount] = useState<any>(0);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setAmount(0); setMethod("cash"); setReference(""); setNotes(""); } }, [open]);

  async function save() {
    if (!karigar) return;
    if (!amount || Number(amount) <= 0) return toast.error("Enter an amount");
    setSaving(true);
    try {
      const { error } = await supabase.from("karigar_payments").insert({
        karigar_id: karigar.id, amount: Number(amount), method, reference: reference || null, notes: notes || null,
      });
      if (error) throw error;
      toast.success("Payment recorded");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record payment — {karigar?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Amount (NPR) *</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Method</Label><Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="cash, bank transfer..." /></div>
          <div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Job/order #, cheque #..." /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

