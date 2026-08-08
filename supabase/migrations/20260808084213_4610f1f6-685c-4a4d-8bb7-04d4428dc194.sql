DROP POLICY IF EXISTS "admins delete invoices" ON public.invoices;

CREATE POLICY "admins delete invoices"
ON public.invoices
FOR DELETE
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));