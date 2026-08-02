import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check } from "lucide-react";

const CUSTOM = "__custom__";

/**
 * Purity picker: choose from the configured list or type a custom purity
 * (e.g. "21K", "916"). Custom values are passed straight through.
 */
export function PuritySelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
}) {
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const list = options.includes(value) || !value ? options : [...options, value];

  if (custom) {
    return (
      <div className={`flex gap-1 ${className ?? ""}`}>
        <Input autoFocus placeholder="e.g. 21K or 916" value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { onChange(draft.trim()); setCustom(false); } }} />
        <Button type="button" size="icon" variant="secondary"
          onClick={() => { if (draft.trim()) onChange(draft.trim()); setCustom(false); }}>
          <Check className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex gap-1 ${className ?? ""}`}>
      <Select value={value} onValueChange={(v) => { if (v === CUSTOM) { setDraft(""); setCustom(true); } else onChange(v); }}>
        <SelectTrigger className="flex-1"><SelectValue placeholder="Purity" /></SelectTrigger>
        <SelectContent>
          {list.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          <SelectItem value={CUSTOM}>Custom purity…</SelectItem>
        </SelectContent>
      </Select>
      <Button type="button" size="icon" variant="ghost" title="Enter custom purity"
        onClick={() => { setDraft(value ?? ""); setCustom(true); }}>
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}
