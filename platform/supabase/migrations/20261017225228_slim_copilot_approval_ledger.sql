-- Saúde Slim / Copiloto: immutable proposals and explicit operator decisions.
-- Generated with Supabase CLI. Additive only; no backfill, provider call or job.
-- Business operations remain in SECURITY INVOKER functions and call the existing
-- RPCs as the authenticated caller. Definer helpers only guard/lock or write this ledger.

CREATE TABLE private.slim_copilot_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL,
 version uuid NOT NULL DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('move_lead_stage','start_salesbot','stop_salesbot','send_text')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','executing','succeeded','failed','rejected','stale','expired','uncertain')),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 preview jsonb NOT NULL CHECK(jsonb_typeof(preview)='object'),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '15 minutes'),
 decided_at timestamptz,
 decided_by uuid REFERENCES auth.users(id),
 decision text CHECK(decision IN ('approve','reject')),
 claim_token uuid,
 claimed_at timestamptz,
 finished_at timestamptz,
 final_outcome_sha256 text,
 UNIQUE(workspace_id,request_id),
 CHECK(result IS NULL OR jsonb_typeof(result)='object'),
 CHECK((claim_token IS NULL AND claimed_at IS NULL) OR (kind='send_text' AND claim_token IS NOT NULL AND claimed_at IS NOT NULL))
);
CREATE INDEX slim_copilot_proposals_actor_created
 ON private.slim_copilot_proposals(workspace_id,actor_id,created_at DESC,id);
CREATE TABLE private.slim_copilot_proposal_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 proposal_id uuid NOT NULL REFERENCES private.slim_copilot_proposals(id),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid REFERENCES auth.users(id),
 event text NOT NULL,
 from_status text,
 to_status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX slim_copilot_audit_proposal ON private.slim_copilot_proposal_audit(proposal_id,created_at,id);
ALTER TABLE private.slim_copilot_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.slim_copilot_proposal_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.slim_copilot_proposals,private.slim_copilot_proposal_audit FROM PUBLIC,anon,authenticated,service_role;

