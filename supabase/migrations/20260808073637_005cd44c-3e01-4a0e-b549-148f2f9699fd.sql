DROP POLICY IF EXISTS "staff write customers" ON public.customers;

CREATE POLICY "staff insert customers" ON public.customers
FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role) OR private.has_role(auth.uid(),'sales'::app_role));

CREATE POLICY "staff update customers" ON public.customers
FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role) OR private.has_role(auth.uid(),'sales'::app_role))
WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role) OR private.has_role(auth.uid(),'sales'::app_role));

CREATE POLICY "admins delete customers" ON public.customers
FOR DELETE TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));