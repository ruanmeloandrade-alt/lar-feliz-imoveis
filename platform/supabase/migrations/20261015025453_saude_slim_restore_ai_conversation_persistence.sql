CREATE TYPE public.ai_agent_module AS ENUM ('gestor_trafego','kommo_manager','salesbot','inbox','dashboard','social_media','strategist','support_robot');
CREATE TYPE public.ai_agent_mode AS ENUM ('consultor','gestor');

CREATE TABLE public.ai_agent_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 module public.ai_agent_module NOT NULL,
 mode public.ai_agent_mode NOT NULL DEFAULT 'consultor',
 system_prompt_extra text,
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,module)
);
CREATE TABLE public.ai_agent_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 module public.ai_agent_module NOT NULL,
 messages jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(messages)='array'),
 last_message_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,module)
);
CREATE TABLE public.support_robot_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('user','assistant','system','tool')),
 content text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_robot_messages_workspace_user_created_idx ON public.support_robot_messages(workspace_id,user_id,created_at DESC,id);

CREATE FUNCTION private.saude_slim_touch_ai_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$fn$;
REVOKE ALL ON FUNCTION private.saude_slim_touch_ai_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.saude_slim_touch_ai_updated_at() TO authenticated,service_role;
CREATE TRIGGER ai_agent_settings_updated_at BEFORE UPDATE ON public.ai_agent_settings FOR EACH ROW EXECUTE FUNCTION private.saude_slim_touch_ai_updated_at();
CREATE TRIGGER ai_agent_conversations_updated_at BEFORE UPDATE ON public.ai_agent_conversations FOR EACH ROW EXECUTE FUNCTION private.saude_slim_touch_ai_updated_at();

ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_robot_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_agent_settings_workspace_access ON public.ai_agent_settings FOR ALL TO authenticated
 USING (
  EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=ai_agent_settings.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
  OR EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=ai_agent_settings.workspace_id AND w.owner_id=(SELECT auth.uid()))
 )
 WITH CHECK (
  updated_by=(SELECT auth.uid()) AND (
   EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=ai_agent_settings.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
   OR EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=ai_agent_settings.workspace_id AND w.owner_id=(SELECT auth.uid()))
  )
 );
CREATE POLICY ai_agent_conversations_private_user_access ON public.ai_agent_conversations FOR ALL TO authenticated
 USING (
  user_id=(SELECT auth.uid()) AND (
   EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=ai_agent_conversations.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
   OR EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=ai_agent_conversations.workspace_id AND w.owner_id=(SELECT auth.uid()))
  )
 ) WITH CHECK (
  user_id=(SELECT auth.uid()) AND (
   EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=ai_agent_conversations.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
   OR EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=ai_agent_conversations.workspace_id AND w.owner_id=(SELECT auth.uid()))
  )
 );
CREATE POLICY support_robot_messages_private_user_access ON public.support_robot_messages FOR ALL TO authenticated
 USING (
  user_id=(SELECT auth.uid()) AND (
   EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=support_robot_messages.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
   OR EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=support_robot_messages.workspace_id AND w.owner_id=(SELECT auth.uid()))
  )
 ) WITH CHECK (
  user_id=(SELECT auth.uid()) AND (
   EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=support_robot_messages.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
   OR EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=support_robot_messages.workspace_id AND w.owner_id=(SELECT auth.uid()))
  )
 );
REVOKE ALL ON public.ai_agent_settings,public.ai_agent_conversations,public.support_robot_messages FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ai_agent_settings,public.ai_agent_conversations,public.support_robot_messages TO authenticated,service_role;
NOTIFY pgrst, 'reload schema';
