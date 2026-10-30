DO $m$ DECLARE definition text;old_fragment text:='UPDATE public.slim_orders SET snapshot=snapshot||jsonb_build_object(''number'',''SL-''||lpad(num::text,8,''0'')) WHERE id=order_id;';BEGIN
 definition:=pg_get_functiondef('private.slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean)'::regprocedure);
 IF position(old_fragment in definition)=0 THEN RAISE EXCEPTION 'Unexpected reconciliation source; no change applied.';END IF;
 definition:=replace(definition,old_fragment,'UPDATE public.slim_orders AS saved SET snapshot=saved.snapshot||jsonb_build_object(''number'',''SL-''||lpad(num::text,8,''0'')) WHERE saved.id=order_id;');
 EXECUTE definition;
END;$m$;
