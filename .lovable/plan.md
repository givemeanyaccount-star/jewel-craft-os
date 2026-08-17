# Advance adjustment and refunds at the point of sale

Today an order's advances are pulled into the bill automatically: old metal advances always land in full on the old metal credit line, cash advances are applied up to whatever the bill needs, and anything above the bill total is silently ignored. That breaks two real cases — the customer who has over-paid and must be given money back, and the customer taking delivery of only part of the order who wants the rest of the advance (and the old metal value) held for the next bill.

## What changes at the sale screen

### 1. An "Order advances" panel

When a sale is loaded from an order, a panel appears above the totals showing what was collected on that order and how much of it this bill is using:

```text
Old metal advance      120,000     [ apply on this bill: 120,000 ]  (rest saved for later)
Cash advance            50,000     [ apply on this bill:  50,000 ]  (rest saved for later)
```

Both "apply" amounts are editable and capped at what was collected. Whatever is not applied stays on the order and is available for the next bill of the remaining pieces.

On load, a short dialog asks how to treat the old metal valuation for this bill: **apply it all**, **apply part** (enter the amount), or **save it all for the remaining items**. The default is apply all. It is only shown when the order still has unbilled pieces, and the choice can be changed afterwards in the panel.

The applied old metal advance flows into the **Old metal credit** line, so it still reduces the SD tax base. The applied cash advance is deducted after tax.

### 2. Refund when the advance exceeds the bill

The summary panel becomes:

```text
Total
Less: old metal credit (already inside Total)
Less: cash advance applied
------------------------------------
Net payable                  0.00
Refund due to customer   [ 8,500.00 ]   method: [ Cash ▾ ]
```

The refund field appears only when the applied advances exceed the total. It is pre-filled with the excess and is editable — staff can pay out less and leave the balance on the order (the panel shows the amount kept). Paying out more than the excess is blocked.

### 3. Set net amount also solves for a refund

The "Set net amount" box keeps working when the bill ends in a refund. Enter the refund you want to hand over and the discount is solved backwards so that `applied advance − total` equals that number. The box switches its label to "Target refund" once the bill is in refund territory, and warns if the amount cannot be reached without a negative discount.

## What gets recorded

- The applied part of each advance is moved onto the invoice; the unapplied part stays on the order exactly as it does today for partial cash advances (an advance row is split when only some of it is used). The same splitting is now applied to old metal advance rows, which are currently always consumed in full.
- A refund is written as a **negative payment row** on the invoice with the chosen method, so `amount_paid` and the customer ledger stay consistent and the invoice is marked paid with a zero balance.
- The invoice's `old_gold_credit` only ever contains the old metal actually applied to that bill.

## Invoice view and printed bill

The invoice detail page and the printed bill gain a **Refund paid** row under Net payable when one exists, and the Payment Mode reconciliation box lists the refund as a negative line so Total Received still ties out to the bill total. Old metal and advance rows already print; they now show the applied amounts only.

## Workflow risks this addresses

- **Double-counting old metal:** the load-time split and the checkout write must agree, otherwise old metal is deducted on two bills. Checkout will consume old metal advance rows only up to the applied amount and split the remainder back onto the order.
- **Refund on a cancelled invoice:** invoice cancellation already reverses linked payments; the negative refund row is reversed with them, so no money is created.
- **Negative totals:** the bill total never goes negative — the excess is expressed as a refund, not as a negative net payable.
- **Advance re-use after a partial bill:** the next bill loaded from the same order reads only the payment rows still unlinked to an invoice, so the saved portion appears again with no manual work.

## Technical notes

- `src/pages/POS.tsx`: new state `applyOldMetalAdv`, `applyCashAdv`, `refundAmount`, `refundMethod`, plus an "adjust advances" dialog on `loadOrder`. `oldGoldCredit` is fed from `applyOldMetalAdv` rather than the full old metal advance; `appliedAdvance` becomes `min(applyCashAdv, ...)` without the "cap at what the bill needs" clamp, so an excess can surface as a refund. `applyTargetTotal` gains a refund-target branch.
- Checkout: generalise the existing cash-advance splitting loop into a helper used for both `old_gold` and cash rows, driven by the applied amounts; insert the refund as a negative `payments` row (the table's check constraint allows negative amounts, only zero is rejected).
- `src/lib/format.ts`: add `refundDueOf(total, appliedAdvance)` and a `discountForTargetRefund` wrapper so all three surfaces share the maths.
- `src/pages/InvoiceDetail.tsx` and `src/components/PrintDocument.tsx`: read refunds as the negative-amount payments on the invoice and render the new row.
- `src/test/netPayableConsistency.test.ts`: extend with over-advanced and partial-old-metal scenarios asserting POS, invoice view and print agree on net payable, refund and money conservation.
