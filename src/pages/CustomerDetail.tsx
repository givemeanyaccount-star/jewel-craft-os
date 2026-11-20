import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ClipboardList, CreditCard, FileBadge2, Mail, MapPin,
  NotebookText, Pencil, Phone, Receipt, UserRound, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { CustomerDialog } from "@/components/CustomerDialog";
import { DateText } from "@/components/DateText";
import { StatStrip } from "@/components/StatStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermission } from "@/hooks/usePermission";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_ADVANCE_REF, npr, round2 } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/orders";

const EVENT_LABEL: Record<string, string> = {
  created: "Advance recorded",
  applied: "Applied to bill",
  adjusted: "Adjusted",
  reversed: "Reversed",
};

function methodLabel(method?: string | null) {
  return method ? method.replace(/_/g, " ") : "Not recorded";
}

function statusLabel(status?: string | null) {
  return status ? status.replace(/_/g, " ") : "Unknown";
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { hasPermission } = usePermission();
  const [customer, setCustomer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [advanceEvents, setAdvanceEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    const [customerResult, orderResult, paymentResult, eventResult] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).maybeSingle(),
      supabase.from("orders")
        .select("id, order_no, status, order_date, promised_date, estimated_total, advance_paid")
        .eq("customer_id", id).order("order_date", { ascending: false }).limit(100),
      supabase.from("payments")
        .select("*, invoices(id, invoice_number), orders(id, order_no)")
        .eq("customer_id", id).order("paid_at", { ascending: false }).limit(200),
      supabase.from("customer_advance_events" as any).select("*")
        .eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
    ]);

    if (customerResult.error) {
      toast.error(customerResult.error.message);
      setNotFound(true);
    } else if (!customerResult.data) {
      setNotFound(true);
    } else {
      setCustomer(customerResult.data);
    }
    if (orderResult.error) toast.error(`Orders: ${orderResult.error.message}`);
    if (paymentResult.error) toast.error(`Payments: ${paymentResult.error.message}`);
    if (eventResult.error) toast.error(`Advance history: ${eventResult.error.message}`);
    setOrders((orderResult.data ?? []) as any[]);
    setPayments((paymentResult.data ?? []) as any[]);
    setAdvanceEvents((eventResult.data ?? []) as any[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const heldAdvances = useMemo(() => payments.filter((p) =>
    p.reference === CUSTOMER_ADVANCE_REF && !p.order_id && !p.invoice_id,
  ), [payments]);
  const advanceHeld = useMemo(() => round2(
    heldAdvances.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
  ), [heldAdvances]);
  const activeOrders = orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const orderValue = round2(orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + Number(order.estimated_total ?? 0), 0));

  if (loading) {
    return <AppLayout title="Customer"><div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-20" /><Skeleton className="h-80" /></div></AppLayout>;
  }

  if (notFound || !customer) {
    return <AppLayout title="Customer"><Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
      <UserRound className="h-10 w-10 text-muted-foreground" />
      <p className="text-muted-foreground">This customer could not be found or you do not have access.</p>
      <Button variant="outline" onClick={() => nav("/customers")}><ArrowLeft className="mr-2 h-4 w-4" /> Back to customers</Button>
    </CardContent></Card></AppLayout>;
  }

  return (
    <AppLayout title={customer.full_name} actions={
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => nav(-1)} aria-label="Back">
          <ArrowLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Back</span>
        </Button>
        {hasPermission("customer_manage") && (
          <Button size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-1 h-4 w-4" /> Edit</Button>
        )}
      </div>
    }>
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl">{customer.full_name}</CardTitle>
            {activeOrders > 0 && <Badge variant="secondary">{activeOrders} active order{activeOrders === 1 ? "" : "s"}</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <ContactItem icon={Phone} label="Phone" value={customer.phone ? <a className="text-primary hover:underline" href={`tel:${customer.phone}`}>{customer.phone}</a> : "—"} />
            <ContactItem icon={Mail} label="Email" value={customer.email ? <a className="break-all text-primary hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a> : "—"} />
            <ContactItem icon={MapPin} label="Address" value={[customer.address, customer.city].filter(Boolean).join(", ") || "—"} />
            <ContactItem icon={FileBadge2} label="ID document" value={customer.id_doc_number ? `${statusLabel(customer.id_doc_type)} · ${customer.id_doc_number}` : "—"} />
            <ContactItem icon={CreditCard} label="Credit limit" value={npr(customer.credit_limit)} />
            <ContactItem icon={NotebookText} label="Notes" value={customer.notes || "—"} />
          </dl>
          {(customer.id_doc_image_url || customer.photo_url) && (
            <div className="mt-3 flex gap-2 text-xs text-muted-foreground">
              {customer.photo_url && <Badge variant="outline">Customer photo on file</Badge>}
              {customer.id_doc_image_url && <Badge variant="outline">ID photo on file</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      <StatStrip items={[
        { label: "Balance due", value: npr(customer.balance), sub: "Outstanding credit" },
        { label: "Advance held", value: npr(advanceHeld), sub: `${heldAdvances.length} advance record${heldAdvances.length === 1 ? "" : "s"}` },
        { label: "Orders", value: String(orders.length), sub: `${activeOrders} active` },
        { label: "Order value", value: npr(orderValue), sub: "Excludes cancelled orders" },
      ]} />

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="orders" className="gap-1.5 px-2 text-xs sm:text-sm"><ClipboardList className="hidden h-4 w-4 sm:block" />Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="advances" className="gap-1.5 px-2 text-xs sm:text-sm"><Wallet className="hidden h-4 w-4 sm:block" />Advances ({heldAdvances.length})</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5 px-2 text-xs sm:text-sm"><Receipt className="hidden h-4 w-4 sm:block" />Payments ({payments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Orders</CardTitle></CardHeader>
            <CardContent className="p-0">
              {orders.length === 0 ? <EmptyRow text="No orders for this customer." /> : (
                <div className="divide-y">
                  {orders.map((order) => (
                    <Link key={order.id} to={`/orders/${order.id}`} className="block px-4 py-3 transition-colors hover:bg-muted/50 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{order.order_no}</div>
                          <div className="text-xs text-muted-foreground">Ordered <DateText value={order.order_date} />{order.promised_date && <> · Promised <DateText value={order.promised_date} /></>}</div>
                        </div>
                        <Badge variant="outline">{ORDER_STATUS_LABEL[order.status] ?? statusLabel(order.status)}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                        <span>Estimate <strong>{npr(order.estimated_total)}</strong></span>
                        <span>Advance <strong>{npr(order.advance_paid)}</strong></span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advances">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">Advance balance entries</CardTitle>
                <span className="font-semibold text-primary">{npr(advanceHeld)}</span>
              </CardHeader>
              <CardContent className="p-0">
                {heldAdvances.length === 0 ? <EmptyRow text="No customer advance balance entries." /> : (
                  <div className="divide-y">
                    {heldAdvances.map((payment) => (
                      <div key={payment.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-6">
                        <div>
                          <div className="text-sm font-medium capitalize">{methodLabel(payment.method)}</div>
                          <div className="text-xs text-muted-foreground">Paid <DateText value={String(payment.paid_at).slice(0, 10)} />{payment.notes && <> · {payment.notes}</>}</div>
                        </div>
                        <span className={`shrink-0 font-medium tabular-nums ${Number(payment.amount) < 0 ? "text-destructive" : ""}`}>{npr(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Advance audit history</CardTitle></CardHeader>
              <CardContent className="p-0">
                {advanceEvents.length === 0 ? <EmptyRow text="No advance history recorded." /> : (
                  <div className="max-h-[32rem] divide-y overflow-y-auto">
                    {advanceEvents.map((event) => (
                      <div key={event.id} className="px-4 py-3 sm:px-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-medium">{EVENT_LABEL[event.event] ?? statusLabel(event.event)}</div>
                          <span className={`shrink-0 text-sm font-medium tabular-nums ${Number(event.amount) < 0 ? "text-destructive" : ""}`}>{Number(event.amount) > 0 ? "+" : ""}{npr(event.amount)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          <DateText value={event.created_at} withTime /> · by {event.actor_email || "Unknown user"}
                        </div>
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {event.paid_at && <div>Advance paid <DateText value={String(event.paid_at).slice(0, 10)} />{event.method && <> · <span className="capitalize">{methodLabel(event.method)}</span></>}</div>}
                          {event.old_amount != null && event.new_amount != null && <div>{npr(event.old_amount)} → {npr(event.new_amount)}</div>}
                          {event.invoice_id && <div>Bill {hasPermission("invoice_view") ? <Link className="text-primary hover:underline" to={`/invoices/${event.invoice_id}`}>{event.invoice_number || "View bill"}</Link> : event.invoice_number}</div>}
                          {event.reason && <div>Reason: “{event.reason}”</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Payments</CardTitle></CardHeader>
            <CardContent className="p-0">
              {payments.length === 0 ? <EmptyRow text="No payments for this customer." /> : (
                <div className="divide-y">
                  {payments.map((payment) => {
                    const isHeldAdvance = payment.reference === CUSTOMER_ADVANCE_REF && !payment.order_id && !payment.invoice_id;
                    const label = isHeldAdvance ? "Customer advance" : payment.order_id ? "Order advance" : payment.invoice_id ? (Number(payment.amount) < 0 ? "Refund / change" : "Bill payment") : "Payment";
                    return (
                      <div key={payment.id} className="px-4 py-3 sm:px-6">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{label} · <span className="capitalize">{methodLabel(payment.method)}</span></div>
                            <div className="text-xs text-muted-foreground"><DateText value={String(payment.paid_at).slice(0, 10)} />{payment.reference && payment.reference !== CUSTOMER_ADVANCE_REF && <> · Ref {payment.reference}</>}</div>
                          </div>
                          <span className={`shrink-0 font-medium tabular-nums ${Number(payment.amount) < 0 ? "text-destructive" : ""}`}>{npr(payment.amount)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          {payment.invoice_id && hasPermission("invoice_view") && <Link to={`/invoices/${payment.invoice_id}`} className="text-primary hover:underline">Bill {payment.invoices?.invoice_number || "View"}</Link>}
                          {payment.order_id && hasPermission("order_view") && <Link to={`/orders/${payment.order_id}`} className="text-primary hover:underline">Order {payment.orders?.order_no || "View"}</Link>}
                          {payment.notes && <span className="text-muted-foreground">{payment.notes}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CustomerDialog open={editOpen} onOpenChange={setEditOpen} editing={customer} onSaved={(saved) => {
        setCustomer(saved);
        setEditOpen(false);
      }} />
    </AppLayout>
  );
}

function ContactItem({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: React.ReactNode }) {
  return <div className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words">{value}</dd></div></div>;
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">{text}</p>;
}
