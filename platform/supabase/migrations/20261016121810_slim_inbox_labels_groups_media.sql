-- Independent Inbox dependencies only. Does not install or modify order-edit/delete functions.
-- No customer messages, labels, group invitations or orders are created by installation.
CREATE TABLE public.inbox_labels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 group_name text NOT NULL DEFAULT 'Geral' CHECK(length(btrim(group_name)) BETWEEN 1 AND 80),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),color text NOT NULL DEFAULT '#14b8a6' CHECK(length(color) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,workspace_id),UNIQUE(workspace_id,group_name,name)
);
CREATE TABLE public.whatsapp_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 session_id uuid NOT NULL REFERENCES public.whatsapp_web_sessions(id),group_jid text NOT NULL CHECK(group_jid ~ '^[0-9-]+@g[.]us$'),
 name text,subject text,description text,picture_url text,participants_count integer NOT NULL DEFAULT 0 CHECK(participants_count>=0),
 is_admin boolean NOT NULL DEFAULT false,is_announce boolean NOT NULL DEFAULT false,invite_code text,
 active_bot_id uuid,active_ai_agent_id uuid,rules jsonb NOT NULL DEFAULT '{}',metadata jsonb NOT NULL DEFAULT '{}',
 last_synced_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,group_jid),UNIQUE(id,workspace_id)
);
CREATE INDEX slim_inbox_groups_workspace ON public.whatsapp_groups(workspace_id,updated_at DESC);
CREATE FUNCTION private.slim_inbox_group_scope() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.whatsapp_web_sessions s WHERE s.id=NEW.session_id AND s.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'A sessão não pertence à empresa do grupo.' USING ERRCODE='42501';END IF;
 RETURN NEW;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_inbox_group_scope() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER slim_inbox_group_scope BEFORE INSERT OR UPDATE ON public.whatsapp_groups FOR EACH ROW EXECUTE FUNCTION private.slim_inbox_group_scope();

CREATE TABLE public.inbox_label_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 label_id uuid NOT NULL,thread_ref text NOT NULL CHECK(length(thread_ref) BETWEEN 1 AND 200),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(label_id,thread_ref),FOREIGN KEY(label_id,workspace_id) REFERENCES public.inbox_labels(id,workspace_id) ON DELETE CASCADE
);
CREATE INDEX slim_inbox_assignments_workspace_thread ON public.inbox_label_assignments(workspace_id,thread_ref);
ALTER TABLE public.inbox_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_label_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inbox_labels,public.whatsapp_groups,public.inbox_label_assignments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.inbox_labels,public.whatsapp_groups,public.inbox_label_assignments TO authenticated;
GRANT ALL ON public.inbox_labels,public.whatsapp_groups,public.inbox_label_assignments TO service_role;
CREATE POLICY slim_inbox_labels_read ON public.inbox_labels FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id));
CREATE POLICY slim_inbox_labels_insert ON public.inbox_labels FOR INSERT TO authenticated WITH CHECK(private.slim_workspace_access(workspace_id,'operator'));
CREATE POLICY slim_inbox_labels_update ON public.inbox_labels FOR UPDATE TO authenticated USING(private.slim_workspace_access(workspace_id,'operator')) WITH CHECK(private.slim_workspace_access(workspace_id,'operator'));
CREATE POLICY slim_inbox_labels_delete ON public.inbox_labels FOR DELETE TO authenticated USING(private.slim_workspace_access(workspace_id,'operator'));
CREATE POLICY slim_inbox_groups_read ON public.whatsapp_groups FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id));
CREATE POLICY slim_inbox_groups_insert ON public.whatsapp_groups FOR INSERT TO authenticated WITH CHECK(private.slim_workspace_access(workspace_id,'operator'));
CREATE POLICY slim_inbox_groups_update ON public.whatsapp_groups FOR UPDATE TO authenticated USING(private.slim_workspace_access(workspace_id,'operator')) WITH CHECK(private.slim_workspace_access(workspace_id,'operator'));
CREATE POLICY slim_inbox_groups_delete ON public.whatsapp_groups FOR DELETE TO authenticated USING(private.slim_workspace_access(workspace_id,'operator'));

CREATE FUNCTION private.slim_inbox_thread_exists(_ws uuid,_thread text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT EXISTS(SELECT 1 FROM public.leads l WHERE l.workspace_id=_ws AND l.id::text=_thread) OR EXISTS(SELECT 1 FROM public.whatsapp_groups g WHERE g.workspace_id=_ws AND _thread IN(g.id::text,'group:'||g.id::text,g.group_jid,'group:'||g.group_jid));
$f$;
REVOKE ALL ON FUNCTION private.slim_inbox_thread_exists(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_inbox_thread_exists(uuid,text) TO authenticated,service_role;
CREATE POLICY slim_inbox_assignments_read ON public.inbox_label_assignments FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id));
CREATE POLICY slim_inbox_assignments_insert ON public.inbox_label_assignments FOR INSERT TO authenticated WITH CHECK(private.slim_workspace_access(workspace_id,'operator') AND private.slim_inbox_thread_exists(workspace_id,thread_ref));
CREATE POLICY slim_inbox_assignments_update ON public.inbox_label_assignments FOR UPDATE TO authenticated USING(private.slim_workspace_access(workspace_id,'operator')) WITH CHECK(private.slim_workspace_access(workspace_id,'operator') AND private.slim_inbox_thread_exists(workspace_id,thread_ref));
CREATE POLICY slim_inbox_assignments_delete ON public.inbox_label_assignments FOR DELETE TO authenticated USING(private.slim_workspace_access(workspace_id,'operator'));

INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('inbox-outgoing','inbox-outgoing',false,16777216) ON CONFLICT(id) DO NOTHING;
CREATE FUNCTION private.slim_inbox_media_access(_path text,_level text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT CASE WHEN split_part(_path,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND length(split_part(_path,'/',2))>0 AND length(split_part(_path,'/',3))>0 THEN private.slim_workspace_access(split_part(_path,'/',1)::uuid,_level) ELSE false END;
$f$;
REVOKE ALL ON FUNCTION private.slim_inbox_media_access(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_inbox_media_access(text,text) TO authenticated,service_role;
CREATE POLICY slim_inbox_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='inbox-outgoing' AND private.slim_inbox_media_access(name,'operator'));
CREATE POLICY slim_inbox_media_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='inbox-outgoing' AND private.slim_inbox_media_access(name,'member'));
-- Private signed URLs only. No public read, update, or delete permission is introduced for objects.
NOTIFY pgrst,'reload schema';
