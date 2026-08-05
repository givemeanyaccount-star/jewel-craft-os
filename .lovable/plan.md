# Editable Permission Matrix + User Administration

## Goal
Let an admin edit what each role can do (checkbox matrix, saved in the database), and manage users directly: invite/create, deactivate/remove, and change each user's roles.

## 1. Store permissions in the database
Today the matrix lives in code (`src/lib/permissions.ts`) and is read-only in the UI. Add a `role_permissions` table (role + permission key + enabled) seeded with the current defaults. Admin-only writes; all signed-in users can read so the app knows what they can do.

The code list of permission keys stays as the master list of *possible* permissions; the database decides which are granted per role.

## 2. Admin UI: editable matrix
On the Role Management page, turn the Permission Matrix into checkboxes:
- Toggle any role/permission cell, saved immediately with a toast.
- The admin role keeps `role_manage` locked on (prevents lockout).
- "Reset to defaults" button restores the built-in matrix.

## 3. Admin UI: user management
Same page, Users section gains:
- **Add user**: email, full name, phone, initial roles. Creates the account and sends them a set-password email.
- **Remove user**: deletes the account and its roles (with a confirm dialog; cannot remove yourself or the last admin).
- **Change roles**: existing per-user role checkboxes stay, plus a bulk role-template picker.
- Show email, sign-up date, and last sign-in per user.

Creating and deleting accounts must run server-side with admin privileges, so this needs a secure backend function that verifies the caller is an admin before acting.

## 4. Runtime enforcement
- Permissions load once at sign-in into the auth context and are used by `usePermission`, sidebar filtering, and route guards.
- Access rules in the database still enforce role-based limits, so a UI-only toggle can never grant more than the role is allowed at the data layer. Note: the checkbox matrix changes what the app *offers*; deeper data-level changes (for example letting sales cancel invoices) still require a matching database rule change.

## 5. Other role/user management suggestions (say which you want)
- **Audit log** of every role/permission change: who, what, when.
- **Custom roles** beyond the fixed five (e.g. "Branch manager"), instead of only editing the five built-ins.
- **Per-user overrides**: grant/revoke a single permission for one person without changing their role.
- **Temporary access**: role assignment with an expiry date.
- **Suspend instead of delete**: disable login while keeping history intact.
- **Branch scoping**: roles limited to a branch/location, ready for multi-store.

## Technical notes
- New table `public.role_permissions` (role `app_role`, permission text, allowed boolean), unique on (role, permission), admin-write / authenticated-read.
- New edge function `admin-users` with actions `list`, `create`, `delete`, verifying the caller's admin role from their token before using service-role privileges.
- `src/lib/permissions.ts` keeps `AppPermission`, `ALL_PERMISSIONS`, and `DEFAULT_ROLE_PERMISSIONS` (used for seeding and reset).
- New `PermissionsProvider` (or extend `useAuth`) fetching `role_permissions`; `usePermission` reads from it with the static defaults as fallback while loading.
- Files touched: `src/lib/permissions.ts`, `src/hooks/useAuth.tsx`, `src/hooks/usePermission.ts`, `src/pages/RoleManagement.tsx`, plus the new function and migration.
