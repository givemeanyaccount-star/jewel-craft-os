CREATE OR REPLACE FUNCTION public.guard_invoice_order_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.order_date IS DISTINCT FROM OLD.order_date
     AND coalesce(current_setting('app.order_date_correction', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Order date cannot be changed after the sale is posted';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_invoice_order_date_guard BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_order_date();

CREATE OR REPLACE FUNCTION public.correct_invoice_order_date(_invoice_id uuid, _new_date date, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv record; _uid uuid := auth.uid(); _ok boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _ok := private.has_role(_uid, 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.role_permissions rp JOIN public.user_roles ur ON ur.role = rp.role
    WHERE ur.user_id = _uid AND rp.permission = 'invoice_order_date_correct' AND rp.allowed);
  IF NOT _ok THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 OR length(_reason) > 500 THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  SELECT id, invoice_number, order_date, issued_at INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF _new_date IS NOT NULL AND _new_date > (_inv.issued_at AT TIME ZONE 'Asia/Kathmandu')::date THEN
    RAISE EXCEPTION 'Order date cannot be after the sale date';
  END IF;
  IF _new_date IS NOT DISTINCT FROM _inv.order_date THEN RETURN; END IF;
  PERFORM set_config('app.order_date_correction', 'on', true);
  UPDATE public.invoices SET order_date = _new_date WHERE id = _invoice_id;
  PERFORM set_config('app.order_date_correction', 'off', true);
  INSERT INTO public.audit_logs (actor_id, actor_email, action, details)
  VALUES (_uid, (SELECT email FROM auth.users WHERE id = _uid), 'order_date_corrected',
    jsonb_build_object('invoice_id', _invoice_id, 'invoice_number', _inv.invoice_number,
      'old_value', _inv.order_date, 'new_value', _new_date, 'reason', trim(_reason)));
END; $$;

REVOKE ALL ON FUNCTION public.correct_invoice_order_date(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_invoice_order_date(uuid, date, text) TO authenticated;