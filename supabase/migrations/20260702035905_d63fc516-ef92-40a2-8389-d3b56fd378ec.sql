
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sku_prefix TEXT,
  ADD COLUMN IF NOT EXISTS next_sequence INTEGER NOT NULL DEFAULT 1;

-- Seed default prefixes for known categories
UPDATE public.categories SET sku_prefix = CASE lower(name)
  WHEN 'ring' THEN 'RNG'
  WHEN 'necklace' THEN 'NKL'
  WHEN 'earring' THEN 'EAR'
  WHEN 'bangle' THEN 'BNG'
  WHEN 'bracelet' THEN 'BRC'
  WHEN 'chain' THEN 'CHN'
  WHEN 'pendant' THEN 'PND'
  WHEN 'mangalsutra' THEN 'MNG'
  WHEN 'nose pin' THEN 'NOS'
  WHEN 'anklet' THEN 'ANK'
  ELSE upper(substring(regexp_replace(name, '[^A-Za-z]', '', 'g'), 1, 3))
END WHERE sku_prefix IS NULL;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_sku_prefix_key UNIQUE (sku_prefix);

CREATE OR REPLACE FUNCTION public.next_category_sku(_category_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix TEXT;
  _seq INTEGER;
BEGIN
  UPDATE public.categories
     SET next_sequence = next_sequence + 1
   WHERE id = _category_id
   RETURNING sku_prefix, next_sequence - 1 INTO _prefix, _seq;
  IF _prefix IS NULL THEN
    _prefix := 'JM';
  END IF;
  RETURN _prefix || '-' || lpad(_seq::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_category_sku(UUID) TO authenticated;
