import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Coins, Search, UserPlus, Check, Printer, Eye } from "lucide-react";
import { npr, gms, computeNetWeight, computeFineWeight, nextNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { uploadImage, getSignedUrls } from "@/lib/storage";
import { toast } from "sonner";
import { ImageCaptureButton } from "@/components/ImageCapture";
import { checkCustomerDuplicate } from "@/lib/customerDuplicates";
import logoUrl from "@/assets/logo.png";

const ID_TYPES = ["citizenship", "passport", "license", "national_id", "other"];
const METALS = ["gold", "silver", "platinum"];
const PURITIES = ["24K", "22K", "20K", "18K", "999", "925"];
const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"];

export default function OldGold() {
  const [list, setList] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const { hasRole } = useAuth();
  const canWrite = hasRole("admin") || hasRole("manager") || hasRole("sales");

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("old_gold_purchases").select("*, customers(full_name, phone)").order("purchased_at", { ascending: false }).limit(300);
    setList(data ?? []);
  }

  return (
    <AppLayout title="Old Gold Purchase">
      <p className="mb-4 text-sm text-muted-foreground">Cash buyback: customer sells gold/silver to the shop. Automatically linked to your Customer CRM.</p>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">New Purchase</TabsTrigger>
          <TabsTrigger value="history">Purchase History</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          {canWrite ? <OldGoldForm onSaved={load} /> : <p className="text-sm text-muted-foreground">You don't have permission to record purchases.</p>}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Receipt</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead>
                <TableHead>Metal</TableHead><TableHead className="text-right">Net wt</TableHead>
                <TableHead className="text-right">Fine</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {list.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No purchases yet</TableCell></TableRow>
                  : list.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => setDetail(p)}>
                      <TableCell className="font-medium">{p.receipt_number}</TableCell>
                      <TableCell><div>{p.customers?.full_name ?? p.customer_name}</div><div className="text-xs text-muted-foreground">{p.customers?.phone ?? p.customer_phone}</div></TableCell>
                      <TableCell>{new Date(p.purchased_at).toLocaleDateString()}</TableCell>
                      <TableCell className="capitalize">{p.metal} {p.purity}</TableCell>
                      <TableCell className="text-right">{gms(p.net_weight)}</TableCell>
                      <TableCell className="text-right">{gms(p.fine_weight)}</TableCell>
                      <TableCell className="text-right font-medium">{npr(p.total_amount)}</TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetail(p); }}><Eye className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <ReceiptDialog purchase={detail} onOpenChange={(v: boolean) => !v && setDetail(null)} />
    </AppLayout>
  );
}

