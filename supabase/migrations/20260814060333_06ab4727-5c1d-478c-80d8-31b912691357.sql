CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique
  ON public.customers (phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE UNIQUE INDEX IF NOT EXISTS customers_id_doc_unique
  ON public.customers (id_doc_type, id_doc_number)
  WHERE id_doc_number IS NOT NULL AND id_doc_number <> '';