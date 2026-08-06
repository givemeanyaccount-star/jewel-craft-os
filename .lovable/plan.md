# Old gold purchases: drop customer photo, make ID optional with follow-up

## 1. Remove the customer photo

- Remove the "Customer photo" capture field from the old gold purchase form (used both standalone in Purchases and inside the POS trade-in dialog).
- Stop saving a customer photo with the purchase and stop back-filling the customer record's photo from this form.
- Remove the customer photo thumbnail from the printed/receipt view in Purchases (the ID photo stays).
- No database change: the existing `customer_photo_url` column stays but is no longer written or shown here.

## 2. ID info becomes optional, with confirmation

- ID type, ID number, and ID photo are no longer blocking. If the customer already has ID on file, it is reused as today.
- If any ID detail is missing when saving, show a confirmation dialog: "No ID document recorded for this purchase. Nepali regulations recommend capturing ID for gold purchases. Continue anyway?" with Cancel / Continue without ID.
- Whatever partial ID info was entered is still saved.

## 3. Dashboard alert for purchases missing ID

- Add a dashboard card (visible to roles that can view purchases) showing the count of old gold purchases with missing ID info (missing type, number, or ID photo), linking to a filtered view.
- Card is hidden when the count is zero.

## 4. Update ID info later

- In Purchases > Old Gold Purchases list, add a "Missing ID" badge on affected rows and a filter toggle "Only missing ID".
- Add an "Add/Update ID" dialog per purchase: ID type, ID number, capture/upload ID photo. Saving updates the purchase record and, if the linked customer has no ID on file, back-fills the customer too.

## Technical notes

- Files: `src/components/OldGoldForm.tsx` (remove photo state/UI/upload, optional-ID validation + confirm dialog), `src/pages/Purchases.tsx` (badge, filter, update-ID dialog, remove photo thumbnail), `src/pages/Dashboard.tsx` (missing-ID count card).
- Confirmation uses the existing shadcn `AlertDialog`; ID capture reuses `ImageCaptureButton` and `uploadImage("customer-docs", ...)`.
- Missing-ID query: `id_doc_type is null or id_doc_number is null or id_doc_image_url is null` on `old_gold_purchases`.
- No migration and no RLS change required — updates to `old_gold_purchases` are already permitted for staff roles.
