CREATE TABLE public.karigar_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  karigar_id uuid NOT NULL REFERENCES public.karigars(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT current_date,
  method text,
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_karigar_payments_karigar ON public.karigar_payments(karigar_id);

GRANT SELECT, INSERT, DELETE ON public.karigar_payments TO authenticated;
GRANT ALL ON public.karigar_payments TO service_role;
ALTER TABLE public.karigar_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read karigar_payments" ON public.karigar_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write karigar_payments" ON public.karigar_payments FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role));
CREATE POLICY "manager delete karigar_payments" ON public.karigar_payments FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));