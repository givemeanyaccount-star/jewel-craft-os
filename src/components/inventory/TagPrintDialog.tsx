import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, RotateCcw, Save, Image as ImageIcon, ArrowUp, ArrowDown, ArrowLeftRight, Trash2, Plus, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { openPrintPreview } from "@/components/PrintPreview";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PREFIX, DEFAULT_TAG, expandCopies, totalCopies, TAG_FIELD_LABELS, TAG_STOCKS, tagGeom, fieldStyle, fieldText, loadTagDefault, loadTagTemplate, renderTags, saveTagDefault, saveTagTemplate,
  type TagField, type TagFieldStyle, type TagStock, type TagItem, type TagTemplate,
} from "@/lib/tagTemplate";

type Props = {
  items: (TagItem & { qr_code?: string | null; id?: string })[]; trigger?: React.ReactNode | null;
  /** Copies per SKU (default 1). */
  copies?: Record<string, number>;
  onPrinted?: () => void;
  open?: boolean; onOpenChange?: (o: boolean) => void;
};
type Side = "left" | "right";
type Sel = { kind: "field"; f: TagField } | { kind: "qr" } | { kind: "logo" } | null;
const ALL = Object.keys(TAG_FIELD_LABELS) as TagField[];
const SCALE = 8; // screen px per mm in the editor
const ptPx = (pt: number) => pt * 0.3528 * SCALE;

