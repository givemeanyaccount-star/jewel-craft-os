import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Round a value to a fixed number of decimals (half-up, float-safe). */
export function roundTo(value: number, decimals: number) {
  if (!isFinite(value)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * f) / f;
}

function display(value: number | string | null | undefined, decimals: number) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!isFinite(n) || n === 0) return "";
  return String(roundTo(n, decimals));
}

/** Keep only a valid decimal number, capped at `decimals` fraction digits. */
function sanitize(raw: string, decimals: number, allowNegative: boolean) {
  let s = raw.replace(/[^0-9.\-]/g, "");
  const neg = allowNegative && s.startsWith("-");
  s = s.replace(/-/g, "");
  const parts = s.split(".");
  s = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : parts[0];
  const [int, frac] = s.split(".");
  if (frac !== undefined) s = decimals > 0 ? `${int}.${frac.slice(0, decimals)}` : int;
  return (neg ? "-" : "") + s;
}

export interface NumberFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number | string | null | undefined;
  /** Called with the parsed numeric value (0 when the field is cleared). */
  onChange: (value: number) => void;
  /** Max fraction digits — 3 for weights, 2 for amounts. */
  decimals?: number;
  allowNegative?: boolean;
}

/**
 * Numeric input that shows an empty box instead of a stray leading `0`,
 * limits decimal places (3 for weights, 2 for money) and rounds on blur.
 */
export const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(
  ({ value, onChange, decimals = 2, allowNegative = false, className, onBlur, onFocus, ...props }, ref) => {
    const [text, setText] = React.useState(() => display(value, decimals));
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
      if (!focused) setText(display(value, decimals));
    }, [value, decimals, focused]);

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        className={cn(className)}
        value={text}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onChange={(e) => {
          const s = sanitize(e.target.value, decimals, allowNegative);
          setText(s);
          const n = s === "" || s === "-" || s === "." ? 0 : Number(s);
          onChange(isFinite(n) ? n : 0);
        }}
        onBlur={(e) => {
          setFocused(false);
          const n = text === "" ? 0 : Number(text);
          const rounded = isFinite(n) ? roundTo(n, decimals) : 0;
          setText(display(rounded, decimals));
          if (rounded !== Number(value ?? 0)) onChange(rounded);
          onBlur?.(e);
        }}
      />
    );
  }
);
NumberField.displayName = "NumberField";
