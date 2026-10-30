-- Saúde Slim: manual creation, unitary moves and selected bulk moves with durable events.
-- Additive installation only. This migration does not create or move any real lead.
ALTER TABLE public.slim_stage_move_events
 ADD COLUMN event_kind text NOT NULL DEFAULT 'moved'
 CHECK (event_kind IN ('moved','created'));

-- A private receipt is also retained for every no-op request, so a delayed retry
-- cannot move contacts again after a later, independent user action.
CREATE TABLE private.slim_funnel_write_requests (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 operation text NOT NULL CHECK (operation IN ('create','move','bulk_move')),
 request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
 response jsonb NOT NULL CHECK (jsonb_typeof(response)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (workspace_id,request_id)
);
ALTER TABLE private.slim_funnel_write_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.slim_funnel_write_requests FROM PUBLIC,anon,authenticated,service_role;

-- Scoped to the existing Funnel creation guard. Match contactPhoneKey exactly:
-- one optional leading +, digits, parentheses, dots, whitespace and hyphens; 8..15 digits.
-- The whitespace list is ECMAScript \s/trim, including NBSP and BOM. No DDI is inferred.
CREATE FUNCTION private.slim_funnel_contact_phone_key(_phone text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $f$
DECLARE
 v_whitespace constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 v_phone text := btrim(_phone,v_whitespace);
 v_digits text;
BEGIN
 IF left(v_phone,1)='+' THEN v_phone := substr(v_phone,2); END IF;
 v_digits := translate(v_phone,'().-'||v_whitespace,'');
 IF v_digits ~ '^[0-9]{8,15}$' THEN RETURN v_digits; END IF;
 RETURN NULL;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_funnel_contact_phone_key(text) FROM PUBLIC,anon,authenticated,service_role;

-- The public RPC is an invoker wrapper. Only the private implementation needs
-- definer privileges to persist the protected receipt and outbox in one transaction.
CREATE FUNCTION private.slim_create_lead_and_emit_impl(
 _workspace_id uuid,_crm_source_id uuid,_pipeline_id uuid,_stage_id uuid,
 _name text,_email text,_phone text,_value numeric,_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE
 v_name text := btrim(_name);
 v_email text := nullif(btrim(_email),'');
 v_phone text := nullif(btrim(_phone,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'');
 v_phone_key text;
 v_value numeric := trim_scale(coalesce(_value,0));
 v_fingerprint text;
 v_receipt private.slim_funnel_write_requests;
 v_lead_id uuid;
 v_event_id uuid;
 v_response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para cadastrar o cliente.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _crm_source_id IS NULL OR _pipeline_id IS NULL OR _stage_id IS NULL
    OR v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 200
    OR length(coalesce(v_email,''))>254 OR length(coalesce(v_phone,''))>64
    OR v_value<0 OR v_value::text IN ('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'Cadastro de cliente inválido.' USING ERRCODE='22023';
 END IF;
 v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'crmSourceId',_crm_source_id,'pipelineId',_pipeline_id,'stageId',_stage_id,
  'name',v_name,'email',v_email,'phone',v_phone,'value',v_value
 )::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,23));
 SELECT * INTO v_receipt FROM private.slim_funnel_write_requests
  WHERE workspace_id=_workspace_id AND request_id=_request_id;
 IF FOUND THEN
  IF v_receipt.actor_id<>auth.uid() OR v_receipt.operation<>'create'
     OR v_receipt.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'Referência de operação já utilizada.' USING ERRCODE='22023';
  END IF;
  RETURN v_receipt.response;
 END IF;
 IF EXISTS (SELECT 1 FROM public.slim_stage_move_events WHERE id=_request_id) THEN
  RAISE EXCEPTION 'Referência de operação já utilizada.' USING ERRCODE='22023';
 END IF;
 PERFORM 1
 FROM public.crm_sources c
 JOIN public.pipelines p ON p.id=_pipeline_id AND p.workspace_id=_workspace_id
 JOIN public.pipeline_stages s ON s.id=_stage_id AND s.pipeline_id=p.id AND s.workspace_id=_workspace_id
 WHERE c.id=_crm_source_id AND c.workspace_id=_workspace_id
  AND (p.crm_source_id=c.id OR EXISTS (
   SELECT 1 FROM public.crm_source_funnels f
   WHERE f.workspace_id=_workspace_id AND f.crm_source_id=c.id AND f.pipeline_id=p.id
  ));
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Fonte, funil ou etapa indisponível para sua empresa.' USING ERRCODE='42501';
 END IF;
 v_phone_key := private.slim_funnel_contact_phone_key(v_phone);
 IF v_phone IS NOT NULL AND v_phone_key IS NULL THEN
  RAISE EXCEPTION 'Informe o telefone completo. Identificadores de grupo não são números de cliente.' USING ERRCODE='22023';
 END IF;
 IF v_phone_key IS NOT NULL THEN
  -- Serialize distinct Funnel creation requests for this workspace/phone too.
  -- This is an entry-point guard, not a global phone index or a historical repair.
  PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||':'||v_phone_key,47));
  IF EXISTS (
   SELECT 1 FROM public.leads l WHERE l.workspace_id=_workspace_id
    AND l.merged_into_id IS NULL
    AND (l.status IS NULL OR l.status NOT IN ('deleted','archived','merged'))
    AND private.slim_funnel_contact_phone_key(l.phone)=v_phone_key
  ) THEN
   RAISE EXCEPTION 'Este telefone já possui um contato. Use o cadastro existente; a etapa e os dados dele foram preservados.' USING ERRCODE='23505';
  END IF;
 END IF;
 INSERT INTO public.leads(
  workspace_id,crm_source_id,pipeline_id,stage_id,name,email,phone,phone_normalized,value,source,status,last_message_from
 ) VALUES (
  _workspace_id,_crm_source_id,_pipeline_id,_stage_id,v_name,v_email,v_phone,v_phone_key,v_value,
  'cadastro_manual_saude_slim','active','none'
 ) RETURNING id INTO v_lead_id;
 v_event_id := gen_random_uuid();
 INSERT INTO public.slim_stage_move_events(
  id,workspace_id,lead_id,actor_id,from_stage_id,to_stage_id,pipeline_id,event_kind
 ) VALUES (
  v_event_id,_workspace_id,v_lead_id,auth.uid(),NULL,_stage_id,_pipeline_id,'created'
 );
 v_response := jsonb_build_object('ok',true,'id',v_lead_id,'leadId',v_lead_id,
  'eventId',v_event_id,'state','pending');
 INSERT INTO private.slim_funnel_write_requests(
  workspace_id,request_id,actor_id,operation,request_fingerprint,response
 ) VALUES (_workspace_id,_request_id,auth.uid(),'create',v_fingerprint,v_response);
 RETURN v_response;
