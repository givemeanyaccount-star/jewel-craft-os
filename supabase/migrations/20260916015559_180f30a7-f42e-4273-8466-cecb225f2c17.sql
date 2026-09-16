CREATE TABLE public.pos_held_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  source_kind text NOT NULL DEFAULT 'none',
  source_id uuid,
  customer_name text,
  item_count integer NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_held_bills TO authenticated;
GRANT ALL ON public.pos_held_bills TO service_role;

ALTER TABLE public.pos_held_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Counter staff can view parked bills"
ON public.pos_held_bills FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin'::app_role)
  OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'sales'::app_role)
);

CREATE POLICY "Counter staff can park bills"
ON public.pos_held_bills FOR INSERT TO authenticated
WITH CHECK (
  owner_id = auth.uid() AND (
    private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'manager'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role)
  )
);

CREATE POLICY "Owner or management can update parked bills"
ON public.pos_held_bills FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid()
  OR private.has_role(auth.uid(),'admin'::app_role)
  OR private.has_role(auth.uid(),'manager'::app_role)
)
WITH CHECK (
  owner_id = auth.uid()
  OR private.has_role(auth.uid(),'admin'::app_role)
  OR private.has_role(auth.uid(),'manager'::app_role)
);

CREATE POLICY "Owner or management can delete parked bills"
ON public.pos_held_bills FOR DELETE TO authenticated
USING (
  owner_id = auth.uid()
  OR private.has_role(auth.uid(),'admin'::app_role)
  OR private.has_role(auth.uid(),'manager'::app_role)
);

CREATE INDEX idx_pos_held_bills_updated ON public.pos_held_bills (updated_at DESC);

CREATE TRIGGER pos_held_bills_touch
BEFORE UPDATE ON public.pos_held_bills
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();