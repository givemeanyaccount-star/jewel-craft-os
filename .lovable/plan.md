# Auto-update metal rates at 1 PM Nepal time

## What you'll get
- Every day at **1:00 PM Nepal time** the system checks whether today's gold and silver rates have been entered.
- **If someone already entered them** (by hand or with the "Fetch" button), nothing changes. Your typed rates are never overwritten.
- **If they are missing**, the system fetches the official FENEGOSIDA rates and saves them for all purities (24K, 22K, 18K, 14K, silver 999, 925). These rates are marked "auto (FENEGOSIDA)".
- **Backup check at 3:00 PM.** If FENEGOSIDA hadn't published yet at 1 PM, the system tries again at 3 PM. It runs twice a day at most, so the running cost stays tiny.
- Each automatic update, or failed attempt, is written to the Audit Log so you can see when and why it happened.
- The Metal Rates page shows a small note on auto-filled days: "Filled automatically at 1:00 PM".

## Also fixed
- "Today" is now worked out in Nepal time when rates are fetched. Before this, a fetch made before 5:45 AM Nepal time could be saved under yesterday's date.

## Technical details
- `fetch-gold-rate` edge function gains a scheduled mode. A shared secret header (`x-cron-secret`, stored as the `CRON_SECRET` secret) bypasses the user/role check. The signed-in, role-checked path stays as it is.
- In scheduled mode the function computes the Asia/Kathmandu date and checks `metal_rates` for that `effective_date`. If gold rows exist, it returns `{skipped:true}`. Otherwise it scrapes and inserts only the missing (metal, purity) rows, with `source = 'fenegosida.org (auto)'` and `created_by = null`. It then inserts an `audit_logs` row (`action = 'rates_auto_updated'` or `'rates_auto_failed'`) using the service role.
- Enable `pg_cron` + `pg_net`. Two jobs, run through the data-change tool (not migrations, because they contain the function URL): `15 7 * * *` and `15 9 * * *` UTC, which are 13:00 and 15:00 NPT. Each job posts to the function with the secret header.
- Add the label for `rates_auto_updated` / `rates_auto_failed` in `src/lib/audit.ts`. MetalRates.tsx shows the auto badge when `source` ends with `(auto)`.
- Verify: invoke the function in scheduled mode once and confirm it skips on a day that already has rates; confirm the cron jobs are listed.
