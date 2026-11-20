ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS weight_tolerance_grams numeric NOT NULL DEFAULT 0.050;
ALTER TABLE public.inventory_weight_adjustments
  ADD COLUMN IF NOT EXISTS within_tolerance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tolerance_grams numeric,
  ADD COLUMN IF NOT EXISTS ai_risk_level text,
  ADD COLUMN IF NOT EXISTS ai_summary jsonb,
  ADD COLUMN IF NOT EXISTS ai_reviewed_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_weight_tolerance(_grams numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _old numeric;
BEGIN
  IF _uid IS NULL OR NOT (private.has_role(_uid,'admin'::app_role) OR private.has_role(_uid,'manager'::app_role)) THEN
    RAISE EXCEPTION 'Only managers and admins can change the tolerance'; END IF;
  IF _grams IS NULL OR _grams < 0 OR _grams > 100 THEN RAISE EXCEPTION 'Tolerance must be between 0 and 100 grams'; END IF;
  SELECT weight_tolerance_grams INTO _old FROM public.app_settings WHERE singleton LIMIT 1;
  UPDATE public.app_settings SET weight_tolerance_grams = round(_grams,3) WHERE singleton;
  INSERT INTO public.audit_logs (actor_id, actor_email, action, details)
  VALUES (_uid, (SELECT email FROM auth.users WHERE id=_uid), 'weight_tolerance_changed',
    jsonb_build_object('old_value', _old, 'new_value', round(_grams,3)));
END $$;
REVOKE EXECUTE ON FUNCTION public.set_weight_tolerance(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_weight_tolerance(numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_inventory_weight_adjustment(
  _item_id uuid, _gross numeric, _stone numeric, _fine numeric, _reason_type text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _it record; _id uuid; _email text; _net numeric; _tol numeric; _within boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.user_has_permission(_uid, 'inventory_manage') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 OR length(_reason) > 500 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF _gross IS NULL OR _gross <= 0 OR _stone IS NULL OR _stone < 0 OR _stone > _gross THEN RAISE EXCEPTION 'Invalid weights'; END IF;
  _net := round(_gross - _stone, 3);
  IF _fine IS NULL OR _fine < 0 OR _fine > _net THEN RAISE EXCEPTION 'Invalid fine weight'; END IF;
  SELECT * INTO _it FROM public.inventory_items WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item not found'; END IF;
  IF _it.status NOT IN ('in_stock','reserved') THEN RAISE EXCEPTION 'Only items in stock can be adjusted'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_weight_adjustments WHERE inventory_item_id = _item_id AND status = 'pending') THEN
    RAISE EXCEPTION 'This item already has an adjustment waiting for approval'; END IF;
  IF round(_gross,3) = round(_it.gross_weight,3) AND round(_stone,3) = round(_it.stone_weight,3) THEN
    RAISE EXCEPTION 'New weights are the same as current weights'; END IF;
  SELECT coalesce(weight_tolerance_grams, 0) INTO _tol FROM public.app_settings WHERE singleton LIMIT 1;
  _tol := coalesce(_tol, 0);
  _within := abs(_net - round(_it.net_weight,3)) <= _tol;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.inventory_weight_adjustments (inventory_item_id, sku,
    old_gross_weight, old_stone_weight, old_net_weight, old_fine_weight,
    new_gross_weight, new_stone_weight, new_net_weight, new_fine_weight,
    reason_type, reason, requested_by, requested_by_email, within_tolerance, auto_applied, tolerance_grams,
    status, reviewed_at, review_note)
  VALUES (_item_id, _it.sku, _it.gross_weight, _it.stone_weight, _it.net_weight, _it.fine_weight,
    round(_gross,3), round(_stone,3), _net, round(_fine,3), coalesce(nullif(trim(_reason_type),''),'other'), trim(_reason), _uid, _email,
    _within, _within, _tol,
    CASE WHEN _within THEN 'approved' ELSE 'pending' END,
    CASE WHEN _within THEN now() END,
    CASE WHEN _within THEN 'Applied automatically: within tolerance' END)
  RETURNING id INTO _id;
  IF _within THEN
    PERFORM set_config('app.weight_adjustment', 'on', true);
    UPDATE public.inventory_items SET gross_weight = round(_gross,3), stone_weight = round(_stone,3),
      net_weight = _net, fine_weight = round(_fine,3) WHERE id = _item_id;
    PERFORM set_config('app.weight_adjustment', 'off', true);
  END IF;
  INSERT INTO public.audit_logs (actor_id, actor_email, action, details)
  VALUES (_uid, _email, CASE WHEN _within THEN 'inventory_weight_adjustment_auto_applied' ELSE 'inventory_weight_adjustment_flagged' END,
    jsonb_build_object('adjustment_id', _id, 'sku', _it.sku, 'old_gross', _it.gross_weight, 'new_gross', round(_gross,3),
      'old_net', _it.net_weight, 'new_net', _net, 'tolerance_grams', _tol, 'reason', trim(_reason)));
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
  IF (_note IS NULL OR length(trim(_note)) < 3) AND (NOT _approve OR NOT _a.within_tolerance) THEN
    RAISE EXCEPTION 'A note is required for this decision'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  IF _approve THEN
    SELECT * INTO _it FROM public.inventory_items WHERE id = _a.inventory_item_id FOR UPDATE;
    IF _it.status NOT IN ('in_stock','reserved') THEN RAISE EXCEPTION 'Item is no longer in stock'; END IF;
    IF round(_it.gross_weight,3) <> round(_a.old_gross_weight,3) OR round(_it.stone_weight,3) <> round(_a.old_stone_weight,3) THEN
      RAISE EXCEPTION 'Item weights changed since this request; reject it and request again'; END IF;
    PERFORM set_config('app.weight_adjustment', 'on', true);
    UPDATE public.inventory_items SET gross_weight = _a.new_gross_weight, stone_weight = _a.new_stone_weight,
      net_weight = _a.new_net_weight, fine_weight = _a.new_fine_weight WHERE id = _a.inventory_item_id;
    PERFORM set_config('app.weight_adjustment', 'off', true);
  END IF;
  UPDATE public.inventory_weight_adjustments SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = _uid, reviewed_by_email = _email, reviewed_at = now(), review_note = nullif(trim(coalesce(_note,'')),'')
  WHERE id = _id;
  INSERT INTO public.audit_logs (actor_id, actor_email, action, details)
  VALUES (_uid, _email, CASE WHEN _approve THEN 'inventory_weight_adjustment_approved' ELSE 'inventory_weight_adjustment_rejected' END,
    jsonb_build_object('adjustment_id', _id, 'sku', _a.sku, 'old_gross', _a.old_gross_weight, 'new_gross', _a.new_gross_weight,
      'old_net', _a.old_net_weight, 'new_net', _a.new_net_weight, 'requested_by', _a.requested_by_email, 'note', _note,
      'ai_risk_level', _a.ai_risk_level, 'ai_summary', _a.ai_summary->>'summary'));
END; $$;

ALTER FUNCTION public.capture_fiscal_books(date, date) RENAME TO capture_fiscal_books_core;
CREATE OR REPLACE FUNCTION public.capture_fiscal_books(_start date, _end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN capture_fiscal_books_core(_start, _end) || jsonb_build_object(
    'weight_adjustments', COALESCE((SELECT jsonb_agg(jsonb_build_object('sku',a.sku,'item',i.name,'metal',i.metal,'purity',i.purity,
        'reviewed_at',a.reviewed_at,'auto_applied',a.auto_applied,'reason',a.reason,
        'gross_change',a.new_gross_weight-a.old_gross_weight,'net_change',a.new_net_weight-a.old_net_weight,
        'fine_change',a.new_fine_weight-a.old_fine_weight,'requested_by',a.requested_by_email,'approved_by',a.reviewed_by_email) ORDER BY a.reviewed_at)
      FROM inventory_weight_adjustments a JOIN inventory_items i ON i.id=a.inventory_item_id
      WHERE a.status='approved' AND (a.reviewed_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end),'[]'::jsonb),
    'weight_adjustment_totals', COALESCE((SELECT jsonb_agg(t) FROM (SELECT i.metal, i.purity, count(*) AS adjustments,
        sum(a.new_gross_weight-a.old_gross_weight) AS gross_change, sum(a.new_net_weight-a.old_net_weight) AS net_change,
        sum(a.new_fine_weight-a.old_fine_weight) AS fine_change
      FROM inventory_weight_adjustments a JOIN inventory_items i ON i.id=a.inventory_item_id
      WHERE a.status='approved' AND (a.reviewed_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end
      GROUP BY i.metal, i.purity) t),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.capture_fiscal_books(date,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.capture_fiscal_books_core(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_fiscal_books(date,date) TO service_role;