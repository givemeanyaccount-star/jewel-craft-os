import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/ui/number-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UnitNumberField, useWeightUnit } from "@/components/ui/unit-number-field";
import { computeLineTotal, computeNetWeight, gmsWithTola, npr } from "@/lib/format";
import type { CartRow } from "@/pages/POS";

interface SaleItemEditorProps {
  open: boolean;
  row: CartRow | null;
  onOpenChange: (open: boolean) => void;
  onSave: (row: CartRow) => void;
}

/** Full-screen, touch-sized editor for one sale line. Changes stay on this bill. */
export function SaleItemEditor({ open, row, onOpenChange, onSave }: SaleItemEditorProps) {
  const [draft, setDraft] = useState<CartRow | null>(row);
  const [weightUnit] = useWeightUnit();

  useEffect(() => {
    if (open && row) setDraft({ ...row });
  }, [open, row]);

  const totals = useMemo(() => {
    if (!draft) return null;
    const result = computeLineTotal({
      netWeight: draft.weight,
      ratePerGram: draft.rate,
      makingCharge: draft.making_input,
      makingChargeType: draft.making_type,
      wastageType: draft.wastage_type,
      wastageValue: draft.wastage_input,
      stoneValue: draft.stone_value,
      quantity: draft.quantity,
    });
    const wastageWeight = draft.rate > 0 ? result.wastageAmount / draft.rate : 0;
    return { ...result, totalWeight: draft.weight + wastageWeight };
  }, [draft]);

  if (!draft || !totals) return null;

  const patch = (changes: Partial<CartRow>) => setDraft((current) => current ? { ...current, ...changes } : current);
  const save = () => {
    if (!draft.description.trim()) return;
    onSave({
      ...draft,
      description: draft.description.trim(),
      making_charge: totals.making,
      wastage_amount: totals.wastageAmount,
      line_total: totals.lineTotal,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none p-0">
        <DialogHeader className="border-b px-4 py-4 pr-12 text-left">
          <DialogTitle>Edit sale item</DialogTitle>
          <DialogDescription>Changes apply to this bill only, not the stock record.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sale-item-description">Description on bill</Label>
            <Textarea
              id="sale-item-description"
              className="min-h-20 text-base"
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder="Item description"
            />
            {!draft.description.trim() && <p className="text-xs text-destructive">Enter a description before saving.</p>}
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Prices</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className={draft.rate <= 0 ? "text-destructive" : ""}>Rate / {weightUnit === "tola" ? "tola" : "gram"}</Label>
                <UnitNumberField
                  mode="rate"
                  value={draft.rate}
                  inputClassName={`h-11 text-right text-base ${draft.rate <= 0 ? "border-destructive" : ""}`}
                  onChange={(rate) => patch({ rate, rate_manual: true, rate_missing: false })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale-item-stone-value">Stone value</Label>
                <NumberField
                  id="sale-item-stone-value"
                  className="h-11 text-right text-base"
                  value={draft.stone_value}
                  onChange={(stone_value) => patch({ stone_value })}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Weights and charges</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Gross weight</Label>
                <UnitNumberField
                  value={draft.gross_weight}
                  inputClassName="h-11 text-right text-base"
                  onChange={(gross_weight) => patch({ gross_weight, weight: computeNetWeight(gross_weight, draft.stone_weight) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Stone weight</Label>
                <UnitNumberField
                  value={draft.stone_weight}
                  inputClassName="h-11 text-right text-base"
                  onChange={(stone_weight) => patch({ stone_weight, weight: computeNetWeight(draft.gross_weight, stone_weight) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Wastage</Label>
              <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                <NumberField
                  aria-label="Wastage value"
                  className="h-11 text-right text-base"
                  value={draft.wastage_input}
                  onChange={(wastage_input) => patch({ wastage_input })}
                />
                <Select value={draft.wastage_type} onValueChange={(wastage_type) => patch({ wastage_type: wastage_type as CartRow["wastage_type"] })}>
                  <SelectTrigger aria-label="Wastage basis" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percent</SelectItem>
                    <SelectItem value="weight">Weight</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Making charge</Label>
              <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                <NumberField
                  aria-label="Making charge value"
                  className="h-11 text-right text-base"
                  value={draft.making_input}
                  onChange={(making_input) => patch({ making_input })}
                />
                <Select value={draft.making_type} onValueChange={(making_type) => patch({ making_type: making_type as CartRow["making_type"] })}>
                  <SelectTrigger aria-label="Making charge basis" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_gram">Per gram</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="percentage">Percent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sale-item-quantity">Quantity</Label>
              <NumberField
                id="sale-item-quantity"
                decimals={0}
                className="h-11 w-32 text-right text-base"
                value={draft.quantity}
                onChange={(quantity) => patch({ quantity: Math.max(1, Number(quantity) || 1) })}
              />
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 text-sm">
            <div><span className="text-muted-foreground">Net weight</span><div className="font-medium">{gmsWithTola(draft.weight)}</div></div>
            <div><span className="text-muted-foreground">Weight + wastage</span><div className="font-medium">{gmsWithTola(totals.totalWeight)}</div></div>
            <div><span className="text-muted-foreground">Making amount</span><div className="font-medium">{npr(totals.making)}</div></div>
            <div><span className="text-muted-foreground">Wastage amount</span><div className="font-medium">{npr(totals.wastageAmount)}</div></div>
          </div>
        </div>

        <div className="border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Item total</span>
            <span className="text-xl font-semibold tabular-nums">{npr(totals.lineTotal)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="h-12" disabled={!draft.description.trim()} onClick={save}>Save item</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
