# Keep the sale draft alive when leaving the sales page

## Problem

Everything typed into the sales screen (customer, cart lines, edited weights/rates, discount, round-off, old metal credit, advance split, refund, payment lines, notes, order link) lives only in React state on `src/pages/POS.tsx`. Leaving the page — Back, the Escape shortcut, a menu click, or the redirect to the invoice after Complete Sale — destroys it all, and coming back gives an empty bill.

## What changes

**1. The draft is saved automatically**

Every change to the bill is written to a local draft in the browser (per user, survives reload and offline). Nothing goes to the database — an unfinished bill stays private to that counter until it is posted.

Saved: customer, order/quotation link and rate basis, cart rows with all edits, discount, round-off, target amount, old metal credit + linked purchase, advance apply split, refund amount and method, payment lines, notes, issue date.

**2. Coming back restores it**

Re-entering the sales page restores the last draft and shows a small bar at the top: "Restored unsaved bill · Discard". So editing an inventory item on another page, then returning, keeps the bill intact.

If the user opens the sales page fresh from an order or quotation that differs from the stored draft, the draft is kept but the bar offers "Start new bill for this order" so the two don't silently mix.

**3. Leaving asks first**

When the bill has content (a customer or any cart line), attempting to leave triggers a confirmation dialog: **Keep bill** (default, stays or leaves with the draft saved) / **Cancel bill** (clears the draft and leaves). Covered exits:
- Back button and any in-app navigation (router-level block)
- The Escape-to-go-back shortcut
- Browser tab close/refresh (native "leave site?" prompt)

**4. After a successful sale the draft is cleared**

Only once the invoice is created does the draft get deleted, then the redirect to the invoice happens. If checkout fails at any point, the draft survives so nothing typed is lost.

## Technical notes

- New `src/hooks/usePosDraft.ts`: debounced serialize/restore of a versioned draft object in `localStorage` under a key scoped to the signed-in user id. Version stamp so an older draft shape is dropped instead of crashing.
- `src/pages/POS.tsx`: one `useEffect` writing the draft from existing state, one restore-on-mount effect running before the order/quotation loaders, `clearDraft()` immediately before `nav(/invoices/:id)` in `checkout()`, and a "dirty" flag derived from customer/cart.
- Exit guard: `useBlocker` from react-router (BrowserRouter data APIs) if available in the installed version, otherwise an interception wrapper on `nav` plus a `beforeunload` listener; `src/hooks/useEscapeBack.ts` gains an opt-out so the sales page can route Escape into the same confirmation.
- Reuse the existing shadcn `AlertDialog` for the confirm; no schema change, no new dependency.
