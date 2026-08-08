# Rename "Old Gold Purchases" to "Old Metal Purchases"

The module handles gold and silver trade-ins, so all visible wording becomes metal-neutral. This is a labels-only change: the database, receipt numbering (OG-xxxxx) and internal code names stay as they are, so no records or links break.

## What changes on screen

- Purchases page: tab "Old Metal Purchases", button and dialog "New Old Metal Purchase", printed receipt heading "Old Metal Purchase Receipt", empty state "No old metal purchases".
- Invoices section: sub-nav tab "Old Metal Purchases" and its list page heading/empty state.
- POS: trade-in dialog title "Old Metal Purchase", button tooltip, "Old metal credit" row, and the toast after saving a trade-in.
- Form (`OldGoldForm`): card title "New Old Metal Purchase" and the ID-confirmation text pointing to "Purchases → Old Metal Purchases".
- Dashboard: ops card "Old metal alert" (missing-ID alert) and the activity-log filter/badge "Old metal".
- Invoice / quotation detail + print document: "Old metal credit", "Customer Old Metal", and the tax notes now read "gold + making − old metal credit".
- Cancel-invoice dialog: "Linked old metal purchase(s)".
- Returns dialog: "Old metal settlement", the credit-note line and related helper text.
- Settings: tax explanation text updated to "old metal credit".

## What stays the same

- Table `old_gold_purchases` and columns such as `old_gold_credit`, `linked_invoice_id` — unchanged.
- Receipt prefix `OG`, existing receipts and their printed numbers.
- File names, component names (`OldGoldForm`, `InvoicesOldGold`), routes (`/invoices/old-gold`), permission keys and query params (`?tab=oldgold&missingId=1`).

## Technical notes

- Text-only edits across: `src/pages/Purchases.tsx`, `src/pages/InvoicesOldGold.tsx`, `src/pages/Invoices.tsx`, `src/pages/POS.tsx`, `src/pages/InvoiceDetail.tsx`, `src/pages/QuotationDetail.tsx`, `src/pages/Quotations.tsx`, `src/pages/Settings.tsx`, `src/components/OldGoldForm.tsx`, `src/components/PrintDocument.tsx`, `src/components/CancelInvoiceDialog.tsx`, `src/components/ReturnItemsDialog.tsx`, `src/components/dashboard/OpsCards.tsx`, `src/components/dashboard/ActivityLog.tsx`.
- No migration, no API/type changes, no test changes expected (tests assert numbers, not labels).
