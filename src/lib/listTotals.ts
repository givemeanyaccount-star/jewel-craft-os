const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Cancelled bills are counted but add nothing to value, balance or weight. */
export function invoiceTotals(rows: any[]) {
  const live = rows.filter((r) => r.status !== "cancelled");
  return {
    count: rows.length,
    value: r2(live.reduce((a, r) => a + n(r.total), 0)),
    balance: r2(live.reduce((a, r) => a + n(r.balance_due), 0)),
    weight: r3(live.reduce((a, r) => a + (r.invoice_items ?? []).reduce((b: number, i: any) => b + n(i.weight) * (n(i.quantity) || 1), 0), 0)),
  };
}

/** Stock value is an estimate: fine weight × latest pure-metal rate, plus stone value. */
export function inventoryTotals(rows: any[], rates: { gold?: number; silver?: number }) {
  let value = 0, net = 0, fine = 0;
  for (const r of rows) {
    net += n(r.net_weight); fine += n(r.fine_weight);
    const rate = r.metal === "silver" ? n(rates.silver) : r.metal === "gold" ? n(rates.gold) : 0;
    value += n(r.fine_weight) * rate + n(r.stone_value);
  }
  return { count: rows.length, value: r2(value), weight: r3(net), fine: r3(fine) };
}

export function orderTotals(rows: any[]) {
  let advance = 0, value = 0, weight = 0;
  for (const o of rows) {
    advance += n(o.advance_paid);
    const items = o.order_items ?? [];
    value += n(o.estimated_total) || items.reduce((a: number, i: any) => a + n(i.estimated_amount), 0);
    weight += items.reduce((a: number, i: any) => a + n(i.expected_net_weight) * (n(i.quantity) || 1), 0);
  }
  return { count: rows.length, value: r2(value), advance: r2(advance), weight: r3(weight) };
}
