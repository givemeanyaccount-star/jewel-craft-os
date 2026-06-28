
CREATE POLICY "auth read product-images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "auth write product-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "auth update product-images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "auth delete product-images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');

CREATE POLICY "auth read customer-docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'customer-docs');
CREATE POLICY "auth write customer-docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'customer-docs');
CREATE POLICY "auth update customer-docs" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'customer-docs');
CREATE POLICY "auth delete customer-docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'customer-docs');
