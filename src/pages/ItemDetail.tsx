import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { npr, gms } from "@/lib/format";
import { getSignedUrls } from "@/lib/storage";
import { Printer, ArrowLeft } from "lucide-react";
import { openPrintPreview } from "@/components/PrintPreview";


export default function ItemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState<any>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("*, categories(name), locations(name)")
        .eq("id", id).single();
      setItem(data);
      if (data?.image_urls?.length) {
        const map = await getSignedUrls("product-images", data.image_urls);
        setImageUrls(Object.values(map));
      }
    })();
  }, [id]);

  useEffect(() => {
    if (item?.qr_code && qrRef.current) {
      QRCode.toCanvas(qrRef.current, item.qr_code, { width: 220, margin: 1 });
    }
  }, [item]);

  if (!item) return <AppLayout title="Item"><p className="text-muted-foreground">Loading...</p></AppLayout>;

  function printTag() {
    const canvas = qrRef.current; if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const logo = `${window.location.origin}/logo.png`;
    const priceLine = `${item.metal.toUpperCase()} · ${item.purity} · ${Number(item.net_weight).toFixed(3)}g net`;
    openPrintPreview({
      title: `Tag ${item.sku}`,
      fileName: `Tag-${item.sku}`,
      page: "tag",
      hidePageNumbers: true,
      css: `
        body { font-family: 'Helvetica Neue', system-ui, sans-serif; color: #111; }
        .tag { padding: 3mm; border: 0.4mm solid #111; border-radius: 2mm; text-align: center; }
        .brand { display:flex; align-items:center; justify-content:center; gap:2mm; border-bottom: 0.2mm solid #ddd; padding-bottom:2mm; }
        .brand img { width: 8mm; height: 8mm; object-fit: contain; }
        .brand span { font-size: 8pt; letter-spacing: 0.15em; font-weight: 600; }
        .name { font-size: 9pt; font-weight: 600; margin: 2mm 0 0.5mm; line-height: 1.2; }
        .meta { font-size: 7pt; color: #555; margin: 0 0 2mm; }
        .qr { margin: 1mm auto; }
        .sku { font-family: 'Courier New', monospace; font-size: 8pt; letter-spacing: 0.05em; margin-top: 1mm; }
        .foot { font-size: 6pt; color: #888; margin-top: 1mm; letter-spacing: 0.1em; text-transform: uppercase; }
      `,
      html: `<div class="tag">
        <div class="brand"><img src="${escapeHtml(logo)}"/><span>JEWELMASTER</span></div>
        <div class="name">${escapeHtml(item.name)}</div>
        <div class="meta">${escapeHtml(priceLine)}</div>
        <img class="qr" src="${escapeHtml(dataUrl)}" width="120" />
        <div class="sku">${escapeHtml(item.sku)}</div>
        <div class="foot">Scan · Verify · Trust</div>
      </div>`,
    });
  }


  return (
    <AppLayout title={item.name} actions={
      <Button size="sm" variant="outline" onClick={() => nav(-1)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
    }>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{item.name}</CardTitle>
            <Badge className="capitalize">{item.status.replace("_", " ")}</Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
              <Field label="SKU" value={item.sku} />
              <Field label="Barcode" value={item.barcode ?? "—"} />
              <Field label="Category" value={item.categories?.name ?? "—"} />
              <Field label="Location" value={item.locations?.name ?? "—"} />
              <Field label="Metal" value={`${item.metal} ${item.purity}`} className="capitalize" />
              <Field label="Gross" value={gms(item.gross_weight)} />
              <Field label="Stone wt" value={gms(item.stone_weight)} />
              <Field label="Net" value={gms(item.net_weight)} />
              <Field label="Fine" value={gms(item.fine_weight)} />
              <Field label="Making" value={`${item.making_charge} (${item.making_charge_type})`} />
              <Field label="Wastage" value={`${item.wastage_value} ${item.wastage_type}`} />
              <Field label="Stone value" value={npr(item.stone_value)} />
            </div>
            {item.description && <p className="mt-4 rounded bg-muted/50 p-3 text-sm">{item.description}</p>}
            {imageUrls.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {imageUrls.map((url) => <img key={url} src={url} className="aspect-square w-full rounded border object-cover" alt="" />)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>QR Tag</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <canvas ref={qrRef} className="rounded border" />
            <div className="text-center text-xs text-muted-foreground">{item.qr_code}</div>
            <Button onClick={printTag} className="w-full"><Printer className="mr-1 h-4 w-4" /> Print Tag</Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function Field({ label, value, className }: { label: string; value: any; className?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"font-medium " + (className ?? "")}>{value}</div>
    </div>
  );
}
