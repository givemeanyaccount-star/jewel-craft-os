ALTER TABLE public.invoices ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE public.quotations ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE public.old_gold_purchases ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE public.repairs ALTER COLUMN customer_id SET NOT NULL;