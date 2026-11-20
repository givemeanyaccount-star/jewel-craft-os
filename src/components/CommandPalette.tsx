import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import { visibleSections } from "@/lib/navConfig";

type Hit = { id: string; label: string; sub?: string; to: string };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Record<string, Hit[]>>({});
  const nav = useNavigate();
  const { hasPermission } = usePermission();
  const pages = visibleSections(hasPermission).flatMap((s) => s.items);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim().replace(/[,()%]/g, "");
    if (term.length < 2) { setHits({}); return; }
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const [inv, cus, itm, ord] = await Promise.all([
        hasPermission("invoice_view") ? supabase.from("invoices").select("id, invoice_number, total").or(`invoice_number.ilike.${like},legacy_number.ilike.${like}`).limit(5) : null,
        hasPermission("customer_manage") ? supabase.from("customers").select("id, full_name, phone").or(`full_name.ilike.${like},phone.ilike.${like}`).limit(5) : null,
        hasPermission("inventory_view") ? supabase.from("inventory_items").select("id, name, sku, legacy_code").or(`sku.ilike.${like},name.ilike.${like},legacy_code.ilike.${like}`).limit(5) : null,
        hasPermission("order_view") ? supabase.from("orders").select("id, order_no, status").ilike("order_no", like).limit(5) : null,
      ]);
      setHits({
        Invoices: (inv?.data ?? []).map((r) => ({ id: r.id, label: r.invoice_number, sub: `NPR ${Number(r.total).toLocaleString("en-IN")}`, to: `/invoices/${r.id}` })),
        Customers: (cus?.data ?? []).map((r) => ({ id: r.id, label: r.full_name, sub: r.phone ?? "", to: `/customers/${r.id}` })),
        Items: (itm?.data ?? []).map((r) => ({ id: r.id, label: r.name, sub: r.legacy_code ? `${r.legacy_code} (${r.sku})` : r.sku, to: `/inventory/${r.id}` })),
        Orders: (ord?.data ?? []).map((r) => ({ id: r.id, label: r.order_no, sub: r.status, to: `/orders/${r.id}` })),
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: string) => { setOpen(false); setQ(""); nav(to); };
  const lower = q.toLowerCase();

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-2 text-muted-foreground" onClick={() => setOpen(true)} aria-label="Search">
        <Search className="h-4 w-4" /><span className="hidden lg:inline">Search</span>
        <kbd className="hidden rounded border bg-muted px-1 font-mono text-[10px] lg:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Bill no., customer name/phone, SKU, order no., or a page…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          {Object.entries(hits).map(([group, list]) => list.length > 0 && (
            <CommandGroup key={group} heading={group}>
              {list.map((h) => (
                <CommandItem key={h.id} value={`${group}-${h.id}-${q}`} onSelect={() => go(h.to)}>
                  <span className="font-medium">{h.label}</span>
                  {h.sub && <span className="ml-2 text-xs text-muted-foreground">{h.sub}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="Pages">
            {pages.filter((p) => !lower || p.label.toLowerCase().includes(lower)).map((p) => (
              <CommandItem key={p.to} value={`page-${p.to}-${q}`} onSelect={() => go(p.to)}>
                <p.icon className="mr-2 h-4 w-4" />{p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
