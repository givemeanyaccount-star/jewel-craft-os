# Counter bills, sales report, bill clean-up and hiding VAT

Four changes: a shared counter page for unfinished bills, a filterable sales report, the ability to clear job bills on finished repairs/orders, and removing VAT from view whenever VAT is switched off in Settings.

## 1. Counter page — active and parked bills

A new **Counter** page (linked from the sales area) lists every unfinished bill, grouped by the counter that created it.

Each row shows: counter/staff name, customer, number of items, running total, and how long ago it was parked. Two buttons per row:

- **Resume** — opens the bill on the sales screen ready to finish.
- **Discard** — removes it, with a confirmation.

Parked bills currently live only on the device that created them. To make them visible from every counter, they will be stored in the backend instead, keyed to the staff member who parked them. Resuming from another counter takes over the bill so two people cannot post the same one twice. Bill numbers are still issued only at the moment a bill is posted, so the numbering stays unbroken.

The bill being built on the current device still auto-saves locally as it does today, and appears at the top of the list as "on this counter".

## 2. Sales report

A new **Sales report** page listing posted bills with one row per bill:

`Date | Bill no. | Customer | Tola sold | Wastage (g) | Net payable | Round-off | Status`

- Tola sold is the total weight of that bill's items converted to tola; wastage is the total wastage grams.
- Date-range filter (with quick picks: today, this week, this month) plus the existing search and status filters.
- A totals strip at the bottom for the filtered range: bills, tola, wastage, net payable, round-off.
- Export to CSV for the filtered rows.
- Visible to admin, manager and accountant.

## 3. Clearing job bills on completed repairs and orders

For a repair or order that is finished, admin and manager get a **Remove bill** action on its detail page. It clears the job bill document attached to that job and leaves the repair/order record, its items and its history untouched, so the job can be re-billed if needed. A confirmation dialog states plainly what is removed.

Posted sales invoices are never deleted this way — those keep the existing cancel-with-reason flow, which preserves the numbering and the accounts.

## 4. VAT hidden when it is switched off

When "VAT on stones" is off in Settings, every VAT mention disappears: the printed bill and estimate, the invoice and quotation detail pages, the sales screen summary, and the quotation summary. The "Stones (VAT-able)" wording becomes just "Stones", the VAT line is dropped from the totals column and the tax note at the foot of an estimate drops its VAT sentence. Historic bills that were issued while VAT was on still show their VAT line, since that is what the customer was charged. No calculations change.

## Technical notes

- New table `public.pos_held_bills` (owner id, label, source order/quote, JSON bill state, updated_at) with grants and RLS: sales/manager/admin can read all rows so any counter can see the queue; a row can be edited or deleted by its owner or by admin/manager. `src/hooks/usePosDraft.ts` gains async backend read/write with the existing localStorage path as the offline fallback.
- New pages `src/pages/PosCounter.tsx` and `src/pages/SalesReport.tsx`, routed in `src/App.tsx` behind the existing role guards; report figures are derived from `invoice_items` with `gramsToTola` from `src/lib/format.ts`.
- VAT display gated on `settings.vat_enabled` in `src/components/PrintDocument.tsx`, `src/pages/InvoiceDetail.tsx`, `src/pages/QuotationDetail.tsx`, `src/pages/POS.tsx` and `src/pages/Quotations.tsx`; for saved documents fall back to the document's own `vat_amount > 0`.
- Job-bill removal is a guarded action on `src/pages/RepairDetail.tsx` and `src/pages/OrderDetail.tsx`, permission-checked via the existing matrix.
