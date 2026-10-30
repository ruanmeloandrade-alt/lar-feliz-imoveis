-- Installed on Saúde Slim Supabase under version 20261017171636.
-- For new isolated environments only; do not replay against already migrated production.
CREATE INDEX IF NOT EXISTS slim_group_inbox_message_recent ON public.whatsapp_web_messages (workspace_id,session_id,remote_jid,received_at DESC,id DESC) WHERE remote_jid LIKE '%@g.us';

CREATE OR REPLACE FUNCTION public.list_inbox_group_conversations_page(_workspace_id uuid, _limit integer DEFAULT 40, _cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _cursor_key text DEFAULT NULL::text, _search text DEFAULT NULL::text)
 RETURNS TABLE(conversation_key text, group_id uuid, group_jid text, session_id uuid, name text, description text, picture_url text, participants_count integer, body text, message_type text, from_me boolean, sender_name text, last_message_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH latest AS (
  SELECT DISTINCT ON (m.session_id, m.remote_jid)
    m.session_id,m.remote_jid,m.body,m.message_type,m.from_me,m.sender_name,m.received_at
  FROM public.whatsapp_web_messages m
  WHERE m.workspace_id = _workspace_id AND m.remote_jid LIKE '%@g.us'
  ORDER BY m.session_id,m.remote_jid,m.received_at DESC,m.id DESC
),
keys AS (
  SELECT g.session_id,g.group_jid FROM public.whatsapp_groups g
   WHERE g.workspace_id = _workspace_id
  UNION
  SELECT m.session_id,m.remote_jid FROM latest m
),
data AS (
  SELECT
    k.session_id::text || '|' || k.group_jid AS conversation_key,
    g.id AS group_id,
    k.group_jid,
    k.session_id,
    coalesce(nullif(g.name,''),nullif(g.subject,''),'Grupo WhatsApp ' || right(split_part(k.group_jid,'@',1),6)) AS name,
    g.description,
    g.picture_url,
    g.participants_count,
    left(m.body,500) AS body,
    m.message_type,
    m.from_me,
    m.sender_name,
    coalesce(m.received_at,g.last_synced_at,g.updated_at,g.created_at,clock_timestamp()) AS last_message_at
  FROM keys k
  LEFT JOIN public.whatsapp_groups g
    ON g.workspace_id=_workspace_id AND g.session_id=k.session_id AND g.group_jid=k.group_jid
  LEFT JOIN latest m
    ON m.session_id=k.session_id AND m.remote_jid=k.group_jid
)
SELECT d.conversation_key,d.group_id,d.group_jid,d.session_id,
       d.name,d.description,d.picture_url,d.participants_count,
       d.body,d.message_type,d.from_me,d.sender_name,d.last_message_at
FROM data d
WHERE private.slim_workspace_access(_workspace_id,'member')
  AND (nullif(trim(_search),'') IS NULL OR
       d.name ILIKE '%' || trim(_search) || '%' OR
       d.group_jid ILIKE '%' || trim(_search) || '%' OR
       d.description ILIKE '%' || trim(_search) || '%')
  AND (_cursor_at IS NULL OR
       d.last_message_at < _cursor_at OR
       (d.last_message_at = _cursor_at AND
        d.conversation_key > coalesce(_cursor_key,'')))
ORDER BY d.last_message_at DESC,d.conversation_key ASC
LIMIT least(101,greatest(2,coalesce(_limit,40)+1));
$function$
;
REVOKE ALL ON FUNCTION public.list_inbox_group_conversations_page(uuid,integer,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_inbox_group_conversations_page(uuid,integer,timestamptz,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
