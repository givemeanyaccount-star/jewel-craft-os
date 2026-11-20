# Docked dual-column POS counter with F2 / F4 / F8 shortcuts

## What changes for staff
- **Two fixed columns on laptop/desktop screens (wide screens):**
  - Left (about 65%): item search with QR, cart lines, old metal. This column scrolls by itself.
  - Right (about 35%): customer, advances, discount, round-off, payments, totals and the Complete Sale button. It stays docked to the screen height and scrolls by itself, so the Complete Sale button is always visible.
- **Customer moves to the top of the right column** so the left side holds only items.
- **Keyboard shortcuts** (shown as small key labels on the buttons):
  - **F2**: jump to the item search box (also selects any existing text, ready for a scan)
  - **F4**: hold the bill (opens the hold note box)
  - **F8**: complete the sale (runs the same checks as clicking, including the rate-fallback confirmation)
  - The shortcuts are paused while a popup is open, and F8 does nothing while a sale is already processing. The browser's own F-key actions are blocked on this page.
- **A small shortcut hint bar** at the top of the left column.
- **Phones and tablets:** a single column as now, plus a sticky bottom bar with the net payable and the Complete Sale button.
- All calculations, held bills, preview, drafts and the exit guard stay the same.

## Technical details
- Restructure only the layout JSX in `src/pages/POS.tsx` (~lines 1163–1414). Wrap it in `lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]` with `lg:h-[calc(100vh-<header>)]`. Each column gets `lg:overflow-y-auto`.
- Move the Customer card into the right column, above Summary.
- Add a ref on the item search input (forwarded from the existing search field).
- Add `src/hooks/usePosShortcuts.ts`. It adds a window keydown listener for F2/F4/F8 with `preventDefault`, and skips when `document.querySelector('[role="dialog"],[role="alertdialog"]')` is open. Its handlers are focusSearch, open hold (only when the bill has changes and nothing is saving), and checkout().
- Add a `Kbd` badge component that uses semantic tokens.
- Add a unit test covering the shortcut key mapping and dialog suppression.
- Record the layout and shortcut rule in AGENTS.md.
