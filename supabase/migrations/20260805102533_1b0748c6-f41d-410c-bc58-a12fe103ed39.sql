CREATE TABLE public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  permission text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, permission)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read role permissions"
ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage role permissions"
ON public.role_permissions FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE TRIGGER role_permissions_touch
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.role_permissions (role, permission, allowed) VALUES
('admin','view_dashboard',true),('admin','pos_create_sale',true),('admin','quotation_create_edit',true),('admin','invoice_view',true),('admin','invoice_cancel_refund',true),('admin','inventory_view',true),('admin','inventory_manage',true),('admin','customer_manage',true),('admin','credit_view',true),('admin','repair_manage',true),('admin','karigar_manage',true),('admin','purchase_manage',true),('admin','supplier_manage',true),('admin','metal_rate_manage',true),('admin','settings_manage',true),('admin','role_manage',true),('admin','report_view',true),('admin','old_gold_purchase',true),
('manager','view_dashboard',true),('manager','pos_create_sale',true),('manager','quotation_create_edit',true),('manager','invoice_view',true),('manager','invoice_cancel_refund',true),('manager','inventory_view',true),('manager','inventory_manage',true),('manager','customer_manage',true),('manager','credit_view',true),('manager','repair_manage',true),('manager','karigar_manage',true),('manager','purchase_manage',true),('manager','supplier_manage',true),('manager','metal_rate_manage',true),('manager','settings_manage',true),('manager','report_view',true),('manager','old_gold_purchase',true),
('sales','view_dashboard',true),('sales','pos_create_sale',true),('sales','quotation_create_edit',true),('sales','invoice_view',true),('sales','inventory_view',true),('sales','inventory_manage',true),('sales','customer_manage',true),('sales','old_gold_purchase',true),
('karigar','view_dashboard',true),('karigar','inventory_view',true),('karigar','repair_manage',true),
('accountant','view_dashboard',true),('accountant','invoice_view',true),('accountant','credit_view',true),('accountant','metal_rate_manage',true),('accountant','report_view',true);