# Nepali fiscal-year books

- Start each year on Shrawan 1 and end on the actual last day of Ashadh, calculated from the Nepali calendar.
- Automatically close the prior year at Nepal midnight and open the next year without resetting or deleting the database.
- Preserve a year-end archive of sales, receipts/payments, purchases, old-metal purchases, returns, customer advances, and outstanding order/repair/karigar records. Carry live stock, receivables and unused advances forward without duplicating them.
- Restart sale bill numbers at 1 with a unique Nepali fiscal-year prefix; leave existing and imported numbers unchanged.
- Add a Fiscal Years page with current/closed status, date ranges, opening/closing figures and downloadable Excel books.
- Protect closed sale/purchase/receipt figures from edits; allow dated later-year payments on outstanding bills. Keep open orders and repairs usable across years.
- Record rollover and archive creation in the Audit Log. Treat failures as pending closing, not successful backups.

## Scope and safety

These are the app's operational books, not a complete double-entry general ledger. The archive is not a full restorable database backup and excludes stored photos. Full database exports remain available through More → Database → Manage → Settings → Export data; storage files must be downloaded separately from More → Storage.

## Technical approach

Use authoritative AD date boundaries converted from BS; transactional, idempotent database closing and immutable book snapshots; a daily Nepal-midnight job plus an on-write rollover safeguard; role-protected archive reads; tests for Shrawan boundaries and yearly numbering.