import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface Karigar { id: string; name: string; phone?: string | null; specialty?: string | null; }

// Fires once per mount; components can also call refresh() to re-pull after an external add.
export function useKarigars() {
  const [karigars, setKarigars] = useState<Karigar[]>([]);
  const refresh = () => {
    supabase.from("karigars").select("id, name, phone, specialty").order("name").then(({ data }) => setKarigars(data ?? []));
  };
  useEffect(() => { refresh(); }, []);
  return { karigars, refresh };
}

/**
 * Combobox for picking a karigar. If the typed name doesn't match anyone in the list,
 * shows an "Add {name} as new karigar" option that creates the karigar record on the fly.
 */
export function KarigarSelect({
  karigars, value, valueName, onChange, onKarigarCreated,
}: {
  karigars: Karigar[];
  value?: string | null;               // karigar_id
  valueName?: string | null;           // free-text fallback name (when not in list)
  onChange: (karigarId: string | null, name: string) => void;
  onKarigarCreated?: (k: Karigar) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = karigars.find((k) => k.id === value);
  const label = selected?.name || valueName || "Select karigar";
  const exactMatch = karigars.some((k) => k.name.toLowerCase() === query.trim().toLowerCase());

  async function createNew() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.from("karigars").insert({ name }).select("id, name").single();
      if (error) throw error;
      toast.success(`Added karigar "${name}"`);
      onKarigarCreated?.(data as Karigar);
      onChange(data.id, data.name);
      setOpen(false);
      setQuery("");
    } catch (e: any) { toast.error(e.message); } finally { setCreating(false); }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="flex items-center gap-2 truncate"><User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search or type a new name..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty className="p-0">
              {query.trim() && (
                <Button variant="ghost" className="w-full justify-start gap-2 px-2" disabled={creating} onClick={createNew}>
                  <Plus className="h-4 w-4" /> Add "{query.trim()}" as new karigar
                </Button>
              )}
            </CommandEmpty>
            <CommandGroup>
              {karigars
                .filter((k) => k.name.toLowerCase().includes(query.trim().toLowerCase()))
                .map((k) => (
                  <CommandItem key={k.id} value={k.id} onSelect={() => { onChange(k.id, k.name); setOpen(false); setQuery(""); }}>
                    <Check className={cn("mr-2 h-4 w-4", value === k.id ? "opacity-100" : "opacity-0")} />
                    <div>
                      <div>{k.name}</div>
                      {k.specialty && <div className="text-xs text-muted-foreground">{k.specialty}</div>}
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
            {query.trim() && !exactMatch && (
              <div className="border-t p-1">
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2" disabled={creating} onClick={createNew}>
                  <Plus className="h-4 w-4" /> Add "{query.trim()}" as new karigar
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
