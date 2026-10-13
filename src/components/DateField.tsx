import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { BSCalendar } from "@/components/BSCalendar";
import { cn } from "@/lib/utils";
import { useDateMode } from "@/hooks/useDateMode";
import { DateModeToggle } from "@/components/DateModeToggle";
import { toBSLong } from "@/lib/nepaliDate";

interface Props {
  value: string;
  onChange: (adDate: string) => void;
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  /** Allow clearing the date (shows an empty choice in BS mode). */
  clearable?: boolean;
  /** Show the AD | BS switch at the right of the label row above this box. */
  showToggle?: boolean;
}

/**
 * Date box that follows the AD/BS switch. Always reads and emits an AD
 * YYYY-MM-DD value, so storage and reports are unaffected.
 */
export function DateField({ value, onChange, min, max, id, className, disabled, clearable = true, showToggle = false, ...rest }: Props) {
  const [mode] = useDateMode();
  const [open, setOpen] = useState(false);
  const toggle = showToggle ? <div className="mb-1 flex justify-end"><DateModeToggle compact /></div> : null;
  if (mode === "AD") {
    return (
      <div className={cn("min-w-0", className)}>
        {toggle}
        <Input id={id} type="date" value={value} min={min} max={max} disabled={disabled}
          aria-invalid={rest["aria-invalid"]} onChange={(e) => onChange(e.target.value)} />
        {value && <p className="mt-0.5 text-[11px] text-muted-foreground">BS {toBSLong(value)}</p>}
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      {toggle}
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={rest["aria-invalid"]}
            aria-label={value ? `Nepali date ${toBSLong(value)}` : "Pick Nepali date"}
            className={cn("w-full min-w-0 justify-start px-3 text-left font-normal", !value && "text-muted-foreground",
              rest["aria-invalid"] && "ring-2 ring-destructive")}>
            <CalendarIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{value ? toBSLong(value) : "Pick Nepali date"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="pointer-events-auto w-auto max-w-[calc(100vw-1rem)] p-0">
          <BSCalendar value={value} min={min} max={max} clearable={clearable}
            onSelect={(ad) => { onChange(ad); setOpen(false); }} />
        </PopoverContent>
      </Popover>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{value ? `AD ${value}` : "No date"}</p>
    </div>
  );
}