END;$f$;

CREATE FUNCTION public.slim_create_lead_and_emit(
 _workspace_id uuid,_crm_source_id uuid,_pipeline_id uuid,_stage_id uuid,
 _name text,_email text,_phone text,_value numeric,_request_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_create_lead_and_emit_impl(
  _workspace_id,_crm_source_id,_pipeline_id,_stage_id,_name,_email,_phone,_value,_request_id
 );
$f$;

CREATE FUNCTION private.slim_move_lead_and_emit_impl(
 _workspace_id uuid,_lead_id uuid,_stage_id uuid,_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE
 v_fingerprint text;
 v_receipt private.slim_funnel_write_requests;
 v_lead public.leads;
 v_stage public.pipeline_stages;
 v_pipeline public.pipelines;
 v_event public.slim_stage_move_events;
 v_response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para mover o cliente.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _lead_id IS NULL OR _stage_id IS NULL THEN
  RAISE EXCEPTION 'Movimentação inválida.' USING ERRCODE='22023';
 END IF;
 v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'leadId',_lead_id,'stageId',_stage_id
 )::text,'UTF8')),'hex');
 -- Keep the original lock key and event ID compatible with in-flight requests.
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,23));
 SELECT * INTO v_receipt FROM private.slim_funnel_write_requests
  WHERE workspace_id=_workspace_id AND request_id=_request_id;
 IF FOUND THEN
  IF v_receipt.actor_id<>auth.uid() OR v_receipt.operation<>'move'
     OR v_receipt.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'Referência de movimentação já utilizada.' USING ERRCODE='22023';
  END IF;
  RETURN v_receipt.response;
 END IF;
 -- Requests successfully completed before this migration have an outbox event,
 -- but no receipt. Recognize them without moving the contact a second time.
 SELECT * INTO v_event FROM public.slim_stage_move_events WHERE id=_request_id;
 IF FOUND THEN
  IF v_event.workspace_id<>_workspace_id OR v_event.actor_id<>auth.uid()
     OR v_event.lead_id<>_lead_id OR v_event.to_stage_id<>_stage_id
     OR v_event.event_kind<>'moved' THEN
   RAISE EXCEPTION 'Referência de movimentação já utilizada.' USING ERRCODE='22023';
  END IF;
  v_response := jsonb_build_object('ok',true,'moved',true,'eventId',v_event.id,
   'state',v_event.status,'leadId',v_event.lead_id);
 ELSE
  SELECT * INTO v_lead FROM public.leads
   WHERE id=_lead_id AND workspace_id=_workspace_id AND merged_into_id IS NULL
    AND status NOT IN ('deleted','archived','merged') FOR UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Cliente indisponível nesta empresa.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_stage FROM public.pipeline_stages
   WHERE id=_stage_id AND workspace_id=_workspace_id;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Etapa indisponível nesta empresa.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_pipeline FROM public.pipelines
   WHERE id=v_stage.pipeline_id AND workspace_id=_workspace_id;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Funil indisponível nesta empresa.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.crm_sources c
   WHERE c.id=v_lead.crm_source_id AND c.workspace_id=_workspace_id
    AND (v_pipeline.crm_source_id=c.id OR EXISTS (
     SELECT 1 FROM public.crm_source_funnels f
     WHERE f.workspace_id=_workspace_id AND f.crm_source_id=c.id AND f.pipeline_id=v_pipeline.id
    ));
  IF NOT FOUND THEN
   RAISE EXCEPTION 'O funil não está disponível para a fonte deste cliente.' USING ERRCODE='42501';
  END IF;
  IF v_lead.stage_id IS NOT DISTINCT FROM v_stage.id
     AND v_lead.pipeline_id IS NOT DISTINCT FROM v_stage.pipeline_id THEN
   v_response := jsonb_build_object('ok',true,'moved',false,'eventId',NULL,
    'state','unchanged','leadId',v_lead.id);
  ELSE
   INSERT INTO public.slim_stage_move_events(
    id,workspace_id,lead_id,actor_id,from_stage_id,to_stage_id,pipeline_id,event_kind
   ) VALUES (
    _request_id,_workspace_id,v_lead.id,auth.uid(),v_lead.stage_id,v_stage.id,v_stage.pipeline_id,'moved'
   );
   UPDATE public.leads SET stage_id=v_stage.id,pipeline_id=v_stage.pipeline_id,updated_at=clock_timestamp()
    WHERE id=v_lead.id AND workspace_id=_workspace_id;
   v_response := jsonb_build_object('ok',true,'moved',true,'eventId',_request_id,
    'state','pending','leadId',v_lead.id);
  END IF;
 END IF;
 INSERT INTO private.slim_funnel_write_requests(
  workspace_id,request_id,actor_id,operation,request_fingerprint,response
 ) VALUES (_workspace_id,_request_id,auth.uid(),'move',v_fingerprint,v_response);
 RETURN v_response;
