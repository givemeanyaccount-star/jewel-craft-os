import { CHANGE_NOTE, CUSTOMER_ADVANCE_REF, round2 } from "@/lib/format";

export const SETTLEMENT_METHODS = ["cash", "bank_transfer", "esewa", "khalti", "fonepay", "other"] as const;
export type SettlementMethod = typeof SETTLEMENT_METHODS[number];

export interface DayClosePayment {
  id: string;
  amount: number | string;
  method: string;
  paid_at: string;
  reference?: string | null;
  notes?: string | null;
  customer_id?: string | null;
  invoice_id?: string | null;
  order_id?: string | null;
  customers?: { full_name?: string | null } | null;
  invoices?: { invoice_number?: string | null; issued_at?: string | null } | null;
  orders?: { order_no?: string | null } | null;
}

export interface AdvanceEvent {
  id: string;
  customer_id: string;
  payment_id?: string | null;
  event: string;
  amount: number | string;
  paid_at?: string | null;
  created_at: string;
}

export interface OldMetalPayout {
  id: string;
  receipt_number: string;
  customer_name?: string | null;
  total_amount: number | string;
  payment_method: string;
  purchased_at: string;
  linked_invoice_id?: string | null;
}

export interface ChannelTotal {
  method: SettlementMethod;
  received: number;
  paidOut: number;
  expected: number;
}

export interface AdvanceMovement {
  opening: number;
  received: number;
  applied: number;
  adjustments: number;
  reversed: number;
  closing: number;
  customerHeld: number;
  orderHeld: number;
}

const money = (value: unknown) => Number(value ?? 0) || 0;

/** Calendar day in the shop's timezone, rather than the browser or UTC day. */
export function nepalDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function isStandaloneOldMetalPayout(purchase: OldMetalPayout, tradeInReceipts: Set<string>): boolean {
  return !purchase.linked_invoice_id && !tradeInReceipts.has(purchase.receipt_number);
}

/**
 * Actual money movement on the selected Nepal day. Old-metal trade-in and credit
 * are deliberately excluded: neither is cash, a wallet receipt, nor a bank receipt.
 * Standalone old-metal purchases are payouts; trade-ins linked to a payment credit
 * or invoice are not paid out a second time.
 */
export function settlementTotals(
  payments: DayClosePayment[],
  oldMetalPurchases: OldMetalPayout[],
  date: string,
): { channels: ChannelTotal[]; expected: number; oldMetalCredit: number; creditSales: number } {
  const rows = new Map<SettlementMethod, ChannelTotal>(SETTLEMENT_METHODS.map((method) => [method, {
    method, received: 0, paidOut: 0, expected: 0,
  }]));
  const tradeInReceipts = new Set(payments.filter((p) => p.method === "old_gold" && p.reference).map((p) => String(p.reference)));
  let oldMetalCredit = 0;
  let creditSales = 0;

  for (const payment of payments) {
    if (nepalDate(payment.paid_at) !== date) continue;
    const amount = money(payment.amount);
    if (payment.method === "old_gold") { oldMetalCredit += Math.max(0, amount); continue; }
    if (payment.method === "credit") { creditSales += Math.max(0, amount); continue; }
    if (!SETTLEMENT_METHODS.includes(payment.method as SettlementMethod)) continue;
    const row = rows.get(payment.method as SettlementMethod)!;
    if (amount >= 0) row.received += amount;
    else row.paidOut += -amount;
  }

  for (const purchase of oldMetalPurchases) {
    if (nepalDate(purchase.purchased_at) !== date || !isStandaloneOldMetalPayout(purchase, tradeInReceipts)) continue;
    const method = SETTLEMENT_METHODS.includes(purchase.payment_method as SettlementMethod)
      ? purchase.payment_method as SettlementMethod : "other";
    rows.get(method)!.paidOut += Math.max(0, money(purchase.total_amount));
  }

  const channels = Array.from(rows.values()).map((row) => ({
    ...row, received: round2(row.received), paidOut: round2(row.paidOut), expected: round2(row.received - row.paidOut),
  }));
  return {
    channels,
    expected: round2(channels.reduce((sum, row) => sum + row.expected, 0)),
    oldMetalCredit: round2(oldMetalCredit),
    creditSales: round2(creditSales),
  };
}

