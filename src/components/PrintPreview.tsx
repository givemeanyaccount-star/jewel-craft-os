import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

export type PageSize = "a4" | "a4-landscape" | "tag";

export type PrintJob = {
  /** Window / document title used by the browser print dialog. */
  title: string;
  /** Body HTML to render inside the preview document. */
  html: string;
  /** Extra CSS injected into the preview document. */
  css?: string;
  /** Copy the app's stylesheets into the preview (needed for Tailwind markup). */
  includeAppStyles?: boolean;
  /** Paper geometry. Defaults to portrait A4. */
  page?: PageSize;
  /** Custom page width/height in mm — overrides `page`. */
  pageMm?: { width: number; height: number };
  /** Page margin in mm. Defaults to 10 (6 for landscape documents). */
  marginMm?: number;
  /** File name (without extension) used by the PDF download. */
  fileName?: string;
  /** Hide the "Page X of Y" footer (e.g. for small tags). */
  hidePageNumbers?: boolean;
};

type Listener = (job: PrintJob) => void;
let listener: Listener | null = null;

/** Show a print preview dialog. The user prints or downloads from inside the preview. */
export function openPrintPreview(job: PrintJob) {
  if (listener) listener(job);
}

function appStyles() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("\n");
}

function geometry(job: PrintJob) {
  if (job.pageMm) return { ...job.pageMm, margin: job.marginMm ?? 5 };
  switch (job.page) {
    case "a4-landscape":
      return { width: 297, height: 210, margin: job.marginMm ?? 6 };
    case "tag":
      return { width: 55, height: 85, margin: job.marginMm ?? 3 };
    default:
      return { width: 210, height: 297, margin: job.marginMm ?? 10 };
  }
}

function slug(s: string) {
  return (s || "document").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
}

/** Shared pagination rules so long documents never cut off content. */
const PAGINATION_CSS = `
  table{border-collapse:collapse}
  thead{display:table-header-group}
  tfoot{display:table-footer-group}
  tr,img,.pd-keep{break-inside:avoid;page-break-inside:avoid}
  h1,h2,h3,h4{break-after:avoid;page-break-after:avoid}
  .pd-break-before{break-before:page;page-break-before:always}
  .pd-page-number{position:absolute;right:0;font-size:8px;color:#888;letter-spacing:.02em}
`;

