# Printable refund/advance reconciliation block

Extends the existing **Payment Mode** box on the printed bill (no new box, no wastage changes), so the
bill closes on numbers that tie out:

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
- Rows with no value are omitted, so a plain cash bill stays as short as today.
- The same reconciliation lines appear on the invoice detail screen so staff see exactly what prints.

## Technical notes

- `src/lib/format.ts`: add a single `reconcile()` helper returning old metal, advance applied, at-sale
  payment modes, refund paid, kept-on-order, taxes, total received, net payable and balance, built on
  the existing `advanceReceivedFromPayments`, `refundPaidFromPayments` and `netPayableOf`.
- `src/components/PrintDocument.tsx` and `src/pages/InvoiceDetail.tsx` consume that helper, replacing
  their inline payment reductions. No pricing, POS or wastage logic changes.
- Extend `src/test/netPayableConsistency.test.ts` with a reconciliation case (advance + refund + kept on
  order) asserting the printed block sums back to the bill total.
