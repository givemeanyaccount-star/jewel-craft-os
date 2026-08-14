# Printed bill: advance, net payable and a payment mode table that reconciles

The printed invoice gets two fixes so the money on paper always ties out.

## 1. Totals column

Below the existing figures, in this order:

```text
Net Total            (after old metal credit and SD/VAT tax)
Less: Advance Paid   (cash-type advance collected on the order)
Net Payable          (Net Total - advance)
```

The advance row shows whenever an order advance was applied. Net Payable is always printed as the bold closing figure, even with no advance (then it equals Net Total), so the bill always ends on "what is due at the time of sale".

## 2. Payment Mode table

Today the box lists the raw payment rows plus an old metal line, which can double-count the advance and never sums to anything meaningful. It becomes a reconciliation table against the full bill:

```text
Payment Mode
------------------------------
Old Metal              <amount>   (fine-gold note underneath)
Advance (order)        <amount>
Cash                   <amount>
Bank Transfer          <amount>
Fonepay / eSewa / ...  <amount>
------------------------------
Total Received         <sum>
Balance Due            <amount>   (only when > 0)
```

Rules:
- Every payment mode present on the invoice is listed, with amounts of the same mode merged into one row (two cash payments print as one Cash line).
- Payments carried over from the order advance are grouped into a single **Advance** row and excluded from the at-sale mode rows, so nothing is counted twice.
- Old metal credit is listed as its own row, keeping the fine-equivalent note.
- `Total Received` = old metal + advance + all at-sale payments. It equals the bill's gross Net Total when the bill is fully settled; any shortfall shows as **Balance Due**, so the column always reconciles to the actual cost of the items on the bill.

## Technical notes

- `src/components/PrintDocument.tsx` only. Split the `payments` prop with the existing `advanceReceivedFromPayments` logic: rows with `order_id` and method other than `old_gold` are the advance; the rest are at-sale modes, reduced with a `Map<method, amount>` before rendering.
- Old metal amount stays `doc.old_gold_credit`; `Net Payable` keeps using `netPayableOf(netTotal, advanceReceived)` so the print agrees with POS and the invoice detail page.
- `Balance Due` derives from `doc.balance_due` when present, otherwise `netTotal - totalReceived`, floored at 0.
- No schema, POS logic or pricing changes; screen surfaces keep their current wording.
