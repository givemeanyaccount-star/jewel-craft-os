ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS round_off numeric NOT NULL DEFAULT 0;