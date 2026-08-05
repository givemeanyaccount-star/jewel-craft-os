CREATE OR REPLACE FUNCTION public.next_category_sku(_category_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _prefix TEXT;
  _seq INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'karigar')
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

-- Authenticated callers need UPDATE on categories for the SECURITY INVOKER function.
-- Staff roles already have broad access; tighten categories UPDATE to staff only.
DROP POLICY IF EXISTS "staff write categories" ON public.categories;
CREATE POLICY "staff update category sequences" ON public.categories
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'sales') OR
  public.has_role(auth.uid(), 'karigar')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'sales') OR
  public.has_role(auth.uid(), 'karigar')
);

-- Re-lock direct execution: only authenticated users who pass the internal role check can call it.
REVOKE EXECUTE ON FUNCTION public.next_category_sku(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_category_sku(uuid) TO authenticated, service_role;