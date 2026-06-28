
-- ============ ENUMS ============
CREATE TYPE public.metal_type AS ENUM ('gold','silver','platinum','diamond','other');
CREATE TYPE public.wastage_type AS ENUM ('percentage','weight','fixed');
CREATE TYPE public.item_status AS ENUM ('in_stock','reserved','sold','returned','melted','transferred');
CREATE TYPE public.quotation_status AS ENUM ('draft','sent','accepted','rejected','expired','converted');
CREATE TYPE public.invoice_status AS ENUM ('draft','issued','partial','paid','cancelled','refunded');
CREATE TYPE public.payment_method AS ENUM ('cash','card','bank_transfer','esewa','khalti','fonepay','credit','old_gold','other');
CREATE TYPE public.id_doc_type AS ENUM ('citizenship','passport','license','national_id','other');

-- ============ CATEGORIES ============
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write categories" ON public.categories FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_cat_upd BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SHOWCASE LOCATIONS ============
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read locations" ON public.locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write locations" ON public.locations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_loc_upd BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ METAL RATES ============
CREATE TABLE public.metal_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metal metal_type NOT NULL,
  purity text NOT NULL,
  rate_per_gram numeric(12,2) NOT NULL,
  effective_date date NOT NULL DEFAULT current_date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metal_rates TO authenticated;
GRANT ALL ON public.metal_rates TO service_role;
ALTER TABLE public.metal_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read rates" ON public.metal_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write rates" ON public.metal_rates FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant'));

-- ============ INVENTORY ITEMS ============
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  barcode text UNIQUE,
  qr_code text UNIQUE,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES public.categories(id),
  metal metal_type NOT NULL DEFAULT 'gold',
  purity text NOT NULL DEFAULT '22K',
  gross_weight numeric(10,3) NOT NULL DEFAULT 0,
  stone_weight numeric(10,3) NOT NULL DEFAULT 0,
  net_weight numeric(10,3) NOT NULL DEFAULT 0,
  fine_weight numeric(10,3) NOT NULL DEFAULT 0,
  making_charge numeric(12,2) NOT NULL DEFAULT 0,
  making_charge_type text NOT NULL DEFAULT 'per_gram',
  wastage_type wastage_type NOT NULL DEFAULT 'percentage',
  wastage_value numeric(10,3) NOT NULL DEFAULT 0,
  stone_value numeric(12,2) NOT NULL DEFAULT 0,
  location_id uuid REFERENCES public.locations(id),
  image_urls text[] NOT NULL DEFAULT '{}',
  status item_status NOT NULL DEFAULT 'in_stock',
  received_from text,
  received_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_status ON public.inventory_items(status);
CREATE INDEX idx_items_cat ON public.inventory_items(category_id);
CREATE INDEX idx_items_search ON public.inventory_items USING gin (to_tsvector('simple', coalesce(name,'')||' '||coalesce(sku,'')||' '||coalesce(description,'')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read items" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write items" ON public.inventory_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'));
CREATE TRIGGER trg_items_upd BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  email text,
  address text,
  city text,
  id_doc_type id_doc_type,
  id_doc_number text,
  id_doc_image_url text,
  notes text,
  credit_limit numeric(12,2) NOT NULL DEFAULT 0,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cust_phone ON public.customers(phone);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write customers" ON public.customers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'));
CREATE TRIGGER trg_cust_upd BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ QUOTATIONS ============
CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id),
  status quotation_status NOT NULL DEFAULT 'draft',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  valid_until date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read quotes" ON public.quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write quotes" ON public.quotations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'));
CREATE TRIGGER trg_q_upd BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id),
  description text NOT NULL,
  metal metal_type,
  purity text,
  weight numeric(10,3),
  rate numeric(12,2),
  making_charge numeric(12,2) NOT NULL DEFAULT 0,
  wastage_amount numeric(12,2) NOT NULL DEFAULT 0,
  stone_value numeric(12,2) NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotation_items TO service_role;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all quote items" ON public.quotation_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'));

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id),
  quotation_id uuid REFERENCES public.quotations(id),
  status invoice_status NOT NULL DEFAULT 'issued',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 13,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  old_gold_credit numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  balance_due numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_cust ON public.invoices(customer_id);
CREATE INDEX idx_inv_status ON public.invoices(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write invoices" ON public.invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'));
CREATE TRIGGER trg_inv_upd BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id),
  description text NOT NULL,
  metal metal_type,
  purity text,
  weight numeric(10,3),
  rate numeric(12,2),
  making_charge numeric(12,2) NOT NULL DEFAULT 0,
  wastage_amount numeric(12,2) NOT NULL DEFAULT 0,
  stone_value numeric(12,2) NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all invoice items" ON public.invoice_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'));

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id),
  amount numeric(12,2) NOT NULL,
  method payment_method NOT NULL DEFAULT 'cash',
  reference text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write payments" ON public.payments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'accountant'));

-- ============ OLD GOLD PURCHASE ============
CREATE TABLE public.old_gold_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id),
  customer_name text NOT NULL,
  customer_phone text,
  id_doc_type id_doc_type,
  id_doc_number text,
  id_doc_image_url text,
  customer_photo_url text,
  metal metal_type NOT NULL DEFAULT 'gold',
  purity text NOT NULL,
  gross_weight numeric(10,3) NOT NULL,
  stone_weight numeric(10,3) NOT NULL DEFAULT 0,
  net_weight numeric(10,3) NOT NULL,
  fine_weight numeric(10,3) NOT NULL,
  rate_per_gram numeric(12,2) NOT NULL,
  deduction numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL,
  payment_method payment_method NOT NULL DEFAULT 'cash',
  linked_invoice_id uuid REFERENCES public.invoices(id),
  notes text,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.old_gold_purchases TO authenticated;
GRANT ALL ON public.old_gold_purchases TO service_role;
ALTER TABLE public.old_gold_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read oldgold" ON public.old_gold_purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write oldgold" ON public.old_gold_purchases FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'sales'));
CREATE TRIGGER trg_og_upd BEFORE UPDATE ON public.old_gold_purchases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SEQUENCES for numbering ============
CREATE SEQUENCE public.seq_quote_no START 1001;
CREATE SEQUENCE public.seq_invoice_no START 10001;
CREATE SEQUENCE public.seq_oldgold_no START 5001;
CREATE SEQUENCE public.seq_sku START 1;
GRANT USAGE ON SEQUENCE public.seq_quote_no, public.seq_invoice_no, public.seq_oldgold_no, public.seq_sku TO authenticated;

-- ============ SEED DATA ============
INSERT INTO public.categories (name) VALUES
  ('Necklace'),('Ring'),('Earring'),('Bangle'),('Bracelet'),('Pendant'),('Chain'),('Mangalsutra'),('Nose Pin'),('Anklet');
INSERT INTO public.locations (name) VALUES
  ('Showcase A'),('Showcase B'),('Showcase C'),('Vault'),('Display Window');
