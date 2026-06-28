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
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>${item.sku}</title>
      <style>body{font-family:system-ui;padding:16px;text-align:center}
      .tag{display:inline-block;border:1px solid #999;padding:10px;border-radius:6px;width:240px}
      h3{margin:6px 0 2px;font-size:14px}p{margin:2px 0;font-size:11px;color:#555}</style>
      </head><body><div class="tag">
      <img src="${dataUrl}" width="200" />
      <h3>${item.name}</h3>
      <p>${item.sku}</p>
      <p>${item.metal} ${item.purity} · ${item.net_weight}g net</p>
      </div><script>window.print();<\/script></body></html>`);
    w.document.close();
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
