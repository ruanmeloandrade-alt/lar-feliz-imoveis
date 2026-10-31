BEGIN;
CREATE TABLE public.vanessa_site_chats(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL DEFAULT '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' REFERENCES public.workspaces(id),messages jsonb NOT NULL DEFAULT '[]',facts jsonb NOT NULL DEFAULT '{}',lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,contact_name text,contact_phone text,consent_at timestamptz,automation_dispatched boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.vanessa_site_chats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vanessa_site_chats FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vanessa_site_chats TO authenticated;
GRANT ALL ON public.vanessa_site_chats TO service_role;
CREATE POLICY vanessa_chat_member_read ON public.vanessa_site_chats FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id) AND private.slim_session_security_allowed());
CREATE INDEX vanessa_chat_lead_idx ON public.vanessa_site_chats(workspace_id,lead_id,updated_at DESC);
INSERT INTO public.lead_custom_fields(workspace_id,name,field_type) SELECT '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698',x.name,x.kind FROM (VALUES('Idade','number'),('Orçamento','number'),('Quartos desejados','number')) x(name,kind) WHERE NOT EXISTS(SELECT 1 FROM public.lead_custom_fields f WHERE f.workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' AND lower(f.name)=lower(x.name));
CREATE OR REPLACE FUNCTION public.vanessa_register_site_contact(_chat_id uuid,_name text,_phone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.vanessa_site_chats;l public.leads;src uuid;pl uuid;st uuid;made boolean:=false;digits text;target_field_id uuid;kv record;label text;
BEGIN
SELECT * INTO c FROM public.vanessa_site_chats WHERE id=_chat_id AND workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' FOR UPDATE;
IF c.id IS NULL OR c.created_at<now()-interval '24 hours' THEN RAISE EXCEPTION 'Conversa expirada.';END IF;
digits:=regexp_replace(_phone,'[^0-9]','','g');IF length(btrim(_name))<2 OR length(_name)>120 OR length(digits)<10 OR length(digits)>15 THEN RAISE EXCEPTION 'Confira seu nome e WhatsApp.';END IF;
IF c.lead_id IS NOT NULL AND regexp_replace(c.contact_phone,'[^0-9]','','g') IS DISTINCT FROM digits THEN RAISE EXCEPTION 'Este atendimento já está associado a outro WhatsApp. Inicie uma nova conversa.';END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(c.workspace_id::text||':'||digits,0));
IF c.lead_id IS NOT NULL THEN SELECT * INTO l FROM public.leads WHERE id=c.lead_id AND workspace_id=c.workspace_id;END IF;
IF l.id IS NULL THEN SELECT * INTO l FROM public.leads WHERE workspace_id=c.workspace_id AND CASE WHEN phone LIKE '+%' THEN regexp_replace(phone,'[^0-9]','','g') WHEN length(regexp_replace(COALESCE(phone,''),'[^0-9]','','g')) IN (10,11) THEN '55'||regexp_replace(phone,'[^0-9]','','g') ELSE regexp_replace(COALESCE(phone,''),'[^0-9]','','g') END=digits ORDER BY created_at LIMIT 1;END IF;
IF l.id IS NULL THEN
SELECT s.id,p.id,ps.id INTO src,pl,st FROM public.crm_sources s JOIN public.pipelines p ON p.crm_source_id=s.id AND p.workspace_id=s.workspace_id JOIN public.pipeline_stages ps ON ps.pipeline_id=p.id AND ps.workspace_id=p.workspace_id WHERE s.workspace_id=c.workspace_id ORDER BY s.is_default DESC,p.position,p.created_at,ps.position,ps.created_at LIMIT 1;
IF st IS NULL THEN RAISE EXCEPTION 'Funil de atendimento indisponível.';END IF;
INSERT INTO public.leads(workspace_id,crm_source_id,pipeline_id,stage_id,name,phone,value,status,source,tags,custom_data) VALUES(c.workspace_id,src,pl,st,btrim(_name),'+'||digits,0,'active','site-assistente','["site","atendimento-ia"]'::jsonb,jsonb_build_object('site_chat_id',c.id,'whatsapp_contact_consent',true)) RETURNING * INTO l;made:=true;
END IF;
IF c.lead_id IS NULL THEN INSERT INTO public.lead_activities(workspace_id,lead_id,type,payload) VALUES(c.workspace_id,l.id,'note',jsonb_build_object('source','site-assistente','text','Cliente solicitou atendimento por WhatsApp no chat do site.','chat_id',c.id,'consent_at',now(),'conversation',c.messages));END IF;
FOR kv IN SELECT key,value FROM jsonb_each_text(c.facts) LOOP
label:=CASE kv.key WHEN 'age' THEN 'Idade' WHEN 'city' THEN 'cidade' WHEN 'budget' THEN 'Orçamento' WHEN 'bedrooms' THEN 'Quartos desejados' ELSE NULL END;
IF label IS NOT NULL AND length(kv.value)<300 THEN SELECT f.id INTO target_field_id FROM public.lead_custom_fields f WHERE f.workspace_id=c.workspace_id AND lower(f.name)=lower(label) AND f.active LIMIT 1;IF target_field_id IS NOT NULL THEN INSERT INTO public.lead_custom_field_values(workspace_id,lead_id,field_id,value) VALUES(c.workspace_id,l.id,target_field_id,jsonb_build_object('display',kv.value,'raw',jsonb_build_array(kv.value),'source','site-chat','chat_id',c.id)) ON CONFLICT(lead_id,field_id) DO UPDATE SET value=EXCLUDED.value,updated_at=now();END IF;END IF;
END LOOP;
UPDATE public.vanessa_site_chats SET lead_id=l.id,contact_name=btrim(_name),contact_phone='+'||digits,consent_at=COALESCE(consent_at,now()),automation_dispatched=CASE WHEN NOT made AND c.lead_id IS NULL THEN true ELSE automation_dispatched END,updated_at=now() WHERE id=c.id;
RETURN jsonb_build_object('leadId',l.id,'leadCreated',made,'pipelineId',l.pipeline_id,'stageId',l.stage_id,'automationDispatched',CASE WHEN NOT made AND c.lead_id IS NULL THEN true ELSE c.automation_dispatched END);
END $$;
REVOKE ALL ON FUNCTION public.vanessa_register_site_contact(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vanessa_register_site_contact(uuid,text,text) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
SELECT '52-site-chat' AS file,'OK' AS status;
