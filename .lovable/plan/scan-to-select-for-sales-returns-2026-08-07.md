# Scan-to-select for sales returns

Add barcode/QR scanning on the Returns page so staff can point the camera at a product tag (or type/paste a code) and have the matching invoice line tick itself instead of hunting through the list.

## How it behaves

1. A scan button sits next to the invoice search box and next to the "Line items" header.
2. **No invoice loaded yet:** scanning an invoice QR / invoice number loads that invoice directly. Scanning a product tag finds the most recent non-cancelled invoice containing that item and loads it, so staff can start from the piece in hand.
3. **Invoice loaded:** scanning a product tag ticks the matching line, scrolls to it, and briefly highlights it. A short toast confirms which item was selected.
4. Edge cases get clear toasts instead of silent failures:
   - Code not recognised at all
   - Item found but not on this invoice
   - Line already returned (no tick, message says so)
   - Line already selected (no double toggle, message confirms)
   - Same item on multiple lines: the first not-yet-selected, not-yet-returned line is picked
5. The scanner dialog keeps its manual-entry field, so a USB/bluetooth barcode wedge or typing works identically to the camera.

## Matching rules

A scanned code is matched, in order, against:
- Invoice number (when no invoice is loaded)
- Inventory SKU, barcode, or QR code — then linked to the invoice line through the line's inventory item
- As a last resort, an exact case-insensitive match on the line description

## Offline behaviour

Cached invoice snapshots don't carry product codes today, so the cache is extended: when an invoice is cached, the SKU / barcode / QR code of each linked inventory item is stored alongside the line. Scanning then works fully offline for any invoice already cached. Uncached codes report "not available offline" rather than failing silently.

## Technical notes

- Reuse `QRScanButton` (html5-qrcode) — no new scanning dependency.
- New helper `src/lib/scanMatch.ts`: `resolveScannedCode(code, { items, online })` returns `{ kind: "invoice" | "line" | "none", id, reason }`; online path queries `inventory_items` on `sku`/`barcode`/`qr_code`, offline path reads codes from the cached snapshot.
- `src/lib/offlineReturns.ts`: extend the cached snapshot shape with a per-line `codes` array; keep reads backward compatible with snapshots saved before this change.
- `src/pages/SalesReturns.tsx`: add `handleScan`, a `highlightId` state with a ~2s timeout, and refs on line rows for `scrollIntoView`. Selection flows through the existing `setLines` state so autosave, refund maths and the offline queue keep working unchanged.
- No database or RLS changes.
