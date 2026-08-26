# Fix: "Apply" net payable lands a paisa off the entered amount

## What happens today

At POS, entering a target net payable (e.g. 150,000) and clicking Apply back-solves a discount by binary search. The search stops as soon as it is within 1 paisa of the target and then rounds the discount to 2 decimals. The bill total is recomputed from that *rounded* discount, so the displayed net payable can come out as 149,999.98 / 150,000.01 instead of the clean number typed in.

A second cause: taxes scale the discount. With SD tax at 0.5% (and VAT on stones), one paisa of discount moves the total by slightly more than one paisa, so some exact targets are simply not reachable with a paisa-level discount alone — the solver has no way to close the last fraction.

## The fix

1. **Exact snap after the solve.** After the binary search, test the candidate discount and its neighbours at 0.01 steps, and keep the one whose recomputed *net payable* (not the raw pre-rounding total) is closest to the entered target. This removes the rounding drift in the common case.
2. **Round-off adjustment for the unreachable remainder.** If no paisa-level discount hits the target exactly, absorb the leftover (always under 1 rupee) into the discount as a round-off so the final total matches exactly, and surface it in the success toast ("Discount set to X — includes Y round-off").
3. **Same treatment for refund mode.** The target-refund solver has the identical rounding stop condition; apply the same snap so an entered refund amount is matched to the paisa.
4. **Verification band.** Keep the "cannot reach this amount" warning, but check it against the snapped result so a reachable target is never reported as unreachable.

## Technical notes

- `src/lib/format.ts`: refine `discountForTargetTotal` and `discountForTargetRefund` — after bisection, evaluate `computeInvoiceTaxes` at the candidate ±0.01/±0.02 and pick the minimum-error discount; return the exact-match discount when one exists.
- `src/pages/POS.tsx` (`applyTargetTotal`): compare the reached net payable against the target using the snapped discount, and report any residual round-off in the toast.
- `src/test/netPayableConsistency.test.ts`: add cases asserting that applying a whole-rupee target (with and without stones/VAT, with old metal credit, and in refund mode) yields a net payable exactly equal to the target.
