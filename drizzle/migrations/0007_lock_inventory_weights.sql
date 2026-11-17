CREATE OR REPLACE FUNCTION public.guard_inventory_weights()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.gross_weight, NEW.stone_weight, NEW.net_weight, NEW.fine_weight, NEW.metal, NEW.purity)
     IS DISTINCT FROM (OLD.gross_weight, OLD.stone_weight, OLD.net_weight, OLD.fine_weight, OLD.metal, OLD.purity)
     AND coalesce(current_setting('app.weight_adjustment', true), '') <> 'on'
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Stock weights can only be changed through an approved weight adjustment';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_inventory_weight_guard BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_weights();

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
      'old_net', _a.old_net_weight, 'new_net', _a.new_net_weight, 'requested_by', _a.requested_by_email, 'note', _note));
END; $$;