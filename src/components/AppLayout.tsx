import { ReactNode, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LogOut, Menu, Home, ChevronDown, Plus, LayoutDashboard, Receipt, Layers, Package,
  ClipboardList, Wrench, ShoppingCart, FileText,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo.png";
import { usePermission } from "@/hooks/usePermission";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useEscapeBack } from "@/hooks/useEscapeBack";
import { NAV_SECTIONS, visibleSections, badgeLabel } from "@/lib/navConfig";
import { useNavBadges } from "@/hooks/useNavBadges";
import { RateTicker } from "@/components/RateTicker";
import { CommandPalette } from "@/components/CommandPalette";

const COLLAPSE_KEY = "jm.nav.collapsed";
function loadCollapsed(): Record<string, boolean> {
  try { const v = localStorage.getItem(COLLAPSE_KEY); if (v) return JSON.parse(v); } catch { /* ignore */ }
  return Object.fromEntries(NAV_SECTIONS.filter((s) => s.collapsedByDefault).map((s) => [s.label, true]));
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, roles, signOut } = useAuth();
  const { hasPermission } = usePermission();
  const badges = useNavBadges();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const sections = visibleSections(hasPermission);
  const toggle = (label: string) => setCollapsed((c) => {
    const next = { ...c, [label]: !c[label] };
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    return next;
  });
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
        <img src={logoUrl} alt="JewelMaster OS" className="h-9 w-9 rounded-md bg-white/95 object-contain p-0.5" />
        <div>
          <div className="text-base font-semibold tracking-tight">JewelMaster</div>
          <div className="text-[10px] uppercase tracking-widest text-sidebar-primary">OS · Kathmandu</div>
        </div>
      </Link>
      <nav className="flex-1 space-y-3 overflow-y-auto p-3">
        {sections.map((section) => {
          const hasActive = section.items.some((i) => i.to === location.pathname);
          const isOpen = !collapsed[section.label] || hasActive;
          const groupCount = section.items.reduce((a, i) => a + (i.badge ? badges[i.badge] ?? 0 : 0), 0);
          return (
            <div key={section.label}>
              <button type="button" onClick={() => toggle(section.label)}
                className="mb-1 flex w-full items-center justify-between px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50 hover:text-sidebar-foreground">
                <span>{section.label}{!isOpen && badgeLabel(groupCount) ? ` · ${badgeLabel(groupCount)}` : ""}</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", !isOpen && "-rotate-90")} />
              </button>
              {isOpen && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const b = item.badge ? badgeLabel(badges[item.badge]) : null;
                    return (
                      <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={onNavigate}
                        className={({ isActive }) => cn(
                          "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                          isActive ? "bg-sidebar-accent text-sidebar-primary font-medium"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        )}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {b && <span className="rounded-full bg-sidebar-primary px-1.5 text-[10px] font-semibold leading-4 text-sidebar-primary-foreground">{b}</span>}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 px-2 text-xs text-sidebar-foreground/70 truncate">{user?.email}</div>
        <div className="mb-2 flex flex-wrap gap-1 px-2">
          {roles.map((r) => (
            <span key={r} className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{r}</span>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}

const NEW_ACTIONS = [
  { to: "/pos", label: "New sale", icon: Receipt, permission: "pos_create_sale" },
  { to: "/orders", label: "New order", icon: ClipboardList, permission: "order_view" },
  { to: "/repairs", label: "New repair", icon: Wrench, permission: "repair_manage" },
  { to: "/purchases", label: "New purchase", icon: ShoppingCart, permission: "purchase_manage" },
  { to: "/quotations", label: "New quotation", icon: FileText, permission: "quotation_create_edit" },
] as const;

function NewMenu() {
  const { hasPermission } = usePermission();
  const list = NEW_ACTIONS.filter((a) => hasPermission(a.permission));
  if (!list.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-8 gap-1"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {list.map((a) => (
          <DropdownMenuItem key={a.label} asChild>
            <Link to={a.to}><a.icon className="mr-2 h-4 w-4" />{a.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const { hasPermission } = usePermission();
  const badges = useNavBadges();
  const items = [
    { to: "/", label: "Home", icon: LayoutDashboard, ok: hasPermission("view_dashboard") },
    { to: "/pos", label: "Sale", icon: Receipt, ok: hasPermission("pos_create_sale") },
    { to: "/counter", label: "Counter", icon: Layers, ok: hasPermission("pos_create_sale"), badge: badgeLabel(badges.held) },
    { to: "/inventory", label: "Stock", icon: Package, ok: hasPermission("inventory_view") },
  ].filter((i) => i.ok);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 backdrop-blur md:hidden print:hidden">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.to === "/"}
          className={({ isActive }) => cn("relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px]", isActive ? "text-primary font-medium" : "text-muted-foreground")}>
          <i.icon className="h-5 w-5" />{i.label}
          {i.badge && <span className="absolute right-1/4 top-0.5 rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground">{i.badge}</span>}
        </NavLink>
      ))}
      <button type="button" onClick={onMore} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] text-muted-foreground">
        <Menu className="h-5 w-5" />More
      </button>
    </nav>
  );
}

export function AppLayout({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = NAV_SECTIONS.flatMap((s) => s.items).find((n) => n.to === location.pathname);
  const isHome = location.pathname === "/";
  const isPos = location.pathname === "/pos";
  useEscapeBack();
  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-60 shrink-0 md:block print:hidden">
        <div className="sticky top-0 h-screen"><SidebarContent /></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card/95 px-3 py-2.5 backdrop-blur md:px-6 print:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarContent onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          {!isHome && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon" className="hidden h-8 w-8 text-muted-foreground hover:text-foreground sm:inline-flex">
                  <Link to="/" aria-label="Go to dashboard"><Home className="h-4 w-4" /></Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Dashboard · Esc to go back</TooltipContent>
            </Tooltip>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title ?? current?.label ?? "JewelMaster OS"}</h1>
          </div>
          <RateTicker className="hidden xl:flex" />
          <div className="flex items-center gap-2">
            {actions}
            <CommandPalette />
            {!isPos && <NewMenu />}
            <ThemeSwitcher className="hidden sm:flex" />
          </div>
        </header>
        <RateTicker className="flex justify-center rounded-none border-x-0 border-t-0 xl:hidden print:hidden" />
        <main className={cn("flex-1 p-4 md:p-6", !isPos && "pb-20 md:pb-6")}>{children}</main>
      </div>
      {!isPos && <BottomNav onMore={() => setMenuOpen(true)} />}
    </div>
  );
}
