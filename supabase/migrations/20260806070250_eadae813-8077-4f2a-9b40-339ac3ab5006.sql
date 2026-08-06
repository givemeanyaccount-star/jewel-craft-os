DROP POLICY IF EXISTS "auth read repair status log" ON public.repair_item_status_log;
CREATE POLICY "staff read repair status log" ON public.repair_item_status_log
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager')
  OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'karigar')
);