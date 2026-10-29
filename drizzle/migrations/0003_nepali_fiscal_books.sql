CREATE TABLE public.fiscal_years (
 bs_year integer PRIMARY KEY, label text NOT NULL UNIQUE, starts_on date NOT NULL UNIQUE, ends_on date NOT NULL, activated_at timestamptz, closed_at timestamptz,
 opening_books jsonb, closing_books jsonb, CHECK (ends_on >= starts_on)
);
GRANT SELECT ON public.fiscal_years TO authenticated;
GRANT ALL ON public.fiscal_years TO service_role;
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_books_read ON public.fiscal_years FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant'));

CREATE OR REPLACE FUNCTION public.capture_fiscal_books(_start date, _end date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b jsonb; k jsonb; BEGIN
 b := jsonb_build_object('period_start',_start,'period_end',_end,'captured_at',now(),'archive_version',1,
 'sales',COALESCE((SELECT jsonb_agg(to_jsonb(i) - 'created_by') FROM invoices i WHERE (i.issued_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end),'[]'::jsonb),
 'sale_items',COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM invoice_items l JOIN invoices i ON i.id=l.invoice_id WHERE (i.issued_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end),'[]'::jsonb),
 'receipts',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'created_by') FROM payments p WHERE (p.paid_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end),'[]'::jsonb),
 'purchases',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'created_by') FROM purchases p WHERE p.purchase_date BETWEEN _start AND _end),'[]'::jsonb),
 'purchase_items',COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM purchase_items l JOIN purchases p ON p.id=l.purchase_id WHERE p.purchase_date BETWEEN _start AND _end),'[]'::jsonb),
 'old_metal',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'id_doc_image_url'-'customer_photo_url'-'created_by') FROM old_gold_purchases p WHERE (p.purchased_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end),'[]'::jsonb),
 'returns',COALESCE((SELECT jsonb_agg(to_jsonb(r)-'created_by') FROM sales_returns r WHERE (r.processed_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end),'[]'::jsonb),
 'return_items',COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM sales_return_items l JOIN sales_returns r ON r.id=l.return_id WHERE (r.processed_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end),'[]'::jsonb),
 'advance_history',COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM customer_advance_events e WHERE (e.created_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end),'[]'::jsonb),
 'karigar_charges',COALESCE((SELECT jsonb_agg(to_jsonb(a)-'created_by') FROM karigar_accruals a WHERE (a.accrued_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN _start AND _end),'[]'::jsonb),
 'karigar_payments',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'created_by') FROM karigar_payments p WHERE p.payment_date BETWEEN _start AND _end),'[]'::jsonb));
 k := jsonb_build_object(
 'stock',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'sku',sku,'name',name,'metal',metal,'purity',purity,'gross_weight',gross_weight,'stone_weight',stone_weight,'net_weight',net_weight,'fine_weight',fine_weight,'status',status,'location_id',location_id)) FROM inventory_items WHERE status IN ('in_stock','reserved','returned')),'[]'::jsonb),
 'receivables',COALESCE((SELECT jsonb_agg(jsonb_build_object('invoice_id',i.id,'invoice_number',i.invoice_number,'customer_id',i.customer_id,'customer',c.full_name,'balance_due',i.balance_due)) FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.balance_due>0 AND i.status NOT IN ('cancelled','refunded','draft')),'[]'::jsonb),
 'unused_advances',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'customer_id',p.customer_id,'customer',c.full_name,'order_id',p.order_id,'amount',p.amount,'method',p.method,'paid_at',p.paid_at,'reference',p.reference)) FROM payments p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.invoice_id IS NULL AND p.amount>0),'[]'::jsonb),
 'open_orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'order_no',order_no,'customer_id',customer_id,'status',status,'order_date',order_date,'estimated_total',estimated_total,'advance_paid',advance_paid)) FROM orders WHERE status NOT IN ('completed','cancelled')),'[]'::jsonb),
 'open_order_items',COALESCE((SELECT jsonb_agg(to_jsonb(l)-'photos') FROM order_items l JOIN orders o ON o.id=l.order_id WHERE o.status NOT IN ('completed','cancelled')),'[]'::jsonb),
 'open_repairs',COALESCE((SELECT jsonb_agg(to_jsonb(l)-'photos') FROM repair_items l WHERE status<>'delivered'),'[]'::jsonb),
 'supplier_purchases_unpaid',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'purchase_no',p.purchase_no,'supplier_id',p.supplier_id,'supplier',s.name,'total_amount',p.total_amount,'payment_status',p.payment_status)) FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.payment_status<>'paid'),'[]'::jsonb),
 'karigar_balances',COALESCE((SELECT jsonb_agg(jsonb_build_object('karigar_id',k.id,'name',k.name,'charges',COALESCE((SELECT sum(amount) FROM karigar_accruals WHERE karigar_id=k.id),0),'paid',COALESCE((SELECT sum(amount) FROM karigar_payments WHERE karigar_id=k.id),0))) FROM karigars k),'[]'::jsonb));
 RETURN b || jsonb_build_object('balances',k);
