# Tag fields: add Stone price and set your usual layout

## What you get
Gross weight, metal & purity, net weight and the QR code are already on the tag. **Stone price** is the only detail missing, so this plan adds it.

- **New tag detail: Stone price.** It shows the item's saved stone value, for example "St Rs 4,500". The label before the value can be changed like any other detail. Items with no stone value leave it off, the same way stone weight works today.
- **Other new options you can add:**
  - **Purity only** (for example "22K"), separate from metal
  - **Category** (for example "Ring")
- **New default layout for the 30373 rat-tail tag:**
  - Top half: QR code, Item code, Purity
  - Bottom half: Gross wt, Net wt, Stone price
- Your saved design is kept. "Reset to default" switches to the new layout.
- Item code, stone weight, old record no. and the rest can still be added from the "Add" buttons.

## Technical details
- `src/lib/tagTemplate.ts`: add `stoneValue`, `purity` and `category` to TagField and TAG_FIELD_LABELS, with default prefix "St Rs" for stone price. Add `stone_value` and `category` to TagItem and the fieldValue cases (money uses 2 decimals and Nepali grouping, and is hidden when the value is 0). Change DEFAULT_TAG to left (top): QR, sku, purity; right (bottom): gross, net, stoneValue.
- Load `stone_value` and the category name wherever tag items are loaded: TagPrinting select (`stone_value, categories(name)`). Inventory and ItemDetail already use `select("*")`, so only the category name needs mapping.
- Tests in `src/test/tagTemplate.test.ts`: stone price formats as "St Rs 4,500.00", a 0 stone price is hidden, and the default layout is top = sku, purity (with QR) and bottom = gross, net, stoneValue.

# Designer additions: logo, sizing, defaults per tag type

## What you get
- **Logo:** upload your shop logo from the designer. It appears as a tag detail you can tap, move between halves, resize or remove, just like the QR code. Black-and-white logos print best on thermal labels.
- **Sizing:**
  - Each detail keeps its own text size. A new **size slider** sets it between 3 pt and 12 pt.
  - A **QR size** control (6 to 11 mm) and a **logo size** control.
  - A **Scale all text** slider (70% to 150%) makes every detail bigger or smaller together.
- **Save as default, per tag type:** the rat-tail tag and the barbell tag each keep their own design. Changing the tag type switches to that type's design. **Save as default** stores the current design for that tag type. **Reset** goes back to your saved default, or to the built-in layout if you never saved one.
- The designer can also be opened without printing from Stock > Tag Designer, so you can set things up first.

## Technical details (additions)
- TagTemplate gains `qrMm`, `logoMm`, `scale`, `showLogo`, `logoSide` and `logo` (a small data URL, resized to at most 200 px on upload). Logo and QR render in the flap before the text, and `scale` multiplies each field's text size in print CSS and the editor preview.
- Storage per stock: `jm.tagTemplate.v2.<stock>` holds the working design and `jm.tagDefault.<stock>` holds the user's saved default, migrating from v1 on first load. Switching the stock type loads that stock's template. This is browser-local per device, the same as today.
- Tests: scale changes the printed font size, the logo appears in the HTML only when enabled, and each stock's saved default stays separate.
