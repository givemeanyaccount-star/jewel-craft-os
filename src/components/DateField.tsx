import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDateMode } from "@/hooks/useDateMode";
import { DateModeToggle } from "@/components/DateModeToggle";
import { adToBSParts, bsToAD, bsMonthDays, BS_MONTHS, toADDate, toBSLong } from "@/lib/nepaliDate";

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

const selectCls =
  "h-10 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

/**
 * Date box that follows the AD/BS switch. Always reads and emits an AD
 * YYYY-MM-DD value, so storage and reports are unaffected.
 */
export function DateField({ value, onChange, min, max, id, className, disabled, clearable = true, showToggle = false, ...rest }: Props) {
  const [mode] = useDateMode();
  const today = toADDate(new Date());
  const parts = adToBSParts(value || "") ;
  const base = parts ?? adToBSParts(today)!;

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = base.y - 10; y <= base.y + 2; y++) out.push(y);
    return out;
  }, [base.y]);

  const toggle = showToggle ? <DateModeToggle compact className="absolute -top-[1.35rem] right-0" /> : null;
  if (mode === "AD") {
    return (
      <div className={cn("relative", className)}>
        {toggle}
        <Input id={id} type="date" value={value} min={min} max={max} disabled={disabled}
          aria-invalid={rest["aria-invalid"]} onChange={(e) => onChange(e.target.value)} />
        {value && <p className="mt-0.5 text-[11px] text-muted-foreground">BS {toBSLong(value)}</p>}
      </div>
    );
  }

  const emit = (y: number, m: number, d: number) => {
    const days = bsMonthDays(y, m);
    let ad = bsToAD(y, m, Math.min(d, days));
    if (max && ad > max) ad = max;
    if (min && ad < min) ad = min;
    onChange(ad);
  };
  const days = bsMonthDays(base.y, base.m);

  return (
    <div className={cn("relative", className)}>
      {toggle}
      <div className={cn("flex gap-1", rest["aria-invalid"] && "rounded-md ring-2 ring-destructive")} id={id}>
        <select aria-label="BS year" className={selectCls} disabled={disabled}
          value={parts ? base.y : ""} onChange={(e) => e.target.value ? emit(Number(e.target.value), base.m, base.d) : onChange("")}>
          {clearable && <option value="">—</option>}
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select aria-label="BS month" className={cn(selectCls, "flex-1")} disabled={disabled || !parts}
          value={parts ? base.m : ""} onChange={(e) => emit(base.y, Number(e.target.value), base.d)}>
          {!parts && <option value="">Month</option>}
          {BS_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select aria-label="BS day" className={selectCls} disabled={disabled || !parts}
          value={parts ? base.d : ""} onChange={(e) => emit(base.y, base.m, Number(e.target.value))}>
          {!parts && <option value="">Day</option>}
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{value ? `AD ${value}` : "No date"}</p>
    </div>
  );
}
