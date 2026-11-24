CREATE TABLE public.inventory_tag_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  copies integer NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 50),
  printed_by uuid NOT NULL DEFAULT auth.uid(),
  printed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_tag_prints_item_idx ON public.inventory_tag_prints(item_id);
GRANT SELECT, INSERT ON public.inventory_tag_prints TO authenticated;
GRANT ALL ON public.inventory_tag_prints TO service_role;
ALTER TABLE public.inventory_tag_prints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tag prints" ON public.inventory_tag_prints FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'karigar') OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'viewer'));
CREATE POLICY "staff log own tag prints" ON public.inventory_tag_prints FOR INSERT TO authenticated
WITH CHECK (printed_by = auth.uid() AND (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales')));