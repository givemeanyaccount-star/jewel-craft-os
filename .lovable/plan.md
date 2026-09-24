# Order date validation and clear origin on the sale screen

The optional "Order date" box on the sale screen accepts any date, including one after
the bill's own date, and gives no indication of where its value came from.

## Changes (all in `src/pages/POS.tsx`)

1. **Order date cannot be after the sale date.**
   - The sale date is the invoice date when the user may backdate and has set one,
     otherwise today.
   - Add a `max` attribute to the order date input so future dates can't be picked.
   - If a value later than the sale date is still present (typed on a device that
     ignores `max`, or the invoice date is moved earlier afterwards), show a red
     message under the field and block "Complete Sale" until it's fixed — same
     pattern as the existing "Every sale must be linked to a customer" check.
   - Applies to manually entered dates and to dates loaded from an attached order
     alike; the message tells the user to correct the box.

2. **Clearly mark the origin of the value.**
   A small caption under the order date box, always visible, one of:
   - Attached order supplied it: "From order ORD-… — set when the order was booked"
   - User typed it: "Entered manually — bill can be priced at this date's rate"
   - Empty: "Left blank — bill is priced at today's rate"
   The "From order" state wins whenever an order is attached and its date matches;
   if the user edits the box while an order is attached it flips to "Entered
   manually" (with the red validation message if it now violates the date rule).

3. **Rate basis caption stays consistent.** The existing rate-basis dropdown keeps
   appearing only when a date is set; no behaviour change there.

No pricing-math, schema, or other-page changes: the saved bill fields
(`order_date`, `rate_basis`) and the draft persistence already carry the value.

## Verification

- Typecheck (`tsgo`) and vitest suite.
- Browser check: pick a future order date → red message, Complete Sale blocked;
  clear it → caption reads "Left blank"; attach an order → caption reads
  "From order …".
