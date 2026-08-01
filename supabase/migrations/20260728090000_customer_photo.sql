ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS photo_url text;
