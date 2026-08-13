import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NumberField } from "@/components/ui/number-field";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { npr, computeNetWeight, round2 } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { CustomerSelector, PickedCustomer } from "@/components/CustomerSelector";
import { KarigarSelect, useKarigars } from "@/components/KarigarSelect";
import { PuritySelect } from "@/components/PuritySelect";
import {
  ORDER_STATUS_LABEL, ORDER_ITEM_LABEL, ORDER_ITEM_COLOR,
  estimateOrderLine, fetchRateOn, nextOrderNo, todayISO, logOrderItemStatus,
} from "@/lib/orders";

const METALS = ["gold", "silver"];

function blankLine() {
  return {
    key: crypto.randomUUID(),
    description: "",
    category_id: null as string | null,
    metal: "gold",
    purity: "22K",
    quantity: 1,
    expected_gross_weight: 0,
    expected_stone_weight: 0,
    rate: 0,
    rate_date: todayISO(),
    making_input: 0,
    making_type: "per_gram",
    wastage_input: 0,
    wastage_type: "percentage",
    stone_value: 0,
    karigar_id: null as string | null,
    karigar_name: "",
  };
}

export default function Orders() {
  const [list, setList] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { hasPermission } = usePermission();
  const nav = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    const { data, error } = await supabase
      .from("orders")
      .select("*, customers(full_name, phone), order_items(id, description, status, estimated_amount)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setList(data ?? []);
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return list.filter((o) => {
      if (statusFilter === "active" && (o.status === "completed" || o.status === "cancelled")) return false;
      if (statusFilter !== "active" && statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!s) return true;
      return `${o.order_no} ${o.customers?.full_name ?? ""} ${o.customers?.phone ?? ""}`.toLowerCase().includes(s);
    });
  }, [list, statusFilter, search]);

  return (
    <AppLayout
      title="Orders"
      actions={hasPermission("order_manage") ? (
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New Order</Button>
      ) : null}
    >
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Search order no, customer, phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active orders</SelectItem>
                <SelectItem value="all">All</SelectItem>
                {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader><TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order date</TableHead>
              <TableHead>Promised</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Estimate</TableHead>
              <TableHead className="text-right">Advance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <ClipboardList className="mx-auto mb-2 h-6 w-6" /> No orders
                </TableCell></TableRow>
              ) : filtered.map((o) => {
                const overdue = o.promised_date && new Date(o.promised_date) < new Date() && !["completed", "cancelled"].includes(o.status);
                return (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => nav(`/orders/${o.id}`)}>
                    <TableCell className="font-medium">{o.order_no}</TableCell>
                    <TableCell>{o.customers?.full_name ?? "-"}</TableCell>
                    <TableCell>{o.order_date}</TableCell>
                    <TableCell className={overdue ? "text-destructive font-medium" : ""}>{o.promised_date ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(o.order_items ?? []).slice(0, 3).map((it: any) => (
                          <Badge key={it.id} variant="secondary" className={ORDER_ITEM_COLOR[it.status]}>{ORDER_ITEM_LABEL[it.status]}</Badge>
                        ))}
                        {(o.order_items ?? []).length > 3 && <span className="text-xs text-muted-foreground">+{o.order_items.length - 3}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{npr(o.estimated_total)}</TableCell>
                    <TableCell className="text-right">{npr(o.advance_paid)}</TableCell>
                    <TableCell><Badge variant="outline">{ORDER_STATUS_LABEL[o.status] ?? o.status}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NewOrderDialog open={open} onOpenChange={setOpen} onSaved={(id) => { setOpen(false); load(); nav(`/orders/${id}`); }} />
    </AppLayout>
  );
}

export function NewOrderDialog({ open, onOpenChange, onSaved, initialCustomer }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: (orderId: string) => void;
  initialCustomer?: PickedCustomer | null;
}) {
  const { user } = useAuth();
  const { karigars, refresh } = useKarigars();
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer ?? null);
  const [orderDate, setOrderDate] = useState(todayISO());
  const [promised, setPromised] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([blankOrderLine(todayISO())]);
  const [cats, setCats] = useState<any[]>([]);
  const [advance, setAdvance] = useState(0);
  const [advanceMethod, setAdvanceMethod] = useState("cash");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomer(initialCustomer ?? null);
    setOrderDate(todayISO()); setPromised(""); setNotes("");
    setLines([blankOrderLine(todayISO())]); setAdvance(0); setAdvanceMethod("cash");
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCats(data ?? []));
  }, [open]);

  function patch(key: string, p: Partial<OrderLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  }

  async function pullRate(l: OrderLine) {
    const r = await fetchRateOn(l.metal, l.purity, orderDate);
    if (!r.rate) return toast.warning(`No ${l.metal} ${l.purity} rate on or before ${orderDate}`);
    patch(l.key, { rate: r.rate, rate_date: r.effective_date });
    if (!r.exact) toast.info(`Using rate from ${r.effective_date} (nearest before ${orderDate})`);
  }

  const total = round2(lines.reduce((a, l) => a + lineEstimate(l), 0));

  async function save() {
    if (!customer) return toast.error("Select a customer");
    if (!lines.some((l) => l.description.trim())) return toast.error("Add at least one item");
    setSaving(true);
    try {
      const order_no = nextOrderNo();
      const { data: order, error } = await supabase.from("orders").insert({
        order_no, customer_id: customer.id, order_date: orderDate,
        promised_date: promised || null, notes: notes || null,
        estimated_total: total, advance_paid: round2(advance), created_by: user?.id,
      } as any).select().single();
      if (error) throw error;

      const kept = lines.filter((l) => l.description.trim());
      const rows = [] as any[];
      for (const l of kept) {
        const net = lineNet(l);
        rows.push({
          order_id: order.id,
          description: l.description.trim(),
          notes: l.notes?.trim() || null,
          category_id: l.category_id,
          metal: l.metal, purity: l.purity,
          quantity: Number(l.quantity || 1),
          expected_gross_weight: Number(l.expected_gross_weight || 0),
          expected_stone_weight: Number(l.expected_stone_weight || 0),
          expected_net_weight: net,
          rate: Number(l.rate || 0), rate_date: l.rate_date || orderDate,
          making_input: Number(l.making_input || 0), making_type: l.making_type,
          wastage_input: Number(l.wastage_input || 0), wastage_type: l.wastage_type,
          stone_value: Number(l.stone_value || 0),
          estimated_amount: lineEstimate(l),
          photos: await saveLinePhotos(l.photos, l.newFiles),
          karigar_id: l.karigar_id, karigar_name: l.karigar_name || null,
          status: l.karigar_id ? "assigned" : "pending",
        });
      }
      const { data: created, error: lErr } = await supabase.from("order_items").insert(rows as any).select("id, status, karigar_id, karigar_name");
      if (lErr) throw lErr;

      await Promise.all((created ?? []).map((it: any) => logOrderItemStatus({
        order_item_id: it.id, status: it.status, karigar_id: it.karigar_id, karigar_name: it.karigar_name,
        note: "Order booked", changed_by: user?.id,
      })));

      if (advance > 0) {
        await supabase.from("payments").insert({
          order_id: order.id, customer_id: customer.id, amount: round2(advance),
          method: advanceMethod as any, notes: `Advance for order ${order_no}`, created_by: user?.id,
        } as any);
      }

      toast.success(`Order ${order_no} created`);
      onSaved(order.id);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>New Order</DialogTitle></DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3"><CustomerSelector value={customer} onChange={setCustomer} /></div>
          <div><Label>Order date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
          <div><Label>Promised delivery</Label><Input type="date" value={promised} onChange={(e) => setPromised(e.target.value)} /></div>
          <div>
            <Label>Advance received</Label>
            <div className="flex gap-1">
              <NumberField value={advance} onChange={setAdvance} className="text-right" />
              <Select value={advanceMethod} onValueChange={setAdvanceMethod}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"].map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Old metal trade-in advances are added from the order page.</p>
          </div>
        </div>

        <div className="mt-2 space-y-3">
          {lines.map((l, idx) => (
            <div key={l.key} className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Item {idx + 1}</span>
                {lines.length > 1 && (
                  <Button size="icon" variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <OrderLineFields
                line={l} patch={(p) => patch(l.key, p)} cats={cats} karigars={karigars}
                onKarigarCreated={refresh} onFetchRate={() => pullRate(l)}
              />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankOrderLine(orderDate)])}>
            <Plus className="mr-1 h-4 w-4" /> Add item
          </Button>
        </div>

        <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <div className="text-sm">Estimated total: <strong>{npr(total)}</strong></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create order"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

