# Dashboard Rearrangement

A cleaner, more professional dashboard organised top-to-bottom in the order you asked for.

## New layout (top to bottom)

1. **Quick actions bar** — prominent buttons: New Sale, New Purchase, New Repair. Each only shows if the signed-in role has the matching permission.
2. **Metal rates panel** — today's rates shown per tola and per 10 g:
   - Gold 24K, Gold 22K
   - Silver (fine and 925)
   Each rate tile carries a small sparkline/line chart of the last 7 days of that rate. A "Update rates" link goes to Metal Rates.
3. **Alerts & operations row**
   - Outstanding credit total + number of customers with dues (links to credit ledger)
   - Repair jobs by stage (Received / In progress / Quality check / Ready)
   - Missing-ID old gold purchases alert (only when count > 0)
   - Pending credit summary card
4. **Activity row**
   - Recent invoices list
   - Recent purchases list (supplier purchases + old gold), side by side on desktop, stacked on mobile
5. **Sales vs Purchases bar chart** — daily totals over the last 14 days, two series on a simple timeline.

Secondary KPI tiles (items in stock, customers, items sold today, today's sales) move into a compact strip under the quick actions so the page stays scannable rather than stacked with big cards.

## Technical notes

- All work is in `src/pages/Dashboard.tsx` plus small new presentational components (rate tile, sales/purchase chart) under `src/components/dashboard/`.
- Charts use `recharts` (already installed) wrapped in the existing chart styling; colors come from semantic tokens, no hardcoded hex.
- Tola conversion uses 1 tola = 11.6638 g, added as a constant in `src/lib/format.ts`.
- New queries added to the existing `Promise.all` in `load()`:
  - `metal_rates` for the last 7 days for gold 24K/22K and silver purities (single query, grouped client-side)
  - `invoices` (issued_at, total) and `purchases` (purchase_date, total_amount) + `old_gold_purchases` for the last 14 days, aggregated per day in the client
  - recent `purchases` rows for the activity list
- Quick action buttons route to `/pos`, `/purchases`, `/repairs` and are gated by `usePermission`.
- No database or business-logic changes; presentation only.
