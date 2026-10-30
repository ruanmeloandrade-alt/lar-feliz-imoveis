-- Caller-scoped document writes. No new SECURITY DEFINER function, no service credential, no outbound call.
ALTER TABLE public.slim_order_documents ADD COLUMN requested_by uuid REFERENCES auth.users(id);
ALTER TABLE public.slim_order_document_deliveries ADD COLUMN consent_sha256 text CHECK(consent_sha256 IS NULL OR consent_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public.slim_order_document_deliveries ADD COLUMN approved_at timestamptz;
CREATE FUNCTION private.slim_guard_caller_document() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE o public.slim_orders;d public.slim_order_documents;recipient text;bytes bytea;expected text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(NEW.workspace_id,'operator') THEN RAISE EXCEPTION 'Operador não autorizado para este documento.' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='slim_order_documents' THEN
  IF TG_OP<>'INSERT' OR NEW.requested_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'O documento é imutável e exige autoria válida.' USING ERRCODE='42501';END IF;
  SELECT * INTO o FROM public.slim_orders WHERE id=NEW.order_id AND workspace_id=NEW.workspace_id;
  IF NOT FOUND OR o.status<>'confirmed' THEN RAISE EXCEPTION 'Pedido indisponível ou cancelado.' USING ERRCODE='22023';END IF;
  IF NEW.version<>1 OR NEW.filename IS DISTINCT FROM ('pedido-'||(o.snapshot->>'number')||'.pdf') OR length(NEW.pdf_base64) NOT BETWEEN 20 AND 4000000 THEN RAISE EXCEPTION 'Identificação ou tamanho do documento inválido.' USING ERRCODE='22023';END IF;
  bytes:=decode(NEW.pdf_base64,'base64');
  IF substring(bytes from 1 for 5)<>decode('255044462d','hex') OR encode(extensions.digest(bytes,'sha256'),'hex') IS DISTINCT FROM NEW.sha256 THEN RAISE EXCEPTION 'O conteúdo não corresponde ao hash do PDF.' USING ERRCODE='22023';END IF;
  NEW.created_at:=clock_timestamp();RETURN NEW;
 END IF;
 IF NEW.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Autor do envio inválido.' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status<>'pending' OR NEW.status NOT IN ('accepted','rejected','uncertain') OR (to_jsonb(NEW)-ARRAY['status','message_id','last_error','finished_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','message_id','last_error','finished_at']) THEN RAISE EXCEPTION 'A tentativa não pode ser reaberta ou redirecionada.' USING ERRCODE='42501';END IF;
  IF NEW.status='accepted' AND length(btrim(coalesce(NEW.message_id,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Aceite exige o protocolo do provedor.' USING ERRCODE='22023';END IF;
  IF NEW.status='rejected' AND NEW.message_id IS NOT NULL THEN RAISE EXCEPTION 'Resultado de envio inconsistente.' USING ERRCODE='22023';END IF;
  IF NEW.last_error IS NOT NULL AND NEW.last_error !~ '^[A-Z0-9_]{1,80}$' THEN RAISE EXCEPTION 'Código de diagnóstico inválido.' USING ERRCODE='22023';END IF;
  NEW.finished_at:=clock_timestamp();RETURN NEW;
 END IF;
 IF NEW.status<>'pending' OR NEW.message_id IS NOT NULL OR NEW.last_error IS NOT NULL OR NEW.finished_at IS NOT NULL THEN RAISE EXCEPTION 'A nova tentativa precisa iniciar pendente.' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM public.slim_order_documents WHERE id=NEW.document_id AND workspace_id=NEW.workspace_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento de outra empresa ou inexistente.' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM public.slim_orders WHERE id=d.order_id AND workspace_id=NEW.workspace_id;
 IF NOT FOUND OR o.status<>'confirmed' THEN RAISE EXCEPTION 'Pedido indisponível ou cancelado.' USING ERRCODE='22023';END IF;
 SELECT '+'||regexp_replace(coalesce(l.phone,''),'[^0-9]','','g') INTO recipient FROM public.leads l WHERE l.id=o.customer_id AND l.workspace_id=NEW.workspace_id AND l.merged_into_id IS NULL AND l.status NOT IN ('archived','deleted','merged');
 IF recipient IS DISTINCT FROM NEW.phone THEN RAISE EXCEPTION 'O telefone do cliente mudou. Revise o destino antes de enviar.' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.whatsapp_web_sessions s WHERE s.id=NEW.session_id AND s.workspace_id=NEW.workspace_id AND s.provider='evolution' AND s.status='conectado' AND coalesce(s.metadata->>'deleted','false')<>'true') THEN RAISE EXCEPTION 'Canal de WhatsApp não autorizado ou desconectado.' USING ERRCODE='42501';END IF;
 expected:=encode(extensions.digest(d.id::text||'|'||d.sha256||'|'||d.order_id::text||'|'||NEW.session_id::text||'|'||NEW.phone||'|'||NEW.request_id::text,'sha256'),'hex');
 IF NEW.consent_sha256 IS DISTINCT FROM expected THEN RAISE EXCEPTION 'A aprovação não corresponde ao arquivo, cliente, canal e tentativa.' USING ERRCODE='22023';END IF;
 NEW.created_at:=clock_timestamp();NEW.approved_at:=NEW.created_at;RETURN NEW;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_guard_caller_document() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_guard_caller_document() TO authenticated;
CREATE TRIGGER slim_document_insert_guard BEFORE INSERT ON public.slim_order_documents FOR EACH ROW EXECUTE FUNCTION private.slim_guard_caller_document();
CREATE TRIGGER slim_document_delivery_guard BEFORE INSERT OR UPDATE ON public.slim_order_document_deliveries FOR EACH ROW EXECUTE FUNCTION private.slim_guard_caller_document();
GRANT INSERT(workspace_id,order_id,version,sha256,filename,pdf_base64,requested_by) ON public.slim_order_documents TO authenticated;
CREATE POLICY slim_document_caller_insert ON public.slim_order_documents FOR INSERT TO authenticated WITH CHECK(requested_by=auth.uid() AND private.slim_workspace_access(workspace_id,'operator'));
GRANT INSERT(workspace_id,document_id,request_id,actor_id,session_id,phone,status,consent_sha256) ON public.slim_order_document_deliveries TO authenticated;
CREATE POLICY slim_delivery_caller_insert ON public.slim_order_document_deliveries FOR INSERT TO authenticated WITH CHECK(actor_id=auth.uid() AND status='pending' AND private.slim_workspace_access(workspace_id,'operator'));
GRANT UPDATE(status,message_id,last_error,finished_at) ON public.slim_order_document_deliveries TO authenticated;
CREATE POLICY slim_delivery_caller_finish ON public.slim_order_document_deliveries FOR UPDATE TO authenticated USING(actor_id=auth.uid() AND status='pending' AND private.slim_workspace_access(workspace_id,'operator')) WITH CHECK(actor_id=auth.uid() AND status IN ('accepted','rejected','uncertain') AND private.slim_workspace_access(workspace_id,'operator'));
NOTIFY pgrst,'reload schema';
