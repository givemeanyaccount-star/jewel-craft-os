# Admin user editing + rate-setting restricted to sales roles

## 1. Admin can edit other users' details
On the Role Management page, each user row gets an "Edit" action opening a dialog to change:
- Full name
- Phone
- Username (uniqueness checked, same rules as invite)
- Email (updates the login email)

Saving records an entry in the audit log (who changed what, when). Editing another user's email and profile requires admin privileges server-side, so this goes through the existing secure admin function with a new `update` action that verifies the caller is an admin.

Roles stay where they are today (per-user role checkboxes), so this dialog is purely profile/login details.

## 2. Who can set metal rates
Rate setting is allowed for admin, manager, accountant and sales. Viewer and karigar can neither set rates nor see the "set today's rate" prompt.

Changes:
- Add rate permission to the sales role's defaults (admin, manager, accountant already have it; viewer and karigar do not).
- The daily rate dialog on the dashboard only auto-opens for users who hold the rate permission — viewers and karigars just see the rate cards, never the prompt.
- The Metal Rates page itself is guarded by the same permission (menu entry already is), so a viewer or karigar reaching it directly is blocked.

Note: because permissions live in the database, existing installs also need the sales row updated, and the viewer/karigar rows confirmed off.

## Technical notes
- `supabase/functions/admin-users/index.ts`: new `update` action — validates admin caller, validates username/email/name/phone, updates `auth.users` email via admin API, upserts `profiles`, writes `audit_logs` with action `user_updated`.
- `src/pages/RoleManagement.tsx`: new `EditUserDialog` (pattern-matched to `AddUserDialog`), pencil button per user row, reload on save.
- `src/lib/permissions.ts`: add `metal_rate_manage` to the `sales` defaults.
- Data update: set `role_permissions` allowed = true for (sales, metal_rate_manage); false for (viewer|karigar, metal_rate_manage).
- `src/pages/Dashboard.tsx`: wrap the `setRateDialog(true)` auto-prompt in `hasPermission("metal_rate_manage")`.
- `src/App.tsx` / route guard for `/rates`: ensure it requires the rate permission.
