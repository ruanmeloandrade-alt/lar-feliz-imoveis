-- Install atomically. No account, factor, session, business row or existing policy is rewritten.
DO $preflight$
DECLARE existing text; required record;
BEGIN
 FOR existing IN
  SELECT split_part(config,'=',2) FROM pg_catalog.pg_db_role_setting settings
  CROSS JOIN LATERAL unnest(settings.setconfig) config
  WHERE config LIKE 'pgrst.db_pre_request=%'
   AND settings.setrole IN (0,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='authenticator'))
   AND settings.setdatabase IN (0,(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()))
  UNION ALL SELECT current_setting('pgrst.db_pre_request',true)
 LOOP
  IF coalesce(btrim(existing),'') NOT IN ('','public.slim_check_api_request') THEN
   RAISE EXCEPTION 'SLIM_SECURITY_PRE_REQUEST_CONFLICT';
  END IF;
 END LOOP;
 FOR required IN SELECT * FROM (VALUES
  ('auth','users','id'),('auth','users','banned_until'),('auth','users','deleted_at'),
  ('auth','sessions','id'),('auth','sessions','user_id'),('auth','sessions','not_after'),
  ('auth','mfa_factors','user_id'),('auth','mfa_factors','status')) AS x(schema_name,table_name,column_name)
 LOOP
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema=required.schema_name AND c.table_name=required.table_name AND c.column_name=required.column_name) THEN
   RAISE EXCEPTION 'SLIM_SECURITY_NATIVE_SCHEMA_UNAVAILABLE';
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname='objects' AND c.relrowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='realtime' AND c.relname='messages' AND c.relrowsecurity) THEN
  RAISE EXCEPTION 'SLIM_SECURITY_PRODUCT_RLS_UNAVAILABLE';
 END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION private.slim_session_security_error()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='' SET row_security=off
AS $function$
DECLARE claims jsonb; actor uuid; session_id uuid;
BEGIN
 claims:=auth.jwt();
 IF claims IS NULL OR jsonb_typeof(claims)<>'object' OR claims->>'role' IS DISTINCT FROM 'authenticated'
 OR coalesce(claims->>'sub','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR coalesce(claims->>'session_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RETURN 'SLIM_SESSION_INVALID';
 END IF;
 actor:=(claims->>'sub')::uuid; session_id:=(claims->>'session_id')::uuid;
 IF actor IS DISTINCT FROM auth.uid() OR NOT EXISTS(
  SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  WHERE s.id=session_id AND s.user_id=actor AND (s.not_after IS NULL OR s.not_after>now())
   AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.deleted_at IS NULL
 ) THEN RETURN 'SLIM_SESSION_INVALID'; END IF;
 -- The JWT has already been verified by the platform. A pending factor never opts in.
 IF EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=actor AND f.status='verified')
 AND claims->>'aal' IS DISTINCT FROM 'aal2' THEN RETURN 'SLIM_MFA_REQUIRED'; END IF;
 RETURN NULL;
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN
 RETURN 'SLIM_SESSION_INVALID';
END;
$function$;
REVOKE ALL ON FUNCTION private.slim_session_security_error() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.slim_session_security_error() TO authenticated;

CREATE OR REPLACE FUNCTION private.slim_session_security_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$ SELECT private.slim_session_security_error() IS NULL $function$;
REVOKE ALL ON FUNCTION private.slim_session_security_allowed() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.slim_session_security_allowed() TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION public.slim_assert_session_security()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $function$
DECLARE failure text;
BEGIN
 failure:=private.slim_session_security_error();
 IF failure IS NOT NULL THEN RAISE EXCEPTION '%',failure USING ERRCODE='42501'; END IF;
 RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.slim_assert_session_security() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.slim_assert_session_security() TO authenticated;

-- INVOKER retains the verified PostgREST role. Public/service requests do not enter the user guard.
-- Keep this wrapper public so anon needs no new USAGE privilege on the private schema.
CREATE OR REPLACE FUNCTION public.slim_check_api_request()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $function$
BEGIN
 IF current_user IN ('anon','service_role') THEN RETURN; END IF;
 PERFORM public.slim_assert_session_security();
END;
$function$;
REVOKE ALL ON FUNCTION public.slim_check_api_request() FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT EXECUTE ON FUNCTION public.slim_check_api_request() TO anon,authenticated,service_role,authenticator;

-- Restrictive policies are ANDed with the original tenant/role policies and grant no access.
-- This also covers Postgres Changes and private Storage/Realtime authorization outside PostgREST.
DO $policies$
DECLARE target record;
BEGIN
 FOR target IN SELECT n.nspname,c.relname FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND c.relrowsecurity AND
  (n.nspname='public' OR (n.nspname='storage' AND c.relname='objects') OR (n.nspname='realtime' AND c.relname='messages'))
 LOOP
  EXECUTE format('DROP POLICY IF EXISTS slim_session_security_required ON %I.%I',target.nspname,target.relname);
  EXECUTE format('CREATE POLICY slim_session_security_required ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.slim_session_security_allowed())) WITH CHECK ((SELECT private.slim_session_security_allowed()))',target.nspname,target.relname);
 END LOOP;
END;
$policies$;

ALTER ROLE authenticator SET pgrst.db_pre_request='public.slim_check_api_request';
NOTIFY pgrst,'reload config';
