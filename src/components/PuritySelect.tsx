import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check } from "lucide-react";

const CUSTOM = "__custom__";
const PERCENT = "__percent__";

/**
 * Purity picker: choose from the configured list, type a custom purity
 * (e.g. "21K", "916"), or — when `allowPercent` — enter a purity percentage
 * such as 91.6 which is stored as "91.6%".
 */
export function PuritySelect({
  value,
  onChange,
  options,
  className,
  allowPercent = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
  allowPercent?: boolean;
}) {
  const [mode, setMode] = useState<null | "custom" | "percent">(null);
  const [draft, setDraft] = useState(value ?? "");

  const list = options.includes(value) || !value ? options : [...options, value];

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
          {list.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          <SelectItem value={CUSTOM}>Custom purity…</SelectItem>
          {allowPercent && <SelectItem value={PERCENT}>Purity percentage…</SelectItem>}
        </SelectContent>
      </Select>
      <Button type="button" size="icon" variant="ghost" title="Enter custom purity"
        onClick={() => { setDraft(value ?? ""); setMode("custom"); }}>
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}

