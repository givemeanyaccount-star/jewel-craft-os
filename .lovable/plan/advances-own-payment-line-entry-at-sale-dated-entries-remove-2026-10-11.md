# Advances: own payment line, entry at sale, dated entries; remove Card

## What changes

### 1. "Advance" as a payment mode on the sale screen
- The payment rows on the sale screen get a new mode **Advance**. It lists the cash advances already paid on the order, each with its date and amount, and adds them into "Advance applied".
- At the sale you can also **record a new advance** (amount, method, date). Use it when the customer paid earlier but it was never entered, or when they pay a deposit now and pick up later. It is saved on the order (or on the customer when no order is attached). It counts toward this bill the same way as order advances.
- The printed bill and invoice screen list each advance with its date under "Advance applied".

### 2. Advances on different dates, with a date box
- The Advances window (order booking and order page) gets a **Date paid** box using the AD/BS date picker. It defaults to today and can't be set in the future.
- You can add as many advances as you like, each on its own date. The order page and the printed order receipt show each one with its date.

### 3. Remove Card as a payment option
- **Card** is removed from every payment list: sale, invoice payments, order advances, old metal purchase, supplier purchases, refunds and returns, and cancellation refunds.
- Old records paid by card still show as "Card" in history and reports. Nothing is changed on past bills.

## Technical notes
- One shared `PAYMENT_METHODS` list in `src/lib/format.ts` (no `card`) replaces the copies in POS, InvoiceDetail, AdvanceDialog, OrderDetail, Orders, OldGoldForm, Purchases, SalesReturns and CancelInvoiceDialog. The `card` enum value stays in the database for history.
- "Advance" is a screen-only mode, not a new database value. Advances are stored as `payments` rows with `order_id` (or customer only), real method and chosen `paid_at`. At checkout they link to the invoice through the existing advance-splitting logic.
- AdvanceDialog: add a `paid_at` DateField (max today), stored at noon Kathmandu time so the date doesn't shift.
- POS: "Record advance" mini-dialog inserts the payment, then reloads the advances. Customer-only advances (no order) load for the selected customer when `invoice_id` and `order_id` are null and method is not old_gold.
- `reconcile()`, PrintDocument and InvoiceDetail list advance rows with dates. Extend the net-payable tests with a two-date advance case.
- No schema migration is needed.
