import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PrintJob = {
  /** Window / document title used by the browser print dialog. */
  title: string;
  /** Body HTML to render inside the preview document. */
  html: string;
  /** Extra CSS injected into the preview document. */
  css?: string;
  /** Copy the app's stylesheets into the preview (needed for Tailwind markup). */
  includeAppStyles?: boolean;
};

type Listener = (job: PrintJob) => void;
let listener: Listener | null = null;

/** Show a print preview dialog. The user prints from inside the preview. */
export function openPrintPreview(job: PrintJob) {
  if (listener) listener(job);
}

function appStyles() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("\n");
}

function buildSrcDoc(job: PrintJob) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${job.title}</title>
${job.includeAppStyles ? appStyles() : ""}
<style>
  *{box-sizing:border-box}
  html,body{background:#fff;color:#000;margin:0}
  body{padding:6mm;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  tr,img{page-break-inside:avoid}
  ${job.css ?? ""}
</style></head><body>${job.html}</body></html>`;
}

export function PrintPreviewHost() {
  const [job, setJob] = useState<PrintJob | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    listener = (j) => setJob(j);
    return () => { listener = null; };
  }, []);

  const doPrint = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }, []);

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && setJob(null)}>
      <DialogContent className="flex h-[92vh] max-w-5xl flex-col gap-3 p-4">
        <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
          <DialogTitle className="text-base">Print preview — {job?.title}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setJob(null)}>
              <X className="mr-1 h-4 w-4" /> Close
            </Button>
            <Button size="sm" onClick={doPrint}>
              <Printer className="mr-1 h-4 w-4" /> Print
            </Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded border bg-muted/40">
          {job && (
            <iframe
              ref={frameRef}
              title="Print preview"
              className="h-full w-full bg-white"
              srcDoc={buildSrcDoc(job)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
