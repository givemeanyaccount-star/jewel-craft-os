-- ============ KARIGAR RATE CONFIGURATION ============
-- Karigars are paid differently from each other: some per gram of finished weight,
-- some a percentage of metal value, some a flat rate agreed per job. Store the
-- default here; it can still be overridden on an individual job.
ALTER TABLE public.karigars
  ADD COLUMN IF NOT EXISTS making_rate_type text NOT NULL DEFAULT 'per_gram',
  ADD COLUMN IF NOT EXISTS making_rate numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_wastage_type text NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS default_wastage_value numeric(10,3) NOT NULL DEFAULT 0;

-- ============ WASTAGE ALLOWANCE ON ORDER ITEMS ============
-- IMPORTANT: wastage here is the metal allowance PAID TO the karigar as part of his
-- compensation -- it is not shrinkage the shop writes off. A karigar's metal
-- obligation is: issued - received - wastage_allowance.
-- The existing wastage_input/wastage_type columns describe what is CHARGED TO THE
-- CUSTOMER; these describe what is OWED TO THE KARIGAR. They are frequently the
-- same number but are conceptually distinct, so they get their own columns.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS karigar_wastage_type text,
  ADD COLUMN IF NOT EXISTS karigar_wastage_value numeric(10,3),
  ADD COLUMN IF NOT EXISTS karigar_wastage_grams numeric(10,3),
  ADD COLUMN IF NOT EXISTS karigar_making_type text,
  ADD COLUMN IF NOT EXISTS karigar_making_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS karigar_making_amount numeric(12,2);

-- ============ MAKING CHARGE ACCRUAL LEDGER ============
-- One row per finished piece received from a karigar: what he earned for that job.
-- Paired with karigar_payments (what he has actually been paid) this gives a real
-- payable balance instead of inferring it from what the customer was billed.
CREATE TABLE public.karigar_accruals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  karigar_id uuid NOT NULL REFERENCES public.karigars(id) ON DELETE CASCADE,
  source_type text NOT NULL,                     -- 'order' | 'repair'
  source_id uuid,                                -- order_item_id or repair_item_id
  reference_no text,
  description text,
  finished_net_weight numeric(10,3) NOT NULL DEFAULT 0,
  wastage_grams numeric(10,3) NOT NULL DEFAULT 0,
  making_type text,
  making_rate numeric(12,2),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  accrued_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_karigar_accruals_karigar ON public.karigar_accruals(karigar_id);
CREATE UNIQUE INDEX idx_karigar_accruals_source ON public.karigar_accruals(source_type, source_id)
  WHERE source_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.karigar_accruals TO authenticated;
GRANT ALL ON public.karigar_accruals TO service_role;
ALTER TABLE public.karigar_accruals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read karigar_accruals" ON public.karigar_accruals FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write karigar_accruals" ON public.karigar_accruals FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));
