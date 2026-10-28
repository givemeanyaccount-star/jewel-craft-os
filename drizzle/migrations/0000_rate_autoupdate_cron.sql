CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.cron_config (
  name text PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex')
);
REVOKE ALL ON private.cron_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON private.cron_config TO service_role;
INSERT INTO private.cron_config (name) VALUES ('rates') ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.verify_cron_token(_name text, _token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT EXISTS (SELECT 1 FROM private.cron_config WHERE name = _name AND token = _token)
$$;
REVOKE EXECUTE ON FUNCTION public.verify_cron_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(text, text) TO service_role;