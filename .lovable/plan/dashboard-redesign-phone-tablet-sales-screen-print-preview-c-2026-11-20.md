# Dashboard redesign, phone/tablet sales screen, print preview check

## 1. Dashboard redesign (suggested layout)
Today the page stacks: header + quick buttons, 3 rate cards + rate chart, up to 6 status cards, sales chart + activity. On a phone this is a long scroll before anything actionable.

New order, top to bottom:
1. **Today strip** (one compact row): Today's sales, bills count, cash in hand (from Day Close), pending credit. Tap opens the matching report.
2. **Quick actions**: big New Sale button plus Order / Repair / Purchase / Quotation. On phone: a 2x2 grid of large tap targets.
3. **Needs attention** list (only items with a count > 0): rate not set today, held bills, orders due/ready to bill, repairs due, weight adjustments pending, missing old-metal ID, quotations expiring. Each row links straight to the filtered list. Replaces most of the separate cards.
4. **Rates**: one compact card with 24K / 22K / Silver per tola and per 10 g, small trend sparkline; full chart collapsible ("Show trend").
5. **Work in progress**: Repair stages and Orders side by side (stacked on phone), Karigar metal for managers.
6. **Recent activity + 7-day sales chart**: on phone, shown as tabs to save space.

Layout per screen: phone 1 column, tablet 2 columns, desktop 3 columns with attention list on the right.

## 2. Sales (New Sale) screen for phone and tablet
- **Phone (<768px)**: step tabs at top — Items / Customer & Old metal / Payment. Sticky bottom bar keeps Net payable + Complete Sale (exists) and adds Hold and Preview.
- Cart lines become compact cards: name, weight, amount on one line; wastage/making/rate fields open in an "Edit line" sheet instead of a 5-column grid.
- Search/QR bar sticky at top of the Items tab; QR button large.
- Number fields use numeric keypad (inputMode decimal); touch targets at least 44px.
- **Tablet (768–1023px)**: two columns (items left, payment panel right, ~60/40) instead of the current single column; docked layout kicks in at tablet width, not only desktop.
- Hide keyboard-shortcut hints on touch screens.

## 3. Print preview check (phone/tablet)
- Open bill preview at 421px and 820px and confirm: dialog fits the screen (full-screen on phone), the A4 bill scales to fit width instead of horizontal scrolling, Print / PDF / Diagnostics buttons wrap into a bottom action bar, pinch-zoom still works.
- Fix what fails; printed output (paper layout) stays unchanged.
- Check other print pages too: invoice, order, repair, purchase, old-metal receipt, sales return.

## Verification
Browser checks at 421x766 (phone), 820x1180 (tablet), 1280 (desktop): dashboard, a full sale with a real item, hold, preview, and print preview. Existing tests rerun.

## Technical details
- Dashboard.tsx: new `TodayStrip`, `AttentionList` (reuses useNavBadges counts + existing stats), collapsible RateTrendChart; responsive grid `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`.
- POS.tsx: `useIsMobile`-driven tab state for <md; change docked grid breakpoint from `lg` to `md` with `md:grid-cols-[minmax(0,60fr)_minmax(0,40fr)] lg:[65/35]`; line editor in a Sheet on phone.
- PrintPreview.tsx: `h-[100dvh] max-w-full sm:h-[92vh] sm:max-w-5xl`, ResizeObserver scale of the A4 page to container width, footer action bar.
