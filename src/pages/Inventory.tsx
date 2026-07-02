import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Package, QrCode } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { computeNetWeight, computeFineWeight, npr, gms } from "@/lib/format";
import { uploadImage } from "@/lib/storage";
import { QRScanButton } from "@/components/QRScanButton";

interface Category { id: string; name: string; }
interface Location_ { id: string; name: string; }
interface Item {
  id: string; sku: string; name: string; metal: string; purity: string;
  gross_weight: number; net_weight: number; fine_weight: number; stone_weight: number;
  making_charge: number; making_charge_type: string; wastage_type: string; wastage_value: number;
  status: string; category_id: string | null; location_id: string | null; image_urls: string[];
  description: string | null; stone_value: number; qr_code: string | null;
}

const METALS = ["gold", "silver", "platinum", "diamond", "other"];
const PURITIES = ["24K", "22K", "20K", "18K", "14K", "999", "925", "750"];
const STATUSES = ["in_stock", "reserved", "sold", "returned", "melted", "transferred"];

export default function Inventory() {
  const { hasRole } = useAuth();
  const canWrite = hasRole("admin") || hasRole("manager") || hasRole("sales");
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location_[]>([]);
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("in_stock");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const [i, c, l] = await Promise.all([
      supabase.from("inventory_items").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("locations").select("id, name").order("name"),
    ]);
    setItems((i.data as any[]) ?? []);
    setCats(c.data ?? []);
    setLocs(l.data ?? []);
  }

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filterStatus !== "all" && it.status !== filterStatus) return false;
      if (filterCat !== "all" && it.category_id !== filterCat) return false;
      if (!ql) return true;
      return [it.sku, it.name, it.description ?? "", it.qr_code ?? ""].some((f) => f.toLowerCase().includes(ql));
    });
  }, [items, q, filterCat, filterStatus]);

  return (
    <AppLayout title="Inventory" actions={canWrite && (
      <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> New Item</Button>
    )}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name, SKU, QR..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <QRScanButton onScan={(code) => setQ(code)} />
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Package className="h-10 w-10 opacity-40" />
          <p>No items match.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((it) => (
            <Card key={it.id} className="overflow-hidden transition hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/inventory/${it.id}`} className="block font-medium hover:underline truncate">{it.name}</Link>
                    <div className="text-xs text-muted-foreground">{it.sku}</div>
                  </div>
                  <Badge variant={it.status === "in_stock" ? "default" : "outline"} className="capitalize">{it.status.replace("_", " ")}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1 text-xs">
                  <div className="text-muted-foreground">Metal</div><div className="capitalize text-right">{it.metal} {it.purity}</div>
                  <div className="text-muted-foreground">Gross</div><div className="text-right">{gms(it.gross_weight)}</div>
                  <div className="text-muted-foreground">Net</div><div className="text-right">{gms(it.net_weight)}</div>
                  <div className="text-muted-foreground">Fine</div><div className="text-right">{gms(it.fine_weight)}</div>
                  <div className="text-muted-foreground">Making</div><div className="text-right">{npr(it.making_charge, { withSymbol: false })}</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" asChild className="flex-1"><Link to={`/inventory/${it.id}`}><QrCode className="mr-1 h-3.5 w-3.5" /> Tag</Link></Button>
                  {canWrite && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}>Edit</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ItemDialog
        open={open} onOpenChange={setOpen}
        editing={editing} cats={cats} locs={locs}
        onSaved={() => { setOpen(false); load(); }}
      />
    </AppLayout>
  );
}

function ItemDialog({ open, onOpenChange, editing, cats, locs, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: Item | null; cats: Category[]; locs: Location_[]; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (editing) setForm({ ...editing });
    else setForm({
      name: "", description: "", category_id: null, location_id: null,
      metal: "gold", purity: "22K", gross_weight: 0, stone_weight: 0,
      making_charge: 0, making_charge_type: "per_gram",
      wastage_type: "percentage", wastage_value: 0, stone_value: 0, status: "in_stock",
    });
    setImageFile(null);
  }, [editing, open]);

  const netWeight = computeNetWeight(Number(form.gross_weight || 0), Number(form.stone_weight || 0));
  const fineWeight = computeFineWeight(netWeight, form.purity || "");

  async function save() {
    if (!form.name?.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      let imagePaths = editing?.image_urls ?? [];
      if (imageFile) {
        const path = await uploadImage("product-images", imageFile, "items/");
        imagePaths = [...imagePaths, path];
      }

      const payload: any = {
        name: form.name.trim(),
        description: form.description || null,
        category_id: form.category_id || null,
        location_id: form.location_id || null,
        metal: form.metal,
        purity: form.purity,
        gross_weight: Number(form.gross_weight) || 0,
        stone_weight: Number(form.stone_weight) || 0,
        net_weight: netWeight,
        fine_weight: fineWeight,
        making_charge: Number(form.making_charge) || 0,
        making_charge_type: form.making_charge_type,
        wastage_type: form.wastage_type,
        wastage_value: Number(form.wastage_value) || 0,
        stone_value: Number(form.stone_value) || 0,
        status: form.status,
        image_urls: imagePaths,
      };

      if (editing) {
        const { error } = await supabase.from("inventory_items").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Item updated");
        onSaved();
      } else {
        // Auto-generate SKU using category prefix + sequence
        let sku = `JM-${Date.now().toString().slice(-8)}`;
        if (form.category_id) {
          const { data: skuData } = await supabase.rpc("next_category_sku", { _category_id: form.category_id });
          if (skuData) sku = skuData as string;
        }
        const qr = `JM-QR-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
        const { data: created, error } = await supabase
          .from("inventory_items")
          .insert({ ...payload, sku, qr_code: qr, barcode: sku })
          .select()
          .single();
        if (error) throw error;
        toast.success(`Item created (${sku})`);
        onSaved(created as any);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally { setSaving(false); }
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? `Edit ${editing.sku}` : "New Inventory Item"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lotus Pendant" />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category_id ?? undefined} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Location</Label>
            <Select value={form.location_id ?? undefined} onValueChange={(v) => setForm({ ...form, location_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>{locs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
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
          <div>
            <Label>Gross weight (g)</Label>
            <Input type="number" step="0.001" value={form.gross_weight ?? 0} onChange={(e) => setForm({ ...form, gross_weight: e.target.value })} />
          </div>
          <div>
            <Label>Stone weight (g)</Label>
            <Input type="number" step="0.001" value={form.stone_weight ?? 0} onChange={(e) => setForm({ ...form, stone_weight: e.target.value })} />
          </div>
          <div>
            <Label>Net (auto)</Label>
            <Input readOnly value={netWeight.toFixed(3)} className="bg-muted" />
          </div>
          <div>
            <Label>Fine (auto)</Label>
            <Input readOnly value={fineWeight.toFixed(3)} className="bg-muted" />
          </div>
          <div>
            <Label>Stone value (रू)</Label>
            <Input type="number" step="0.01" value={form.stone_value ?? 0} onChange={(e) => setForm({ ...form, stone_value: e.target.value })} />
          </div>
          <div>
            <Label>Making charge type</Label>
            <Select value={form.making_charge_type} onValueChange={(v) => setForm({ ...form, making_charge_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_gram">Per gram</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Making charge value</Label>
            <Input type="number" step="0.01" value={form.making_charge ?? 0} onChange={(e) => setForm({ ...form, making_charge: e.target.value })} />
          </div>
          <div>
            <Label>Wastage type</Label>
            <Select value={form.wastage_type} onValueChange={(v) => setForm({ ...form, wastage_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="weight">Weight (g)</SelectItem>
                <SelectItem value="fixed">Fixed (रू)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Wastage value</Label>
            <Input type="number" step="0.001" value={form.wastage_value ?? 0} onChange={(e) => setForm({ ...form, wastage_value: e.target.value })} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Image (optional)</Label>
            <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
