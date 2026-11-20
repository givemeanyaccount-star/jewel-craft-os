# UI review: easier navigation, compact key info, more intuitive screens

## What I found
- The side menu has 22+ links in 5 groups. Reports (Sales, Stock, Fiscal Years) are spread across the Sell and Operate groups. Setup-only pages (Shop Setup, Bring Over Old Data) stay visible every day.
- Today's metal rates appear only on the Dashboard and inside the sale screen.
- You can't jump straight to a bill, customer or item from anywhere in the app.
- On phones, the menu is a full drawer, so getting to Sale, Counter or Inventory takes extra taps.
- Pending work is visible only on the Dashboard: held bills, flagged weight changes, repairs that are due, and orders that are due.

## Proposed changes (in priority order)
1. **Reorganized menu.** Groups become Sell, Orders & Repairs, Stock, Reports, People, Setup. Rarely used setup pages fold into a collapsible "Setup" group. Each group can be collapsed, and the app remembers the choice.
2. **Rate strip in the top bar.** Today's 24K, 22K and Silver rates are always visible, with a warning dot if today's rate is not set yet. Tapping it opens Metal Rates.
3. **Quick search (Ctrl+K or a search icon).** One box finds invoices, customers by name or phone, items by SKU or old record number, and orders. It also jumps to any page.
4. **Number badges on menu items.** Counter shows held bills, Weight Adjustments shows those waiting for approval, and Repairs and Orders show those due today.
5. **Phone bottom bar.** Buttons for Home, New Sale, Counter, Inventory and More (opens the full menu).
6. **Compact tables.** Tighter row height on lists (Invoices, Inventory, Orders). Key numbers sit in one summary strip above each list (count, total value, total weight).
7. **Consistent page headers.** Every page has the title, the main action on the right, and filters in one row that wraps on phones.
8. **A "New" button in the top bar.** One menu to start a new Sale, Order, Repair, Purchase or Quotation from any page.

## Not changed
Calculations, permissions, bill formats and data stay as they are. Menu items stay hidden from staff who lack the permission.

## Technical details
- `src/components/AppLayout.tsx`: change NAV_SECTIONS, add collapsible groups (localStorage), RateTicker, NewMenu, badge counts, and a mobile bottom nav (`md:hidden`, plus main padding-bottom).
- New `src/components/CommandPalette.tsx` using shadcn `Command`. It runs debounced RLS-scoped queries on invoices, customers, inventory_items and orders (limit 5 each) and lists static page links filtered by permission.
- New `src/hooks/useNavBadges.ts`. It runs light head-count queries every 60 s and is skipped when the user lacks the permission.
- Shared `PageHeader` and `StatStrip` components, applied to the list pages. Tables get a `compact` density class.
- Tests: grouping and permission filtering of the menu; the badge-count helper.
