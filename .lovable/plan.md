# Dashboard Redesign — Heritage Luxury

Rebuilds the dashboard main content in the chosen "Heritage luxury" direction: Playfair Display headings on Inter body, warm off-white canvas, emerald + gold accents, generous card spacing.

## New layout (top to bottom)

1. **Header row** — "Dashboard" in Playfair Display with a subdued uppercase subtitle, and on the right: a discreet palette switcher (small colour dots in a pill) followed by the quick action buttons **New Sale**, **New Purchase**, **New Repair**. New Sale is solid emerald with a thin gold underline; the other two are outlined. Each button appears only for roles that have the matching permission.
2. **Metal rates band** — three cards: Gold 24K, Gold 22K, Silver. Each shows the rate per tola (large) and per 10 g (small), with a 7-day sparkline on the right, green when rising and red when falling.
3. **Ops & alerts row** — four cards:
   - Outstanding credit — dark emerald card, gold figure, thin progress bar
   - Repairs by stage — In workshop / Quality check / Ready to pickup with counts
   - Pending credit — count of customers with dues plus outstanding total
   - Missing-ID old gold alert — soft red card linking to the filtered purchases list (only rendered when count > 0; otherwise the slot shows today's sales)
4. **Main area (2/3 + 1/3)**
   - Daily volume bar chart — sales vs purchases, last 7 days, emerald and gold paired bars
   - Activity log — combined recent invoices, purchases and old gold entries with type badges, scrollable, "View all" footer
5. Existing secondary counts (items in stock, customers, items sold today) are folded into small labels inside the relevant cards so the page stays uncluttered.

## Colour palette switcher

A small pill of colour dots in the dashboard header, low-contrast until hovered. Options:

- **Heritage Emerald** (current default) — deep emerald + gold on warm ivory
- **Noir & Gold** — near-black surfaces with gold accents
- **Navy Trust** — deep navy + crisp white, restrained finance look
- **Burnished Copper** — charcoal + warm copper accents

Choosing a palette swaps the theme instantly and persists per-browser (localStorage). It only changes design tokens — the sidebar, invoices and every other page follow automatically.

## Technical notes

- New file `src/components/ThemeSwitcher.tsx` plus a small `useTheme` hook; each palette is a CSS class (`.theme-noir`, `.theme-navy`, `.theme-copper`) in `src/index.css` overriding the existing HSL tokens. No hardcoded colours in components — the prototype's hex values are converted to tokens.
- Playfair Display + Inter added via `index.html` and wired into `tailwind.config.ts` as `font-display` / `font-sans`.
- `src/pages/Dashboard.tsx` is rebuilt; new presentational pieces under `src/components/dashboard/`: `QuickActions`, `RateCard`, `OpsCards`, `VolumeChart`, `ActivityLog`.
- Charts use `recharts` (already installed); sparkline = `LineChart`, volume = grouped `BarChart`.
- Tola conversion constant (1 tola = 11.6638 g) added to `src/lib/format.ts`.
- Extra queries added to the existing `load()` batch: last-7-day `metal_rates` for gold 24K/22K and silver, last-7-day `invoices` + `purchases` + `old_gold_purchases` aggregated per day client-side, and recent purchase rows for the activity log.
- Quick actions route to `/pos`, `/purchases`, `/repairs`, gated by `usePermission`.
- Presentation only — no database or calculation changes.
