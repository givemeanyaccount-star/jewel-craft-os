import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check } from "lucide-react";
import { purityOptions, purityLabel, useAllowCustomPurity } from "@/lib/purity";

const CUSTOM = "__custom__";
const PERCENT = "__percent__";

/**
 * Purity picker: choose from the standard list for the metal, or — when custom
 * purity is enabled in Settings — type a custom purity ("21K", "916") or a
 * purity percentage such as 91.6 which is stored as "91.6%".
 */
export function PuritySelect({
  value,
  onChange,
  options,
  metal,
  className,
  allowPercent = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: string[];
  metal?: string | null;
  className?: string;
  allowPercent?: boolean;
}) {
  const allowCustom = useAllowCustomPurity();
  const [mode, setMode] = useState<null | "custom" | "percent">(null);
  const [draft, setDraft] = useState(value ?? "");

  const base = options ?? purityOptions(metal);
  const list = base.includes(value) || !value ? base : [...base, value];


  if (mode) {
    const isPct = mode === "percent";
    const commit = () => {
      const t = draft.trim().replace(/%$/, "");
      if (t) onChange(isPct ? `${t}%` : t.toUpperCase());
      setMode(null);
    };
    return (
      <div className={`flex gap-1 ${className ?? ""}`}>
        <div className="relative flex-1">
          <Input autoFocus placeholder={isPct ? "e.g. 91.6" : "e.g. 21K or 916"} value={draft}
            inputMode={isPct ? "decimal" : "text"}
            className={isPct ? "pr-7" : undefined}
            onChange={(e) => setDraft(isPct ? e.target.value.replace(/[^\d.]/g, "") : e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
          {isPct && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>}
        </div>
        <Button type="button" size="icon" variant="secondary" onClick={commit}>
          <Check className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex gap-1 ${className ?? ""}`}>
      <Select value={value} onValueChange={(v) => {
        if (v === CUSTOM) { setDraft(""); setMode("custom"); }
        else if (v === PERCENT) { setDraft(""); setMode("percent"); }
        else onChange(v);
      }}>
        <SelectTrigger className="flex-1"><SelectValue placeholder="Purity" /></SelectTrigger>
        <SelectContent>
          {list.map((p) => <SelectItem key={p} value={p}>{purityLabel(p)}</SelectItem>)}
          {allowCustom && <SelectItem value={CUSTOM}>Custom purity…</SelectItem>}
          {allowCustom && allowPercent && <SelectItem value={PERCENT}>Purity percentage…</SelectItem>}
        </SelectContent>
      </Select>
      {allowCustom && (
        <Button type="button" size="icon" variant="ghost" title="Enter custom purity"
          onClick={() => { setDraft(value ?? ""); setMode("custom"); }}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

