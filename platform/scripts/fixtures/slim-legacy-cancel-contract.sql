-- TEST ONLY: cancellation definition read from the installed ERP, 2026-10-16.
CREATE OR REPLACE FUNCTION private.slim_cancel_order(_workspace_id uuid, _order_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o public.slim_orders;line jsonb;balance integer;BEGIN
 IF NOT private.slim_workspace_access(_workspace_id,'operator') THEN RAISE EXCEPTION 'Sem permissão para cancelar pedidos.' USING ERRCODE='42501';END IF;
 IF length(btrim(coalesce(_reason,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE='22023';END IF;
 SELECT * INTO o FROM public.slim_orders WHERE workspace_id=_workspace_id AND id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado nesta empresa.' USING ERRCODE='42501';END IF;
 IF o.status='cancelled' THEN RETURN;END IF;
 PERFORM p.id FROM public.products p WHERE p.workspace_id=_workspace_id AND p.id IN(SELECT (x->>'productId')::uuid FROM jsonb_array_elements(o.snapshot->'items') x) ORDER BY p.id FOR UPDATE;
 FOR line IN SELECT * FROM jsonb_array_elements(o.snapshot->'items') LOOP
  UPDATE public.products SET stock=stock+(line->>'quantity')::integer WHERE workspace_id=_workspace_id AND id=(line->>'productId')::uuid RETURNING stock INTO balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto necessário ao estorno não encontrado.' USING ERRCODE='22023';END IF;
  INSERT INTO public.slim_stock_movements(workspace_id,order_id,product_id,kind,quantity,balance_after,actor_id) VALUES(_workspace_id,_order_id,(line->>'productId')::uuid,'reversal',(line->>'quantity')::integer,balance,auth.uid());
 END LOOP;
 UPDATE public.slim_orders SET status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancellation_reason=btrim(_reason) WHERE id=_order_id AND workspace_id=_workspace_id;
END;$function$;
CREATE OR REPLACE FUNCTION public.slim_cancel_order(_workspace_id uuid, _order_id uuid, _reason text)
 RETURNS void LANGUAGE sql SET search_path TO '' AS $function$ SELECT private.slim_cancel_order(_workspace_id,_order_id,_reason); $function$;
REVOKE ALL ON FUNCTION public.slim_cancel_order(uuid,uuid,text),private.slim_cancel_order(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_cancel_order(uuid,uuid,text),private.slim_cancel_order(uuid,uuid,text) TO authenticated;
