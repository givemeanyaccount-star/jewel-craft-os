DROP POLICY IF EXISTS "auth read karigar_accruals" ON public.karigar_accruals;
CREATE POLICY "finance read karigar_accruals" ON public.karigar_accruals FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "auth read karigar_payments" ON public.karigar_payments;
CREATE POLICY "finance read karigar_payments" ON public.karigar_payments FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant'));