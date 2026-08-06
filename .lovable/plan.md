# Chart Tooltips — Dashboard

Add precise hover tooltips to both dashboard charts so exact dates and values are readable.

## Metal rate sparklines (Gold 24K, Silver)

- Currently the sparklines are plain lines with no interaction.
- Add a hover tooltip showing the full date (e.g. "Mon, 3 Aug 2026") and the rate on that day, formatted both per tola and per 10 g.
- Add a subtle hover dot on the hovered point so it's clear which day is being read.
- Tooltip styling matches the existing card/popover tokens (no hardcoded colours).

## Daily volume bar chart (sales vs purchases)

- Keep the grouped bars, but improve the tooltip:
  - Header shows the full date instead of just the weekday abbreviation.
  - Rows for Sales and Purchases with colour dots matching the bars, values in NPR.
  - A total row underneath.
- Days with zero activity still show the tooltip with zero values.
- X-axis labels stay short (weekday) so the compact chart doesn't crowd.

## Technical notes

- `RateCard` gains a `Tooltip` from recharts plus a shared custom tooltip component; each history point already carries `effective_date`, so no new queries are needed.
- `VolumePoint` gains a `date` field (ISO day key) alongside the existing `day` label; `Dashboard.tsx` already builds the buckets from real dates, so it just passes the key through.
- New `src/components/dashboard/ChartTooltip.tsx` holds the shared tooltip shell used by both charts.
- Presentation only — no data, query, or calculation changes.
