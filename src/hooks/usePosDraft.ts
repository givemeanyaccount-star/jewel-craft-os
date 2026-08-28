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
