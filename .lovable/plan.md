# Invoice redesign to match the existing store bill

Rebuild the printed sales invoice so it matches the sample bill you're currently using, and reuse the same layout for quotations (titled "Estimate").

## 1. Company profile in Settings

The sample header carries store identity that the app doesn't store today. Add a **Company Profile** card in Settings with:

- Shop name (English) and shop name (Nepali)
- Tagline / group name line (e.g. "SHAKYAMUNI" above the main name)
- Address line, PAN No., REG No.
- Up to three phone numbers, email, Facebook handle
- Logo upload and an optional QR image upload (both to the existing product-images storage)

These values feed the invoice, estimate and any future print document. Only admin/manager can edit; everyone printing can read them.

## 2. Header block (exact match)

Three-part boxed header, same as the sample:

```text
+-------------------------------------------------------------+
| PAN No: [6][1][9][9]...   [LOGO]  SHAKYAMUNI          [QR]   |
| REG No: 333095/080/081        LOKMAN and SONS PVT. LTD.      |
|                               <Nepali name>       Phone      |
|                               Address             Email      |
|                               __Estimate__        Facebook   |
+-------------------------------------------------------------+
```

- PAN digits rendered in individual boxed cells, exactly as in the sample.
- Centre column: logo left, then group name, bold company name, Nepali name, address, and the underlined document title ("Tax Invoice" / "Estimate").
- Right column: QR image and a contact stack with phone, email and Facebook icons.

## 3. Billing details block (exact match)

A single bordered strip with three columns:

- Left: Customer, Address, Contact No.
- Middle: Pan No., Order Date, Tran. Date (with Bikram Sambat in brackets)
- Right: Invoice No., Invoice Date, Bill Miti (BS)

BS dates are produced by an AD→BS converter added to the project, so `2026-07-31` prints as `2083/4/15` automatically.

## 4. Item table

Same column order and grid as the sample, bordered box with a fixed minimum height so short bills keep the full-page frame:

`SN | HS Code | Item | Type | Gross Wt (gm) | Less/St. Wt (gm) | Net Wt (gm) | Waste (gm) | Total Wt (gm) | Rate (gm) | Amount | Stone Amt | Making | Total Amount`

- Type shows metal + purity stacked ("Gold 22K").
- Amount = Total Wt × Rate; Total Amount = Amount + Stone Amt + Making. This matches the app's current calculation, so no math changes.
- Wastage and making basis stay available as small bracket notes.

## 5. Footer band

Left half:
- **In Words:** amount spelled out in English (a number-to-words helper is added).
- Product images: thumbnails of the sold items placed at the bottom-left, above the Remarks line, as you requested.
- Tola conversion line (1 tola = 11.664 g) and the day's 24K per-tola gold value, derived from the saved daily rate.
- Remarks.

Middle: **Payment Mode** table listing each recorded payment method with its amount (Cash, QR Scan, Cheque, Old Gold, Advance, etc.) — driven by the actual payments on the invoice rather than a fixed list.

Right: totals column in the sample's order — Amount, Discount, Total, Non Taxable Amt, Customer Old Gold, SD Taxable Amt, SD Tax (0.5%), and a boxed **Net Total**. VAT on stones appears only when it's enabled in Settings.

Bottom: the Nepali terms-and-conditions line, then the signature row — Cashier (logged-in user), Customer, and the shop name.

## 6. Quotation / Estimate

The same component renders quotations with the title switched to "Estimate", the number/date labels switched to quote wording, and the payment-mode block omitted.

## Technical notes

- New table `public.company_profile` (singleton, same pattern as `app_settings`) with read access for all signed-in roles and write access restricted to admin/manager.
- New shared component `src/components/PrintDocument.tsx` holding the full print layout, used by both `InvoiceDetail.tsx` and `QuotationDetail.tsx`; the existing inline print layouts are removed.
- New helpers: `src/lib/nepaliDate.ts` (AD↔BS conversion table for 2000–2100 BS) and `src/lib/numberToWords.ts`.
- Print stylesheet targets A4 with fixed borders and `page-break-inside: avoid` on rows; screen view keeps the current card layout.
