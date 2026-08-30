import * as React from "react";
import { NumberField } from "@/components/ui/number-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { gramsToTola, tolaToGrams, ratePerTola, ratePerGramFromTola } from "@/lib/format";

export type WeightUnit = "g" | "tola";

const STORE_KEY = "jm.weightUnit";

function readUnit(): WeightUnit {
  if (typeof window === "undefined") return "g";
  return localStorage.getItem(STORE_KEY) === "tola" ? "tola" : "g";
}

/** Shared unit preference so every field flips together. */
export function useWeightUnit(): [WeightUnit, (u: WeightUnit) => void] {
  const [unit, setUnitState] = React.useState<WeightUnit>(readUnit);

  React.useEffect(() => {
    const onChange = () => setUnitState(readUnit());
    window.addEventListener("jm-weight-unit", onChange);
    return () => window.removeEventListener("jm-weight-unit", onChange);
  }, []);

  const setUnit = React.useCallback((u: WeightUnit) => {
    localStorage.setItem(STORE_KEY, u);
    window.dispatchEvent(new Event("jm-weight-unit"));
  }, []);

  return [unit, setUnit];
}

export interface UnitNumberFieldProps {
  /** Always the canonical value: grams for weights, rate-per-gram for rates. */
  value: number | null | undefined;
  onChange: (grams: number) => void;
  /** `weight` = grams <-> tola, `rate` = per gram <-> per tola. */
  mode?: "weight" | "rate";
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Hide the g/tola switch (still shows the converted hint). */
  hideToggle?: boolean;
}

/**
 * Numeric field that accepts entry in grams or tola and always emits grams
 * (or rate per gram). Grams remain the stored/primary unit.
 */
export function UnitNumberField({
  value,
  onChange,
  mode = "weight",
  className,
  inputClassName,
  placeholder,
  disabled,
  hideToggle,
}: UnitNumberFieldProps) {
  const [unit, setUnit] = useWeightUnit();
  const isTola = unit === "tola";
  const decimals = mode === "weight" ? (isTola ? 4 : 3) : 2;

  const shown = isTola
    ? mode === "weight"
      ? gramsToTola(value)
      : ratePerTola(value)
    : Number(value ?? 0);

  const handle = (v: number) => {
    if (!isTola) return onChange(v);
    onChange(mode === "weight" ? tolaToGrams(v) : ratePerGramFromTola(v));
  };

  const hint =
    mode === "weight"
      ? isTola
        ? `${Number(value ?? 0).toFixed(3)} g`
        : `${gramsToTola(value).toFixed(4)} tola`
      : isTola
        ? `${Number(value ?? 0).toFixed(2)}/g`
        : `${ratePerTola(value).toFixed(2)}/tola`;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-1">
        <NumberField
          decimals={decimals}
          value={shown}
          onChange={handle}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("flex-1", inputClassName)}
        />
        {!hideToggle && (
          <div className="flex shrink-0 rounded-md border border-border overflow-hidden">
            {(["g", "tola"] as WeightUnit[]).map((u) => (
              <Button
                key={u}
                type="button"
                variant={unit === u ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-none px-2 text-[11px]"
                onClick={() => setUnit(u)}
                disabled={disabled}
              >
                {u}
              </Button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-none">{hint}</p>
    </div>
  );
}
