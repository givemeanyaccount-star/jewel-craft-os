# Return status workflow and history on /returns

Returns become tracked records with a lifecycle — Draft → Processed → Voided — plus a history table on the page so unfinished and completed credit notes are both visible.

## Statuses

- **Draft** — created automatically as soon as an invoice is loaded and the first line is ticked. Keeps updating as you change selections, dispositions, refund method and reason.
- **Processed** — set when "Process Return & Generate Credit Note" succeeds. Stores the credit note number and all the refund figures.
- **Voided** — a processed credit note can be reversed: the restocked/raw-material items go back to sold, the created return SKUs are removed, the refund payment is deleted, the invoice lines are un-marked, and invoice totals/paid/balance plus customer balance are restored.

## Page layout

Two tabs at the top of /returns:

- **New return** — the existing lookup → selection → credit note flow, with a small status chip ("Draft saved") once a draft exists.
- **History** — a table of all return records: credit note number (or "—" for drafts), invoice number, customer, date, items count, refund amount, status badge, and actions.
  - Filters: status (all/draft/processed/voided) and a search box on credit note number, invoice number or customer.
  - Draft row → "Resume" reopens it in the New return tab with selections restored; "Discard" deletes the draft.
  - Processed row → "View / print credit note" reopens the printable note; "Void" asks for confirmation and runs the reversal.
  - Voided rows are read-only, showing who voided them and when.

Everyone with returns access sees all records.

## Refund maths

Unchanged: discount ratio = flat discount / pre-tax subtotal, net refund per line = pre-tax price minus its pro-rata discount, tax retained in full and never refunded.

## Technical notes

- Migration: `public.sales_returns` (invoice_id, customer_id, credit_note_number nullable-unique, status enum `return_status` = draft/processed/voided, refund method, reason, gross/discount/tax_retained/total, processed_at, processed_by, voided_at, voided_by, void_reason, created_by, timestamps) and `public.sales_return_items` (return_id, invoice_item_id, description, purity, qty, original, discount, net, disposition, new_inventory_item_id). GRANTs to authenticated + service_role; RLS: read for roles with invoice read permission, insert/update for roles with `invoice_cancel_refund`; drafts editable by any such role. `touch_updated_at` trigger on both.
- `src/pages/SalesReturns.tsx` gains tab state, a debounced draft upsert effect, resume/void handlers, and reads the credit note back from the record instead of only local state.
- New `src/components/returns/ReturnsHistory.tsx` for the table plus filters, and `src/lib/returns.ts` holding shared refund maths, the draft upsert, process and void routines so the page stays thin.
- Void reversal mirrors the process steps in reverse order and is guarded so an already-voided record can't be voided twice.
- No change to invoice, POS or navigation behaviour beyond the new tab.
