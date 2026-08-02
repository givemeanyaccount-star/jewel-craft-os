## 1. Backend changes

**New `app_settings` table** (single-row key/value or one settings row): `vat_enabled` (bool, default true), `vat_rate`, `sd_tax_rate` (default 0.5), plus room for future toggles. Readable by all signed-in staff, editable by admin/manager. Grants + RLS included.

**Invoices**: rename tax fields conceptually — keep existing `luxury_tax` / `luxury_tax_rate` columns but add `sd_tax` and `sd_tax_rate` columns (default 0.5) so historical invoices stay intact; new invoices write to the SD fields. Same for quotations.

**Cancellation support**: add `cancelled_at`, `cancel_reason`, `restocked` flags to `invoices`; refunds recorded as negative rows in `payments`.

**Custom purity**: allow any purity string (already text). Add a `purities` reference list in settings so staff can add e.g. "21K" or "916" once and reuse it.

## 2. Dashboard (`/dashboard`)

- **Repairs status card**: counts by status (received, in progress, quality check, ready, delivered-today) + list of overdue jobs past expected delivery; links to `/repairs`.
- **Pending credit card**: total outstanding, count of customers owing; clickable to a new `/credit` page listing each customer with total billed, paid, outstanding, and their partial/unpaid invoices (expandable rows, clickable through to each invoice).
- **Rate-of-the-day prompt**: on first login each day, if no `metal_rates` row exists for today, show a modal (admin/manager/accountant only) to set today's rates.

## 3. Daily rate dialog + purity engine

Modal asks for: **fine gold (24K) rate per gram** → auto-computes 22K, 18K, 14K, 9K by purity factor, each editable before save; **fine silver rate** and **925 silver** (auto-derived, editable). Option to pull from FENEGOSIDA first. Saves all rows for today's date. Same dialog reusable from Metal Rates page.

Purity selectors across Inventory / POS / Quotations become combobox-style: pick from the standard list or type a custom purity (e.g. "21K", "916"). When a custom purity has no stored rate, the rate is derived from the 24K rate × purity factor and shown as editable.

## 4. POS search bar

Remove the "Scan" label from the SKU search dialog button; render a QR-code icon-only button (with aria-label + tooltip).

## 5. Tax rework

- Delete the luxury-tax concept from the UI and calculation layer.
- **SD tax = 0.5% of (gold + making + wastage − old gold credit)**, same base as before, no threshold, skipped when old gold credit covers the base.
- **VAT toggle**: when disabled in Settings, VAT is 0 everywhere (POS, quotations, invoice/quotation printouts hide the VAT line). When enabled, current behaviour (VAT on stones portion only) applies.
- `computeInvoiceTaxes` and `discountForTargetTotal` in `src/lib/format.ts` updated accordingly; all printouts relabelled "SD Tax (0.5%)".

## 6. Settings page additions

New "Taxation" card: VAT enabled toggle, VAT rate, SD tax rate. New "Purities" card to manage the custom purity list. Admin/manager only (matches existing page guard).

## 7. Invoice status management (`/invoices/:id`)

Status dropdown on invoice detail for `issued` / `partial` → `cancelled`, with a guided dialog:
1. Confirm cancellation + reason.
2. If any amount was received, offer **refund**: records negative payment rows per method (or a single refund entry), sets `amount_paid` to 0 and `balance_due` to 0, status → `cancelled` (or `refunded` when money was returned).
3. Ask how to handle line items: **return to inventory** (restore each linked `inventory_items` row to `in_stock`; for lines with no inventory link, offer to create a new inventory item with the same details — purity, weights, making, wastage, stone value, category) or **leave as-is**.
4. Any old-gold purchase linked to the invoice is flagged, and the user is asked whether to keep or reverse it.

Cancelled invoices become read-only and are excluded from dashboard sales/credit totals.

## Technical notes

- New page `src/pages/CreditLedger.tsx` + route `/credit`; new components `DailyRateDialog.tsx`, `PuritySelect.tsx`, `CancelInvoiceDialog.tsx`; new hook `useAppSettings.ts` for the settings row.
- Migration order: settings table → invoice/quotation SD-tax columns → invoice cancellation columns.
- Existing invoices keep their stored tax values; only the display label follows the stored field that is non-zero.
