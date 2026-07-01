import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";

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
  const ref = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!ref.current) return;
      const id = "qr-scan-btn-" + Math.random().toString(36).slice(2, 8);
      ref.current.id = id;
      const scanner = new Html5Qrcode(id);
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 220 },
          async (text) => {
            if (cancelled) return;
            cancelled = true;
            try { await scanner.stop(); await scanner.clear(); } catch {}
            setOpen(false);
            onScan(text.trim());
          },
          () => {}
        );
      } catch {
        toast.error("Camera unavailable");
        setOpen(false);
      }
    })();
    return () => {
      cancelled = true;
      (async () => {
        try { await scannerRef.current?.stop(); await scannerRef.current?.clear(); } catch {}
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
          <div ref={ref} className="aspect-square w-full overflow-hidden rounded border bg-muted" />
        </DialogContent>
      </Dialog>
    </>
  );
}
