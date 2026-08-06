# Old gold: fine-gold equivalent on the bill + custom purity %

## What changes

1. **Fine gold equivalent shown on the bill.** Wherever an old gold credit is applied to a sale, the bill also shows how many grams of fine (pure) gold that money is worth, printed subtly right next to the old gold amount, e.g. `Customer Old Gold  25,000.00  (≈ 1.786 g fine)`.

2. **How the equivalent is worked out.**
   - The reference is the fine gold rate of the bill. If the sale's gold items are billed at a non-fine purity (e.g. 22K), their rate is converted up to a fine-gold rate first (rate ÷ purity factor, so a 22K rate of Rs X/g becomes X ÷ 0.9167 per fine gram).
   - If several gold lines exist, the highest-value gold line's rate is used as the bill reference; if the bill has no gold line, the latest 24K/999 gold rate from Metal Rates is used.
   - Equivalent grams = old gold credit amount ÷ fine gold rate, displayed to 3 decimals.

3. **Metal-aware equivalent for non-gold trade-ins.** When the traded-in metal is silver (or platinum), the equivalent weight is computed against that metal's fine rate instead of gold — latest fine rate for that metal from Metal Rates, or the bill's line rate for that metal converted to fine. The note then reads e.g. `≈ 128.400 g fine silver`. If no rate exists for that metal, the note is omitted rather than showing a wrong number.

4. **Custom purity everywhere in the old gold module.** The shared old gold purchase form gets the standard purity picker plus a percentage option: type `91.6` and it is stored as `91.6%` and used directly as the purity factor for net → fine weight. Because the form is shared, this applies to every entry point — the standalone Old Gold Purchases screen, the trade-in during a sale, and any other place the form is used. Old gold listings and receipts display the custom purity as entered.

## Where it shows

- Printed invoice and estimate (PrintDocument): small grey `≈ X.XXX g fine <metal>` note under/next to the old gold amount in the totals block.
- Invoice detail on-screen totals row: same note next to the old gold credit line.
- POS sale builder: the same note under the old gold credit input, so staff see the equivalent before finalising.


## Technical notes

- `src/lib/format.ts`: extend `purityFactor` to accept a trailing `%` (e.g. `"91.6%"` → 0.916); add a helper `fineEquivalentGrams(amount, fineRatePerGram)` and `fineRateFromLine(rate, purity)`.
- `src/components/PrintDocument.tsx`: derive the bill's fine rate from the item lines (fallback prop for a latest 24K rate) and render the note in the totals section; no schema change — the value is derived, not stored.
- `src/pages/InvoiceDetail.tsx`, `src/pages/QuotationDetail.tsx`: pass the fallback fine rate (latest gold rate query) to `PrintDocument` and show the note in the on-screen totals.
- `src/pages/POS.tsx`: compute and show the equivalent under the old gold credit field.
- `src/components/OldGoldForm.tsx`: replace the fixed purity `Select` with `PuritySelect` plus a percentage entry mode; existing `purity` text column stores values like `91.6%`, so no migration is needed.
