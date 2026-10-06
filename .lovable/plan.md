# Date switch beside the date boxes, and fixing "rate of order date"

## 1. AD | BS switch next to the date boxes
- Remove the switch from the top bar.
- Each date box gets its own small **AD | BS** switch in its label row, on the right ("Order date (optional) ........ AD | BS"). Flipping it on any box changes every date box and date list in the app at once, and the choice is still remembered on the device.
- On the sale screen the date boxes are tidied into one "Dates" row: Order date, Rate basis and Invoice date side by side (stacked on phones). The switch sits once at the right of the row heading, not on every box.
- On the Sales report the four date filters are grouped under one heading with the switch beside it. On Orders, Repairs, Purchases and the order-date correction, the switch sits in the label row of the first date box.
- Lists show dates in the chosen calendar as now. The column heading shows "(BS)" or "(AD)" so it is always clear which calendar is in use.

## 2. "Rate of order date" was being ignored
What the code does today (the rate records themselves are fine: a daily rate exists for each date):
- Items added to the bill **after** choosing "Rate of order date" are always priced at today's rate. The choice only re-prices lines already on the bill at the moment it is picked.
- Changing the order date after choosing the rate basis doesn't re-price the bill either.
- If a line has no rate on or before the order date, it silently keeps today's rate.

Fix:
- Every line uses the chosen basis whether it is added before or after the choice: scanned items, searched items and order pieces.
- Changing the order date while "Rate of order date" is selected re-prices the whole bill straight away. Clearing the order date switches back to today's rate.
- Choosing an order date now sets the basis to "Rate of order date" by default. You can switch to "Today's rate" with one click.
- Under the rate basis box, a line shows which rate was applied, e.g. "Gold 22K at Rs 23,449.60/g — rate of 2026-09-25 (2083 Ashwin 9)". If an older rate had to be used, it says "nearest earlier rate: 2026-09-24".
- If no rate exists on or before the order date for a line, a warning names that line and it keeps today's rate until a rate is entered.
- Rates typed by hand on a line are kept and not overwritten when the basis or date changes.

## Technical notes
- `DateModeToggle` gains a compact variant. Add an optional `showToggle` prop to `DateField` that renders it in a label row; remove it from `AppLayout`. DateText column headers read the mode via `useDateMode`.
- `POS.tsx`:
  - Add a `rateForLine(metal, purity)` helper that uses `fetchRateOn(…, orderDate)` when `rateBasis === "order" && orderDate`, otherwise `fetchLatestRate`. Use it in `addToCart`, scan and order-load.
  - Add an effect on `[orderDate, rateBasis]` that calls a shared `repriceCart()`, skipping rows flagged `rate_manual` (set when the rate cell is edited).
  - Setting a date from blank sets `rateBasis = "order"`; clearing it sets `"current"`.
  - Store the applied `rate_date` per row for the caption and warnings.
- Verify: browser test with an order date of 2026-09-25 → a 22K line shows 23,449.60/g; switch to Today's → 22,892.21; add an item after choosing the basis → uses the order-date rate; plus typecheck and tests.