function OldGoldForm({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const [idFile, setIdFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  useEffect(() => { reset(); }, []);
  function reset() {
    setForm({
      customer_name: "", customer_phone: "", id_doc_type: "citizenship", id_doc_number: "",
      metal: "gold", purity: "22K", gross_weight: 0, stone_weight: 0,
      rate_per_gram: 0, deduction: 0, payment_method: "cash", notes: "",
    });
    setIdFile(null); setPhotoFile(null); setQuery(""); setMatches([]); setSelectedCustomer(null);
  }

  async function searchCustomers(q: string) {
    setQuery(q);
    setSelectedCustomer(null);
    if (q.trim().length < 2) { setMatches([]); return; }
    const { data } = await supabase.from("customers").select("id, full_name, phone").or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    setMatches(data ?? []);
  }

  function pickCustomer(c: any) {
    setSelectedCustomer(c);
    setForm({ ...form, customer_name: c.full_name, customer_phone: c.phone ?? "" });
    setMatches([]);
    setQuery(c.full_name);
  }

  const net = computeNetWeight(Number(form.gross_weight || 0), Number(form.stone_weight || 0));
  const fine = computeFineWeight(net, form.purity || "");
  const total = Math.max(0, fine * Number(form.rate_per_gram || 0) - Number(form.deduction || 0));

  async function save() {
    if (!form.customer_name?.trim()) return toast.error("Customer name required");
    if (!form.gross_weight) return toast.error("Weight required");
    if (!form.rate_per_gram) return toast.error("Rate required");

    if (!selectedCustomer) {
      const dup = await checkCustomerDuplicate({ phone: form.customer_phone, id_doc_type: form.id_doc_type, id_doc_number: form.id_doc_number });
      if (dup.blocked) return toast.error(`${dup.reason} — search and select them above instead of creating a duplicate.`);
    }

    setSaving(true);
    try {
      let customerId = selectedCustomer?.id ?? null;
      if (!customerId) {
        const { data: newCust, error: custErr } = await supabase.from("customers").insert({
          full_name: form.customer_name.trim(), phone: form.customer_phone || null,
          id_doc_type: form.id_doc_type || null, id_doc_number: form.id_doc_number || null,
        }).select("id").single();
        if (custErr) throw custErr;
        customerId = newCust.id;
      }

      let idPath = null, photoPath = null;
      if (idFile) idPath = await uploadImage("customer-docs", idFile, "oldgold-ids/");
      if (photoFile) photoPath = await uploadImage("customer-docs", photoFile, "oldgold-photos/");
      const num = Math.floor(Date.now() / 1000) % 100000;
      const receipt = nextNumber("OG", num, 5);
      const { error } = await supabase.from("old_gold_purchases").insert({
        receipt_number: receipt,
        customer_id: customerId,
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
      toast.success(`Receipt ${receipt} created${selectedCustomer ? "" : " · new customer added to CRM"}`);
      reset();
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2"><Coins className="h-5 w-5" /> <span className="font-medium">New Old Gold Purchase</span></div>

        <div className="relative">
          <Label>Search customer by name or phone</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" value={query} onChange={(e) => searchCustomers(e.target.value)} placeholder="Type to search existing customers..." />
          </div>
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded border bg-popover shadow-md">
              {matches.map((c) => (
                <button key={c.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => pickCustomer(c)}>
                  <span>{c.full_name} {c.phone && `· ${c.phone}`}</span>
                </button>
              ))}
            </div>
          )}
          {selectedCustomer ? (
            <Badge className="mt-2 bg-emerald-200 text-emerald-900"><Check className="mr-1 h-3 w-3" /> Linked to existing customer</Badge>
          ) : query.trim().length >= 2 ? (
            <Badge variant="outline" className="mt-2"><UserPlus className="mr-1 h-3 w-3" /> No match — will create new customer</Badge>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Customer name *</Label><Input value={form.customer_name ?? ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} disabled={!!selectedCustomer} /></div>
          <div><Label>Phone</Label><Input value={form.customer_phone ?? ""} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} disabled={!!selectedCustomer} /></div>
          <div><Label>ID type</Label>
            <Select value={form.id_doc_type} onValueChange={(v) => setForm({ ...form, id_doc_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ID_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>ID number</Label><Input value={form.id_doc_number ?? ""} onChange={(e) => setForm({ ...form, id_doc_number: e.target.value })} /></div>
          <div>
            <Label className="mb-1 block">ID photo</Label>
            <div className="flex items-center gap-2">
              {idFile && <img src={URL.createObjectURL(idFile)} className="h-12 w-12 rounded object-cover" />}
              <ImageCaptureButton label={idFile ? "Retake" : "Capture"} onCapture={setIdFile} />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Customer photo</Label>
            <div className="flex items-center gap-2">
              {photoFile && <img src={URL.createObjectURL(photoFile)} className="h-12 w-12 rounded object-cover" />}
              <ImageCaptureButton label={photoFile ? "Retake" : "Capture"} onCapture={setPhotoFile} />
            </div>
          </div>

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
            <div className="text-xs text-muted-foreground">Total payable to customer (cash out)</div>
            <div className="text-2xl font-semibold">{npr(total)}</div>
          </div>
          <div><Label>Payment method</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving..." : "Record Purchase & Pay Out"}</Button>
      </CardContent>
    </Card>
  );
}

function ReceiptDialog({ purchase, onOpenChange }: { purchase: any; onOpenChange: (v: boolean) => void }) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!purchase) return;
    const paths = [purchase.id_doc_image_url, purchase.customer_photo_url].filter(Boolean);
    if (paths.length) getSignedUrls("customer-docs", paths).then(setPhotoUrls);
  }, [purchase]);

  if (!purchase) return null;

  return (
    <Dialog open={!!purchase} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Receipt {purchase.receipt_number}</DialogTitle></DialogHeader>

        <div id={`ogp-print-${purchase.id}`} className="rounded border bg-white p-6 text-black">
          <div className="mb-4 flex items-center justify-between border-b-2 border-black pb-4">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="JewelMaster" className="h-12 w-12 object-contain" />
              <div>
                <div className="text-lg font-bold tracking-tight">JewelMaster</div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-gray-600">Fine Jewellery · Kathmandu, Nepal</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-widest text-gray-500">Old Gold Purchase Receipt</div>
              <div className="text-base font-semibold">{purchase.receipt_number}</div>
              <div className="text-[9px] text-gray-600">{new Date(purchase.purchased_at).toLocaleString()}</div>
            </div>
          </div>

          <div className="mb-3 text-sm">
            <div><strong>Customer:</strong> {purchase.customers?.full_name ?? purchase.customer_name} {(purchase.customers?.phone ?? purchase.customer_phone) && `· ${purchase.customers?.phone ?? purchase.customer_phone}`}</div>
            {purchase.id_doc_number && <div><strong>ID:</strong> {purchase.id_doc_type?.replace("_", " ")} {purchase.id_doc_number}</div>}
          </div>

          <table className="w-full border-collapse text-sm">
            <tbody>
              <Row2 label="Metal / Purity" value={`${purchase.metal} ${purchase.purity}`} />
              <Row2 label="Gross weight" value={gms(purchase.gross_weight)} />
              <Row2 label="Stone weight" value={gms(purchase.stone_weight)} />
              <Row2 label="Net weight" value={gms(purchase.net_weight)} />
              <Row2 label="Fine weight" value={gms(purchase.fine_weight)} />
              <Row2 label="Rate per gram (fine)" value={npr(purchase.rate_per_gram)} />
              <Row2 label="Deduction" value={npr(purchase.deduction)} />
              <Row2 label="Payment method" value={purchase.payment_method?.replace("_", " ")} />
            </tbody>
          </table>
          <div className="mt-3 text-right text-base font-semibold">Total paid: {npr(purchase.total_amount)}</div>
          {purchase.notes && <div className="mt-2 text-xs text-gray-600">Notes: {purchase.notes}</div>}

          {(photoUrls[purchase.id_doc_image_url] || photoUrls[purchase.customer_photo_url]) && (
            <div className="mt-4 flex gap-3">
              {photoUrls[purchase.id_doc_image_url] && <div><div className="mb-1 text-[9px] text-gray-500">ID</div><img src={photoUrls[purchase.id_doc_image_url]} className="h-20 w-20 rounded object-cover" /></div>}
              {photoUrls[purchase.customer_photo_url] && <div><div className="mb-1 text-[9px] text-gray-500">Customer</div><img src={photoUrls[purchase.customer_photo_url]} className="h-20 w-20 rounded object-cover" /></div>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => printReceipt(purchase.id)}><Printer className="mr-1 h-4 w-4" /> Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row2({ label, value }: { label: string; value: any }) {
  return <tr className="border-b"><td className="py-1 text-gray-600">{label}</td><td className="py-1 text-right capitalize">{value ?? "—"}</td></tr>;
}

function printReceipt(id: string) {
  const el = document.getElementById(`ogp-print-${id}`);
  if (!el) return;
  const w = window.open("", "_blank", "width=700,height=900");
  if (!w) return;
  w.document.write(`<html><head><title>Old Gold Purchase Receipt</title>
    <style>body{font-family:sans-serif;margin:20px;} table{width:100%;border-collapse:collapse;} @page{size:A4;margin:10mm;}</style>
  </head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 300);
}
