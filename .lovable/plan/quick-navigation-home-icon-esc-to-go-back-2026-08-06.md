# Quick navigation: Home icon + Esc to go back

## What changes

1. **Subtle home button in the top bar** — a small, ghost-style house icon sits in the header (left of the page title), on every page except the dashboard itself. Clicking it returns to the dashboard. It has a tooltip and an accessible label ("Go to dashboard").

2. **Esc key goes back** — pressing Escape anywhere in the app navigates to the previous page. It is ignored when the user is typing in an input, textarea, or select, and when a dialog, sheet, dropdown, or other overlay is open (so Esc still just closes those). On the dashboard, Esc does nothing.

## Technical notes

- `src/components/AppLayout.tsx`: add a `Home` (lucide) icon button in the sticky header, rendered only when `location.pathname !== "/"`, using existing ghost button + tooltip styling so it stays visually quiet.
- New hook `src/hooks/useEscapeBack.ts`: window `keydown` listener for `Escape`; bails out if `event.defaultPrevented`, if the target is an editable element, or if `document.querySelector('[data-state="open"][role="dialog"], [data-radix-popper-content-wrapper]')` matches an open overlay. Otherwise calls `navigate(-1)`.
- Hook is called once inside `AppLayout`, so all layout-wrapped pages get it without per-page changes.
- No backend, data, or business-logic changes.
