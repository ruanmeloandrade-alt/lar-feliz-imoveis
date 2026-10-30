-- Contact identity only. No order, item, payment, stock or message is deleted or reassigned.
CREATE FUNCTION public.slim_contact_phone_key(_phone text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path='' AS $f$
 SELECT CASE WHEN btrim(_phone) ~ '^[+]?[0-9().[:space:]-]+$' AND length(regexp_replace(_phone,'[^0-9]','','g')) BETWEEN 8 AND 15 THEN regexp_replace(_phone,'[^0-9]','','g') ELSE NULL END;
$f$;
REVOKE ALL ON FUNCTION public.slim_contact_phone_key(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_contact_phone_key(text) TO authenticated,service_role;

CREATE FUNCTION public.slim_find_contact(_workspace_id uuid,_phone text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT jsonb_build_object('id',l.id,'name',l.name,'source',l.source,'status',l.status,'phone',l.phone,'phone_normalized',public.slim_contact_phone_key(l.phone),'custom_data',l.custom_data,'pipeline_id',l.pipeline_id,'stage_id',l.stage_id)
 FROM public.leads l WHERE l.workspace_id=_workspace_id AND l.merged_into_id IS NULL AND l.status NOT IN('deleted','merged','archived')
 AND public.slim_contact_phone_key(l.phone)=public.slim_contact_phone_key(_phone)
 ORDER BY l.created_at,l.id LIMIT 1;
$f$;
REVOKE ALL ON FUNCTION public.slim_find_contact(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_find_contact(uuid,text) TO authenticated,service_role;

CREATE FUNCTION public.slim_resolve_contact_id(_workspace_id uuid,_lead_id uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE current_id uuid:=_lead_id;next_id uuid;seen uuid[]:='{}';state text;
BEGIN
 LOOP
  IF current_id=ANY(seen) OR cardinality(seen)>20 THEN RAISE EXCEPTION 'Vínculo de contato inconsistente.' USING ERRCODE='22023';END IF;
  seen:=array_append(seen,current_id);
  SELECT l.merged_into_id,l.status INTO next_id,state FROM public.leads l WHERE l.workspace_id=_workspace_id AND l.id=current_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contato não encontrado nesta empresa.' USING ERRCODE='42501';END IF;
  IF next_id IS NULL THEN
   IF state IN('deleted','merged','archived') THEN RAISE EXCEPTION 'Contato indisponível.' USING ERRCODE='22023';END IF;
   RETURN current_id;
  END IF;
  current_id:=next_id;
 END LOOP;
END;$f$;
REVOKE ALL ON FUNCTION public.slim_resolve_contact_id(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_resolve_contact_id(uuid,uuid) TO authenticated,service_role;

CREATE FUNCTION public.slim_create_contact(_workspace_id uuid,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE found_contact jsonb;new_id uuid;key text;source_id uuid;pipeline uuid;stage uuid;contact_name text;phone text;origin text;custom jsonb;service_call boolean;
BEGIN
 service_call:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')='service_role';
 IF NOT service_call AND NOT private.slim_workspace_access(_workspace_id,'operator') THEN RAISE EXCEPTION 'Sem permissão para cadastrar contatos.' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(_data) IS DISTINCT FROM 'object' OR length(_data::text)>15000 THEN RAISE EXCEPTION 'Cadastro inválido.' USING ERRCODE='22023';END IF;
 contact_name:=btrim(coalesce(_data->>'name',''));phone:=nullif(btrim(_data->>'phone'),'');key:=public.slim_contact_phone_key(phone);
 IF length(contact_name) NOT BETWEEN 1 AND 200 OR length(coalesce(phone,''))>40 OR length(coalesce(_data->>'email',''))>254 THEN RAISE EXCEPTION 'Nome ou contato inválido.' USING ERRCODE='22023';END IF;
 IF phone IS NOT NULL AND key IS NULL THEN RAISE EXCEPTION 'Informe o telefone completo, sem JID ou identificador de grupo.' USING ERRCODE='22023';END IF;
 source_id:=nullif(_data->>'crm_source_id','')::uuid;pipeline:=nullif(_data->>'pipeline_id','')::uuid;stage:=nullif(_data->>'stage_id','')::uuid;
 IF source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_sources s WHERE s.id=source_id AND s.workspace_id=_workspace_id) THEN RAISE EXCEPTION 'Origem não pertence à empresa.' USING ERRCODE='42501';END IF;
 IF pipeline IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pipelines p WHERE p.id=pipeline AND p.workspace_id=_workspace_id) THEN RAISE EXCEPTION 'Funil não pertence à empresa.' USING ERRCODE='42501';END IF;
 IF stage IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pipeline_stages s WHERE s.id=stage AND s.pipeline_id=pipeline AND s.workspace_id=_workspace_id) THEN RAISE EXCEPTION 'Etapa não pertence ao funil.' USING ERRCODE='42501';END IF;
 IF key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||':slim-contact:'||key,0));
  found_contact:=public.slim_find_contact(_workspace_id,phone);
  IF found_contact IS NOT NULL THEN RETURN jsonb_build_object('id',found_contact->>'id','created',false);END IF;
 END IF;
 origin:=CASE WHEN _data->>'source'='whatsapp' THEN 'whatsapp' ELSE 'cadastro_manual_saude_slim' END;
 custom:=coalesce(_data->'custom_data','{}'::jsonb);
 IF jsonb_typeof(custom)<>'object' THEN RAISE EXCEPTION 'Metadados de contato inválidos.' USING ERRCODE='22023';END IF;
 BEGIN
  INSERT INTO public.leads(workspace_id,crm_source_id,pipeline_id,stage_id,name,email,phone,phone_normalized,value,source,status,custom_data,tags,last_message_from)
  VALUES(_workspace_id,source_id,pipeline,stage,contact_name,nullif(btrim(_data->>'email'),''),phone,key,coalesce(nullif(_data->>'value','')::numeric,0),origin,'active',custom,'[]'::jsonb,CASE WHEN _data->>'last_message_from' IN('lead','us') THEN _data->>'last_message_from' ELSE 'none' END)
  RETURNING id INTO new_id;
 EXCEPTION WHEN unique_violation THEN
  found_contact:=public.slim_find_contact(_workspace_id,phone);
  IF found_contact IS NULL THEN RAISE;END IF;
  RETURN jsonb_build_object('id',found_contact->>'id','created',false);
 END;
 RETURN jsonb_build_object('id',new_id,'created',true);
END;$f$;
REVOKE ALL ON FUNCTION public.slim_create_contact(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_create_contact(uuid,jsonb) TO authenticated,service_role;

CREATE TABLE public.slim_lead_identity_links(
 alias_id uuid PRIMARY KEY REFERENCES public.leads(id),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),canonical_id uuid NOT NULL REFERENCES public.leads(id),
 alias_snapshot jsonb NOT NULL,canonical_snapshot jsonb NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(alias_id<>canonical_id)
);
ALTER TABLE public.slim_lead_identity_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.slim_lead_identity_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.slim_lead_identity_links TO authenticated;
CREATE POLICY slim_identity_audit_read ON public.slim_lead_identity_links FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id,'admin'));

