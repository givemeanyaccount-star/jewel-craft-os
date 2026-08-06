# Paper-aware pagination, borders and auto-sized invoice table

Right now the blank filler space under the item rows is baked into the invoice markup with fixed values (a 96px tall filler row, only drawn when there are 12 items or fewer). Those numbers assume landscape A4 with a 6mm margin. Change the paper, orientation, or margin in the print preview and the filler no longer matches the page: short bills show a large empty gap, and near-full bills push the totals band onto a second page.

## What will change

1. **Filler space is measured, not guessed.** After the preview renders, the document measures the real remaining height on the last page and stretches the item table's filler row to exactly fill it — the totals/payment band always sits at the bottom of the sheet with no wasted gap.
2. **Recomputed on every setting change.** Changing paper size, orientation, or margin re-runs the measurement, page counting, page numbers, page-edge guides, and filler sizing. Same routine also re-runs when fonts and images finish loading, so nothing shifts after the first paint.
3. **Column rules always reach the bottom line.** The filler cells keep their left/right rules and the closing bottom border, so vertical column lines run unbroken to the end of the table on every paper size — including when the table ends mid-page on a multi-page bill.
4. **Multi-page bills waste no page.** If content overflows, the filler collapses to zero and the totals band flows normally, with the repeated table header on the following page.
5. **PDF export matches.** The download captures the document only after the recalculation settles, so exported pages match the preview exactly.
6. **Preview shown.** After the change I will open an invoice print preview in the browser and show screenshots for A4 landscape, A4 portrait, and Letter, plus a long multi-page invoice.

## Technical notes

- `src/components/PrintDocument.tsx`: replace the hard-coded filler `<tr>` (`height: items.length <= 12 ? '96px' : '0px'`) with a marked `<tr class="pd-filler">` whose cells carry the side rules and the 1.5px bottom border and a `height: 0` default. Remove the item-count threshold — sizing becomes the preview's job. Mark the items table as `.pd-items` and the footer band as `.pd-tail` so the script can locate them.
- `src/components/PrintPreview.tsx`: extend the injected script's `paginate()` into a `layout()` that (a) resets the filler to 0, (b) measures `pd-tail` height and the offset of the table bottom within the current page, (c) sets the filler height to `usable - (contentBottom mod usable) - tailHeight` when that value is positive, else 0, (d) recounts pages and repaints page numbers/edges. Run it on `load`, on `document.fonts.ready`, in a `ResizeObserver` on `#pd-content`, and once more on a short timeout. Guard with a re-entrancy flag so the observer does not loop.
- Setup changes already rebuild `srcDoc`; keep that and expose a `pdLayout()` hook on the iframe window so `doDownload` can await one final layout pass before `html2canvas` runs.
- Presentation only — no database, pricing, or business-logic changes.
