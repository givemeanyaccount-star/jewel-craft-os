# Fix print pagination for long invoices and receipts

Today every printed document is built as one continuous block. When an invoice, quotation, or receipt has more rows than fit on one A4 page, the browser splits it wherever it lands: the item table header does not repeat, the fixed 130px filler row can push the totals block onto a page of its own, and the totals/payment/terms band can be cut in half.

## What will change

1. **Repeating table headers** — item tables print their header row at the top of every page, and the closing border renders correctly on the last page.
2. **No mid-row splits** — a single item line (including its small basis notes such as "(5%)" or "(120/g)") never breaks across pages.
3. **Totals, payments, terms and signatures stay together** — the footer band prints as one unbreakable block; if it does not fit on the current page it moves whole to the next one.
4. **Smart filler space** — the 130px blank filler row on the invoice/estimate is only drawn when the document fits on a single page, so multi-page bills do not waste a page on empty space.
5. **Page numbers** — "Page X of Y" printed subtly at the bottom right of each page.
6. **Same rules for the other receipts** — repair receipt, old-gold purchase receipt, purchase detail: unbreakable header block, repeating table head, and unbreakable totals/signature blocks.
7. **Preview matches print** — the preview iframe shows the same paginated result (page-sized white sheets with the same margins), so what you see is what prints.

## Download PDF

Every print preview dialog gets a **Download PDF** button next to Print. It exports exactly what the preview shows — same A4 size, margins, page breaks and pagination rules above — as a multi-page PDF file, with a sensible filename such as `Invoice-2081-0142.pdf`, `Estimate-Q-0031.pdf`, `Repair-Receipt-1204.pdf`, or `Tag-RNG-0007.pdf`. A short "Preparing PDF…" state shows while it renders, and failures surface as a toast.

## Verification

After the changes, print previews will be checked in the browser for: a short invoice (2 items), a long invoice (~25 items spanning 2+ pages), a quotation, and a repair/old-gold receipt — confirming repeated headers, intact totals, and no clipped content. Each downloaded PDF will be opened and visually inspected page by page to confirm it matches the preview with no clipped or overlapping content.

## Technical notes

- `src/components/PrintPreview.tsx`: add shared print CSS to the generated document — `thead{display:table-header-group}`, `tfoot{display:table-footer-group}`, `tr,img{break-inside:avoid}`, `.pd-keep{break-inside:avoid}` — plus an A4-sized preview body so the iframe paginates like paper, and a CSS-counter based `@page`/footer page number.
- `src/components/PrintDocument.tsx`: wrap the footer band and each totals column in `.pd-keep`; render the filler `<tr>` only when `items.length` is below the single-page threshold (landscape A4 fits roughly 12 rows); keep the bottom border on the last row instead of on the filler.
- `src/pages/RepairDetail.tsx`, `src/pages/Purchases.tsx`, `src/pages/PurchaseDetail.tsx`, `src/components/ReturnItemsDialog.tsx`: drop the duplicated inline print CSS in favour of the shared rules and add `pd-keep` to their header/summary/signature blocks.
- PDF export: add `html2canvas` + `jspdf`, render the preview iframe's document body to canvas at 2x scale and slice it across A4 pages (orientation taken from the job's `@page` size — landscape for invoices/estimates, portrait for receipts). Extend `PrintJob` with an optional `fileName` and `orientation`; call sites pass a document-specific name, with a slugified title fallback.
- No database or business-logic changes; print/presentation layer only.

