-- ============ KARIGARS (craftsperson directory, not tied to system users) ============
CREATE TABLE public.karigars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  specialty text,
  payment_terms text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.karigars TO authenticated;
GRANT ALL ON public.karigars TO service_role;
ALTER TABLE public.karigars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read karigars" ON public.karigars FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write karigars" ON public.karigars FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar'));
CREATE TRIGGER trg_karigars_upd BEFORE UPDATE ON public.karigars FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RESTRUCTURE REPAIRS: header + line items (multiple items per receipt) ============
CREATE TABLE public.repair_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id uuid NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  item_description text NOT NULL,
  issue_description text NOT NULL,
  metal metal_type NOT NULL DEFAULT 'gold',
  purity text,
  gross_weight_in numeric(10,3) NOT NULL DEFAULT 0,
  stone_weight_in numeric(10,3) NOT NULL DEFAULT 0,
  net_weight_in numeric(10,3) NOT NULL DEFAULT 0,
  gross_weight_out numeric(10,3),
  stone_weight_out numeric(10,3),
  net_weight_out numeric(10,3),
  karigar_id uuid REFERENCES public.karigars(id),
  karigar_name text,
  status public.repair_status NOT NULL DEFAULT 'received',
  estimated_cost numeric(12,2) NOT NULL DEFAULT 0,
  final_cost numeric(12,2),
  photos text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_repair_items_repair ON public.repair_items(repair_id);
CREATE INDEX idx_repair_items_status ON public.repair_items(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_items TO authenticated;
GRANT ALL ON public.repair_items TO service_role;
ALTER TABLE public.repair_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read repair_items" ON public.repair_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write repair_items" ON public.repair_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar'));
CREATE TRIGGER trg_repair_items_upd BEFORE UPDATE ON public.repair_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Migrate any existing single-item repair rows into repair_items, then drop the now-redundant columns from repairs
INSERT INTO public.repair_items (repair_id, item_description, issue_description, metal, purity,
  gross_weight_in, stone_weight_in, net_weight_in, gross_weight_out, stone_weight_out, net_weight_out,
  karigar_id, status, estimated_cost, final_cost, photos)
SELECT id, item_description, issue_description, metal, purity,
  gross_weight_in, stone_weight_in, net_weight_in, gross_weight_out, stone_weight_out, net_weight_out,
  assigned_karigar, status, estimated_cost, final_cost, photos
FROM public.repairs
WHERE item_description IS NOT NULL;

ALTER TABLE public.repairs
  DROP COLUMN IF EXISTS item_description,
  DROP COLUMN IF EXISTS issue_description,
  DROP COLUMN IF EXISTS metal,
  DROP COLUMN IF EXISTS purity,
  DROP COLUMN IF EXISTS gross_weight_in,
  DROP COLUMN IF EXISTS stone_weight_in,
  DROP COLUMN IF EXISTS net_weight_in,
  DROP COLUMN IF EXISTS gross_weight_out,
  DROP COLUMN IF EXISTS stone_weight_out,
  DROP COLUMN IF EXISTS net_weight_out,
  DROP COLUMN IF EXISTS assigned_karigar,
  DROP COLUMN IF EXISTS estimated_cost,
  DROP COLUMN IF EXISTS final_cost,
  DROP COLUMN IF EXISTS photos,
  DROP COLUMN IF EXISTS status;

-- ============ SUPPLIERS: extra fields ============
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS pan_vat_number text,
  ADD COLUMN IF NOT EXISTS contact_person text;

-- ============ OLD GOLD PURCHASES: link to CRM customer ============
ALTER TABLE public.old_gold_purchases
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
