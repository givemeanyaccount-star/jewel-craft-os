# End-to-end test: Payment Mode box and Balance Due reconcile everywhere

Goal: prove that the money box on the printed bill, the totals on the invoice screen and the POS summary always agree — for every payment mode, and when the advance held on an order is larger than the bill.

## What gets tested

For each scenario the test walks the real trail: order advances -> POS pricing and auto-discount -> checkout writes the invoice and splits/attaches advance payments -> InvoiceDetail and the printed bill re-read those rows.

Assertions on every scenario:

- `Old Metal + Advance + every at-sale mode = Total Received`
- `Total Received + Balance Due = Net Total` (the actual cost of the items on the bill)
- Balance Due on the print equals `invoices.balance_due` written by POS, and is never negative
- Net Payable identical on POS, InvoiceDetail and the print
- Each payment mode collapses to exactly one row (two cash payments = one Cash line), and no advance row is double-counted as an at-sale mode
- Money conservation: advance rows before checkout = advance rows after (attached + left on the order)

## Scenarios

1. Single cash payment, fully settled.
2. Every mode at once: cash, card, bank transfer, esewa, khalti, fonepay, other — plus old metal credit.
3. Part payment, so a real Balance Due prints.
4. Cash advance on the order, partly consumed by this bill.
5. Old metal advance only (pre-tax credit, no advance row).
6. Old metal + cash advance together with a target Net Payable.
7. **Advance greater than the bill** — advance 100,000 on a 60,000 bill: only 60,000 is applied, Net Payable is 0, Balance Due is 0, Total Received equals Net Total, and the 40,000 surplus stays attached to the order (unused), never printed as a negative balance.
8. **Advance greater than the bill on the final batch** — nothing left to bill against, so the surplus is a refund owed: the test asserts it is reported as a positive surplus figure rather than folded into the invoice, and that the invoice itself still reconciles to zero balance.
9. Advance plus a cash payment that together overshoot the bill (over-collection): the excess must not create a negative Balance Due.
10. Fractional amounts with a target net payable, to catch rounding drift in the reconciliation sum.

## Technical notes

- The reconciliation math currently lives inline inside `src/components/PrintDocument.tsx` (mode grouping, `totalReceived`, `balanceDue`), so it cannot be tested directly. Extract it into a pure helper in `src/lib/format.ts`, e.g. `paymentBreakdown({ payments, oldGoldCredit, netTotal, balanceDue })` returning `{ advanceReceived, modeRows, atSaleTotal, totalReceived, balanceDue, surplus }`, and have `PrintDocument.tsx` render from that helper. No visual change to the bill.
- `surplus` is new: `max(0, totalReceived - netTotal)`, used by scenarios 8 and 9 to express refundable over-collection. It is returned by the helper for testing; on the printed bill it shows as a "Refund Due" row only when positive.
- New test file `src/test/paymentModeReconciliation.test.ts`, modelled on the existing `src/test/netPayableConsistency.test.ts` (same `posState` / `checkout` / read-surface simulation), reusing `computeInvoiceTaxes`, `discountForTargetTotal`, `advanceReceivedFromPayments`, `netPayableOf`.
- InvoiceDetail asserts against the same helper output for Total/Paid/Balance due so the screen cannot drift from the print.
- No schema, pricing or POS behaviour changes.