function emptyMovement(): AdvanceMovement {
  return { opening: 0, received: 0, applied: 0, adjustments: 0, reversed: 0, closing: 0, customerHeld: 0, orderHeld: 0 };
}

/** Apply one signed balance change and expose its daily business meaning. */
function addAdvanceEntry(
  total: AdvanceMovement,
  date: string,
  entryDate: string,
  signedAmount: number,
  kind: "received" | "applied" | "adjusted" | "reversed",
  balance: "customerHeld" | "orderHeld",
) {
  if (!entryDate || entryDate > date) return;
  if (entryDate < date) total.opening += signedAmount;
  total.closing += signedAmount;
  total[balance] += signedAmount;
  if (entryDate !== date) return;
  if (kind === "received") total.received += signedAmount;
  else if (kind === "applied") total.applied += -signedAmount;
  else if (kind === "reversed") total.reversed += -signedAmount;
  else total.adjustments += signedAmount;
}

function addAdvancePayment(
  total: AdvanceMovement,
  payment: DayClosePayment,
  date: string,
  balance: "customerHeld" | "orderHeld",
) {
  const received = Math.max(0, money(payment.amount));
  if (received) addAdvanceEntry(total, date, nepalDate(payment.paid_at), received, "received", balance);
  const appliedOn = payment.invoice_id ? nepalDate(payment.invoices?.issued_at) : "";
  if (received && appliedOn) addAdvanceEntry(total, date, appliedOn, -received, "applied", balance);
}

/**
 * Reconstruct opening and closing held advances. Customer advances use their audit
 * events (including adjustment and reversal); order advances use the original paid
 * date and the linked bill date. Split payment rows still sum to the original advance.
 */
export function advanceMovement(
  payments: DayClosePayment[],
  events: AdvanceEvent[],
  date: string,
): AdvanceMovement {
  const total = emptyMovement();
  const customersWithEvents = new Set(events.map((event) => event.customer_id));

  for (const event of events) {
    const effective = event.event === "created" ? event.paid_at ?? event.created_at : event.created_at;
    const kind = event.event === "created" ? "received"
      : event.event === "applied" ? "applied"
        : event.event === "reversed" ? "reversed" : "adjusted";
    addAdvanceEntry(total, date, nepalDate(effective), money(event.amount), kind, "customerHeld");
  }

  for (const payment of payments) {
    if (payment.method === "old_gold" || money(payment.amount) <= 0) continue;
    if (payment.order_id) addAdvancePayment(total, payment, date, "orderHeld");
    else if (payment.reference === CUSTOMER_ADVANCE_REF && !customersWithEvents.has(String(payment.customer_id))) {
      // Compatibility for advances recorded before the audit-event ledger existed.
      addAdvancePayment(total, payment, date, "customerHeld");
    }
  }

  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, round2(value)])) as unknown as AdvanceMovement;
}

export function paymentActivityLabel(payment: DayClosePayment): string {
  const amount = money(payment.amount);
  if (amount < 0) {
    return `${payment.notes ?? ""} ${payment.reference ?? ""}`.includes(CHANGE_NOTE) || payment.reference === "CHANGE"
      ? "Change returned" : "Refund paid";
  }
  if (payment.method === "old_gold") return "Old metal credit";
  if (payment.method === "credit") return "Credit sale";
  if (payment.reference === "ADVANCE") return "Advance paid at sale";
  if (payment.order_id) return payment.invoice_id ? "Order advance applied" : "Order advance held";
  if (payment.reference === CUSTOMER_ADVANCE_REF) return payment.invoice_id ? "Saved advance applied" : "Customer advance held";
  return payment.invoice_id ? "Bill payment" : "Other receipt";
}

export function reconciliationDifference(expected: number, actual: string): number | null {
  if (!actual.trim()) return null;
  const parsed = Number(actual);
  return Number.isFinite(parsed) ? round2(parsed - expected) : null;
}

/** Range through complete datasets instead of relying on Supabase's default row cap. */
export async function loadAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < size) return rows;
  }
}
