# Nepali date (BS) toggle, bill preview before posting, hold and print

## 1. Nepali date toggle everywhere
- A small **AD | BS** switch in the top bar. Each user's choice is remembered on that device.
- **Entering dates:** every date box offers a matching Nepali (Bikram Sambat) picker when BS is on. This covers the sale screen (order date, invoice date), orders, repairs, purchases, the sales report filters and the order-date correction. The picker has year, month and day dropdowns showing Nepali month names (Baisakh … Chaitra). The matching English date is shown in small text underneath.
- **Showing dates:** lists and detail pages (invoices, sales report, orders, repairs, purchases, quotations) show dates in the selected calendar. Hovering or tapping shows the other calendar.
- Dates are still stored the same way underneath. Only what you see and type changes, so all existing records and reports stay correct.
- Printed bills already show both AD and BS and stay as they are. The sales report export adds a BS date column.

## 2. Preview the bill before completing the sale
- A new **Preview bill** button next to Complete Sale on the sale screen.
- It opens the exact printed layout with the current customer, items, taxes, advances, payments and net payable. The bill number reads "DRAFT — number given on posting", with a light "DRAFT / NOT POSTED" mark across the page.
- From the preview you can **Print draft** (for the customer to check), **Download PDF**, go back to edit, or **Complete sale**, which posts the bill and then offers the final print.
- Previewing never uses up an invoice number, so the numbering stays unbroken.

## 3. Hold bill, resume later, print held bills
- **Hold bill** already exists on the sale screen. It saves the unfinished bill to the shared Counter page so any counter can resume it, and nothing is posted. It will be made more visible next to Preview and Complete Sale.
- The Counter page gets a **Preview / Print** button on each held bill, giving the same draft printout without resuming it.
- Resuming a held bill and pressing Complete Sale posts it as the final record with the next invoice number. This is the same flow as today.
- Holding asks for an optional label ("Ram's necklace, back at 5pm") so the right bill is easy to find later.

## Technical notes
- `src/hooks/useDateMode.ts` (localStorage `jm.dateMode`, context in AppLayout) plus a header toggle in `AppLayout.tsx`.
- `src/components/DateField.tsx`: wraps the existing `type="date"` input. In BS mode it renders year/month/day selects converting with `nepali-date-converter` (already installed), and still emits an AD `YYYY-MM-DD` and honours `max`/`min`. It replaces the date inputs in POS, Orders, OrderDetail, Repairs, Purchases, InvoiceDetail and SalesReport.
- `src/components/DateText.tsx` renders a date in the selected calendar (via `toBS`/`toADDate` in `src/lib/nepaliDate.ts`) and is used in the list/detail tables.
- POS preview: build an unsaved `doc`/`items`/`payments` object from current state and pass it to the existing `PrintDocument` with a new `draft` prop (watermark plus placeholder number) inside the existing `PrintPreview` dialog. No database writes.
- PosCounter: build the same draft doc from the held bill's `state` and show it in the same preview. Hold dialog adds a label input stored in `pos_held_bills.label`.
- No schema changes. Verify with typecheck, tests, and a browser check of the BS picker round-trip, the draft preview/print, and a held bill printed from the Counter page.
