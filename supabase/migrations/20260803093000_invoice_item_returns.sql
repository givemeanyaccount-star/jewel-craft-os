ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_disposition text,
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS new_inventory_item_id uuid REFERENCES public.inventory_items(id);
