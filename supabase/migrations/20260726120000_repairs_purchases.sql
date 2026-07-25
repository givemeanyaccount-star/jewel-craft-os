-- ============ REPAIRS & SERVICE ============
CREATE TYPE public.repair_status AS ENUM ('received','in_progress','quality_check','ready','delivered');

CREATE TABLE public.repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_no text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id),
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
  assigned_karigar uuid REFERENCES auth.users(id),
  status public.repair_status NOT NULL DEFAULT 'received',
  estimated_cost numeric(12,2) NOT NULL DEFAULT 0,
  final_cost numeric(12,2),
  photos text[] NOT NULL DEFAULT '{}',
  special_notes text,
  received_at timestamptz NOT NULL DEFAULT now(),
  expected_delivery date,
  delivered_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_repairs_status ON public.repairs(status);
CREATE INDEX idx_repairs_customer ON public.repairs(customer_id);
CREATE INDEX idx_repairs_karigar ON public.repairs(assigned_karigar);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repairs TO authenticated;
GRANT ALL ON public.repairs TO service_role;
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read repairs" ON public.repairs FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write repairs" ON public.repairs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar'));

CREATE TRIGGER trg_repairs_upd BEFORE UPDATE ON public.repairs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SUPPLIERS ============
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  address text,
  city text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_suppliers_upd BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ PURCHASES ============
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_no text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.suppliers(id),
  purchase_date date NOT NULL DEFAULT current_date,
  invoice_no text,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'paid',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX idx_purchases_date ON public.purchases(purchase_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mgr all purchases" ON public.purchases FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_purchases_upd BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  metal metal_type NOT NULL DEFAULT 'gold',
  purity text,
  gross_weight numeric(10,3) NOT NULL DEFAULT 0,
  stone_weight numeric(10,3) NOT NULL DEFAULT 0,
  net_weight numeric(10,3) NOT NULL DEFAULT 0,
  rate_per_gram numeric(12,2) NOT NULL DEFAULT 0,
  making_charge numeric(12,2) NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mgr all purchase items" ON public.purchase_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
