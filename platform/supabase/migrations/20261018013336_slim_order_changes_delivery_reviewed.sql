-- Saúde Slim block 7: reviewed revisions and logical deletion with current freight/documents.
-- Installation changes schema only. Existing orders, PDFs, receipts and stock stay untouched.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
DECLARE dependency record; actual text;
BEGIN
 FOR dependency IN SELECT * FROM (VALUES
  ('private.slim_confirm_order(uuid,uuid,jsonb)','c1ba0a1745d0dfee72dcae28744ac29c3f88415e7f3d6a51c8a803fdad0ba996'),
  ('private.slim_cancel_order(uuid,uuid,text)','89b6a4421d316736d27a051bb7eff768519ce8e9786e6478f9cf75dc23c91661'),
  ('private.slim_guard_caller_document()','be151590ffdb2964b16f9b0ddcddb47fdb13ceb7af659b9f779cf94e9483f570')
 ) AS dependencies(signature,fingerprint) LOOP
  SELECT encode(extensions.digest(prosrc,'sha256'),'hex') INTO actual
   FROM pg_proc WHERE oid=to_regprocedure(dependency.signature);
  IF actual IS DISTINCT FROM dependency.fingerprint THEN
   RAISE EXCEPTION 'O contrato de pedidos ou documentos mudou (%). Revise a migration antes de aplicar.',dependency.signature;
  END IF;
 END LOOP;
END;
$preflight$;

CREATE TABLE public.slim_order_changes (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 order_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('edit','delete')),
 state text NOT NULL CHECK(state IN ('completed','closed')),
 request_payload jsonb,source_fingerprint text,source_snapshot jsonb,source_status text,reason text,
 replacement_order_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,workspace_id),
 FOREIGN KEY(order_id,workspace_id) REFERENCES public.slim_orders(id,workspace_id),
 FOREIGN KEY(replacement_order_id,workspace_id) REFERENCES public.slim_orders(id,workspace_id),
 CHECK(replacement_order_id IS NULL OR replacement_order_id<>order_id),
 CHECK(
  (state='closed' AND request_payload IS NULL AND source_fingerprint IS NULL AND source_snapshot IS NULL
   AND source_status IS NULL AND reason IS NULL AND replacement_order_id IS NULL)
  OR
  (state='completed' AND request_payload IS NOT NULL AND jsonb_typeof(request_payload)='object'
   AND source_fingerprint IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$'
   AND source_snapshot IS NOT NULL AND jsonb_typeof(source_snapshot)='object'
   AND source_status IS NOT NULL AND source_status IN ('confirmed','cancelled')
   AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500
   AND ((operation='edit' AND replacement_order_id IS NOT NULL) OR (operation='delete' AND replacement_order_id IS NULL)))
 )
);
CREATE UNIQUE INDEX slim_order_one_completed_change ON public.slim_order_changes(workspace_id,order_id) WHERE state='completed';
CREATE INDEX slim_order_changes_workspace ON public.slim_order_changes(workspace_id,created_at DESC);
ALTER TABLE public.slim_order_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.slim_order_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.slim_order_changes TO authenticated;
CREATE POLICY slim_order_changes_read ON public.slim_order_changes FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id));

CREATE FUNCTION private.slim_order_change_result(_change public.slim_order_changes) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT jsonb_build_object(
  'workspaceId',_change.workspace_id,'requestId',_change.id,'orderId',_change.order_id,
  'operation',_change.operation,'state',_change.state,'replacementOrderId',_change.replacement_order_id,
  'replacementStatus',o.status,
  'receipt',CASE WHEN o.id IS NOT NULL AND o.status='confirmed' THEN jsonb_build_object(
   'workspaceId',o.workspace_id,'requestId',o.request_id,'orderId',o.id,'number',o.snapshot->>'number',
   'status',o.status,'totalCents',o.total_cents) ELSE NULL END)
 FROM (SELECT 1) one LEFT JOIN public.slim_orders o ON o.id=_change.replacement_order_id AND o.workspace_id=_change.workspace_id;
