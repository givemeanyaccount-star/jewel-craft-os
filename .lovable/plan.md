# Fix the broken backend objects, then run a full dummy-data workflow sweep

## What is actually wrong

The last four database changes were written into the project but never applied to the live database. Confirmed by querying the database directly:

- `next_document_number` — the function that issues INV / ORD / Q / PUR / REP / OG numbers — does not exist. Every place that creates a document calls it and throws immediately. This breaks: completing a sale, creating a quotation, booking an order, recording a purchase, opening a repair, and saving an old-metal purchase.
- The karigar accounting tables `karigar_payments` and `karigar_accruals` do not exist, and `karigars` is missing `making_rate`, `making_rate_type`, `default_wastage_type`, `default_wastage_value`. This breaks the Production page, the karigar ledger, and saving a karigar with rate defaults.
- A customer-uniqueness constraint was also never applied.

The unapplied files are `20260814070000_atomic_document_numbering`, `20260814071500_customer_uniqueness_constraint`, `20260814090000_karigar_payments`, `20260814120000_production_karigar_accounting`. The database's applied history stops at 13 Aug.

Type-checking confirms the same set of failures (24 errors, all pointing at these missing objects). The unit test suite (70 tests) passes, because it only covers pure calculation code.

## Plan

### 1. Apply the missing database changes
Re-apply the four pending changes as fresh migrations, reviewing each first so the numbering function, the karigar payment/accrual tables, the extra karigar columns, and the customer constraint all land with correct access rules (row-level security plus grants for each role that needs them). Regenerate the generated database types afterwards so the app code type-checks cleanly.

### 2. Verify with a clean type-check
Confirm all 24 errors are gone. Any remaining error is a real code bug and gets fixed in place.

### 3. Dummy-data end-to-end sweep
Drive the running app in a browser as a logged-in admin and walk each workflow with throwaway data, capturing console and network errors at each step:

- Metal rates: set a daily fine-gold and fine-silver rate, check derived 22K/18K/14K and 925 rates.
- Customers: create a test customer; confirm the duplicate rule behaves.
- Inventory: add an item with a photo, check the auto SKU and the QR/scan lookup.
- POS: build a cart, apply discount / net-amount override, take old metal in part payment, complete the sale, confirm numbering, totals, VAT-on-stones, SD tax, and print preview.
- Quotations: create, edit, accept into a sale, print.
- Orders: book an order with photos and notes, take a cash advance and an old-metal advance (with its own receipt), print the order confirmation, edit a line, remove and cancel a line, assign a karigar, issue metal, receive in two batches, stock into inventory, then bill the partial batch at POS with the order-date rate.
- Production and karigars: karigar ledger, outstanding metal, wastage allowance, record a payment.
- Repairs: receive, assign, complete, deliver.
- Purchases and old metal: create both, print receipts.
- Sales returns: partial and full return, refund, stock restoration, credit note, offline queue behaviour.
- Roles: spot-check that a viewer and a karigar login see only what they should.

### 4. Fix and re-verify
Every failure found gets fixed and the affected flow re-run. Test data created during the sweep is removed at the end.

### 5. Report
A short list of what was broken, what was fixed, and anything left that needs a decision from you.

## Technical notes

- Migrations are re-issued rather than edited in place, so the database history stays consistent; each new table gets row-level security plus explicit grants.
- The sweep runs against the preview app with a real authenticated session, so row-level security and permissions are exercised for real rather than mocked.
