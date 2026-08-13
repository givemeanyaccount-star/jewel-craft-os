-- Enums
CREATE TYPE public.order_status AS ENUM ('draft','open','in_production','ready','completed','cancelled');
CREATE TYPE public.order_item_status AS ENUM ('pending','assigned','in_progress','received','in_stock','billed','cancelled');

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  status public.order_status NOT NULL DEFAULT 'open',
  order_date date NOT NULL DEFAULT (now()::date),
  promised_date date,
  notes text,
  estimated_total numeric NOT NULL DEFAULT 0,
  advance_paid numeric NOT NULL DEFAULT 0,
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role)
  OR private.has_role(auth.uid(),'viewer'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role)
);
CREATE POLICY "orders_insert" ON public.orders FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role)
);
CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role)
);
CREATE POLICY "orders_delete" ON public.orders FOR DELETE TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Order items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  category_id uuid REFERENCES public.categories(id),
  metal public.metal_type NOT NULL DEFAULT 'gold',
  purity text NOT NULL DEFAULT '24K',
  quantity integer NOT NULL DEFAULT 1,
  expected_gross_weight numeric NOT NULL DEFAULT 0,
  expected_stone_weight numeric NOT NULL DEFAULT 0,
  expected_net_weight numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  rate_date date,
  making_input numeric NOT NULL DEFAULT 0,
  making_type text NOT NULL DEFAULT 'per_gram',
  wastage_input numeric NOT NULL DEFAULT 0,
  wastage_type public.wastage_type NOT NULL DEFAULT 'percentage',
  stone_value numeric NOT NULL DEFAULT 0,
  estimated_amount numeric NOT NULL DEFAULT 0,
  photos text[] NOT NULL DEFAULT '{}',
  karigar_id uuid REFERENCES public.karigars(id),
  karigar_name text,
  issued_at timestamptz,
  issued_metal public.metal_type,
  issued_purity text,
  issued_gross_weight numeric,
  issued_net_weight numeric,
  received_at timestamptz,
  received_gross_weight numeric,
  received_stone_weight numeric,
  received_net_weight numeric,
  status public.order_item_status NOT NULL DEFAULT 'pending',
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role)
  OR private.has_role(auth.uid(),'viewer'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role)
);
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role)
);
CREATE POLICY "order_items_update" ON public.order_items FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role)
);
CREATE POLICY "order_items_delete" ON public.order_items FOR DELETE TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER order_items_touch BEFORE UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Karigars may only touch their own assigned lines, and only production fields
CREATE OR REPLACE FUNCTION public.enforce_order_item_karigar_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
     OR private.has_role(auth.uid(),'sales'::app_role) THEN
    RETURN NEW;
  END IF;

  IF private.has_role(auth.uid(),'karigar'::app_role) THEN
    NEW.order_id := OLD.order_id;
    NEW.description := OLD.description;
    NEW.category_id := OLD.category_id;
    NEW.metal := OLD.metal;
    NEW.purity := OLD.purity;
    NEW.quantity := OLD.quantity;
    NEW.expected_gross_weight := OLD.expected_gross_weight;
    NEW.expected_stone_weight := OLD.expected_stone_weight;
    NEW.expected_net_weight := OLD.expected_net_weight;
    NEW.rate := OLD.rate;
    NEW.rate_date := OLD.rate_date;
    NEW.making_input := OLD.making_input;
    NEW.making_type := OLD.making_type;
    NEW.wastage_input := OLD.wastage_input;
    NEW.wastage_type := OLD.wastage_type;
    NEW.stone_value := OLD.stone_value;
    NEW.estimated_amount := OLD.estimated_amount;
    NEW.karigar_id := OLD.karigar_id;
    NEW.karigar_name := OLD.karigar_name;
    NEW.issued_at := OLD.issued_at;
    NEW.issued_metal := OLD.issued_metal;
    NEW.issued_purity := OLD.issued_purity;
    NEW.issued_gross_weight := OLD.issued_gross_weight;
    NEW.issued_net_weight := OLD.issued_net_weight;
    NEW.inventory_item_id := OLD.inventory_item_id;
    NEW.invoice_id := OLD.invoice_id;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_items_karigar_guard BEFORE UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_karigar_update();

-- Status log
CREATE TABLE public.order_item_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  status public.order_item_status NOT NULL,
  karigar_id uuid REFERENCES public.karigars(id),
  karigar_name text,
  gross_weight numeric,
  stone_weight numeric,
  net_weight numeric,
  note text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_item_status_log TO authenticated;
GRANT ALL ON public.order_item_status_log TO service_role;
ALTER TABLE public.order_item_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_item_log_select" ON public.order_item_status_log FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role)
  OR private.has_role(auth.uid(),'viewer'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role)
);
CREATE POLICY "order_item_log_insert" ON public.order_item_status_log FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role)
);

-- Links on existing tables
ALTER TABLE public.payments ADD COLUMN order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN order_date date;
ALTER TABLE public.invoices ADD COLUMN order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN rate_basis text NOT NULL DEFAULT 'current';
ALTER TABLE public.quotations ADD COLUMN order_date date;

CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_karigar ON public.order_items(karigar_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_payments_order ON public.payments(order_id);