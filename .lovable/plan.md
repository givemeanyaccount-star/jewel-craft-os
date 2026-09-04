# UI audit: redundant inputs and data-entry flow

A review of the sales counter, quotation and inventory forms. Findings below are grouped
by how much they hurt daily counter work, with the fix for each.

## A. Money boxes that fight each other (sales page, right column)

Today the summary column has five separate money inputs — Discount, Old metal credit,
Refund to customer, "Set net payable amount", and the Payments rows — and several change
each other silently. Problems observed:

1. **One box, two meanings.** The "Set net payable amount (auto-discount)" box relabels
   itself to "Set refund amount" as soon as credits exceed the bill, so the same control
   in the same place means the opposite thing depending on the state.
2. **Refund entered twice.** There is a refund amount box inside the amber refund panel and
   the target box above also drives the refund. Either can move the other.
3. **Old metal credit is typed by hand** next to the button that creates a real old-metal
   purchase. Typing over the credit leaves the bill and the purchase record disagreeing,
   with no warning on screen.
4. **Numbers repeated.** Net payable, advance applied and kept-on-order each appear in two
   or three places (customer note, "Order advances" box, summary rows, refund breakdown).

**Changes**

- Replace the shifting "Set…" box with one clearly-titled **Target** control that always
  states what it will set ("Bill should come to" / "Refund should come to") and shows the
  discount it just solved, with an Undo.
- Refund panel keeps one refund input only; the target box drives that same value instead
  of being a parallel entry point.
- Make Old metal credit read-only when it came from a recorded purchase, with an explicit
  "Enter manually" toggle plus a caption warning that the receipt will no longer match.
- Collapse the duplicated advance figures into a single "Advances & refund" block; the
  customer card keeps only the order number.

## B. Header fields that are on all the time

Order date, Rate basis and Invoice date sit above every sale, though Order date and
Rate basis only matter when billing a custom order, and Invoice date is disabled for most
staff. Change to: show Invoice date only when the user may backdate, and reveal Order date
and Rate basis only once an order is attached; otherwise show a one-line "Priced at today's
rate" caption with a link to change it.

## C. Cart line entry

- **Net weight is typed, gross and stone are read-only** on the line. Editing net leaves
  gross − stone no longer equal to net, and the strip below still shows the old gross.
  Fix: make gross and stone the editable fields on the detail strip and derive net (same
  rule inventory already uses), or mark net as an override with a visible "overridden" tag.
- **Qty is displayed but not editable** on the line; it can only be changed through the
  inventory dialog. Add a small qty stepper on the strip.
- **Grams-only in a tola bill.** The strip prints gross, stone and wastage weight in grams
  even when the header toggle is on tola. Use the shared grams-with-tola display for all
  four weights.
- **Editable and read-only fields are interleaved** — wastage and making inputs sit in the
  middle of ten read-only figures. Split the strip: an "Adjust" group (wastage, making, qty,
  stone value) then a "Computed" group (weights and amounts).
- **The g/tola toggle is hidden inside a column header.** Move it to the card header next to
  "Add items" so it reads as a page-level preference, which is what it is.

## D. Customer picking

Both the sales page and the quotation dialog use a plain dropdown that renders every
customer with no search, while the app already has a searchable `CustomerSelector` used
elsewhere. Switch both to that component so name/phone search works and the two screens
behave alike.

## E. Consistency between screens

- Inventory puts the **type selector before the value** (Making charge type, then value) as
  two separate grid cells; the sale and quote lines put value first with the type beside it.
  Align on value-then-type pairs everywhere.
- The quotation item search list shows raw weights (`12.5g`) while the sales list shows three
  decimals plus tola. Use one formatter.
- The quotation summary offers an **Old metal credit** input, but a quotation cannot record a
  purchase — either drop it or label it "estimated trade-in".
- The **Payments "Add" row prefills `total − paid`**, ignoring advances and refunds, so on any
  order-linked bill the suggested amount is wrong. Prefill from the outstanding balance.

## F. Smaller items

- The 421px viewport currently scrolls the whole cart table sideways; give the line rows a
  stacked card layout under `sm`.
- Empty-state and required-field messaging is inconsistent (red border on customer, plain
  caption elsewhere). Use one error style.
- Notes textarea sits between Payments and Complete Sale, pushing the primary button below
  the fold on mobile; move Notes above Payments.

## Technical notes

- Work is confined to `src/pages/POS.tsx`, `src/pages/Quotations.tsx`,
  `src/pages/Inventory.tsx`, `src/components/LineChargeFields.tsx` and a new small
  `TargetAmountField` component. No pricing-math change: `computeLineTotal`,
  `solveTargetTotal` and `reconcile` in `src/lib/format.ts` stay as they are.
- Weight display switches to the existing `gmsWithTola()` helper; the g/tola toggle keeps
  using the shared `useWeightUnit` hook, so the preference stays global.
- No schema or RLS change.

## Suggested order

1. Section A (money boxes) — highest risk of wrong bills.
2. Section C (line entry) — most typing per sale.
3. Sections B, D, E, F.
