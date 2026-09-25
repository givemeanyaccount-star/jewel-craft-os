# Order date on bills, sales report date filters, locked order date

## What is wrong today
- The printed sales bill's "Order Date" shows the moment the bill record was created, not the order date typed on the sale screen. "Tran. Date" correctly uses the bill (sale) date.
- The invoice detail page and the invoices list never show the order date.

## Changes

1. **Printed bill** — "Order Date" prints the saved order date (AD and BS). If none was entered, the line shows "—". "Tran. Date" stays the sale date. Estimates print their own order date the same way.
2. **Invoice detail page** — shows "Order date" (or "—") next to the invoice date, plus the rate basis when an order date exists.
3. **Invoices list** — new "Order date" column beside the invoice date.
4. **Sales report** — two independent filter sets:
   - Sale date (from/to, with Today / This week / This month) — as now.
   - Order date (from/to, optional, with "Only bills with an order date" toggle).
   - New "Order date" column and a "Days (order to sale)" column; both in CSV export.
5. **Order date locked after posting**
   - Nobody can change a posted bill's order date through normal edits (enforced in the database, not just the screen).
   - Admin (and manager, if the permission matrix grants the new "Correct order date" permission) get a **Correct order date** button on the invoice detail page. It asks for the new date and a reason, still refuses dates after the sale date.
   - Each correction is written to the audit log: old value, new value, reason, invoice number, user, and time. It appears in Settings > Audit log as "Order date corrected".

## Technical notes
- `PrintDocument.tsx` line ~234: use `doc.order_date` instead of `doc.created_at`.
- `InvoiceDetail.tsx`, `Invoices.tsx`: select and render `order_date`, `rate_basis`.
- `SalesReport.tsx`: select `order_date`; separate server filter on `issued_at` and client/server filter on `order_date`.
- Migration: BEFORE UPDATE trigger on `invoices` rejecting `order_date` changes unless via a SECURITY DEFINER function `correct_invoice_order_date(_invoice_id, _new_date, _reason)` (sets a transaction-local flag, checks admin or permission `invoice_order_date_correct`, validates date ≤ issued_at date, updates, inserts audit row). Extend `log_audit_event` allowed actions with `order_date_corrected`; add label in `src/lib/audit.ts` and describe text in `AuditLog.tsx`; add permission key in `src/lib/permissions.ts` (default: admin only).
- Verify: typecheck, tests, browser check of print preview, invoice page, report filters, and a correction appearing in the audit log.
