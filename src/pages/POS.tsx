import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Search, ShoppingCart, RefreshCw, UserPlus, Coins, Pencil, ClipboardList } from "lucide-react";
import {
  npr, computeLineTotal,
  nextNumber, computeInvoiceTaxes, discountForTargetTotal, discountForTargetRefund,
  round2, netPayableOf, refundDueOf,
} from "@/lib/format";

import { fetchLatestFineRates, billFineRate, fineEquivalentNote, type FineRates } from "@/lib/fineEquivalent";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { QRScanButton } from "@/components/QRScanButton";
import { PuritySelect } from "@/components/PuritySelect";
import { useAppSettings } from "@/hooks/useAppSettings";
import { ItemDialog } from "@/pages/Inventory";
import { OldGoldForm, OldGoldSaveResult } from "@/components/OldGoldForm";
import { PickedCustomer } from "@/components/CustomerSelector";
import { fetchRateOn, fetchLatestRate, todayISO, logOrderItemStatus, syncOrderStatus, recalcOrderItem, lineProgress } from "@/lib/orders";


const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "credit", "old_gold", "other"];

export interface CartRow {
  inventory_item_id: string | null;
  description: string;
  metal?: string; purity?: string;
  gross_weight: number;
  stone_weight: number;
  weight: number;              // net weight
  rate: number;
  making_charge: number;       // computed money amount
  wastage_amount: number;      // computed money amount
  stone_value: number;
  quantity: number;
  line_total: number;
  making_input: number;
  making_type: "per_gram" | "fixed" | "percentage";
  wastage_input: number;
  wastage_type: "percentage" | "weight" | "fixed";
  raw_item?: any; // full inventory row for editing
}

interface PayLine { method: string; amount: number; }

export function recompute(r: CartRow): CartRow {
  const { making, wastageAmount, lineTotal } = computeLineTotal({
    netWeight: r.weight,
    ratePerGram: r.rate,
    makingCharge: r.making_input,
    makingChargeType: r.making_type,
    wastageType: r.wastage_type,
    wastageValue: r.wastage_input,
    stoneValue: r.stone_value,
    quantity: r.quantity,
  });
  return { ...r, making_charge: making, wastage_amount: wastageAmount, line_total: lineTotal };
}

// Derive display values matching the sales invoice columns.
export function lineDisplay(r: {
  weight?: number; rate?: number; wastage_type?: string; wastage_input?: number; wastage_amount?: number;
  stone_value?: number; making_charge?: number; quantity?: number; gross_weight?: number; stone_weight?: number;
}) {
  const netWt = Number(r.weight ?? 0);
  const rate = Number(r.rate ?? 0);
  const wastageWt = r.wastage_type === "weight"
    ? Number(r.wastage_input ?? 0)
    : (rate > 0 ? Number(r.wastage_amount ?? 0) / rate : 0);
  const totalWt = netWt + wastageWt;
  const goldAmt = totalWt * rate;
  const stoneAmt = Number(r.stone_value ?? 0);
  const making = Number(r.making_charge ?? 0);
  const qty = Number(r.quantity ?? 1);
  const rowTotal = (goldAmt + stoneAmt + making) * qty;
  const grossWt = Number(r.gross_weight ?? 0);
  const stoneWt = Number(r.stone_weight ?? 0);
  return { netWt, rate, wastageWt, totalWt, goldAmt, stoneAmt, making, qty, rowTotal, grossWt, stoneWt };
}

