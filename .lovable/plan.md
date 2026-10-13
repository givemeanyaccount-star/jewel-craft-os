# Compact Nepali date popup and clear advance layout

## What will change

### 1. One compact date box
- Replace the three inline Nepali year/month/day selectors with a single date box and calendar icon, similar in size to the English date input.
- Clicking it opens a small **true Nepali (BS) month calendar**, not an English calendar with renamed headings.
- Use **English digits (1, 2, 3)** with the existing month names, such as Baisakh and Ashwin.
- Include previous/next month arrows and compact month/year selectors for quickly reaching older dates. Highlight today and the selected day; selecting a day closes the popup.
- Keep the existing English date input unchanged. Keep the shared AD | BS choice remembered on the device and place its switch beside date entry without overlapping labels.
- Show the equivalent English date below the Nepali date box in normal document flow. Allow clearing only where the field permits it.

### 2. Fix advance date and amount overlap
- The sale payment row currently places the payment method, a fixed-width advance date, amount and remove button on one line. The Nepali date field currently contains three selectors.
- Keep payment method, amount and remove action together; place the advance's **Date paid** on a separate labelled line beneath them, with its AD | BS switch nearby.
- Remove the fixed-height constraint that leaves no room for the alternate-date caption. Give the amount a stable width and let surrounding controls shrink safely.
- Apply the same label/switch spacing to the order Advances window. Do not change payment saving or advance calculations.

### 3. Use the popup everywhere Nepali dates are entered
- Update the shared date field so sale dates, order dates, advances, order booking and corrections, repairs, purchases and sales-report filters all receive the same popup.
- Preserve each field's existing minimum/maximum dates, disabled state, required/optional behavior and validation.
- Disable disallowed days in the calendar rather than silently selecting a different date. Do not change saved dates, posted bills, reports or pricing logic.

## Technical approach
- Use the existing Shadcn Popover and Button components. Build a reusable BS calendar body using the installed Nepali conversion library for month lengths, weekdays and BS/AD conversion; the existing Gregorian Calendar cannot represent BS month boundaries directly.
- Keep the shared `DateField` interface and AD `YYYY-MM-DD` values unchanged. Parse date-only values without timezone drift.
- Put `pointer-events-auto` on the calendar wrapper so it works inside dialogs. Constrain the popup to the available screen width and use portalled positioning to avoid clipping.
- Support keyboard navigation, labelled controls, focus restoration and Escape to close. Use existing design tokens.

## Verification
- Add tests for selecting BS dates, month/year changes, conversion round trips, date limits, clearing and disabled fields.
- Check advance entry with a real selected customer and bill item: open the popup, select a past date, enter an amount, and confirm neither control overlaps or changes the other value. Do not post a test sale.
- Check the popup inside the order Advances dialog and a sales-report filter, including AD/BS switching and blocked future dates.
- Verify narrow-phone and desktop layouts, popup placement and keyboard interaction; run the relevant tests and check preview errors.