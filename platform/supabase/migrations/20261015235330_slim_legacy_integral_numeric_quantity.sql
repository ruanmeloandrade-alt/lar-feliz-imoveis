-- Legacy numeric 1.000 is an integer quantity. Never round 1.5 to a whole unit.
DO $m$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('private.slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean)'::regprocedure);
 IF position('coalesce(i->>''quantity'','''') !~ ''^[0-9]+$''' in definition)=0 OR position('qty:=(i->>''quantity'')::integer;' in definition)=0 THEN RAISE EXCEPTION 'Unexpected reconciliation implementation; no change applied.';END IF;
 definition:=replace(definition,'coalesce(i->>''quantity'','''') !~ ''^[0-9]+$''','coalesce(i->>''quantity'','''') !~ ''^[0-9]+([.]0+)?$''');
 definition:=replace(definition,'qty:=(i->>''quantity'')::integer;','qty:=(i->>''quantity'')::numeric::integer;');
 EXECUTE definition;
END;$m$;
NOTIFY pgrst,'reload schema';
