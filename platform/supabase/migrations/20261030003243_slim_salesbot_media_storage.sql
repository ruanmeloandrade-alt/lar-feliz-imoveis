-- Restore the private bucket expected by the existing SalesBot uploader.
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES ('salesbot-media','salesbot-media',false,20971520)
ON CONFLICT(id) DO NOTHING;

CREATE POLICY slim_salesbot_media_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
 bucket_id='salesbot-media' AND
 CASE WHEN split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND length(split_part(name,'/',2))>0
 THEN private.slim_workspace_access(split_part(name,'/',1)::uuid,'operator')
 ELSE false END
);
CREATE POLICY slim_salesbot_media_read ON storage.objects
FOR SELECT TO authenticated USING (
 bucket_id='salesbot-media' AND
 CASE WHEN split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND length(split_part(name,'/',2))>0
 THEN private.slim_workspace_access(split_part(name,'/',1)::uuid,'member')
 ELSE false END
);
-- No public access, replacement or deletion permission is introduced.