function buildSrcDoc(job: PrintJob) {
  const g = geometry(job);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${job.title}</title>
${job.includeAppStyles ? appStyles() : ""}
<style>
  *{box-sizing:border-box}
  html{background:#e9e9ec}
  body{background:#fff;color:#000;margin:0 auto;position:relative;
       width:${g.width}mm;min-height:${g.height}mm;padding:${g.margin}mm;
       font-family:Arial,Helvetica,sans-serif;line-height:1.25;
       -webkit-print-color-adjust:exact;print-color-adjust:exact}
  ${PAGINATION_CSS}
  @page{size:${g.width}mm ${g.height}mm;margin:0}
  @media print{html{background:#fff}body{margin:0;box-shadow:none}}
  @media screen{body{box-shadow:0 0 0 1px #d4d4d8,0 6px 24px rgba(0,0,0,.12);margin-top:12px;margin-bottom:12px}}
  ${job.css ?? ""}
</style></head><body><div id="pd-content">${job.html}</div>
<script>
(function(){
  var MM = 96/25.4;
  var pageH = ${g.height} * MM, margin = ${g.margin} * MM;
  var usable = pageH - margin * 2;
  function paginate(){
    Array.prototype.forEach.call(document.querySelectorAll('.pd-page-number,.pd-page-edge'), function(n){ n.remove(); });
    var content = document.getElementById('pd-content');
    var h = content ? content.scrollHeight : 0;
    var pages = Math.max(1, Math.ceil((h - 2) / usable));
    document.body.style.height = (pages * pageH) + 'px';
    if (${job.hidePageNumbers ? "true" : "false"} || pages < 2) return;
    for (var i = 0; i < pages; i++){
      var d = document.createElement('div');
      d.className = 'pd-page-number';
      d.textContent = 'Page ' + (i + 1) + ' of ' + pages;
      d.style.top = (margin + i * pageH + usable + 2) + 'px';
      document.body.appendChild(d);
      if (i < pages - 1){
        var e = document.createElement('div');
        e.className = 'pd-page-edge';
        e.style.cssText = 'position:absolute;left:0;right:0;height:0;border-top:1px dashed #d4d4d8;top:' + ((i + 1) * pageH) + 'px';
        e.setAttribute('data-screen-only','1');
        document.body.appendChild(e);
      }
    }
  }
  var s = document.createElement('style');
  s.textContent = '@media print{[data-screen-only]{display:none!important}}';
  document.head.appendChild(s);
  if (document.readyState === 'complete') paginate(); else window.addEventListener('load', paginate);
  setTimeout(paginate, 400);
})();
</script>
</body></html>`;
}

export function PrintPreviewHost() {
  const [job, setJob] = useState<PrintJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listener = (j) => setJob(j);
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    if (!job) { setBoxWidth(0); return; }
    let raf = 0;
    const measure = () => {
      const el = boxRef.current;
      if (el && el.clientWidth) setBoxWidth(el.clientWidth);
      else raf = requestAnimationFrame(measure);
    };
    measure();
    const onResize = () => { const el = boxRef.current; if (el?.clientWidth) setBoxWidth(el.clientWidth); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [job]);

  const pageWidthPx = job ? Math.round(geometry(job).width * (96 / 25.4)) : 0;
  const frameWidth = Math.max(pageWidthPx + 24, 320);
  const scale = boxWidth && frameWidth > boxWidth ? boxWidth / frameWidth : 1;

  const doPrint = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }, []);

  const doDownload = useCallback(async () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || !job) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      doc.querySelectorAll("[data-screen-only]").forEach((n) => n.remove());
      // Strip the on-screen sheet chrome so the capture is exactly the paper area.
      doc.body.style.margin = "0";
      doc.body.style.boxShadow = "none";
      const g = geometry(job);
      const canvas = await html2canvas(doc.body, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: doc.body.scrollWidth,
        windowHeight: doc.body.scrollHeight,
        // Renders through the browser's own layout engine: keeps borders and
        // text baselines aligned exactly as they appear in the preview.
        foreignObjectRendering: true,
      });
      const pdf = new jsPDF({
        orientation: g.width > g.height ? "landscape" : "portrait",
        unit: "mm",
        format: [g.width, g.height],
      });
      // px per page slice, derived from the rendered canvas width.
      const pxPerMm = canvas.width / g.width;
      const pageHeightPx = Math.floor(g.height * pxPerMm);
      const pages = Math.max(1, Math.ceil((canvas.height - 4) / pageHeightPx));
      for (let i = 0; i < pages; i++) {
        const sliceH = Math.min(pageHeightPx, canvas.height - i * pageHeightPx);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, i * pageHeightPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (i > 0) pdf.addPage([g.width, g.height], g.width > g.height ? "landscape" : "portrait");
        pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, g.width, sliceH / pxPerMm);
      }
      pdf.save(`${slug(job.fileName ?? job.title)}.pdf`);
    } catch (e: any) {
      toast({ title: "Could not create PDF", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [job]);

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && setJob(null)}>
      <DialogContent className="flex h-[92vh] max-w-5xl flex-col gap-3 p-4">
        <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
          <DialogTitle className="text-base">Print preview — {job?.title}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setJob(null)}>
              <X className="mr-1 h-4 w-4" /> Close
            </Button>
            <Button size="sm" variant="outline" onClick={doDownload} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
              {busy ? "Preparing PDF…" : "Download PDF"}
            </Button>
            <Button size="sm" onClick={doPrint}>
              <Printer className="mr-1 h-4 w-4" /> Print
            </Button>
          </div>
        </DialogHeader>
        <div ref={boxRef} className="min-h-0 flex-1 overflow-auto rounded border bg-muted/40">
          {job && (
            <iframe
              ref={frameRef}
              title="Print preview"
              className="bg-white"
              style={{
                width: `${frameWidth}px`,
                height: `${100 / scale}%`,
                border: 0,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
              srcDoc={buildSrcDoc(job)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
