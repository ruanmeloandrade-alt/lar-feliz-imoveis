-- Group-agent configuration only. No group membership, WhatsApp send, order or contact mutations.
CREATE TABLE public.group_ai_agents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),persona text CHECK(length(persona)<=2000),system_prompt text CHECK(length(system_prompt)<=20000),
 model text NOT NULL DEFAULT 'openai/gpt-5.5' CHECK(length(model) BETWEEN 1 AND 120),temperature numeric NOT NULL DEFAULT 0.7 CHECK(temperature BETWEEN 0 AND 2),
 max_tokens integer NOT NULL DEFAULT 1024 CHECK(max_tokens BETWEEN 64 AND 8192),cooldown_seconds integer NOT NULL DEFAULT 30 CHECK(cooldown_seconds BETWEEN 0 AND 3600),
 respond_only_when_mentioned boolean NOT NULL DEFAULT true,enabled boolean NOT NULL DEFAULT true,
 triggers jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(triggers)='array'),metadata jsonb NOT NULL DEFAULT '{"settings":{"mode":"prompt"}}' CHECK(jsonb_typeof(metadata)='object' AND metadata#>>'{settings,mode}' IS NOT DISTINCT FROM 'prompt'),
 creation_request_id uuid NOT NULL,creation_payload jsonb NOT NULL CHECK(jsonb_typeof(creation_payload)='object'),created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,workspace_id),UNIQUE(workspace_id,creation_request_id),
 CHECK(NOT enabled OR length(btrim(coalesce(system_prompt,'')))>0)
);
CREATE INDEX slim_group_agents_workspace_updated ON public.group_ai_agents(workspace_id,updated_at DESC);
ALTER TABLE public.group_ai_agents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_ai_agents FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.group_ai_agents TO authenticated;
GRANT ALL ON public.group_ai_agents TO service_role;
CREATE POLICY slim_group_agents_read ON public.group_ai_agents FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id));
CREATE POLICY slim_group_agents_insert ON public.group_ai_agents FOR INSERT TO authenticated WITH CHECK(private.slim_workspace_access(workspace_id,'operator') AND created_by=auth.uid());
CREATE POLICY slim_group_agents_update ON public.group_ai_agents FOR UPDATE TO authenticated USING(private.slim_workspace_access(workspace_id,'operator')) WITH CHECK(private.slim_workspace_access(workspace_id,'operator'));
CREATE POLICY slim_group_agents_delete ON public.group_ai_agents FOR DELETE TO authenticated USING(private.slim_workspace_access(workspace_id,'operator'));
CREATE FUNCTION private.slim_group_agent_config_update() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF (NEW.id,NEW.workspace_id,NEW.created_by,NEW.created_at,NEW.creation_request_id) IS DISTINCT FROM (OLD.id,OLD.workspace_id,OLD.created_by,OLD.created_at,OLD.creation_request_id) OR NEW.creation_payload IS DISTINCT FROM OLD.creation_payload THEN RAISE EXCEPTION 'Identidade e tentativa original do agente são imutáveis.' USING ERRCODE='22023';END IF;
 IF OLD.metadata ? 'objective_tree' AND NEW.metadata->'objective_tree' IS DISTINCT FROM OLD.metadata->'objective_tree' THEN RAISE EXCEPTION 'A árvore arquivada não pode ser sobrescrita pelo editor de prompt.' USING ERRCODE='22023';END IF;
 NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond');RETURN NEW;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_group_agent_config_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER slim_group_agent_config_update BEFORE UPDATE ON public.group_ai_agents FOR EACH ROW EXECUTE FUNCTION private.slim_group_agent_config_update();
NOTIFY pgrst,'reload schema';