-- Lock only authorization records. No membership/profile is created or changed.
CREATE FUNCTION private.slim_copilot_assert_scope(p_workspace_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE v_actor uuid:=auth.uid(); v_active uuid; v_owner uuid; v_member public.workspace_members;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL THEN
  RAISE EXCEPTION 'Entre novamente para usar o Copiloto.' USING ERRCODE='42501';
 END IF;
 SELECT current_workspace_id INTO v_active FROM public.profiles WHERE id=v_actor FOR SHARE;
 IF v_active IS DISTINCT FROM p_workspace_id THEN
  RAISE EXCEPTION 'A empresa ativa mudou. Reabra o Copiloto.' USING ERRCODE='42501';
 END IF;
 SELECT owner_id INTO v_owner FROM public.workspaces WHERE id=p_workspace_id FOR SHARE;
 SELECT * INTO v_member FROM public.workspace_members WHERE workspace_id=p_workspace_id AND user_id=v_actor FOR SHARE;
 IF v_owner IS DISTINCT FROM v_actor AND (v_member.id IS NULL OR coalesce(v_member.role_type,'funcionario')='visualizador'
   OR (v_member.access_expires_at IS NOT NULL AND v_member.access_expires_at<=clock_timestamp())) THEN
  RAISE EXCEPTION 'Operador sem permissão vigente nesta empresa.' USING ERRCODE='42501';
 END IF;
 IF NOT private.slim_workspace_access(p_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Operador não autorizado nesta empresa.' USING ERRCODE='42501';
 END IF;
END;$f$;

-- All target reads/locks below run with the caller's grants and RLS. Read only
-- routing leaves from activities; never copy media/base64 into a proposal.
CREATE FUNCTION private.slim_copilot_capture(p_workspace_id uuid,p_kind text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE
 l public.leads; s public.pipeline_stages; p public.pipelines; b public.salesbots;
 v_lead jsonb; v_snapshot jsonb; v_preview jsonb; v_configs jsonb; v_blocks jsonb; v_live jsonb;
 v_run jsonb; v_row record; v_source_link boolean; v_from_stage text; v_from_pipeline text; v_count integer;
 v_known_phone text; v_preferred text; v_bound text; v_route_found boolean:=false; v_route_jid text; v_message_ids text[];
 v_session jsonb; v_identity jsonb; v_opted_out boolean; v_canonical uuid;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 SELECT * INTO l FROM public.leads WHERE id=(p_payload->>'leadId')::uuid AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR l.merged_into_id IS NOT NULL OR l.status IN ('deleted','archived','merged')
  OR coalesce(l.source,'')='whatsapp_group' OR coalesce(l.phone,'') LIKE '%@g.us'
  OR coalesce(l.custom_data->>'is_group','false')='true' THEN
  RAISE EXCEPTION 'Cliente individual indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 -- Preserve the canonical alias rule without merging, repairing or editing rows.
 IF l.source='pedido_saude_slim' AND jsonb_typeof(l.custom_data->'whatsapp_session_id')='string'
   AND length(l.custom_data->>'whatsapp_session_id')>0 THEN
  SELECT x.id INTO v_canonical FROM public.leads x WHERE x.workspace_id=p_workspace_id AND x.merged_into_id IS NULL
   AND x.status NOT IN ('deleted','archived','merged')
   AND coalesce(x.source,'') NOT IN ('pedido_saude_slim','whatsapp_group','instagram','facebook','messenger')
   AND private.slim_copilot_contact_key(x.phone)=private.slim_copilot_contact_key(l.phone)
   AND x.custom_data->>'whatsapp_session_id'=l.custom_data->>'whatsapp_session_id'
   ORDER BY x.created_at,x.id LIMIT 1;
  IF v_canonical IS NOT NULL AND v_canonical<>l.id THEN
   RAISE EXCEPTION 'A identidade do contato mudou. Prepare a proposta no cadastro principal.' USING ERRCODE='40001';
  END IF;
 END IF;
 v_opted_out:=coalesce(l.custom_data->>'opt_out','false')='true'
  OR coalesce(l.custom_data->>'do_not_contact','false')='true'
  OR coalesce(l.custom_data->>'whatsapp_opt_out','false')='true';
 IF p_kind IN ('move_lead_stage','send_text','start_salesbot') AND v_opted_out THEN
  RAISE EXCEPTION 'Este cliente possui bloqueio de contato.' USING ERRCODE='42501';
 END IF;
 v_lead:=jsonb_build_object('id',l.id,'name',l.name,'phone',l.phone,'phoneNormalized',l.phone_normalized,
  'status',l.status,'mergedIntoId',l.merged_into_id,'source',l.source,'createdAt',l.created_at,
  'crmSourceId',l.crm_source_id,'pipelineId',l.pipeline_id,'stageId',l.stage_id,
  'sessionId',l.custom_data->'whatsapp_session_id','optedOut',v_opted_out);
 v_snapshot:=jsonb_build_object('lead',v_lead);

 IF p_kind='move_lead_stage' THEN
  SELECT * INTO s FROM public.pipeline_stages WHERE id=(p_payload->>'stageId')::uuid AND workspace_id=p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa de destino indisponível nesta empresa.' USING ERRCODE='42501';END IF;
  -- The parent lock also serializes replace_crm_stage_automations and FK inserts.
  SELECT * INTO p FROM public.pipelines WHERE id=s.pipeline_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funil de destino indisponível nesta empresa.' USING ERRCODE='42501';END IF;
  SELECT * INTO s FROM public.pipeline_stages WHERE id=(p_payload->>'stageId')::uuid AND workspace_id=p_workspace_id AND pipeline_id=p.id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A etapa mudou de funil. Prepare uma nova proposta.' USING ERRCODE='40001';END IF;
  PERFORM 1 FROM public.crm_sources WHERE id=l.crm_source_id AND workspace_id=p_workspace_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Origem do cliente indisponível nesta empresa.' USING ERRCODE='42501';END IF;
  PERFORM 1 FROM public.crm_source_funnels WHERE workspace_id=p_workspace_id AND crm_source_id=l.crm_source_id AND pipeline_id=p.id FOR SHARE;
  v_source_link:=FOUND;
  IF p.crm_source_id IS DISTINCT FROM l.crm_source_id AND NOT v_source_link THEN
   RAISE EXCEPTION 'O funil não está vinculado à origem deste cliente.' USING ERRCODE='42501';
  END IF;
  SELECT name INTO v_from_stage FROM public.pipeline_stages WHERE id=l.stage_id AND workspace_id=p_workspace_id;
  SELECT name INTO v_from_pipeline FROM public.pipelines WHERE id=l.pipeline_id AND workspace_id=p_workspace_id;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]'::jsonb) INTO v_configs FROM (
   SELECT a.id,jsonb_build_object('id',a.id,'stageId',a.stage_id,'actionId',a.action_id,'action',a.action,
    'enabled',a.enabled,'position',a.position,'updatedAt',a.updated_at) item
   FROM public.crm_stage_automations a WHERE a.workspace_id=p_workspace_id AND a.pipeline_id=p.id ORDER BY a.id FOR SHARE
  ) x;
  SELECT count(*)::integer INTO v_count FROM jsonb_array_elements(v_configs) a
   WHERE coalesce(a->>'enabled','true')<>'false' AND coalesce(a#>>'{action,enabled}','true')<>'false'
    AND CASE WHEN jsonb_typeof(a#>'{action,stageIds}')='array' AND jsonb_array_length(a#>'{action,stageIds}')>0
     THEN (a#>'{action,stageIds}') ? s.id::text ELSE a->>'stageId'=s.id::text END;
  v_snapshot:=v_snapshot||jsonb_build_object('destination',jsonb_build_object('stageId',s.id,'stageName',s.name,'pipelineId',p.id,
   'pipelineName',p.name,'sourceId',p.crm_source_id,'sourceLinked',v_source_link),
   'fromStageName',v_from_stage,'fromPipelineName',v_from_pipeline,
   'automationHash',encode(sha256(convert_to(v_configs::text,'UTF8')),'hex'));
  v_preview:=jsonb_build_object('title','Mover cliente de etapa','targetLabel',l.name,
   'changes',jsonb_build_array(jsonb_build_object('label','Funil','before',coalesce(v_from_pipeline,'Sem funil'),'after',p.name),
    jsonb_build_object('label','Etapa','before',coalesce(v_from_stage,'Sem etapa'),'after',s.name)),
   'effects',jsonb_build_array(
    'A movimentação poderá acionar os gatilhos vigentes da etapa, inclusive mensagens, SalesBots e IA individual.',
    CASE WHEN v_count=0 THEN 'Não há gatilhos habilitados cobrindo esta etapa no momento da proposta.'
     ELSE v_count::text||' gatilho(s) habilitado(s) cobre(m) esta etapa; a execução depende dos critérios configurados.' END,
    'Depois da aprovação, as automações seguem a configuração vigente quando forem processadas.'),
   'cost','Podem ocorrer custos das integrações usadas pelo fluxo.');
 ELSIF p_kind='start_salesbot' THEN
  v_known_phone:=private.slim_copilot_phone(l.phone,true);
  IF v_known_phone IS NULL THEN RAISE EXCEPTION 'Confirme o telefone internacional do cliente antes de iniciar o SalesBot.' USING ERRCODE='22023';END IF;
  SELECT * INTO b FROM public.salesbots WHERE id=(p_payload->>'botId')::uuid AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND OR b.is_active IS DISTINCT FROM true OR b.scope IS DISTINCT FROM 'individual' THEN
   RAISE EXCEPTION 'Selecione um SalesBot individual ativo desta empresa.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]'::jsonb) INTO v_blocks FROM (
   SELECT z.id,jsonb_build_object('id',z.id,'type',z.type,'config',z.config,'nextBlockId',z.next_block_id) item
   FROM public.salesbot_blocks z WHERE z.salesbot_id=b.id AND z.workspace_id=p_workspace_id ORDER BY z.id FOR SHARE
  ) x;
  IF jsonb_array_length(v_blocks)=0 THEN RAISE EXCEPTION 'Este SalesBot não possui blocos salvos.' USING ERRCODE='22023';END IF;
  v_live:='[]'::jsonb;
  FOR v_row IN SELECT r.id,jsonb_build_object('id',r.id,'leadId',r.lead_id,'botId',r.salesbot_id,'status',r.status,
   'blockId',r.current_block_id,'waitingUntil',r.waiting_until,'stoppedAt',r.stopped_at,'updatedAt',r.updated_at) item
   FROM public.salesbot_runs r WHERE r.workspace_id=p_workspace_id AND r.lead_id=l.id AND r.salesbot_id=b.id
    AND r.status IN ('queued','pending','running','waiting','waiting_timer','waiting_message','paused') ORDER BY r.id LOOP
   PERFORM private.slim_copilot_lock_run(p_workspace_id,l.id,v_row.id,v_row.item);
   v_live:=v_live||jsonb_build_array(v_row.item);
  END LOOP;
  v_snapshot:=v_snapshot||jsonb_build_object('bot',jsonb_build_object('id',b.id,'name',b.name,'active',b.is_active,'scope',b.scope,
   'updatedAt',b.updated_at,'configHash',encode(sha256(convert_to(jsonb_build_object('settings',b.settings,'triggers',b.gatilhos,
    'trigger',b.trigger,'blocks',v_blocks)::text,'UTF8')),'hex')),'liveRuns',v_live,
   'agent',jsonb_build_object('id',l.active_conversation_agent_id,'paused',l.ai_paused,'version',l.active_conversation_agent_version));
  v_preview:=jsonb_build_object('title','Iniciar SalesBot','targetLabel',l.name,
   'changes',jsonb_build_array(jsonb_build_object('label','SalesBot','after',b.name)),
   'effects',jsonb_build_array('O SalesBot poderá enviar mensagens e, se configurado, encaminhar esta conversa à IA individual.',
    CASE WHEN jsonb_array_length(v_live)>0 THEN 'Já existe uma execução ativa deste SalesBot. Ela será preservada; outra execução não será criada.'
     ELSE 'A aprovação coloca este SalesBot na fila para o cliente indicado.' END,
    'Os blocos seguem a configuração vigente quando forem executados.'),
   'cost','Podem ocorrer custos das integrações usadas pelo fluxo.');
 ELSIF p_kind='stop_salesbot' THEN
  SELECT jsonb_build_object('id',r.id,'leadId',r.lead_id,'botId',r.salesbot_id,'status',r.status,
   'blockId',r.current_block_id,'waitingUntil',r.waiting_until,'stoppedAt',r.stopped_at,'updatedAt',r.updated_at)
   INTO v_run FROM public.salesbot_runs r WHERE r.id=(p_payload->>'runId')::uuid AND r.workspace_id=p_workspace_id AND r.lead_id=l.id;
  IF v_run IS NULL OR (v_run->>'status' IN ('queued','pending','running','waiting','waiting_timer','waiting_message','paused')) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Esta execução do SalesBot já foi encerrada ou não pertence ao cliente.' USING ERRCODE='40001';
  END IF;
  PERFORM private.slim_copilot_lock_run(p_workspace_id,l.id,(p_payload->>'runId')::uuid,v_run);
  SELECT * INTO b FROM public.salesbots WHERE id=(v_run->>'botId')::uuid AND workspace_id=p_workspace_id FOR SHARE;
  IF NOT FOUND OR b.scope IS DISTINCT FROM 'individual' THEN RAISE EXCEPTION 'SalesBot individual indisponível nesta empresa.' USING ERRCODE='42501';END IF;
  v_snapshot:=v_snapshot||jsonb_build_object('run',v_run,'botName',b.name);
  v_preview:=jsonb_build_object('title','Parar execução do SalesBot','targetLabel',l.name,
   'changes',jsonb_build_array(jsonb_build_object('label','SalesBot','after',b.name),
    jsonb_build_object('label','Execução','before',v_run->>'status','after','Encerrada')),
   'effects',jsonb_build_array('Encerra somente a execução indicada nesta proposta.',
    'Mensagens já aceitas pelo WhatsApp não podem ser desfeitas.'));
 ELSIF p_kind='send_text' THEN
  IF l.phone IS DISTINCT FROM p_payload->>'leadPhone' THEN RAISE EXCEPTION 'O telefone do cliente mudou. Prepare uma nova proposta.' USING ERRCODE='40001';END IF;
  v_known_phone:=private.slim_copilot_phone(l.phone,true);
  IF v_known_phone IS NULL OR v_known_phone IS DISTINCT FROM p_payload->>'number' THEN
   RAISE EXCEPTION 'O destinatário não corresponde ao telefone internacional deste cliente.' USING ERRCODE='42501';
  END IF;
  -- Same routing contract as the server adapter: the newest direct identity must
  -- agree with the complete phone; no suffix matching and no session fallback.
  v_message_ids:=ARRAY[]::text[];
  FOR v_row IN SELECT a.payload->>'whatsapp_remote_jid' jid,a.payload->>'whatsapp_session_id' session_id,
   a.payload->>'session_id' legacy_session_id,a.payload->>'whatsapp_message_id' message_id
   FROM public.lead_activities a WHERE a.workspace_id=p_workspace_id AND a.lead_id=l.id
    AND a.type IN ('message_in','message_out') ORDER BY a.occurred_at DESC LIMIT 80 LOOP
   IF length(coalesce(v_row.message_id,'')) BETWEEN 1 AND 256 THEN v_message_ids:=array_append(v_message_ids,v_row.message_id); END IF;
   IF NOT v_route_found AND length(coalesce(v_row.jid,''))>0 THEN
    v_identity:=private.slim_copilot_jid_identity(v_row.jid);
    IF (v_identity->>'kind') IS DISTINCT FROM 'direct' OR (v_identity->>'number') IS DISTINCT FROM v_known_phone THEN
     RAISE EXCEPTION 'A identidade da conversa não corresponde ao telefone do cliente.' USING ERRCODE='42501';
    END IF;
    v_bound:=coalesce(nullif(v_row.session_id,''),nullif(v_row.legacy_session_id,''));v_route_found:=true;
   END IF;
  END LOOP;
  IF NOT v_route_found AND cardinality(v_message_ids)>0 THEN
   FOR v_row IN SELECT m.remote_jid,m.to_jid,m.session_id FROM public.whatsapp_web_messages m
    WHERE m.workspace_id=p_workspace_id AND m.message_id=ANY(v_message_ids) ORDER BY m.received_at DESC LIMIT 80 LOOP
    v_identity:=coalesce(private.slim_copilot_jid_identity(v_row.remote_jid),private.slim_copilot_jid_identity(v_row.to_jid));
    IF v_identity->>'kind'='direct' AND v_identity->>'number'=v_known_phone THEN
     v_bound:=v_row.session_id::text;v_route_found:=true;EXIT;
    END IF;
   END LOOP;
  END IF;
  IF NOT v_route_found AND private.slim_copilot_phone(l.phone,false) IS NULL
    AND private.slim_copilot_phone(l.phone_normalized,true) IS DISTINCT FROM v_known_phone THEN
   RAISE EXCEPTION 'Confirme o telefone com DDI antes do primeiro envio.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(l.custom_data->'whatsapp_session_id')='string' THEN v_preferred:=nullif(btrim(l.custom_data->>'whatsapp_session_id'),'');END IF;
  v_bound:=coalesce(v_bound,v_preferred);
  IF v_bound IS NOT NULL AND v_bound IS DISTINCT FROM p_payload->>'sessionId' THEN
   RAISE EXCEPTION 'A proposta deve usar a sessão original da conversa.' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('id',z.id,'provider',z.provider,'status',z.status,'instanceId',z.instance_id,
   'phone',z.phone_number,'deleted',coalesce(z.metadata->>'deleted','false')) INTO v_session
   FROM public.whatsapp_web_sessions z WHERE z.id=(p_payload->>'sessionId')::uuid AND z.workspace_id=p_workspace_id
    AND z.provider='evolution' AND z.status='conectado' AND coalesce(z.metadata->>'deleted','false')<>'true' FOR SHARE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'A sessão aprovada está indisponível ou desconectada.' USING ERRCODE='42501';END IF;
  v_snapshot:=v_snapshot||jsonb_build_object('session',v_session,'routing',jsonb_build_object(
   'boundSessionId',v_bound,'number',v_known_phone,'remoteJid',p_payload->>'remoteJid','conversationKey',p_payload->>'conversationKey'));
  v_preview:=jsonb_build_object('title','Enviar mensagem de texto','targetLabel',l.name||' · +'||v_known_phone,
   'channel','WhatsApp · '||coalesce(nullif(v_session->>'phone',''),'sessão '||(p_payload->>'sessionId')),
   'content',p_payload->>'text',
   'changes',jsonb_build_array(jsonb_build_object('label','Destinatário','after','+'||v_known_phone)),
   'effects',jsonb_build_array('Envia uma única mensagem, com o texto e a sessão exibidos nesta proposta.',
    'O envio não ativa nem pausa a IA desta conversa.',
    'Uma tentativa sem confirmação não será repetida automaticamente.'),
   'cost','Podem ocorrer custos da integração de WhatsApp.');
 END IF;
 IF v_preview IS NULL THEN RAISE EXCEPTION 'Ação não permitida no Copiloto.' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('snapshot',v_snapshot,'preview',v_preview);
END;$f$;

CREATE FUNCTION private.slim_copilot_dto(p_row jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT jsonb_strip_nulls(jsonb_build_object(
  'id',p_row->'id','workspaceId',p_row->'workspace_id','actorId',p_row->'actor_id',
  'version',p_row->'version','kind',p_row->'kind','status',p_row->'status',
  'preview',p_row->'preview','createdAt',p_row->'created_at','expiresAt',p_row->'expires_at','result',p_row->'result'));
$f$;

CREATE FUNCTION private.slim_copilot_payload(p_kind text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE v_keys text[]; v_required text[]; v_key text; v_result jsonb; v_id uuid; v_text text;
BEGIN
 IF (p_kind IN ('move_lead_stage','start_salesbot','stop_salesbot','send_text')) IS DISTINCT FROM true
   OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>32768 THEN
  RAISE EXCEPTION 'Ação ou conteúdo de proposta inválido.' USING ERRCODE='22023';
 END IF;
 CASE p_kind
  WHEN 'move_lead_stage' THEN v_keys:=ARRAY['leadId','stageId','note'];v_required:=ARRAY['leadId','stageId'];
  WHEN 'start_salesbot' THEN v_keys:=ARRAY['leadId','botId'];v_required:=v_keys;
  WHEN 'stop_salesbot' THEN v_keys:=ARRAY['leadId','runId'];v_required:=v_keys;
  WHEN 'send_text' THEN v_keys:=ARRAY['leadId','text','sessionId','remoteJid','number','conversationKey','leadPhone'];v_required:=v_keys;
 END CASE;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(v_keys)) THEN
  RAISE EXCEPTION 'A proposta contém parâmetros não permitidos.' USING ERRCODE='22023';
 END IF;
 FOREACH v_key IN ARRAY v_required LOOP
  IF jsonb_typeof(p_payload->v_key) IS DISTINCT FROM 'string' OR length(btrim(p_payload->>v_key))=0 THEN
   RAISE EXCEPTION 'A proposta está incompleta.' USING ERRCODE='22023';
  END IF;
 END LOOP;
 v_result:=p_payload;
 FOREACH v_key IN ARRAY ARRAY['leadId','stageId','botId','runId','sessionId'] LOOP
  IF p_payload ? v_key THEN
   BEGIN v_id:=(p_payload->>v_key)::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Referência de proposta inválida.' USING ERRCODE='22023';END;
   v_result:=jsonb_set(v_result,ARRAY[v_key],to_jsonb(v_id::text));
  END IF;
 END LOOP;
 IF p_payload ? 'note' THEN
  IF jsonb_typeof(p_payload->'note') IS DISTINCT FROM 'string' OR length(p_payload->>'note')>1000
    OR translate(p_payload->>'note',E'\n\r\t','') ~ '[[:cntrl:]]' THEN
   RAISE EXCEPTION 'Motivo da proposta inválido.' USING ERRCODE='22023';
  END IF;
 END IF;
 IF p_kind='send_text' THEN
  v_text:=p_payload->>'text';
  IF length(v_text)>4000 OR length(p_payload->>'leadPhone')>200 OR translate(v_text,E'\n\r\t','') ~ '[[:cntrl:]]'
    OR (p_payload->>'number') !~ '^[1-9][0-9]{7,14}$'
    OR (p_payload->>'remoteJid') IS DISTINCT FROM (p_payload->>'number')||'@s.whatsapp.net'
    OR (p_payload->>'conversationKey') IS DISTINCT FROM (v_result->>'sessionId')||':'||(p_payload->>'remoteJid') THEN
   RAISE EXCEPTION 'Texto ou destinatário individual inválido.' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN v_result;
END;$f$;

-- Mirrors normalizeInternationalPhone; no country inference, no @lid/group conversion.
CREATE FUNCTION private.slim_copilot_jid_identity(p_jid text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $f$
DECLARE
 v_space constant text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 v_jid text:=lower(btrim(p_jid,v_space)); v_local text; v_number text;
BEGIN
 -- Same identity test as whatsappIdentityFromJid. A historical invalid primary
 -- may use its direct to_jid; a valid group primary never becomes a phone.
 IF right(v_jid,length('@s.whatsapp.net'))='@s.whatsapp.net' THEN
  v_local:=left(v_jid,length(v_jid)-length('@s.whatsapp.net'));v_number:=split_part(v_local,':',1);
  IF v_number ~ '^[1-9][0-9]{7,14}$' THEN RETURN jsonb_build_object('kind','direct','number',v_number);END IF;
 ELSIF right(v_jid,length('@g.us'))='@g.us' THEN
  v_local:=left(v_jid,length(v_jid)-length('@g.us'));
  IF v_local ~ '^[0-9-]+$' AND length(replace(v_local,'-',''))>=8 THEN RETURN jsonb_build_object('kind','group','number',v_jid);END IF;
 END IF;
 RETURN NULL;
END;$f$;

CREATE FUNCTION private.slim_copilot_contact_key(p_phone text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $f$
DECLARE
 v_space constant text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 v text:=btrim(p_phone,v_space);
BEGIN
 -- Same pure contactPhoneKey rule, without granting access to Block 2's helper.
 IF left(v,1)='+' THEN v:=substr(v,2);END IF;
 v:=translate(v,'().-'||v_space,'');
 IF v ~ '^[0-9]{8,15}$' THEN RETURN v;END IF;
 RETURN NULL;
END;$f$;

CREATE FUNCTION private.slim_copilot_phone(p_phone text,p_allow_bare boolean) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE v text; v_space text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF p_phone IS NULL THEN RETURN NULL; END IF;
 v:=translate(p_phone,v_space||'().-','');
 IF v !~ '^[+0-9]+$' THEN RETURN NULL; END IF;
 IF left(v,1)='+' THEN v:=substr(v,2);
 ELSIF left(v,2)='00' THEN v:=substr(v,3);
 ELSIF NOT p_allow_bare THEN RETURN NULL;
 END IF;
 IF v ~ '^[1-9][0-9]{7,14}$' THEN RETURN v; END IF;
 RETURN NULL;
END;$f$;

-- Authenticated has SELECT, not UPDATE, on runs. Do not grant UPDATE just for a
-- row lock. This check-only helper locks the exact visible target after the
-- public invoker has performed its RLS read; the business RPC runs outside it.
CREATE FUNCTION private.slim_copilot_lock_run(p_workspace_id uuid,p_lead_id uuid,p_run_id uuid,p_expected jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE v_run jsonb;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 IF NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=p_lead_id AND l.workspace_id=p_workspace_id
  AND l.merged_into_id IS NULL AND l.status NOT IN ('deleted','archived','merged')
  AND coalesce(l.source,'')<>'whatsapp_group' AND coalesce(l.phone,'') NOT LIKE '%@g.us') THEN
  RAISE EXCEPTION 'Cliente indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object('id',r.id,'leadId',r.lead_id,'botId',r.salesbot_id,'status',r.status,
  'blockId',r.current_block_id,'waitingUntil',r.waiting_until,'stoppedAt',r.stopped_at,'updatedAt',r.updated_at)
  INTO v_run FROM public.salesbot_runs r WHERE r.id=p_run_id AND r.workspace_id=p_workspace_id AND r.lead_id=p_lead_id FOR UPDATE;
 IF v_run IS NULL OR v_run IS DISTINCT FROM p_expected THEN
  RAISE EXCEPTION 'A execução mudou. Prepare uma nova proposta.' USING ERRCODE='40001';
 END IF;
END;$f$;

CREATE FUNCTION private.slim_copilot_refresh(p_workspace_id uuid,p_proposal_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r private.slim_copilot_proposals; v_from text;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 SELECT * INTO r FROM private.slim_copilot_proposals
  WHERE id=p_proposal_id AND workspace_id=p_workspace_id AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada para este operador e empresa.' USING ERRCODE='42501';END IF;
 v_from:=r.status;
 IF r.status='pending' AND r.expires_at<=clock_timestamp() THEN
  UPDATE private.slim_copilot_proposals SET status='expired',finished_at=clock_timestamp(),
   result=jsonb_build_object('summary','Esta proposta venceu. Prepare uma nova proposta antes de executar.') WHERE id=r.id RETURNING * INTO r;
 ELSIF r.status='executing' AND r.kind='send_text' AND r.claimed_at<clock_timestamp()-interval '2 minutes' THEN
  UPDATE private.slim_copilot_proposals SET status='uncertain',
   result=jsonb_build_object('summary','A tentativa ficou sem confirmação. Confira o histórico; este texto não será reenviado automaticamente.')
   WHERE id=r.id RETURNING * INTO r;
 END IF;
 IF v_from<>r.status THEN
  INSERT INTO private.slim_copilot_proposal_audit(proposal_id,workspace_id,actor_id,event,from_status,to_status)
   VALUES(r.id,r.workspace_id,NULL,'timeout',v_from,r.status);
 END IF;
 RETURN to_jsonb(r);
END;$f$;

CREATE FUNCTION private.slim_copilot_find_request(p_workspace_id uuid,p_request_id uuid,p_kind text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r private.slim_copilot_proposals; v_hash text;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identificador da proposta obrigatório.' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_request_id::text,61));
 v_hash:=encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'payload',p_payload)::text,'UTF8')),'hex');
 SELECT * INTO r FROM private.slim_copilot_proposals WHERE workspace_id=p_workspace_id AND request_id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.actor_id IS DISTINCT FROM auth.uid() OR r.request_sha256 IS DISTINCT FROM v_hash THEN
  RAISE EXCEPTION 'Esta solicitação já pertence a outra proposta.' USING ERRCODE='42501';
 END IF;
 RETURN private.slim_copilot_refresh(p_workspace_id,r.id);
END;$f$;

CREATE FUNCTION private.slim_copilot_store(p_workspace_id uuid,p_request_id uuid,p_kind text,p_payload jsonb,p_snapshot jsonb,p_preview jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r private.slim_copilot_proposals; v_existing jsonb;
BEGIN
 v_existing:=private.slim_copilot_find_request(p_workspace_id,p_request_id,p_kind,p_payload);
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR jsonb_typeof(p_preview) IS DISTINCT FROM 'object'
   OR (p_snapshot#>>'{lead,id}') IS DISTINCT FROM (p_payload->>'leadId') THEN
  RAISE EXCEPTION 'Prévia não corresponde ao alvo da proposta.' USING ERRCODE='22023';
 END IF;
 INSERT INTO private.slim_copilot_proposals(workspace_id,actor_id,request_id,kind,request_sha256,payload,snapshot,preview)
 VALUES(p_workspace_id,auth.uid(),p_request_id,p_kind,
  encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'payload',p_payload)::text,'UTF8')),'hex'),p_payload,p_snapshot,p_preview)
 RETURNING * INTO r;
 INSERT INTO private.slim_copilot_proposal_audit(proposal_id,workspace_id,actor_id,event,to_status)
 VALUES(r.id,r.workspace_id,auth.uid(),'proposed',r.status);
 RETURN to_jsonb(r);
END;$f$;

CREATE FUNCTION private.slim_copilot_transition(p_workspace_id uuid,p_proposal_id uuid,p_version uuid,p_status text,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r private.slim_copilot_proposals;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 SELECT * INTO r FROM private.slim_copilot_proposals
  WHERE id=p_proposal_id AND workspace_id=p_workspace_id AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Versão ou identidade da proposta inválida.' USING ERRCODE='42501';END IF;
 IF r.status<>'pending' THEN RETURN to_jsonb(r); END IF;
 IF (p_status IN ('executing','succeeded','failed','rejected','stale')) IS DISTINCT FROM true
   OR (p_status='executing' AND r.kind<>'send_text')
   OR (p_status='succeeded' AND r.kind='send_text')
   OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR length(coalesce(p_result->>'summary','')) NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'Transição de proposta inválida.' USING ERRCODE='22023';
 END IF;
 UPDATE private.slim_copilot_proposals SET status=p_status,result=p_result,decided_at=clock_timestamp(),decided_by=auth.uid(),
  decision=CASE WHEN p_status='rejected' THEN 'reject' ELSE 'approve' END,
  claim_token=CASE WHEN p_status='executing' THEN gen_random_uuid() ELSE NULL END,
  claimed_at=CASE WHEN p_status='executing' THEN clock_timestamp() ELSE NULL END,
  finished_at=CASE WHEN p_status<>'executing' THEN clock_timestamp() ELSE NULL END
 WHERE id=r.id RETURNING * INTO r;
 INSERT INTO private.slim_copilot_proposal_audit(proposal_id,workspace_id,actor_id,event,from_status,to_status)
 VALUES(r.id,r.workspace_id,auth.uid(),r.decision,'pending',r.status);
 RETURN to_jsonb(r);
END;$f$;

CREATE FUNCTION private.slim_copilot_immutable_proposal() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','result','decided_at','decided_by','decision','claim_token','claimed_at','finished_at','final_outcome_sha256'])
   IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','result','decided_at','decided_by','decision','claim_token','claimed_at','finished_at','final_outcome_sha256']) THEN
  RAISE EXCEPTION 'Conteúdo e identidade da proposta são imutáveis.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END;$f$;
CREATE TRIGGER slim_copilot_immutable_proposal BEFORE UPDATE ON private.slim_copilot_proposals
 FOR EACH ROW EXECUTE FUNCTION private.slim_copilot_immutable_proposal();

CREATE FUNCTION public.slim_copilot_create_proposal(p_workspace_id uuid,p_request_id uuid,p_kind text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE v_payload jsonb; v_row jsonb; v_capture jsonb;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 v_payload:=private.slim_copilot_payload(p_kind,p_payload);
 v_row:=private.slim_copilot_find_request(p_workspace_id,p_request_id,p_kind,v_payload);
 IF v_row IS NOT NULL THEN RETURN private.slim_copilot_dto(v_row); END IF;
 v_capture:=private.slim_copilot_capture(p_workspace_id,p_kind,v_payload);
 v_row:=private.slim_copilot_store(p_workspace_id,p_request_id,p_kind,v_payload,v_capture->'snapshot',v_capture->'preview');
 RETURN private.slim_copilot_dto(v_row);
END;$f$;

CREATE FUNCTION public.slim_copilot_get_proposal(p_workspace_id uuid,p_proposal_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_copilot_dto(private.slim_copilot_refresh(p_workspace_id,p_proposal_id));
$f$;

CREATE FUNCTION private.slim_copilot_list(p_workspace_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r record; v_result jsonb:='[]'::jsonb;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 FOR r IN SELECT id FROM private.slim_copilot_proposals
  WHERE workspace_id=p_workspace_id AND actor_id=auth.uid() ORDER BY created_at DESC,id LIMIT 100 LOOP
  v_result:=v_result||jsonb_build_array(private.slim_copilot_dto(private.slim_copilot_refresh(p_workspace_id,r.id)));
 END LOOP;
 RETURN v_result;
END;$f$;

CREATE FUNCTION public.slim_copilot_list_proposals(p_workspace_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_copilot_list(p_workspace_id);
$f$;

CREATE FUNCTION public.slim_copilot_decide_proposal(p_workspace_id uuid,p_proposal_id uuid,p_expected_version uuid,p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE v_row jsonb; v_capture jsonb; v_reply jsonb; v_result jsonb; v_status text; v_payload jsonb;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 IF p_proposal_id IS NULL OR p_expected_version IS NULL OR (p_decision IN ('approve','reject')) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Informe a proposta, a versão e uma decisão explícita.' USING ERRCODE='22023';
 END IF;
 -- Same order as the established unitary move: request lock, then lead lock.
 -- Reentrant inside slim_move_lead_and_emit; no Node check/RPC race.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_proposal_id::text,23));
 v_row:=private.slim_copilot_refresh(p_workspace_id,p_proposal_id);
 IF (v_row->>'version')::uuid IS DISTINCT FROM p_expected_version THEN
  RAISE EXCEPTION 'A versão da proposta mudou. Reabra o cartão antes de decidir.' USING ERRCODE='42501';
 END IF;
 -- Replays return the stored receipt before reading mutable target state.
 IF v_row->>'status'<>'pending' THEN RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));END IF;
 IF p_decision='reject' THEN
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'rejected',
   jsonb_build_object('summary','Proposta rejeitada. A ação não foi executada.'));
  RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));
 END IF;
 v_payload:=v_row->'payload';
 BEGIN
  v_capture:=private.slim_copilot_capture(p_workspace_id,v_row->>'kind',v_payload);
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR serialization_failure THEN
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'stale',
   jsonb_build_object('summary','O alvo, o acesso ou a configuração mudou. Prepare uma nova proposta; esta ação não foi executada.'));
  RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));
 END;
 IF (v_capture->'snapshot') IS DISTINCT FROM (v_row->'snapshot') THEN
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'stale',
   jsonb_build_object('summary','O estado exibido na proposta mudou. Prepare uma nova proposta; esta ação não foi executada.'));
  RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));
 END IF;
 IF v_row->>'kind'='send_text' THEN
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'executing',
   jsonb_build_object('summary','Tentativa de envio registrada. Aguarde a confirmação e não repita o envio.'));
  -- The server consumes this one-time claim and returns only proposal to the UI.
  RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row),'claim',v_payload||jsonb_build_object(
   'fresh',true,'proposalId',p_proposal_id,'workspaceId',p_workspace_id,'actorId',auth.uid(),
   'version',p_expected_version,'claimToken',v_row->'claim_token','createdAt',v_row->'created_at'));
 END IF;
 -- A failed receipt save rolls back the business RPC and its outbox in this
 -- subtransaction. Only a no-effect failure/stale receipt may then be persisted.
 BEGIN
  CASE v_row->>'kind'
   WHEN 'move_lead_stage' THEN
    v_reply:=public.slim_move_lead_and_emit(p_workspace_id,(v_payload->>'leadId')::uuid,(v_payload->>'stageId')::uuid,p_proposal_id);
    IF (v_reply->>'ok') IS DISTINCT FROM 'true' OR v_reply->>'leadId' IS DISTINCT FROM v_payload->>'leadId' THEN
     RAISE EXCEPTION 'Movimentação não confirmada.';
    END IF;
    v_result:=jsonb_build_object('summary',CASE WHEN (v_reply->>'moved')='true'
      THEN 'Cliente movido. Os gatilhos aplicáveis entram na fila de automações.' ELSE 'O cliente já estava nesta etapa. Nenhuma nova movimentação foi feita.' END,
     'receiptId',coalesce(v_reply->>'eventId',p_proposal_id::text));
   WHEN 'start_salesbot' THEN
    v_reply:=public.slim_inbox_start_salesbot(p_workspace_id,(v_payload->>'leadId')::uuid,(v_payload->>'botId')::uuid,p_proposal_id);
    IF (v_reply->>'ok') IS DISTINCT FROM 'true' OR length(coalesce(v_reply->>'runId',''))=0 THEN RAISE EXCEPTION 'Início do SalesBot não confirmado.';END IF;
    IF v_reply->>'reused'='true' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_row#>'{snapshot,liveRuns}') r WHERE r->>'id'=v_reply->>'runId') THEN
     RAISE EXCEPTION 'Outra execução foi iniciada. Prepare uma nova proposta.' USING ERRCODE='40001';
    END IF;
    v_result:=jsonb_build_object('summary',CASE WHEN v_reply->>'reused'='true' THEN 'A execução já ativa foi preservada. Nenhum SalesBot duplicado foi iniciado.'
     ELSE 'SalesBot colocado na fila para este cliente. O andamento pode ser conferido no Inbox.' END,'receiptId',v_reply->>'runId');
   WHEN 'stop_salesbot' THEN
    v_reply:=public.slim_inbox_stop_salesbot(p_workspace_id,(v_payload->>'leadId')::uuid,(v_payload->>'runId')::uuid);
    IF (v_reply->>'ok') IS DISTINCT FROM 'true' OR (v_reply->>'stopped') IS DISTINCT FROM 'true'
      OR (v_reply->>'runId') IS DISTINCT FROM (v_payload->>'runId') THEN
     RAISE EXCEPTION 'A execução mudou antes de ser encerrada.' USING ERRCODE='40001';
    END IF;
    v_result:=jsonb_build_object('summary','A execução indicada foi encerrada. Mensagens já aceitas pelo WhatsApp não são desfeitas.','receiptId',v_reply->>'runId');
   ELSE RAISE EXCEPTION 'Ação não permitida no Copiloto.' USING ERRCODE='22023';
  END CASE;
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'succeeded',v_result);
 EXCEPTION WHEN OTHERS THEN
  v_status:=CASE WHEN SQLSTATE IN ('40001','42501') THEN 'stale' ELSE 'failed' END;
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,v_status,
   jsonb_build_object('summary',CASE WHEN v_status='stale' THEN 'O estado ou a permissão mudou. Prepare uma nova proposta; esta ação não foi executada.'
    ELSE 'Não foi possível concluir esta ação. As alterações desta tentativa foram desfeitas; confira o resultado antes de preparar outra proposta.' END,
    'code',SQLSTATE));
 END;
 RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));
