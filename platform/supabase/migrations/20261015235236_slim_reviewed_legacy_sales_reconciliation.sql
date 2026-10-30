-- Already applied to the independent Saúde Slim database. No business rows are seeded.
ALTER TABLE public.slim_orders ADD COLUMN legacy_lead_id uuid REFERENCES public.leads(id);
CREATE UNIQUE INDEX slim_one_order_per_legacy_sale ON public.slim_orders(workspace_id,legacy_lead_id) WHERE legacy_lead_id IS NOT NULL;
CREATE FUNCTION private.slim_legacy_sale_source(_workspace_id uuid,_lead_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT jsonb_build_object('leadId',l.id,'workspaceId',l.workspace_id,'name',l.name,'status',l.status,'mergedIntoId',l.merged_into_id,'value',l.value,'createdAt',l.created_at,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('linkId',x.id,'productId',x.product_id,'quantity',x.quantity,'unitPrice',x.unit_price,'soldAt',x.sold_at,'productName',p.name,'stock',p.stock,'active',p.active) ORDER BY x.id) FROM public.lead_products x LEFT JOIN public.products p ON p.id=x.product_id AND p.workspace_id=x.workspace_id WHERE x.lead_id=l.id AND x.workspace_id=l.workspace_id AND x.kind='comprou'),'[]'::jsonb)) FROM public.leads l WHERE l.id=_lead_id AND l.workspace_id=_workspace_id AND l.source='pedido_saude_slim';
$f$;
REVOKE ALL ON FUNCTION private.slim_legacy_sale_source(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_legacy_sale_source(uuid,uuid) TO authenticated;
CREATE FUNCTION public.slim_review_legacy_sales(_workspace_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE result jsonb;
BEGIN
 IF NOT private.slim_workspace_access(_workspace_id) THEN RAISE EXCEPTION 'Empresa não autorizada.' USING ERRCODE='42501';END IF;
 IF (SELECT count(*) FROM public.leads WHERE workspace_id=_workspace_id AND source='pedido_saude_slim')>5000 THEN RAISE EXCEPTION 'A conferência excedeu o limite. Nenhum total parcial será exibido.' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',s,'fingerprint',encode(extensions.digest(s::text,'sha256'),'hex'),'orderId',o.id,'number',o.snapshot->>'number','orderStatus',o.status) ORDER BY l.created_at DESC,l.id),'[]'::jsonb) INTO result FROM public.leads l CROSS JOIN LATERAL (SELECT private.slim_legacy_sale_source(_workspace_id,l.id) AS s) source_row LEFT JOIN public.slim_orders o ON o.workspace_id=l.workspace_id AND o.legacy_lead_id=l.id WHERE l.workspace_id=_workspace_id AND l.source='pedido_saude_slim';
 RETURN result;
END;$f$;
REVOKE ALL ON FUNCTION public.slim_review_legacy_sales(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_review_legacy_sales(uuid) TO authenticated;
CREATE FUNCTION private.slim_reconcile_legacy_sale(_workspace_id uuid,_lead_id uuid,_fingerprint text,_stock_mode text,_payment jsonb,_approved boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE l public.leads;o public.slim_orders;w public.workspaces;p public.products;s jsonb;i jsonb;items jsonb:='[]';total numeric:=0;unit bigint;qty integer;at_time timestamptz;ids uuid[];order_id uuid:=gen_random_uuid();num bigint;snapshot jsonb;balance integer;note text;
BEGIN
 IF _approved IS DISTINCT FROM true OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN RAISE EXCEPTION 'A regularização exige aprovação do operador.' USING ERRCODE='42501';END IF;
 IF _stock_mode IS NULL OR _stock_mode NOT IN ('apply_missing','already_accounted') THEN RAISE EXCEPTION 'Informe se a baixa de estoque ainda falta ou já foi realizada.' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(_payment) IS DISTINCT FROM 'object' OR coalesce(_payment->>'method','') NOT IN ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') OR coalesce(_payment->>'status','') NOT IN ('paid','pending') OR coalesce(_payment->>'installments','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Informe os dados de pagamento revisados.' USING ERRCODE='22023';END IF;
 IF (_payment->>'installments')::integer NOT BETWEEN 1 AND 24 OR (_payment->>'method'<>'credit_card' AND (_payment->>'installments')::integer<>1) THEN RAISE EXCEPTION 'Parcelamento inválido.' USING ERRCODE='22023';END IF;
 SELECT * INTO l FROM public.leads WHERE id=_lead_id AND workspace_id=_workspace_id AND source='pedido_saude_slim' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registro anterior não pertence à empresa.' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM public.slim_orders WHERE workspace_id=_workspace_id AND legacy_lead_id=_lead_id;
 IF FOUND THEN RETURN jsonb_build_object('orderId',o.id,'number',o.snapshot->>'number','status',o.status,'reused',true);END IF;
 IF l.merged_into_id IS NOT NULL OR l.status IN ('archived','deleted','merged','lost') THEN RAISE EXCEPTION 'Registro arquivado, mesclado ou perdido exige revisão individual.' USING ERRCODE='22023';END IF;
 PERFORM x.id FROM public.lead_products x WHERE x.workspace_id=_workspace_id AND x.lead_id=_lead_id FOR UPDATE;
 SELECT array_agg(x.product_id ORDER BY x.product_id) INTO ids FROM public.lead_products x WHERE x.workspace_id=_workspace_id AND x.lead_id=_lead_id AND x.kind='comprou';
 IF ids IS NULL OR cardinality(ids) NOT BETWEEN 1 AND 100 OR cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) THEN RAISE EXCEPTION 'Faltam itens válidos ou há produtos repetidos. Nada foi regularizado.' USING ERRCODE='22023';END IF;
 PERFORM p1.id FROM public.products p1 WHERE p1.workspace_id=_workspace_id AND p1.id=ANY(ids) ORDER BY p1.id FOR UPDATE;
 s:=private.slim_legacy_sale_source(_workspace_id,_lead_id);
 IF _fingerprint IS DISTINCT FROM encode(extensions.digest(s::text,'sha256'),'hex') THEN RAISE EXCEPTION 'Os dados ou o estoque mudaram. Atualize a conferência antes de aprovar.' USING ERRCODE='22023';END IF;
 at_time:=l.created_at;
 FOR i IN SELECT * FROM jsonb_array_elements(s->'items') LOOP
  IF coalesce(i->>'quantity','') !~ '^[0-9]+$' OR i->>'unitPrice' IS NULL THEN RAISE EXCEPTION 'Quantidade ou preço original não registrados.' USING ERRCODE='22023';END IF;
  qty:=(i->>'quantity')::integer;
  IF qty NOT BETWEEN 1 AND 999999 OR (i->>'unitPrice')::numeric<0 OR (i->>'unitPrice')::numeric*100<>trunc((i->>'unitPrice')::numeric*100) THEN RAISE EXCEPTION 'Preço ou quantidade original inválidos.' USING ERRCODE='22023';END IF;
  unit:=((i->>'unitPrice')::numeric*100)::bigint;
  IF unit::numeric*qty>99999999999999 THEN RAISE EXCEPTION 'Valor acima do limite.' USING ERRCODE='22023';END IF;
  SELECT * INTO p FROM public.products WHERE id=(i->>'productId')::uuid AND workspace_id=_workspace_id;
  IF NOT FOUND OR p.stock IS NULL OR p.stock<0 THEN RAISE EXCEPTION 'Produto ou saldo não disponível.' USING ERRCODE='22023';END IF;
  IF _stock_mode='apply_missing' AND p.stock<qty THEN RAISE EXCEPTION 'Saldo insuficiente para registrar a baixa pendente.' USING ERRCODE='22023';END IF;
  IF i->>'soldAt' IS NULL OR (i->>'soldAt')::timestamptz>clock_timestamp() THEN RAISE EXCEPTION 'Data da compra não registrada ou inválida.' USING ERRCODE='22023';END IF;
  at_time:=greatest(at_time,(i->>'soldAt')::timestamptz);
  items:=items||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'description','Descrição histórica não registrada; produto identificado pelo cadastro atual.','sku',coalesce(p.sku,''),'quantity',qty,'unitPriceCents',unit,'subtotalCents',unit*qty,'discountCents',0,'totalCents',unit*qty));
  total:=total+unit::numeric*qty;
 END LOOP;
 IF l.value IS NULL OR total>99999999999999 OR total IS DISTINCT FROM l.value::numeric*100 THEN RAISE EXCEPTION 'Total do registro diverge dos itens. É necessária conferência individual.' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT w FROM public.workspaces WHERE id=_workspace_id;
 note:='Regularização do registro anterior '||_lead_id::text||'. Valores líquidos dos vínculos originais; desconto original não discriminado. Pagamento informado pelo operador na regularização. '||CASE WHEN _stock_mode='apply_missing' THEN 'Operador confirmou que a baixa ainda faltava; saldo reduzido agora.' ELSE 'Operador declarou que o saldo atual já incluía esta venda; nenhuma nova baixa aplicada.' END;
 snapshot:=jsonb_build_object('version',1,'workspaceId',_workspace_id,'orderId',order_id,'requestId',order_id,'status','confirmed','confirmedAt',at_time,'cancelledAt',NULL,'cancellationReason',NULL,'customer',jsonb_build_object('id',l.id,'name',l.name,'email',coalesce(l.email,''),'phone',coalesce(l.phone,'')),'issuer',jsonb_build_object('name',w.name,'legalName',coalesce(w.legal_name,''),'document',coalesce(w.cnpj,'')),'items',items,'subtotalCents',total,'discountCents',0,'totalCents',total,'payment',_payment,'notes',note,'legacy',jsonb_build_object('leadId',_lead_id,'sourceFingerprint',_fingerprint,'stockMode',_stock_mode,'reviewedAt',clock_timestamp(),'reviewedBy',auth.uid()));
 INSERT INTO public.slim_orders(id,workspace_id,request_id,request_payload,created_by,customer_id,subtotal_cents,discount_cents,total_cents,snapshot,confirmed_at,legacy_lead_id) VALUES(order_id,_workspace_id,order_id,jsonb_build_object('source',s,'payment',_payment,'stockMode',_stock_mode),auth.uid(),l.id,total,0,total,snapshot,at_time,_lead_id) RETURNING order_number INTO num;
 UPDATE public.slim_orders SET snapshot=snapshot||jsonb_build_object('number','SL-'||lpad(num::text,8,'0')) WHERE id=order_id;
 FOR i IN SELECT * FROM jsonb_array_elements(items) LOOP
  IF _stock_mode='apply_missing' THEN UPDATE public.products SET stock=stock-(i->>'quantity')::integer WHERE id=(i->>'productId')::uuid AND workspace_id=_workspace_id RETURNING stock INTO balance;
  ELSE SELECT stock INTO balance FROM public.products WHERE id=(i->>'productId')::uuid AND workspace_id=_workspace_id;END IF;
  INSERT INTO public.slim_stock_movements(workspace_id,order_id,product_id,kind,quantity,balance_after,actor_id) VALUES(_workspace_id,order_id,(i->>'productId')::uuid,'sale',(i->>'quantity')::integer,balance,auth.uid());
 END LOOP;
 RETURN jsonb_build_object('orderId',order_id,'number','SL-'||lpad(num::text,8,'0'),'status','confirmed','reused',false);
END;$f$;
CREATE FUNCTION public.slim_reconcile_legacy_sale(_workspace_id uuid,_lead_id uuid,_fingerprint text,_stock_mode text,_payment jsonb,_approved boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT private.slim_reconcile_legacy_sale(_workspace_id,_lead_id,_fingerprint,_stock_mode,_payment,_approved);$f$;
REVOKE ALL ON FUNCTION private.slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean),public.slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean),public.slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
