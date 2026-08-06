# Sales return: old gold settlement + non-refundable tax

## What changes

The return dialog gets two new blocks between the item list and the refund total, and the refund maths is recalculated accordingly.

### 1. Old gold settlement (full returns only)

When the invoice carries an old gold credit and every remaining line is selected, a settlement panel appears with two choices:

- **Return the metal** — the traded-in piece goes back to the customer, so the original credit is cancelled: the refund is reduced by the full original credit amount.
- **Revalue in cash** — enter today's rate per gram; the fine weight of the original trade-in is revalued at that rate. The refund is adjusted by (original credit − today's value): if metal is dearer today the customer gets more back, if cheaper, less.

The panel shows the original credit, the recorded fine weight and metal, the rate input, the recomputed value, and the resulting adjustment. Fine weight and metal come from the old gold purchase linked to the invoice; if no linked purchase exists, the fine weight is derived from the credit and the bill's fine rate, and that is stated in the panel.

On partial returns the panel is hidden and old gold is untouched, with a short note saying old gold is settled only on a full return.

### 2. Non-refundable tax

A "Tax withheld (non-refundable)" line is shown, pre-filled with the returned lines' proportional share of VAT + SD tax + luxury tax on the invoice, and editable. It is subtracted from the refund.

### 3. Recalculated refund

```text
Goods refund      = sum of selected lines' proportional share
− Tax withheld    (editable, defaults to proportional share of all taxes)
± Old gold adjust (full return only)
= Net refund      → split into cash-back (capped at amount paid) and credit adjustment
```

Line-level refund defaults change: each line's share is now computed from the invoice total **before** taxes and old gold credit, so tax and old gold are handled once, explicitly, instead of being buried in the proportional factor.

### 4. Receipt and records

The printed refund receipt gains rows for tax withheld and the old gold settlement (with the return-date rate and revalued amount, or "metal returned to customer"). The reason field records the settlement choice. Invoice totals, amount paid, balance and customer balance are updated from the net refund as today.

## Technical notes

- `src/components/ReturnItemsDialog.tsx`: change `factor` to `(total + vat + sd + luxury + old_gold_credit) / gross` basis; add state for settlement mode, return-date rate, and withheld tax; compute `netRefund` and use it for the payment insert, invoice update and customer balance.
- Old gold source: query `old_gold_purchases` where `linked_invoice_id = invoice.id` for `metal, purity, fine_weight, total_amount, rate_per_gram`; fall back to `fineEquivalentGrams` from `src/lib/fineEquivalent.ts` against the bill's fine rate.
- When "return the metal" is chosen on a full return, mark the linked old gold purchase's notes with a return annotation (no schema change; no deletion of the purchase record).
- No database migration required — all values are derived at return time.