-- Database-owner maintenance only; never callable by browser, anon, service key or Copilot.
CREATE FUNCTION private.slim_link_verified_order_contact(_workspace_id uuid,_canonical_id uuid,_alias_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE original public.leads;copy public.leads;
BEGIN
 PERFORM l.id FROM public.leads l WHERE l.workspace_id=_workspace_id AND l.id IN(_canonical_id,_alias_id) ORDER BY l.id FOR UPDATE;
 SELECT * INTO STRICT original FROM public.leads WHERE id=_canonical_id AND workspace_id=_workspace_id;
 SELECT * INTO STRICT copy FROM public.leads WHERE id=_alias_id AND workspace_id=_workspace_id;
 IF copy.merged_into_id=_canonical_id AND EXISTS(SELECT 1 FROM public.slim_lead_identity_links WHERE alias_id=_alias_id AND canonical_id=_canonical_id) THEN RETURN false;END IF;
 IF _canonical_id=_alias_id OR original.merged_into_id IS NOT NULL OR copy.merged_into_id IS NOT NULL OR original.status IN('deleted','merged','archived') OR copy.status IN('deleted','merged','archived') OR copy.source<>'pedido_saude_slim' OR copy.created_at<original.created_at
 OR public.slim_contact_phone_key(original.phone) IS NULL OR public.slim_contact_phone_key(original.phone) IS DISTINCT FROM public.slim_contact_phone_key(copy.phone)
 OR coalesce(original.custom_data->>'whatsapp_session_id','')='' OR original.custom_data->>'whatsapp_session_id' IS DISTINCT FROM copy.custom_data->>'whatsapp_session_id'
 THEN RAISE EXCEPTION 'A identidade não foi comprovada. Nenhum contato foi vinculado.' USING ERRCODE='22023';END IF;
 IF copy.active_conversation_agent_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.salesbot_runs r WHERE r.workspace_id=_workspace_id AND r.lead_id=_alias_id AND r.status IN('queued','pending','running','waiting','waiting_timer','waiting_message','paused')) THEN RAISE EXCEPTION 'Há automação ativa no contato duplicado.' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lead_activities a WHERE a.workspace_id=_workspace_id AND a.lead_id=_alias_id AND a.type IN('message_in','message_out')) OR EXISTS(
  SELECT 1 FROM public.lead_activities a WHERE a.workspace_id=_workspace_id AND a.lead_id=_alias_id AND a.type IN('message_in','message_out') AND NOT EXISTS(
   SELECT 1 FROM public.lead_activities c WHERE c.workspace_id=_workspace_id AND c.lead_id=_canonical_id AND c.type=a.type AND c.payload->>'whatsapp_message_id'=a.payload->>'whatsapp_message_id'
   AND coalesce(c.payload->>'text','')=coalesce(a.payload->>'text','') AND coalesce(c.payload->>'media_url','')=coalesce(a.payload->>'media_url','')
  )) THEN RAISE EXCEPTION 'Existem mensagens sem correspondência confirmada. Preserve o histórico antes de vincular.' USING ERRCODE='22023';END IF;
 INSERT INTO public.slim_lead_identity_links(alias_id,workspace_id,canonical_id,alias_snapshot,canonical_snapshot,reason)
 VALUES(_alias_id,_workspace_id,_canonical_id,to_jsonb(copy),to_jsonb(original),'Mesmo telefone completo, mesma sessão e todos os IDs/conteúdos de mensagem presentes no contato original; clone do checkout legado.');
 UPDATE public.leads SET merged_into_id=_canonical_id WHERE id=_alias_id AND workspace_id=_workspace_id;
 -- Keep statuses, pipeline, legacy items, ERP customer IDs, snapshots, stock and all original activities untouched.
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_link_verified_order_contact(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
