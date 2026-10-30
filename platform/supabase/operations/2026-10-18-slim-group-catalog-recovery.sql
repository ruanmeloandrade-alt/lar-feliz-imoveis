-- Administrative repair authorized in block 13. Replace __WORKSPACE_ID__ with the validated Saúde Slim workspace UUID.
-- Same INSERT as the tested invoker RPC, without inventing an authenticated session.
-- Only derived group metadata; no messages, rules, bots, memberships or provider actions are changed.
BEGIN;
SET LOCAL lock_timeout='5s';
INSERT INTO public.whatsapp_groups(
  workspace_id,session_id,group_jid,name,metadata,last_synced_at
 )
 SELECT '__WORKSPACE_ID__'::uuid,h.session_id,h.group_jid,
  'Grupo WhatsApp '||right(split_part(h.group_jid,'@',1),6),
  jsonb_build_object('source','inbox_history','history_latest_at',h.history_latest_at,'recovered_at',now()),
  NULL
 FROM (
  SELECT m.session_id,m.remote_jid AS group_jid,max(m.received_at) AS history_latest_at
  FROM public.whatsapp_web_messages m
  JOIN public.whatsapp_web_sessions s ON s.id=m.session_id AND s.workspace_id=m.workspace_id
  WHERE m.workspace_id='__WORKSPACE_ID__'::uuid
   AND (NULL::uuid IS NULL OR m.session_id=NULL::uuid)
   AND m.remote_jid ~ '^[0-9]+(-[0-9]+)?@g[.]us$'
  GROUP BY m.session_id,m.remote_jid
 ) h
 ON CONFLICT(session_id,group_jid) DO NOTHING
 RETURNING id,workspace_id,session_id,group_jid,last_synced_at;
COMMIT;
