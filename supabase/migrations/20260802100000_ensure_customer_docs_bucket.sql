-- Ensure the customer-docs bucket actually exists (policies alone don't create it).
-- Safe to run even if it already exists.
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-docs', 'customer-docs', false)
ON CONFLICT (id) DO NOTHING;
