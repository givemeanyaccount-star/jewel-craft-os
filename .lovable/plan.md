# Editable wastage/making at the counter + tola on quotations and orders

## 1. Edit wastage and making charge while billing

Today a cart line on the sales page only exposes Net Wt, Rate and Stone value; wastage and
making come from the inventory record and can only be changed by opening the inventory edit
dialog. That is too slow at the counter.

- The grey detail strip under each cart line becomes editable for two fields:
  - **Wastage** — amount input plus a type selector (`%`, `Weight`, `Fixed`).
  - **Making** — amount input plus a type selector (`/gram`, `Fixed`, `%`).
- Typing recalculates the line instantly (wastage weight, total weight, gold amount, line
  total) and flows straight into subtotal, SD/VAT, net payable, discount solver and refunds —
  no separate "apply" step.
- The change stays on the bill only; the inventory item's stored wastage/making are untouched
  unless the user opens the inventory edit dialog as before.
- Same two editors are added to the quotation line rows so a quote can be tuned the same way.

## 2. Tola switch on quotations and order forms

- **Quotation lines**: weight and rate fields switch to the shared `g / tola` field used on the
  sales page, with the unit toggle in the table header. The unit choice is the same shared
  preference, so switching on one screen switches everywhere.
- **Order booking / order detail**: line weights and rates already use the tola field; the
  order summary, advance box and receiving views get the grams-with-tola display so the figures
  read the same as the printed order slip.
- **Money stays money**: advance, kept-on-order and refund amounts are currency, so they are not
  unit-switched — they are shown with the same rounding and wording as the printed
  reconciliation block (Advance applied / Kept on order / Refund issued), so screen and paper
  agree line for line.

## Technical notes

- `src/pages/POS.tsx`: extend the per-line detail row with `NumberField` + `Select` bound to
  `wastage_input` / `wastage_type` and `making_input` / `making_type`, dispatched through the
  existing `updateRow` → `recompute` (`computeLineTotal`) path. No new math.
- `src/pages/Quotations.tsx`: same two editors on quote rows; swap the weight/rate
  `NumberField`s for `UnitNumberField` (`mode="rate"` for rate) and add the header unit toggle
  from `useWeightUnit`.
- `src/pages/Orders.tsx` / `src/pages/OrderDetail.tsx`: use `gmsWithTola()` for the weight
  read-outs and align advance/kept-on-order labels with `reconcile()` from `src/lib/format.ts`.
- No schema change, no pricing-rule change; grams and rate-per-gram remain the stored values.
