import { useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { adToBSParts, bsToAD, bsMonthDays, BS_MONTHS, toADDate } from "@/lib/nepaliDate";

interface Props {
  value: string;
  onSelect: (ad: string) => void;
  min?: string;
  max?: string;
  clearable?: boolean;
}

const YEARS = Array.from({ length: 91 }, (_, i) => 2000 + i);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const selectorClass = "h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A real BS month grid; all selections are emitted as AD date-only values. */
export function BSCalendar({ value, onSelect, min, max, clearable = true }: Props) {
  const today = toADDate(new Date());
  const base = adToBSParts(value) ?? adToBSParts(today) ?? { y: 2083, m: 0, d: 1 };
  const [view, setView] = useState({ y: base.y, m: base.m });
  const [focusDate, setFocusDate] = useState(value || today);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const first = bsToAD(view.y, view.m, 1);
  const offset = first ? parseISO(first).getDay() : 0;
  const days = bsMonthDays(view.y, view.m);
  const permitted = (ad: string) => !!ad && (!min || ad >= min) && (!max || ad <= max);
  const monthAllowed = (y: number, m: number) => {
    const start = bsToAD(y, m, 1);
    const end = bsToAD(y, m, bsMonthDays(y, m));
    return !!start && !!end && (!min || end >= min) && (!max || start <= max);
  };
  const adjacent = (delta: number) => {
    const m = view.m + delta;
    return { y: view.y + (m < 0 ? -1 : m > 11 ? 1 : 0), m: (m + 12) % 12 };
  };
  const previous = adjacent(-1);
  const next = adjacent(1);
  const dates = Array.from({ length: days }, (_, i) => bsToAD(view.y, view.m, i + 1));
  const activeDate = dates.includes(focusDate) && permitted(focusDate)
    ? focusDate : dates.find((ad) => permitted(ad));

  function moveFocus(ad: string, key: string) {
    const shifts: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const weekday = parseISO(ad).getDay();
    const delta = key === "Home" ? -weekday : key === "End" ? 6 - weekday : shifts[key];
    if (delta === undefined) return;
    const target = format(addDays(parseISO(ad), delta), "yyyy-MM-dd");
    const parts = adToBSParts(target);
    if (!parts || !permitted(target)) return;
    setView({ y: parts.y, m: parts.m });
    setFocusDate(target);
    requestAnimationFrame(() => dayRefs.current.get(target)?.focus());
  }

  return (
    <div className="pointer-events-auto w-72 max-w-full p-3" aria-label="Nepali calendar">
      <div className="mb-3 flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          aria-label="Previous Nepali month" title="Previous month" disabled={!monthAllowed(previous.y, previous.m)}
          onClick={() => setView(previous)}><ChevronLeft /></Button>
        <select aria-label="BS month" className={cn(selectorClass, "flex-1")} value={view.m}
          onChange={(e) => setView({ ...view, m: Number(e.target.value) })}>
          {BS_MONTHS.map((month, m) => <option key={month} value={m} disabled={!monthAllowed(view.y, m)}>{month}</option>)}
        </select>
        <select aria-label="BS year" className={selectorClass} value={view.y}
          onChange={(e) => {
            const y = Number(e.target.value);
            const m = monthAllowed(y, view.m) ? view.m : BS_MONTHS.findIndex((_, index) => monthAllowed(y, index));
            if (m >= 0) setView({ y, m });
          }}>
          {YEARS.map((y) => <option key={y} value={y} disabled={!BS_MONTHS.some((_, m) => monthAllowed(y, m))}>{y}</option>)}
        </select>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          aria-label="Next Nepali month" title="Next month" disabled={!monthAllowed(next.y, next.m)}
          onClick={() => setView(next)}><ChevronRight /></Button>
      </div>
      <div role="grid" aria-label={`${view.y} ${BS_MONTHS[view.m]}`} className="space-y-1">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((day) => <span role="columnheader" key={day} className="py-1 text-center text-[11px] text-muted-foreground">{day}</span>)}
        </div>
        {Array.from({ length: Math.ceil((offset + days) / 7) }, (_, week) => (
          <div role="row" className="grid grid-cols-7" key={week}>
            {Array.from({ length: 7 }, (_, column) => {
              const day = week * 7 + column - offset + 1;
              if (day < 1 || day > days) return <span role="gridcell" key={column} />;
              const ad = dates[day - 1];
              return (
                <span role="gridcell" key={column} aria-selected={ad === value}>
                  <Button type="button" variant={ad === value ? "default" : "ghost"}
                    className={cn("h-9 w-full p-0 font-normal", ad === today && ad !== value && "bg-accent text-accent-foreground")}
                    ref={(node) => { if (node) dayRefs.current.set(ad, node); else dayRefs.current.delete(ad); }}
                    aria-label={`${view.y} ${BS_MONTHS[view.m]} ${day}`} aria-current={ad === today ? "date" : undefined}
                    disabled={!permitted(ad)} tabIndex={ad === activeDate ? 0 : -1}
                    onClick={() => onSelect(ad)} onFocus={() => setFocusDate(ad)}
                    onKeyDown={(e) => {
                      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
                        e.preventDefault(); moveFocus(ad, e.key);
                      }
                    }}>{day}</Button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-2">
        <Button type="button" size="sm" variant="ghost" disabled={!permitted(today)} onClick={() => onSelect(today)}>Today</Button>
        {clearable && <Button type="button" size="sm" variant="ghost" onClick={() => onSelect("")}><X className="h-3 w-3" /> Clear</Button>}
      </div>
    </div>
  );
}