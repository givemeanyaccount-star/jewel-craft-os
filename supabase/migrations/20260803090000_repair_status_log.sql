CREATE TABLE public.repair_item_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id uuid NOT NULL REFERENCES public.repair_items(id) ON DELETE CASCADE,
  status public.repair_status NOT NULL,
  karigar_id uuid REFERENCES public.karigars(id),
  karigar_name text,
  gross_weight_out numeric(10,3),
  stone_weight_out numeric(10,3),
  net_weight_out numeric(10,3),
  note text,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_repair_status_log_item ON public.repair_item_status_log(repair_item_id);

GRANT SELECT, INSERT ON public.repair_item_status_log TO authenticated;
GRANT ALL ON public.repair_item_status_log TO service_role;
ALTER TABLE public.repair_item_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read repair status log" ON public.repair_item_status_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff insert repair status log" ON public.repair_item_status_log FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'karigar'));
