ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username)) WHERE username IS NOT NULL;