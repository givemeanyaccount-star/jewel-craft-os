# Offline-friendly returns

Make /returns usable with no connection: the app shell loads offline, recently opened invoices stay available for lookup, ticked lines and refund settings survive a reload, and returns processed while offline are queued and submitted automatically as soon as the connection is back.

## Offline app shell

- Installable app: web manifest, icons, theme colour and head tags, so JewelMaster OS can be added to a phone home screen.
- Generated service worker caches the app shell so /returns opens cold while offline. HTML always tries the network first and falls back to cache; built assets come from cache.
- The worker never registers inside the Lovable editor preview or in development, and `?sw=off` unregisters it.

## Offline invoice lookup

- Every invoice opened on /returns is stored locally with its line items, customer, totals, discount and taxes.
- While offline, the search box searches that local cache (by invoice number or customer name) and results carry a "Cached" tag with the date it was captured.
- A small connection chip in the page header shows Online / Offline and how many invoices are cached.
- Reconnecting refreshes the loaded invoice from the server before anything is processed.

## Selected return lines survive

- The current selection — invoice, ticked lines, per-line disposition, refund method and reason — is mirrored locally as you work, alongside the existing server-side draft.
- Offline, the server draft save is skipped silently; the local copy keeps everything. Reopening /returns restores exactly what was on screen.
- Back online, the local copy is pushed into the server draft so History shows it as usual.

## Queue and auto-sync

- "Process Return & Generate Credit Note" while offline queues the return instead of failing. A provisional credit note number is shown and the page reports "Queued — will process when you're back online".
- Queued returns appear in the History tab with a "Queued" status badge and can be removed before they sync.
- When the connection returns, queued items are submitted one by one in the order they were queued. Success shows a toast with the final credit note number and refreshes History; a failure (e.g. a line already returned by someone else) leaves the item in the queue, marks it "Needs attention" with the error, and keeps the rest going.
- Nothing writes to the ledger twice: each queued return carries a client id used to skip resubmission.

## Technical notes

- `vite-plugin-pwa` with `generateSW`, `registerType: "autoUpdate"`, `injectRegister: null`, `devOptions.enabled: false`; navigations `NetworkFirst`, hashed same-origin assets `CacheFirst`, `/~oauth` excluded from navigation fallback. Single guarded registration wrapper `src/pwa/registerSW.ts` called from `src/main.tsx`, refusing to register in dev, iframes, `id-preview--*`/`preview--*`, `*.lovableproject.com`, `*.lovableproject-dev.com`, `*.beta.lovable.dev`, or with `?sw=off`, unregistering `/sw.js` in those contexts.
- New `src/lib/offlineReturns.ts` over IndexedDB (`idb-keyval`): stores `invoice:<id>` snapshots (LRU-capped at 25), `returnDraft:current`, and a `returnQueue` array of `{ clientId, invoiceSnapshot, selection, calc, method, reason, queuedAt, error? }`.
- `src/hooks/useOnlineStatus.ts` wraps `navigator.onLine` plus online/offline events; `SalesReturns.tsx` uses it to switch search source, to gate the server draft autosave, and to flush the queue on reconnect.
- Flush calls the existing `processReturn` in `src/lib/returns.ts` unchanged, after re-reading the invoice and skipping lines already marked returned; queued entries are removed only after success.
- `ReturnsHistory.tsx` renders queued entries from IndexedDB above the server rows with their own badge and a Remove action; server statuses (draft/processed/voided) are untouched.
- No database changes.
