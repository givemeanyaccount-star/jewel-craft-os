# Weight adjustments: tolerance, AI risk review, and edit-menu access

## What you will get

1. **Tolerance setting (grams per item)**
   - New setting on the Settings page: "Weight adjustment tolerance (g)".
   - Only managers and admins can see or change it. Everyone else is blocked by the server too.
   - Every change to the tolerance is written to the audit log (old value, new value, who, when).

2. **How the tolerance works**
   - **Within tolerance** (the change in net weight is no more than the limit): the change is applied straight away. It is still recorded with a reason, who did it and the before and after weights, and it shows as "Within tolerance" in the history.
   - **Above tolerance**: the request is saved but marked **Flagged**. A manager must approve it, a different manager unless the approver is an admin, and must enter an approval note. Stock does not change until then.
   - If you meant that even small changes should wait for approval, tell me and I will change only this rule.

3. **AI risk review for managers**
   - On each pending request, a "Review with AI" button sends the request, the item's details (metal, purity, weights, category, location, age in stock, status) and its full adjustment history to the AI.
   - The AI returns:
     - a risk level (low / medium / high)
     - the inconsistencies it found, for example repeated losses on the same item, stone weight above gross, fine weight not matching purity, many requests from one staff member, a change above tolerance, or a reason that does not match the change
     - a short summary to help the manager decide
   - The AI only advises. The manager still approves or rejects, and the AI summary is saved with the decision in the audit trail.

4. **"Adjust weight" available wherever items are edited**
   - In the item edit window on the Inventory page, an "Adjust weight" button sits beside the locked weight fields.
   - Also on the item page (already there), in the Inventory list row actions, and in the item list of the Stock & Metal Report.
   - The button only shows for staff allowed to manage inventory and for items that are in stock or reserved.

5. **Effect on stock, sales and books**
   - **Stock & Metal Report:** reflects applied changes immediately, because it reads live weights.
   - **Fiscal-year books:** a new "Weight adjustments" sheet lists every applied change in the year with gross, net and fine gram differences. It also shows totals by metal and purity, so year-end stock reconciles with the opening balance plus purchases, minus sales, plus or minus adjustments.
   - **Sales:** only items in stock or reserved can be adjusted, so posted bills never change. If an item is on a held bill or an open quotation, the new weight is shown when that bill or quotation is resumed, with a notice that the weight changed.
   - **Dashboard:** a small card shows how many adjustments are pending or flagged.

## Technical details

- **Settings:** `app_settings.weight_tolerance_grams numeric default 0.050`. A change is saved through a SECURITY DEFINER RPC that checks for the manager or admin role and writes to audit_logs.
- **Request:** `request_inventory_weight_adjustment` reads the tolerance and compares |new_net - old_net|.
  - Within tolerance: it applies the change immediately (using the existing trigger bypass flag) and sets status `approved`, `auto_applied=true`, `within_tolerance=true`.
  - Otherwise: status `pending`, `within_tolerance=false`.
  - New columns: `within_tolerance boolean`, `auto_applied boolean`, `ai_risk_level text`, `ai_summary jsonb`, `ai_reviewed_at timestamptz`.
- **Review:** `review_inventory_weight_adjustment` requires a note when approving a flagged request.
- **AI:** a new edge function `weight-adjustment-review` using `@lovable.dev/ai-gateway` and the workspace default text model, with structured JSON output.
  - It checks that the caller has the `inventory_adjust_approve` permission.
  - It loads the request, the item and the history on the server; nothing the client sends is trusted.
  - It saves the result on the request and handles the gateway's rate-limit and credit errors with clear messages.
- **Fiscal books:** add an adjustments section to `capture_fiscal_books` and a new sheet to the Excel export.
- **UI:**
  - Shared `WeightAdjustmentDialog`, reused by the Inventory edit dialog, the list rows, the item page and the stock report.
  - The dialog shows the tolerance and a live "within tolerance" or "will be flagged" badge.
- **Tests:**
  - Unit tests for the tolerance rule: exactly at the limit is within; 0.001 g over is flagged.
  - A test for the manager-only setting check.
