# Tola support for weights and rates

Add tola as a first-class entry unit alongside grams, everywhere weights and metal rates are typed or displayed. Grams stay the single source of truth in the database — tola is a conversion layer (1 tola = 11.6638 g).

## How it will work

- **Dual entry.** Weight and rate fields get a compact `g / tola` unit switch. Typing in either unit instantly converts and updates the other; the value saved is always grams (or rate per gram).
- **Grams stay primary.** Sales screens, invoices, tags and quotations keep grams as the headline figure, with the tola equivalent shown subtly beneath or beside it (small, muted text).
- **Rounding.** Weights round to 3 decimals in grams and 4 decimals in tola (so a 3-decimal gram value survives a round trip). Rates round to 2 decimals in both units. Conversion happens on the raw number, never on the displayed rounded string, so no drift accumulates.

## Where it appears

1. **Metal rates** (daily rate setup + rates page): enter the fine rate per gram or per tola; the card shows both, with per-tola prominent since that is how the market quotes it.
2. **Inventory item form**: gross / stone / net weight accept tola input; item detail and list show `g` with tola underneath.
3. **POS cart line editor**: weight and rate fields accept either unit; line summary shows grams with tola equivalent.
4. **Old Metal purchase**: weight and rate in either unit; receipt shows grams plus tola.
5. **Orders / production** (expected and received weights) and **repairs** in/out weights: same dual entry.
6. **Printed documents** (invoice, quotation, old metal receipt, tags): grams as the printed value with a small tola figure next to it, so the layout stays compact.

## Technical notes

- Extend `src/lib/format.ts`: `TOLA_GRAMS` already exists; add `gramsToTola`, `tolaToGrams`, `tolas(n)` formatter (mirrors `gms`), `ratePerTola` / `ratePerGramFromTola`, and a combined `gmsWithTola()` display helper.
- New `src/components/ui/unit-number-field.tsx`: wraps the existing `NumberField`, holds the unit in local state (default `g`, remembered per user in `localStorage`), emits grams via `onChange`. A `mode="weight" | "rate"` prop sets decimals.
- Replace the weight/rate `NumberField` usages in Inventory, POS, OldGoldForm, Orders/OrderDetail, Production, Repairs, MetalRates and DailyRateDialog with the new field.
- Display-only changes in `PrintDocument.tsx`, `InvoiceDetail.tsx`, `QuotationDetail.tsx`, `ItemDetail.tsx` and tag rendering use `gmsWithTola()`.
- No database migration: all columns remain grams / rate-per-gram.
- Add unit tests for conversion round-tripping and rounding stability in `src/test/`.
