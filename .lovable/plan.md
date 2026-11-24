# Tag Printing section

## What you will get
1. **Tag entries under the Stock menu, right below Inventory** (sidebar, phone menu, Ctrl+K search):
   - **Print Tags** – the main tag printing screen.
   - **Tag Designer** – opens the existing tag designer to edit the default layout without picking items first.
2. **Print Tags screen** (`/tags`)
   - Search box: type or scan an item code (SKU, old record number) or name; QR/barcode icon to scan.
   - Filters: category, metal, purity, status (in stock by default), date added (e.g. "added today" / last 7 days / custom), and "not yet printed".
   - Category chips across the top for one-tap narrowing.
   - List with checkboxes: photo, code, name, net/gross weight, category. Select all / clear; selected count shown in a sticky bar with **Print selected tags** (phone friendly).
   - Copies per item (default 1), adjustable per row.
   - Print opens the same designer/preview so layout can be tweaked before printing.
3. **Print tag when adding a new item**
   - After saving a new item, a prompt: "Print tag now?" with Print / Later. "Later" items appear under "not yet printed" on the Print Tags screen.
   - A "Print tag after saving" checkbox on the new-item form, remembered on this device.
4. **Quick links**: Inventory's "Print tags" button and item page "Print tag" stay, and also link to the Tags screen with the same filters.

## Technical details
- `navConfig.ts`: add "Print Tags" and "Tag Designer" items in the Stock section directly after Inventory (permission `inventory_view`), icon `Tag`.
- New `src/pages/TagPrinting.tsx`, route `/tags`; paged queries on `inventory` under existing RLS, filters in URL query params so links/back work.
- "Printed" tracking: small table `inventory_tag_prints` (item, user, copies, printed_at) with RLS + grants; recorded when print is triggered (browser cannot confirm the physical print).
- `TagPrintDialog`: accept per-item copies and an optional `onPrinted` callback; designer-only mode for the Tag Designer entry.
- Inventory create flow: after insert, open TagPrintDialog for the new item when the checkbox is on, else show the prompt toast.
- Tests for filter logic and copies expansion.
