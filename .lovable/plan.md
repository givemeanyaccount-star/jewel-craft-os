# Remove walk-in customers + quotation lifecycle

## 1. No more walk-in customers

Every sale, quotation, old gold purchase and repair must be linked to a real customer record.

- Remove the "Walk-in customer" / "Walk-in / prospect" option from the new sale screen and the quotation builder. Customer becomes required — the save button stays disabled until one is picked (a customer can still be created on the spot with the existing "new customer" dialog).
- Remove the "Walk-in" fallback labels across invoices, invoice detail, repairs, credit ledger, dashboard activity and the printed invoice/estimate.

### Backfilling the existing records

Existing documents with no customer get converted into real customer records:

- 11 old gold purchases carry a name and phone (Rami Shakya, Anil Shrestha, etc.). Each is matched to an existing customer by phone; if none matches, a new customer is created from that name and phone. Duplicate names on the same phone map to a single customer.
- 7 invoices and 1 repair have no name stored at all. Each gets a customer record named after its document (e.g. "Counter sale INV-26-08691") so the record stays traceable and its payments, items and credit balance remain intact.

Nothing is deleted.

## 2. Quotations

- **Edit from the list** — an edit action on each quotation row reopens the quotation builder prefilled with its customer, lines, discount, old gold credit, notes and validity, and saves back over the same quotation (replacing its lines).
- **Reserve stock** — inventory items added to a saved quotation move to `reserved`. Removing a line, editing the quotation, deleting, or letting it expire returns those items to `in_stock`. Reserved items no longer appear in the in-stock pickers, so two quotes can't hold the same piece.
- **Accepting a quotation** opens the new sale screen prefilled with everything from the quotation (customer, all line details, discount, old gold credit, notes). Once that sale is saved, the quotation record and its lines are deleted and the items go from reserved to sold.
- **Expiry** — quotations past their validity date are automatically marked `expired` and their reserved items are released back to stock. Expired rows show a delete button in the list so they can be cleared manually.

## 3. Dashboard tile

New "Pending quotations" tile showing the count of open (draft/sent) quotations, their combined value, and how many expire within 3 days. Clicking it opens the quotations list.

## Technical notes

- Data backfill runs as a one-off data update: insert/match customers, then set `customer_id` on the 7 invoices, 11 old gold purchases and 1 repair. Afterwards a migration sets `customer_id` NOT NULL on `invoices`, `quotations`, `old_gold_purchases` and `repairs` so the rule is enforced at the database level.
- Expiry runs as a lightweight check on quotation list/dashboard load (mark past-validity quotes expired + release their reserved items) rather than a scheduled job, keeping it simple and immediate for whoever opens the app.
- Quotation → sale handoff passes the quotation id through router state into POS, which loads the lines with the shared `CartRow`/`recompute` helpers; deletion of the quotation happens only after the invoice insert succeeds.
- Item status transitions are centralised in a small helper so reserve/release logic is not duplicated between the builder, accept flow and expiry sweep.
