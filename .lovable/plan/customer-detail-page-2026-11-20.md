# Customer detail page

- Add `/customers/:id` with contact and ID details, credit balance, advance balance, and order/payment totals.
- Show linked orders, unused customer advances with their audit history, and all customer payments with links to related bills and orders.
- Open this page from global search and from customer cards; keep editing available as a separate action.
- Reuse existing permissions, date display, dialogs, and responsive design; verify the real customer flow on desktop and phone.

## Technical notes

Build a React page using the existing Cloud tables and row-level security. No schema changes are needed. New-advance entry remains unchanged in the existing customer list and advance dialog.
