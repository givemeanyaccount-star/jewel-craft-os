import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const PALETTES = [
  { id: "emerald", label: "Heritage Emerald", swatch: "hsl(158 64% 22%)" },
  { id: "noir", label: "Noir & Gold", swatch: "hsl(0 0% 10%)" },
  { id: "navy", label: "Navy Trust", swatch: "hsl(219 58% 18%)" },
  { id: "copper", label: "Burnished Copper", swatch: "hsl(22 68% 38%)" },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];
const KEY = "jm-palette";
const CLASSES = PALETTES.map((p) => `theme-${p.id}`);

export function applyPalette(id: PaletteId) {
  const root = document.documentElement;
  root.classList.remove(...CLASSES);
  root.classList.add(`theme-${id}`);
}

export function initPalette() {
  const stored = (localStorage.getItem(KEY) as PaletteId | null) ?? "emerald";
  applyPalette(PALETTES.some((p) => p.id === stored) ? stored : "emerald");
}

export function ThemeSwitcher({ className }: { className?: string }) {
  const [active, setActive] = useState<PaletteId>("emerald");

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as PaletteId | null;
    if (stored && PALETTES.some((p) => p.id === stored)) setActive(stored);
  }, []);

  function pick(id: PaletteId) {
    setActive(id);
    localStorage.setItem(KEY, id);
    applyPalette(id);
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-full border border-border/40 bg-card/40 px-2 py-1 opacity-40 transition-opacity hover:opacity-100",
        className
      )}
    >
      {PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.label}
          aria-label={p.label}
          onClick={() => pick(p.id)}
          style={{ backgroundColor: p.swatch }}
          className={cn(
            "h-3.5 w-3.5 rounded-full transition-transform hover:scale-125",
            active === p.id && "ring-2 ring-ring ring-offset-1 ring-offset-background"
          )}
        />
      ))}
    </div>
  );
}
