import { get, set, del, keys } from "idb-keyval";
import type { Disposition, RefundCalc } from "@/lib/returns";

const INVOICE_PREFIX = "invoice:";
const DRAFT_KEY = "returnDraft:current";
const QUEUE_KEY = "returnQueue";
const MAX_INVOICES = 25;

export interface InvoiceSnapshot {
  invoice: any;
  items: any[];
  cachedAt: string;
}

export interface LocalSelection {
  invoiceId: string;
  lines: Record<string, { selected: boolean; disposition: Disposition }>;
  method: string;
  reason: string;
  draftId: string | null;
  savedAt: string;
}

export interface QueuedReturn {
  clientId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  snapshot: InvoiceSnapshot;
  selectedIds: string[];
  dispositions: Record<string, Disposition>;
  calc: RefundCalc;
  discountRatio: number;
  method: string;
  reason: string;
  draftId: string | null;
  queuedAt: string;
  error?: string | null;
}

/* ---------- invoice snapshots (LRU capped) ---------- */

export async function cacheInvoice(invoice: any, items: any[]) {
  const snap: InvoiceSnapshot = { invoice, items, cachedAt: new Date().toISOString() };
  await set(INVOICE_PREFIX + invoice.id, snap);
  await trimInvoices();
}

async function trimInvoices() {
  const all = await listInvoiceSnapshots();
  if (all.length <= MAX_INVOICES) return;
  const stale = all.slice(MAX_INVOICES);
  await Promise.allSettled(stale.map((s) => del(INVOICE_PREFIX + s.invoice.id)));
}

export async function getCachedInvoice(id: string): Promise<InvoiceSnapshot | undefined> {
  return (await get(INVOICE_PREFIX + id)) as InvoiceSnapshot | undefined;
}

/** Newest first. */
export async function listInvoiceSnapshots(): Promise<InvoiceSnapshot[]> {
  const ks = (await keys()) as string[];
  const snaps = await Promise.all(
    ks.filter((k) => typeof k === "string" && k.startsWith(INVOICE_PREFIX)).map((k) => get(k) as Promise<InvoiceSnapshot>)
  );
  return snaps
    .filter(Boolean)
    .sort((a, b) => (a.cachedAt < b.cachedAt ? 1 : -1));
}

export async function searchCachedInvoices(q: string): Promise<InvoiceSnapshot[]> {
  const s = q.toLowerCase().trim();
  const all = await listInvoiceSnapshots();
  if (!s) return all;
  return all.filter((snap) => {
    const inv = snap.invoice;
    return [inv.invoice_number, inv.customers?.full_name].filter(Boolean).some((v: string) => v.toLowerCase().includes(s));
  });
}

/* ---------- in-progress selection ---------- */

export async function saveLocalSelection(sel: Omit<LocalSelection, "savedAt">) {
  await set(DRAFT_KEY, { ...sel, savedAt: new Date().toISOString() } as LocalSelection);
}

export async function getLocalSelection(): Promise<LocalSelection | undefined> {
  return (await get(DRAFT_KEY)) as LocalSelection | undefined;
}

export async function clearLocalSelection() {
  await del(DRAFT_KEY);
}

/* ---------- offline queue ---------- */

export async function getQueue(): Promise<QueuedReturn[]> {
  return ((await get(QUEUE_KEY)) as QueuedReturn[] | undefined) ?? [];
}

export async function enqueueReturn(item: Omit<QueuedReturn, "clientId" | "queuedAt">): Promise<QueuedReturn> {
  const queued: QueuedReturn = {
    ...item,
    clientId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `q-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    queuedAt: new Date().toISOString(),
  };
  const q = await getQueue();
  await set(QUEUE_KEY, [...q, queued]);
  return queued;
}

export async function removeQueued(clientId: string) {
  const q = await getQueue();
  await set(QUEUE_KEY, q.filter((i) => i.clientId !== clientId));
}

export async function markQueuedError(clientId: string, error: string) {
  const q = await getQueue();
  await set(QUEUE_KEY, q.map((i) => (i.clientId === clientId ? { ...i, error } : i)));
}
