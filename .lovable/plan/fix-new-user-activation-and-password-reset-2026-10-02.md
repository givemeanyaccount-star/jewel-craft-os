# Fix new-user activation and password reset

## What the records show
- **Adding a user does work.** The account for shakyamunilmas@gmail.com was created today at 08:58 and the invite email went out. But the account has never been activated and has no password yet, so every sign-in attempt with it fails ("invalid login credentials").
- **The reset link changed the wrong password.** At 11:04 a reset was requested for shakyamunilmas@gmail.com. When the link was opened, the email link had already been used or expired. But the same browser was still signed in as the admin (givemeanyaccount@gmail.com, via Google). The "Set a new password" page accepts *any* signed-in session, so the new password was saved on the **admin's** account and not on the new user's account. The new account still has no password.
- Earlier links also failed with "email link has expired" or "invalid". These links only work once and don't last long, and the page gave no warning when that happened.

## Changes

1. **Set-password page only works from a valid email link**
   - It unlocks only when it receives the one-time recovery or invite link. Being already signed in no longer unlocks it.
   - If someone else is signed in on that browser, they are signed out first. The page then names the account whose password is being set ("Setting password for name@…").
   - If the link is expired or already used, the page says so clearly and offers a "Send a new link" button with the email filled in, so nobody is left on a page that looks broken.
   - Weak-password errors are shown in plain words ("choose a less common password").
2. **Invite links that work**
   - Invites point straight at the set-password page on the address the admin is using, including your own domain.
   - In User management, each user who hasn't activated yet shows a "Pending activation" badge and a **Resend invite** button. This sends a fresh link to replace an expired one.
   - When an invite fails, the add-user form shows the real reason (username taken, email already registered, email limit reached) instead of failing silently.
3. **Admin can set a password directly (backup option)**
   - On a user's row, admin gets **Set password**. It sets a temporary password for that user right away, without email, and records it in the audit log. Use this for staff who can't reach their email.
4. **Repair today's accounts**
   - Using the Set password option above, give shakyamunilmas@gmail.com a working password.
   - givemeanyaccount@gmail.com now has the password that was typed on the reset page. Google sign-in for that account still works as normal.

## Technical notes
- `ResetPassword.tsx`: unlock only on the `PASSWORD_RECOVERY` event or on `type=recovery|invite` in the URL hash/code, and drop the `getSession()` unlock. Read `error_code`/`error_description` from the hash for the expired-link state. Show `session.user.email`.
- `admin-users` edge function: `create` passes `redirect_to = origin + /reset-password` (client sends it) and returns clear error messages. Add a `resend_invite` action (`generateLink`/`inviteUserByEmail`, or a recovery link if already confirmed) and a `set_password` action (`updateUserById` with password + `email_confirm: true`), both admin-only and audited (new `password_set` details / `user_invite_resent` action added to `log_audit_event` whitelist).
- `RoleManagement.tsx`: pending badge from `email_confirmed_at`/`last_sign_in_at`, Resend invite + Set password buttons, surface the function's error text.
- Verify: browser test of an expired link, a valid recovery link while another user is signed in, and admin Set password followed by sign-in.
