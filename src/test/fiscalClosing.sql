-- Run through the managed database query tool. All changes roll back.
-- Simulate the previous year being active before the current year opens.
BEGIN;
DO $$
DECLARE y integer; c integer; closing jsonb; opening jsonb;
BEGIN
  SELECT bs_year INTO y FROM public.fiscal_years
  WHERE (now() AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN starts_on AND ends_on;
  UPDATE public.fiscal_years SET activated_at=NULL, opening_books=NULL WHERE bs_year=y;
  UPDATE public.fiscal_years SET activated_at=now(),closed_at=NULL,closing_books=NULL WHERE bs_year=y-1;
  PERFORM public.rollover_fiscal_books();
  SELECT closing_books INTO closing FROM public.fiscal_years WHERE bs_year=y-1;
  IF closing IS NULL THEN RAISE EXCEPTION 'Missing closing archive'; END IF;
  SELECT opening_books->'balances' INTO opening FROM public.fiscal_years WHERE bs_year=y;
  IF opening IS DISTINCT FROM closing->'balances' THEN RAISE EXCEPTION 'Opening balance mismatch'; END IF;
  SELECT count(*) INTO c FROM public.audit_logs WHERE action='fiscal_year_closed' AND (details->>'next_year')::integer=y;
  PERFORM public.rollover_fiscal_books();
  IF c<>(SELECT count(*) FROM public.audit_logs WHERE action='fiscal_year_closed' AND (details->>'next_year')::integer=y) THEN RAISE EXCEPTION 'Duplicate closing'; END IF;
END $$;
ROLLBACK;