
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS making_input numeric,
  ADD COLUMN IF NOT EXISTS making_type text,
  ADD COLUMN IF NOT EXISTS wastage_input numeric,
  ADD COLUMN IF NOT EXISTS wastage_type text;
