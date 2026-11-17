import { TOLA_GRAMS } from "@/lib/format";

export interface StockItem {
  id: string;
  sku: string;
  legacy_code: string | null;
  name: string;
  metal: string;
  purity: string;
  status: string;
  category_id: string | null;
  location_id: string | null;
  gross_weight: number;
  stone_weight: number;
  net_weight: number;
  fine_weight: number;
}

export interface StockFilters {
  category: string;
  location: string;
  metal: string;
  purity: string;
  status: string;
  search: string;
}

export function filterStock(items: StockItem[], filters: StockFilters) {
  const query = filters.search.trim().toLowerCase();
  return items.filter((item) =>
    (filters.status === "live" ? ["in_stock", "reserved"].includes(item.status) : item.status === filters.status) &&
    (filters.category === "all" || (item.category_id ?? "uncategorized") === filters.category) &&
    (filters.location === "all" || (item.location_id ?? "unassigned") === filters.location) &&
    (filters.metal === "all" || item.metal === filters.metal) &&
    (filters.purity === "all" || item.purity === filters.purity) &&
    (!query || [item.sku, item.legacy_code ?? "", item.name].some((value) => value.toLowerCase().includes(query)))
  );
}

export interface StockBalance {
  key: string;
  categoryId: string | null;
  metal: string;
  purity: string;
  pieces: number;
  available: number;
  reserved: number;
  gross: number;
  stone: number;
  net: number;
  fine: number;
}

export function stockTotals(items: StockItem[]) {
  return items.reduce((total, item) => ({
    pieces: total.pieces + 1,
    available: total.available + (item.status === "in_stock" ? 1 : 0),
    reserved: total.reserved + (item.status === "reserved" ? 1 : 0),
    gross: total.gross + Number(item.gross_weight),
    stone: total.stone + Number(item.stone_weight),
    net: total.net + Number(item.net_weight),
    fine: total.fine + Number(item.fine_weight),
  }), { pieces: 0, available: 0, reserved: 0, gross: 0, stone: 0, net: 0, fine: 0 });
}

/** Never combine different metals into a fine-metal balance. */
export function stockBalances(items: StockItem[], byPurity: boolean): StockBalance[] {
  const groups = new Map<string, StockItem[]>();
  for (const item of items) {
    const key = JSON.stringify([item.category_id, item.metal, byPurity ? item.purity : ""]);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return Array.from(groups, ([key, group]) => ({
    key, categoryId: group[0].category_id, metal: group[0].metal,
    purity: byPurity ? group[0].purity : "", ...stockTotals(group),
  }));
}

export function stockWeight(value: number, unit: string) {
  return (unit === "tola" ? value / TOLA_GRAMS : value).toFixed(3);
}

/** Range through the complete result rather than silently truncating stock. */
export async function loadAllStock<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const items: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    items.push(...page);
    if (page.length < size) return items;
  }
}