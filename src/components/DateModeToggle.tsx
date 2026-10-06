import { useDateMode } from "@/hooks/useDateMode";
import { cn } from "@/lib/utils";

/** AD | BS calendar switch shown in the top bar. */
export function DateModeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [mode, setMode] = useDateMode();
  return (
    <div role="group" aria-label="Calendar" className={cn("flex overflow-hidden rounded-md border text-xs", className)}>
      {(["AD", "BS"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
          title={m === "AD" ? "English dates" : "Nepali (Bikram Sambat) dates"}
          className={cn(compact ? "px-1.5 py-0 text-[10px] leading-4 font-medium transition-colors" : "px-2 py-1 font-medium transition-colors",
            mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
          {m}
        </button>
      ))}
    </div>
  );
}
