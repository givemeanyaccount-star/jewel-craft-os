-- Read access for viewer
DROP POLICY IF EXISTS "staff read inventory" ON public.inventory_items;
CREATE POLICY "staff read inventory" ON public.inventory_items FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'karigar') OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'viewer'));

DROP POLICY IF EXISTS "staff read invoices" ON public.invoices;
CREATE POLICY "staff read invoices" ON public.invoices FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'viewer'));

CREATE POLICY "viewer read invoice items" ON public.invoice_items FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'viewer'));

DROP POLICY IF EXISTS "staff read metal_rates" ON public.metal_rates;
CREATE POLICY "staff read metal_rates" ON public.metal_rates FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'viewer'));

-- Seed viewer permissions
INSERT INTO public.role_permissions (role, permission, allowed)
VALUES ('viewer','view_dashboard',true),('viewer','inventory_view',true),('viewer','invoice_view',true)
ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed;

-- Signup handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
  meta_roles TEXT[];
  r TEXT;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'username', '')
  );

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    RETURN NEW;
  END IF;

  IF NEW.raw_user_meta_data ? 'invited_roles' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'invited_roles')) INTO meta_roles;
  END IF;

  IF meta_roles IS NOT NULL AND array_length(meta_roles, 1) > 0 THEN
    FOREACH r IN ARRAY meta_roles LOOP
      BEGIN
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, r::public.app_role)
        ON CONFLICT (user_id, role) DO NOTHING;
      EXCEPTION WHEN others THEN NULL;
      END;
    END LOOP;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;