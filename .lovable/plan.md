# Tag fields: add Stone price and set your usual layout

## What you get
Gross weight, metal & purity, net weight and the QR code are already on the tag. **Stone price** is the only detail missing, so this plan adds it.

- **New tag detail: Stone price.** It shows the item's saved stone value, for example "St Rs 4,500". The label before the value can be changed like any other detail. Items with no stone value leave it off, the same way stone weight works today.
- **Other new options you can add:**
  - **Purity only** (for example "22K"), separate from metal
  - **Category** (for example "Ring")
- **New default layout for the 30373 rat-tail tag:**
  - Top half: QR code, Metal & purity, Gross wt
  - Bottom half: Net wt, Stone price
- Your saved design is kept. "Reset to default" switches to the new layout.
- Item code, stone weight, old record no. and the rest can still be added from the "Add" buttons.

## Technical details
- `src/lib/tagTemplate.ts`: add `stoneValue`, `purity` and `category` to TagField and TAG_FIELD_LABELS, with default prefix "St Rs" for stone price. Add `stone_value` and `category` to TagItem and the fieldValue cases (money uses 2 decimals and Nepali grouping, and is hidden when the value is 0). Change DEFAULT_TAG to left: metal, gross; right: net, stoneValue.
- Load `stone_value` and the category name wherever tag items are loaded: TagPrinting select (`stone_value, categories(name)`). Inventory and ItemDetail already use `select("*")`, so only the category name needs mapping.
- Tests in `src/test/tagTemplate.test.ts`: stone price formats as "St Rs 4,500.00", a 0 stone price is hidden, and the default layout contains gross, metal, net and stoneValue.