END $$;
REVOKE ALL ON FUNCTION public.capture_fiscal_books(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_fiscal_books(date,date) TO service_role;

CREATE OR REPLACE FUNCTION public.rollover_fiscal_books() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t date := (now() AT TIME ZONE 'Asia/Kathmandu')::date; current_year integer; r record; snap jsonb; BEGIN
 PERFORM pg_advisory_xact_lock(834001);
 SELECT bs_year INTO current_year FROM fiscal_years WHERE t BETWEEN starts_on AND ends_on;
 IF current_year IS NULL THEN RAISE EXCEPTION 'Nepali fiscal calendar needs renewal before posting'; END IF;
 FOR r IN SELECT * FROM fiscal_years WHERE activated_at IS NOT NULL AND closed_at IS NULL AND ends_on<t ORDER BY bs_year FOR UPDATE LOOP
   snap := capture_fiscal_books(r.starts_on,r.ends_on);
   UPDATE fiscal_years SET closed_at=now(),closing_books=snap WHERE bs_year=r.bs_year;
   UPDATE fiscal_years SET opening_books=jsonb_build_object('captured_at',now(),'carried_from',r.label,'balances',snap->'balances'),activated_at=now() WHERE bs_year=r.bs_year+1 AND activated_at IS NULL;
   INSERT INTO audit_logs(action,details) VALUES ('fiscal_year_closed',jsonb_build_object('fiscal_year',r.label,'closed_at',now(),'next_year',r.bs_year+1,'automatic',true));
 END LOOP;
 UPDATE fiscal_years SET activated_at=now(),opening_books=jsonb_build_object('captured_at',now(),'activation_snapshot',true,'balances',capture_fiscal_books(t,t)->'balances') WHERE bs_year=current_year AND activated_at IS NULL;
 RETURN current_year;
END $$;
REVOKE ALL ON FUNCTION public.rollover_fiscal_books() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rollover_fiscal_books() TO service_role;

CREATE OR REPLACE FUNCTION public.next_fiscal_sale_number(_sale_date date, _pad integer DEFAULT 5) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE y integer; seq integer; BEGIN
 IF auth.uid() IS NULL OR NOT (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'sales')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 PERFORM rollover_fiscal_books();
 SELECT bs_year INTO y FROM fiscal_years WHERE _sale_date BETWEEN starts_on AND ends_on AND closed_at IS NULL;
 IF y IS NULL THEN RAISE EXCEPTION 'Sale date is outside an open fiscal year'; END IF;
 IF _sale_date>(now() AT TIME ZONE 'Asia/Kathmandu')::date THEN RAISE EXCEPTION 'Sale date cannot be in the future'; END IF;
 INSERT INTO document_sequences(prefix,year,last_value) VALUES('INV',y,1) ON CONFLICT(prefix,year) DO UPDATE SET last_value=document_sequences.last_value+1 RETURNING last_value INTO seq;
 RETURN 'INV-'||y||'-'||right((y+1)::text,2)||'-'||lpad(seq::text,least(10,greatest(1,COALESCE(_pad,5))),'0');
END $$;
REVOKE ALL ON FUNCTION public.next_fiscal_sale_number(date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.next_fiscal_sale_number(date,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_closed_fiscal_book() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_date date; new_date date; doc jsonb; prev jsonb; BEGIN
 PERFORM rollover_fiscal_books();
 IF TG_OP<>'INSERT' THEN prev:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN doc:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='invoices' THEN old_date:=(OLD.issued_at AT TIME ZONE 'Asia/Kathmandu')::date; IF TG_OP<>'DELETE' THEN new_date:=(NEW.issued_at AT TIME ZONE 'Asia/Kathmandu')::date; END IF;
 ELSE
   IF TG_OP<>'INSERT' THEN old_date:=CASE WHEN TG_TABLE_NAME='purchases' THEN (prev->>'purchase_date')::date WHEN TG_TABLE_NAME='karigar_payments' THEN (prev->>'payment_date')::date WHEN TG_TABLE_NAME='payments' THEN ((prev->>'paid_at')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date ELSE ((prev->>'purchased_at')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date END; END IF;
   IF TG_OP<>'DELETE' THEN new_date:=CASE WHEN TG_TABLE_NAME='purchases' THEN (doc->>'purchase_date')::date WHEN TG_TABLE_NAME='karigar_payments' THEN (doc->>'payment_date')::date WHEN TG_TABLE_NAME='payments' THEN ((doc->>'paid_at')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date ELSE ((doc->>'purchased_at')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date END; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM fiscal_years WHERE closed_at IS NOT NULL AND (old_date BETWEEN starts_on AND ends_on OR new_date BETWEEN starts_on AND ends_on)) THEN
  IF TG_TABLE_NAME='invoices' AND TG_OP='UPDATE' AND (prev-'amount_paid'-'balance_due'-'status'-'updated_at')=(doc-'amount_paid'-'balance_due'-'status'-'updated_at') AND NEW.status IN ('issued','partial','paid') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='payments' AND TG_OP='UPDATE' AND (prev-'invoice_id'-'updated_at')=(doc-'invoice_id'-'updated_at') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'This fiscal year is closed. Record the correction in the current year instead.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_fiscal_book() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fiscal_guard_invoices BEFORE INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_book();
CREATE TRIGGER fiscal_guard_payments BEFORE INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_book();
CREATE TRIGGER fiscal_guard_purchases BEFORE INSERT OR UPDATE OR DELETE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_book();
CREATE TRIGGER fiscal_guard_old_metal BEFORE INSERT OR UPDATE OR DELETE ON public.old_gold_purchases FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_book();
CREATE TRIGGER fiscal_guard_karigar_payments BEFORE INSERT OR UPDATE OR DELETE ON public.karigar_payments FOR EACH ROW EXECUTE FUNCTION public.guard_closed_fiscal_book();
COMMENT ON TABLE public.fiscal_years IS 'Immutable operational fiscal books, not a database backup or double-entry general ledger. Opening balances are carried without duplicating live records.';