# Permission Matrix for JewelMaster OS

## Goal
Replace coarse route-level role checks with a clear, auditable permission matrix so admins can see exactly what each role can do and the UI/database enforce the same rules.

## Proposed permission map

| Permission | admin | manager | sales | karigar | accountant |
|------------|-------|---------|-------|---------|------------|
| View dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| POS / create sales | ✓ | ✓ | ✓ | — | — |
| Create/edit quotations | ✓ | ✓ | ✓ | — | — |
| View invoices | ✓ | ✓ | ✓ | — | ✓ |
| Cancel/issue refunds | ✓ | ✓ | — | — | — |
| Manage inventory (CRUD) | ✓ | ✓ | ✓* | — | — |
| View inventory | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage customers | ✓ | ✓ | ✓ | — | — |
| View credit ledger | ✓ | ✓ | — | — | ✓ |
| Manage repairs | ✓ | ✓ | — | ✓ | — |
| Manage karigars | ✓ | ✓ | — | — | — |
| Manage purchases | ✓ | ✓ | — | — | — |
| Manage suppliers | ✓ | ✓ | — | — | — |
| Set metal rates | ✓ | ✓ | — | — | ✓ |
| Manage settings/taxes | ✓ | ✓ | — | — | — |
| Manage roles | ✓ | — | — | — | — |
| View reports | ✓ | ✓ | — | — | ✓ |
| Process old-gold purchases | ✓ | ✓ | ✓ | — | — |

*Sales can add inventory items at POS but not edit/delete master inventory.

## Implementation steps

### 1. Central permission registry
Create `src/lib/permissions.ts` with:
- An `AppPermission` union of all permission keys.
- A `ROLE_PERMISSIONS` record mapping each `AppRole` to its allowed permissions.
- Helper `can(role[], permission)`.

### 2. `usePermission` hook
Extend `src/hooks/useAuth.tsx` (or add `src/hooks/usePermission.ts`) to expose:
- `hasPermission(permission: AppPermission): boolean`
- `hasAnyPermission(permissions: AppPermission[]): boolean`

### 3. UI guards
- Update `AppLayout.tsx` so sidebar items use `hasPermission` instead of raw role arrays.
- Replace inline role checks across pages (POS, InvoiceDetail, Settings, etc.) with permission checks:
  - Hide "Cancel invoice" unless `cancel_invoice` permission.
  - Hide "Add inventory" unless `create_inventory` permission.
  - Hide "Edit rate" unless `manage_metal_rates` permission.
  - Disable "Delete" actions for non-admins where appropriate.

### 4. Backend enforcement via RLS
- Add/update RLS policies so row-level checks mirror the matrix:
  - `invoices`: sales can insert/read their own; managers/admins can read all and cancel/update.
  - `inventory_items`: sales can insert (POS additions) but only update status, not master data; managers/admins full CRUD.
  - `payments`, `quotations`, `old_gold_purchases`, `repairs`: scoped by role using `has_role()`.
  - Keep `user_roles` admin-only.

### 5. Visual permission matrix on Role Management page
Update `src/pages/RoleManagement.tsx` to show a read-only matrix (roles × permissions) so the admin can see what each role can do without guessing.

### 6. Route protection alignment
Update `src/App.tsx` `ProtectedRoute` calls to use the same permission-derived role lists where needed, or keep route-level role arrays as a coarse gate while pages use fine-grained permission checks.

## Outcome
Admins get a single source of truth for capabilities, the UI hides actions users cannot perform, and the database refuses unauthorized mutations even if the UI is bypassed.
