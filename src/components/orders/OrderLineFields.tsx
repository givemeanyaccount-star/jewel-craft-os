import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NumberField } from "@/components/ui/number-field";
import { UnitNumberField } from "@/components/ui/unit-number-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import { npr, computeNetWeight } from "@/lib/format";
import { estimateOrderLine } from "@/lib/orders";
import { KarigarSelect } from "@/components/KarigarSelect";
import { PuritySelect } from "@/components/PuritySelect";
import { ImageCaptureButton } from "@/components/ImageCapture";
import { getSignedUrls } from "@/lib/storage";

const METALS = ["gold", "silver"];

export interface OrderLine {
  key: string;
  description: string;
  notes?: string;
  category_id: string | null;
  metal: string;
  purity: string;
  quantity: number;
  expected_gross_weight: number;
  expected_stone_weight: number;
  rate: number;
  rate_date: string | null;
  making_input: number;
  making_type: string;
  wastage_input: number;
  wastage_type: string;
  stone_value: number;
  karigar_id: string | null;
  karigar_name: string;
  /** already-uploaded storage paths */
  photos: string[];
  /** newly captured files, uploaded on save */
  newFiles: File[];
}

export function blankOrderLine(rateDate: string): OrderLine {
  return {
    key: crypto.randomUUID(),
    description: "", notes: "",
    category_id: null, metal: "gold", purity: "22K", quantity: 1,
    expected_gross_weight: 0, expected_stone_weight: 0,
    rate: 0, rate_date: rateDate,
    making_input: 0, making_type: "per_gram",
    wastage_input: 0, wastage_type: "percentage",
    stone_value: 0, karigar_id: null, karigar_name: "",
    photos: [], newFiles: [],
  };
}

/** Map a saved order_items row into the editable line shape. */
export function lineFromRow(row: any): OrderLine {
  return {
    key: row.id,
    description: row.description ?? "",
    notes: row.notes ?? "",
    category_id: row.category_id ?? null,
    metal: row.metal ?? "gold",
    purity: row.purity ?? "22K",
    quantity: Number(row.quantity ?? 1),
    expected_gross_weight: Number(row.expected_gross_weight ?? 0),
    expected_stone_weight: Number(row.expected_stone_weight ?? 0),
    rate: Number(row.rate ?? 0),
    rate_date: row.rate_date ?? null,
    making_input: Number(row.making_input ?? 0),
    making_type: row.making_type ?? "per_gram",
    wastage_input: Number(row.wastage_input ?? 0),
    wastage_type: row.wastage_type ?? "percentage",
    stone_value: Number(row.stone_value ?? 0),
    karigar_id: row.karigar_id ?? null,
    karigar_name: row.karigar_name ?? "",
    photos: (row.photos ?? []) as string[],
    newFiles: [],
  };
}

export function lineNet(l: OrderLine) {
  return computeNetWeight(Number(l.expected_gross_weight || 0), Number(l.expected_stone_weight || 0));
}

export function lineEstimate(l: OrderLine) {
  return estimateOrderLine({ ...l, expected_net_weight: lineNet(l) } as any);
}

