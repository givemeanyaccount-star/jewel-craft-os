/**
 * Local draft of an unfinished sale.
 *
 * The bill lives only in React state while it is being built, so leaving the
 * page used to throw everything away. We mirror it into localStorage (never the
 * database — an unposted bill stays private to this counter) so the sale
 * survives navigation, a reload, or an accidental back press.
 */

const KEY = "jm.pos.draft.v1";

export interface PosDraft {
  v: 1;
  userId: string | null;
  savedAt: string;
  /** What this bill was started from, so a different order/quote doesn't silently mix in. */
  source: { kind: "order" | "quotation" | "none"; id: string | null };
  state: Record<string, any>;
}

export function loadPosDraft(): PosDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as PosDraft;
    if (!d || d.v !== 1 || !d.state) return null;
    return d;
  } catch {
    return null;
  }
}

export function savePosDraft(draft: Omit<PosDraft, "v" | "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, v: 1, savedAt: new Date().toISOString() }));
  } catch {
    /* quota or private mode — the sale still works, it just isn't recoverable */
  }
}

export function clearPosDraft() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** A draft only matters once it has a customer or at least one line. */
export function draftHasContent(d: PosDraft | null): boolean {
  if (!d) return false;
  const s = d.state ?? {};
  return !!s.customerId || (Array.isArray(s.cart) && s.cart.length > 0);
}

/* ------------------------------------------------------------------ */
/* Held bills (park & queue)                                           */
/*                                                                     */
/* A counter often has to interrupt one bill to serve someone urgent.  */
/* Parking puts the unfinished bill in a local queue and frees the     */
/* screen; nothing is written to the database, so invoice numbers are  */
/* still issued only at the moment a bill is posted — whichever bill   */
/* is completed first takes the next number and the sequence never     */
/* skips.                                                              */
/* ------------------------------------------------------------------ */

const HELD_KEY = "jm.pos.held.v1";

export interface HeldBill {
  id: string;
  label: string;
  savedAt: string;
  userId: string | null;
  source: PosDraft["source"];
  state: Record<string, any>;
}

export function listHeldBills(): HeldBill[] {
  try {
    const raw = localStorage.getItem(HELD_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as HeldBill[]).filter((b) => b && b.id && b.state) : [];
  } catch {
    return [];
  }
}

function writeHeld(list: HeldBill[]) {
  try { localStorage.setItem(HELD_KEY, JSON.stringify(list.slice(0, 30))); } catch { /* ignore */ }
}

/** Park a bill at the front of the queue. Returns the new queue. */
export function holdBill(bill: Omit<HeldBill, "id" | "savedAt">): HeldBill[] {
  const entry: HeldBill = {
    ...bill,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };
  const list = [entry, ...listHeldBills()];
  writeHeld(list);
  return list;
}

export function removeHeldBill(id: string): HeldBill[] {
  const list = listHeldBills().filter((b) => b.id !== id);
  writeHeld(list);
  return list;
}

/** Pull a parked bill back onto the counter (it becomes the active draft). */
export function resumeHeldBill(id: string): HeldBill | null {
  const bill = listHeldBills().find((b) => b.id === id) ?? null;
  if (!bill) return null;
  savePosDraft({ userId: bill.userId, source: bill.source, state: bill.state });
  removeHeldBill(id);
  return bill;
}

/* ------------------------------------------------------------------ */
/* Backend-held bills (shared across counters)                         */
/*                                                                     */
/* Parking now writes to the database so any counter can see and pick  */
/* up the queue. Resuming removes the row, which is what stops two     */
/* people finishing the same bill. If the network is down we fall back */
/* to the local queue above so the counter keeps working.              */
/* ------------------------------------------------------------------ */

import { supabase } from "@/integrations/supabase/client";

export interface SharedHeldBill extends HeldBill {
  ownerName: string;
  remote: boolean;
  itemCount: number;
  total: number;
}

function billFigures(state: Record<string, any>) {
  const cart = Array.isArray(state?.cart) ? state.cart : [];
  return {
    itemCount: cart.length,
    total: cart.reduce((a: number, r: any) => a + Number(r.line_total ?? 0), 0),
  };
}

export async function fetchSharedHeldBills(): Promise<SharedHeldBill[]> {
  const local = listHeldBills().map((b) => ({
    ...b,
    ownerName: "This counter (offline)",
    remote: false,
    ...billFigures(b.state),
  }));
  const { data, error } = await supabase
    .from("pos_held_bills")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error || !data) return local;
  const remote: SharedHeldBill[] = data.map((r: any) => ({
    id: r.id,
    label: r.label ?? "Bill",
    savedAt: r.updated_at ?? r.created_at,
    userId: r.owner_id,
    source: { kind: (r.source_kind ?? "none") as any, id: r.source_id ?? null },
    state: (r.state ?? {}) as Record<string, any>,
    ownerName: r.owner_name || "Counter",
    remote: true,
    itemCount: Number(r.item_count ?? 0),
    total: Number(r.total ?? 0),
  }));
  return [...remote, ...local];
}

export async function parkBillShared(bill: {
  label: string;
  ownerName: string;
  userId: string | null;
  source: PosDraft["source"];
  state: Record<string, any>;
  customerName?: string | null;
}): Promise<boolean> {
  const f = billFigures(bill.state);
  if (!bill.userId) { holdBill(bill); return false; }
  const { error } = await supabase.from("pos_held_bills").insert({
    owner_id: bill.userId,
    owner_name: bill.ownerName,
    label: bill.label,
    source_kind: bill.source.kind,
    source_id: bill.source.id,
    customer_name: bill.customerName ?? null,
    item_count: f.itemCount,
    total: f.total,
    state: bill.state as any,
  });
  if (error) { holdBill(bill); return false; }
  return true;
}

/** Take a parked bill over: it leaves the shared queue and becomes this counter's draft. */
export async function claimSharedHeldBill(bill: SharedHeldBill): Promise<boolean> {
  if (!bill.remote) return !!resumeHeldBill(bill.id);
  const { data, error } = await supabase
    .from("pos_held_bills").delete().eq("id", bill.id).select("id");
  if (error || !data?.length) return false;
  savePosDraft({ userId: bill.userId, source: bill.source, state: bill.state });
  return true;
}

export async function discardSharedHeldBill(bill: SharedHeldBill): Promise<boolean> {
  if (!bill.remote) { removeHeldBill(bill.id); return true; }
  const { error } = await supabase.from("pos_held_bills").delete().eq("id", bill.id);
  return !error;
}
