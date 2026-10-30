BEGIN;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS partner_details jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS public_property jsonb;
COMMENT ON COLUMN public.products.public_property IS 'Dados públicos do empreendimento Vanessa; campos comerciais internos permanecem separados.';
CREATE OR REPLACE FUNCTION public.vanessa_catalog() RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH listing AS (
 SELECT p.*,COALESCE(p.public_property,p.import_snapshot->'property',r.data::jsonb,'{}'::jsonb) AS estate
 FROM public.products p LEFT JOIN vanessa_private.records r ON r.collection='properties' AND r.id=p.id::text
 WHERE p.workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' AND p.active
 )
 SELECT jsonb_build_object(
 'id',id,'title',name,'description',description,'city',COALESCE(estate->>'city',''),'address',estate->'address',
 'price',CASE WHEN price=0 AND import_snapshot->'property'->>'price' IS NULL AND import_snapshot->>'source'='vanessa-original' THEN NULL ELSE price END,
 'images',CASE WHEN COALESCE(image,'')<>'' THEN jsonb_build_array(image)||COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(COALESCE(estate->'images','[]'::jsonb)) x WHERE x<>to_jsonb(image)),'[]'::jsonb) ELSE COALESCE(estate->'images','[]'::jsonb) END,
 'pdfs',COALESCE(estate->'pdfs','[]'::jsonb),'plans',COALESCE(estate->'plans','[]'::jsonb),
 'bedrooms',estate->'bedrooms','bathrooms',estate->'bathrooms','area_m2',estate->'area_m2','tag',estate->'tag',
 'construction_status',COALESCE(estate->>'construction_status','na_planta'),'launch_date',estate->'launch_date',
 'subsidy_estimate',estate->'subsidy_estimate','monthly_parcel',estate->'monthly_parcel','down_payment',estate->'down_payment',
 'show_parcel',COALESCE(estate->'show_parcel','false'::jsonb),'show_down_payment',COALESCE(estate->'show_down_payment','false'::jsonb),
 'published',true,'created_at',created_at,'updated_at',updated_at)
 FROM listing WHERE COALESCE((estate->>'published')::boolean,true) ORDER BY created_at DESC,id;
$$;
REVOKE ALL ON FUNCTION public.vanessa_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vanessa_catalog() TO anon,authenticated,service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('vanessa-listings','vanessa-listings',true,52428800,ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','application/pdf']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY vanessa_listing_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='vanessa-listings' AND (storage.foldername(name))[1]=auth.uid()::text AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' AND m.user_id=auth.uid()));
CREATE POLICY vanessa_listing_owner_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='vanessa-listings' AND (storage.foldername(name))[1]=auth.uid()::text);
COMMIT;
SELECT '45-marketplace' AS file,'OK' AS status;
