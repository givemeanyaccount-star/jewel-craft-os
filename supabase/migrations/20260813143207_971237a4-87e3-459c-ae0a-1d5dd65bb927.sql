-- 1. Audit logs: block direct inserts, funnel through a validating security definer function
DROP POLICY IF EXISTS "Users can record their own actions" ON public.audit_logs;
REVOKE INSERT ON public.audit_logs FROM authenticated;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  _action text,
  _target_user_id uuid DEFAULT NULL,
  _target_email text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
  _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF _action NOT IN (
    'user_invited','user_updated','user_removed','password_set',
    'role_granted','role_revoked','permission_changed','permissions_reset'
  ) THEN
    RAISE EXCEPTION 'invalid audit action';
  END IF;

  IF _target_email IS NOT NULL AND length(_target_email) > 320 THEN
    RAISE EXCEPTION 'target_email too long';
  END IF;

  IF _details IS NULL OR jsonb_typeof(_details) <> 'object' OR length(_details::text) > 4000 THEN
    _details := '{}'::jsonb;
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_user_id, target_email, details)
  VALUES (
    _actor,
    (SELECT email FROM auth.users WHERE id = _actor),
    _action,
    _target_user_id,
    _target_email,
    _details
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, uuid, text, jsonb) TO authenticated;

-- 2. Product image storage: owner path limited to roles allowed to upload product images
DROP POLICY IF EXISTS "staff update product-images" ON storage.objects;
CREATE POLICY "staff update product-images" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR (owner = auth.uid() AND (
      private.has_role(auth.uid(), 'sales'::app_role)
      OR private.has_role(auth.uid(), 'karigar'::app_role)
    ))
  )
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR (owner = auth.uid() AND (
      private.has_role(auth.uid(), 'sales'::app_role)
      OR private.has_role(auth.uid(), 'karigar'::app_role)
    ))
  )
);

DROP POLICY IF EXISTS "staff delete product-images" ON storage.objects;
CREATE POLICY "staff delete product-images" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR (owner = auth.uid() AND (
      private.has_role(auth.uid(), 'sales'::app_role)
      OR private.has_role(auth.uid(), 'karigar'::app_role)
    ))
  )
);