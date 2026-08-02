CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  vat_enabled boolean NOT NULL DEFAULT true,
  vat_rate numeric NOT NULL DEFAULT 13,
  sd_tax_rate numeric NOT NULL DEFAULT 0.5,
  purities text[] NOT NULL DEFAULT ARRAY['24K','22K','20K','18K','14K','9K','999','925'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed in users can read settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert settings" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Admins and managers can update settings" ON public.app_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER app_settings_touch BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.app_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sd_tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sd_tax_rate numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS restocked boolean NOT NULL DEFAULT false;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS sd_tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sd_tax_rate numeric NOT NULL DEFAULT 0.5;