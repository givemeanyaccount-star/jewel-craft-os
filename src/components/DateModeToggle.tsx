import { useDateMode } from "@/hooks/useDateMode";
import { cn } from "@/lib/utils";

/** AD | BS calendar switch shown in the top bar. */
export function DateModeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useDateMode();
  return (
    <div role="group" aria-label="Calendar" className={cn("flex overflow-hidden rounded-md border text-xs", className)}>
      {(["AD", "BS"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
          title={m === "AD" ? "English dates" : "Nepali (Bikram Sambat) dates"}
          className={cn("px-2 py-1 font-medium transition-colors",
            mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
          {m}
        </button>
      ))}
    </div>
  );
}