$f$;
REVOKE ALL ON FUNCTION private.slim_order_change_result(public.slim_order_changes) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.slim_order_change_context(_workspace_id uuid,_order_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE o public.slim_orders;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para editar ou excluir pedidos.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO o FROM public.slim_orders WHERE id=_order_id AND workspace_id=_workspace_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado nesta empresa.' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.slim_order_changes c WHERE c.workspace_id=_workspace_id AND c.order_id=_order_id AND c.state='completed') THEN
  RAISE EXCEPTION 'O pedido já foi editado ou excluído. Atualize a lista.' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('row',to_jsonb(o)-'request_payload','fingerprint',encode(extensions.digest(o.snapshot::text||'|'||o.status,'sha256'),'hex'));
END;$f$;
REVOKE ALL ON FUNCTION public.slim_order_change_context(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_order_change_context(uuid,uuid) TO authenticated;

-- Additional INVOKER barrier, ordered before the existing immutable consent guard.
-- Both paths lock the same workspace/order key, then read a fresh READ COMMITTED snapshot.
-- Advisory locks avoid granting UPDATE on orders to document callers.
CREATE FUNCTION private.slim_guard_order_change_document() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='5s' AS $f$
DECLARE order_uuid uuid;order_status text;
BEGIN
 IF TG_OP<>'INSERT' OR auth.uid() IS NULL OR NOT private.slim_workspace_access(NEW.workspace_id,'operator') THEN
  RAISE EXCEPTION 'Operador não autorizado para este documento.' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'O documento exige uma leitura atual do pedido. Inicie uma nova tentativa.' USING ERRCODE='25001';
 END IF;
 IF TG_TABLE_NAME='slim_order_documents' THEN
  order_uuid:=NEW.order_id;
 ELSE
  SELECT order_id INTO order_uuid FROM public.slim_order_documents WHERE id=NEW.document_id AND workspace_id=NEW.workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento de outra empresa ou inexistente.' USING ERRCODE='42501';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slim-order-change|'||NEW.workspace_id::text||'|'||order_uuid::text,0));
 SELECT status INTO order_status FROM public.slim_orders WHERE id=order_uuid AND workspace_id=NEW.workspace_id;
 IF NOT FOUND OR order_status<>'confirmed'
  OR EXISTS(SELECT 1 FROM public.slim_order_changes c WHERE c.workspace_id=NEW.workspace_id AND c.order_id=order_uuid AND c.state='completed') THEN
  RAISE EXCEPTION 'Pedido indisponível, cancelado ou já alterado.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_guard_order_change_document() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_guard_order_change_document() TO authenticated;
CREATE TRIGGER slim_00_order_change_document_barrier BEFORE INSERT ON public.slim_order_documents
 FOR EACH ROW EXECUTE FUNCTION private.slim_guard_order_change_document();
CREATE TRIGGER slim_00_order_change_delivery_barrier BEFORE INSERT ON public.slim_order_document_deliveries
 FOR EACH ROW EXECUTE FUNCTION private.slim_guard_order_change_document();

