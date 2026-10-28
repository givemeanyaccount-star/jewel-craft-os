# Fresh-shop reset and bringing over old records

## Part 1 — Reset the shop to a clean slate

**Who can do it:** only an admin. A signed-in session is not enough on its own. Before the reset runs, the admin must:
1. Type their **password again**. The system checks it by signing them in fresh, so a laptop left open can't be used.
2. Type the phrase **RESET SHOP** exactly.
3. Enter a **6-digit code emailed to the admin's address** at that moment. The code is valid for 10 minutes and works once.

**Where:** Settings → new "Danger zone" card with a "Reset shop data" button. Before anything starts, a summary shows how many customers, items, bills, orders and so on will be deleted.

**What is erased:** customers and their ID photos, stock items and their photos, sales bills, quotations, payments and advances, orders, repairs, karigars and their accounts, purchases and suppliers, old metal purchases, sales returns, held counter bills, shop details, logo and settings, categories and locations. Bill numbering also starts again from 1. Uploaded photos and documents in storage are deleted too.

**What is kept:** staff logins and roles (with the permission grid), and metal rate history.

**Safety net:** first, a full backup file (Excel, one sheet per record type) is downloaded to the admin's computer. The reset only runs after that download succeeds. The reset itself runs in one step on the server: either everything is cleared, or nothing is. One line is kept in the Audit Log, which itself survives: "Shop reset by …, at …, counts removed".

**After the reset:** the app opens a short **Setup checklist**: shop details and logo → VAT and tax settings → categories and locations → today's rates → bring in old records → done.

## Part 2 — Bring over old records

A new **Import** page (admin and manager), reachable from the setup checklist and from Settings. It covers stock items and past sales bills, either by file upload or typed by hand.

### Stock items
- **Upload:** download a ready-made Excel/CSV template, fill it in, then upload it. Columns: name, category, metal, purity, gross/stone weight, making, wastage, stone value, location, **received date**, supplier, and the old software's code (optional).
- Before saving, a preview table checks every row: numbers, purity, categories that don't exist yet (offered to be created) and duplicate codes. Rows with problems are shown in red and skipped until fixed.
- Labels (SKU/QR) are generated as usual. The old code is kept so tags already printed can still be scanned.
- **By hand:** the normal Add Item form gains a "Received date" box (AD/BS).

### Past sales bills
- **Upload:** one file with a line per item. Columns: **old bill number**, **bill date**, customer name and phone, item description, metal, purity, weight, rate, making, wastage, stone value, discount, tax, total, amount paid and payment method.
- Customers are matched by phone, or created if missing.
- **By hand:** an "Enter past bill" screen, a simplified sale screen with a **bill date** box (AD/BS, must be before the shop's go-live date). It prints nothing and does not take items out of stock.
- Imported bills:
  - keep their **original bill number**, marked "Imported";
  - show their original date in the sales report, invoices list and customer history;
  - do **not** use up this app's bill numbers, so the first new sale still gets INV-…-00001;
  - are **locked**: they can't be cancelled or edited, only deleted by an admin.
- Any unpaid amount on an imported bill becomes the customer's balance owed.

### Go-live date
Settings gains a "Started using this app on" date. Everything dated before it counts as imported history, and the import screens refuse dates on or after it.

## Technical details
- **Reset:** edge function `shop-reset`, admin only.
  - Step 1 `request`: re-verifies the password with `signInWithPassword`, stores a hashed 6-digit code with a 10-minute expiry in `private.reset_challenges`, emails the code, and returns row counts.
  - Step 2 `confirm`: checks the phrase and code, then calls the SECURITY DEFINER `private.reset_shop_data()`. That function TRUNCATEs every business table in one transaction (`RESTART IDENTITY CASCADE`), clears `document_sequences`, re-seeds the default `app_settings` and `company_profile` rows, and keeps `profiles`, `user_roles`, `role_permissions`, `metal_rates` and `audit_logs`. The function then empties the `customer-docs` and `product-images` buckets.
  - The client builds the backup Excel (xlsx) before calling confirm.
  - Email for the code uses the project's email setup. If no sending domain is configured, setup will be part of this work.
- **Import:**
  - New nullable columns: `invoices.is_imported`, `invoices.legacy_number`, `inventory_items.legacy_code`, and `app_settings.go_live_date`.
  - Imported invoices use `invoice_number = legacy_number`. A unique index covers non-imported numbers only, so it can't clash.
  - Inserts go through a SECURITY DEFINER `import_past_invoice(jsonb)` RPC that validates dates against the go-live date, creates or matches the customer, writes the invoice, items and payments, and marks the items sold.
  - A guard trigger blocks cancel and edit on imported invoices.
  - File parsing is done client-side with SheetJS; the preview and validation are a pure module with unit tests (date parsing in AD and BS, purity, totals).
- Tests:
  - reset keeps users, roles and rates, and leaves counts at zero;
  - an imported bill doesn't move the INV counter;
  - dates on or after go-live are rejected.
