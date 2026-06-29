
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS luxury_tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luxury_tax_rate numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS stones_total numeric NOT NULL DEFAULT 0;
