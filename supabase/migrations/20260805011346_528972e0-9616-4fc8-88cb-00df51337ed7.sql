REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, authenticated, anon;

-- next_category_sku is intentionally exposed to authenticated callers with internal role checks.
-- Revoke from anon/public to keep the exposure minimal.
REVOKE EXECUTE ON FUNCTION public.next_category_sku(uuid) FROM PUBLIC, anon;

-- Ensure service_role retains access for any admin/edge-function needs.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_category_sku(uuid) TO service_role;