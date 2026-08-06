# Lock the viewer role down to read-only

## What I checked

I read every access rule currently on the database. The good news: no write rule anywhere grants the viewer role permission to create, edit or delete. Viewer today can read inventory, invoices, invoice lines and metal rates, which is what it should see.

Three gaps remain:

1. **Over-broad reads.** Settings, categories, locations and metal rates are readable by *any* signed-in user (rule literally says "true"), not by named roles. That is wider than intended and hides future mistakes.
2. **Unverified in practice.** No end-to-end proof yet that a viewer's attempt to write is rejected. Rules must be tested with a real viewer session, not assumed.
3. **Guessable URLs.** Routes are guarded, but a viewer landing on an invoice page can still see edit/cancel/payment buttons that will fail server-side with a confusing error instead of being hidden.

## What I will do

**1. Tighten read rules**
- Replace the "any signed-in user" read rules on settings, categories, locations and metal rates with role-named rules that include viewer (viewer needs rates and categories to render inventory and invoices correctly).
- Confirm viewer can read the payment rows attached to an invoice it is allowed to open; grant read-only if missing so the invoice page renders instead of silently showing nothing.
- Leave customers, quotations, repairs, purchases, suppliers, old gold, audit logs, users and permissions unreadable by viewer.

**2. Add explicit deny-by-default proof**
- Run a verification pass signed in as a viewer account against every table: attempt one create, one edit and one delete per table and confirm each is rejected, and confirm the allowed reads still work. Report the matrix of results.

**3. Harden the UI for guessed URLs**
- Route guards: keep dashboard, inventory list, inventory detail, invoice list and invoice detail available to viewer; every other route already excludes it. Add viewer to the guard list explicitly rather than relying on "any authenticated".
- Hide (not just disable) create/edit/delete/cancel/refund/payment controls on inventory and invoice pages when the signed-in user lacks the matching permission, so a guessed URL shows a read-only view.

**4. Server functions**
- Re-confirm the admin-users and gold-rate functions reject callers without the required role, so a viewer's token cannot drive them.

## Technical notes

- All rule changes go through a single database migration; policies use the existing `private.has_role()` helper and stay `TO authenticated`.
- UI gating uses the existing `usePermission` / `canWith` matrix (`inventory_manage`, `invoice_cancel_refund`, `pos_create_sale`) — no new permission names.
- Verification is done with a real viewer session against the running app, and the results are reported back before I call this done.
