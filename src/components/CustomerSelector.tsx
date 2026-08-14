import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, UserPlus, Check, X } from "lucide-react";
import { CustomerDialog } from "@/components/CustomerDialog";

export interface PickedCustomer { id: string; full_name: string; phone: string | null; }

/**
 * Search existing customers by name/phone, pick one, or create a brand-new one inline
 * via the shared CustomerDialog (same duplicate-checking + camera capture everywhere).
 */
export function CustomerSelector({
  value, onChange, label = "Customer",
}: {
  value: PickedCustomer | null;
  onChange: (c: PickedCustomer | null) => void;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [focused, setFocused] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Show a default list (most recently added/updated customers) the moment the
  // field is focused, so it behaves like a real dropdown instead of a blank box
  // that only responds once you start typing.
  useEffect(() => {
    supabase.from("customers").select("id, full_name, phone").order("updated_at", { ascending: false }).limit(8)
      .then(({ data }) => setRecent(data ?? []));
  }, []);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setMatches([]); return; }
    const { data } = await supabase.from("customers").select("id, full_name, phone").or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    setMatches(data ?? []);
  }

  function pick(c: any) {
    onChange({ id: c.id, full_name: c.full_name, phone: c.phone });
    setMatches([]);
    setQuery("");
    setFocused(false);
  }

  const showList = query.trim().length >= 2 ? matches : recent;
  const listLabel = query.trim().length >= 2 ? "Matches" : "Recent customers";

  if (value) {
    return (
      <div>
        <Label>{label}</Label>
        <div className="flex items-center justify-between rounded border px-3 py-2">
          <div>
            <div className="text-sm font-medium">{value.full_name}</div>
            {value.phone && <div className="text-xs text-muted-foreground">{value.phone}</div>}
          </div>
          <Button size="icon" variant="ghost" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Label>{label}</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8" value={query} onChange={(e) => search(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Click to browse, or type to search..."
        />
      </div>
      {focused && showList.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded border bg-popover shadow-md">
          <div className="border-b px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{listLabel}</div>
          {showList.map((c) => (
            <button key={c.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent" onMouseDown={() => pick(c)}>
              <span>{c.full_name} {c.phone && `· ${c.phone}`}</span>
              <Check className="h-4 w-4 opacity-0" />
            </button>
          ))}
        </div>
      )}
      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setCreateOpen(true)}>
        <UserPlus className="mr-1 h-3.5 w-3.5" /> New Customer
      </Button>

      <CustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        editing={null}
        prefillName={query}
        onSaved={(c) => { setCreateOpen(false); onChange({ id: c.id, full_name: c.full_name, phone: c.phone }); }}
      />
    </div>
  );
}
