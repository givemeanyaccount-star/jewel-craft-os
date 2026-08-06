-- app_settings: replace blanket read with role-named read
DROP POLICY IF EXISTS "Signed in users can read settings" ON public.app_settings;
CREATE POLICY "roles read settings" ON public.app_settings
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager')
  OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'accountant')
  OR private.has_role(auth.uid(),'karigar') OR private.has_role(auth.uid(),'viewer')
);

-- categories
DROP POLICY IF EXISTS "auth read categories" ON public.categories;
CREATE POLICY "roles read categories" ON public.categories
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager')
  OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'accountant')
  OR private.has_role(auth.uid(),'karigar') OR private.has_role(auth.uid(),'viewer')
);

-- locations
DROP POLICY IF EXISTS "auth read locations" ON public.locations;
CREATE POLICY "roles read locations" ON public.locations
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager')
  OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'accountant')
  OR private.has_role(auth.uid(),'karigar') OR private.has_role(auth.uid(),'viewer')
);

-- metal_rates: drop blanket read, keep role-named one (add sales/karigar)
DROP POLICY IF EXISTS "auth read rates" ON public.metal_rates;
DROP POLICY IF EXISTS "staff read metal_rates" ON public.metal_rates;
CREATE POLICY "roles read metal_rates" ON public.metal_rates
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager')
  OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'accountant')
  OR private.has_role(auth.uid(),'karigar') OR private.has_role(auth.uid(),'viewer')
);

-- role_permissions: blanket read is required by the client permission matrix, keep but scope to known roles
DROP POLICY IF EXISTS "authenticated can read role permissions" ON public.role_permissions;
CREATE POLICY "roles read role permissions" ON public.role_permissions
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager')
  OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'accountant')
  OR private.has_role(auth.uid(),'karigar') OR private.has_role(auth.uid(),'viewer')
);

-- viewers may read payments (read-only) so invoice detail renders
CREATE POLICY "viewer read payments" ON public.payments
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'viewer'));
