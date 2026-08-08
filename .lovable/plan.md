# Simplify metal purity categories (gold + silver only)

## Goal
Reduce purities to the ones actually traded, derive all rates from a single fine rate per metal, and drop platinum from the app.

## Gold
- Standard categories only: 24K (fine), 22K (916, 91.6%), 18K (750, 75%), 14K (585, 58.5%).
- 20K and 9K are removed from all pickers and rate entry.
- Enter only the 24K rate; 22K / 18K / 14K are computed as 91.6% / 75% / 58.5% of it (editable before saving).
- Labels show the fineness, e.g. "22K (916 · 91.6%)".

## Silver
- Categories: 999 (fine silver) and 925 (sterling, 92.5%).
- Enter only the fine silver rate; 925 is computed at 92.5%.

## Custom purity
- A toggle in Settings ("Allow custom purity") controls whether the "Custom purity…" / "Purity percentage…" options appear in purity pickers (POS, inventory, old gold, repairs, purchases). Default: on.
- Custom purity is never part of the daily rate sheet — rate entry stays fixed to the standard categories.

## Platinum
- Removed from every metal picker (rates, inventory, purchases, repairs, old gold). Gold, silver, diamond and other remain where they already exist.
- Database check: there are currently **no platinum rows** in inventory, invoices, quotations, purchases, repairs, old gold or rates, so no records need converting. If any appear during the change, they are converted to gold 22K and their fine weight / amounts recalculated.

## Data cleanup (existing records)
A few rows carry purities that no longer fit their metal or the new list:
- gold rows tagged 925 (1 inventory item, 1 invoice line) → 22K
- silver item tagged 22K (1 inventory item) → 925
- gold 20K rows (1 inventory item, 1 invoice line, 1 rate) → 22K
- gold 999 rate rows and a silver 24K rate row → gold 24K / silver 999
- gold 9K rate history rows → removed
Fine weight and fine-weight-derived values are recalculated for the touched inventory items. Historical invoice totals are left untouched (only the purity label is corrected).

## Missing rates
Where a standard category has no rate for a given day, a rate is generated from that day's fine rate using the purity factor. For days with no fine rate at all in the last 7 days (chart history), a plausible value is generated near the most recent known rate so the dashboard trend has no gaps.

## Technical notes
- `src/hooks/useAppSettings.ts`: purities default becomes `["24K","22K","18K","14K","999","925"]`; add `allow_custom_purity` (new boolean column on `app_settings`, default true).
- `src/lib/format.ts`: keep `purityFactor`, but add explicit factors so 22K = 0.916, 18K = 0.75, 14K = 0.585 (instead of raw karat/24).
- `src/components/PuritySelect.tsx`: gain a metal-aware option list and honour the custom-purity toggle.
- `src/pages/MetalRates.tsx` and `src/components/DailyRateDialog.tsx`: single fine-rate input per metal with derived rows; purity filter list updated.
- `supabase/functions/fetch-gold-rate/index.ts`: emit only 24K/22K/18K/14K gold and 999/925 silver with the new factors.
- `METALS` constants in MetalRates, Purchases, Repairs, OldGoldForm, Inventory drop platinum.
- Migrations: add the settings column; data-fix and rate-backfill run as data updates.