END;$f$;

CREATE OR REPLACE FUNCTION public.slim_move_lead_and_emit(
 _workspace_id uuid,_lead_id uuid,_stage_id uuid,_request_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_move_lead_and_emit_impl(_workspace_id,_lead_id,_stage_id,_request_id);
$f$;

CREATE FUNCTION private.slim_bulk_move_leads_and_emit_impl(
 _workspace_id uuid,_lead_ids uuid[],_stage_id uuid,_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE
 v_ids uuid[];
 v_distinct_count integer;
 v_fingerprint text;
 v_receipt private.slim_funnel_write_requests;
 v_stage public.pipeline_stages;
 v_pipeline public.pipelines;
 v_lead public.leads;
 v_lead_id uuid;
 v_count integer := 0;
 v_moved integer := 0;
 v_event_ids jsonb := '[]'::jsonb;
 v_item jsonb;
 v_response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para mover os clientes.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _stage_id IS NULL OR _lead_ids IS NULL
    OR cardinality(_lead_ids) NOT BETWEEN 1 AND 100 OR array_ndims(_lead_ids)<>1 THEN
  RAISE EXCEPTION 'Selecione de 1 a 100 clientes para mover.' USING ERRCODE='22023';
 END IF;
 IF array_position(_lead_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Seleção de clientes inválida.' USING ERRCODE='22023';
 END IF;
 SELECT array_agg(id ORDER BY id),count(DISTINCT id)::integer INTO v_ids,v_distinct_count
  FROM unnest(_lead_ids) AS selected(id);
 IF v_distinct_count<>cardinality(_lead_ids) THEN
  RAISE EXCEPTION 'A seleção contém clientes repetidos.' USING ERRCODE='22023';
 END IF;
 v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'leadIds',v_ids,'stageId',_stage_id
 )::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,23));
 SELECT * INTO v_receipt FROM private.slim_funnel_write_requests
  WHERE workspace_id=_workspace_id AND request_id=_request_id;
 IF FOUND THEN
  IF v_receipt.actor_id<>auth.uid() OR v_receipt.operation<>'bulk_move'
     OR v_receipt.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'Referência de operação já utilizada.' USING ERRCODE='22023';
  END IF;
  RETURN v_receipt.response;
 END IF;
 IF EXISTS (SELECT 1 FROM public.slim_stage_move_events WHERE id=_request_id) THEN
  RAISE EXCEPTION 'Referência de operação já utilizada.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_stage FROM public.pipeline_stages
  WHERE id=_stage_id AND workspace_id=_workspace_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Etapa indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_pipeline FROM public.pipelines
  WHERE id=v_stage.pipeline_id AND workspace_id=_workspace_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Funil indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 -- Lock in a stable order and validate the whole selection before any movement.
 -- Company siblings that were not selected are deliberately never included.
 FOR v_lead IN
  SELECT * FROM public.leads WHERE workspace_id=_workspace_id AND id=ANY(v_ids)
   AND merged_into_id IS NULL AND status NOT IN ('deleted','archived','merged')
   ORDER BY id FOR UPDATE
 LOOP
  PERFORM 1 FROM public.crm_sources c
   WHERE c.id=v_lead.crm_source_id AND c.workspace_id=_workspace_id
    AND (v_pipeline.crm_source_id=c.id OR EXISTS (
     SELECT 1 FROM public.crm_source_funnels f
     WHERE f.workspace_id=_workspace_id AND f.crm_source_id=c.id AND f.pipeline_id=v_pipeline.id
    ));
  IF NOT FOUND THEN
   RAISE EXCEPTION 'O funil não está disponível para a fonte de um dos clientes.' USING ERRCODE='42501';
  END IF;
  v_count := v_count+1;
 END LOOP;
 IF v_count<>cardinality(v_ids) THEN
  RAISE EXCEPTION 'Um dos clientes está indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 FOREACH v_lead_id IN ARRAY v_ids
 LOOP
  v_item := public.slim_move_lead_and_emit(_workspace_id,v_lead_id,_stage_id,gen_random_uuid());
  IF (v_item->>'moved')::boolean THEN
   v_moved := v_moved+1;
   v_event_ids := v_event_ids||jsonb_build_array(v_item->>'eventId');
  END IF;
 END LOOP;
 v_response := jsonb_build_object('ok',true,'count',v_count,'movedCount',v_moved,
  'unchangedCount',v_count-v_moved,'eventIds',v_event_ids);
 INSERT INTO private.slim_funnel_write_requests(
  workspace_id,request_id,actor_id,operation,request_fingerprint,response
 ) VALUES (_workspace_id,_request_id,auth.uid(),'bulk_move',v_fingerprint,v_response);
 RETURN v_response;
END;$f$;

CREATE FUNCTION public.slim_bulk_move_leads_and_emit(
 _workspace_id uuid,_lead_ids uuid[],_stage_id uuid,_request_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_bulk_move_leads_and_emit_impl(_workspace_id,_lead_ids,_stage_id,_request_id);
$f$;

REVOKE ALL ON FUNCTION private.slim_create_lead_and_emit_impl(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.slim_create_lead_and_emit(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.slim_move_lead_and_emit_impl(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.slim_move_lead_and_emit(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.slim_bulk_move_leads_and_emit_impl(uuid,uuid[],uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.slim_bulk_move_leads_and_emit(uuid,uuid[],uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.slim_create_lead_and_emit_impl(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slim_create_lead_and_emit(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.slim_move_lead_and_emit_impl(uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slim_move_lead_and_emit(uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.slim_bulk_move_leads_and_emit_impl(uuid,uuid[],uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slim_bulk_move_leads_and_emit(uuid,uuid[],uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
