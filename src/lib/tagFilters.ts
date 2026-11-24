export interface TagListItem {
  id: string; sku: string; name: string; metal: string; purity: string; net_weight: number; gross_weight: number;
  category_id: string | null; status: string; qr_code: string | null; legacy_code: string | null; barcode: string | null; created_at: string;
}
export interface TagFilter { q: string; category: string; metal: string; status: string; added: "any" | "today" | "week" | "month"; unprinted: boolean }

const DAY = 86400000;
/** Filter stock for tag printing. Exact code matches (SKU, QR, barcode, old record) sort first. */
export function filterTagItems<T extends TagListItem>(items: T[], f: TagFilter, printed: Set<string>, now = Date.now()): T[] {
  const q = f.q.trim().toLowerCase();
  const since = f.added === "today" ? new Date(new Date(now).toDateString()).getTime() : f.added === "week" ? now - 7 * DAY : f.added === "month" ? now - 30 * DAY : 0;
  const codes = (i: T) => [i.sku, i.qr_code, i.barcode, i.legacy_code].map((c) => (c ?? "").toLowerCase());
  const out = items.filter((i) => {
    if (f.status !== "any_status" && i.status !== f.status) return false;
    if (f.category !== "all" && i.category_id !== f.category) return false;
    if (f.metal !== "all" && i.metal !== f.metal) return false;
    if (since && new Date(i.created_at).getTime() < since) return false;
    if (f.unprinted && printed.has(i.id)) return false;
    return !q || [...codes(i), i.name.toLowerCase()].some((c) => c.includes(q));
  });
  if (!q) return out;
  return [...out.filter((i) => codes(i).includes(q)), ...out.filter((i) => !codes(i).includes(q))];
}
