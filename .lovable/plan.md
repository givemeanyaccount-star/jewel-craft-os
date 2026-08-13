# Orders: edits, cancellation, photos, old-metal advance, order receipt

## Gap check against the original order plan

Built and working: order booking, karigar issue/receive with multi-batch receipts, weight reconciliation, receiving into reserved inventory, POS billing with order-date vs today rate, advances, cancel-order dialog, status log, dashboard tiles, karigar order jobs, permissions.

Missing or thin (confirmed by reading `src/pages/Orders.tsx`, `src/pages/OrderDetail.tsx`):
- No way to edit an existing order line (karigar, weights, rate, charges, description) after booking; karigar can only be set through the Issue dialog.
- No way to remove or cancel a single order line — only the whole order.
- No order header editing (promised date, notes).
- Reference photos: `order_items.photos` exists in the database but nothing writes to it; the booking dialog has no camera capture and no per-item detail/notes field. Camera capture only exists in the "add to inventory" step.
- Advances are cash/bank only — no old-metal trade-in as advance.
- Advance receipt is a plain HTML block, unrelated to the store invoice design; nothing prompts to print it after booking or after taking an advance.

## What will be built

### 1. Editable order lines
An "Edit item" action on each order line opens the same line editor used at booking, pre-filled: description, detailed notes, category, metal, purity, quantity, expected gross/stone weight, rate and rate date, making charge and type, wastage and type, stone value, karigar assignment, photos. Saving recomputes the estimate and re-syncs the order total. Fields already consumed by received batches (quantity below what is already received) are blocked with a clear message. Each edit writes a status-log entry noting what changed.

Karigar can also be reassigned directly from the line (without going through Issue) for lines not yet issued.

Order header gets an inline edit for promised date and notes.

### 2. Removing / cancelling items
Per line: "Remove item" when nothing has been received against it (hard delete plus log), or "Cancel item" when work has started — the line is marked cancelled, any produced stock for that line is released to normal inventory or marked melted (same choice as the order-level cancel), and remaining quantities stop counting toward the order. Order total, status roll-up and the billable count update. Cancelling every line cancels the order.

### 3. Photos and detailed description per item
The booking dialog and the line editor both get:
- Camera capture / file upload (reusing the existing capture component with cropping), multiple photos per line, stored in the product-images bucket and saved into `order_items.photos`.
- A "Design / detail notes" textarea for the full description (stone details, finish, engraving, customer instructions) saved to the line notes.
Photos show as thumbnails on the order detail line, in the karigar's job view, and carry over to the inventory item when the batch is stocked (unless replaced there).

### 4. Old metal purchase as advance payment
The advance dialog gets a payment method "Old metal trade-in". Choosing it opens the shared old-metal purchase form pre-filled with the order's customer. On save it:
- creates a normal old-metal purchase record with its own receipt number and its own printable old-metal receipt (same document already used at POS),
- records an advance payment on the order for the purchase amount with method `old_gold` and the receipt number as reference,
- links the purchase to the order via the notes/reference so it is traceable.
After saving, a confirmation asks whether to print the old-metal receipt now; the receipt can be reprinted later from the advances list.

### 5. Confirmation prompts around receipts
- After booking a new order, a confirm dialog asks "Print order receipt now?".
- After recording an advance (cash or old metal), a confirm dialog asks "Print advance receipt now?" — and for old metal it offers both the old-metal purchase receipt and the order advance receipt.
- Nothing prints silently; everything goes through the existing print preview with paper/margin controls.

### 6. Order receipt designed like the sales invoice
A new order receipt document built on the existing invoice print component, so it shares the header block (logo, bilingual company name, address, PAN, phones), the billing details block, the same table styling and borders, filler rows, amount in words, Nepali date and the bottom conversion footnote.

Differences from a sales bill:
- Title "ORDER CONFIRMATION" with order number, order date, promised delivery date.
- Item columns: description, purity, expected net wt, wastage, total wt, rate/g, metal amount, stone amount, making charges, estimated amount — same order as the sales invoice, labelled "expected/estimated".
- Totals block shows estimated total, advance paid (listing cash and old-metal advances separately), and estimated balance on delivery.
- Footer note that the price is provisional and confirmed on delivery from the actual finished weight and the agreed rate basis.
- Printable from the order detail page any time; the old plain-HTML advance receipt is replaced by the same styled document in "advance receipt" mode.

## Technical notes

- Schema: add `notes` usage on `order_items` (column exists), write to the existing `photos` array column; add nothing new unless per-line cancellation needs a `cancelled_reason` — it will reuse the status log instead. Old-metal advances reuse `payments` (method `old_gold`, `order_id` set) and `old_gold_purchases` with a link back through the order.
- The booking line editor in `Orders.tsx` is extracted into a shared `OrderLineDialog` component so booking and editing use one implementation.
- `src/lib/orders.ts` gains helpers for line editing guards (minimum quantity from receipts) and for cancelling a single line, keeping `recalcOrderItem` / `syncOrderStatus` as the single source of truth for roll-ups.
- The order receipt is a new `kind` on the existing print document component so header, footer and pagination behaviour stay identical to invoices.
- All new actions stay behind `order_manage`; printing stays available to `order_view`.
