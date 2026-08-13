CREATE TABLE public.order_item_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  batch_no integer NOT NULL DEFAULT 1,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  karigar_id uuid REFERENCES public.karigars(id),
  karigar_name text,
  issued_gross_weight numeric CHECK (issued_gross_weight IS NULL OR issued_gross_weight >= 0),
  issued_net_weight numeric CHECK (issued_net_weight IS NULL OR issued_net_weight >= 0),
  received_gross_weight numeric NOT NULL DEFAULT 0 CHECK (received_gross_weight >= 0),
  received_stone_weight numeric NOT NULL DEFAULT 0 CHECK (received_stone_weight >= 0),
  received_net_weight numeric NOT NULL DEFAULT 0 CHECK (received_net_weight >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  status order_item_status NOT NULL DEFAULT 'received',
  inventory_item_id uuid REFERENCES public.inventory_items(id),
  invoice_id uuid REFERENCES public.invoices(id),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_item_receipts_item_idx ON public.order_item_receipts(order_item_id);
CREATE INDEX order_item_receipts_invoice_idx ON public.order_item_receipts(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_receipts TO authenticated;
GRANT ALL ON public.order_item_receipts TO service_role;

ALTER TABLE public.order_item_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_item_receipts_select ON public.order_item_receipts FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role)
    OR private.has_role(auth.uid(),'viewer'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role));

CREATE POLICY order_item_receipts_insert ON public.order_item_receipts FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role));

CREATE POLICY order_item_receipts_update ON public.order_item_receipts FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role))
WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role) OR private.has_role(auth.uid(),'karigar'::app_role));

CREATE POLICY order_item_receipts_delete ON public.order_item_receipts FOR DELETE TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER order_item_receipts_touch BEFORE UPDATE ON public.order_item_receipts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS received_qty integer NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  ADD COLUMN IF NOT EXISTS stocked_qty integer NOT NULL DEFAULT 0 CHECK (stocked_qty >= 0),
  ADD COLUMN IF NOT EXISTS billed_qty integer NOT NULL DEFAULT 0 CHECK (billed_qty >= 0);

-- Backfill existing single-shot receipts as one batch each
INSERT INTO public.order_item_receipts
  (order_item_id, batch_no, quantity, karigar_id, karigar_name, issued_gross_weight, issued_net_weight,
   received_gross_weight, received_stone_weight, received_net_weight, received_at, status, inventory_item_id, invoice_id, note)
SELECT oi.id, 1, GREATEST(oi.quantity,1), oi.karigar_id, oi.karigar_name, oi.issued_gross_weight, oi.issued_net_weight,
   COALESCE(oi.received_gross_weight,0), COALESCE(oi.received_stone_weight,0), COALESCE(oi.received_net_weight,0),
   COALESCE(oi.received_at, now()), oi.status, oi.inventory_item_id, oi.invoice_id, 'Migrated from single receipt'
FROM public.order_items oi
WHERE oi.received_at IS NOT NULL AND oi.status IN ('received','in_stock','billed');

UPDATE public.order_items oi SET
  received_qty = CASE WHEN oi.status IN ('received','in_stock','billed') THEN GREATEST(oi.quantity,1) ELSE 0 END,
  stocked_qty = CASE WHEN oi.status IN ('in_stock','billed') THEN GREATEST(oi.quantity,1) ELSE 0 END,
  billed_qty = CASE WHEN oi.status = 'billed' THEN GREATEST(oi.quantity,1) ELSE 0 END;