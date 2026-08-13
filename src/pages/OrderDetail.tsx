import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { NumberField } from "@/components/ui/number-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hammer, PackageCheck, Printer, Receipt, Plus, X, Coins } from "lucide-react";
import { toast } from "sonner";
import { npr, gms, computeNetWeight, round2, computeFineWeight } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { KarigarSelect, useKarigars } from "@/components/KarigarSelect";
import { openPrintPreview } from "@/components/PrintPreview";
import { useCompanyProfile } from "@/components/PrintDocument";
import { ImageCaptureButton } from "@/components/ImageCapture";
import { uploadImage } from "@/lib/storage";
import {
  ORDER_ITEM_LABEL, ORDER_ITEM_COLOR, ORDER_STATUS_LABEL,
  estimateOrderLine, logOrderItemStatus, syncOrderStatus, recalcOrderItem, lineProgress, progressLabel,
} from "@/lib/orders";


const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"];

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("order_manage");
  const canBill = hasPermission("order_bill");

  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [issueFor, setIssueFor] = useState<any>(null);
  const [receiveFor, setReceiveFor] = useState<any>(null);
  const [stockFor, setStockFor] = useState<{ item: any; receipt: any } | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: o }, { data: its }, { data: pays }] = await Promise.all([
      supabase.from("orders").select("*, customers(id, full_name, phone, address)").eq("id", id).maybeSingle(),
      supabase.from("order_items").select("*, categories(name), inventory_items(id, sku, status)").eq("order_id", id).order("created_at"),
      supabase.from("payments").select("*").eq("order_id", id).order("paid_at", { ascending: false }),
    ]);
    setOrder(o); setItems(its ?? []); setAdvances(pays ?? []);
    const ids = (its ?? []).map((i: any) => i.id);
    if (ids.length) {
      const [{ data: lg }, { data: rc }] = await Promise.all([
        supabase.from("order_item_status_log").select("*").in("order_item_id", ids).order("changed_at", { ascending: false }),
        supabase.from("order_item_receipts").select("*, inventory_items(id, sku, status), invoices(id, invoice_number)")
          .in("order_item_id", ids).order("batch_no"),
      ]);
      setLogs(lg ?? []); setReceipts(rc ?? []);
    } else { setLogs([]); setReceipts([]); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const advanceTotal = useMemo(() => round2(advances.reduce((a, p) => a + Number(p.amount ?? 0), 0)), [advances]);
  const estimate = useMemo(
    () => round2(items.filter((i) => i.status !== "cancelled").reduce((a, i) => a + Number(i.estimated_amount ?? 0), 0)),
    [items],
  );
  const billableCount = items.reduce((a, i) => a + (i.status === "cancelled" ? 0 : lineProgress(i).billable), 0);

  async function refresh() {
    if (id) await syncOrderStatus(id);
    await load();
  }

  async function setStatus(item: any, status: string, note?: string) {
    const { error } = await supabase.from("order_items").update({ status: status as any }).eq("id", item.id);
    if (error) return toast.error(error.message);
    await logOrderItemStatus({ order_item_id: item.id, status: status as any, note: note ?? null, changed_by: user?.id });
    await refresh();
  }


  if (!order) return <AppLayout title="Order"><p className="text-muted-foreground">Loading…</p></AppLayout>;

  const overdue = order.promised_date && new Date(order.promised_date) < new Date() && !["completed", "cancelled"].includes(order.status);

  return (
    <AppLayout title={`Order ${order.order_no}`} actions={
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => printAdvanceReceipt(order, advances, advanceTotal)}>
          <Printer className="mr-1 h-4 w-4" /> Advance receipt
        </Button>
        {canBill && billableCount > 0 && order.status !== "cancelled" && (
          <Button size="sm" onClick={() => nav("/pos", { state: { orderId: order.id } })}>
            <Receipt className="mr-1 h-4 w-4" /> Bill {billableCount} finished piece{billableCount > 1 ? "s" : ""}
          </Button>
        )}

        {canManage && !["completed", "cancelled"].includes(order.status) && (
          <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}><X className="mr-1 h-4 w-4" /> Cancel</Button>
        )}
      </div>
    }>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Order items</CardTitle>
            <Badge variant="outline">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Karigar</TableHead>
                <TableHead className="text-right">Expected net</TableHead>
                <TableHead className="text-right">Issued / Received</TableHead>
                <TableHead className="text-right">Estimate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {items.map((it) => {
                  const loss = it.issued_net_weight != null && it.received_net_weight != null
                    ? round2(Number(it.issued_net_weight) - Number(it.received_net_weight)) : null;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-medium">{it.description}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {it.metal} {it.purity}{it.categories?.name ? ` · ${it.categories.name}` : ""}
                          {it.inventory_items?.sku ? ` · ${it.inventory_items.sku}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{it.karigar_name ?? "-"}</TableCell>
                      <TableCell className="text-right">{gms(it.expected_net_weight)}</TableCell>
                      <TableCell className="text-right text-xs">
                        {it.issued_net_weight != null ? `${gms(it.issued_net_weight)} out` : "—"}
                        <br />
                        {it.received_net_weight != null ? `${gms(it.received_net_weight)} in` : "—"}
                        {loss != null && Math.abs(loss) > 0.0005 && (
                          <div className={loss > 0 ? "text-destructive" : "text-emerald-600"}>
                            {loss > 0 ? "loss" : "gain"} {gms(Math.abs(loss))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{npr(it.estimated_amount)}</TableCell>
                      <TableCell><Badge variant="secondary" className={ORDER_ITEM_COLOR[it.status]}>{ORDER_ITEM_LABEL[it.status]}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {canManage && it.status !== "billed" && it.status !== "cancelled" && (
                          <div className="flex justify-end gap-1">
                            {(it.status === "pending" || it.status === "assigned") && (
                              <Button size="sm" variant="outline" onClick={() => setIssueFor(it)}><Hammer className="mr-1 h-3.5 w-3.5" /> Issue</Button>
                            )}
                            {it.status === "in_progress" && (
                              <Button size="sm" variant="outline" onClick={() => setReceiveFor(it)}>Receive</Button>
                            )}
                            {it.status === "received" && (
                              <Button size="sm" onClick={() => setStockFor(it)}><PackageCheck className="mr-1 h-3.5 w-3.5" /> Add to stock</Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => {
                              if (window.confirm("Cancel this order line?")) setStatus(it, "cancelled", "Line cancelled");
                            }}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Customer" value={order.customers?.full_name ?? "-"} />
              <Row label="Phone" value={order.customers?.phone ?? "-"} />
              <Row label="Order date" value={order.order_date} />
              <Row label="Promised" value={order.promised_date ?? "-"} highlight={!!overdue} />
              <Row label="Estimated total" value={npr(estimate)} />
              <Row label="Advance paid" value={npr(advanceTotal)} />
              <Row label="Balance (est.)" value={npr(Math.max(0, estimate - advanceTotal))} />
              {order.notes && <p className="pt-2 text-xs text-muted-foreground">{order.notes}</p>}
              {order.cancel_reason && <p className="pt-2 text-xs text-destructive">Cancelled: {order.cancel_reason}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2"><Coins className="h-4 w-4" /> Advances</CardTitle>
              {canManage && order.status !== "cancelled" && (
                <Button size="sm" variant="outline" onClick={() => setAdvOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
              )}
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {advances.length === 0 ? <p className="text-muted-foreground">No advance recorded</p> : advances.map((p) => (
                <div key={p.id} className="flex justify-between border-b py-1 last:border-0">
                  <span className="capitalize text-muted-foreground">{p.method.replace("_", " ")} · {new Date(p.paid_at).toLocaleDateString()}</span>
                  <span className={Number(p.amount) < 0 ? "text-destructive" : ""}>{npr(p.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent className="max-h-72 space-y-2 overflow-y-auto text-xs">
              {logs.length === 0 ? <p className="text-muted-foreground">No activity yet</p> : logs.map((l) => (
                <div key={l.id} className="border-b pb-1 last:border-0">
                  <div className="font-medium">{ORDER_ITEM_LABEL[l.status] ?? l.status}</div>
                  <div className="text-muted-foreground">
                    {new Date(l.changed_at).toLocaleString()}
                    {l.karigar_name ? ` · ${l.karigar_name}` : ""}
                    {l.net_weight != null ? ` · ${gms(l.net_weight)} net` : ""}
                  </div>
                  {l.note && <div className="text-muted-foreground">{l.note}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <IssueDialog item={issueFor} onOpenChange={(v) => !v && setIssueFor(null)} userId={user?.id} onDone={async () => { setIssueFor(null); await refresh(); }} />
      <ReceiveDialog item={receiveFor} onOpenChange={(v) => !v && setReceiveFor(null)} userId={user?.id} onDone={async () => { setReceiveFor(null); await refresh(); }} />
      <ToStockDialog item={stockFor} onOpenChange={(v) => !v && setStockFor(null)} userId={user?.id} onDone={async () => { setStockFor(null); await refresh(); }} />
      <AdvanceDialog open={advOpen} onOpenChange={setAdvOpen} order={order} userId={user?.id}
        onDone={async () => { setAdvOpen(false); await load(); }} />
      <CancelOrderDialog open={cancelOpen} onOpenChange={setCancelOpen} order={order} items={items} advanceTotal={advanceTotal}
        userId={user?.id} onDone={async () => { setCancelOpen(false); await load(); }} />
    </AppLayout>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-medium text-destructive" : "font-medium"}>{value}</span>
    </div>
  );
}

function IssueDialog({ item, onOpenChange, onDone, userId }: {
  item: any; onOpenChange: (v: boolean) => void; onDone: () => void; userId?: string;
}) {
  const { karigars, refresh } = useKarigars();
  const [karigarId, setKarigarId] = useState<string | null>(null);
  const [karigarName, setKarigarName] = useState("");
  const [gross, setGross] = useState(0);
  const [stone, setStone] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setKarigarId(item.karigar_id ?? null);
    setKarigarName(item.karigar_name ?? "");
    setGross(Number(item.expected_gross_weight ?? 0));
    setStone(Number(item.expected_stone_weight ?? 0));
    setNote("");
  }, [item]);

  const net = computeNetWeight(gross, stone);

  async function save() {
    if (!karigarId && !karigarName.trim()) return toast.error("Select a karigar");
    setSaving(true);
    try {
      const { error } = await supabase.from("order_items").update({
        karigar_id: karigarId, karigar_name: karigarName || null,
        issued_at: new Date().toISOString(),
        issued_metal: item.metal, issued_purity: item.purity,
        issued_gross_weight: gross, issued_net_weight: net,
        status: "in_progress" as any,
      }).eq("id", item.id);
      if (error) throw error;
      await logOrderItemStatus({
        order_item_id: item.id, status: "in_progress", karigar_id: karigarId, karigar_name: karigarName,
        gross_weight: gross, net_weight: net, note: note || "Metal issued to karigar", changed_by: userId,
      });
      toast.success("Metal issued");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Issue metal to karigar</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Karigar *</Label>
            <KarigarSelect karigars={karigars} value={karigarId} valueName={karigarName}
              onChange={(id, name) => { setKarigarId(id); setKarigarName(name); }} onKarigarCreated={refresh} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Gross wt issued (g)</Label><NumberField decimals={3} value={gross} onChange={setGross} /></div>
            <div><Label>Stone wt (g)</Label><NumberField decimals={3} value={stone} onChange={setStone} /></div>
          </div>
          <p className="text-xs text-muted-foreground">
            Net issued: <strong>{net.toFixed(3)} g</strong> · fine {computeFineWeight(net, item?.purity ?? "").toFixed(3)} g
          </p>
          <div><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Issue"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ item, onOpenChange, onDone, userId }: {
  item: any; onOpenChange: (v: boolean) => void; onDone: () => void; userId?: string;
}) {
  const [gross, setGross] = useState(0);
  const [stone, setStone] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setGross(Number(item.issued_gross_weight ?? item.expected_gross_weight ?? 0));
    setStone(Number(item.expected_stone_weight ?? 0));
    setNote("");
  }, [item]);

  const net = computeNetWeight(gross, stone);
  const loss = item?.issued_net_weight != null ? round2(Number(item.issued_net_weight) - net) : null;

  async function save() {
    if (gross <= 0) return toast.error("Enter the received gross weight");
    setSaving(true);
    try {
      const { error } = await supabase.from("order_items").update({
        received_at: new Date().toISOString(),
        received_gross_weight: gross, received_stone_weight: stone, received_net_weight: net,
        status: "received" as any,
      }).eq("id", item.id);
      if (error) throw error;
      await logOrderItemStatus({
        order_item_id: item.id, status: "received", karigar_id: item.karigar_id, karigar_name: item.karigar_name,
        gross_weight: gross, stone_weight: stone, net_weight: net,
        note: note || (loss ? `Weight difference ${loss > 0 ? "-" : "+"}${Math.abs(loss).toFixed(3)} g` : "Received from karigar"),
        changed_by: userId,
      });
      toast.success("Item received");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Receive from karigar</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Gross wt received (g)</Label><NumberField decimals={3} value={gross} onChange={setGross} /></div>
            <div><Label>Stone wt (g)</Label><NumberField decimals={3} value={stone} onChange={setStone} /></div>
          </div>
          <p className="text-xs text-muted-foreground">
            Net received: <strong>{net.toFixed(3)} g</strong>
            {loss != null && Math.abs(loss) > 0.0005 && (
              <span className={loss > 0 ? " text-destructive" : " text-emerald-600"}>
                {" "}· {loss > 0 ? "loss" : "gain"} {Math.abs(loss).toFixed(3)} g vs issued
              </span>
            )}
          </p>
          <div><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Receive"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToStockDialog({ item, onOpenChange, onDone, userId }: {
  item: any; onOpenChange: (v: boolean) => void; onDone: () => void; userId?: string;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [locs, setLocs] = useState<any[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(item.description ?? "");
    setCategoryId(item.category_id ?? null);
    setLocationId(null);
    setFiles([]);
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCats(data ?? []));
    supabase.from("locations").select("id, name").order("name").then(({ data }) => setLocs(data ?? []));
  }, [item]);

  async function save() {
    if (!name.trim()) return toast.error("Item name required");
    setSaving(true);
    try {
      let sku = `JM-${Date.now().toString().slice(-8)}`;
      if (categoryId) {
        const { data: skuData } = await supabase.rpc("next_category_sku", { _category_id: categoryId });
        if (skuData) sku = skuData as string;
      }
      const image_urls: string[] = [];
      for (const f of files) image_urls.push(await uploadImage("product-images", f, "orders/"));

      const gross = Number(item.received_gross_weight ?? item.expected_gross_weight ?? 0);
      const stone = Number(item.received_stone_weight ?? item.expected_stone_weight ?? 0);
      const net = computeNetWeight(gross, stone);

      const { data: created, error } = await supabase.from("inventory_items").insert({
        sku, qr_code: `JM-QR-${crypto.randomUUID().slice(0, 12).toUpperCase()}`, barcode: sku,
        name: name.trim(), description: `Custom order ${item.description}`,
        category_id: categoryId, location_id: locationId,
        metal: item.metal, purity: item.purity,
        gross_weight: gross, stone_weight: stone, net_weight: net,
        fine_weight: computeFineWeight(net, item.purity ?? ""),
        making_charge: Number(item.making_input ?? 0), making_charge_type: item.making_type ?? "per_gram",
        wastage_type: item.wastage_type ?? "percentage", wastage_value: Number(item.wastage_input ?? 0),
        stone_value: Number(item.stone_value ?? 0),
        image_urls, status: "reserved" as any,
        received_from: item.karigar_name ?? null, received_at: item.received_at ?? new Date().toISOString(),
        created_by: userId,
      } as any).select().single();
      if (error) throw error;

      const estimated_amount = estimateOrderLine({
        quantity: item.quantity, expected_net_weight: net, rate: item.rate,
        making_input: item.making_input, making_type: item.making_type,
        wastage_input: item.wastage_input, wastage_type: item.wastage_type, stone_value: item.stone_value,
      });

      const { error: uErr } = await supabase.from("order_items").update({
        inventory_item_id: created.id, status: "in_stock" as any, estimated_amount,
      }).eq("id", item.id);
      if (uErr) throw uErr;

      await logOrderItemStatus({
        order_item_id: item.id, status: "in_stock", net_weight: net,
        note: `Added to inventory as ${sku} (reserved for this order)`, changed_by: userId,
      });
      toast.success(`Added to inventory as ${sku}`);
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add finished item to inventory</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Item name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category (SKU prefix)</Label>
              <Select value={categoryId ?? "none"} onValueChange={(v) => setCategoryId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select value={locationId ?? "none"} onValueChange={(v) => setLocationId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {locs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ImageCaptureButton onCapture={(f) => setFiles((a) => [...a, f])} />
            <span className="text-xs text-muted-foreground">{files.length} photo(s)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            The item is created with status <strong>reserved</strong> so it cannot be sold to anyone else before this order is billed.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Add to inventory"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceDialog({ open, onOpenChange, order, onDone, userId }: {
  open: boolean; onOpenChange: (v: boolean) => void; order: any; onDone: () => void; userId?: string;
}) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setAmount(0); setMethod("cash"); setReference(""); } }, [open]);

  async function save() {
    if (amount <= 0) return toast.error("Enter an amount");
    setSaving(true);
    try {
      const { error } = await supabase.from("payments").insert({
        order_id: order.id, customer_id: order.customer_id, amount: round2(amount),
        method: method as any, reference: reference || null,
        notes: `Advance for order ${order.order_no}`, created_by: userId,
      } as any);
      if (error) throw error;
      const { data: pays } = await supabase.from("payments").select("amount").eq("order_id", order.id);
      const total = round2((pays ?? []).reduce((a: number, p: any) => a + Number(p.amount ?? 0), 0));
      await supabase.from("orders").update({ advance_paid: total }).eq("id", order.id);
      toast.success("Advance recorded");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record advance</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Amount *</Label><NumberField value={amount} onChange={setAmount} className="text-right" /></div>
          <div>
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelOrderDialog({ open, onOpenChange, order, items, advanceTotal, onDone, userId }: {
  open: boolean; onOpenChange: (v: boolean) => void; order: any; items: any[];
  advanceTotal: number; onDone: () => void; userId?: string;
}) {
  const [reason, setReason] = useState("");
  const [advanceAction, setAdvanceAction] = useState("refund");
  const [stockAction, setStockAction] = useState("release");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setReason(""); setAdvanceAction(advanceTotal > 0 ? "refund" : "none"); setStockAction("release"); } }, [open, advanceTotal]);

  const produced = items.filter((i) => i.inventory_item_id);

  async function save() {
    if (!reason.trim()) return toast.error("Enter a reason");
    setSaving(true);
    try {
      await supabase.from("orders").update({
        status: "cancelled" as any, cancelled_at: new Date().toISOString(), cancel_reason: reason.trim(),
      }).eq("id", order.id);

      const live = items.filter((i) => i.status !== "billed" && i.status !== "cancelled");
      if (live.length) {
        await supabase.from("order_items").update({ status: "cancelled" as any }).in("id", live.map((i) => i.id));
        await Promise.all(live.map((i) => logOrderItemStatus({
          order_item_id: i.id, status: "cancelled", note: `Order cancelled: ${reason.trim()}`, changed_by: userId,
        })));
      }

      if (produced.length) {
        const ids = produced.map((i) => i.inventory_item_id);
        await supabase.from("inventory_items")
          .update({ status: (stockAction === "release" ? "in_stock" : "melted") as any })
          .in("id", ids);
      }

      if (advanceAction === "refund" && advanceTotal > 0) {
        await supabase.from("payments").insert({
          order_id: order.id, customer_id: order.customer_id, amount: -advanceTotal,
          method: "cash" as any, notes: `Advance refunded — order ${order.order_no} cancelled`, created_by: userId,
        } as any);
        await supabase.from("orders").update({ advance_paid: 0 }).eq("id", order.id);
      }

      toast.success("Order cancelled");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel order {order?.order_no}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Reason *</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          {advanceTotal > 0 && (
            <div>
              <Label>Advance of {npr(advanceTotal)}</Label>
              <Select value={advanceAction} onValueChange={setAdvanceAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="refund">Refund to customer</SelectItem>
                  <SelectItem value="forfeit">Forfeit (keep as income)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {produced.length > 0 && (
            <div>
              <Label>{produced.length} finished item(s) already in stock</Label>
              <Select value={stockAction} onValueChange={setStockAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="release">Release to normal inventory</SelectItem>
                  <SelectItem value="melt">Mark as melted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep order</Button>
          <Button variant="destructive" onClick={save} disabled={saving}>{saving ? "Cancelling..." : "Cancel order"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function printAdvanceReceipt(order: any, advances: any[], total: number) {
  const rows = advances.map((p) => `
    <tr>
      <td style="padding:4px 0">${new Date(p.paid_at).toLocaleDateString()}</td>
      <td style="text-transform:capitalize">${String(p.method).replace("_", " ")}</td>
      <td>${p.reference ?? ""}</td>
      <td style="text-align:right">${npr(p.amount)}</td>
    </tr>`).join("");
  openPrintPreview({
    title: `Advance Receipt ${order.order_no}`,
    fileName: `Advance-${order.order_no}`,
    page: "a4",
    css: "body{font-family:system-ui,sans-serif;color:#111} table{width:100%;border-collapse:collapse;font-size:13px} th{text-align:left;border-bottom:1px solid #999;padding-bottom:4px}",
    html: `
      <h2 style="margin:0 0 4px">Order Advance Receipt</h2>
      <div style="font-size:13px;margin-bottom:12px">
        Order <strong>${order.order_no}</strong> · Order date ${order.order_date}<br/>
        Customer: <strong>${order.customers?.full_name ?? ""}</strong> ${order.customers?.phone ?? ""}<br/>
        ${order.promised_date ? `Promised delivery: ${order.promised_date}` : ""}
      </div>
      <table>
        <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:10px;text-align:right;font-size:14px"><strong>Total advance: ${npr(total)}</strong></div>
      <div style="margin-top:6px;font-size:12px;color:#555">Estimated order value: ${npr(order.estimated_total)} · Balance on delivery: ${npr(Math.max(0, Number(order.estimated_total ?? 0) - total))}</div>
      <p style="margin-top:24px;font-size:11px;color:#666">Final price is confirmed on delivery using the agreed rate basis and actual finished weight.</p>
    `,
  });
}
