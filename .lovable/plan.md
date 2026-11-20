# Compact bill items on phone

On phones, each item added to the sale currently shows a wide table row plus a large block of edit boxes and six calculated figures, so one item fills most of the screen. Desktop/tablet (wide screens) stay unchanged.

## What changes on phone
- Each item becomes a slim card:
  - Line 1: item name, metal + purity, line amount (bold), remove button.
  - Line 2 (small grey text): Net wt (g/tola), Wastage, Making, Stone amt, Qty if more than 1.
- Tapping "Edit" on the card expands it to show the edit boxes (gross wt, stone wt, rate, stone value, wastage, making, qty) and the full breakdown (total wt, gold amt, making amt). Only one item open at a time.
- New items open collapsed; a missing rate keeps the card highlighted in red and open so it is not missed.
- Search results list: tighter rows (one line of details) and lower max height on phone.

## Technical details
- In `src/pages/POS.tsx`, wrap the existing cart Table in `hidden md:table` and add a `md:hidden` card list rendering the same `cart` with `lineDisplay(r)` and the same `updateRow`/`removeRow`/edit handlers — no calculation changes.
- `expandedRow` state (index | null); auto-expand rows with `rate <= 0`.
- Reuse UnitNumberField, NumberField, LineChargeFields inside the expanded section in a 2-column grid.
- Verify at 421x766 with Playwright: add 2 items, check height per collapsed item, edit and confirm totals unchanged.
