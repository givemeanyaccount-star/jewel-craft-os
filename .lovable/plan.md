# Fix: "Complete sale" fails when saving the invoice

## What's happening

Completing a sale in the POS returns a permission error from the database (403, "new row violates row-level security policy for table invoices"), so no invoice is created.

Cause, confirmed by inspecting the database access rules: the invoices table has exactly one creation rule, and it only allows staff with the **sales** role. Admins and managers have no rule permitting invoice creation, so their checkout is rejected. Every other sales-related table (invoice items, customers, quotations, old gold) already allows admin and manager, which is why only this final step fails.

## The fix

A database migration that adds invoice creation rights for admin and manager, keeping the existing sales rule untouched:

- New insert policy on `public.invoices` allowing `admin` and `manager`.
- Payments already have an admin/manager insert policy, so no change needed there.

## Verification after the migration

- Complete a sale as the admin account and confirm the invoice, its items, and the payment records are saved.
- Confirm a sales-role user can still create invoices as before.
- Confirm viewer/accountant/karigar still cannot create invoices.