export default function POS() {
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const canManageInventory = hasPermission("inventory_manage");
  const { settings } = useAppSettings();
  const nav = useNavigate();
  const location = useLocation();
  const quotationId: string | null = (location.state as any)?.quotationId ?? null;
  const quotationNumber: string | null = (location.state as any)?.quoteNumber ?? null;
  const orderIdFromState: string | null = (location.state as any)?.orderId ?? null;
  const canBackdate = hasPermission("invoice_cancel_refund") || hasPermission("settings_manage");
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [todayRates, setTodayRates] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [discount, setDiscount] = useState(0);
  const [oldGoldCredit, setOldGoldCredit] = useState(0);
  const [oldGoldPurchaseId, setOldGoldPurchaseId] = useState<string | null>(null);
  const [oldGoldMetal, setOldGoldMetal] = useState<string>("gold");
  const [fineRates, setFineRates] = useState<FineRates>({});
  useEffect(() => { fetchLatestFineRates().then(setFineRates); }, []);
  const [targetTotal, setTargetTotal] = useState<string>("");
  const [payments, setPayments] = useState<PayLine[]>([{ method: "cash", amount: 0 }]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<{ row: number; item: any } | null>(null);

  // Custom order billing
  const [order, setOrder] = useState<any>(null);
  const [orderLineByItem, setOrderLineByItem] = useState<Record<string, { receiptId: string; orderItemId: string }>>({});
  const [orderDate, setOrderDate] = useState<string>("");
  const [rateBasis, setRateBasis] = useState<"order" | "current">("current");
  const [advance, setAdvance] = useState(0);            // cash-type advances held on the order
  const [advanceOldMetal, setAdvanceOldMetal] = useState(0); // old-metal trade-in advances on the order
  const [applyCashAdv, setApplyCashAdv] = useState(0);       // how much of the cash advance this bill uses
  const [applyOldMetalAdv, setApplyOldMetalAdv] = useState(0); // how much of the old metal advance this bill uses
  const [refundInput, setRefundInput] = useState<string>("");  // blank = refund the whole excess
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [advDialogOpen, setAdvDialogOpen] = useState(false);
  const [issueDate, setIssueDate] = useState<string>(todayISO());
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);

  const [newCustOpen, setNewCustOpen] = useState(false);
  const [ogOpen, setOgOpen] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);

  useEffect(() => { loadCustomers(); }, []);
  async function loadCustomers() {
    const { data } = await supabase.from("customers").select("id, full_name, phone").order("full_name");
    setCustomers(data ?? []);
  }
  useEffect(() => {
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCategories(data ?? []));
    supabase.from("locations").select("id, name").order("name").then(({ data }) => setLocations(data ?? []));
    const today = new Date().toISOString().slice(0, 10);
    supabase.from("metal_rates").select("metal, purity, rate_per_gram, effective_date, source")
      .eq("effective_date", today).order("metal").then(({ data }) => setTodayRates(data ?? []));
  }, []);

  // Prefill from an accepted quotation
  useEffect(() => {
    if (!quotationId) return;
    (async () => {
      const [{ data: q }, { data: lines }] = await Promise.all([
        supabase.from("quotations").select("*").eq("id", quotationId).maybeSingle(),
        supabase.from("quotation_items").select("*").eq("quotation_id", quotationId),
      ]);
      if (!q) return toast.error("Quotation not found");
      setCustomerId(q.customer_id);
      setDiscount(Number(q.discount ?? 0));
      setOldGoldCredit(Number(q.old_gold_credit ?? 0));
      setNotes(q.notes ?? "");
      setCart((lines ?? []).map((l: any) => recompute({
        inventory_item_id: l.inventory_item_id,
        description: l.description,
        metal: l.metal ?? undefined, purity: l.purity ?? undefined,
        gross_weight: Number(l.gross_weight ?? 0),
        stone_weight: Number(l.stone_weight ?? 0),
        weight: Number(l.weight ?? 0),
        rate: Number(l.rate ?? 0),
        making_charge: Number(l.making_charge ?? 0),
        wastage_amount: Number(l.wastage_amount ?? 0),
        stone_value: Number(l.stone_value ?? 0),
        quantity: Number(l.quantity ?? 1),
        line_total: Number(l.line_total ?? 0),
        making_input: Number(l.making_input ?? 0),
        making_type: (l.making_type ?? "per_gram") as any,
        wastage_input: Number(l.wastage_input ?? 0),
        wastage_type: (l.wastage_type ?? "percentage") as any,
      })));
      toast.success(`Loaded quotation ${q.quote_number}`);
    })();
  }, [quotationId]);



  useEffect(() => { if (orderIdFromState) void loadOrder(orderIdFromState); }, [orderIdFromState]);

  async function loadOrder(id: string) {
    const [{ data: o }, { data: lines }, { data: pays }] = await Promise.all([
      supabase.from("orders").select("*, customers(full_name, phone)").eq("id", id).maybeSingle(),
      supabase.from("order_items")
        .select("*, order_item_receipts(*, inventory_items(*))")
        .eq("order_id", id)
        .neq("status", "cancelled"),
      supabase.from("payments").select("amount, method").eq("order_id", id).is("invoice_id", null),
    ]);
    if (!o) return toast.error("Order not found");
    const billable = ((lines ?? []) as any[]).flatMap((l) =>
      ((l.order_item_receipts ?? []) as any[])
        .filter((r) => r.inventory_item_id && r.status !== "billed" && r.status !== "cancelled")
        .map((r) => ({ line: l, receipt: r })),
    );
    if (!billable.length) return toast.error("No finished pieces on this order are ready to bill");
    setOrder(o);
    setCustomerId(o.customer_id);
    setOrderDate(o.order_date);
    setRateBasis("order");
    // Split the order advances: old-metal trade-ins become an old metal credit on
    // this bill (so the SD tax base is right), cash-type advances are deducted from
    // the total to give the net payable amount. Both are adjustable — whatever is not
    // applied here stays on the order for the remaining pieces.
    const advPays = (pays ?? []) as any[];
    const oldMetalAdv = round2(advPays.filter((p) => p.method === "old_gold").reduce((a, p) => a + Number(p.amount ?? 0), 0));
    const cashAdv = round2(advPays.filter((p) => p.method !== "old_gold").reduce((a, p) => a + Number(p.amount ?? 0), 0));
    setAdvance(cashAdv);
    setAdvanceOldMetal(oldMetalAdv);
    setApplyCashAdv(cashAdv);
    setApplyOldMetalAdv(oldMetalAdv);
    setRefundInput("");
    // Pieces of this order that this bill does not cover — the advance may need to be kept.
    const partial = ((lines ?? []) as any[]).some((l) => {
      const inBatch = ((l.order_item_receipts ?? []) as any[])
        .filter((r) => r.inventory_item_id && r.status !== "billed" && r.status !== "cancelled")
        .reduce((a, r) => a + Number(r.quantity ?? 1), 0);
      return Number(l.quantity ?? 0) > Number(l.billed_qty ?? 0) + inBatch;
    });
    if (partial && (oldMetalAdv > 0 || cashAdv > 0)) setAdvDialogOpen(true);
    setNotes(o.notes ?? "");

    const map: Record<string, { receiptId: string; orderItemId: string }> = {};
    const rows: CartRow[] = [];
    for (const { line: l, receipt: r } of billable) {
      const inv = r.inventory_items;
      const gross = Number(r.received_gross_weight ?? inv?.gross_weight ?? 0);
      const stoneWt = Number(r.received_stone_weight ?? inv?.stone_weight ?? 0);
      const net = Number(inv?.net_weight ?? Math.max(0, gross - stoneWt));
      const lookup = await fetchRateOn(l.metal, l.purity, o.order_date);
      if (inv?.id) map[inv.id] = { receiptId: r.id, orderItemId: l.id };
      rows.push(recompute({
        inventory_item_id: inv?.id ?? null,
        description: inv?.sku ? `${l.description} (${inv.sku})` : l.description,
        metal: l.metal, purity: l.purity,
        gross_weight: gross, stone_weight: stoneWt, weight: net,
        rate: lookup.rate || Number(l.rate ?? 0),
        making_charge: 0, wastage_amount: 0,
        stone_value: Number(l.stone_value ?? 0),
        quantity: Number(r.quantity ?? 1),
        line_total: 0,
        making_input: Number(l.making_input ?? 0),
        making_type: (l.making_type ?? "per_gram") as any,
        wastage_input: Number(l.wastage_input ?? 0),
        wastage_type: (l.wastage_type ?? "percentage") as any,
        raw_item: inv ?? undefined,
      }));
    }
    setOrderLineByItem(map);
    setCart(rows);
    toast.success(`Loaded ${rows.length} finished piece(s) from order ${o.order_no}`);
  }


  /** Re-price the whole cart from the order date or from the latest rates. */
  async function applyRateBasis(basis: "order" | "current") {
    const date = orderDate;
    const updated = await Promise.all(cart.map(async (r) => {
      if (!r.metal || !r.purity) return r;
      const look = basis === "order" && date ? await fetchRateOn(r.metal, r.purity, date) : await fetchLatestRate(r.metal, r.purity);
      return look.rate ? recompute({ ...r, rate: look.rate }) : r;
    }));
    setCart(updated);
    setRateBasis(basis);
    toast.success(basis === "order" ? `Priced at the ${date} rate` : "Priced at today's rate");
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      const s = search.trim();
      if (!s && categoryId === "all") { setItems([]); return; }
      let q = supabase.from("inventory_items").select("*").eq("status", "in_stock");
      if (categoryId !== "all") q = q.eq("category_id", categoryId);
      if (s) q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%,qr_code.eq.${s},barcode.eq.${s}`);
      const { data } = await q.limit(30);
      setItems(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [search, categoryId]);


  async function fetchRate(metal: string, purity: string): Promise<number> {
    const { data } = await supabase.from("metal_rates")
      .select("rate_per_gram").eq("metal", metal as any).eq("purity", purity)
      .order("effective_date", { ascending: false }).limit(1).maybeSingle();
    return Number(data?.rate_per_gram ?? 0);
  }

  async function addToCart(item: any) {
    const rate = await fetchRate(item.metal, item.purity);
    if (!rate) toast.warning(`No ${item.metal} ${item.purity} rate set — enter rate on the line or update Metal Rates.`);
    const row: CartRow = {
      inventory_item_id: item.id,
      description: `${item.name} (${item.sku})`,
      metal: item.metal, purity: item.purity,
      gross_weight: Number(item.gross_weight ?? item.net_weight ?? 0),
      stone_weight: Number(item.stone_weight ?? 0),
      weight: Number(item.net_weight),
      rate,
      making_charge: 0,
      wastage_amount: 0,
      stone_value: Number(item.stone_value ?? 0),
      quantity: 1,
      line_total: 0,
      making_input: Number(item.making_charge ?? 0),
      making_type: (item.making_charge_type ?? "per_gram") as any,
      wastage_input: Number(item.wastage_value ?? 0),
      wastage_type: (item.wastage_type ?? "percentage") as any,
      raw_item: item,
    };
    setCart((c) => [...c, recompute(row)]);
    setSearch(""); setItems([]);
  }

  function updateRow(idx: number, patch: Partial<CartRow>) {
    setCart((c) => c.map((r, i) => i === idx ? recompute({ ...r, ...patch }) : r));
  }
  function removeRow(idx: number) { setCart((c) => c.filter((_, i) => i !== idx)); }

  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const { data } = await supabase.from("inventory_items")
      .select("*").eq("status", "in_stock")
      .or(`qr_code.eq.${trimmed},sku.eq.${trimmed},barcode.eq.${trimmed}`)
      .maybeSingle();
    if (!data) return toast.error("No in-stock item for: " + trimmed);
    addToCart(data);
  }

  async function refreshAllRates() {
    const updated = await Promise.all(cart.map(async (r) => {
      if (!r.metal || !r.purity) return r;
      const rate = await fetchRate(r.metal, r.purity);
      return recompute({ ...r, rate: rate || r.rate });
    }));
    setCart(updated);
    toast.success("Rates refreshed");
  }

  const subtotal = useMemo(() => round2(cart.reduce((a, r) => a + r.line_total, 0)), [cart]);
  const stonesTotal = useMemo(() => round2(cart.reduce((a, r) => a + (Number(r.stone_value) || 0) * (r.quantity || 1), 0)), [cart]);

  // Old metal credit on this bill = trade-in bought during the sale + the part of the
  // order's old metal advance applied here.
  const appliedOldMetalAdv = useMemo(
    () => round2(Math.max(0, Math.min(applyOldMetalAdv, advanceOldMetal))),
    [applyOldMetalAdv, advanceOldMetal],
  );
  const totalOldGoldCredit = useMemo(
    () => round2(oldGoldCredit + appliedOldMetalAdv),
    [oldGoldCredit, appliedOldMetalAdv],
  );

  const tax = useMemo(() => computeInvoiceTaxes({
    subtotal, stonesTotal, discount, oldGoldCredit: totalOldGoldCredit,
    vatRate: settings.vat_rate, vatEnabled: settings.vat_enabled, sdTaxRate: settings.sd_tax_rate,
  }), [subtotal, stonesTotal, discount, totalOldGoldCredit, settings]);

  const manualPaid = useMemo(
    () => round2(payments.reduce((a, p) => a + (Number(p.amount) || 0), 0)),
    [payments],
  );
  // Cash advance this bill draws on (staff can keep part of it on the order).
  const advanceRequested = useMemo(
    () => round2(Math.max(0, Math.min(applyCashAdv, advance))),
    [applyCashAdv, advance],
  );
  // Money owed back when the advance drawn exceeds the bill total.
  const refundDue = useMemo(() => refundDueOf(tax.total, advanceRequested), [tax.total, advanceRequested]);
  const refund = useMemo(() => {
    if (refundInput === "") return refundDue;
    return round2(Math.max(0, Math.min(Number(refundInput) || 0, refundDue)));
  }, [refundInput, refundDue]);
  // Advance rows actually consumed by this invoice; the untouched rest stays on the order.
  const advanceConsumed = useMemo(
    () => round2(advanceRequested - (refundDue - refund)),
    [advanceRequested, refundDue, refund],
  );
  // Advance value that counts as payment on this bill (consumed minus what is handed back).
  const appliedAdvance = useMemo(() => round2(advanceConsumed - refund), [advanceConsumed, refund]);
  const advanceKept = useMemo(
    () => round2(Math.max(0, advance - advanceConsumed)),
    [advance, advanceConsumed],
  );
  const oldMetalKept = useMemo(
    () => round2(Math.max(0, advanceOldMetal - appliedOldMetalAdv)),
    [advanceOldMetal, appliedOldMetalAdv],
  );
  // What the customer still has to settle now, after the cash advance is deducted.
  const netPayable = useMemo(() => netPayableOf(tax.total, appliedAdvance), [tax.total, appliedAdvance]);
  const paid = useMemo(() => round2(manualPaid + appliedAdvance), [manualPaid, appliedAdvance]);

  const balance = round2(Math.max(0, tax.total - paid));

  // Fine-metal equivalent of the old metal credit, at the bill's rate (or the day's rate).
  const oldGoldEq = useMemo(() => totalOldGoldCredit > 0
    ? fineEquivalentNote(totalOldGoldCredit, billFineRate(cart as any, oldGoldMetal, fineRates), oldGoldMetal)
    : null, [totalOldGoldCredit, cart, oldGoldMetal, fineRates]);


  function applyTargetTotal() {
    const t = Number(targetTotal);
    if (!t || t <= 0) return toast.error(refundDue > 0 ? "Enter target refund amount" : "Enter target net payable amount");
    const taxOpts = {
      subtotal, stonesTotal, oldGoldCredit: totalOldGoldCredit,
      vatRate: settings.vat_rate, vatEnabled: settings.vat_enabled, sdTaxRate: settings.sd_tax_rate,
    };
    const refundMode = refundDue > 0;
    // In refund mode the target is the money handed back, otherwise it is the net payable.
    const d = refundMode
      ? discountForTargetRefund({ ...taxOpts, advanceApplied: advanceRequested, targetRefund: t })
      : discountForTargetTotal({ ...taxOpts, targetTotal: round2(t + advanceRequested) });
    setDiscount(d);
    // Check the target is actually reachable (it is not when it needs a negative discount).
    const reached = computeInvoiceTaxes({ ...taxOpts, discount: d }).total;
    if (refundMode) {
      const reachedRefund = refundDueOf(reached, advanceRequested);
      if (Math.abs(reachedRefund - t) > 0.05) {
        toast.warning(`Cannot reach a refund of ${npr(t)} — the most refundable without a discount is ${npr(reachedRefund)}`);
        return;
      }
      setRefundInput("");
      toast.success(`Discount set to ${npr(d)} to refund ${npr(t)}`);
      return;
    }
    const reachedNet = netPayableOf(reached, Math.min(advanceRequested, reached));
    if (Math.abs(reachedNet - t) > 0.05) {
      toast.warning(`Cannot reach ${npr(t)} — the lowest net payable without a discount is ${npr(reachedNet)}`);
      return;
    }
    toast.success(`Discount set to ${npr(d)} to reach a net payable of ${npr(t)}`);
  }



  async function checkout() {
    if (!customerId) return toast.error("Select a customer for this sale");
    if (cart.length === 0) return toast.error("Add at least one item");
    if (cart.some((r) => r.rate <= 0)) return toast.error("One or more lines have no rate. Set rate or update Metal Rates.");
    setSaving(true);
    let invoiceCreated = false;
    // Remember each item's status before the claim so a rollback restores it exactly
    // (a quotation/order reservation must stay reserved, not become in_stock).
    const priorStatus = new Map<string, string>();
    try {
      // Claim inventory first, atomically, before any financial record is created.
      // If another sale already took one of these items, we abort here with nothing
      // half-created, instead of silently selling the same physical item twice.
      const itemIds = cart.map((r) => r.inventory_item_id).filter(Boolean) as string[];
      if (itemIds.length) {
        const { data: before } = await supabase
          .from("inventory_items").select("id, sku, name, status").in("id", itemIds);
        (before ?? []).forEach((r: any) => priorStatus.set(r.id, r.status));

        const { data: claimed, error: claimErr } = await supabase
          .from("inventory_items")
          .update({ status: "sold" })
          .in("status", ["in_stock", "reserved"])
          .in("id", itemIds)
          .select("id");
        if (claimErr) throw claimErr;
        const claimedIds = (claimed ?? []).map((c: any) => c.id);
        if (claimedIds.length !== itemIds.length) {
          if (claimedIds.length) {
            for (const id of claimedIds) {
              await supabase.from("inventory_items")
                .update({ status: (priorStatus.get(id) ?? "in_stock") as any }).eq("id", id);
            }
          }
          const blocked = (before ?? []).filter((r: any) => !claimedIds.includes(r.id));
          const detail = blocked.length
            ? blocked.map((r: any) => `${r.sku ?? r.name} (${String(r.status).replace("_", " ")})`).join(", ")
            : "unknown item(s)";
          throw new Error(`These items are no longer available to sell: ${detail}. Please remove them and try again.`);
        }
      }


      const { data: invNumber, error: numErr } = await supabase.rpc("next_document_number", { p_prefix: "INV", p_pad: 5 });
      if (numErr) throw numErr;
      const status = paid >= tax.total ? "paid" : paid > 0 ? "partial" : "issued";

      const { data: inv, error } = await supabase.from("invoices").insert({
        invoice_number: invNumber,
        customer_id: customerId,
        subtotal,
        stones_total: stonesTotal,
        vat_rate: settings.vat_enabled ? settings.vat_rate : 0, vat_amount: tax.vat,
        sd_tax_rate: settings.sd_tax_rate, sd_tax: tax.sdTax,
        luxury_tax_rate: 0, luxury_tax: 0,
        discount, old_gold_credit: totalOldGoldCredit, total: tax.total,
        amount_paid: paid, balance_due: balance,
        notes: notes || null, status, created_by: user?.id,
        order_date: orderDate || null,
        order_id: order?.id ?? null,
        rate_basis: rateBasis,
        issued_at: canBackdate && issueDate && issueDate !== todayISO()
          ? new Date(`${issueDate}T12:00:00`).toISOString()
          : new Date().toISOString(),
      } as any).select().single();
      if (error) throw error;
      invoiceCreated = true;

      const lines = cart.map((r) => ({
        invoice_id: inv.id,
        inventory_item_id: r.inventory_item_id,
        description: r.description,
        metal: r.metal, purity: r.purity,
        gross_weight: r.gross_weight,
        stone_weight: r.stone_weight,
        weight: r.weight, rate: r.rate,
        making_charge: r.making_charge,
        making_input: r.making_input, making_type: r.making_type,
        wastage_amount: r.wastage_amount,
        wastage_input: r.wastage_input, wastage_type: r.wastage_type,
        stone_value: r.stone_value,
        quantity: r.quantity,
        line_total: r.line_total,
      }));
      const { error: lErr } = await supabase.from("invoice_items").insert(lines as any);
      if (lErr) throw lErr;

      const validPays = payments.filter((p) => Number(p.amount) > 0);
      if (validPays.length) {
        await supabase.from("payments").insert(validPays.map((p) => ({
          invoice_id: inv.id, customer_id: customerId, amount: Number(p.amount),
          method: p.method as any, created_by: user?.id,
        })));
      }

      if (order) {
        const refs = cart
          .map((r) => (r.inventory_item_id ? orderLineByItem[r.inventory_item_id] : null))
          .filter(Boolean) as { receiptId: string; orderItemId: string }[];
        if (refs.length) {
          await supabase.from("order_item_receipts")
            .update({ status: "billed", invoice_id: inv.id } as any)
            .in("id", refs.map((r) => r.receiptId));
          const lineIds = Array.from(new Set(refs.map((r) => r.orderItemId)));
          await supabase.from("order_items").update({ invoice_id: inv.id }).in("id", lineIds);
          await Promise.all(lineIds.map(async (lid) => {
            await recalcOrderItem(lid);
            await logOrderItemStatus({
              order_item_id: lid, status: "billed", note: `Billed on invoice ${invNumber}`, changed_by: user?.id,
            });
          }));
        }
        // Consume order advances up to the amounts applied on this bill; anything left
        // stays on the order (splitting a row when only part of it is used here).
        const consumeAdvance = async (isOldMetal: boolean, want: number) => {
          let remaining = round2(want);
          if (remaining <= 0.004) return;
          let q = supabase.from("payments")
            .select("id, amount, method").eq("order_id", order.id).is("invoice_id", null);
          q = isOldMetal ? q.eq("method", "old_gold" as any) : q.neq("method", "old_gold" as any);
          const { data: adv } = await q.order("paid_at");
          const note = isOldMetal
            ? `Old metal advance credited on invoice ${invNumber}`
            : `Advance applied to invoice ${invNumber}`;
          for (const p of (adv ?? []) as any[]) {
            if (remaining <= 0.004) break;
            const amt = Number(p.amount ?? 0);
            if (amt <= 0) continue;
            if (amt <= remaining + 0.004) {
              await supabase.from("payments").update({ invoice_id: inv.id, notes: note } as any).eq("id", p.id);
              remaining = round2(remaining - amt);
            } else {
              // split: part of this advance settles the current bill, the rest stays on the order
              await supabase.from("payments").update({ amount: round2(amt - remaining) }).eq("id", p.id);
              await supabase.from("payments").insert({
                order_id: order.id, invoice_id: inv.id, customer_id: order.customer_id,
                amount: remaining, method: (p.method ?? (isOldMetal ? "old_gold" : "cash")) as any,
                notes: note, created_by: user?.id,
              } as any);
              remaining = 0;
            }
          }
        };
        // Old-metal advances are already deducted through the old metal credit line,
        // so they are only attached here so they can't be counted again later.
        await consumeAdvance(true, appliedOldMetalAdv);
        await consumeAdvance(false, advanceConsumed);

        // Money handed back when the advance exceeded the bill: a negative payment row.
        if (refund > 0.004) {
          await supabase.from("payments").insert({
            invoice_id: inv.id, customer_id: customerId, amount: round2(-refund),
            method: refundMethod as any, notes: `Refund of excess advance on invoice ${invNumber}`,
            created_by: user?.id,
          } as any);
        }

        await syncOrderStatus(order.id);
      }


      if (oldGoldPurchaseId) {
        await supabase.from("old_gold_purchases").update({ linked_invoice_id: inv.id }).eq("id", oldGoldPurchaseId);
      }

      if (balance > 0 && customerId) {
        const { data: cust } = await supabase.from("customers").select("balance").eq("id", customerId).single();
        await supabase.from("customers").update({ balance: Number(cust?.balance ?? 0) + balance }).eq("id", customerId);
      }

      if (quotationId) {
        // items are already marked sold above — remove the quotation without releasing stock
        await supabase.from("quotation_items").delete().eq("quotation_id", quotationId);
        await supabase.from("quotations").delete().eq("id", quotationId);
      }


      toast.success(`Invoice ${invNumber} created`);
      nav(`/invoices/${inv.id}`);
    } catch (e: any) {
      // Only release claimed items if the invoice itself never got created. If the
      // invoice exists, the items are legitimately sold even if a later step failed.
      if (!invoiceCreated) {
        const itemIds = cart.map((r) => r.inventory_item_id).filter(Boolean) as string[];
        if (itemIds.length) {
          const { data: stillSold } = await supabase.from("inventory_items").select("id").eq("status", "sold").in("id", itemIds);
          for (const r of (stillSold ?? []) as any[]) {
            await supabase.from("inventory_items")
              .update({ status: (priorStatus.get(r.id) ?? "in_stock") as any }).eq("id", r.id);
          }

        }
      }
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  return (
    <AppLayout title="New Sale (POS)">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Select value={customerId ?? ""} onValueChange={(v) => setCustomerId(v)}>
                  <SelectTrigger className={`flex-1 ${!customerId ? "border-destructive" : ""}`}>
                    <SelectValue placeholder="Select customer (required)" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone && `· ${c.phone}`}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setNewCustOpen(true)}>
                  <UserPlus className="mr-1 h-4 w-4" /> New
                </Button>
              </div>
              {!customerId && <p className="mt-1.5 text-xs text-muted-foreground">Every sale must be linked to a customer.</p>}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Order date</Label>
                  <Input type="date" className="h-9" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Rate basis</Label>
                  <Select value={rateBasis} onValueChange={(v) => applyRateBasis(v as any)} disabled={!orderDate}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="order">Rate of order date</SelectItem>
                      <SelectItem value="current">Today's rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Invoice date</Label>
                  <Input type="date" className="h-9" value={issueDate} disabled={!canBackdate}
                    onChange={(e) => setIssueDate(e.target.value)} />
                </div>
              </div>
              {order && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Billing custom order <strong>{order.order_no}</strong>
                  {advanceOldMetal > 0 && <> · old metal advance <strong>{npr(advanceOldMetal)}</strong> — {npr(appliedOldMetalAdv)} credited here</>}
                  {advance > 0 && <> · cash advance <strong>{npr(advance)}</strong> — {npr(advanceConsumed)} used here</>}
                  {(advanceKept > 0 || oldMetalKept > 0) && <> · {npr(round2(advanceKept + oldMetalKept))} kept for the remaining pieces</>}
                </p>
              )}
              {!order && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setOrderPickerOpen(true)}>
                  <ClipboardList className="mr-1 h-4 w-4" /> Bill a custom order
                </Button>
              )}
              {quotationNumber && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Converting quotation <strong>{quotationNumber}</strong> — it will be removed once this sale is completed.
                </p>
              )}
            </CardContent>
          </Card>


          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Add items</CardTitle>
              {cart.length > 0 && (
                <Button size="sm" variant="outline" onClick={refreshAllRates}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Refresh rates
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {todayRates.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2 rounded-md border bg-muted/40 p-2 text-xs">
                  <span className="font-medium">Today's rate:</span>
                  {todayRates.map((r, i) => (
                    <span key={i} className="rounded bg-background px-2 py-0.5">
                      <span className="capitalize">{r.metal}</span> {r.purity}: <strong>{npr(r.rate_per_gram)}</strong>/g
                    </span>
                  ))}
                  {todayRates[0]?.source && <span className="text-muted-foreground">· src: {todayRates[0].source}</span>}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="sm:w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Scan QR or search name / SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <QRScanButton onScan={handleScan} />
                {canManageInventory && (
                  <Button size="sm" variant="secondary" onClick={() => setNewItemOpen(true)} title="Create new item and add to sale">
                    <Plus className="mr-1 h-4 w-4" /> New item
                  </Button>
                )}
              </div>

              {items.length > 0 && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded border">
                  {items.map((i) => (
                    <button key={i.id} onClick={() => addToCart(i)}
                      className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted">
                      <div>
                        <div className="font-medium">{i.name}</div>
                        <div className="text-xs text-muted-foreground">{i.sku} · {i.metal} {i.purity} · {i.net_weight}g</div>
                      </div>
                      <Plus className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              )}

              <Table className="mt-3">
                <TableHeader><TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Net Wt (g)</TableHead>
                  <TableHead className="text-right">Rate/g</TableHead>
                  <TableHead className="text-right">Stone</TableHead>
                  <TableHead className="text-right">Line</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {cart.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Cart is empty</TableCell></TableRow>
                    : cart.map((r, i) => {
                      const d = lineDisplay(r);
                      return (
                      <Fragment key={i}>
                      <TableRow key={i}>
                        <TableCell>
                          <div className="font-medium">{r.description}</div>
                          <div className="text-xs text-muted-foreground">{r.metal} {r.purity}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <NumberField decimals={3} className="h-8 w-20 text-right" value={r.weight}
                            onChange={(v) => updateRow(i, { weight: v })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <NumberField className={`h-8 w-28 text-right ${r.rate <= 0 ? "border-destructive" : ""}`}
                            value={r.rate} onChange={(v) => updateRow(i, { rate: v })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <NumberField className="h-8 w-24 text-right" value={r.stone_value}
                            onChange={(v) => updateRow(i, { stone_value: v })} />
                        </TableCell>
                        <TableCell className="text-right font-medium">{npr(r.line_total)}</TableCell>
                        <TableCell className="flex gap-0.5">
                          {r.raw_item && canManageInventory && (
                            <Button size="icon" variant="ghost" title="Edit inventory details"
                              onClick={() => setEditItem({ row: i, item: r.raw_item })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                      <TableRow key={`${i}-d`} className="border-b bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={6} className="py-2">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4 lg:grid-cols-6">
                            <Detail label="Purity" value={r.purity ?? "-"} />
                            <Detail label="Gross wt" value={`${d.grossWt.toFixed(3)} g`} />
                            <Detail label="Stone wt" value={`${d.stoneWt.toFixed(3)} g`} />
                            <Detail label="Net wt" value={`${d.netWt.toFixed(3)} g`} />
                            <Detail label="Wastage wt" value={`${d.wastageWt.toFixed(3)} g`} />
                            <Detail label="Total wt" value={`${d.totalWt.toFixed(3)} g`} />
                            <Detail label="Gold amt" value={npr(d.goldAmt)} />
                            <Detail label="Stone amt" value={npr(d.stoneAmt)} />
                            <Detail label="Making" value={npr(d.making)} />
                            <Detail label="Qty" value={String(d.qty)} />
                          </div>
                        </TableCell>
                      </TableRow>
                      </Fragment>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Row label="Subtotal" value={npr(subtotal)} />
            <Row label={settings.vat_enabled ? "  Stones (VAT-able)" : "  Stones"} value={npr(stonesTotal)} />
            <Row label="  Gold + Making + Wastage" value={npr(tax.nonStoneTotal)} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <NumberField className="h-8 w-28 text-right" value={discount}
                onChange={(v) => { setDiscount(v); setTargetTotal(""); }} />
            </div>
            {settings.vat_enabled && <Row label={`VAT ${settings.vat_rate}% (stones only)`} value={npr(tax.vat)} />}
            <Row label={`SD tax ${settings.sd_tax_rate}% (gold+making − old metal)`} value={npr(tax.sdTax)} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Old metal credit</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setOgOpen(true)} title="New old metal purchase">
                  <Coins className="h-3.5 w-3.5" />
                </Button>
                <NumberField className="h-8 w-28 text-right" value={oldGoldCredit} onChange={(v) => setOldGoldCredit(v)} />
              </div>
            </div>
            {oldGoldEq && <div className="-mt-1 text-right text-xs text-muted-foreground">{oldGoldEq}</div>}
            {appliedOldMetalAdv > 0 && (
              <div className="-mt-1 text-right text-xs text-muted-foreground">
                incl. old metal advance of {npr(appliedOldMetalAdv)} from the order
                {oldMetalKept > 0 && <> · {npr(oldMetalKept)} saved for the remaining items</>}
              </div>
            )}

            <div className="flex justify-between border-t pt-3 text-base font-semibold"><span>Total</span><span>{npr(tax.total)}</span></div>

            {(advance > 0 || advanceOldMetal > 0) && (
              <div className="rounded-md border p-2 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">Order advances</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAdvDialogOpen(true)}>Adjust</Button>
                </div>
                {advanceOldMetal > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Old metal advance {npr(advanceOldMetal)}</span>
                    <span>applied {npr(appliedOldMetalAdv)}</span>
                  </div>
                )}
                {advance > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Cash advance {npr(advance)}</span>
                    <span>applied {npr(advanceRequested)}</span>
                  </div>
                )}
                {(advanceKept > 0 || oldMetalKept > 0) && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Saved for the remaining items: {npr(round2(advanceKept + oldMetalKept))}
                  </div>
                )}
              </div>
            )}

            {appliedAdvance > 0 && (
              <>
                <Row label="Less: cash advance received" value={`− ${npr(appliedAdvance)}`} />
                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                  <span>Net payable</span><span>{npr(netPayable)}</span>
                </div>
              </>
            )}

            {refundDue > 0 && (
              <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Refund to customer</span>
                  <NumberField className="h-8 w-28 text-right" value={refund}
                    onChange={(v) => setRefundInput(String(v))} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Refund mode</span>
                  <Select value={refundMethod} onValueChange={setRefundMethod}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.filter((m) => m !== "old_gold" && m !== "credit").map((m) => (
                        <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Advance exceeds the bill by {npr(refundDue)}.
                  {refund < refundDue && <> {npr(round2(refundDue - refund))} stays on the order for the remaining items.</>}
                </p>
              </div>
            )}

            <div className="rounded-md border bg-muted/40 p-2">
              <Label className="text-xs">
                {refundDue > 0 ? "Set refund amount (auto-discount)" : "Set net payable amount (auto-discount)"}
              </Label>
              <div className="mt-1 flex gap-2">
                <NumberField placeholder="e.g. 150000" value={targetTotal} onChange={(v) => setTargetTotal(v ? String(v) : "")} />
                <Button size="sm" variant="secondary" onClick={applyTargetTotal}>Apply</Button>
              </div>
              {refundDue > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Money handed back after the {npr(advanceRequested)} advance covers this bill.
                </p>
              ) : appliedAdvance > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Amount the customer pays now, after the {npr(appliedAdvance)} cash advance.
                </p>
              ) : null}
            </div>


            <div>
              <div className="flex items-center justify-between">
                <Label>Payments</Label>
                <Button size="sm" variant="ghost"
                  onClick={() => setPayments((p) => [...p, { method: "cash", amount: Math.max(0, tax.total - paid) }])}>
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
              <div className="mt-1 space-y-2">
                {payments.map((p, i) => (
                  <div key={i} className="flex gap-1">
                    <Select value={p.method} onValueChange={(v) => setPayments((arr) => arr.map((x, j) => j === i ? { ...x, method: v } : x))}>
                      <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                    <NumberField className="h-9 w-28 text-right" value={p.amount}
                      onChange={(v) => setPayments((arr) => arr.map((x, j) => j === i ? { ...x, amount: v } : x))} />
                    {payments.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-9 w-9"
                        onClick={() => setPayments((arr) => arr.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Paid: {npr(paid)}{appliedAdvance > 0 ? ` (incl. advance ${npr(appliedAdvance)})` : ""}</span>
                <span>Balance: {npr(balance)}</span>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={checkout} disabled={saving || cart.length === 0 || !customerId}>
              {saving ? "Processing..." : "Complete Sale"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <NewCustomerDialog open={newCustOpen} onOpenChange={setNewCustOpen}
        onSaved={async (id) => { setNewCustOpen(false); await loadCustomers(); setCustomerId(id); }} />
      <OldGoldPurchaseDialog open={ogOpen} onOpenChange={setOgOpen}
        initialCustomer={customers.find((c) => c.id === customerId) ? { id: customerId!, full_name: customers.find((c) => c.id === customerId)!.full_name, phone: customers.find((c) => c.id === customerId)!.phone ?? null } : null}
        onSaved={(result) => { setOgOpen(false); setOldGoldCredit(result.total); setOldGoldPurchaseId(result.id); setOldGoldMetal(result.metal ?? "gold"); toast.success(`Old metal credit set to ${npr(result.total)}`); }} />
      <OrderPickerDialog open={orderPickerOpen} onOpenChange={setOrderPickerOpen} customerId={customerId}
        onPick={(id) => { setOrderPickerOpen(false); void loadOrder(id); }} />
      <ItemDialog open={newItemOpen} onOpenChange={setNewItemOpen}
        editing={null} cats={categories as any} locs={locations as any}
        onSaved={(created) => {
          setNewItemOpen(false);
          if (created) { addToCart(created); toast.success(`${created.sku} added to sale`); }
        }} />
      <ItemDialog open={!!editItem} onOpenChange={(v) => !v && setEditItem(null)}
        editing={editItem?.item ?? null} cats={categories as any} locs={locations as any}
        onSaved={async () => {
          if (!editItem) return;
          const { data } = await supabase.from("inventory_items").select("*").eq("id", editItem.item.id).maybeSingle();
          if (data) {
            setCart((c) => c.map((r, i) => i === editItem.row ? recompute({
              ...r,
              description: `${data.name} (${data.sku})`,
              metal: data.metal, purity: data.purity,
              gross_weight: Number(data.gross_weight ?? data.net_weight ?? 0),
              stone_weight: Number(data.stone_weight ?? 0),
              weight: Number(data.net_weight),
              stone_value: Number(data.stone_value ?? 0),
              making_input: Number(data.making_charge ?? 0),
              making_type: (data.making_charge_type ?? "per_gram") as any,
              wastage_input: Number(data.wastage_value ?? 0),
              wastage_type: (data.wastage_type ?? "percentage") as any,
              raw_item: data,
            }) : r));
            toast.success("Item updated");
          }
          setEditItem(null);
        }} />
    </AppLayout>
  );
}

function NewCustomerDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: (id: string) => void;
}) {
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setName(""); setPhone(""); setEmail(""); setAddress(""); } }, [open]);
  async function save() {
    if (!full_name.trim()) return toast.error("Name required");
    setSaving(true);
    const { data, error } = await supabase.from("customers").insert({
      full_name: full_name.trim(), phone: phone || null, email: email || null, address: address || null,
    } as any).select("id").single();
    setSaving(false);
    if (error) {
      if (error.code === "23505") return toast.error("A customer with this phone number already exists — search for them instead of adding a new one.");
      return toast.error(error.message);
    }
    onSaved(data.id);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name *</Label><Input value={full_name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OldGoldPurchaseDialog({ open, onOpenChange, initialCustomer, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initialCustomer: PickedCustomer | null; onSaved: (r: OldGoldSaveResult) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Coins className="h-5 w-5" /> Old Metal Purchase</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Applies as credit toward this sale. ID document and photo are required for every gold purchase.</p>
        {open && <OldGoldForm compact initialCustomer={initialCustomer} submitLabel="Create & Apply to Sale" onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

export function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/50 pb-0.5 sm:justify-start sm:gap-1 sm:border-0">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}


function OrderPickerDialog({ open, onOpenChange, customerId, onPick }: {
  open: boolean; onOpenChange: (v: boolean) => void; customerId: string | null; onPick: (orderId: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!open) return;
    let q = supabase.from("orders")
      .select("id, order_no, order_date, promised_date, estimated_total, advance_paid, customers(full_name), order_items(id, status, quantity, received_qty, stocked_qty, billed_qty)")
      .in("status", ["open", "in_production", "ready"])
      .order("order_date", { ascending: false });
    if (customerId) q = q.eq("customer_id", customerId);
    q.then(({ data }) => setRows((data ?? []).filter((o: any) => (o.order_items ?? []).some((i: any) => lineProgress(i).billable > 0))));
  }, [open, customerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bill a custom order</DialogTitle></DialogHeader>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No orders with finished items ready to bill{customerId ? " for this customer" : ""}.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded border">
            {rows.map((o) => (
              <button key={o.id} onClick={() => onPick(o.id)}
                className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted">
                <div>
                  <div className="font-medium">{o.order_no} · {o.customers?.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    Ordered {o.order_date}{o.promised_date ? ` · promised ${o.promised_date}` : ""} ·
                    {" "}{(o.order_items ?? []).reduce((a: number, i: any) => a + lineProgress(i).billable, 0)} pc ready
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div>{npr(o.estimated_total)}</div>
                  {Number(o.advance_paid) > 0 && <div className="text-muted-foreground">adv {npr(o.advance_paid)}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
