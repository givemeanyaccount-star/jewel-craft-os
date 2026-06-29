ALTER TABLE public.metal_rates ADD COLUMN IF NOT EXISTS source text;
DELETE FROM public.metal_rates a
USING public.metal_rates b
WHERE a.metal = b.metal
  AND a.purity = b.purity
  AND a.effective_date = b.effective_date
  AND a.created_at < b.created_at;
CREATE UNIQUE INDEX IF NOT EXISTS metal_rates_metal_purity_date_uniq
  ON public.metal_rates (metal, purity, effective_date);