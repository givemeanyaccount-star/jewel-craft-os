# Project architecture
- Keep date-entry behavior in the shared DateField and BS calendar, emitting AD date-only strings; this gives every form consistent conversion and validation without changing storage.- Scheduled jobs authenticate to edge functions with a token stored in private.cron_config (checked via verify_cron_token), so no secret is written into job definitions.
