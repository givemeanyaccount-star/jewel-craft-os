CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.get_user_roles(uuid) SET SCHEMA private;

ALTER FUNCTION private.has_role(uuid, public.app_role) SET search_path = public;
ALTER FUNCTION private.get_user_roles(uuid) SET search_path = public;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.get_user_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_user_roles(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.next_category_sku(_category_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _prefix TEXT;
  _seq INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager')
    OR private.has_role(auth.uid(), 'sales') OR private.has_role(auth.uid(), 'karigar')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.categories
     SET next_sequence = next_sequence + 1
   WHERE id = _category_id
   RETURNING sku_prefix, next_sequence - 1 INTO _prefix, _seq;
  IF _prefix IS NULL THEN
    _prefix := 'JM';
  END IF;
  RETURN _prefix || '-' || lpad(_seq::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;