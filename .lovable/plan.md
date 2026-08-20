# Printable refund/advance reconciliation + wastage fix

## 1. Wastage showing 0

Cause (confirmed from the data): the affected lines have wastage type **Fixed**, which the pricing
code treats as a rupee amount. A value of `0.93` entered as grams therefore charges रू0.93 of wastage
and prints `0.000 g` in the Waste column, because the printed grams are derived as
`wastage amount ÷ rate`. Percentage and Weight lines calculate correctly.

Fixes:

- **Unambiguous labels everywhere.** Wastage type options become `Percentage (%)`, `Weight (grams)`,
  `Fixed amount (रू)` on the inventory form, the order line fields and the POS line editor (today the
  order and POS selectors just say "Fixed" / "Weight").
- **Live preview next to the input.** Under the wastage value field show what it resolves to:
  `= 2.505 g · रू 59,823` so a wrong type is obvious before saving. Same for making charge.
- **Warning on suspicious entry.** If type is `Fixed amount (रू)` and the value is under 10, show an
  inline hint: `Looks like grams — switch to Weight (grams)?` with a one-click switch.
- **Printed/at-screen display of a genuine fixed wastage.** Instead of a misleading `0.000`, the Waste
  column prints `—` with the rupee amount noted in brackets, so a real fixed-rupee wastage reads
  correctly on the bill.
- **Correct the existing mis-typed records**: 2 inventory items and 1 open order line where the type is
  Fixed with a value under 5 are switched to Weight (grams), keeping the same number. The one already
  issued invoice line is left untouched (a posted bill is not rewritten); it will be listed for you.

## 2. Reconciliation block on the printed bill

Extends the existing **Payment Mode** box (no new box), so the bill closes on numbers that tie out:

```text
Payment Mode
--------------------------------
Old Metal                <amt>   (fine-gold note)
Advance applied          <amt>
Cash / Bank / Fonepay …  <amt>
--------------------------------
Total Received           <amt>
Less: Refund issued      <amt>   (only when a refund was paid)
Kept on order            <amt>   (only when advance was retained)
--------------------------------
Net Payable              <amt>
Taxes (SD / VAT)         <amt>
Balance Due              <amt>   (only when > 0)
```

- Every row is derived from the invoice's own figures and its linked payment rows, using the shared
  helpers already used by POS and the invoice screen, so screen and paper always agree.
- Compact typography, fits inside the current footer band without pushing pagination.
- Rows with no value are omitted so a plain cash bill stays as short as today.

## Technical notes

- `src/lib/format.ts`: add a single `reconcile()` helper returning old metal, advance applied, at-sale
  modes, refund paid, kept-on-order, taxes, total received, net payable and balance, built on the
  existing `advanceReceivedFromPayments`, `refundPaidFromPayments`, `netPayableOf`. Both
  `PrintDocument.tsx` and `InvoiceDetail.tsx` consume it, replacing their inline reductions.
- Wastage display: `lineDisplay()` in `PrintDocument.tsx`, `InvoiceDetail.tsx` and `POS.tsx` returns an
  extra `wastageIsFixed` flag; the column renders `—` plus the amount for that case.
- Label/preview changes in `src/pages/Inventory.tsx`, `src/components/orders/OrderLineFields.tsx`, and
  the POS line editor. No change to `computeLineTotal` maths.
- One data-correction migration for the mis-typed inventory items and order line.
- Extend `src/test/netPayableConsistency.test.ts` with a reconciliation case (advance + refund + kept)
  asserting the printed block sums back to the bill total, and a wastage case covering all three types.
