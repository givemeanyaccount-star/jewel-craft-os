CREATE TABLE public.company_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  group_name text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT 'JewelMaster',
  name_np text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  pan_no text NOT NULL DEFAULT '',
  reg_no text NOT NULL DEFAULT '',
  phone1 text NOT NULL DEFAULT '',
  phone2 text NOT NULL DEFAULT '',
  phone3 text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  facebook text NOT NULL DEFAULT '',
  logo_url text,
  qr_url text,
  terms_np text NOT NULL DEFAULT 'यस बिल बमोजिमका सामानमा, बिलको पछाडि उल्लेख गरिएका नियम र सर्तहरु लागु हुनेछ।',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_profile_singleton_chk CHECK (singleton)
);

GRANT SELECT, INSERT, UPDATE ON public.company_profile TO authenticated;
GRANT ALL ON public.company_profile TO service_role;

ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_profile_read_staff" ON public.company_profile
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager')
  OR private.has_role(auth.uid(), 'sales') OR private.has_role(auth.uid(), 'accountant')
  OR private.has_role(auth.uid(), 'karigar') OR private.has_role(auth.uid(), 'viewer')
);

CREATE POLICY "company_profile_insert_admin" ON public.company_profile
FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'));

CREATE POLICY "company_profile_update_admin" ON public.company_profile
FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'))
WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'));

CREATE TRIGGER company_profile_touch BEFORE UPDATE ON public.company_profile
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.company_profile (singleton) VALUES (true);