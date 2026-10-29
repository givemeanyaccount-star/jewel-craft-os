CREATE OR REPLACE FUNCTION public.read_fiscal_books(_year integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; BEGIN
 IF auth.uid() IS NULL OR NOT (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 PERFORM rollover_fiscal_books();
 SELECT * INTO r FROM fiscal_years WHERE bs_year=_year;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fiscal year not found'; END IF;
 RETURN jsonb_build_object('label',r.label,'closed_at',r.closed_at,'opening',r.opening_books,'books',COALESCE(r.closing_books,capture_fiscal_books(r.starts_on,least(r.ends_on,(now() AT TIME ZONE 'Asia/Kathmandu')::date)))) ;
END $$;
REVOKE ALL ON FUNCTION public.read_fiscal_books(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_fiscal_books(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_closed_fiscal_details() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent uuid; d date; old_parent uuid; BEGIN
 PERFORM rollover_fiscal_books();
 IF TG_OP<>'DELETE' THEN parent:=CASE WHEN TG_TABLE_NAME='invoice_items' THEN (to_jsonb(NEW)->>'invoice_id')::uuid ELSE (to_jsonb(NEW)->>'purchase_id')::uuid END; END IF;
 IF TG_OP<>'INSERT' THEN old_parent:=CASE WHEN TG_TABLE_NAME='invoice_items' THEN (to_jsonb(OLD)->>'invoice_id')::uuid ELSE (to_jsonb(OLD)->>'purchase_id')::uuid END; END IF;
 IF TG_TABLE_NAME='invoice_items' THEN
  IF EXISTS(SELECT 1 FROM invoices i JOIN fiscal_years f ON (i.issued_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN f.starts_on AND f.ends_on WHERE i.id IN (parent,old_parent) AND f.closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Fiscal year is closed; its bill items cannot be changed'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM purchases p JOIN fiscal_years f ON p.purchase_date BETWEEN f.starts_on AND f.ends_on WHERE p.id IN (parent,old_parent) AND f.closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Fiscal year is closed; its purchase items cannot be changed'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_fiscal_details() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fiscal_guard_invoice_items BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_details();
CREATE TRIGGER fiscal_guard_purchase_items BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_details();

CREATE OR REPLACE FUNCTION public.guard_closed_fiscal_payments() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d date; od date; BEGIN
 PERFORM rollover_fiscal_books();
 IF TG_OP<>'DELETE' THEN d:=(NEW.paid_at AT TIME ZONE 'Asia/Kathmandu')::date; END IF;
 IF TG_OP<>'INSERT' THEN od:=(OLD.paid_at AT TIME ZONE 'Asia/Kathmandu')::date; END IF;
 IF EXISTS(SELECT 1 FROM fiscal_years WHERE closed_at IS NOT NULL AND (d BETWEEN starts_on AND ends_on OR od BETWEEN starts_on AND ends_on)) THEN
  -- Allocation of a carried advance does not alter the already archived receipt.
  IF TG_OP='UPDATE' AND OLD.invoice_id IS NULL AND OLD.amount>0 AND NEW.amount>0 AND NEW.amount<=OLD.amount AND
   (to_jsonb(OLD)-'amount'-'invoice_id'-'notes'-'updated_at')=(to_jsonb(NEW)-'amount'-'invoice_id'-'notes'-'updated_at') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND NEW.invoice_id IS NOT NULL AND (NEW.reference='CUST_ADVANCE' OR NEW.order_id IS NOT NULL) AND
    EXISTS(SELECT 1 FROM invoices i JOIN fiscal_years f ON (i.issued_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN f.starts_on AND f.ends_on WHERE i.id=NEW.invoice_id AND f.closed_at IS NULL) AND
    EXISTS(SELECT 1 FROM payments p WHERE p.invoice_id IS NULL AND p.customer_id=NEW.customer_id AND p.paid_at=NEW.paid_at AND p.method=NEW.method AND p.amount>0) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Receipt date belongs to a closed fiscal year';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_fiscal_payments() FROM PUBLIC,anon,authenticated;
DROP TRIGGER fiscal_guard_payments ON public.payments;
CREATE TRIGGER fiscal_guard_payments BEFORE INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_payments();