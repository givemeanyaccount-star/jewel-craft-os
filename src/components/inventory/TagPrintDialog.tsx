import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Printer, RotateCcw, ArrowLeftRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { openPrintPreview } from "@/components/PrintPreview";
import {
  DEFAULT_TAG, TAG_FIELD_LABELS, TAG_MM, loadTagTemplate, renderTags, saveTagTemplate,
  type TagField, type TagItem, type TagTemplate,
} from "@/lib/tagTemplate";

type Props = { items: (TagItem & { qr_code?: string | null })[]; trigger?: React.ReactNode };
const ALL = Object.keys(TAG_FIELD_LABELS) as TagField[];

export function TagPrintDialog({ items, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<TagTemplate>(loadTagTemplate);
  const [qrs, setQrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    Promise.all(items.map(async (it) => [it.sku, await QRCode.toDataURL(it.qr_code || it.sku, { margin: 0, width: 160, errorCorrectionLevel: "L" })] as const))
      .then((pairs) => setQrs(Object.fromEntries(pairs)));
  }, [open, items]);

  const update = (p: Partial<TagTemplate>) => setT((cur) => { const n = { ...cur, ...p }; saveTagTemplate(n); return n; });
  const sideOf = (f: TagField) => (t.left.includes(f) ? "left" : t.right.includes(f) ? "right" : "off");
  const setSide = (f: TagField, side: string) => {
    const left = t.left.filter((x) => x !== f), right = t.right.filter((x) => x !== f);
    if (side === "left") left.push(f); if (side === "right") right.push(f);
    update({ left, right });
  };

  const preview = useMemo(() => renderTags(items.slice(0, 1).map((item) => ({ item, qr: qrs[item.sku] })), t), [items, qrs, t]);
  // Scale mm to screen for the preview.
  const scale = 6;

  function print() {
    const { html, css } = renderTags(items.map((item) => ({ item, qr: qrs[item.sku] })), t);
    openPrintPreview({
      title: items.length === 1 ? `Tag ${items[0].sku}` : `${items.length} tags`,
      fileName: items.length === 1 ? `Tag-${items[0].sku}` : `Tags-${items.length}`,
      pageMm: { width: TAG_MM.width, height: TAG_MM.height }, marginMm: 0, hidePageNumbers: true, html, css,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button className="w-full"><Printer className="mr-1 h-4 w-4" /> Print tag</Button>}</DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Print jewellery tag · DYMO 30373{items.length > 1 ? ` · ${items.length} items` : ""}</DialogTitle></DialogHeader>

        <div className="overflow-x-auto rounded-md border bg-muted/40 p-4">
          <div className="relative mx-auto bg-background shadow-sm" style={{ width: TAG_MM.width * scale, height: TAG_MM.height * scale }}>
            <style>{preview.css.replace(/@page[^}]*}/, "").replace(/html, body[^}]*}/, "").replace(/body \{[^}]*}/, "")}</style>
            <div style={{ fontFamily: "Arial, sans-serif", color: "#000", zoom: scale / 3.78 }} dangerouslySetInnerHTML={{ __html: preview.html }} />
            <div className="pointer-events-none absolute inset-y-0 border-x border-dashed border-muted-foreground/40" style={{ left: TAG_MM.flap * scale, width: (TAG_MM.width - TAG_MM.flap * 2) * scale }} />
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Front flap · fold loop · back flap (shown larger than actual)</p>
        </div>

        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {ALL.map((f) => (
            <div key={f} className="flex items-center justify-between gap-2">
              <Label className="text-sm">{TAG_FIELD_LABELS[f]}</Label>
              <Select value={sideOf(f)} onValueChange={(v) => setSide(f, v)}>
                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="left">Front</SelectItem><SelectItem value="right">Back</SelectItem><SelectItem value="off">Hidden</SelectItem></SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
          <div className="flex items-center justify-between gap-2 sm:col-span-1">
            <Label>QR code</Label>
            <div className="flex items-center gap-1">
              <Switch checked={t.showQr} onCheckedChange={(v) => update({ showQr: v })} />
              <Button type="button" size="icon" variant="ghost" aria-label="Move QR to other flap" disabled={!t.showQr} onClick={() => update({ qrSide: t.qrSide === "left" ? "right" : "left" })}><ArrowLeftRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div><Label className="text-xs">Weight unit</Label>
            <Select value={t.unit} onValueChange={(v) => update({ unit: v as TagTemplate["unit"] })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="g">Grams</SelectItem><SelectItem value="tola">Tola</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Text size (pt)</Label><Input className="h-8" type="number" step="0.5" min={4} max={9} value={t.fontPt} onChange={(e) => update({ fontPt: Number(e.target.value) || DEFAULT_TAG.fontPt })} /></div>
          <div><Label className="text-xs">Shop name (optional field)</Label><Input className="h-8" value={t.shopName} onChange={(e) => update({ shopName: e.target.value })} /></div>
          <div><Label className="text-xs">Shift right (mm)</Label><Input className="h-8" type="number" step="0.5" value={t.offsetXmm} onChange={(e) => update({ offsetXmm: Number(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Shift down (mm)</Label><Input className="h-8" type="number" step="0.5" value={t.offsetYmm} onChange={(e) => update({ offsetYmm: Number(e.target.value) || 0 })} /></div>
        </div>

        <p className="text-xs text-muted-foreground">In the print window choose your DYMO printer, paper “30373 Barbell”, scale 100%, no margins. Your layout is remembered on this device.</p>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => { saveTagTemplate(DEFAULT_TAG); setT(DEFAULT_TAG); }}><RotateCcw className="mr-1 h-4 w-4" /> Reset to default</Button>
          <Button onClick={print} disabled={!items.length}><Printer className="mr-1 h-4 w-4" /> Print {items.length > 1 ? `${items.length} tags` : "tag"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
