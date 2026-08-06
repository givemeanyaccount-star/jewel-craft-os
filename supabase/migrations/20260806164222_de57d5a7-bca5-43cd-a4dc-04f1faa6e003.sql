DROP POLICY IF EXISTS "sales update inventory status only" ON public.inventory_items;

CREATE POLICY "sales update inventory status only"
ON public.inventory_items
FOR UPDATE
TO authenticated
USING (private.has_role(auth.uid(), 'sales'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'sales'::app_role));

CREATE OR REPLACE FUNCTION public.enforce_sales_status_only_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins and managers may change anything
  IF private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role) THEN
    RETURN NEW;
  END IF;

  IF private.has_role(auth.uid(), 'sales'::app_role) THEN
    -- Force every column except status/updated_at back to its previous value
    NEW.sku := OLD.sku;
    NEW.barcode := OLD.barcode;
    NEW.qr_code := OLD.qr_code;
    NEW.name := OLD.name;
    NEW.description := OLD.description;
    NEW.category_id := OLD.category_id;
    NEW.metal := OLD.metal;
    NEW.purity := OLD.purity;
    NEW.gross_weight := OLD.gross_weight;
    NEW.stone_weight := OLD.stone_weight;
    NEW.net_weight := OLD.net_weight;
    NEW.fine_weight := OLD.fine_weight;
    NEW.making_charge := OLD.making_charge;
    NEW.making_charge_type := OLD.making_charge_type;
    NEW.wastage_type := OLD.wastage_type;
    NEW.wastage_value := OLD.wastage_value;
    NEW.stone_value := OLD.stone_value;
    NEW.location_id := OLD.location_id;
    NEW.image_urls := OLD.image_urls;
    NEW.received_from := OLD.received_from;
    NEW.received_at := OLD.received_at;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_sales_status_only ON public.inventory_items;
CREATE TRIGGER trg_inventory_sales_status_only
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_status_only_update();

REVOKE EXECUTE ON FUNCTION public.enforce_sales_status_only_update() FROM PUBLIC, anon, authenticated;