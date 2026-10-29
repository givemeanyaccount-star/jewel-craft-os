CREATE OR REPLACE FUNCTION public.next_document_number(p_prefix text,p_pad integer DEFAULT 5) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_year integer:=extract(year from now())::integer; v_next integer; BEGIN
 IF auth.uid() IS NULL OR NOT (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'karigar')) THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF p_prefix IS NULL OR p_prefix !~ '^[A-Z]{2,10}$' THEN RAISE EXCEPTION 'invalid prefix'; END IF;
 IF p_pad IS NULL OR p_pad<1 OR p_pad>10 THEN p_pad:=5; END IF;
 IF p_prefix='INV' THEN RETURN next_fiscal_sale_number((now() AT TIME ZONE 'Asia/Kathmandu')::date,p_pad); END IF;
 INSERT INTO document_sequences(prefix,year,last_value) VALUES(p_prefix,v_year,1) ON CONFLICT(prefix,year) DO UPDATE SET last_value=document_sequences.last_value+1 RETURNING last_value INTO v_next;
 RETURN p_prefix||'-'||right(v_year::text,2)||'-'||lpad(v_next::text,p_pad,'0');
END $$;
REVOKE ALL ON FUNCTION public.next_document_number(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_closed_fiscal_other_books() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d date; od date; v jsonb; ov jsonb; BEGIN
 PERFORM rollover_fiscal_books();
 IF TG_OP<>'DELETE' THEN v:=to_jsonb(NEW); END IF;
 IF TG_OP<>'INSERT' THEN ov:=to_jsonb(OLD); END IF;
 IF TG_TABLE_NAME='sales_returns' THEN
  d:=((v->>'processed_at')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date; od:=((ov->>'processed_at')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date;
 ELSIF TG_TABLE_NAME='sales_return_items' THEN
  SELECT (processed_at AT TIME ZONE 'Asia/Kathmandu')::date INTO d FROM sales_returns WHERE id=(v->>'return_id')::uuid;
  SELECT (processed_at AT TIME ZONE 'Asia/Kathmandu')::date INTO od FROM sales_returns WHERE id=(ov->>'return_id')::uuid;
 ELSE
  d:=((v->>'accrued_at')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date; od:=((ov->>'accrued_at')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date;
 END IF;
 IF EXISTS(SELECT 1 FROM fiscal_years WHERE closed_at IS NOT NULL AND (d BETWEEN starts_on AND ends_on OR od BETWEEN starts_on AND ends_on)) THEN RAISE EXCEPTION 'Fiscal year is closed; record changes in the current year'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_fiscal_other_books() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fiscal_guard_returns BEFORE INSERT OR UPDATE OR DELETE ON public.sales_returns FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_other_books();
CREATE TRIGGER fiscal_guard_return_items BEFORE INSERT OR UPDATE OR DELETE ON public.sales_return_items FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_other_books();
CREATE TRIGGER fiscal_guard_accruals BEFORE INSERT OR UPDATE OR DELETE ON public.karigar_accruals FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_other_books();