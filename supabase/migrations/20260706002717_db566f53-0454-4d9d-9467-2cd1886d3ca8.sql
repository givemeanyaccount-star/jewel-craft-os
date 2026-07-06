
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS stones_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 13,
  ADD COLUMN IF NOT EXISTS luxury_tax_rate numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS luxury_tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS old_gold_credit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.quotation_items
  ADD COLUMN IF NOT EXISTS gross_weight numeric,
  ADD COLUMN IF NOT EXISTS stone_weight numeric,
  ADD COLUMN IF NOT EXISTS making_input numeric,
  ADD COLUMN IF NOT EXISTS making_type text,
  ADD COLUMN IF NOT EXISTS wastage_input numeric,
  ADD COLUMN IF NOT EXISTS wastage_type text;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS gross_weight numeric,
  ADD COLUMN IF NOT EXISTS stone_weight numeric;
