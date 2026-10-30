-- Isolated test fixture only. Function body fingerprint must match read-only production metadata.
CREATE OR REPLACE FUNCTION private.slim_confirm_order(_workspace_id uuid, _request_id uuid, _quote jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor uuid:=auth.uid(); customer_uuid uuid; old public.slim_orders; product public.products;
 customer_row public.leads; issuer public.workspaces; line jsonb; entry record;
 ids uuid[]; products_count integer; qty integer; unit_cents bigint; sub bigint; discount bigint;
 total numeric:=0; remaining bigint; calculated_items jsonb:='[]'; allocated_items jsonb:='[]';
 payment jsonb; note text; new_id uuid:=gen_random_uuid(); num bigint; confirmed timestamptz:=clock_timestamp(); full_snapshot jsonb;
BEGIN
 IF actor IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN RAISE EXCEPTION 'Sem permissão para finalizar pedidos nesta empresa.' USING ERRCODE='42501';END IF;
 IF _request_id IS NULL OR jsonb_typeof(_quote) IS DISTINCT FROM 'object' OR (_quote->>'workspaceId')::uuid IS DISTINCT FROM _workspace_id THEN RAISE EXCEPTION 'Pedido ou empresa inválidos.' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,0));
 IF EXISTS(SELECT 1 FROM public.slim_checkout_attempt_closures c WHERE c.workspace_id=_workspace_id AND c.request_id=_request_id) THEN
  RAISE EXCEPTION 'Tentativa encerrada sem pedido. Revise os itens e inicie uma nova confirmação.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO old FROM public.slim_orders WHERE workspace_id=_workspace_id AND request_id=_request_id;
 IF FOUND THEN
  IF old.created_by<>actor OR old.request_payload IS DISTINCT FROM _quote THEN RAISE EXCEPTION 'Referência já utilizada por outro conteúdo ou operador.' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('requestId',old.request_id,'workspaceId',old.workspace_id,'orderId',old.id,'number','SL-'||lpad(old.order_number::text,8,'0'),'status',old.status,'totalCents',old.total_cents);
 END IF;
 IF jsonb_typeof(_quote->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(_quote->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Inclua entre 1 e 100 produtos.' USING ERRCODE='22023';END IF;
 SELECT array_agg((x->>'productId')::uuid) INTO ids FROM jsonb_array_elements(_quote->'items') x;
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Produto repetido. Ajuste a quantidade na mesma linha.' USING ERRCODE='22023';END IF;
 PERFORM p.id FROM public.products p WHERE p.workspace_id=_workspace_id AND p.id=ANY(ids) ORDER BY p.id FOR UPDATE;
 GET DIAGNOSTICS products_count=ROW_COUNT;
 IF products_count<>cardinality(ids) THEN RAISE EXCEPTION 'Produto não pertence à empresa.' USING ERRCODE='42501';END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(_quote->'items') LOOP
  SELECT * INTO STRICT product FROM public.products WHERE workspace_id=_workspace_id AND id=(line->>'productId')::uuid;
  IF (line->>'quantity') IS NULL OR (line->>'quantity') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Quantidade inválida.' USING ERRCODE='22023';END IF;
  qty:=(line->>'quantity')::integer;
  IF qty NOT BETWEEN 1 AND 999999 OR NOT product.active OR product.stock<qty THEN RAISE EXCEPTION 'Produto inativo ou estoque insuficiente: %',product.name USING ERRCODE='22023';END IF;
  unit_cents:=(coalesce(product.promo_price,product.price)*100)::bigint;
  IF unit_cents<0 OR unit_cents IS DISTINCT FROM (line->>'unitPriceCents')::bigint THEN RAISE EXCEPTION 'O preço mudou. Revise o pedido antes de confirmar.' USING ERRCODE='22023';END IF;
  IF length(product.name)>500 OR length(product.description)>10000 OR length(product.sku)>200 THEN RAISE EXCEPTION 'Cadastro do produto excede o limite do documento.' USING ERRCODE='22023';END IF;
  IF unit_cents::numeric*qty>99999999999999 THEN RAISE EXCEPTION 'Subtotal acima do limite.' USING ERRCODE='22023';END IF;
  sub:=unit_cents*qty;total:=total+sub;
  calculated_items:=calculated_items||jsonb_build_array(jsonb_build_object('productId',product.id,'name',product.name,'description',product.description,'sku',product.sku,'quantity',qty,'unitPriceCents',unit_cents,'subtotalCents',sub));
 END LOOP;
 IF total>99999999999999 OR (_quote->>'discountCents') IS NULL OR (_quote->>'discountCents') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Total ou desconto inválido.' USING ERRCODE='22023';END IF;
 discount:=(_quote->>'discountCents')::bigint;
 IF discount>total OR (total-discount) IS DISTINCT FROM (_quote->>'totalCents')::numeric OR total IS DISTINCT FROM (_quote->>'subtotalCents')::numeric THEN RAISE EXCEPTION 'Totais divergentes. Revise o pedido.' USING ERRCODE='22023';END IF;
 IF total=0 THEN
  SELECT jsonb_agg(x||jsonb_build_object('discountCents',0,'totalCents',0)) INTO allocated_items FROM jsonb_array_elements(calculated_items) x;
 ELSE
  WITH portions AS (SELECT x,ord,floor((x->>'subtotalCents')::numeric*discount/total)::bigint AS base,mod((x->>'subtotalCents')::numeric*discount,total) AS remainder FROM jsonb_array_elements(calculated_items) WITH ORDINALITY t(x,ord)),
  ranked AS (SELECT *,row_number() OVER(ORDER BY remainder DESC,ord) AS rank,discount-sum(base) OVER() AS left_over FROM portions)
  SELECT jsonb_agg(x||jsonb_build_object('discountCents',base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END,'totalCents',(x->>'subtotalCents')::bigint-base-CASE WHEN rank<=left_over THEN 1 ELSE 0 END) ORDER BY ord) INTO allocated_items FROM ranked;
 END IF;
 payment:=_quote->'payment';note:=coalesce(_quote->>'notes','');
 IF jsonb_typeof(payment) IS DISTINCT FROM 'object' OR coalesce(payment->>'method','') NOT IN ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') OR coalesce(payment->>'status','') NOT IN ('paid','pending') OR coalesce(payment->>'installments','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Pagamento inválido.' USING ERRCODE='22023';END IF;
 IF (payment->>'installments')::integer NOT BETWEEN 1 AND 24 OR (payment->>'method'<>'credit_card' AND (payment->>'installments')::integer<>1) OR length(note)>2000 THEN RAISE EXCEPTION 'Parcelamento ou observações inválidos.' USING ERRCODE='22023';END IF;
 IF _quote#>>'{customer,kind}'='existing' THEN
  customer_uuid:=(_quote#>>'{customer,id}')::uuid;
  SELECT * INTO customer_row FROM public.leads WHERE id=customer_uuid AND workspace_id=_workspace_id AND merged_into_id IS NULL AND status NOT IN ('deleted','archived','merged');
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não disponível nesta empresa.' USING ERRCODE='42501';END IF;
 ELSIF _quote#>>'{customer,kind}'='new' THEN
  IF length(btrim(coalesce(_quote#>>'{customer,name}',''))) NOT BETWEEN 1 AND 160 OR length(coalesce(_quote#>>'{customer,email}',''))>254 OR length(coalesce(_quote#>>'{customer,phone}',''))>40 THEN RAISE EXCEPTION 'Dados do cliente inválidos.' USING ERRCODE='22023';END IF;
  IF coalesce(_quote#>>'{customer,email}','')<>'' AND (_quote#>>'{customer,email}') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'E-mail inválido.' USING ERRCODE='22023';END IF;
  IF length(regexp_replace(coalesce(_quote#>>'{customer,phone}',''),'[^0-9]','','g'))>0 THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||regexp_replace(_quote#>>'{customer,phone}','[^0-9]','','g'),1));
   IF EXISTS(SELECT 1 FROM public.leads l WHERE l.workspace_id=_workspace_id AND l.merged_into_id IS NULL AND regexp_replace(coalesce(l.phone,''),'[^0-9]','','g')=regexp_replace(_quote#>>'{customer,phone}','[^0-9]','','g')) THEN RAISE EXCEPTION 'Telefone já cadastrado. Selecione o cliente existente.' USING ERRCODE='22023';END IF;
  END IF;
  INSERT INTO public.leads(workspace_id,name,email,phone,status,source) VALUES(_workspace_id,btrim(_quote#>>'{customer,name}'),nullif(btrim(_quote#>>'{customer,email}'),''),nullif(btrim(_quote#>>'{customer,phone}'),''),'active','erp_checkout') RETURNING * INTO customer_row;
  customer_uuid:=customer_row.id;
 ELSE RAISE EXCEPTION 'Selecione um cliente ou cadastre um novo.' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT issuer FROM public.workspaces WHERE id=_workspace_id;
 full_snapshot:=jsonb_build_object('version',1,'workspaceId',_workspace_id,'orderId',new_id,'requestId',_request_id,'status','confirmed','confirmedAt',confirmed,'cancelledAt',NULL,'cancellationReason',NULL,
 'customer',jsonb_build_object('id',customer_uuid,'name',customer_row.name,'email',coalesce(customer_row.email,''),'phone',coalesce(customer_row.phone,'')),
 'issuer',jsonb_build_object('name',issuer.name,'legalName',coalesce(issuer.legal_name,''),'document',coalesce(issuer.cnpj,'')),
 'items',allocated_items,'subtotalCents',total,'discountCents',discount,'totalCents',total-discount,
 'payment',jsonb_build_object('method',payment->>'method','status',payment->>'status','installments',(payment->>'installments')::integer),'notes',btrim(note));
 INSERT INTO public.slim_orders(id,workspace_id,request_id,request_payload,created_by,customer_id,subtotal_cents,discount_cents,total_cents,snapshot,confirmed_at)
 VALUES(new_id,_workspace_id,_request_id,_quote,actor,customer_uuid,total,discount,total-discount,full_snapshot,confirmed) RETURNING order_number INTO num;
 UPDATE public.slim_orders SET snapshot=snapshot||jsonb_build_object('number','SL-'||lpad(num::text,8,'0')) WHERE id=new_id;
 FOR line IN SELECT * FROM jsonb_array_elements(allocated_items) LOOP
  UPDATE public.products SET stock=stock-(line->>'quantity')::integer WHERE workspace_id=_workspace_id AND id=(line->>'productId')::uuid RETURNING stock INTO remaining;
  INSERT INTO public.slim_stock_movements(workspace_id,order_id,product_id,kind,quantity,balance_after,actor_id) VALUES(_workspace_id,new_id,(line->>'productId')::uuid,'sale',(line->>'quantity')::integer,remaining,actor);
 END LOOP;
 RETURN jsonb_build_object('requestId',_request_id,'workspaceId',_workspace_id,'orderId',new_id,'number','SL-'||lpad(num::text,8,'0'),'status','confirmed','totalCents',total-discount);
END;$function$;
REVOKE ALL ON FUNCTION private.slim_confirm_order(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_confirm_order(uuid,uuid,jsonb) TO authenticated;
