
-- Tighten SECURITY DEFINER function execute privileges
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

-- Restrict storage reads to files that belong to published properties
DROP POLICY IF EXISTS "Public can view property images" ON storage.objects;
CREATE POLICY "Public can view images of published properties"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'property-images'
  AND (
    has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.published = true
        AND EXISTS (
          SELECT 1 FROM unnest(p.images) AS img
          WHERE img LIKE '%' || storage.objects.name
        )
    )
  )
);

DROP POLICY IF EXISTS "Anyone read pdfs" ON storage.objects;
CREATE POLICY "Read pdfs of published properties"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'property-pdfs'
  AND (
    has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.published = true
        AND EXISTS (
          SELECT 1 FROM unnest(p.pdfs) AS pdf
          WHERE pdf LIKE '%' || storage.objects.name
        )
    )
  )
);
