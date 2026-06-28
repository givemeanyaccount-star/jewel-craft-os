import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ScanQR() {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");

  async function start() {
    if (!ref.current) return;
    const id = "qr-reader";
    ref.current.id = id;
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;
    try {
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScan, () => {});
      setScanning(true);
    } catch (e: any) {
      toast.error("Camera access denied or unavailable");
    }
  }

  async function stop() {
    try { await scannerRef.current?.stop(); await scannerRef.current?.clear(); } catch {}
    setScanning(false);
  }

  useEffect(() => () => { stop(); }, []);

  async function onScan(text: string) {
    await stop();
    await lookup(text);
  }

  async function lookup(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const { data } = await supabase
      .from("inventory_items")
      .select("id")
      .or(`qr_code.eq.${trimmed},sku.eq.${trimmed},barcode.eq.${trimmed}`)
      .maybeSingle();
    if (data?.id) nav(`/inventory/${data.id}`);
    else toast.error("No item found for: " + trimmed);
  }

  return (
    <AppLayout title="Scan QR / Barcode">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Camera Scan</CardTitle></CardHeader>
          <CardContent>
            <div ref={ref} className="aspect-square w-full overflow-hidden rounded border bg-muted" />
            <div className="mt-3 flex gap-2">
              {!scanning ? <Button onClick={start} className="flex-1">Start camera</Button>
                         : <Button variant="outline" onClick={stop} className="flex-1">Stop</Button>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Manual entry</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Type or paste the SKU / barcode / QR code.</p>
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. JM-12345678" onKeyDown={(e) => { if (e.key === "Enter") lookup(manual); }} />
            <Button className="w-full" onClick={() => lookup(manual)}>Look up</Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
