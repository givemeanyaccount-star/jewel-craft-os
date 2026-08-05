-- inventory_items: role-based access
DROP POLICY IF EXISTS "auth read items" ON public.inventory_items;
DROP POLICY IF EXISTS "staff write items" ON public.inventory_items;

CREATE POLICY "staff read inventory" ON public.inventory_items
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'sales') OR
  public.has_role(auth.uid(), 'karigar') OR
  public.has_role(auth.uid(), 'accountant')
);

CREATE POLICY "staff insert inventory" ON public.inventory_items
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'sales')
);

CREATE POLICY "manager admin update inventory" ON public.inventory_items
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "sales update inventory status only" ON public.inventory_items
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'sales'))
WITH CHECK (
  public.has_role(auth.uid(), 'sales') AND
  -- only status may change; all other master fields must remain unchanged
  name IS NOT DISTINCT FROM (SELECT name FROM public.inventory_items WHERE id = inventory_items.id) AND
  description IS NOT DISTINCT FROM (SELECT description FROM public.inventory_items WHERE id = inventory_items.id) AND
  category_id IS NOT DISTINCT FROM (SELECT category_id FROM public.inventory_items WHERE id = inventory_items.id) AND
  metal IS NOT DISTINCT FROM (SELECT metal FROM public.inventory_items WHERE id = inventory_items.id) AND
  purity IS NOT DISTINCT FROM (SELECT purity FROM public.inventory_items WHERE id = inventory_items.id) AND
  gross_weight IS NOT DISTINCT FROM (SELECT gross_weight FROM public.inventory_items WHERE id = inventory_items.id) AND
  stone_weight IS NOT DISTINCT FROM (SELECT stone_weight FROM public.inventory_items WHERE id = inventory_items.id) AND
  net_weight IS NOT DISTINCT FROM (SELECT net_weight FROM public.inventory_items WHERE id = inventory_items.id) AND
  fine_weight IS NOT DISTINCT FROM (SELECT fine_weight FROM public.inventory_items WHERE id = inventory_items.id) AND
  making_charge IS NOT DISTINCT FROM (SELECT making_charge FROM public.inventory_items WHERE id = inventory_items.id) AND
  making_charge_type IS NOT DISTINCT FROM (SELECT making_charge_type FROM public.inventory_items WHERE id = inventory_items.id) AND
  wastage_type IS NOT DISTINCT FROM (SELECT wastage_type FROM public.inventory_items WHERE id = inventory_items.id) AND
  wastage_value IS NOT DISTINCT FROM (SELECT wastage_value FROM public.inventory_items WHERE id = inventory_items.id) AND
  stone_value IS NOT DISTINCT FROM (SELECT stone_value FROM public.inventory_items WHERE id = inventory_items.id) AND
  location_id IS NOT DISTINCT FROM (SELECT location_id FROM public.inventory_items WHERE id = inventory_items.id) AND
  received_from IS NOT DISTINCT FROM (SELECT received_from FROM public.inventory_items WHERE id = inventory_items.id) AND
  received_at IS NOT DISTINCT FROM (SELECT received_at FROM public.inventory_items WHERE id = inventory_items.id)
);

CREATE POLICY "manager admin delete inventory" ON public.inventory_items
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

-- invoices: sales own, managers/admins all, accountants read all
DROP POLICY IF EXISTS "staff read invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff write invoices" ON public.invoices;

CREATE POLICY "staff read invoices" ON public.invoices
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'accountant') OR
  public.has_role(auth.uid(), 'sales')
);

CREATE POLICY "sales insert own invoices" ON public.invoices
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'sales'));

CREATE POLICY "manager admin update invoices" ON public.invoices
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "sales update own draft invoices" ON public.invoices
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'sales') AND
  created_by = auth.uid() AND
  status IN ('draft', 'issued')
)
WITH CHECK (
  public.has_role(auth.uid(), 'sales') AND
  created_by = auth.uid()
);

-- payments: sales can add payments on invoices they created; managers/admins all; accountants read all
DROP POLICY IF EXISTS "staff read payments" ON public.payments;
DROP POLICY IF EXISTS "staff write payments" ON public.payments;

CREATE POLICY "staff read payments" ON public.payments
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'accountant') OR
  public.has_role(auth.uid(), 'sales')
);

CREATE POLICY "manager admin insert payments" ON public.payments
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "sales insert payments on own invoices" ON public.payments
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'sales') AND
  EXISTS (
    SELECT 1 FROM public.invoices WHERE id = payments.invoice_id AND created_by = auth.uid()
  )
);

CREATE POLICY "manager admin delete payments" ON public.payments
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

-- quotations: admins, managers and sales can manage; sales can only update their own drafts
DROP POLICY IF EXISTS "staff read quotations" ON public.quotations;
DROP POLICY IF EXISTS "staff write quotations" ON public.quotations;

CREATE POLICY "staff read quotations" ON public.quotations
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'sales')
);

CREATE POLICY "staff insert quotations" ON public.quotations
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'sales')
);

CREATE POLICY "manager admin update all quotations" ON public.quotations
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "sales update own draft quotations" ON public.quotations
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'sales') AND
  created_by = auth.uid() AND
  status = 'draft'
)
WITH CHECK (
  public.has_role(auth.uid(), 'sales') AND
  created_by = auth.uid()
);

CREATE POLICY "manager admin delete quotations" ON public.quotations
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

-- old_gold_purchases: admins, managers and sales can read/insert; managers/admins update
DROP POLICY IF EXISTS "staff read old_gold_purchases" ON public.old_gold_purchases;
DROP POLICY IF EXISTS "staff write old_gold_purchases" ON public.old_gold_purchases;

CREATE POLICY "staff read old_gold" ON public.old_gold_purchases
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'sales')
);

CREATE POLICY "staff insert old_gold" ON public.old_gold_purchases
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'sales')
);

CREATE POLICY "manager admin update old_gold" ON public.old_gold_purchases
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "manager admin delete old_gold" ON public.old_gold_purchases
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

-- repairs: admins, managers and karigars can read; admins/managers manage; karigars update status on assigned items
DROP POLICY IF EXISTS "staff read repairs" ON public.repairs;
DROP POLICY IF EXISTS "staff write repairs" ON public.repairs;

CREATE POLICY "staff read repairs" ON public.repairs
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'karigar')
);

CREATE POLICY "manager admin write repairs" ON public.repairs
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

-- repair_items: same as repairs
DROP POLICY IF EXISTS "staff read repair_items" ON public.repair_items;
DROP POLICY IF EXISTS "staff write repair_items" ON public.repair_items;

CREATE POLICY "staff read repair_items" ON public.repair_items
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'karigar')
);

CREATE POLICY "manager admin write repair_items" ON public.repair_items
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

-- karigars: only admins and managers can manage
DROP POLICY IF EXISTS "auth read karigars" ON public.karigars;
DROP POLICY IF EXISTS "staff write karigars" ON public.karigars;

CREATE POLICY "staff read karigars" ON public.karigars
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'karigar')
);

CREATE POLICY "manager admin write karigars" ON public.karigars
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

-- metal_rates: accountants can read/insert alongside admins and managers
DROP POLICY IF EXISTS "staff read metal_rates" ON public.metal_rates;
DROP POLICY IF EXISTS "staff write metal_rates" ON public.metal_rates;

CREATE POLICY "staff read metal_rates" ON public.metal_rates
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'accountant')
);

CREATE POLICY "staff write metal_rates" ON public.metal_rates
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'accountant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'accountant')
);