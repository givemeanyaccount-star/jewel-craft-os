import {
  LayoutDashboard, Package, Users, FileText, Receipt, Settings, ClipboardCheck, FileUp, ShieldCheck,
  TrendingUp, Wrench, Truck, ShoppingCart, Undo2, ClipboardList, Hammer, Factory, Layers, BarChart3, Scale, WalletCards, Tag, Palette,
} from "lucide-react";
import type { AppPermission } from "@/lib/permissions";

export type BadgeKey = "held" | "adjustments" | "repairsDue" | "ordersDue";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: AppPermission;
  /** Also allow users with any of these permissions (for shared counter/report screens). */
  anyOf?: AppPermission[];
  badge?: BadgeKey;
}
export interface NavSection { label: string; items: NavItem[]; collapsedByDefault?: boolean }

export const NAV_SECTIONS: NavSection[] = [
  { label: "Sell", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, permission: "view_dashboard" },
    { to: "/pos", label: "POS / New Sale", icon: Receipt, permission: "pos_create_sale" },
    { to: "/counter", label: "Counter", icon: Layers, permission: "pos_create_sale", badge: "held" },
    { to: "/quotations", label: "Quotations", icon: FileText, permission: "quotation_create_edit" },
    { to: "/invoices", label: "Invoices", icon: Receipt, permission: "invoice_view" },
    { to: "/returns", label: "Sales Returns", icon: Undo2, permission: "invoice_cancel_refund" },
  ] },
  { label: "Orders & Repairs", items: [
    { to: "/orders", label: "Orders", icon: ClipboardList, permission: "order_view", badge: "ordersDue" },
    { to: "/production", label: "Production", icon: Factory, permission: "order_view" },
    { to: "/repairs", label: "Repairs", icon: Wrench, permission: "repair_manage", badge: "repairsDue" },
    { to: "/repairs/karigars", label: "Karigars", icon: Hammer, permission: "repair_manage" },
  ] },
  { label: "Stock", items: [
    { to: "/inventory", label: "Inventory", icon: Package, permission: "inventory_view" },
    { to: "/tags", label: "Print Tags", icon: Tag, permission: "inventory_view" },
    { to: "/tags?design=1", label: "Tag Designer", icon: Palette, permission: "inventory_view" },
    { to: "/inventory-adjustments", label: "Weight Adjustments", icon: Scale, permission: "inventory_view", badge: "adjustments" },
    { to: "/purchases", label: "Purchases", icon: ShoppingCart, permission: "purchase_manage" },
    { to: "/suppliers", label: "Suppliers", icon: Truck, permission: "supplier_manage" },
    { to: "/rates", label: "Metal Rates", icon: TrendingUp, permission: "metal_rate_manage" },
  ] },
  { label: "Reports", items: [
    { to: "/reports/day-close", label: "Day Close", icon: WalletCards, permission: "report_view", anyOf: ["pos_create_sale"] },
    { to: "/reports/sales", label: "Sales Report", icon: BarChart3, permission: "report_view" },
    { to: "/reports/stock", label: "Stock & Metal Report", icon: BarChart3, permission: "report_view" },
    { to: "/fiscal-years", label: "Fiscal Years", icon: ClipboardCheck, permission: "report_view" },
  ] },
  { label: "People", items: [
    { to: "/customers", label: "Customers", icon: Users, permission: "customer_manage" },
  ] },
  { label: "Setup", collapsedByDefault: true, items: [
    { to: "/settings", label: "Settings", icon: Settings, permission: "settings_manage" },
    { to: "/setup", label: "Shop Setup", icon: ClipboardCheck, permission: "settings_manage" },
    { to: "/import", label: "Bring Over Old Data", icon: FileUp, permission: "settings_manage" },
    { to: "/admin/roles", label: "Role Management", icon: ShieldCheck, permission: "role_manage" },
  ] },
];

/** Sections with only the links this user may open; empty sections drop out. */
export function visibleSections(has: (p: AppPermission) => boolean, sections: NavSection[] = NAV_SECTIONS) {
  return sections
    .map((s) => ({ ...s, items: s.items.filter((n) => !n.permission || has(n.permission) || n.anyOf?.some(has)) }))
    .filter((s) => s.items.length > 0);
}

/** Badge text: hidden at zero, capped at 99+. */
export function badgeLabel(n: number | undefined): string | null {
  if (!n || n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}
