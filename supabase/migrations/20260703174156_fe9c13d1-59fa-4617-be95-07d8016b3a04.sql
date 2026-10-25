
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS pdfs text[] NOT NULL DEFAULT '{}';

CREATE POLICY "Admins upload pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'property-pdfs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'property-pdfs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'property-pdfs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone read pdfs"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'property-pdfs');
