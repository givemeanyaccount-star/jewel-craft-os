import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Camera, Upload, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";

async function croppedFile(src: string, area: Area, name = "photo.jpg"): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.9));
  return new File([blob], name, { type: "image/jpeg" });
}

export function ImageCaptureButton({ onCapture, label = "Add photo", title }: {
  onCapture: (file: File) => void; label?: string; title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Camera className="mr-1 h-4 w-4" /> {label}
      </Button>
      <ImageCaptureDialog open={open} onOpenChange={setOpen} onCapture={(f) => { onCapture(f); setOpen(false); }} title={title} />
    </>
  );
}

export function ImageCaptureDialog({ open, onOpenChange, onCapture, title = "Add Photo" }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCapture: (file: File) => void; title?: string;
}) {
  const [tab, setTab] = useState<"camera" | "upload">("camera");
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camReady, setCamReady] = useState(false);

  useEffect(() => {
    if (!open) {
      stopCam();
      setSrc(null); setArea(null); setZoom(1); setCrop({ x: 0, y: 0 });
      return;
    }
    if (tab === "camera" && !src) startCam();
    else stopCam();
    return () => stopCam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, src]);

  async function startCam() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = s;
      setCamReady(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); } }, 50);
    } catch (e: any) {
      toast.error("Camera unavailable: " + (e.message || e));
      setTab("upload");
    }
  }
  function stopCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamReady(false);
  }

  function snap() {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setSrc(c.toDataURL("image/jpeg", 0.92));
    stopCam();
  }

  function onFile(f?: File | null) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setSrc(String(r.result));
    r.readAsDataURL(f);
  }

  const onCropComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  async function confirm() {
    if (!src || !area) return;
    const f = await croppedFile(src, area, `photo-${Date.now()}.jpg`);
    onCapture(f);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {!src ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="camera"><Camera className="mr-1 h-4 w-4" />Camera</TabsTrigger>
              <TabsTrigger value="upload"><Upload className="mr-1 h-4 w-4" />Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="camera" className="space-y-2">
              <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black">
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              </div>
              <Button onClick={snap} disabled={!camReady} className="w-full">
                <Camera className="mr-1 h-4 w-4" /> Capture
              </Button>
            </TabsContent>
            <TabsContent value="upload">
              <Input type="file" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black">
              <Cropper image={src} crop={crop} zoom={zoom} aspect={1}
                onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Zoom</span>
              <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} className="flex-1" />
            </div>
          </div>
        )}
        <DialogFooter>
          {src && <Button variant="outline" onClick={() => setSrc(null)}><RotateCcw className="mr-1 h-4 w-4" />Retake</Button>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          {src && <Button onClick={confirm}><Check className="mr-1 h-4 w-4" />Use photo</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
