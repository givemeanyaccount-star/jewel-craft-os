import { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Package, Users, FileText, Receipt,
  Settings, LogOut, Menu, ShieldCheck, TrendingUp,
  Wrench, Truck, ShoppingCart
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo.png";
import { AppPermission } from "@/lib/permissions";
import { usePermission } from "@/hooks/usePermission";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: AppPermission;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, permission: "view_dashboard" },
  { to: "/pos", label: "POS / New Sale", icon: Receipt, permission: "pos_create_sale" },
  { to: "/inventory", label: "Inventory", icon: Package, permission: "inventory_view" },
  { to: "/customers", label: "Customers", icon: Users, permission: "customer_manage" },
  { to: "/quotations", label: "Quotations", icon: FileText, permission: "quotation_create_edit" },
  { to: "/invoices", label: "Invoices", icon: Receipt, permission: "invoice_view" },
  { to: "/purchases", label: "Purchases", icon: ShoppingCart, permission: "purchase_manage" },
  { to: "/rates", label: "Metal Rates", icon: TrendingUp, permission: "metal_rate_manage" },
  { to: "/repairs", label: "Repairs", icon: Wrench, permission: "repair_manage" },
  { to: "/repairs/karigars", label: "Karigars", icon: Wrench, permission: "karigar_manage" },
  { to: "/suppliers", label: "Suppliers", icon: Truck, permission: "supplier_manage" },
  { to: "/settings", label: "Settings", icon: Settings, permission: "settings_manage" },
  { to: "/admin/roles", label: "Role Management", icon: ShieldCheck, permission: "role_manage" },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const { hasPermission } = usePermission();
  const visible = NAV.filter((n) => !n.permission || hasPermission(n.permission));
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
        <img src={logoUrl} alt="JewelMaster OS" className="h-9 w-9 rounded-md bg-white/95 object-contain p-0.5" />
        <div>
          <div className="text-base font-semibold tracking-tight">JewelMaster</div>
          <div className="text-[10px] uppercase tracking-widest text-sidebar-primary">OS · Kathmandu</div>
        </div>
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 px-2 text-xs text-sidebar-foreground/70 truncate">{user?.email}</div>
        <div className="mb-2 flex flex-wrap gap-1 px-2">
          {roles.map((r) => (
            <span key={r} className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              {r}
            </span>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppLayout({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  const location = useLocation();
  const current = NAV.find((n) => n.to === location.pathname);
  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 md:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card/95 px-3 py-2.5 backdrop-blur md:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetContentInner />
            </SheetContent>
          </Sheet>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-lg font-semibold">{title ?? current?.label ?? "JewelMaster OS"}</h1>
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function SheetContentInner() {
  // wrapper to allow auto-close on nav
  return <SidebarContent />;
}