CREATE FUNCTION private.slim_change_order(
 _workspace_id uuid,_order_id uuid,_request_id uuid,_operation text,_fingerprint text,_quote jsonb,_reason text,_approved boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $f$
DECLARE o public.slim_orders;c public.slim_order_changes;payload jsonb;r jsonb;replacement uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') OR _approved IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'A alteração exige aprovação e permissão do operador.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _order_id IS NULL OR _operation IS NULL OR _operation NOT IN ('edit','delete')
  OR coalesce(_fingerprint,'') !~ '^[0-9a-f]{64}$' OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'Alteração ou motivo inválidos.' USING ERRCODE='22023';
 END IF;
 IF (_operation='edit' AND (jsonb_typeof(_quote) IS DISTINCT FROM 'object' OR length(_quote::text)>200000 OR jsonb_typeof(_quote->'items') IS DISTINCT FROM 'array'))
  OR (_operation='delete' AND _quote IS NOT NULL) THEN
  RAISE EXCEPTION 'Conteúdo da alteração inválido.' USING ERRCODE='22023';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'A alteração exige uma leitura atual do pedido. Inicie uma nova tentativa.' USING ERRCODE='25001';
 END IF;
 payload:=jsonb_build_object('operation',_operation,'orderId',_order_id,'fingerprint',_fingerprint,'quote',_quote,'reason',btrim(_reason));
 -- Same request lock as ordinary confirmation and attempt recovery; no automatic retry.
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,0));
 SELECT * INTO c FROM public.slim_order_changes WHERE workspace_id=_workspace_id AND id=_request_id;
 IF FOUND THEN
  IF c.actor_id<>auth.uid() OR c.order_id<>_order_id OR c.operation<>_operation THEN
   RAISE EXCEPTION 'Referência já utilizada por outra alteração.' USING ERRCODE='22023';
  END IF;
  IF c.state='closed' THEN RAISE EXCEPTION 'Tentativa encerrada sem alteração. Revise e inicie uma nova confirmação.' USING ERRCODE='22023';END IF;
  IF c.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'A aprovação não corresponde à alteração já registrada.' USING ERRCODE='22023';END IF;
  RETURN private.slim_order_change_result(c);
 END IF;
 IF EXISTS(SELECT 1 FROM public.slim_orders x WHERE x.workspace_id=_workspace_id AND x.request_id=_request_id) THEN
  RAISE EXCEPTION 'Referência já utilizada por outro pedido.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slim-order-change|'||_workspace_id::text||'|'||_order_id::text,0));
 SELECT * INTO o FROM public.slim_orders WHERE workspace_id=_workspace_id AND id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado nesta empresa.' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.slim_order_changes x WHERE x.workspace_id=_workspace_id AND x.order_id=_order_id AND x.state='completed') THEN
  RAISE EXCEPTION 'O pedido já foi alterado. Atualize a lista antes de continuar.' USING ERRCODE='22023';
 END IF;
 IF _fingerprint IS DISTINCT FROM encode(extensions.digest(o.snapshot::text||'|'||o.status,'sha256'),'hex') THEN
  RAISE EXCEPTION 'O pedido mudou. Reabra a edição antes de aprovar.' USING ERRCODE='22023';
 END IF;
 IF _operation='edit' AND o.status<>'confirmed' THEN RAISE EXCEPTION 'Pedido cancelado não pode ser editado.' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.slim_order_documents d JOIN public.slim_order_document_deliveries t ON t.document_id=d.id AND t.workspace_id=d.workspace_id
  WHERE d.workspace_id=_workspace_id AND d.order_id=_order_id AND t.status IN ('pending','uncertain')) THEN
  RAISE EXCEPTION 'Consulte o envio pendente do documento antes de alterar este pedido.' USING ERRCODE='22023';
 END IF;
 IF _operation='edit' THEN
  IF jsonb_array_length(_quote->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Inclua entre 1 e 100 itens.' USING ERRCODE='22023';END IF;
  IF _quote#>>'{customer,kind}' IS DISTINCT FROM 'existing' THEN RAISE EXCEPTION 'Selecione um cliente cadastrado para editar o pedido.' USING ERRCODE='22023';END IF;
  IF NOT (_quote ? 'fulfillment' AND _quote ? 'shippingCents') THEN
   RAISE EXCEPTION 'Escolha retirada ou entrega e revise o frete antes de confirmar.' USING ERRCODE='22023';
  END IF;
  PERFORM p.id FROM public.products p WHERE p.workspace_id=_workspace_id AND p.id IN(
   SELECT (x->>'productId')::uuid FROM jsonb_array_elements(o.snapshot->'items') x
   UNION SELECT (x->>'productId')::uuid FROM jsonb_array_elements(_quote->'items') x
  ) ORDER BY p.id FOR UPDATE;
 END IF;
 -- Existing cancellation and the CURRENT delivery/freight confirmation share this transaction.
 -- A failed replacement rolls back every reversal, new order and audit entry.
 PERFORM private.slim_cancel_order(_workspace_id,_order_id,btrim(_reason));
 IF _operation='edit' THEN
  r:=private.slim_confirm_order(_workspace_id,_request_id,_quote);replacement:=(r->>'orderId')::uuid;
  UPDATE public.slim_orders AS saved
   SET confirmed_at=o.confirmed_at,snapshot=saved.snapshot||jsonb_build_object('confirmedAt',o.confirmed_at,'revisionOf',o.id,'revisionReason',btrim(_reason))
   WHERE saved.id=replacement AND saved.workspace_id=_workspace_id;
 END IF;
 INSERT INTO public.slim_order_changes(id,workspace_id,actor_id,order_id,operation,state,request_payload,source_fingerprint,source_snapshot,source_status,reason,replacement_order_id)
  VALUES(_request_id,_workspace_id,auth.uid(),_order_id,_operation,'completed',payload,_fingerprint,o.snapshot,o.status,btrim(_reason),replacement)
  RETURNING * INTO c;
 RETURN private.slim_order_change_result(c);
END;$f$;
CREATE FUNCTION public.slim_change_order(
 _workspace_id uuid,_order_id uuid,_request_id uuid,_operation text,_fingerprint text,_quote jsonb,_reason text,_approved boolean
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_change_order(_workspace_id,_order_id,_request_id,_operation,_fingerprint,_quote,_reason,_approved);
$f$;
REVOKE ALL ON FUNCTION private.slim_change_order(uuid,uuid,uuid,text,text,jsonb,text,boolean),public.slim_change_order(uuid,uuid,uuid,text,text,jsonb,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_change_order(uuid,uuid,uuid,text,text,jsonb,text,boolean),public.slim_change_order(uuid,uuid,uuid,text,text,jsonb,text,boolean) TO authenticated;

CREATE FUNCTION private.slim_lookup_order_change(_workspace_id uuid,_order_id uuid,_request_id uuid,_operation text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $f$
DECLARE c public.slim_order_changes;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Operador não autorizado para consultar esta tentativa.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _order_id IS NULL OR _operation IS NULL OR _operation NOT IN ('edit','delete') THEN
  RAISE EXCEPTION 'Referência inválida.' USING ERRCODE='22023';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'A recuperação exige uma leitura atual do pedido. Inicie uma nova consulta.' USING ERRCODE='25001';
 END IF;
 -- This explicit recovery action can close an absent request. It never guesses that a mutation failed.
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,0));
 SELECT * INTO c FROM public.slim_order_changes WHERE workspace_id=_workspace_id AND id=_request_id;
 IF FOUND THEN
  IF c.actor_id<>auth.uid() OR c.order_id<>_order_id OR c.operation<>_operation THEN
   RAISE EXCEPTION 'A tentativa pertence a outro operador ou pedido.' USING ERRCODE='42501';
  END IF;
  RETURN private.slim_order_change_result(c);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.slim_orders WHERE workspace_id=_workspace_id AND id=_order_id) THEN
  RAISE EXCEPTION 'Pedido de outra empresa ou inexistente.' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.slim_orders WHERE workspace_id=_workspace_id AND request_id=_request_id) THEN
  RAISE EXCEPTION 'Referência já utilizada por outro pedido.' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.slim_order_changes(id,workspace_id,actor_id,order_id,operation,state)
  VALUES(_request_id,_workspace_id,auth.uid(),_order_id,_operation,'closed') RETURNING * INTO c;
 RETURN private.slim_order_change_result(c);
END;$f$;
CREATE FUNCTION public.slim_lookup_order_change(_workspace_id uuid,_order_id uuid,_request_id uuid,_operation text) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_lookup_order_change(_workspace_id,_order_id,_request_id,_operation);
$f$;
REVOKE ALL ON FUNCTION private.slim_lookup_order_change(uuid,uuid,uuid,text),public.slim_lookup_order_change(uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_lookup_order_change(uuid,uuid,uuid,text),public.slim_lookup_order_change(uuid,uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
