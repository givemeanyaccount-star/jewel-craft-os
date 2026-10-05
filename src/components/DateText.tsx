import { useDateMode } from "@/hooks/useDateMode";
import { toADDate, toADDateTime, toBSLong } from "@/lib/nepaliDate";

/** Shows a date in the calendar chosen with the AD/BS switch; hover shows the other one. */
export function DateText({ value, withTime = false, empty = "—" }: { value: string | Date | null | undefined; withTime?: boolean; empty?: string }) {
  const [mode] = useDateMode();
  if (!value) return <>{empty}</>;
  const ad = withTime ? toADDateTime(value) : toADDate(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value);
  const adPlain = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ad;
  const bs = toBSLong(value);
  const time = withTime ? ad.slice(11) : "";
  return mode === "BS"
    ? <span title={`AD ${adPlain}`}>{bs}{time ? ` ${time}` : ""}</span>
    : <span title={`BS ${bs}`}>{adPlain}</span>;
}

/** Plain-string version for CSV/exports and toasts. */
export function formatDateFor(mode: "AD" | "BS", value: string | Date | null | undefined) {
  if (!value) return "";
  return mode === "BS" ? toBSLong(value) : (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toADDate(value));
}
