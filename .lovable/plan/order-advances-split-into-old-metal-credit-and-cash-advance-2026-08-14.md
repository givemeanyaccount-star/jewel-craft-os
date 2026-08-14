# Order advances split into old metal credit and cash advance at POS

Today, when a finished order is billed at POS, every advance taken on that order (cash, bank, or old-metal trade-in) is lumped into a single "advance" number that is merely counted as payment at the end. Old metal handed over as advance therefore never reaches the "Old metal credit" line, so the SD tax base is wrong, and the "Set net amount" box targets the gross total instead of what the customer actually still has to pay.

## What changes

When a sale is loaded from an order, the advances are read individually and split by method:

- **Old-metal trade-in advances** are added into the bill's **Old metal credit** line, exactly like an old-metal purchase made during the sale. It reduces the SD tax base and the total, and shows the fine-gold equivalent note.
- **Cash / bank / wallet advances** are shown as a separate **Advance received** line below the Total, and subtracted from it.
- A new **Net payable** figure appears after that deduction: `Total − cash advance`. This is what the customer owes now.

The summary panel becomes:

```text
Subtotal
  Stones / Gold + Making + Wastage
Discount
VAT / SD tax
Old metal credit (incl. old metal advance from the order)
------------------------------------
Total
Less: cash advance received on order
------------------------------------
Net payable
```

**Set net amount** now targets the **Net payable** figure. Enter the round amount the customer will pay, press Apply, and the discount is solved so that `Total − cash advance` lands on that number. The helper label and toast are reworded to say so.

Payments, balance due, and invoice status are all computed against Net payable, so a bill fully covered by the advance is marked paid with a zero balance.

## Invoice record and printout

- The old-metal advance is included in the invoice's `old_gold_credit`, so the stored total already reflects it.
- Cash advances are still linked to the invoice as payments (existing splitting logic keeps unused advance on the order for later batches), so `amount_paid` and `balance_due` stay correct.
- The invoice detail view and the printed bill gain an "Advance received" line under the total with the resulting net payable, and the old metal line notes when part of it came from an order advance.

## Technical notes

- `src/pages/POS.tsx`: `loadOrder` selects `amount, method` from order payments and sets two states — `advanceOldMetal` (folded into `oldGoldCredit`) and `advanceCash` (replacing today's single `advance`). `appliedAdvance` is capped by the cash portion only. `applyTargetTotal` calls `discountForTargetTotal` with the target raised by the applied cash advance so the solved discount hits net payable.
- Guard against double-counting: the old-metal portion is added to `oldGoldCredit` once on load, and is excluded from the advance-to-payment linking loop at checkout (that loop should only consume cash-method advances, since the old-metal value is already deducted through the credit line).
- `src/pages/InvoiceDetail.tsx` and `src/components/PrintDocument.tsx`: derive advance-paid-before-issue from linked payments and render the "Advance received / Net payable" rows.
- Partial batches keep the current behaviour: only as much cash advance as this bill needs is applied, the rest stays on the order.