export function TagPrintDialog({ items, trigger, copies, onPrinted, open: openProp, onOpenChange }: Props) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => { setOpenState(o); onOpenChange?.(o); };
  const [t, setT] = useState<TagTemplate>(() => loadTagTemplate());
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Sel>(null);
  const [addTo, setAddTo] = useState<Side>("right");
  const [drag, setDrag] = useState<TagField | null>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all(items.map(async (it) => [it.sku, await QRCode.toDataURL(it.qr_code || it.sku, { margin: 0, width: 160, errorCorrectionLevel: "L" })] as const))
      .then((pairs) => setQrs(Object.fromEntries(pairs)));
  }, [open, items]);

  const update = (p: Partial<TagTemplate>) => setT((cur) => { const n = { ...cur, ...p }; saveTagTemplate(n); return n; });
  const sideOf = (f: TagField): Side | null => (t.left.includes(f) ? "left" : t.right.includes(f) ? "right" : null);
  const hidden = ALL.filter((f) => !sideOf(f));

  /** Place field f on side at index (removes it from wherever it was). */
  const place = (f: TagField, side: Side, index?: number) => {
    const left = t.left.filter((x) => x !== f), right = t.right.filter((x) => x !== f);
    const list = side === "left" ? left : right;
    list.splice(index ?? list.length, 0, f);
    update({ left, right });
  };
  const remove = (f: TagField) => { update({ left: t.left.filter((x) => x !== f), right: t.right.filter((x) => x !== f) }); setSel(null); };
  const move = (f: TagField, d: -1 | 1) => {
    const side = sideOf(f); if (!side) return;
    const list = [...t[side]]; const i = list.indexOf(f), j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; update({ [side]: list } as Partial<TagTemplate>);
  };
  const setStyle = (f: TagField, s: TagFieldStyle) => update({ styles: { ...t.styles, [f]: { ...t.styles?.[f], ...s } } });

  const g = tagGeom(t);
  const switchStock = (stock: TagStock) => { const n = loadTagTemplate(stock); saveTagTemplate(n); setT(n); setSel(null); };
  const uploadLogo = (file?: File) => {
    if (!file) return;
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 200 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      update({ logo: c.toDataURL("image/png"), showLogo: true, logoSide: addTo }); setSel({ kind: "logo" }); URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  const zoneName = (side: Side) => g.zones[side === "left" ? 0 : 1];
  const sample = items[0] ?? { sku: "SAMPLE-001", metal: "gold", purity: "22K", net_weight: 4.25, gross_weight: 4.5 };
  const qr = qrs[sample.sku];

  function print() {
    const list = expandCopies(items, copies);
    const { html, css } = renderTags(list.map((item) => ({ item, qr: qrs[item.sku] })), t);
    openPrintPreview({
      title: list.length === 1 ? `Tag ${items[0].sku}` : `${list.length} tags`,
      fileName: items.length === 1 ? `Tag-${items[0].sku}` : `Tags-${items.length}`,
      pageMm: { width: g.width, height: g.height }, marginMm: 0, hidePageNumbers: true, html, css,
    });
    setOpen(false);
    onPrinted?.();
  }

  const Flap = ({ side }: { side: Side }) => {
    const showQr = t.showQr && t.qrSide === side;
    const showLogo = t.showLogo && !!t.logo && t.logoSide === side;
    return (
      <div
        className={cn("flex h-full items-center gap-[5px] overflow-hidden px-[6px] py-[4px] outline-dashed outline-1 outline-transparent", drag && "outline-primary/50")}
        style={{ width: g.zoneW * SCALE, height: g.zoneH * SCALE }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (drag) { place(drag, side); setSel({ kind: "field", f: drag }); } setDrag(null); }}
        onClick={(e) => { if (e.target === e.currentTarget) { setAddTo(side); setSel(null); } }}
      >
        {showLogo && (
          <button type="button" aria-label="Logo" onClick={() => setSel({ kind: "logo" })}
            className={cn("flex-none rounded-sm ring-offset-1", sel?.kind === "logo" && "ring-2 ring-primary")}
            style={{ width: t.logoMm * SCALE, height: t.logoMm * SCALE }}>
            <img src={t.logo} alt="" className="h-full w-full object-contain" />
          </button>
        )}
        {showQr && (
          <button type="button" aria-label="QR code" onClick={() => setSel({ kind: "qr" })}
            className={cn("flex-none rounded-sm ring-offset-1", sel?.kind === "qr" && "ring-2 ring-primary")}
            style={{ width: t.qrMm * SCALE, height: t.qrMm * SCALE }}>
            {qr ? <img src={qr} alt="" className="h-full w-full [image-rendering:pixelated]" /> : <QrCode className="h-full w-full" />}
          </button>
        )}
        <div className="min-w-0 flex-1" onClick={(e) => { if (e.target === e.currentTarget) { setAddTo(side); setSel(null); } }}>
          {t[side].map((f, i) => {
            const txt = fieldText(f, sample, t); const st = fieldStyle(f, t);
            const active = sel?.kind === "field" && sel.f === f;
            return (
              <div key={f} draggable
                onDragStart={() => setDrag(f)} onDragEnd={() => setDrag(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag && drag !== f) { place(drag, side, i); setSel({ kind: "field", f: drag }); } setDrag(null); }}
                onClick={() => setSel({ kind: "field", f })}
                title={`${TAG_FIELD_LABELS[f]} – click to edit, drag to move`}
                className={cn("cursor-pointer select-none overflow-hidden whitespace-nowrap rounded-[2px] leading-[1.12] hover:bg-primary/10", active && "bg-primary/15 ring-1 ring-primary", !txt && "italic opacity-40")}
                style={{ fontSize: ptPx(st.sizePt), fontWeight: st.bold ? 700 : 400, fontFamily: "Arial, Helvetica, sans-serif" }}>
                {txt ?? `(${TAG_FIELD_LABELS[f]})`}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const selField = sel?.kind === "field" ? sel.f : null;
  const selSide = selField ? sideOf(selField) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(null); }}>
      {trigger !== null && <DialogTrigger asChild>{trigger ?? <Button className="w-full"><Printer className="mr-1 h-4 w-4" /> Print tag</Button>}</DialogTrigger>}
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Design & print tag · {g.label}{items.length > 1 ? ` · ${items.length} items` : ""}</DialogTitle></DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Tag type</span>
          <Select value={t.stock} onValueChange={(v) => switchStock(v as TagStock)}>
            <SelectTrigger className="h-8 w-60"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(TAG_STOCKS) as TagStock[]).map((k) => <SelectItem key={k} value={k}>{TAG_STOCKS[k].label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Editable tag */}
        <div className="overflow-x-auto rounded-md border bg-muted/40 p-4">
          <div className={cn("mx-auto flex bg-background text-foreground shadow-sm", g.vertical && "flex-col")} style={{ width: g.width * SCALE, height: g.height * SCALE, color: "#000", background: "#fff" }}>
            <Flap side="left" />
            {g.vertical
              ? <div className="w-full border-t border-dashed border-muted-foreground/40" />
              : <div className="h-full border-x border-dashed border-muted-foreground/40" style={{ width: g.gap * SCALE }} />}
            <Flap side="right" />
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Tap a detail on the tag to edit it · drag to reorder or move between halves · tap empty space to choose where new details go</p>
        </div>

        {/* Selected item editor */}
        {selField && selSide && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{TAG_FIELD_LABELS[selField]} <span className="text-muted-foreground">· {zoneName(selSide)}</span></p>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" aria-label="Move up" onClick={() => move(selField, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" aria-label="Move down" onClick={() => move(selField, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => place(selField, selSide === "left" ? "right" : "left")}><ArrowLeftRight className="mr-1 h-4 w-4" /> {g.vertical ? "Other half" : "Other flap"}</Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(selField)}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2"><Label className="text-xs">Change to</Label>
                <Select value={selField} onValueChange={(v) => { const nf = v as TagField; const list = [...t[selSide]]; list[list.indexOf(selField)] = nf; update({ [selSide]: list } as Partial<TagTemplate>); setSel({ kind: "field", f: nf }); }}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{[selField, ...hidden].map((f) => <SelectItem key={f} value={f}>{TAG_FIELD_LABELS[f]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Label before value</Label>
                <Input className="h-8" placeholder="none" value={t.styles?.[selField]?.prefix ?? DEFAULT_PREFIX[selField] ?? ""} onChange={(e) => setStyle(selField, { prefix: e.target.value })} />
              </div>
              <div><Label className="text-xs">Size · {t.styles?.[selField]?.sizePt ?? t.fontPt} pt</Label>
                <Slider className="mt-3" min={3} max={12} step={0.5} value={[t.styles?.[selField]?.sizePt ?? t.fontPt]} onValueChange={([v]) => setStyle(selField, { sizePt: v })} />
              </div>
              {selField === "custom" && <div className="sm:col-span-3"><Label className="text-xs">Custom text</Label><Input className="h-8" value={t.customText} onChange={(e) => update({ customText: e.target.value })} /></div>}
              {selField === "shop" && <div className="sm:col-span-3"><Label className="text-xs">Shop name</Label><Input className="h-8" value={t.shopName} onChange={(e) => update({ shopName: e.target.value })} /></div>}
              <div className="flex items-center gap-2"><Switch checked={fieldStyle(selField, t).bold} onCheckedChange={(v) => setStyle(selField, { bold: v })} /><Label className="text-xs">Bold</Label></div>
            </div>
          </div>
        )}
        {sel?.kind === "logo" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <p className="text-sm font-medium">Logo <span className="text-muted-foreground">· {zoneName(t.logoSide)}</span></p>
            <div className="w-40"><Label className="text-xs">Size · {t.logoMm} mm</Label><Slider className="mt-2" min={3} max={11} step={0.5} value={[t.logoMm]} onValueChange={([v]) => update({ logoMm: v })} /></div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" asChild><label className="cursor-pointer"><ImageIcon className="mr-1 h-4 w-4" /> Change<input type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} /></label></Button>
              <Button size="sm" variant="outline" onClick={() => update({ logoSide: t.logoSide === "left" ? "right" : "left" })}><ArrowLeftRight className="mr-1 h-4 w-4" /> {g.vertical ? "Other half" : "Other flap"}</Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => { update({ showLogo: false }); setSel(null); }}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button>
            </div>
          </div>
        )}
        {sel?.kind === "qr" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <p className="text-sm font-medium">QR code <span className="text-muted-foreground">· {zoneName(t.qrSide)}</span></p>
            <div className="w-40"><Label className="text-xs">Size · {t.qrMm} mm</Label><Slider className="mt-2" min={6} max={11} step={0.5} value={[t.qrMm]} onValueChange={([v]) => update({ qrMm: v })} /></div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => update({ qrSide: t.qrSide === "left" ? "right" : "left" })}><ArrowLeftRight className="mr-1 h-4 w-4" /> {g.vertical ? "Other half" : "Other flap"}</Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => { update({ showQr: false }); setSel(null); }}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button>
            </div>
          </div>
        )}

        {/* Add details */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Add to</span>
            <Select value={addTo} onValueChange={(v) => setAddTo(v as Side)}>
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="left">{g.zones[0]}</SelectItem><SelectItem value="right">{g.zones[1]}</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!t.showQr && <Button size="sm" variant="secondary" onClick={() => { update({ showQr: true, qrSide: addTo }); setSel({ kind: "qr" }); }}><Plus className="mr-1 h-3 w-3" /> QR code</Button>}
            {!(t.showLogo && t.logo) && (t.logo
              ? <Button size="sm" variant="secondary" onClick={() => { update({ showLogo: true, logoSide: addTo }); setSel({ kind: "logo" }); }}><Plus className="mr-1 h-3 w-3" /> Logo</Button>
              : <Button size="sm" variant="secondary" asChild><label className="cursor-pointer"><Plus className="mr-1 h-3 w-3" /> Logo<input type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} /></label></Button>)}
            {hidden.map((f) => (
              <Button key={f} size="sm" variant="secondary" draggable onDragStart={() => setDrag(f)} onDragEnd={() => setDrag(null)}
                onClick={() => { place(f, addTo); setSel({ kind: "field", f }); }}>
                <Plus className="mr-1 h-3 w-3" /> {TAG_FIELD_LABELS[f]}
              </Button>
            ))}
            {!hidden.length && t.showQr && <span className="text-xs text-muted-foreground">All details are on the tag.</span>}
          </div>
        </div>

        {/* Whole-tag settings */}
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-4">
          <div><Label className="text-xs">Weight unit</Label>
            <Select value={t.unit} onValueChange={(v) => update({ unit: v as TagTemplate["unit"] })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="g">Grams</SelectItem><SelectItem value="tola">Tola</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Default text size (pt)</Label><Input className="h-8" type="number" step="0.5" min={4} max={9} value={t.fontPt} onChange={(e) => update({ fontPt: Number(e.target.value) || DEFAULT_TAG.fontPt })} /></div>
          <div className="sm:col-span-4"><Label className="text-xs">Scale all text · {Math.round((t.scale || 1) * 100)}%</Label><Slider className="mt-2" min={0.7} max={1.5} step={0.05} value={[t.scale || 1]} onValueChange={([v]) => update({ scale: v })} /></div>
          <div><Label className="text-xs">Shift right (mm)</Label><Input className="h-8" type="number" step="0.5" value={t.offsetXmm} onChange={(e) => update({ offsetXmm: Number(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Shift down (mm)</Label><Input className="h-8" type="number" step="0.5" value={t.offsetYmm} onChange={(e) => update({ offsetYmm: Number(e.target.value) || 0 })} /></div>
        </div>

        <p className="text-xs text-muted-foreground">In the print window choose your DYMO printer, paper “{g.paper}”, scale 100%, no margins. Your design is remembered on this device.</p>
        <div className="flex justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" onClick={() => { const d = loadTagDefault(t.stock); saveTagTemplate(d); setT(d); setSel(null); }}><RotateCcw className="mr-1 h-4 w-4" /> Reset to default</Button>
            <Button variant="outline" onClick={() => { saveTagDefault(t); toast.success(`Saved as default for ${g.label}`); }}><Save className="mr-1 h-4 w-4" /> Save as default</Button>
          </div>
          <Button onClick={print} disabled={!items.length}><Printer className="mr-1 h-4 w-4" /> {items.length ? `Print ${totalCopies(items, copies)} tag${totalCopies(items, copies) > 1 ? "s" : ""}` : "Design saved"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
