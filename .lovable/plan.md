# Fix: "items were just sold in another sale" at checkout

## What is happening

At checkout the POS claims each cart item by flipping inventory rows from `in_stock` to `sold` in one atomic update. The claim only accepts rows whose status is exactly `in_stock` (src/pages/POS.tsx:407-418). If any row is not `in_stock`, the claim count doesn't match the cart and the sale is aborted with that message — even when nobody else sold the item.

Two normal flows put cart items in a status other than `in_stock`:

- Quotation holds: accepting/saving a quotation sets its items to `reserved` (src/lib/quotations.ts:10-11). Selling from that quotation then fails the claim.
- Custom orders: when a finished order item is stocked, the new inventory row is created as `reserved` (src/pages/OrderDetail.tsx:563). Billing that order at POS then fails the claim.

A second, related defect: the rollback paths (POS.tsx:416 and 553) reset items to `in_stock`, which silently destroys a quotation/order reservation whenever a checkout fails.

## Fix

1. Widen the claim in `checkout()` to accept `in_stock` or `reserved` (`.in("status", ["in_stock", "reserved"])`), keeping it a single atomic conditional update so double-selling is still impossible.
2. Before claiming, read the current status of the cart's inventory ids. Remember each item's prior status so rollback restores it exactly (reserved stays reserved) instead of blanket `in_stock`.
3. Make the failure message specific: list the SKU/name of the items that could not be claimed and their actual status (e.g. "sold", "melted"), so staff know which line to remove.
4. Optional guard: if a cart item is `reserved` against a *different* quotation/order than the one being billed, still allow the sale but warn, since the physical item is being taken.

## Technical notes

- All changes are in `src/pages/POS.tsx` (`checkout` claim block and the catch-block release). No schema or RLS change is needed; RLS already allows sales roles to update inventory status.
- Add a case to the existing test sweep covering a reserved order-sourced item flowing through checkout.
