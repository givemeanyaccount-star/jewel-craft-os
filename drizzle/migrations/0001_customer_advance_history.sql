CREATE TABLE public.customer_advance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  payment_id uuid,
  event text NOT NULL CHECK (event IN ('created','applied','adjusted','reversed')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  old_amount numeric(14,2),
  new_amount numeric(14,2),
  method text,
  paid_at timestamptz,
  invoice_id uuid,
  invoice_number text,
  reason text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_advance_events_customer_idx ON public.customer_advance_events (customer_id, created_at DESC);
GRANT SELECT ON public.customer_advance_events TO authenticated;
GRANT ALL ON public.customer_advance_events TO service_role;
ALTER TABLE public.customer_advance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read advance history" ON public.customer_advance_events FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)
  OR private.has_role(auth.uid(),'accountant'::app_role) OR private.has_role(auth.uid(),'sales'::app_role));

CREATE OR REPLACE FUNCTION private.can_handle_advances(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (private.has_role(_uid,'admin'::app_role) OR private.has_role(_uid,'manager'::app_role)
    OR private.has_role(_uid,'sales'::app_role))
$$;

CREATE OR REPLACE FUNCTION private.log_advance(_customer uuid, _payment uuid, _event text, _amount numeric,
  _old numeric, _new numeric, _method text, _paid_at timestamptz, _invoice uuid, _reason text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.customer_advance_events (customer_id, payment_id, event, amount, old_amount, new_amount,
    method, paid_at, invoice_id, invoice_number, reason, actor_id, actor_email)
  VALUES (_customer, _payment, _event, coalesce(_amount,0), _old, _new, _method, _paid_at, _invoice,
    (SELECT invoice_number FROM public.invoices WHERE id = _invoice), _reason, auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()))
$$;

-- Record a new customer advance (saved balance, not tied to an order or bill).
CREATE OR REPLACE FUNCTION public.record_customer_advance(_customer_id uuid, _amount numeric, _method payment_method,
  _paid_on date, _reference text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _at timestamptz;
BEGIN
  IF NOT private.can_handle_advances(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Enter an amount'; END IF;
  IF _method = 'old_gold' THEN RAISE EXCEPTION 'Old metal cannot be saved as a customer advance'; END IF;
  IF _paid_on IS NULL OR _paid_on > (now() AT TIME ZONE 'Asia/Kathmandu')::date THEN RAISE EXCEPTION 'Paid date cannot be in the future'; END IF;
  _at := (_paid_on::text || ' 12:00:00+05:45')::timestamptz;
  INSERT INTO public.payments (customer_id, amount, method, reference, paid_at, notes, created_by)
  VALUES (_customer_id, round(_amount,2), _method, 'CUST_ADVANCE', _at,
    'Customer advance paid on ' || _paid_on || coalesce(' · ' || nullif(trim(_reference),''), ''), auth.uid())
  RETURNING id INTO _id;
  PERFORM private.log_advance(_customer_id, _id, 'created', round(_amount,2), NULL, round(_amount,2), _method::text, _at, NULL, nullif(trim(_reference),''));
  RETURN _id;
END $$;

-- Change the amount of an unused customer advance.
CREATE OR REPLACE FUNCTION public.adjust_customer_advance(_payment_id uuid, _new_amount numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NOT (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF _new_amount IS NULL OR _new_amount <= 0 THEN RAISE EXCEPTION 'Enter an amount above zero (use Reverse to remove it)'; END IF;
  SELECT * INTO p FROM public.payments WHERE id = _payment_id AND reference = 'CUST_ADVANCE' AND invoice_id IS NULL AND order_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only unused saved advances can be adjusted'; END IF;
  UPDATE public.payments SET amount = round(_new_amount,2) WHERE id = _payment_id;
  PERFORM private.log_advance(p.customer_id, p.id, 'adjusted', round(_new_amount - p.amount,2), p.amount, round(_new_amount,2), p.method::text, p.paid_at, NULL, trim(_reason));
END $$;

-- Reverse (cancel) an unused customer advance, e.g. money returned or entered by mistake.
CREATE OR REPLACE FUNCTION public.reverse_customer_advance(_payment_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NOT (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role)) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO p FROM public.payments WHERE id = _payment_id AND reference = 'CUST_ADVANCE' AND invoice_id IS NULL AND order_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only unused saved advances can be reversed'; END IF;
  DELETE FROM public.payments WHERE id = _payment_id;
  PERFORM private.log_advance(p.customer_id, p.id, 'reversed', -p.amount, p.amount, 0, p.method::text, p.paid_at, NULL, trim(_reason));
END $$;

-- Use advances on a posted bill, oldest first. Order advances when _order_id is given,
-- otherwise the customer's saved balance. Splits a row when only part is used.
CREATE OR REPLACE FUNCTION public.apply_advances_to_invoice(_invoice_id uuid, _amount numeric,
  _order_id uuid DEFAULT NULL, _old_metal boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; p record; remaining numeric := round(coalesce(_amount,0),2); note text; newid uuid;
BEGIN
  IF NOT private.can_handle_advances(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT id, invoice_number, customer_id INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  note := CASE WHEN _old_metal THEN 'Old metal advance credited on invoice ' ELSE 'Advance applied to invoice ' END || inv.invoice_number;
  FOR p IN
    SELECT * FROM public.payments
    WHERE invoice_id IS NULL AND amount > 0
      AND CASE WHEN _order_id IS NOT NULL
        THEN order_id = _order_id AND ((method = 'old_gold') = _old_metal)
        ELSE order_id IS NULL AND customer_id = inv.customer_id AND reference = 'CUST_ADVANCE' END
    ORDER BY paid_at FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0.004;
    IF p.amount <= remaining + 0.004 THEN
      UPDATE public.payments SET invoice_id = _invoice_id, notes = note WHERE id = p.id;
      IF _order_id IS NULL THEN
        PERFORM private.log_advance(p.customer_id, p.id, 'applied', -p.amount, p.amount, 0, p.method::text, p.paid_at, _invoice_id, NULL);
      END IF;
      remaining := round(remaining - p.amount, 2);
    ELSE
      UPDATE public.payments SET amount = round(p.amount - remaining, 2) WHERE id = p.id;
      INSERT INTO public.payments (order_id, invoice_id, customer_id, amount, method, reference, paid_at, notes, created_by)
      VALUES (p.order_id, _invoice_id, p.customer_id, remaining, p.method, p.reference, p.paid_at, note, auth.uid())
      RETURNING id INTO newid;
      IF _order_id IS NULL THEN
        PERFORM private.log_advance(p.customer_id, p.id, 'applied', -remaining, p.amount, round(p.amount - remaining,2), p.method::text, p.paid_at, _invoice_id, NULL);
      END IF;
      remaining := 0;
    END IF;
  END LOOP;
  RETURN round(coalesce(_amount,0) - remaining, 2);
END $$;

REVOKE EXECUTE ON FUNCTION public.record_customer_advance(uuid, numeric, payment_method, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_customer_advance(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_customer_advance(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_advances_to_invoice(uuid, numeric, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_advance(uuid, numeric, payment_method, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_customer_advance(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_customer_advance(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_advances_to_invoice(uuid, numeric, uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.log_advance(uuid, uuid, text, numeric, numeric, numeric, text, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated;