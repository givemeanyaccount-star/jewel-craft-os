-- Replaces timestamp-derived document numbers (which could collide) with a real,
-- atomic, per-prefix-per-year counter. Safe under concurrent calls: the UPSERT
-- below takes a row lock, so two simultaneous callers can never get the same number.

CREATE TABLE public.document_sequences (
  prefix text NOT NULL,
  year int NOT NULL,
  last_value int NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
);

ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
-- No direct table access needed; only the function below touches it (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.next_document_number(p_prefix text, p_pad int DEFAULT 5)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := extract(year from now())::int;
  v_next int;
BEGIN
  INSERT INTO public.document_sequences (prefix, year, last_value)
  VALUES (p_prefix, v_year, 1)
  ON CONFLICT (prefix, year)
  DO UPDATE SET last_value = public.document_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN p_prefix || '-' || right(v_year::text, 2) || '-' || lpad(v_next::text, p_pad, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_document_number(text, int) TO authenticated;
