# Fix role/data access + add password reset

## What's wrong

Confirmed root cause: the recent security hardening revoked permission to run the internal `has_role` role-check helper from logged-in users. Almost every access rule in the database calls that helper, so every data request now fails outright — including the one that loads your own roles.

Consequences you're seeing:
- After signing in, the app loads zero roles, so the sidebar hides Role Management (and most other menu items) even for admins.
- Inventory, invoices, customers, quotations, payments and repairs come back empty, because their access rules also call the same helper.

Your data is intact — it is only being blocked at the access-check layer. Admin accounts confirmed in the database: givemeanyaccount@gmail.com, royanshakya@gmail.com, matrikaghimire26@gmail.com.

## Fix 1 — restore role checks (database)

Grant logged-in users permission to run `has_role` and `get_user_roles` again. Both are safe: they only answer "does this user id have this role" and are read-only, so no privilege escalation. Anonymous users stay blocked.

After this, verify by signing in as an admin and confirming that roles show in the sidebar footer, Role Management appears, and Inventory/Invoices lists populate.

## Fix 2 — resilience against a silent empty-role state

Right now a failed role fetch is indistinguishable from "user has no roles". Add:
- Error surfacing in the auth hook when the role query fails, instead of silently setting an empty list.
- A visible "No roles assigned / could not load permissions — contact an admin" state on the dashboard when a signed-in user resolves to zero roles.

## Fix 3 — forgot password and reset

- Add a "Forgot password?" link on the sign-in tab of the auth page, opening a small inline form that sends a reset email with a redirect to `/reset-password`.
- Create a public `/reset-password` page that detects the recovery link, shows new-password + confirm-password fields, updates the password, and then redirects to sign-in.
- Register the route in the router as a public (non-protected) route.

Note: reset emails send through the default built-in sender unless you set up your own email domain later.

## Technical details

- Migration: `GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role), public.get_user_roles(uuid) TO authenticated;`
- `src/hooks/useAuth.tsx`: capture and expose the role-fetch error.
- `src/pages/Auth.tsx`: forgot-password form calling `resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`.
- New `src/pages/ResetPassword.tsx`: `supabase.auth.updateUser({ password })`.
- `src/App.tsx`: add the `/reset-password` route.
