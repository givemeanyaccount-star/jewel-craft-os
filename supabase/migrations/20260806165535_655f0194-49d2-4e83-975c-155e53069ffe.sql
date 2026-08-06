CREATE POLICY "manager admin insert invoices"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'manager'::app_role)
);