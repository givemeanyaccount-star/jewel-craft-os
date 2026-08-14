
-- Lock down the document numbering helper
REVOKE EXECUTE ON FUNCTION public.next_document_number(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.next_document_number(p_prefix text, p_pad integer DEFAULT 5)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year int := extract(year from now())::int;
  v_next int;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
    OR private.has_role(auth.uid(), 'karigar'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_prefix IS NULL OR p_prefix !~ '^[A-Z]{2,10}$' THEN
    RAISE EXCEPTION 'invalid prefix';
  END IF;

  IF p_pad IS NULL OR p_pad < 1 OR p_pad > 10 THEN
    p_pad := 5;
  END IF;

  INSERT INTO public.document_sequences (prefix, year, last_value)
  VALUES (p_prefix, v_year, 1)
  ON CONFLICT (prefix, year)
  DO UPDATE SET last_value = public.document_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN p_prefix || '-' || right(v_year::text, 2) || '-' || lpad(v_next::text, p_pad, '0');
END;
$function$;

-- Audit logging helper: signed-in only
REVOKE EXECUTE ON FUNCTION public.log_audit_event(text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, uuid, text, jsonb) TO authenticated, service_role;

-- Internal role helpers: signed-in only (needed by RLS policies)
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.get_user_roles(uuid) FROM PUBLIC, anon;

-- Trigger-only functions must never be callable directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_sales_status_only_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_order_item_karigar_update() FROM PUBLIC, anon, authenticated;
