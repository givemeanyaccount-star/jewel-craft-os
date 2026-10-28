ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_imported boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS legacy_number text;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS legacy_code text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS go_live_date date;
CREATE INDEX IF NOT EXISTS inventory_items_legacy_code_idx ON public.inventory_items (legacy_code);

-- Imported (past) bills are history: no edits or cancellation.
CREATE OR REPLACE FUNCTION public.guard_imported_invoice() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_imported AND coalesce(current_setting('app.import_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Imported past bills are locked and cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_imported_invoice_guard BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_imported_invoice();

-- Record one past bill from the old software.
CREATE OR REPLACE FUNCTION public.import_past_invoice(_bill jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _go date; _date date; _num text; _cust uuid; _inv uuid;
  _phone text; _name text; _total numeric; _paid numeric; _it jsonb; _sum numeric := 0;
BEGIN
  IF NOT (private.has_role(_uid,'admin'::app_role) OR private.has_role(_uid,'manager'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  _num := nullif(trim(_bill->>'legacy_number'),'');
  _date := (_bill->>'bill_date')::date;
  IF _num IS NULL THEN RAISE EXCEPTION 'Old bill number is required'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Bill date is required (%)', _num; END IF;
  SELECT go_live_date INTO _go FROM public.app_settings LIMIT 1;
  IF _go IS NOT NULL AND _date >= _go THEN
    RAISE EXCEPTION 'Bill % is dated % — past bills must be before the go-live date %', _num, _date, _go;
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = _num) THEN
    RAISE EXCEPTION 'Bill % has already been imported', _num;
  END IF;
  IF jsonb_typeof(_bill->'items') <> 'array' OR jsonb_array_length(_bill->'items') = 0 THEN
    RAISE EXCEPTION 'Bill % has no items', _num;
  END IF;

  _phone := nullif(trim(_bill->>'customer_phone'),'');
  _name := coalesce(nullif(trim(_bill->>'customer_name'),''), 'Walk-in customer');
  IF _phone IS NOT NULL THEN SELECT id INTO _cust FROM public.customers WHERE phone = _phone LIMIT 1; END IF;
  IF _cust IS NULL THEN SELECT id INTO _cust FROM public.customers WHERE lower(full_name) = lower(_name) AND phone IS NOT DISTINCT FROM _phone LIMIT 1; END IF;
  IF _cust IS NULL THEN
    INSERT INTO public.customers (full_name, phone, created_by) VALUES (_name, _phone, _uid) RETURNING id INTO _cust;
  END IF;

  FOR _it IN SELECT * FROM jsonb_array_elements(_bill->'items') LOOP
    _sum := _sum + coalesce((_it->>'line_total')::numeric, 0);
  END LOOP;
  _total := round(coalesce((_bill->>'total')::numeric, _sum - coalesce((_bill->>'discount')::numeric,0) + coalesce((_bill->>'tax')::numeric,0)), 2);
  _paid := round(least(coalesce((_bill->>'amount_paid')::numeric, _total), _total), 2);

  INSERT INTO public.invoices (invoice_number, legacy_number, is_imported, customer_id, status, subtotal, stones_total,
    vat_rate, vat_amount, sd_tax_rate, sd_tax, luxury_tax_rate, luxury_tax, discount, round_off, old_gold_credit,
    total, amount_paid, balance_due, notes, issued_at, created_by, rate_basis, restocked)
  VALUES (_num, _num, true, _cust,
    (CASE WHEN _paid >= _total THEN 'paid' WHEN _paid > 0 THEN 'partial' ELSE 'issued' END)::invoice_status,
    round(_sum,2), round(coalesce((_bill->>'stones_total')::numeric,0),2), 0, 0, 0,
    round(coalesce((_bill->>'tax')::numeric,0),2), 0, 0, round(coalesce((_bill->>'discount')::numeric,0),2), 0, 0,
    _total, _paid, round(_total - _paid,2), coalesce(nullif(_bill->>'notes',''), 'Imported from previous software'),
    (_date::text || ' 12:00:00+05:45')::timestamptz, _uid, 'current', false)
  RETURNING id INTO _inv;

  INSERT INTO public.invoice_items (invoice_id, description, metal, purity, weight, gross_weight, stone_weight, rate,
    making_charge, wastage_amount, stone_value, quantity, line_total)
  SELECT _inv, coalesce(nullif(i->>'description',''),'Item'),
    nullif(i->>'metal','')::metal_type, nullif(i->>'purity',''),
    nullif(i->>'weight','')::numeric, nullif(i->>'gross_weight','')::numeric, coalesce(nullif(i->>'stone_weight','')::numeric,0),
    nullif(i->>'rate','')::numeric, coalesce(nullif(i->>'making_charge','')::numeric,0),
    coalesce(nullif(i->>'wastage_amount','')::numeric,0), coalesce(nullif(i->>'stone_value','')::numeric,0),
    greatest(1, coalesce(nullif(i->>'quantity','')::int,1)), round(coalesce(nullif(i->>'line_total','')::numeric,0),2)
  FROM jsonb_array_elements(_bill->'items') i;

  IF _paid > 0 THEN
    INSERT INTO public.payments (invoice_id, customer_id, amount, method, reference, paid_at, notes, created_by)
    VALUES (_inv, _cust, _paid, coalesce(nullif(_bill->>'payment_method','')::payment_method, 'cash'),
      'IMPORTED', (_date::text || ' 12:00:00+05:45')::timestamptz, 'Imported payment', _uid);
  END IF;
  IF _total - _paid > 0.004 THEN
    UPDATE public.customers SET balance = balance + round(_total - _paid,2) WHERE id = _cust;
  END IF;
  RETURN _inv;
END $$;
REVOKE EXECUTE ON FUNCTION public.import_past_invoice(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_past_invoice(jsonb) TO authenticated;

-- Wipe all shop data for a fresh setup. Keeps users, roles, permissions, metal rates and the audit log.
CREATE OR REPLACE FUNCTION public.reset_shop_data(_actor uuid, _actor_email text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _counts jsonb;
BEGIN
  SELECT jsonb_build_object(
    'customers', (SELECT count(*) FROM customers), 'items', (SELECT count(*) FROM inventory_items),
    'invoices', (SELECT count(*) FROM invoices), 'quotations', (SELECT count(*) FROM quotations),
    'orders', (SELECT count(*) FROM orders), 'repairs', (SELECT count(*) FROM repairs),
    'payments', (SELECT count(*) FROM payments), 'purchases', (SELECT count(*) FROM purchases),
    'old_metal', (SELECT count(*) FROM old_gold_purchases), 'karigars', (SELECT count(*) FROM karigars)
  ) INTO _counts;
  TRUNCATE public.customer_advance_events, public.sales_return_items, public.sales_returns,
    public.invoice_items, public.payments, public.order_item_receipts, public.order_item_status_log,
    public.order_items, public.invoices, public.orders, public.quotation_items, public.quotations,
    public.repair_item_status_log, public.repair_items, public.repairs, public.old_gold_purchases,
    public.karigar_accruals, public.karigar_payments, public.karigars, public.purchase_items, public.purchases,
    public.suppliers, public.inventory_items, public.customers, public.categories, public.locations,
    public.pos_held_bills, public.document_sequences, public.app_settings, public.company_profile
    RESTART IDENTITY CASCADE;
  INSERT INTO public.app_settings DEFAULT VALUES;
  INSERT INTO public.company_profile DEFAULT VALUES;
  INSERT INTO public.audit_logs (actor_id, actor_email, action, details)
  VALUES (_actor, _actor_email, 'shop_reset', jsonb_build_object('removed', _counts));
  RETURN _counts;
END $$;
REVOKE EXECUTE ON FUNCTION public.reset_shop_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_shop_data(uuid, text) TO service_role;