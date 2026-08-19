# Live refund validation and clearer advance / net payable display at POS

The sale screen already splits order advances into old metal credit and cash advance, and already
shows a refund box when the advance exceeds the bill. Two things are still weak: the refund box
silently swallows an over-typed amount (no message, and the field snaps back), and the cash advance
and net payable rows only appear in some cases, so staff cannot always see how the refund was reached.

## What changes on the sales page

### 1. Refund amount is clamped in real time, with visible feedback

- Typing a refund larger than the allowable excess clamps it to the maximum immediately and shows an
  inline warning under the field: `Maximum refundable is <amount> — clamped.` Negative input clamps to 0.
- The field shows the clamped value (as today) but the warning explains why, instead of the value
  silently changing.
- A small live breakdown sits under the refund field and updates on every keystroke:

```text
Refund to customer        [  8,500.00 ]  method [ Cash ▾ ]
  Max refundable                8,500.00
  Advance applied to bill     120,000.00
  Kept on order                     0.00
  Net payable                       0.00
  Balance after payments            0.00
```

- The refund box is also re-clamped whenever the discount, cart, taxes or applied advance changes, so
  an edit elsewhere can never leave a stale refund larger than the new excess.

### 2. Advance and net payable always visible once an order advance exists

Ordering in the summary column, once a sale is loaded from an order:

```text
Total                        (after old metal credit and taxes)
Less: cash advance applied
------------------------------------
Net payable
Refund to customer           (only when advance > total)
```

The cash advance line and Net payable row now render whenever a cash advance exists on the order —
including when the whole bill is covered and net payable is zero — rather than only when a non-zero
advance is applied. The old metal advance keeps showing inside the Old metal credit note above Total.

### 3. Nothing invalid can be saved or printed

Before the sale is written, checkout re-derives the refund from the current totals rather than
trusting the typed value, and blocks with a toast if the refund still exceeds the excess (defence
against a value edited between render and save). The recalculated discount, taxes, net payable and
refund shown on screen are exactly the numbers persisted and printed.

## Technical notes

- `src/pages/POS.tsx` only; no schema, no changes to `src/lib/format.ts` maths or to
  `InvoiceDetail.tsx` / `PrintDocument.tsx`.
- Keep `refundInput` as the raw string state; add a derived `refundOver` boolean
  (`Number(refundInput) > refundDue + 0.005`) driving the inline warning. `refund` stays the clamped
  memo already in place.
- Add an effect that resets `refundInput` to `""` when `refundDue` drops to 0, so a leftover typed
  refund cannot linger after a discount change removes the excess.
- Render conditions: change the advance/net payable block from `appliedAdvance > 0` to
  `advance > 0 || appliedAdvance > 0`; the refund block keeps `refundDue > 0`.
- In `checkout`, recompute `refundDueOf(tax.total, advanceRequested)` and compare with the refund
  about to be written; abort with `toast.error` on mismatch beyond one paisa.
- Extend `src/test/netPayableConsistency.test.ts` with a clamping case: an over-typed refund yields the
  same persisted invoice as the maximum refund, and money still conserves.
