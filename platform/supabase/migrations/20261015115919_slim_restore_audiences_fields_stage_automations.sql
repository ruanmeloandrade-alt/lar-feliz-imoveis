-- Already applied to the independent Saúde Slim database; no production data is seeded.
CREATE FUNCTION private.slim_workspace_access(_workspace_id uuid, _level text DEFAULT 'member') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=_workspace_id AND w.owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_workspace_id AND m.user_id=auth.uid() AND (m.access_expires_at IS NULL OR m.access_expires_at>now()) AND CASE _level WHEN 'admin' THEN m.role IN ('owner','admin') WHEN 'operator' THEN coalesce(m.role_type,'funcionario')<>'visualizador' WHEN 'member' THEN true ELSE false END));
$f$;
REVOKE ALL ON FUNCTION private.slim_workspace_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_workspace_access(uuid,text) TO authenticated,service_role;
CREATE TABLE public.crm_lead_audiences (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 120),description text,filters jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(filters)='object'),cached_count integer CHECK(cached_count>=0),cached_at timestamptz,meta_audience_id uuid,last_synced_at timestamptz,created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.lead_custom_fields (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),field_type text NOT NULL DEFAULT 'text',options jsonb NOT NULL DEFAULT '[]',funnel_ids uuid[] NOT NULL DEFAULT '{}',active boolean NOT NULL DEFAULT true,required boolean NOT NULL DEFAULT false,unique_value boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.lead_custom_field_values (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,field_id uuid NOT NULL REFERENCES public.lead_custom_fields(id) ON DELETE CASCADE,value jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(lead_id,field_id));
CREATE TABLE public.tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,title text NOT NULL,description text,kind text NOT NULL DEFAULT 'tarefa',status text NOT NULL DEFAULT 'pendente',start_at timestamptz NOT NULL DEFAULT now(),end_at timestamptz NOT NULL DEFAULT now(),participants jsonb NOT NULL DEFAULT '[]',location text,meeting_url text,reminder_minutes integer,created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),external_id text,external_source text,external_sync_status text NOT NULL DEFAULT 'not_synced',external_synced_at timestamptz,external_url text,google_event_id text,google_sync_status text NOT NULL DEFAULT 'not_synced',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.crm_stage_automations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,action_id text NOT NULL,action jsonb NOT NULL CHECK(jsonb_typeof(action)='object'),enabled boolean NOT NULL DEFAULT true,position integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,pipeline_id,stage_id,action_id));
CREATE TABLE public.crm_automation_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,action_id text NOT NULL,action jsonb NOT NULL,context jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','skipped','error','cancelled')),due_at timestamptz NOT NULL DEFAULT now(),executed_at timestamptz,started_at timestamptz,attempts integer NOT NULL DEFAULT 0,last_error text,dedupe_key text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,dedupe_key));
CREATE INDEX slim_audiences_workspace_updated ON public.crm_lead_audiences(workspace_id,updated_at DESC);
CREATE INDEX slim_fields_workspace ON public.lead_custom_fields(workspace_id);
CREATE INDEX slim_values_workspace_lead ON public.lead_custom_field_values(workspace_id,lead_id);
CREATE INDEX slim_tasks_workspace_lead ON public.tasks(workspace_id,lead_id,status);
CREATE INDEX slim_stage_actions_pipeline ON public.crm_stage_automations(workspace_id,pipeline_id,position);
CREATE INDEX slim_jobs_due ON public.crm_automation_jobs(status,due_at) WHERE status='pending';
CREATE INDEX slim_jobs_lead ON public.crm_automation_jobs(workspace_id,lead_id,created_at DESC);
CREATE FUNCTION private.slim_operational_references() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF TG_OP='UPDATE' AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN RAISE EXCEPTION 'Empresa do registro não pode ser alterada.' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME IN ('lead_custom_field_values','tasks','crm_automation_jobs') THEN
  IF NEW.lead_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=NEW.lead_id AND l.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Cliente não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='lead_custom_field_values' THEN
  IF NOT EXISTS(SELECT 1 FROM public.lead_custom_fields f WHERE f.id=NEW.field_id AND f.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Campo não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='lead_custom_fields' THEN
  IF EXISTS(SELECT 1 FROM unnest(NEW.funnel_ids) x WHERE NOT EXISTS(SELECT 1 FROM public.pipelines p WHERE p.id=x AND p.workspace_id=NEW.workspace_id)) THEN RAISE EXCEPTION 'Funil do campo inválido.' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME IN ('crm_stage_automations','crm_automation_jobs') THEN
  IF NEW.pipeline_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pipelines p WHERE p.id=NEW.pipeline_id AND p.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Funil não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
  IF NEW.stage_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pipeline_stages s WHERE s.id=NEW.stage_id AND s.workspace_id=NEW.workspace_id AND (NEW.pipeline_id IS NULL OR s.pipeline_id=NEW.pipeline_id)) THEN RAISE EXCEPTION 'Etapa não pertence ao funil.' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_operational_references() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_operational_references() TO authenticated,service_role;
