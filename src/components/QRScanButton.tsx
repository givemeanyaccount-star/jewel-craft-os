import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";

const SCANNER_ID = "qr-reader-region";

export function QRScanButton({
  onScan,
  size = "icon",
  variant = "outline",
  label,
}: {
  onScan: (text: string) => void;
  size?: "icon" | "sm" | "default";
  variant?: "outline" | "default" | "ghost" | "secondary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [starting, setStarting] = useState(false);
  const [manual, setManual] = useState("");
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      // wait for the region to be in the DOM (Dialog uses a portal)
      let el: HTMLElement | null = null;
      for (let i = 0; i < 20 && !el; i++) {
        el = document.getElementById(SCANNER_ID);
        if (!el) await new Promise((r) => setTimeout(r, 50));
      }
      if (!el || cancelled) return;
      setStarting(true);
      try {
        const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false } as any);
        scannerRef.current = scanner;
        // Prefer back camera; fall back to any
        const config = { fps: 10, qrbox: { width: 240, height: 240 } };
        try {
          await scanner.start({ facingMode: { exact: "environment" } as any }, config, onFound, () => {});
        } catch {
          await scanner.start({ facingMode: "environment" }, config, onFound, () => {});
        }
      } catch (e: any) {
        toast.error(e?.message || "Camera unavailable — check permissions");
        setOpen(false);
      } finally {
        setStarting(false);
      }
    };

    const onFound = async (text: string) => {
      if (cancelled) return;
      cancelled = true;
      const s = scannerRef.current;
      try { await s?.stop(); } catch {}
      try { await s?.clear(); } catch {}
      scannerRef.current = null;
      setOpen(false);
      onScan(text.trim());
    };

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      (async () => {
        try { if (s && (s as any).isScanning) await s.stop(); } catch {}
        try { await s?.clear(); } catch {}
      })();
    };
  }, [open, onScan]);

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => setOpen(true)} title="Scan QR / barcode">
        <ScanLine className={label ? "mr-1 h-4 w-4" : "h-4 w-4"} />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Scan QR / Barcode</DialogTitle></DialogHeader>
          <div id={SCANNER_ID} className="aspect-square w-full overflow-hidden rounded border bg-muted" />
          <p className="text-center text-xs text-muted-foreground">
            {starting ? "Starting camera…" : "Point camera at the QR / barcode"}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
