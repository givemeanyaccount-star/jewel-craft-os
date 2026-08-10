# Admin user editing + restrict metal rate setting

## 1. Admin can edit other users' details

Add an "Edit" action beside each user in Role Management that opens a dialog to change:

- Full name
- Phone
- Username (uniqueness checked, same rules as invite: 3-30 chars, letters/numbers/. _ -)
- Email (sign-in address)

Rules:
- Only admins see and can use it (the page is already admin-only).
- Username collisions are rejected with a clear message.
- Every edit is written to the audit log with actor, target and the fields that changed.
- Role checkboxes stay where they are today; this dialog handles profile details only.

## 2. Metal rates limited to admin, manager and sales

Today the rate permission is also granted to the accountant role, and the "Set today's rates" prompt opens for any signed-in user on the dashboard when no rate exists for the day.

Changes:
- Grant the metal-rate permission to admin, manager and sales only. Accountant keeps reports, invoices and credit view but loses rate editing; viewer and karigar never had it.
- Update the stored permission rows so existing installs match the new default (accountant's rate permission is switched off).
- Dashboard: only trigger the daily rate prompt for users who hold the rate permission. Viewer and karigar will never see it at login or afterwards.
- Metal Rates page: keep the menu entry hidden for users without the permission (already the case) and additionally guard the route so a guessed URL shows access denied instead of an editable form.
- Database rules for the rates table are tightened so writes are accepted only from admin, manager and sales, matching the UI.

## Technical notes

- New `update` action in the `admin-users` edge function (admin-verified) handling profile fields plus email change via the admin auth API, with username uniqueness check and audit log insert.
- `src/pages/RoleManagement.tsx`: new edit dialog + state, calls the new action, refreshes list on success.
- `src/lib/permissions.ts`: remove `metal_rate_manage` from the accountant defaults.
- Data update on `role_permissions` to set accountant's `metal_rate_manage` to not allowed.
- `src/pages/Dashboard.tsx`: wrap the `setRateDialog(true)` auto-open in `hasPermission("metal_rate_manage")`.
- `src/App.tsx`: `/rates` route guarded to admin/manager/sales.
- Migration replacing the metal_rates write policies with role-scoped ones (`private.has_role` for admin/manager/sales); reads stay as they are so invoices and inventory still price correctly.
