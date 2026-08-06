DROP POLICY IF EXISTS "staff read product-images" ON storage.objects;
CREATE POLICY "staff read product-images" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'product-images' AND (
    private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager')
    OR private.has_role(auth.uid(),'sales') OR private.has_role(auth.uid(),'karigar')
    OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'viewer')
  )
);