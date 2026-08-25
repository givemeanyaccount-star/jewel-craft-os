import { round2, classifyPayment, type PayRow, type PaymentKind } from "@/lib/format";

/**
 * Accounting view of the `payments` rows of a bill.
 *
 * Every money movement — receipts, refund payouts and over-tender change — is a row
 * here, so the payment-mode summary on screen/paper and the ledger used by reports
 * are derived from exactly the same data and always add up:
 *
 *   received − paidOut = net = invoice amount_paid
 */

export const PAYMENT_MODE_LABEL: Record<string, string> = {
  cash: "Cash", card: "Card", bank_transfer: "Bank Transfer", esewa: "eSewa",
  khalti: "Khalti", fonepay: "Fonepay", credit: "Credit", old_gold: "Old Metal", other: "Other",
};

export const modeLabel = (m?: string | null) =>
  PAYMENT_MODE_LABEL[String(m ?? "other")] ?? String(m ?? "other").replace(/_/g, " ");

export const KIND_LABEL: Record<PaymentKind, string> = {
  old_metal: "Old metal credit",
  advance: "Advance applied",
  sale: "Payment received",
  refund: "Refund paid out",
  change: "Change returned",
};

export interface ModeSummaryRow {
  method: string;
  label: string;
  received: number;
  paidOut: number;
  net: number;
}

export interface ModeSummary {
  rows: ModeSummaryRow[];
  received: number;
  paidOut: number;
  net: number;
}

/** Mode-wise receipts and payouts, negative rows included as payouts. */
export function paymentModeSummary(payments: PayRow[] = []): ModeSummary {
  const map = new Map<string, ModeSummaryRow>();
  for (const p of payments) {
    const amt = Number(p?.amount ?? 0) || 0;
    if (!amt) continue;
    const method = String(p?.method ?? "other");
    const row = map.get(method) ?? { method, label: modeLabel(method), received: 0, paidOut: 0, net: 0 };
    if (amt > 0) row.received = round2(row.received + amt);
    else row.paidOut = round2(row.paidOut - amt);
    row.net = round2(row.received - row.paidOut);
    map.set(method, row);
  }
  const rows = Array.from(map.values());
  const received = round2(rows.reduce((s, r) => s + r.received, 0));
  const paidOut = round2(rows.reduce((s, r) => s + r.paidOut, 0));
  return { rows, received, paidOut, net: round2(received - paidOut) };
}

export interface LedgerRow {
  id?: string | null;
  date: string | null;
  kind: PaymentKind;
  kindLabel: string;
  method: string;
  methodLabel: string;
  /** Account that gains value (cash/bank in, or the customer account on a payout). */
  debit: string;
  /** Account that gives value. */
  credit: string;
  amount: number;      // always positive
  signedAmount: number; // negative for payouts, matches the stored row
  description: string;
}

const cashAccount = (method: string) =>
  method === "old_gold" ? "Old Metal Stock" : method === "credit" ? "Customer Receivable" : `${modeLabel(method)} Account`;

/** Double-entry rows for a bill's payments, including refund and change payouts. */
export function paymentLedgerRows(payments: PayRow[] = []): LedgerRow[] {
  return payments
    .filter((p) => (Number(p?.amount ?? 0) || 0) !== 0)
    .map((p) => {
      const signedAmount = round2(Number(p?.amount ?? 0) || 0);
      const kind = classifyPayment(p);
      const method = String(p?.method ?? "other");
      const payout = signedAmount < 0;
      return {
        id: p?.id ?? null,
        date: p?.paid_at ?? null,
        kind,
        kindLabel: KIND_LABEL[kind],
        method,
        methodLabel: modeLabel(method),
        debit: payout ? "Customer Receivable" : cashAccount(method),
        credit: payout ? cashAccount(method) : "Customer Receivable",
        amount: round2(Math.abs(signedAmount)),
        signedAmount,
        description: String(p?.notes ?? p?.reference ?? KIND_LABEL[kind]),
      };
    });
}

/** Net movement of the ledger — equals the invoice's amount_paid when it reconciles. */
export function ledgerNet(payments: PayRow[] = []): number {
  return round2(payments.reduce((s, p) => s + (Number(p?.amount ?? 0) || 0), 0));
}
