-- Restrict overly broad SELECT policies
DROP POLICY IF EXISTS "auth read customers" ON public.customers;
CREATE POLICY "staff read customers" ON public.customers FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "auth read invoices" ON public.invoices;
CREATE POLICY "staff read invoices" ON public.invoices FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "auth read oldgold" ON public.old_gold_purchases;
CREATE POLICY "staff read oldgold" ON public.old_gold_purchases FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "auth read payments" ON public.payments;
CREATE POLICY "staff read payments" ON public.payments FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "auth read quotes" ON public.quotations;
CREATE POLICY "staff read quotes" ON public.quotations FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "auth read repairs" ON public.repairs;
CREATE POLICY "staff read repairs" ON public.repairs FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar'));

DROP POLICY IF EXISTS "auth read repair_items" ON public.repair_items;
CREATE POLICY "staff read repair_items" ON public.repair_items FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar'));

DROP POLICY IF EXISTS "auth read suppliers" ON public.suppliers;
CREATE POLICY "staff read suppliers" ON public.suppliers FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
CREATE POLICY "Own or admin read profiles" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

-- Storage: role-scoped access
DROP POLICY IF EXISTS "auth read product-images" ON storage.objects;
DROP POLICY IF EXISTS "auth write product-images" ON storage.objects;
DROP POLICY IF EXISTS "auth update product-images" ON storage.objects;
DROP POLICY IF EXISTS "auth delete product-images" ON storage.objects;

CREATE POLICY "staff read product-images" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar')));
CREATE POLICY "staff write product-images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND owner = auth.uid() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar')));
CREATE POLICY "staff update product-images" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR owner = auth.uid()))
WITH CHECK (bucket_id = 'product-images' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR owner = auth.uid()));
CREATE POLICY "staff delete product-images" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR owner = auth.uid()));

DROP POLICY IF EXISTS "auth read customer-docs" ON storage.objects;
DROP POLICY IF EXISTS "auth write customer-docs" ON storage.objects;
DROP POLICY IF EXISTS "auth update customer-docs" ON storage.objects;
DROP POLICY IF EXISTS "auth delete customer-docs" ON storage.objects;

CREATE POLICY "staff read customer-docs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'customer-docs' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales')));
CREATE POLICY "staff write customer-docs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'customer-docs' AND owner = auth.uid() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales')));
CREATE POLICY "staff update customer-docs" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'customer-docs' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR owner = auth.uid()))
WITH CHECK (bucket_id = 'customer-docs' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR owner = auth.uid()));
CREATE POLICY "staff delete customer-docs" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'customer-docs' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')));

-- SECURITY DEFINER function exposure
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_category_sku(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.next_category_sku(_category_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _prefix TEXT;
  _seq INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'karigar')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.categories
     SET next_sequence = next_sequence + 1
   WHERE id = _category_id
   RETURNING sku_prefix, next_sequence - 1 INTO _prefix, _seq;
  IF _prefix IS NULL THEN
    _prefix := 'JM';
  END IF;
  RETURN _prefix || '-' || lpad(_seq::text, 5, '0');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.next_category_sku(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_category_sku(uuid) TO authenticated;