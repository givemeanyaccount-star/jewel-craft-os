import { NumberField } from "@/components/ui/number-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Inline wastage / making editors for a cart or quotation line.
 *
 * Counter staff often need to tweak wastage or making on the bill itself
 * (a bargain, a promo, a mistyped tag) without touching the inventory record.
 * Values here only affect the document being prepared.
 */
export function LineChargeFields({
  wastageInput, wastageType, makingInput, makingType, onChange,
}: {
  wastageInput: number;
  wastageType: string;
  makingInput: number;
  makingType: string;
  onChange: (patch: {
    wastage_input?: number; wastage_type?: string;
    making_input?: number; making_type?: string;
  }) => void;
}) {
  return (
    <>
      <div className="space-y-0.5">
        <div className="text-muted-foreground">Wastage</div>
        <div className="flex gap-1">
          <NumberField className="h-8 w-20 text-right" value={wastageInput}
            onChange={(v) => onChange({ wastage_input: v })} />
          <Select value={wastageType} onValueChange={(v) => onChange({ wastage_type: v })}>
            <SelectTrigger className="h-8 w-[86px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">%</SelectItem>
              <SelectItem value="weight">Weight</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-0.5">
        <div className="text-muted-foreground">Making</div>
        <div className="flex gap-1">
          <NumberField className="h-8 w-20 text-right" value={makingInput}
            onChange={(v) => onChange({ making_input: v })} />
          <Select value={makingType} onValueChange={(v) => onChange({ making_type: v })}>
            <SelectTrigger className="h-8 w-[86px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="per_gram">/gram</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="percentage">%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
