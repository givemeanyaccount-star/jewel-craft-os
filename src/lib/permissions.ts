export type AppRole = "admin" | "manager" | "sales" | "karigar" | "accountant";

export type AppPermission =
  | "view_dashboard"
  | "pos_create_sale"
  | "quotation_create_edit"
  | "invoice_view"
  | "invoice_cancel_refund"
  | "inventory_view"
  | "inventory_manage"
  | "customer_manage"
  | "credit_view"
  | "repair_manage"
  | "karigar_manage"
  | "purchase_manage"
  | "supplier_manage"
  | "metal_rate_manage"
  | "settings_manage"
  | "role_manage"
  | "report_view"
  | "old_gold_purchase";

export const ALL_PERMISSIONS: AppPermission[] = [
  "view_dashboard",
  "pos_create_sale",
  "quotation_create_edit",
  "invoice_view",
  "invoice_cancel_refund",
  "inventory_view",
  "inventory_manage",
  "customer_manage",
  "credit_view",
  "repair_manage",
  "karigar_manage",
  "purchase_manage",
  "supplier_manage",
  "metal_rate_manage",
  "settings_manage",
  "role_manage",
  "report_view",
  "old_gold_purchase",
];

export const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  admin: ALL_PERMISSIONS,
  manager: ALL_PERMISSIONS.filter((p) => p !== "role_manage"),
  sales: [
    "view_dashboard",
    "pos_create_sale",
    "quotation_create_edit",
    "invoice_view",
    "inventory_view",
    "inventory_manage",
    "customer_manage",
    "old_gold_purchase",
  ],
  karigar: [
    "view_dashboard",
    "inventory_view",
    "repair_manage",
  ],
  accountant: [
    "view_dashboard",
    "invoice_view",
    "credit_view",
    "metal_rate_manage",
    "report_view",
  ],
};

export function can(roles: AppRole[], permission: AppPermission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

export function canAny(roles: AppRole[], permissions: AppPermission[]): boolean {
  return permissions.some((p) => can(roles, p));
}

export function permissionsForRole(role: AppRole): AppPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
