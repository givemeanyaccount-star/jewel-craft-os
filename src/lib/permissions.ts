export type AppRole = "admin" | "manager" | "sales" | "karigar" | "accountant" | "viewer";

export const ALL_ROLES: AppRole[] = ["admin", "manager", "sales", "karigar", "accountant", "viewer"];


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
  | "old_gold_purchase"
  | "order_view"
  | "order_manage"
  | "order_bill";

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
  "order_view",
  "order_manage",
  "order_bill",
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
    "metal_rate_manage",
    "old_gold_purchase",
    "order_view",
    "order_manage",
    "order_bill",
  ],
  karigar: [
    "view_dashboard",
    "inventory_view",
    "repair_manage",
    "order_view",
  ],
  accountant: [
    "view_dashboard",
    "invoice_view",
    "credit_view",
    "metal_rate_manage",
    "report_view",
    "order_view",
  ],
  viewer: [
    "view_dashboard",
    "inventory_view",
    "invoice_view",
    "order_view",
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

/** Built-in defaults, used for seeding and for "reset to defaults". */
export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = ROLE_PERMISSIONS;

export type RolePermissionMatrix = Record<AppRole, AppPermission[]>;

export function defaultMatrix(): RolePermissionMatrix {
  return ALL_ROLES.reduce((acc, r) => {
    acc[r] = [...DEFAULT_ROLE_PERMISSIONS[r]];
    return acc;
  }, {} as RolePermissionMatrix);
}

export function canWith(
  matrix: RolePermissionMatrix | null | undefined,
  roles: AppRole[],
  permission: AppPermission,
): boolean {
  const m = matrix ?? DEFAULT_ROLE_PERMISSIONS;
  // Admins always keep role management, to avoid permanent lockout.
  if (permission === "role_manage" && roles.includes("admin")) return true;
  return roles.some((role) => m[role]?.includes(permission));
}
