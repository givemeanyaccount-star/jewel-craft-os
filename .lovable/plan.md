# Fix bill printing errors, missing photos, and add item descriptions

## 1. Find and fix the printing error
The exact error message hasn't been captured yet, so the first step is to reproduce it: open a few posted bills (with and without photos, order bills, draft previews) and press Print and Download PDF while watching for errors.
Likely spots to check and harden:
- Saving as PDF fails when a photo can't be loaded (expired photo link or a blocked image) — skip bad images instead of failing, and show a clear message.
- Printing starts before the bill has finished loading (photos, logo, rates) — wait until everything is ready, and disable the Print button until then.
- Bills with missing values (no customer phone, no rate, empty items) — show "—" instead of breaking.

## 2. Photos missing on some bills
Current behaviour found in the bill code:
- Only the first 4 items' photos are shown; items 5+ never appear.
- Items billed from an order (not linked to a stock item) never get a photo.
- If a photo link fails, it silently disappears.
- Photos can still be loading when the print window opens, so they are left out.

Fix:
- Show a small photo beside each item line (first photo of that item) instead of a separate strip limited to 4.
- Look up photos for order-billed items through their order item / reference image.
- Wait for all photos to load (with a short timeout) before opening print, and retry an expired link once.

## 3. Item descriptions on the bill
- If the stock item has a description, print it in small grey text under the item name on its line.
- If it's long, shorten it on the line and print the full text in the Remarks area, numbered by SN.
- Items with no description print as before.

## Technical details
- `PrintDocument.tsx`: replace the `thumbs` effect (slice 0,4) with a per-item map `{inventory_item_id → {photo, description}}` from `inventory_items(image_urls, description)`, plus `order_items` reference images for rows with `order_item_id`; render inside the Item cell. Expose a `ready` flag; `DraftBillPreview` and Print buttons wait for it instead of a fixed 900ms.
- `PrintPreview.tsx`: PDF path — drop images that fail to decode before `html2canvas`; keep `useCORS`; surface the real error.
- Verify by printing a bill with 5+ items with photos, an order bill, and a bill with a description, via browser test.
