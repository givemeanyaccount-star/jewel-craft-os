CREATE TABLE public.inventory_weight_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  sku text NOT NULL,
  old_gross_weight numeric NOT NULL, old_stone_weight numeric NOT NULL,
  old_net_weight numeric NOT NULL, old_fine_weight numeric NOT NULL,
  new_gross_weight numeric NOT NULL, new_stone_weight numeric NOT NULL,
  new_net_weight numeric NOT NULL, new_fine_weight numeric NOT NULL,
  reason_type text NOT NULL DEFAULT 'other',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by uuid, requested_by_email text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid, reviewed_by_email text, reviewed_at timestamptz, review_note text
);
CREATE INDEX ON public.inventory_weight_adjustments (status, requested_at DESC);
CREATE INDEX ON public.inventory_weight_adjustments (inventory_item_id);
GRANT SELECT ON public.inventory_weight_adjustments TO authenticated;
GRANT ALL ON public.inventory_weight_adjustments TO service_role;
ALTER TABLE public.inventory_weight_adjustments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_has_permission(_uid uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(_uid, 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.role_permissions rp JOIN public.user_roles ur ON ur.role = rp.role
    WHERE ur.user_id = _uid AND rp.permission = _perm AND rp.allowed)
$$;
REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated;

CREATE POLICY "Inventory viewers read adjustments" ON public.inventory_weight_adjustments
FOR SELECT TO authenticated USING (public.user_has_permission(auth.uid(), 'inventory_view'));

INSERT INTO public.role_permissions (role, permission, allowed) VALUES
  ('admin','inventory_adjust_approve',true), ('manager','inventory_adjust_approve',true)
ON CONFLICT (role, permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.request_inventory_weight_adjustment(
  _item_id uuid, _gross numeric, _stone numeric, _fine numeric, _reason_type text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _it record; _id uuid; _email text; _net numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.user_has_permission(_uid, 'inventory_manage') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 OR length(_reason) > 500 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF _gross IS NULL OR _gross <= 0 OR _stone IS NULL OR _stone < 0 OR _stone > _gross THEN RAISE EXCEPTION 'Invalid weights'; END IF;
  _net := round(_gross - _stone, 3);
  IF _fine IS NULL OR _fine < 0 OR _fine > _net THEN RAISE EXCEPTION 'Invalid fine weight'; END IF;
  SELECT * INTO _it FROM public.inventory_items WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item not found'; END IF;
  IF _it.status NOT IN ('in_stock','reserved') THEN RAISE EXCEPTION 'Only items in stock can be adjusted'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_weight_adjustments WHERE inventory_item_id = _item_id AND status = 'pending') THEN
    RAISE EXCEPTION 'This item already has an adjustment waiting for approval'; END IF;
  IF round(_gross,3) = round(_it.gross_weight,3) AND round(_stone,3) = round(_it.stone_weight,3) THEN
    RAISE EXCEPTION 'New weights are the same as current weights'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.inventory_weight_adjustments (inventory_item_id, sku,
    old_gross_weight, old_stone_weight, old_net_weight, old_fine_weight,
    new_gross_weight, new_stone_weight, new_net_weight, new_fine_weight,
    reason_type, reason, requested_by, requested_by_email)
  VALUES (_item_id, _it.sku, _it.gross_weight, _it.stone_weight, _it.net_weight, _it.fine_weight,
    round(_gross,3), round(_stone,3), _net, round(_fine,3), coalesce(nullif(trim(_reason_type),''),'other'), trim(_reason), _uid, _email)
  RETURNING id INTO _id;
  INSERT INTO public.audit_logs (actor_id, actor_email, action, details)
  VALUES (_uid, _email, 'inventory_weight_adjustment_requested', jsonb_build_object('adjustment_id', _id, 'sku', _it.sku,
    'old_gross', _it.gross_weight, 'new_gross', round(_gross,3), 'old_net', _it.net_weight, 'new_net', _net, 'reason', trim(_reason)));
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.review_inventory_weight_adjustment(_id uuid, _approve boolean, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _a record; _it record; _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.user_has_permission(_uid, 'inventory_adjust_approve') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _a FROM public.inventory_weight_adjustments WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'adjustment not found'; END IF;
  IF _a.status <> 'pending' THEN RAISE EXCEPTION 'This adjustment was already reviewed'; END IF;
  IF _a.requested_by = _uid AND NOT private.has_role(_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'You cannot approve or reject your own request'; END IF;
  IF NOT _approve AND (_note IS NULL OR length(trim(_note)) < 3) THEN RAISE EXCEPTION 'A rejection note is required'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  IF _approve THEN
    SELECT * INTO _it FROM public.inventory_items WHERE id = _a.inventory_item_id FOR UPDATE;
    IF _it.status NOT IN ('in_stock','reserved') THEN RAISE EXCEPTION 'Item is no longer in stock'; END IF;
    IF round(_it.gross_weight,3) <> round(_a.old_gross_weight,3) OR round(_it.stone_weight,3) <> round(_a.old_stone_weight,3) THEN
      RAISE EXCEPTION 'Item weights changed since this request; reject it and request again'; END IF;
    UPDATE public.inventory_items SET gross_weight = _a.new_gross_weight, stone_weight = _a.new_stone_weight,
      net_weight = _a.new_net_weight, fine_weight = _a.new_fine_weight WHERE id = _a.inventory_item_id;
  END IF;
  UPDATE public.inventory_weight_adjustments SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = _uid, reviewed_by_email = _email, reviewed_at = now(), review_note = nullif(trim(coalesce(_note,'')),'')
  WHERE id = _id;
  INSERT INTO public.audit_logs (actor_id, actor_email, action, details)
  VALUES (_uid, _email, CASE WHEN _approve THEN 'inventory_weight_adjustment_approved' ELSE 'inventory_weight_adjustment_rejected' END,
    jsonb_build_object('adjustment_id', _id, 'sku', _a.sku, 'old_gross', _a.old_gross_weight, 'new_gross', _a.new_gross_weight,
      'old_net', _a.old_net_weight, 'new_net', _a.new_net_weight, 'requested_by', _a.requested_by_email, 'note', _note));
END; $$;
REVOKE EXECUTE ON FUNCTION public.request_inventory_weight_adjustment(uuid,numeric,numeric,numeric,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_inventory_weight_adjustment(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_inventory_weight_adjustment(uuid,numeric,numeric,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_inventory_weight_adjustment(uuid,boolean,text) TO authenticated;