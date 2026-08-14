-- Backs up the existing app-level duplicate check with a real database constraint,
-- so two simultaneous customer creations can never both succeed with the same
-- phone number or the same ID document. Partial indexes so blank/NULL values
-- (common for walk-ins without a phone on file) are never treated as duplicates
-- of each other.

-- IMPORTANT: run diagnostic_duplicate_customers.sql FIRST. If it returns any rows,
-- resolve those duplicate customers (merge or clear the conflicting field) before
-- running this migration, or it will fail with a clear "duplicate key" error naming
-- the conflicting rows.

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique
  ON public.customers (phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE UNIQUE INDEX IF NOT EXISTS customers_id_doc_unique
  ON public.customers (id_doc_type, id_doc_number)
  WHERE id_doc_number IS NOT NULL AND id_doc_number <> '';
