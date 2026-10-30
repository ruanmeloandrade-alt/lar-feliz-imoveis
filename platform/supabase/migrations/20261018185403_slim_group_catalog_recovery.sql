-- Recover persistent group identities from the existing Inbox history only.
-- Installation does not recover rows, contact Evolution, or execute automations.
CREATE FUNCTION public.slim_sync_group_catalog(
 _workspace_id uuid,
 _session_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='5s' AS $f$
DECLARE
 recovered_count integer;
 total_count integer;
BEGIN
 PERFORM public.slim_assert_session_security();
 IF _workspace_id IS NULL OR auth.uid() IS NULL
    OR NOT EXISTS(
     SELECT 1 FROM public.profiles p
     WHERE p.id=auth.uid() AND p.current_workspace_id=_workspace_id
    ) OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para sincronizar os grupos desta empresa.' USING ERRCODE='42501';
 END IF;
 IF _session_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.whatsapp_web_sessions s
  WHERE s.id=_session_id AND s.workspace_id=_workspace_id
 ) THEN
  RAISE EXCEPTION 'A sessão não pertence à empresa selecionada.' USING ERRCODE='42501';
 END IF;

 INSERT INTO public.whatsapp_groups(
  workspace_id,session_id,group_jid,name,metadata,last_synced_at
 )
 SELECT _workspace_id,h.session_id,h.group_jid,
  'Grupo WhatsApp '||right(split_part(h.group_jid,'@',1),6),
  jsonb_build_object('source','inbox_history','history_latest_at',h.history_latest_at,'recovered_at',now()),
  NULL
 FROM (
  SELECT m.session_id,m.remote_jid AS group_jid,max(m.received_at) AS history_latest_at
  FROM public.whatsapp_web_messages m
  JOIN public.whatsapp_web_sessions s ON s.id=m.session_id AND s.workspace_id=m.workspace_id
  WHERE m.workspace_id=_workspace_id
   AND (_session_id IS NULL OR m.session_id=_session_id)
   AND m.remote_jid ~ '^[0-9]+(-[0-9]+)?@g[.]us$'
  GROUP BY m.session_id,m.remote_jid
 ) h
 ON CONFLICT(session_id,group_jid) DO NOTHING;
 GET DIAGNOSTICS recovered_count=ROW_COUNT;

 SELECT count(*)::integer INTO total_count
 FROM public.whatsapp_groups g
 WHERE g.workspace_id=_workspace_id AND (_session_id IS NULL OR g.session_id=_session_id);
 RETURN jsonb_build_object('recovered',recovered_count,'total',total_count);
END;$f$;
REVOKE ALL ON FUNCTION public.slim_sync_group_catalog(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.slim_sync_group_catalog(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
