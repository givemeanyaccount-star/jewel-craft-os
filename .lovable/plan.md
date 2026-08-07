# Sales Return Management page

A dedicated page at `/returns` that handles the whole return flow in one place: find the invoice, tick the lines, see the refund maths live, then process the return and print a credit note.

## Stage 1 — Invoice lookup & selection

- Search box at the top: type an invoice number or a customer name, get a result list (recent invoices first) showing number, date, customer, total and status. Cancelled invoices and fully-returned invoices are excluded.
- Selecting a result loads a detail panel with: customer name/phone, invoice date, pre-tax subtotal, the flat discount applied, taxes charged, and the line items.
- Each returnable line has a checkbox plus a quantity note; lines already returned are shown greyed with a "Returned" badge and cannot be re-selected.
- A "Select all" control for a full return.

## Stage 2 — Pro-rata & non-refundable tax maths

For every tick, recalculated live:

```text
Discount ratio     = flat discount / pre-tax subtotal
Net return price   = item pre-tax price − (item pre-tax price × discount ratio)
Tax               = retained in full, never refunded
Refund due         = sum of net return prices of selected lines
```

A sticky summary widget shows four figures:

- Gross return value (sum of selected lines at original pre-tax price)
- Pro-rata discount deducted
- Non-refundable tax retained (the selected lines' share of VAT + SD tax + luxury tax, shown for transparency, not added to the refund)
- Total refund due

Plus refund method (cash, card, bank transfer, wallet, other), a per-line disposition (restock under the original SKU, or bring back as raw material), and an optional reason field.

## Stage 3 — Credit note

"Process Return & Generate Credit Note" records the return, then swaps the form for the credit note view:

- Marks the selected invoice lines returned with their refund amounts and disposition.
- Restocks inventory for lines marked restock; raw-material lines are left out of stock.
- Records the refund as a negative payment against the invoice, updates the invoice's paid amount, balance and status, and adjusts the customer balance.
- Generates a tracking number `CN-YYYYMMDD-XXXX` (date + a short sequence).

The credit note shows: shop header, credit note number, date, original invoice reference and date, customer block, an itemised table (original price, discount applied, net refund price, qty, total) and a summary block with gross value, pro-rata discount, "Tax Retained (Non-Refundable)" and total refund due. Buttons: "Print Credit Note" and "New return".

## Navigation & existing behaviour

- New sidebar entry "Sales Returns" under Invoices, visible to roles with invoice write permission.
- The Return button on an invoice detail page now navigates to `/returns?invoice=<id>` with that invoice preloaded, instead of opening the old dialog.
- Old gold settlement is not part of this page — the maths stay as described above.

## Technical notes

- New `src/pages/SalesReturns.tsx` plus small sub-components (`InvoiceSearch`, `ReturnSummary`, `CreditNote`) under `src/components/returns/`; route added to `src/App.tsx` and nav to `src/components/AppLayout.tsx`.
- Reuses the existing persistence steps from `ReturnItemsDialog.tsx` (invoice_items update, inventory_items insert/status, payments insert, invoices + customers update); that dialog file is removed from `InvoiceDetail.tsx` once the page replaces it.
- Printing uses the existing `openPrintPreview` host so paper size/margins and PDF download work the same as other documents; the on-page credit note also carries print-only CSS for a direct `window.print()`.
- Item pre-tax price = `invoice_items.line_total`; discount ratio comes from `invoices.discount / invoices.subtotal`; tax retained uses `vat_amount + sd_tax + luxury_tax` pro-rated by line share.
- No database migration needed — the credit note number is derived at generation time and stored in the payment reference and the return reason.
