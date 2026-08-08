
-- Helper-free, immutable CHECK constraints. All added NOT VALID so existing rows are untouched.

-- ============ INVOICES ============
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_amounts_nonneg CHECK (
    subtotal >= 0 AND vat_amount >= 0 AND discount >= 0 AND old_gold_credit >= 0
    AND total >= 0 AND amount_paid >= 0 AND luxury_tax >= 0 AND sd_tax >= 0
    AND stones_total >= 0
  ) NOT VALID,
  ADD CONSTRAINT invoices_rates_range CHECK (
    vat_rate BETWEEN 0 AND 100 AND luxury_tax_rate BETWEEN 0 AND 100 AND sd_tax_rate BETWEEN 0 AND 100
  ) NOT VALID,
  ADD CONSTRAINT invoices_amounts_scale CHECK (
    subtotal = round(subtotal, 2) AND vat_amount = round(vat_amount, 2)
    AND discount = round(discount, 2) AND old_gold_credit = round(old_gold_credit, 2)
    AND total = round(total, 2) AND amount_paid = round(amount_paid, 2)
    AND balance_due = round(balance_due, 2) AND luxury_tax = round(luxury_tax, 2)
    AND sd_tax = round(sd_tax, 2) AND stones_total = round(stones_total, 2)
  ) NOT VALID,
  ADD CONSTRAINT invoices_sane_magnitude CHECK (total <= 1e12 AND subtotal <= 1e12) NOT VALID;

-- ============ INVOICE ITEMS ============
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_qty_positive CHECK (quantity >= 1) NOT VALID,
  ADD CONSTRAINT invoice_items_nonneg CHECK (
    making_charge >= 0 AND wastage_amount >= 0 AND stone_value >= 0 AND line_total >= 0
    AND (weight IS NULL OR weight >= 0)
    AND (gross_weight IS NULL OR gross_weight >= 0)
    AND (stone_weight IS NULL OR stone_weight >= 0)
    AND (rate IS NULL OR rate >= 0)
    AND (refund_amount IS NULL OR refund_amount >= 0)
    AND (making_input IS NULL OR making_input >= 0)
    AND (wastage_input IS NULL OR wastage_input >= 0)
  ) NOT VALID,
  ADD CONSTRAINT invoice_items_weight_scale CHECK (
    (weight IS NULL OR weight = round(weight, 3))
    AND (gross_weight IS NULL OR gross_weight = round(gross_weight, 3))
    AND (stone_weight IS NULL OR stone_weight = round(stone_weight, 3))
  ) NOT VALID,
  ADD CONSTRAINT invoice_items_money_scale CHECK (
    making_charge = round(making_charge, 2) AND wastage_amount = round(wastage_amount, 2)
    AND stone_value = round(stone_value, 2) AND line_total = round(line_total, 2)
    AND (rate IS NULL OR rate = round(rate, 2))
    AND (refund_amount IS NULL OR refund_amount = round(refund_amount, 2))
  ) NOT VALID;

-- ============ PURCHASES ============
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_total_valid CHECK (
    total_amount >= 0 AND total_amount = round(total_amount, 2) AND total_amount <= 1e12
  ) NOT VALID;

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_qty_positive CHECK (quantity >= 1) NOT VALID,
  ADD CONSTRAINT purchase_items_nonneg CHECK (
    gross_weight >= 0 AND stone_weight >= 0 AND net_weight >= 0
    AND rate_per_gram >= 0 AND making_charge >= 0 AND total_cost >= 0
  ) NOT VALID,
  ADD CONSTRAINT purchase_items_scale CHECK (
    gross_weight = round(gross_weight, 3) AND stone_weight = round(stone_weight, 3)
    AND net_weight = round(net_weight, 3)
    AND rate_per_gram = round(rate_per_gram, 2) AND making_charge = round(making_charge, 2)
    AND total_cost = round(total_cost, 2)
  ) NOT VALID,
  ADD CONSTRAINT purchase_items_weight_consistent CHECK (stone_weight <= gross_weight) NOT VALID;

-- ============ SALES RETURNS ============
ALTER TABLE public.sales_returns
  ADD CONSTRAINT sales_returns_nonneg CHECK (
    gross >= 0 AND discount >= 0 AND tax_retained >= 0 AND total >= 0 AND refund_paid >= 0
  ) NOT VALID,
  ADD CONSTRAINT sales_returns_scale CHECK (
    gross = round(gross, 2) AND discount = round(discount, 2)
    AND tax_retained = round(tax_retained, 2) AND total = round(total, 2)
    AND refund_paid = round(refund_paid, 2)
  ) NOT VALID;

ALTER TABLE public.sales_return_items
  ADD CONSTRAINT sales_return_items_qty_positive CHECK (qty >= 1) NOT VALID,
  ADD CONSTRAINT sales_return_items_nonneg CHECK (
    original >= 0 AND discount >= 0 AND net >= 0
  ) NOT VALID,
  ADD CONSTRAINT sales_return_items_scale CHECK (
    original = round(original, 2) AND discount = round(discount, 2) AND net = round(net, 2)
  ) NOT VALID;

-- ============ PAYMENTS ============
ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_valid CHECK (
    amount <> 0 AND amount = round(amount, 2) AND abs(amount) <= 1e12
  ) NOT VALID;

-- ============ OLD GOLD PURCHASES ============
ALTER TABLE public.old_gold_purchases
  ADD CONSTRAINT old_gold_nonneg CHECK (
    gross_weight >= 0 AND stone_weight >= 0 AND net_weight >= 0 AND fine_weight >= 0
    AND rate_per_gram >= 0 AND deduction >= 0 AND total_amount >= 0
  ) NOT VALID,
  ADD CONSTRAINT old_gold_scale CHECK (
    gross_weight = round(gross_weight, 3) AND stone_weight = round(stone_weight, 3)
    AND net_weight = round(net_weight, 3) AND fine_weight = round(fine_weight, 3)
    AND rate_per_gram = round(rate_per_gram, 2) AND deduction = round(deduction, 2)
    AND total_amount = round(total_amount, 2)
  ) NOT VALID,
  ADD CONSTRAINT old_gold_weight_consistent CHECK (stone_weight <= gross_weight) NOT VALID;

-- ============ INVENTORY ITEMS (weights/money used by all flows) ============
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_nonneg CHECK (
    gross_weight >= 0 AND stone_weight >= 0 AND net_weight >= 0 AND fine_weight >= 0
    AND making_charge >= 0 AND wastage_value >= 0 AND stone_value >= 0
  ) NOT VALID,
  ADD CONSTRAINT inventory_items_scale CHECK (
    gross_weight = round(gross_weight, 3) AND stone_weight = round(stone_weight, 3)
    AND net_weight = round(net_weight, 3) AND fine_weight = round(fine_weight, 3)
    AND making_charge = round(making_charge, 2) AND stone_value = round(stone_value, 2)
  ) NOT VALID;

-- ============ METAL RATES ============
ALTER TABLE public.metal_rates
  ADD CONSTRAINT metal_rates_valid CHECK (
    rate_per_gram > 0 AND rate_per_gram = round(rate_per_gram, 2) AND rate_per_gram <= 1e9
  ) NOT VALID;
