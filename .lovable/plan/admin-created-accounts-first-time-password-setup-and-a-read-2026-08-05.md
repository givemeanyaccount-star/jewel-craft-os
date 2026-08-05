# Admin-created accounts, first-time password setup, and a read-only Google role

## What changes

1. **No public sign-up.** The Auth page keeps only Sign in (email + password), Forgot password, and Continue with Google. The Sign up tab is removed.
2. **Admin creates users.** In Role Management, the invite form asks for username (unique), full name, email, phone, and roles. The new account gets no password.
3. **First sign-in sets the password.** The invited user receives an email link that opens the existing set-password page, where they type the new password twice and it must match. The Auth page also gets a "First time here? Set your password" link that emails the same link on demand.
4. **Username** is stored on the user profile and shown across the user list. Sign-in still uses the email address; the username is a unique display handle.
5. **New "viewer" role for Google sign-ins.** Anyone signing in with Google for the first time is created as `viewer`, not `sales`. Viewers can browse the app, see the inventory list and item details, and open invoices — nothing else. No create, edit, delete, POS sales, settings, or role management; the Role Management entry is hidden for them.

## Technical details

**Database migration**
- Add `viewer` to the `app_role` enum.
- Add `username` (text, unique, case-insensitive) to `profiles`.
- Update `handle_new_user`: first user stays `admin`; users created through Google (no invite metadata) get `viewer`; invited users get the roles the admin picked (passed via user metadata) or `sales` as fallback. Store `username` from metadata into `profiles`.
- Seed `role_permissions` rows for `viewer`: `view_dashboard`, `inventory_view`, `invoice_view` only.
- Extend read RLS policies on inventory, categories, locations, invoices, invoice_items, and metal_rates so `viewer` can read; no write policies reference `viewer`.

**Frontend**
- `src/lib/permissions.ts`: add `viewer` to `AppRole`/`ALL_ROLES` and to `DEFAULT_ROLE_PERMISSIONS` with the three read permissions.
- `src/pages/Auth.tsx`: remove the Sign up tab and its form; keep sign-in, forgot password, Google; add "First time here? Set your password" which calls the same reset-password email flow with wording for activation.
- `src/pages/ResetPassword.tsx`: already requires two matching entries; adjust the copy so it works for both activation and reset.
- `src/pages/RoleManagement.tsx`: invite form gains a required username field with client-side uniqueness check; user table shows the username column; role checkboxes include `viewer`.
- `supabase/functions/admin-users/index.ts`: `create` action accepts `username`, validates format and uniqueness against `profiles`, and passes username + roles in the invite metadata.
- `src/App.tsx`: routes stay permission-driven; viewers reach `/`, `/inventory`, `/inventory/:id`, `/invoices`, `/invoices/:id` and are denied elsewhere.
- Sidebar and page action buttons already gate on permissions, so viewers see read-only screens automatically.

## Notes

- Existing accounts are unaffected; nobody is auto-converted to `viewer`.
- An admin can promote a Google viewer to any other role from Role Management at any time.
