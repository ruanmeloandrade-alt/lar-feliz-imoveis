-- Applied queue schema; transport delivery acceptance is tracked separately in the production semaphore.
CREATE TABLE public.slim_audience_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 audience_id uuid REFERENCES public.crm_lead_audiences(id) ON DELETE SET NULL,audience_name text NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),request_id uuid NOT NULL,request_hash text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('text','agent','salesbot')),message text NOT NULL DEFAULT '',
 session_id uuid REFERENCES public.whatsapp_web_sessions(id),agent_id uuid REFERENCES public.conversation_ai_agents(id),salesbot_id uuid REFERENCES public.salesbots(id),
 delay_ms integer NOT NULL DEFAULT 1500 CHECK(delay_ms BETWEEN 500 AND 15000),delay_seconds integer NOT NULL DEFAULT 0 CHECK(delay_seconds BETWEEN 0 AND 86400),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','cancelled')),
 next_due_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 UNIQUE(workspace_id,request_id)
);
CREATE TABLE public.slim_audience_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES public.slim_audience_campaigns(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
 recipient_key text NOT NULL,phone text,name text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','sent','failed','uncertain','skipped','cancelled')),
 message_id text,last_error text,started_at timestamptz,finished_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,recipient_key)
);
CREATE INDEX slim_campaign_due ON public.slim_audience_campaigns(status,next_due_at);
CREATE INDEX slim_delivery_state ON public.slim_audience_deliveries(campaign_id,status);
ALTER TABLE public.slim_audience_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slim_audience_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.slim_audience_campaigns,public.slim_audience_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.slim_audience_campaigns,public.slim_audience_deliveries TO service_role;
GRANT SELECT ON public.slim_audience_campaigns,public.slim_audience_deliveries TO authenticated;
CREATE POLICY slim_campaign_read ON public.slim_audience_campaigns FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id));
CREATE POLICY slim_delivery_read ON public.slim_audience_deliveries FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id));
CREATE FUNCTION private.slim_enqueue_audience_campaign(_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE w uuid:=(_payload->>'workspaceId')::uuid; aid uuid:=(_payload->>'id')::uuid; req uuid:=coalesce((_payload->>'requestId')::uuid,gen_random_uuid()); c public.slim_audience_campaigns; aud public.crm_lead_audiences;
 k text:=_payload->>'kind'; ids uuid[]; l public.leads; campaign uuid; key text; ph text; n integer; skips integer:=0; hash text; sess uuid:=(_payload->>'sessionId')::uuid; agent uuid:=(_payload->>'agentId')::uuid; bot uuid:=(_payload->>'salesbotId')::uuid;
BEGIN
 IF NOT private.slim_workspace_access(w,'operator') THEN RAISE EXCEPTION 'Sem permissão para disparar nesta empresa.' USING ERRCODE='42501';END IF;
 SELECT * INTO aud FROM public.crm_lead_audiences WHERE id=aid AND workspace_id=w;
 IF NOT FOUND THEN RAISE EXCEPTION 'Público não encontrado nesta empresa.' USING ERRCODE='42501';END IF;
 IF k IS NULL OR k NOT IN ('text','agent','salesbot') OR jsonb_typeof(_payload->'leadIds') IS DISTINCT FROM 'array' OR jsonb_array_length(_payload->'leadIds') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Destinatários ou tipo de campanha inválidos.' USING ERRCODE='22023';END IF;
 SELECT array_agg(DISTINCT x::uuid ORDER BY x::uuid) INTO ids FROM jsonb_array_elements_text(_payload->'leadIds') x;
 hash:=encode(extensions.digest(((_payload-'requestId'-'leadIds')||jsonb_build_object('leadIds',ids))::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(w::text||req::text,0));
 SELECT * INTO c FROM public.slim_audience_campaigns WHERE workspace_id=w AND request_id=req;
 IF FOUND THEN
  IF c.created_by<>auth.uid() OR c.request_hash<>hash THEN RAISE EXCEPTION 'Identificador de envio já utilizado com outro conteúdo.' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('campaignId',c.id,'queued',(SELECT count(*) FROM public.slim_audience_deliveries WHERE campaign_id=c.id),'reused',true);
 END IF;
 IF k IN ('text','agent') THEN
  IF length(btrim(coalesce(_payload->>'message',''))) NOT BETWEEN 1 AND 4096 THEN RAISE EXCEPTION 'Mensagem inválida.' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_web_sessions s WHERE s.id=sess AND s.workspace_id=w AND s.provider='evolution' AND s.status='conectado' AND coalesce(s.metadata->>'deleted','false')<>'true') THEN RAISE EXCEPTION 'Selecione um WhatsApp conectado desta empresa.' USING ERRCODE='42501';END IF;
 END IF;
 IF k='agent' AND NOT EXISTS(SELECT 1 FROM public.conversation_ai_agents a WHERE a.id=agent AND a.workspace_id=w AND a.enabled) THEN RAISE EXCEPTION 'Selecione um Agente IA ativo desta empresa.' USING ERRCODE='42501';END IF;
 IF k='salesbot' AND NOT EXISTS(SELECT 1 FROM public.salesbots b WHERE b.id=bot AND b.workspace_id=w AND b.is_active) THEN RAISE EXCEPTION 'Selecione um SalesBot ativo desta empresa.' USING ERRCODE='42501';END IF;
 IF (SELECT count(*) FROM public.leads WHERE id=ANY(ids) AND workspace_id=w AND merged_into_id IS NULL)<>cardinality(ids) THEN RAISE EXCEPTION 'Destinatário não pertence à empresa ou foi mesclado.' USING ERRCODE='42501';END IF;
 INSERT INTO public.slim_audience_campaigns(workspace_id,audience_id,audience_name,created_by,request_id,request_hash,kind,message,session_id,agent_id,salesbot_id,delay_ms,delay_seconds,next_due_at)
 VALUES(w,aid,aud.name,auth.uid(),req,hash,k,coalesce(_payload->>'message',''),sess,agent,bot,coalesce((_payload->>'delayMs')::integer,1500),coalesce((_payload->>'delaySeconds')::integer,0),now()+make_interval(secs=>coalesce((_payload->>'delaySeconds')::integer,0))) RETURNING id INTO campaign;
 FOR l IN SELECT * FROM public.leads WHERE workspace_id=w AND id=ANY(ids) ORDER BY id LOOP
  IF l.status IN ('archived','deleted','merged') OR coalesce(l.custom_data->>'opt_out','false')='true' OR coalesce(l.custom_data->>'do_not_contact','false')='true' OR coalesce(l.custom_data->>'whatsapp_opt_out','false')='true' THEN skips:=skips+1;CONTINUE;END IF;
  ph:=regexp_replace(coalesce(l.phone,''),'[^0-9]','','g');
  IF k<>'salesbot' AND length(ph) NOT BETWEEN 8 AND 15 THEN skips:=skips+1;CONTINUE;END IF;
  key:=CASE WHEN k='salesbot' THEN l.id::text ELSE ph END;
  INSERT INTO public.slim_audience_deliveries(campaign_id,workspace_id,lead_id,recipient_key,phone,name) VALUES(campaign,w,l.id,key,ph,l.name) ON CONFLICT(campaign_id,recipient_key) DO NOTHING;
 END LOOP;
 SELECT count(*) INTO n FROM public.slim_audience_deliveries WHERE campaign_id=campaign;
 IF n=0 THEN RAISE EXCEPTION 'Nenhum destinatário elegível. Verifique telefones e bloqueios de contato.' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('campaignId',campaign,'queued',n,'skipped',cardinality(ids)-n,'reused',false);
END;$f$;
REVOKE ALL ON FUNCTION private.slim_enqueue_audience_campaign(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_enqueue_audience_campaign(jsonb) TO authenticated;
CREATE FUNCTION public.slim_enqueue_audience_campaign(_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT private.slim_enqueue_audience_campaign(_payload); $f$;
REVOKE ALL ON FUNCTION public.slim_enqueue_audience_campaign(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_enqueue_audience_campaign(jsonb) TO authenticated;
CREATE FUNCTION private.slim_cancel_audience_campaign(_campaign_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE c public.slim_audience_campaigns;BEGIN
 SELECT * INTO c FROM public.slim_audience_campaigns WHERE id=_campaign_id FOR UPDATE;
 IF NOT FOUND OR NOT private.slim_workspace_access(c.workspace_id,'operator') OR (c.created_by<>auth.uid() AND NOT private.slim_workspace_access(c.workspace_id,'admin')) THEN RAISE EXCEPTION 'Sem permissão para encerrar este disparo.' USING ERRCODE='42501';END IF;
 UPDATE public.slim_audience_campaigns SET status='cancelled',finished_at=now() WHERE id=c.id AND status IN ('queued','running');
 UPDATE public.slim_audience_deliveries SET status='cancelled',finished_at=now() WHERE campaign_id=c.id AND status='pending';
END;$f$;
REVOKE ALL ON FUNCTION private.slim_cancel_audience_campaign(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_cancel_audience_campaign(uuid) TO authenticated;
CREATE FUNCTION public.slim_cancel_audience_campaign(_campaign_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT private.slim_cancel_audience_campaign(_campaign_id);$f$;
REVOKE ALL ON FUNCTION public.slim_cancel_audience_campaign(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_cancel_audience_campaign(uuid) TO authenticated;
CREATE FUNCTION public.slim_claim_audience_delivery() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE c public.slim_audience_campaigns;d public.slim_audience_deliveries;BEGIN
 UPDATE public.slim_audience_deliveries SET status='uncertain',last_error='Execução interrompida. Verificar entrega antes de reenviar.',finished_at=now() WHERE status='running' AND started_at<now()-interval '3 minutes';
 UPDATE public.slim_audience_campaigns c1 SET status='completed',finished_at=now() WHERE c1.status IN ('queued','running') AND NOT EXISTS(SELECT 1 FROM public.slim_audience_deliveries d1 WHERE d1.campaign_id=c1.id AND d1.status IN ('pending','running'));
 SELECT * INTO c FROM public.slim_audience_campaigns c1 WHERE c1.status IN ('queued','running') AND c1.next_due_at<=clock_timestamp() AND EXISTS(SELECT 1 FROM public.slim_audience_deliveries d1 WHERE d1.campaign_id=c1.id AND d1.status='pending') AND NOT EXISTS(SELECT 1 FROM public.slim_audience_deliveries d1 WHERE d1.campaign_id=c1.id AND d1.status='running') ORDER BY c1.next_due_at,c1.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO d FROM public.slim_audience_deliveries WHERE campaign_id=c.id AND status='pending' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.slim_audience_deliveries SET status='running',started_at=clock_timestamp() WHERE id=d.id;
 UPDATE public.slim_audience_campaigns SET status='running',next_due_at=clock_timestamp()+c.delay_ms*interval '1 millisecond' WHERE id=c.id;
 RETURN to_jsonb(d)||jsonb_build_object('campaign',to_jsonb(c));
END;$f$;
REVOKE ALL ON FUNCTION public.slim_claim_audience_delivery() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.slim_claim_audience_delivery() TO service_role;
CREATE FUNCTION public.slim_claim_stage_job(_job_id uuid) RETURNS SETOF public.crm_automation_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 UPDATE public.crm_automation_jobs SET status='running',started_at=clock_timestamp() WHERE id=_job_id AND status='pending' AND due_at<=clock_timestamp() RETURNING *;
$f$;
REVOKE ALL ON FUNCTION public.slim_claim_stage_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.slim_claim_stage_job(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
