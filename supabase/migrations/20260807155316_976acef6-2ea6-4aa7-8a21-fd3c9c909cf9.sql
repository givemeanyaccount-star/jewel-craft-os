CREATE TYPE public.return_status AS ENUM ('draft','processed','voided');

CREATE TABLE public.sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  credit_note_number text UNIQUE,
  status public.return_status NOT NULL DEFAULT 'draft',
  method text NOT NULL DEFAULT 'cash',
  reason text,
  gross numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax_retained numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  refund_paid numeric NOT NULL DEFAULT 0,
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  invoice_item_id uuid REFERENCES public.invoice_items(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  purity text,
  qty integer NOT NULL DEFAULT 1,
  original numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  disposition text NOT NULL DEFAULT 'restock',
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  new_inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_returns_invoice ON public.sales_returns(invoice_id);
CREATE INDEX idx_sales_return_items_return ON public.sales_return_items(return_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_returns TO authenticated;
GRANT ALL ON public.sales_returns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_return_items TO authenticated;
GRANT ALL ON public.sales_return_items TO service_role;

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read sales returns" ON public.sales_returns FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'viewer'));

CREATE POLICY "staff insert sales returns" ON public.sales_returns FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales'));

CREATE POLICY "staff update sales returns" ON public.sales_returns FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales'))
WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales'));

CREATE POLICY "staff delete draft sales returns" ON public.sales_returns FOR DELETE TO authenticated
USING (status = 'draft' AND (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales')));

CREATE POLICY "staff read sales return items" ON public.sales_return_items FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'viewer'));

CREATE POLICY "staff write sales return items" ON public.sales_return_items FOR ALL TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales'))
WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales'));

CREATE TRIGGER sales_returns_touch BEFORE UPDATE ON public.sales_returns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sales_return_items_touch BEFORE UPDATE ON public.sales_return_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();