DO $m$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['crm_lead_audiences','lead_custom_fields','lead_custom_field_values','tasks','crm_stage_automations','crm_automation_jobs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY slim_read ON public.%I FOR SELECT TO authenticated USING (private.slim_workspace_access(workspace_id))',t);
  IF t<>'crm_automation_jobs' THEN
   EXECUTE format('GRANT INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
   EXECUTE format('CREATE POLICY slim_insert ON public.%I FOR INSERT TO authenticated WITH CHECK(private.slim_workspace_access(workspace_id,''operator''))',t);
   EXECUTE format('CREATE POLICY slim_update ON public.%I FOR UPDATE TO authenticated USING(private.slim_workspace_access(workspace_id,''operator'')) WITH CHECK(private.slim_workspace_access(workspace_id,''operator''))',t);
   EXECUTE format('CREATE POLICY slim_delete ON public.%I FOR DELETE TO authenticated USING(private.slim_workspace_access(workspace_id,''operator''))',t);
   EXECUTE format('CREATE TRIGGER slim_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',t);
  END IF;
  EXECUTE format('CREATE TRIGGER slim_refs BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.slim_operational_references()',t);
 END LOOP;
END;$m$;
CREATE FUNCTION public.replace_crm_stage_automations(_pipeline_id uuid,_automations jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE w uuid;entry record;a jsonb;st uuid;pos integer;n integer:=0;
BEGIN
 SELECT workspace_id INTO w FROM public.pipelines WHERE id=_pipeline_id FOR UPDATE;
 IF w IS NULL OR NOT private.slim_workspace_access(w,'operator') THEN RAISE EXCEPTION 'Sem permissão para editar automações deste funil.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_automations) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Mapa de automações inválido.' USING ERRCODE='22023'; END IF;
 FOR entry IN SELECT * FROM jsonb_each(_automations) LOOP
  st:=entry.key::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.pipeline_stages s WHERE s.id=st AND s.pipeline_id=_pipeline_id AND s.workspace_id=w) OR jsonb_typeof(entry.value)<>'array' THEN RAISE EXCEPTION 'Etapa ou lista de ações inválida.' USING ERRCODE='22023'; END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(entry.value) LOOP
   IF jsonb_typeof(a)<>'object' OR length(coalesce(a->>'id',''))=0 THEN RAISE EXCEPTION 'Ação sem identificador.' USING ERRCODE='22023'; END IF;
   IF a ? 'stageIds' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(a->'stageIds') x WHERE NOT EXISTS(SELECT 1 FROM public.pipeline_stages s WHERE s.id=x::uuid AND s.pipeline_id=_pipeline_id AND s.workspace_id=w)) THEN RAISE EXCEPTION 'Ação cobre etapa não autorizada.' USING ERRCODE='42501'; END IF;
  END LOOP;
 END LOOP;
 DELETE FROM public.crm_stage_automations WHERE workspace_id=w AND pipeline_id=_pipeline_id;
 FOR entry IN SELECT * FROM jsonb_each(_automations) LOOP
  pos:=0;
  FOR a IN SELECT * FROM jsonb_array_elements(entry.value) LOOP
   INSERT INTO public.crm_stage_automations(workspace_id,pipeline_id,stage_id,action_id,action,enabled,position) VALUES(w,_pipeline_id,entry.key::uuid,a->>'id',a,coalesce((a->>'enabled')::boolean,true),pos);
   pos:=pos+1;n:=n+1;
  END LOOP;
 END LOOP;
 RETURN n;
END;$f$;
REVOKE ALL ON FUNCTION public.replace_crm_stage_automations(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_crm_stage_automations(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