END;$f$;

CREATE FUNCTION private.slim_copilot_finish_text_impl(p_workspace_id uuid,p_proposal_id uuid,p_claim_token uuid,p_outcome jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r private.slim_copilot_proposals; v_hash text; v_status text; v_result jsonb; v_from text;
BEGIN
 -- JWT callers cannot fabricate provider receipts. This entrypoint is granted
 -- only to service_role and must run under that role, with the durable claim.
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR p_claim_token IS NULL THEN
  RAISE EXCEPTION 'Finalização reservada ao servidor.' USING ERRCODE='42501';
 END IF;
 v_status:=p_outcome->>'status';v_result:=p_outcome->'result';
 IF jsonb_typeof(p_outcome) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_outcome) k WHERE k NOT IN ('status','result'))
   OR (v_status IN ('succeeded','failed','uncertain','stale')) IS DISTINCT FROM true
   OR jsonb_typeof(v_result) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_result) k WHERE k NOT IN ('summary','receiptId','historyPending','code'))
   OR jsonb_typeof(v_result->'summary') IS DISTINCT FROM 'string'
   OR length(coalesce(v_result->>'summary','')) NOT BETWEEN 1 AND 2000
   OR (v_result ? 'receiptId' AND (jsonb_typeof(v_result->'receiptId') IS DISTINCT FROM 'string' OR length(v_result->>'receiptId') NOT BETWEEN 1 AND 300))
   OR (v_result ? 'historyPending' AND jsonb_typeof(v_result->'historyPending') IS DISTINCT FROM 'boolean')
   OR (v_result ? 'code' AND (jsonb_typeof(v_result->'code') IS DISTINCT FROM 'string' OR length(v_result->>'code')>120))
   OR (v_status='succeeded' AND length(coalesce(v_result->>'receiptId',''))=0) THEN
  RAISE EXCEPTION 'Recibo de envio inválido.' USING ERRCODE='22023';
 END IF;
 v_hash:=encode(sha256(convert_to(p_outcome::text,'UTF8')),'hex');
 SELECT * INTO r FROM private.slim_copilot_proposals WHERE id=p_proposal_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR r.kind<>'send_text' OR r.claim_token IS DISTINCT FROM p_claim_token THEN
  RAISE EXCEPTION 'Tentativa de envio não autorizada.' USING ERRCODE='42501';
 END IF;
 IF r.final_outcome_sha256 IS NOT NULL THEN
  IF r.final_outcome_sha256 IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'Esta tentativa já possui outro recibo final.' USING ERRCODE='42501';END IF;
  RETURN private.slim_copilot_dto(to_jsonb(r));
 END IF;
 IF r.status NOT IN ('executing','uncertain') THEN RAISE EXCEPTION 'Tentativa de envio fora de execução.' USING ERRCODE='42501';END IF;
 v_from:=r.status;
 UPDATE private.slim_copilot_proposals SET status=v_status,result=v_result,finished_at=clock_timestamp(),final_outcome_sha256=v_hash
  WHERE id=r.id RETURNING * INTO r;
 INSERT INTO private.slim_copilot_proposal_audit(proposal_id,workspace_id,actor_id,event,from_status,to_status)
  VALUES(r.id,r.workspace_id,NULL,'provider_result',v_from,r.status);
 RETURN private.slim_copilot_dto(to_jsonb(r));
END;$f$;

CREATE FUNCTION public.slim_copilot_finish_text(p_workspace_id uuid,p_proposal_id uuid,p_claim_token uuid,p_outcome jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_copilot_finish_text_impl(p_workspace_id,p_proposal_id,p_claim_token,p_outcome);
$f$;

-- Only these explicit entrypoints are exposed. No direct table write, arbitrary
-- SQL, profile repair, model approval tool or provider credential is introduced.
DO $f$
DECLARE r record;
BEGIN
 FOR r IN SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('private','public') AND p.proname LIKE 'slim_copilot_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC,anon,authenticated,service_role',r.nspname,r.proname,r.args);
  IF r.proname IN ('slim_copilot_finish_text','slim_copilot_finish_text_impl') THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',r.nspname,r.proname,r.args);
  ELSIF r.proname<>'slim_copilot_immutable_proposal' THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',r.nspname,r.proname,r.args);
  END IF;
 END LOOP;
END;$f$;
GRANT EXECUTE ON FUNCTION private.slim_copilot_dto(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