/** Thumbnails for stored photo paths + freshly captured files. */
export function OrderPhotoStrip({ paths, files, onRemovePath, onRemoveFile, size = 56 }: {
  paths: string[]; files?: File[];
  onRemovePath?: (p: string) => void; onRemoveFile?: (i: number) => void; size?: number;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!paths.length) return setUrls({});
    getSignedUrls("product-images", paths).then(setUrls);
  }, [paths.join("|")]);

  const previews = (files ?? []).map((f) => URL.createObjectURL(f));
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews.join("|")]);

  if (!paths.length && !(files ?? []).length) return null;
  const s = { width: size, height: size };
  return (
    <div className="flex flex-wrap gap-2">
      {paths.map((p) => (
        <div key={p} className="relative">
          {urls[p]
            ? <img src={urls[p]} alt="Order item reference" style={s} className="rounded border object-cover" />
            : <div style={s} className="rounded border bg-muted" />}
          {onRemovePath && (
            <button type="button" onClick={() => onRemovePath(p)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {(files ?? []).map((f, i) => (
        <div key={`${f.name}-${i}`} className="relative">
          <img src={previews[i]} alt="New reference" style={s} className="rounded border object-cover" />
          {onRemoveFile && (
            <button type="button" onClick={() => onRemoveFile(i)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** The single line editor shared by order booking and order-line editing. */
export function OrderLineFields({ line, patch, cats, karigars, onKarigarCreated, onFetchRate, minQuantity = 1 }: {
  line: OrderLine;
  patch: (p: Partial<OrderLine>) => void;
  cats: any[];
  karigars: any[];
  onKarigarCreated?: () => void;
  onFetchRate?: () => void;
  minQuantity?: number;
}) {
  const net = lineNet(line);
  const est = lineEstimate(line);

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <Label>Description *</Label>
        <Input value={line.description} onChange={(e) => patch({ description: e.target.value })} placeholder="e.g. Custom bridal necklace" />
      </div>
      <div>
        <Label>Category</Label>
        <Select value={line.category_id ?? "none"} onValueChange={(v) => patch({ category_id: v === "none" ? null : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Karigar</Label>
        <KarigarSelect karigars={karigars} value={line.karigar_id} valueName={line.karigar_name}
          onChange={(id, name) => patch({ karigar_id: id, karigar_name: name })}
          onKarigarCreated={onKarigarCreated} />
      </div>
      <div>
        <Label>Metal</Label>
        <Select value={line.metal} onValueChange={(v) => patch({ metal: v, purity: v === "silver" ? "999" : "22K" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{METALS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Purity</Label>
        <PuritySelect metal={line.metal} value={line.purity} onChange={(v) => patch({ purity: v })} allowPercent />
      </div>
      <div>
        <Label>Expected gross wt (g)</Label>
        <UnitNumberField value={line.expected_gross_weight} onChange={(v) => patch({ expected_gross_weight: v })} />
      </div>
      <div>
        <Label>Stone wt (g)</Label>
        <UnitNumberField value={line.expected_stone_weight} onChange={(v) => patch({ expected_stone_weight: v })} />
      </div>
      <div>
        <Label>Rate/g</Label>
        <div className="flex gap-1">
          <UnitNumberField mode="rate" value={line.rate} onChange={(v) => patch({ rate: v })} inputClassName="text-right" />
          {onFetchRate && <Button type="button" size="sm" variant="outline" onClick={onFetchRate}>Fetch</Button>}
        </div>
      </div>
      <div>
        <Label>Making</Label>
        <div className="flex gap-1">
          <NumberField value={line.making_input} onChange={(v) => patch({ making_input: v })} className="text-right" />
          <Select value={line.making_type} onValueChange={(v) => patch({ making_type: v })}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="per_gram">/gram</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="percentage">%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Wastage</Label>
        <div className="flex gap-1">
          <NumberField value={line.wastage_input} onChange={(v) => patch({ wastage_input: v })} className="text-right" />
          <Select value={line.wastage_type} onValueChange={(v) => patch({ wastage_type: v })}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">%</SelectItem>
              <SelectItem value="weight">Weight</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Stone value</Label><NumberField value={line.stone_value} onChange={(v) => patch({ stone_value: v })} className="text-right" /></div>
      <div>
        <Label>Qty</Label>
        <NumberField decimals={0} value={line.quantity} onChange={(v) => patch({ quantity: Math.max(minQuantity, v || 1) })} />
        {minQuantity > 1 && <p className="mt-1 text-[11px] text-muted-foreground">Cannot go below {minQuantity} (already received)</p>}
      </div>

      <div className="sm:col-span-4">
        <Label>Design / detail notes</Label>
        <Textarea rows={2} value={line.notes ?? ""} onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Stone details, finish, engraving, size, customer instructions..." />
      </div>

      <div className="sm:col-span-4 space-y-2">
        <div className="flex items-center gap-2">
          <ImageCaptureButton label="Add reference photo" title="Reference photo"
            onCapture={(f) => patch({ newFiles: [...line.newFiles, f] })} />
          <span className="text-xs text-muted-foreground">{line.photos.length + line.newFiles.length} photo(s)</span>
        </div>
        <OrderPhotoStrip
          paths={line.photos}
          files={line.newFiles}
          onRemovePath={(p) => patch({ photos: line.photos.filter((x) => x !== p) })}
          onRemoveFile={(i) => patch({ newFiles: line.newFiles.filter((_, ix) => ix !== i) })}
        />
      </div>

      <div className="sm:col-span-4 flex items-end justify-end text-sm">
        <span className="text-muted-foreground">Net {net.toFixed(3)} g · Estimate&nbsp;</span>
        <span className="font-semibold">{npr(est)}</span>
      </div>
    </div>
  );
}
