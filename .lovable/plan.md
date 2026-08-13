# Order Management (Custom Orders)

Add a full custom-order workflow: book an order from a customer, take an advance, issue metal to a karigar, receive the finished piece, push it into inventory, then bill it at POS with a rate choice between the order date and today.

## Flow

```text
Book order -> Advance receipt -> Assign karigar (issue metal)
   -> In progress -> Received from karigar (weight reconciliation)
   -> Item created in inventory (status: reserved for the order)
   -> Bill at POS (advance auto-applied, rate = order date or today)
   -> Order closed
```

## 1. Orders module

New sidebar item "Orders" (permission `order_manage`), with sub-pages Orders list and Order detail.

Order header: order number (auto, ORD-00001), customer (required, same selector as POS), order date, promised delivery date, notes, status, totals.

Order line: description, category, metal, purity, expected gross/net/stone weight, rate snapshot for the order date, making charge (per gram / fixed / percentage), wastage, stone value, estimated amount, reference photos, karigar assignment, line status.

Line statuses: `pending -> assigned -> in_progress -> received -> in_stock -> billed`, plus `cancelled`.

## 2. Karigar issue and return

Per line, record metal issued to the karigar (metal, purity, gross/net weight, issued date) and metal received back (gross/stone/net weight, received date). The detail view shows issued vs received difference as wastage/loss so shortfalls are visible. Every status change is logged with actor, timestamp, weights and note (mirrors the repair status log).

Karigar page gains an "Orders" section next to the existing repair jobs, listing that karigar's assigned order lines with weights and status.

## 3. Receiving into inventory

On "Receive from karigar", a dialog pre-filled from the order line creates a real inventory item: SKU auto-generated from the chosen category, actual weights from the karigar return, images, location, status `reserved`, linked back to the order line. Reserved order stock is hidden from ordinary POS browse so it cannot be sold to someone else, but can be pulled up by the order.

## 4. Billing at POS

- POS gains a "Bill an order" action: pick a pending order for the selected customer and load its received lines into the cart with all weights and charges.
- Rate choice per bill: a small control shows both the order-date rate and today's rate for each metal/purity, defaulting to the order-date rate, with a one-click switch to today's rate that recomputes the cart. Missing order-date rate falls back to the nearest earlier saved rate, and the fallback date is labelled.
- Advances already paid on the order are applied automatically as paid amount, so the invoice shows the correct balance due.
- On completing the sale, the order lines become `billed`, the inventory items become `sold`, and the order closes when all lines are billed.

## 5. Advance payments

Advances are recorded against the order using the existing payments table (payment linked to the order, method, reference, date) and print an advance receipt through the existing print preview. Refundable if the order is cancelled: cancelling an order prompts for advance refund handling and restocks or scraps any produced item.

## 6. Order date and backdating on sales

- Invoices and quotations get an optional `order_date`. When set, POS looks up the metal rate effective on that date and offers it alongside today's rate (same control as above).
- Admins and managers can also set the invoice issue date (backdate). Sales and other roles always bill with today's date. Backdated issue dates are recorded in the audit log.
- Invoice print shows "Order date" under the billing details when present.

## 7. Dashboard and reporting

- New tiles: orders due this week, overdue orders, orders awaiting karigar return, orders ready to bill.
- Order lines with a missing order-date rate are flagged so the rate can be entered retroactively.

## Contradictions and decisions worth knowing

- **Rate volatility vs. margin.** Locking the order-date rate protects the customer but exposes the shop when gold rises between booking and delivery. The plan keeps the per-bill rate switch so the biller can consciously choose, and the invoice records which rate basis was used.
- **Reserved stock vs. free stock.** Order items entering inventory must not be sellable to walk-ins. Handled by the `reserved` status plus the order link; the existing sales-role trigger already prevents sales staff from editing master item data.
- **Weight reconciliation.** Received weight rarely equals issued weight. The difference is shown as wastage/loss rather than silently corrected, and the final bill uses actual received weights, not the estimate.
- **Estimate vs. final price.** The order estimate is not a binding invoice; the plan keeps them separate and shows the variance when billing so the customer can be told before the sale is completed.
- **Order vs. quotation overlap.** Quotations already reserve stock and convert to sales. Orders are for items that do not exist yet; the two stay separate, and an accepted quotation line for a made-to-order item can be converted into an order.
- **Advance refunds.** Cancelling after production is a loss event; the cancel dialog forces an explicit choice (refund advance, forfeit, or move stock to normal inventory) so it is auditable.
- **Backdating risk.** Backdated invoices can distort tax periods; restricted to admin/manager and audit-logged.

## Technical notes

- New tables: `orders`, `order_items`, `order_item_status_log`, and an `order_id` reference on `payments`. `invoices` and `quotations` gain `order_date`; `invoices` gains `order_id` and `rate_basis`.
- Every new table gets grants for `authenticated`/`service_role`, RLS enabled, and policies via the existing `private.has_role` guard: admin/manager full control, sales create and read, karigar read and update only their own assigned lines' status and return weights, accountant/viewer read-only.
- New permission keys `order_manage`, `order_view`, `order_bill` are added to `src/lib/permissions.ts`, seeded into `role_permissions`, and shown in the editable matrix on Role Management.
- Order numbering follows the existing `nextNumber` helper; SKU creation on receipt reuses `next_category_sku`.
- Rate lookup adds a helper in `src/lib/fineEquivalent.ts` for "rate effective on or before a given date".
