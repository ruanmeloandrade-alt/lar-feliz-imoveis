CREATE TABLE public.integrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 provider text NOT NULL,
 status text NOT NULL DEFAULT 'disconnected',
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 credentials_encrypted text,
 expires_at timestamptz,
 last_check_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id, provider),
 UNIQUE(id, workspace_id)
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY integrations_member_access ON public.integrations FOR ALL TO authenticated
 USING (
  EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=integrations.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
  OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=integrations.workspace_id AND w.owner_id=(SELECT auth.uid()))
 )
 WITH CHECK (
  EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=integrations.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
  OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=integrations.workspace_id AND w.owner_id=(SELECT auth.uid()))
 );
REVOKE ALL ON public.integrations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated, service_role;

CREATE TABLE private.integration_credentials (
 integration_id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL,
 ciphertext bytea NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(integration_id, workspace_id) REFERENCES public.integrations(id, workspace_id) ON DELETE CASCADE
);
ALTER TABLE private.integration_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_credentials_member_access ON private.integration_credentials FOR ALL TO authenticated
 USING (
  EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=integration_credentials.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
  OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=integration_credentials.workspace_id AND w.owner_id=(SELECT auth.uid()))
 )
 WITH CHECK (
  EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=integration_credentials.workspace_id AND m.user_id=(SELECT auth.uid()) AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
  OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=integration_credentials.workspace_id AND w.owner_id=(SELECT auth.uid()))
 );
REVOKE ALL ON private.integration_credentials FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.integration_credentials TO authenticated, service_role;

CREATE FUNCTION public.set_integration_secret(
 _workspace_id uuid, _provider text, _plaintext jsonb, _key text,
 _metadata jsonb DEFAULT '{}'::jsonb, _status text DEFAULT 'connected'
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE _id uuid;
BEGIN
 IF current_user <> 'service_role' AND (
  auth.uid() IS NULL OR NOT (
   EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_workspace_id AND m.user_id=auth.uid() AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
   OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=_workspace_id AND w.owner_id=auth.uid())
  )
 ) THEN RAISE EXCEPTION 'Workspace não autorizado.' USING ERRCODE='42501'; END IF;
 IF _workspace_id IS NULL OR _provider IS NULL OR _provider !~ '^[a-z][a-z0-9_-]{0,63}$' THEN
  RAISE EXCEPTION 'Integração inválida.' USING ERRCODE='22023';
 END IF;
 IF _key IS NULL OR length(btrim(_key))=0 OR _plaintext IS NULL OR jsonb_typeof(_plaintext)<>'object' THEN
  RAISE EXCEPTION 'Configuração segura da integração inválida.' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(coalesce(_metadata,'{}'::jsonb))<>'object' THEN
  RAISE EXCEPTION 'Metadados inválidos.' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.integrations(workspace_id,provider,status,metadata,last_check_at,last_error,updated_at)
 VALUES (_workspace_id,_provider,coalesce(_status,'connected'),
  coalesce(_metadata,'{}'::jsonb)-ARRAY['api_key','apiKey','key','secret','access_token','refresh_token'],now(),NULL,now())
 ON CONFLICT(workspace_id,provider) DO UPDATE SET
  status=excluded.status,metadata=excluded.metadata,last_check_at=excluded.last_check_at,last_error=NULL,updated_at=now()
 RETURNING id INTO _id;
 INSERT INTO private.integration_credentials(integration_id,workspace_id,ciphertext,updated_at)
 VALUES(_id,_workspace_id,extensions.pgp_sym_encrypt(_plaintext::text,_key,'cipher-algo=aes256,compress-algo=0'),now())
 ON CONFLICT(integration_id) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=now();
 RETURN _id;
END;
$fn$;

CREATE FUNCTION public.get_integration_secret(_workspace_id uuid, _provider text, _key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE _ciphertext bytea;
BEGIN
 IF current_user <> 'service_role' AND (
  auth.uid() IS NULL OR NOT (
   EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_workspace_id AND m.user_id=auth.uid() AND (m.access_expires_at IS NULL OR m.access_expires_at>now()))
   OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=_workspace_id AND w.owner_id=auth.uid())
  )
 ) THEN RAISE EXCEPTION 'Workspace não autorizado.' USING ERRCODE='42501'; END IF;
 IF _key IS NULL OR length(btrim(_key))=0 THEN
  RAISE EXCEPTION 'Configuração segura da integração inválida.' USING ERRCODE='22023';
 END IF;
 SELECT c.ciphertext INTO _ciphertext
 FROM private.integration_credentials c JOIN public.integrations i ON i.id=c.integration_id AND i.workspace_id=c.workspace_id
 WHERE i.workspace_id=_workspace_id AND i.provider=_provider;
 IF _ciphertext IS NULL THEN RETURN NULL; END IF;
 BEGIN
  RETURN extensions.pgp_sym_decrypt(_ciphertext,_key)::jsonb;
 EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Não foi possível abrir a credencial com a configuração segura deste ambiente.' USING ERRCODE='22023';
 END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.set_integration_secret(uuid,text,jsonb,text,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_integration_secret(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_integration_secret(uuid,text,jsonb,text,jsonb,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_integration_secret(uuid,text,text) TO authenticated, service_role;
COMMENT ON TABLE private.integration_credentials IS 'Saúde Slim: credenciais criptografadas com a chave exclusiva do ambiente servidor. Schema não exposto na Data API.';
NOTIFY pgrst, 'reload schema';
