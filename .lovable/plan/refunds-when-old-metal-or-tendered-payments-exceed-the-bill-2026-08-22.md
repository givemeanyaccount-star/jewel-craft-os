# Refunds when old metal or tendered payments exceed the bill

Today the sale screen only offers a refund when a **cash advance from an order** is bigger than the bill.
Two other over-payment cases are silently swallowed:

- **Old metal trade-in taken during the sale.** The bill total is floored at zero, so if a customer's old
  metal is worth more than the goods, the surplus disappears — nothing is refunded and nothing is recorded.
- **Over-tendered payment modes.** Payment lines totalling more than the bill are saved as `amount_paid`
  above the total, balance shows zero, and the change handed over the counter is never recorded.

## What changes on the sale screen

### 1. One refund box for every source of excess

The refund module becomes source-aware. The excess is computed as:

```text
Credits applied   = old metal credit (trade-in + applied order advance)
                  + cash advance applied
Excess            = credits applied − bill value (goods + taxes, before flooring at zero)
```

The refund box appears whenever `Excess > 0`, whether it came from an order advance, an in-sale old metal
purchase, or both. Its live breakdown gains the source lines:

```text
Refund to customer     [  8,500.00 ]  method [ Cash ▾ ]
  Max refundable             8,500.00
  From old metal credit      8,500.00
  From cash advance              0.00
  Kept on order                  0.00
  Net payable                    0.00
  Balance after payments         0.00
```

Real-time clamping, the "Maximum refundable is … — clamped" warning, and the auto-discount
("Set refund amount") solver all work unchanged, now driven by the combined excess.

When an order is involved the existing rule stands: an unpaid part of an *order* advance can be kept on the
order; the excess arising from an in-sale old metal purchase is refundable only (there is no order to hold it).

### 2. Change given on over-tender

Payment lines may exceed the net payable. When they do, a line appears under the payment box:

```text
Tendered            10,000.00
Net payable          9,300.00
Change returned        700.00   (recorded on the bill)
```

The change is posted as a negative payment row with the same method as the largest tendered line, so
`amount_paid` equals the bill total, the balance is zero, and the printed reconciliation ties out.
Change and refund are shown separately on screen but both print inside the Payment Mode box.

## What gets recorded

- The invoice's `old_gold_credit` is capped at the value the bill can absorb; the surplus is written as a
  **negative payment row** (`Refund of excess old metal on invoice …`) with the chosen method.
- `total` stays at zero rather than going negative; `amount_paid` and `balance_due` are consistent with the
  refund and change rows, so the invoice is marked **paid**.
- Change returned is a separate negative payment row (`Change returned on invoice …`).
- Cancelling the invoice already reverses linked payment rows, so refunds and change reverse with it.

## Invoice view and printed bill

The shared `reconcile()` helper already renders "Refund issued". It gains a **Change returned** row, and the
refund row's caption reflects its source. No new boxes; the Payment Mode block keeps summing back to the bill.

## Technical notes

- `src/lib/format.ts`: add `grossTotalOf()` (bill value before the zero floor) so the old metal surplus is
  computable, and extend `computeInvoiceTaxes` to return `creditUnused` (old metal that the bill could not
  absorb). `refundDueOf` takes total credits instead of just the advance. `reconcile()` gains
  `changeReturned`, split from refunds by a note/marker on the payment row.
- `src/pages/POS.tsx`: `refundDue` becomes `refundDueOf(tax.grossTotal, advanceRequested + oldMetalSurplus)`;
  the refund block's render condition drops its order dependency; add a derived `changeReturned =
  max(0, manualPaid − netPayable)` with its own display row; checkout inserts the extra negative payment
  rows and clamps `old_gold_credit` to the absorbed amount.
- `src/pages/InvoiceDetail.tsx` and `src/components/PrintDocument.tsx`: render the change row from
  `reconcile()`.
- `src/test/netPayableConsistency.test.ts`: add cases for old-metal-only excess, combined
  advance + old metal excess, and over-tender change, asserting money conservation
  (`credits + tendered − refund − change = total`) across POS, invoice and print.
