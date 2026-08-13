import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
import { Hammer, PackageCheck, Printer, Receipt, Plus, X, Coins, Pencil, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { npr, gms, computeNetWeight, round2, computeFineWeight } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { KarigarSelect, useKarigars } from "@/components/KarigarSelect";
import { ImageCaptureButton } from "@/components/ImageCapture";
import { uploadImage } from "@/lib/storage";
import { printDocument } from "@/components/PrintDocument";
import { OrderPrintDocument } from "@/components/orders/OrderPrintDocument";
import { printOldMetalReceipt } from "@/lib/oldMetalReceipt";
import { OldGoldForm, OldGoldSaveResult } from "@/components/OldGoldForm";
import { PickedCustomer } from "@/components/CustomerSelector";
import {
  OrderLineFields, OrderLine, lineFromRow, lineNet, lineEstimate,
} from "@/components/orders/OrderLineFields";
import {
  ORDER_ITEM_LABEL, ORDER_ITEM_COLOR, ORDER_STATUS_LABEL,
  estimateOrderLine, logOrderItemStatus, syncOrderStatus, recalcOrderItem, lineProgress, progressLabel,
  fetchRateOn, receivedQuantity, saveLinePhotos, cancelOrderLine, deleteOrderLine,
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
  const [editingItem, setEditingItem] = useState<any>(null);
  const [removeTarget, setRemoveTarget] = useState<{ item: any; batches: any[] } | null>(null);
  const [editOrderOpen, setEditOrderOpen] = useState(false);
  const [confirmPrint, setConfirmPrint] = useState<"order" | "advance" | null>(null);
  const loc = useLocation();

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

  useEffect(() => {
    if (order && (loc.state as any)?.justCreated) {
      setConfirmPrint("order");
      window.history.replaceState({}, "");
    }
  }, [order]);

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
  const orderDocId = `order-print-${order.id}`;
  const advanceDocId = `order-advance-print-${order.id}`;

  return (
    <AppLayout title={`Order ${order.order_no}`} actions={
      <div className="flex gap-2">
        {canManage && !["completed", "cancelled"].includes(order.status) && (
          <Button size="sm" variant="outline" onClick={() => setEditOrderOpen(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit order
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => printDocument(orderDocId, `Order ${order.order_no}`, `Order-${order.order_no}`)}>
          <FileText className="mr-1 h-4 w-4" /> Order receipt
        </Button>
        <Button size="sm" variant="outline" onClick={() => printDocument(advanceDocId, `Advance ${order.order_no}`, `Advance-${order.order_no}`)}>
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
                  const p = lineProgress(it);
                  const batches = receipts.filter((r) => r.order_item_id === it.id);
                  const receivedNet = round2(batches.reduce((a, r) => a + Number(r.received_net_weight ?? 0), 0));
                  const loss = it.issued_net_weight != null && receivedNet > 0
                    ? round2(Number(it.issued_net_weight) - receivedNet) : null;
                  const active = it.status !== "billed" && it.status !== "cancelled";
                  return (
                    <Fragment key={it.id}>
                    <TableRow>

                      <TableCell>
                        <div className="font-medium">{it.description}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {it.metal} {it.purity}{it.categories?.name ? ` · ${it.categories.name}` : ""}
                          {` · qty ${p.quantity}`}
                        </div>
                        {progressLabel(it) && (
                          <div className="text-xs text-muted-foreground">{progressLabel(it)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{it.karigar_name ?? "-"}</TableCell>
                      <TableCell className="text-right">{gms(it.expected_net_weight)}</TableCell>
                      <TableCell className="text-right text-xs">
                        {it.issued_net_weight != null ? `${gms(it.issued_net_weight)} out` : "—"}
                        <br />
                        {receivedNet > 0 ? `${gms(receivedNet)} in` : "—"}
                        {loss != null && Math.abs(loss) > 0.0005 && p.outstanding === 0 && (
                          <div className={loss > 0 ? "text-destructive" : "text-emerald-600"}>
                            {loss > 0 ? "loss" : "gain"} {gms(Math.abs(loss))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{npr(it.estimated_amount)}</TableCell>
                      <TableCell><Badge variant="secondary" className={ORDER_ITEM_COLOR[it.status]}>{ORDER_ITEM_LABEL[it.status]}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {canManage && active && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => setEditingItem(it)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {p.outstanding > 0 && (
                              <Button size="sm" variant="outline" onClick={() => setIssueFor(it)}>
                                <Hammer className="mr-1 h-3.5 w-3.5" /> {it.issued_at ? "Re-issue" : "Issue"}
                              </Button>
                            )}
                            {p.outstanding > 0 && it.issued_at && (
                              <Button size="sm" variant="outline" onClick={() => setReceiveFor(it)}>
                                Receive{p.quantity > 1 ? ` (${p.outstanding} left)` : ""}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setRemoveTarget({ item: it, batches })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    {batches.map((r) => (
                      <TableRow key={r.id} className="bg-muted/30">
                        <TableCell className="pl-6 text-xs">
                          Batch {r.batch_no} · {r.quantity} pc{r.quantity > 1 ? "s" : ""}
                          {r.inventory_items?.sku ? ` · ${r.inventory_items.sku}` : ""}
                          {r.invoices?.invoice_number ? ` · ${r.invoices.invoice_number}` : ""}
                        </TableCell>
                        <TableCell className="text-xs">{r.karigar_name ?? "-"}</TableCell>
                        <TableCell className="text-right text-xs">{new Date(r.received_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right text-xs">{gms(r.received_net_weight)} in</TableCell>
                        <TableCell />
                        <TableCell>
                          <Badge variant="secondary" className={ORDER_ITEM_COLOR[r.status] ?? ""}>{ORDER_ITEM_LABEL[r.status] ?? r.status}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {canManage && !r.inventory_item_id && r.status !== "cancelled" && (
                            <Button size="sm" onClick={() => setStockFor({ item: it, receipt: r })}>
                              <PackageCheck className="mr-1 h-3.5 w-3.5" /> Add to stock
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    </Fragment>
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
      <ToStockDialog target={stockFor} onOpenChange={(v) => !v && setStockFor(null)} userId={user?.id} onDone={async () => { setStockFor(null); await refresh(); }} />
      <AdvanceDialog open={advOpen} onOpenChange={setAdvOpen} order={order} userId={user?.id}
        onDone={async () => { setAdvOpen(false); await load(); setConfirmPrint("advance"); }} />
      <CancelOrderDialog open={cancelOpen} onOpenChange={setCancelOpen} order={order} items={items} receipts={receipts} advanceTotal={advanceTotal}
        userId={user?.id} onDone={async () => { setCancelOpen(false); await load(); }} />
      <EditLineDialog item={editingItem} onOpenChange={(v) => !v && setEditingItem(null)} userId={user?.id}
        onDone={async () => { setEditingItem(null); await refresh(); }} />
      <RemoveLineDialog target={removeTarget} onOpenChange={(v) => !v && setRemoveTarget(null)} userId={user?.id}
        onDone={async () => { setRemoveTarget(null); await refresh(); }} />
      <EditOrderDialog open={editOrderOpen} onOpenChange={setEditOrderOpen} order={order}
        onDone={async () => { setEditOrderOpen(false); await load(); }} />

      <OrderPrintDocument mode="order" order={order} items={items} advances={advances} cashierName={user?.email ?? ""} domId={orderDocId} />
      <OrderPrintDocument mode="advance" order={order} items={items} advances={advances} cashierName={user?.email ?? ""} domId={advanceDocId} />

      <Dialog open={!!confirmPrint} onOpenChange={(v) => !v && setConfirmPrint(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Print {confirmPrint === "order" ? "order receipt" : "advance receipt"} now?</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPrint(null)}>Not now</Button>
            <Button onClick={() => {
              if (confirmPrint === "order") printDocument(orderDocId, `Order ${order.order_no}`, `Order-${order.order_no}`);
              else printDocument(advanceDocId, `Advance ${order.order_no}`, `Advance-${order.order_no}`);
              setConfirmPrint(null);
            }}>Print now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [qty, setQty] = useState(1);
  const [gross, setGross] = useState(0);
  const [stone, setStone] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const prog = item ? lineProgress(item) : null;
  const outstanding = prog?.outstanding ?? 0;

  useEffect(() => {
    if (!item) return;
    const p = lineProgress(item);
    setQty(Math.max(1, p.outstanding));
    const perPiece = Number(item.expected_gross_weight ?? 0) / Math.max(1, p.quantity);
    setGross(round2(perPiece * Math.max(1, p.outstanding)) || Number(item.issued_gross_weight ?? 0));
    setStone(Number(item.expected_stone_weight ?? 0) / Math.max(1, p.quantity) * Math.max(1, p.outstanding));
    setNote("");
  }, [item]);

  const net = computeNetWeight(gross, stone);

  async function save() {
    if (gross <= 0) return toast.error("Enter the received gross weight");
    if (qty < 1 || qty > outstanding) return toast.error(`Quantity must be between 1 and ${outstanding}`);
    setSaving(true);
    try {
      const { count } = await supabase.from("order_item_receipts")
        .select("id", { count: "exact", head: true }).eq("order_item_id", item.id);
      const { error } = await supabase.from("order_item_receipts").insert({
        order_item_id: item.id,
        batch_no: (count ?? 0) + 1,
        quantity: qty,
        karigar_id: item.karigar_id ?? null, karigar_name: item.karigar_name ?? null,
        received_at: new Date().toISOString(),
        received_gross_weight: gross, received_stone_weight: stone, received_net_weight: net,
        status: "received",
        note: note || null,
        created_by: userId ?? null,
      } as any);
      if (error) throw error;

      // keep the legacy roll-up columns in sync for reporting
      const { data: all } = await supabase.from("order_item_receipts")
        .select("received_gross_weight, received_stone_weight, received_net_weight").eq("order_item_id", item.id);
      const sum = (k: string) => round2((all ?? []).reduce((a: number, r: any) => a + Number(r[k] ?? 0), 0));
      await supabase.from("order_items").update({
        received_at: new Date().toISOString(),
        received_gross_weight: sum("received_gross_weight"),
        received_stone_weight: sum("received_stone_weight"),
        received_net_weight: sum("received_net_weight"),
      }).eq("id", item.id);

      await recalcOrderItem(item.id);
      await logOrderItemStatus({
        order_item_id: item.id, status: "received", karigar_id: item.karigar_id, karigar_name: item.karigar_name,
        gross_weight: gross, stone_weight: stone, net_weight: net,
        note: note || `Received ${qty} of ${prog?.quantity ?? 1} pc(s) from karigar`,
        changed_by: userId,
      });
      toast.success(`Received ${qty} piece(s)`);
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Receive from karigar</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {prog && prog.quantity > 1 && (
            <p className="text-xs text-muted-foreground">
              {prog.received} of {prog.quantity} already received · {outstanding} still with the karigar.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Qty in this batch</Label><NumberField decimals={0} value={qty} onChange={setQty} /></div>
            <div><Label>Gross wt (g)</Label><NumberField decimals={3} value={gross} onChange={setGross} /></div>
            <div><Label>Stone wt (g)</Label><NumberField decimals={3} value={stone} onChange={setStone} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Net received in this batch: <strong>{net.toFixed(3)} g</strong></p>
          <div><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Receive batch"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ToStockDialog({ target, onOpenChange, onDone, userId }: {
  target: { item: any; receipt: any } | null; onOpenChange: (v: boolean) => void; onDone: () => void; userId?: string;
}) {
  const item = target?.item;
  const receipt = target?.receipt;
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

      const gross = Number(receipt.received_gross_weight ?? 0);
      const stone = Number(receipt.received_stone_weight ?? 0);
      const net = computeNetWeight(gross, stone);

      const { data: created, error } = await supabase.from("inventory_items").insert({
        sku, qr_code: `JM-QR-${crypto.randomUUID().slice(0, 12).toUpperCase()}`, barcode: sku,
        name: name.trim(), description: `Custom order ${item.description} (batch ${receipt.batch_no})`,
        category_id: categoryId, location_id: locationId,
        metal: item.metal, purity: item.purity,
        gross_weight: gross, stone_weight: stone, net_weight: net,
        fine_weight: computeFineWeight(net, item.purity ?? ""),
        making_charge: Number(item.making_input ?? 0), making_charge_type: item.making_type ?? "per_gram",
        wastage_type: item.wastage_type ?? "percentage", wastage_value: Number(item.wastage_input ?? 0),
        stone_value: Number(item.stone_value ?? 0),
        image_urls, status: "reserved" as any,
        received_from: receipt.karigar_name ?? item.karigar_name ?? null,
        received_at: receipt.received_at ?? new Date().toISOString(),
        created_by: userId,
      } as any).select().single();
      if (error) throw error;

      const { error: rErr } = await supabase.from("order_item_receipts").update({
        inventory_item_id: created.id, status: "in_stock",
      } as any).eq("id", receipt.id);
      if (rErr) throw rErr;

      // keep the line estimate aligned with actual received weights
      const { data: all } = await supabase.from("order_item_receipts")
        .select("quantity, received_net_weight").eq("order_item_id", item.id);
      const rows = (all ?? []) as any[];
      const recQty = rows.reduce((a, r) => a + Number(r.quantity ?? 0), 0);
      const recNet = rows.reduce((a, r) => a + Number(r.received_net_weight ?? 0), 0);
      const qty = Math.max(1, Number(item.quantity ?? 1));
      const perPieceNet = recQty ? recNet / recQty : Number(item.expected_net_weight ?? 0);
      const estimated_amount = estimateOrderLine({
        quantity: qty, expected_net_weight: round2(perPieceNet * qty), rate: item.rate,
        making_input: item.making_input, making_type: item.making_type,
        wastage_input: item.wastage_input, wastage_type: item.wastage_type, stone_value: item.stone_value,
      });
      await supabase.from("order_items").update({
        inventory_item_id: item.inventory_item_id ?? created.id, estimated_amount,
      }).eq("id", item.id);
      await recalcOrderItem(item.id);

      await logOrderItemStatus({
        order_item_id: item.id, status: "in_stock", net_weight: net,
        note: `Batch ${receipt.batch_no} (${receipt.quantity} pc) added to inventory as ${sku} (reserved)`,
        changed_by: userId,
      });
      toast.success(`Added to inventory as ${sku}`);
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>

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

  async function recordPayment(amt: number, m: string, ref: string | null) {
    const { error } = await supabase.from("payments").insert({
      order_id: order.id, customer_id: order.customer_id, amount: round2(amt),
      method: m as any, reference: ref,
      notes: `Advance for order ${order.order_no}`, created_by: userId,
    } as any);
    if (error) throw error;
    const { data: pays } = await supabase.from("payments").select("amount").eq("order_id", order.id);
    const total = round2((pays ?? []).reduce((a: number, p: any) => a + Number(p.amount ?? 0), 0));
    await supabase.from("orders").update({ advance_paid: total }).eq("id", order.id);
  }

  async function save() {
    if (amount <= 0) return toast.error("Enter an amount");
    setSaving(true);
    try {
      await recordPayment(amount, method, reference || null);
      toast.success("Advance recorded");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function onOldMetalSaved(result: OldGoldSaveResult) {
    try {
      await recordPayment(result.total, "old_gold", result.receiptNumber);
      toast.success("Old metal advance recorded");
      if (window.confirm("Print the old metal purchase receipt now?")) {
        await printOldMetalReceipt(result.id, `Advance on order ${order.order_no}`);
      }
      onDone();
    } catch (e: any) { toast.error(e.message); }
  }

  if (method === "old_gold") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Old metal trade-in as advance</DialogTitle></DialogHeader>
          <Button size="sm" variant="ghost" className="w-fit" onClick={() => setMethod("cash")}>&larr; Use cash/bank instead</Button>
          <OldGoldForm compact submitLabel="Record & Apply as Advance"
            initialCustomer={order?.customers ? { id: order.customer_id, full_name: order.customers.full_name, phone: order.customers.phone ?? null } : null}
            onSaved={onOldMetalSaved} />
        </DialogContent>
      </Dialog>
    );
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
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
                <SelectItem value="old_gold">Old metal trade-in</SelectItem>
              </SelectContent>
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

function CancelOrderDialog({ open, onOpenChange, order, items, receipts, advanceTotal, onDone, userId }: {
  open: boolean; onOpenChange: (v: boolean) => void; order: any; items: any[]; receipts: any[];
  advanceTotal: number; onDone: () => void; userId?: string;

}) {
  const [reason, setReason] = useState("");
  const [advanceAction, setAdvanceAction] = useState("refund");
  const [stockAction, setStockAction] = useState("release");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setReason(""); setAdvanceAction(advanceTotal > 0 ? "refund" : "none"); setStockAction("release"); } }, [open, advanceTotal]);

  const produced = (receipts ?? []).filter((r) => r.inventory_item_id && r.status !== "billed");

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
        const ids = produced.map((r) => r.inventory_item_id);
        await supabase.from("inventory_items")
          .update({ status: (stockAction === "release" ? "in_stock" : "melted") as any })
          .in("id", ids);
        await supabase.from("order_item_receipts").update({ status: "cancelled" } as any)
          .in("id", produced.map((r) => r.id));
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

/** Edit an existing order line (details, karigar, photos). */
function EditLineDialog({ item, onOpenChange, onDone, userId }: {
  item: any; onOpenChange: (v: boolean) => void; onDone: () => void; userId?: string;
}) {
  const { karigars, refresh } = useKarigars();
  const [line, setLine] = useState<OrderLine | null>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [minQty, setMinQty] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return setLine(null);
    setLine(lineFromRow(item));
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCats(data ?? []));
    receivedQuantity(item.id).then((q) => setMinQty(Math.max(1, q)));
  }, [item?.id]);

  async function pullRate() {
    if (!line) return;
    const r = await fetchRateOn(line.metal, line.purity, line.rate_date ?? new Date().toISOString().slice(0, 10));
    if (!r.rate) return toast.warning("No saved rate found for that metal/purity");
    setLine({ ...line, rate: r.rate, rate_date: r.effective_date });
  }

  async function save() {
    if (!line || !item) return;
    if (!line.description.trim()) return toast.error("Description required");
    setSaving(true);
    try {
      const net = lineNet(line);
      const photos = await saveLinePhotos(line.photos, line.newFiles);
      const karigarChanged = (line.karigar_id ?? null) !== (item.karigar_id ?? null);
      const { error } = await supabase.from("order_items").update({
        description: line.description.trim(), notes: line.notes?.trim() || null,
        category_id: line.category_id, metal: line.metal as any, purity: line.purity,
        quantity: Math.max(minQty, Number(line.quantity || 1)),
        expected_gross_weight: Number(line.expected_gross_weight || 0),
        expected_stone_weight: Number(line.expected_stone_weight || 0),
        expected_net_weight: net,
        rate: Number(line.rate || 0), rate_date: line.rate_date,
        making_input: Number(line.making_input || 0), making_type: line.making_type,
        wastage_input: Number(line.wastage_input || 0), wastage_type: line.wastage_type as any,
        stone_value: Number(line.stone_value || 0),
        estimated_amount: lineEstimate(line),
        photos,
        karigar_id: line.karigar_id, karigar_name: line.karigar_name || null,
      }).eq("id", item.id);
      if (error) throw error;
      await logOrderItemStatus({
        order_item_id: item.id, status: item.status,
        karigar_id: line.karigar_id, karigar_name: line.karigar_name,
        note: karigarChanged
          ? `Item updated · karigar set to ${line.karigar_name || "unassigned"}`
          : "Item details updated",
        changed_by: userId,
      });
      toast.success("Item updated");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Edit order item</DialogTitle></DialogHeader>
        {line && (
          <OrderLineFields line={line} patch={(p) => setLine({ ...line, ...p })}
            cats={cats} karigars={karigars} onKarigarCreated={refresh}
            onFetchRate={pullRate} minQuantity={minQty} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Remove (or cancel) a single order line. */
function RemoveLineDialog({ target, onOpenChange, onDone, userId }: {
  target: { item: any; batches: any[] } | null; onOpenChange: (v: boolean) => void; onDone: () => void; userId?: string;
}) {
  const [reason, setReason] = useState("");
  const [stockAction, setStockAction] = useState("release");
  const [saving, setSaving] = useState(false);
  const batches = target?.batches ?? [];
  const clean = batches.length === 0;
  const produced = batches.filter((r) => r.inventory_item_id && r.status !== "billed");

  useEffect(() => { if (target) { setReason(""); setStockAction("release"); } }, [target]);

  async function save() {
    if (!target) return;
    if (!clean && !reason.trim()) return toast.error("Enter a reason");
    setSaving(true);
    try {
      if (clean) await deleteOrderLine(target.item.id, target.item.order_id);
      else await cancelOrderLine({
        orderItemId: target.item.id, orderId: target.item.order_id,
        reason: reason.trim(), stockAction: stockAction as any, userId,
      });
      toast.success(clean ? "Item removed from order" : "Item cancelled");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{clean ? "Remove item from order" : "Cancel this order item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{target?.item?.description}</p>
          {clean ? (
            <p>Nothing has been received against this item, so it will be deleted from the order entirely.</p>
          ) : (
            <>
              <p>Production has already started, so the item is cancelled rather than deleted and stays in the order history.</p>
              <div><Label>Reason *</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              {produced.length > 0 && (
                <div>
                  <Label>{produced.length} finished piece(s) already in stock</Label>
                  <Select value={stockAction} onValueChange={setStockAction}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="release">Release to normal inventory</SelectItem>
                      <SelectItem value="melt">Mark as melted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep item</Button>
          <Button variant="destructive" onClick={save} disabled={saving}>
            {saving ? "Working..." : clean ? "Remove item" : "Cancel item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Edit order header details. */
function EditOrderDialog({ open, onOpenChange, order, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; order: any; onDone: () => void;
}) {
  const [orderDate, setOrderDate] = useState("");
  const [promised, setPromised] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setOrderDate(order.order_date ?? ""); setPromised(order.promised_date ?? ""); setNotes(order.notes ?? "");
  }, [open, order]);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("orders").update({
        order_date: orderDate, promised_date: promised || null, notes: notes || null,
      }).eq("id", order.id);
      if (error) throw error;
      toast.success("Order updated");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit order details</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Order date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
            <div><Label>Promised delivery</Label><Input type="date" value={promised} onChange={(e) => setPromised(e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

