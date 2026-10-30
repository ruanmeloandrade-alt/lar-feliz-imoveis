-- Saúde Slim block 9: explicit partner/admin invitations, with durable reviewed attempts.
-- Schema only at installation: no invitations, accounts, memberships or profiles are changed.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
 IF to_regclass('public.workspace_invitations') IS NULL OR to_regclass('public.workspace_members') IS NULL
    OR to_regclass('public.profiles') IS NULL OR to_regclass('private.slim_invitation_requests') IS NOT NULL THEN
  RAISE EXCEPTION 'O contrato de convites mudou. Revise a migration antes de aplicar.';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.workspace_invitations'::regclass AND attname='access_role' AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.workspace_invitations'::regclass AND attname='modules' AND atttypid='jsonb'::regtype AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.workspace_invitations'::regclass AND attname='token' AND atttypid='uuid'::regtype AND NOT attisdropped) THEN
  RAISE EXCEPTION 'O esquema de acesso dos convites mudou. Revise a migration antes de aplicar.';
 END IF;
END;$preflight$;

-- No default/backfill: an old invitation never silently becomes an admin grant.
ALTER TABLE public.workspace_invitations ADD COLUMN access_role text;
ALTER TABLE public.workspace_invitations ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE public.workspace_invitations ADD COLUMN accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE private.slim_invitation_requests (
 request_id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('create','renew','revoke')),
 target_id uuid,
 payload_hash text,
 expected_fingerprint text,
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((action='create' AND target_id IS NULL) OR (action IN ('renew','revoke') AND target_id IS NOT NULL)),
 CHECK((payload_hash IS NULL AND expected_fingerprint IS NULL) OR
       (payload_hash ~ '^[0-9a-f]{64}$' AND expected_fingerprint ~ '^[0-9a-f]{64}$'))
);
ALTER TABLE private.slim_invitation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.slim_invitation_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.slim_invitation_email(p_email text) RETURNS text
 LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $f$
DECLARE normalized text:=lower(btrim(p_email));
BEGIN
 IF length(normalized) NOT BETWEEN 3 AND 200 OR normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR normalized ~ '[[:cntrl:]]' THEN RETURN NULL; END IF;
 RETURN normalized;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_email(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.slim_invitation_summary(p_invitation public.workspace_invitations) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT CASE WHEN p_invitation.id IS NULL THEN NULL ELSE jsonb_build_object(
  'id',p_invitation.id,'email',p_invitation.email,'accessRole',p_invitation.access_role,
  'accessDays',p_invitation.access_days,'roleType',p_invitation.role_type,'isPartner',p_invitation.is_partner,
  'status',p_invitation.status,'expiresAt',p_invitation.expires_at,'createdAt',p_invitation.created_at,
  'acceptedAt',p_invitation.accepted_at,
  'revision',encode(extensions.digest(to_jsonb(p_invitation)::text,'sha256'),'hex')) END;
$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_summary(public.workspace_invitations) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.slim_invitation_owner(p_workspace_id uuid,p_actor_id uuid,p_lock boolean DEFAULT false) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
DECLARE actual_owner uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor_id
 OR p_workspace_id IS DISTINCT FROM 'c49945db-1960-461a-9339-a43b8403bdd9'::uuid THEN
  RAISE EXCEPTION 'Sem permissão para gerenciar convites nesta empresa.' USING ERRCODE='42501';
 END IF;
 IF p_lock THEN
  SELECT owner_id INTO actual_owner FROM public.workspaces WHERE id=p_workspace_id FOR SHARE;
 ELSE
  SELECT owner_id INTO actual_owner FROM public.workspaces WHERE id=p_workspace_id;
 END IF;
 IF actual_owner IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'Somente o dono da empresa pode gerenciar convites.' USING ERRCODE='42501';
 END IF;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_owner(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

-- A single snapshot binds the review to all same-email invites and memberships.
-- The response exposes only the count and a digest, never private membership identities or tokens.
CREATE FUNCTION private.slim_invitation_context_value(p_workspace_id uuid,p_actor_id uuid,p_action text,p_email text,p_invitation_id uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
DECLARE email_key text; data jsonb; inv public.workspace_invitations; pending_count integer;
 block_code text; reason text; fingerprint text; context jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('create','renew','revoke') THEN
  RAISE EXCEPTION 'Ação de convite inválida.' USING ERRCODE='22023';
 END IF;
 IF p_action='create' THEN
  email_key:=private.slim_invitation_email(p_email);
  IF email_key IS NULL OR p_invitation_id IS NOT NULL THEN RAISE EXCEPTION 'Informe um e-mail válido para o novo convite.' USING ERRCODE='22023'; END IF;
 ELSE
  IF p_invitation_id IS NULL OR p_email IS NOT NULL THEN RAISE EXCEPTION 'Informe somente o convite que será alterado.' USING ERRCODE='22023'; END IF;
  SELECT private.slim_invitation_email(email) INTO email_key FROM public.workspace_invitations WHERE id=p_invitation_id AND workspace_id=p_workspace_id;
 END IF;
 SELECT jsonb_build_object(
  'owner',(SELECT owner_id FROM public.workspaces WHERE id=p_workspace_id),
  'invitations',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) FROM public.workspace_invitations i
    WHERE i.workspace_id=p_workspace_id AND (private.slim_invitation_email(i.email)=email_key OR i.id=p_invitation_id)),
  'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'userId',m.user_id,'role',m.role,'roleType',m.role_type,
      'isPartner',m.is_partner,'expiresAt',m.access_expires_at) ORDER BY m.id),'[]'::jsonb)
    FROM public.workspace_members m JOIN auth.users u ON u.id=m.user_id
    WHERE m.workspace_id=p_workspace_id AND private.slim_invitation_email(u.email)=email_key),
  'emailIsOwner',EXISTS(SELECT 1 FROM public.workspaces w JOIN auth.users u ON u.id=w.owner_id
    WHERE w.id=p_workspace_id AND private.slim_invitation_email(u.email)=email_key)) INTO data;
 SELECT count(*)::integer INTO pending_count FROM jsonb_array_elements(data->'invitations') i WHERE i->>'status'='pending';
 SELECT * INTO inv FROM jsonb_populate_record(NULL::public.workspace_invitations,
  (SELECT i FROM jsonb_array_elements(data->'invitations') i WHERE i->>'id'=p_invitation_id::text LIMIT 1));
 IF p_action='create' THEN
  IF jsonb_array_length(data->'members')>0 OR (data->>'emailIsOwner')::boolean THEN
   block_code:='ALREADY_MEMBER';reason:='Este e-mail já pertence à equipe. Gerencie o vínculo existente.';
  END IF;
 ELSIF inv.id IS NULL THEN
  block_code:='INVITATION_UNAVAILABLE';reason:='Convite não encontrado nesta empresa.';
 ELSIF inv.status IS NULL OR inv.status NOT IN ('pending','expired') OR inv.accepted_at IS NOT NULL OR inv.accepted_by IS NOT NULL THEN
  block_code:='INVITATION_UNAVAILABLE';reason:='Este convite já foi consumido ou revogado. Atualize a lista.';
 ELSIF p_action='renew' AND (inv.access_role IS DISTINCT FROM 'admin' OR inv.access_days IS NOT NULL
    OR inv.role_type IS DISTINCT FROM 'parceiro' OR inv.is_partner IS DISTINCT FROM true OR email_key IS NULL) THEN
  block_code:='INVALID_ACCESS';reason:='Este convite não tem aprovação de acesso administrativo completo sem prazo. Crie um novo convite revisado.';
 ELSIF p_action='renew' AND (jsonb_array_length(data->'members')>0 OR (data->>'emailIsOwner')::boolean) THEN
  block_code:='ALREADY_MEMBER';reason:='Este e-mail já pertence à equipe. Gerencie o vínculo existente.';
 END IF;
 fingerprint:=encode(extensions.digest(jsonb_build_object('workspaceId',p_workspace_id,'actorId',p_actor_id,
  'action',p_action,'email',email_key,'invitationId',p_invitation_id,'state',data)::text,'sha256'),'hex');
 context:=jsonb_build_object('version',1,'workspaceId',p_workspace_id,'actorId',p_actor_id,'action',p_action,
  'email',email_key,'invitationId',p_invitation_id,'expectedFingerprint',fingerprint,
  'invitation',private.slim_invitation_summary(inv),'pendingToReplace',CASE WHEN p_action='create' THEN pending_count ELSE 0 END,
  'canProceed',block_code IS NULL,'reason',reason,'requiredAccess',jsonb_build_object('accessRole','admin','accessDays',NULL));
 RETURN jsonb_build_object('context',context,'code',block_code,'emailKey',email_key);
END;$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_context_value(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.slim_invitation_context_impl(p_workspace_id uuid,p_actor_id uuid,p_action text,p_email text DEFAULT NULL,p_invitation_id uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET row_security=off SET lock_timeout='5s' SET statement_timeout='20s' AS $f$
BEGIN
 PERFORM private.slim_invitation_owner(p_workspace_id,p_actor_id);
 RETURN private.slim_invitation_context_value(p_workspace_id,p_actor_id,p_action,p_email,p_invitation_id)->'context';
END;$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_context_impl(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.slim_invitation_context_impl(uuid,uuid,text,text,uuid) TO authenticated;
CREATE FUNCTION public.slim_invitation_context(p_workspace_id uuid,p_actor_id uuid,p_action text,p_email text DEFAULT NULL,p_invitation_id uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_invitation_context_impl(p_workspace_id,p_actor_id,p_action,p_email,p_invitation_id);
$f$;
REVOKE ALL ON FUNCTION public.slim_invitation_context(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.slim_invitation_context(uuid,uuid,text,text,uuid) TO authenticated;

CREATE FUNCTION private.slim_invitation_change_impl(p_workspace_id uuid,p_actor_id uuid,p_request_id uuid,p_action text,p_payload jsonb,p_expected_fingerprint text,p_approved boolean) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET row_security=off SET lock_timeout='5s' SET statement_timeout='20s' AS $f$
DECLARE target uuid; email_key text; payload jsonb; payload_hash text; saved private.slim_invitation_requests;
 base jsonb; context_value jsonb; context jsonb; result jsonb; inv public.workspace_invitations; code text; message text;
BEGIN
 PERFORM private.slim_invitation_owner(p_workspace_id,p_actor_id);
 IF p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN ('create','renew','revoke') THEN
  RAISE EXCEPTION 'Referência da tentativa inválida.' USING ERRCODE='22023';
 END IF;
 IF p_action<>'create' AND jsonb_typeof(p_payload)='object' AND (p_payload->>'invitationId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
  target:=(p_payload->>'invitationId')::uuid;
 END IF;
 base:=jsonb_build_object('version',1,'workspaceId',p_workspace_id,'actorId',p_actor_id,'requestId',p_request_id,
  'action',p_action,'targetId',target,'invitationId',target,'status','rejected','invitation',NULL);
 IF p_approved IS DISTINCT FROM true THEN
  RETURN base||jsonb_build_object('code','APPROVAL_REQUIRED','message','Revise e aprove a operação antes de confirmar.');
 END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_expected_fingerprint IS NULL OR p_expected_fingerprint !~ '^[0-9a-f]{64}$' THEN
  RETURN base||jsonb_build_object('code','INVALID_INPUT','message','A revisão do convite está incompleta. Abra uma nova revisão.');
 END IF;
 IF p_action='create' THEN
  email_key:=private.slim_invitation_email(p_payload->>'email');
  IF email_key IS NULL OR jsonb_typeof(p_payload->'email') IS DISTINCT FROM 'string' OR p_payload->>'accessRole' IS DISTINCT FROM 'admin'
     OR p_payload->'accessDays' IS DISTINCT FROM 'null'::jsonb OR (p_payload-ARRAY['email','accessRole','accessDays'])<>'{}'::jsonb THEN
   RETURN base||jsonb_build_object('code','INVALID_ACCESS','message','Escolha e aprove acesso administrativo completo, sem prazo, para um e-mail válido.');
  END IF;
  payload:=jsonb_build_object('email',email_key,'accessRole','admin','accessDays',NULL);
 ELSE
  IF target IS NULL OR (p_payload-'invitationId')<>'{}'::jsonb THEN
   RETURN base||jsonb_build_object('code','INVALID_INPUT','message','Selecione o convite que será alterado.');
  END IF;
  payload:=jsonb_build_object('invitationId',target);
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'A operação requer uma transação READ COMMITTED.' USING ERRCODE='0A000';
 END IF;
 payload_hash:=encode(extensions.digest(payload::text,'sha256'),'hex');
 -- Same UUID across all actors/actions/workspaces, including an absent-lookup tombstone.
 PERFORM pg_advisory_xact_lock(hashtextextended('slim_invitation_request:'||p_request_id::text,91));
 PERFORM private.slim_invitation_owner(p_workspace_id,p_actor_id,true);
 SELECT * INTO saved FROM private.slim_invitation_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF saved.workspace_id IS DISTINCT FROM p_workspace_id OR saved.actor_id IS DISTINCT FROM p_actor_id
     OR saved.action IS DISTINCT FROM p_action OR saved.target_id IS DISTINCT FROM target
     OR (saved.payload_hash IS NOT NULL AND (saved.payload_hash IS DISTINCT FROM payload_hash OR saved.expected_fingerprint IS DISTINCT FROM p_expected_fingerprint)) THEN
   RETURN base||jsonb_build_object('code','REQUEST_MISMATCH','message','Esta tentativa pertence a outra revisão. Atualize o contexto sem reenviar.');
  END IF;
  RETURN saved.receipt;
 END IF;
 IF p_action<>'create' THEN
  SELECT private.slim_invitation_email(email) INTO email_key FROM public.workspace_invitations WHERE id=target AND workspace_id=p_workspace_id;
 END IF;
 IF email_key IS NOT NULL THEN
  -- All create/renew/revoke/accept paths take email before invitation/member row locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('slim_invitation_email:'||p_workspace_id::text||':'||email_key,97));
  PERFORM 1 FROM public.workspace_invitations WHERE workspace_id=p_workspace_id AND private.slim_invitation_email(email)=email_key ORDER BY id FOR UPDATE;
 END IF;
 context_value:=private.slim_invitation_context_value(p_workspace_id,p_actor_id,p_action,CASE WHEN p_action='create' THEN email_key ELSE NULL END,target);
 context:=context_value->'context';
 IF context->>'expectedFingerprint' IS DISTINCT FROM p_expected_fingerprint THEN
  code:='STALE_CONTEXT';message:='O convite ou a equipe mudou desde a revisão. Atualize e revise novamente.';
 ELSIF (context->>'canProceed')::boolean IS DISTINCT FROM true THEN
  code:=context_value->>'code';message:=context->>'reason';
 END IF;
 IF code IS NOT NULL THEN
  result:=base||jsonb_build_object('invitation',context->'invitation','code',code,'message',message);
 ELSE
  IF p_action='create' THEN
   UPDATE public.workspace_invitations SET status='revoked'
    WHERE workspace_id=p_workspace_id AND private.slim_invitation_email(email)=email_key AND status='pending';
   INSERT INTO public.workspace_invitations(workspace_id,email,role_type,is_partner,modules,access_days,access_role,status,token,invited_by,expires_at)
    VALUES(p_workspace_id,email_key,'parceiro',true,'[]'::jsonb,NULL,'admin','pending',gen_random_uuid(),p_actor_id,clock_timestamp()+interval '7 days')
    RETURNING * INTO inv;
  ELSIF p_action='renew' THEN
   UPDATE public.workspace_invitations SET token=gen_random_uuid(),expires_at=clock_timestamp()+interval '7 days',status='pending'
    WHERE id=target AND workspace_id=p_workspace_id RETURNING * INTO inv;
  ELSE
   UPDATE public.workspace_invitations SET status='revoked' WHERE id=target AND workspace_id=p_workspace_id RETURNING * INTO inv;
  END IF;
  result:=base||jsonb_build_object('status','confirmed','invitationId',inv.id,'invitation',private.slim_invitation_summary(inv));
 END IF;
 INSERT INTO private.slim_invitation_requests(request_id,workspace_id,actor_id,action,target_id,payload_hash,expected_fingerprint,receipt)
  VALUES(p_request_id,p_workspace_id,p_actor_id,p_action,target,payload_hash,p_expected_fingerprint,result);
 RETURN result;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_change_impl(uuid,uuid,uuid,text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.slim_invitation_change_impl(uuid,uuid,uuid,text,jsonb,text,boolean) TO authenticated;
CREATE FUNCTION public.slim_invitation_change(p_workspace_id uuid,p_actor_id uuid,p_request_id uuid,p_action text,p_payload jsonb,p_expected_fingerprint text,p_approved boolean) RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_invitation_change_impl(p_workspace_id,p_actor_id,p_request_id,p_action,p_payload,p_expected_fingerprint,p_approved);
$f$;
REVOKE ALL ON FUNCTION public.slim_invitation_change(uuid,uuid,uuid,text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.slim_invitation_change(uuid,uuid,uuid,text,jsonb,text,boolean) TO authenticated;

CREATE FUNCTION private.slim_invitation_change_lookup_impl(p_workspace_id uuid,p_actor_id uuid,p_request_id uuid,p_action text,p_invitation_id uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET row_security=off SET lock_timeout='5s' SET statement_timeout='20s' AS $f$
DECLARE saved private.slim_invitation_requests; base jsonb;
BEGIN
 PERFORM private.slim_invitation_owner(p_workspace_id,p_actor_id);
 IF p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN ('create','renew','revoke')
 OR (p_action='create' AND p_invitation_id IS NOT NULL) OR (p_action<>'create' AND p_invitation_id IS NULL) THEN
  RAISE EXCEPTION 'Referência da tentativa inválida.' USING ERRCODE='22023';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'A consulta requer uma transação READ COMMITTED.' USING ERRCODE='0A000';
 END IF;
 base:=jsonb_build_object('version',1,'workspaceId',p_workspace_id,'actorId',p_actor_id,'requestId',p_request_id,
  'action',p_action,'targetId',p_invitation_id,'invitationId',p_invitation_id,'status','rejected','invitation',NULL);
 PERFORM pg_advisory_xact_lock(hashtextextended('slim_invitation_request:'||p_request_id::text,91));
 PERFORM private.slim_invitation_owner(p_workspace_id,p_actor_id,true);
 SELECT * INTO saved FROM private.slim_invitation_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF saved.workspace_id IS DISTINCT FROM p_workspace_id OR saved.actor_id IS DISTINCT FROM p_actor_id
     OR saved.action IS DISTINCT FROM p_action OR saved.target_id IS DISTINCT FROM p_invitation_id THEN
   RETURN base||jsonb_build_object('code','REQUEST_MISMATCH','message','Esta tentativa pertence a outra revisão. Atualize o contexto sem reenviar.');
  END IF;
  RETURN saved.receipt;
 END IF;
 base:=base||jsonb_build_object('code','REQUEST_CLOSED','message','A tentativa foi encerrada sem execução. Uma nova operação precisa de nova revisão.');
 INSERT INTO private.slim_invitation_requests(request_id,workspace_id,actor_id,action,target_id,receipt)
  VALUES(p_request_id,p_workspace_id,p_actor_id,p_action,p_invitation_id,base);
 RETURN base;
END;$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_change_lookup_impl(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.slim_invitation_change_lookup_impl(uuid,uuid,uuid,text,uuid) TO authenticated;
CREATE FUNCTION public.slim_invitation_change_lookup(p_workspace_id uuid,p_actor_id uuid,p_request_id uuid,p_action text,p_invitation_id uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_invitation_change_lookup_impl(p_workspace_id,p_actor_id,p_request_id,p_action,p_invitation_id);
$f$;
REVOKE ALL ON FUNCTION public.slim_invitation_change_lookup(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.slim_invitation_change_lookup(uuid,uuid,uuid,text,uuid) TO authenticated;

CREATE FUNCTION private.slim_invitation_link_impl(p_workspace_id uuid,p_actor_id uuid,p_invitation_id uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET row_security=off SET lock_timeout='5s' SET statement_timeout='20s' AS $f$
DECLARE inv public.workspace_invitations; email_key text;
BEGIN
 PERFORM private.slim_invitation_owner(p_workspace_id,p_actor_id);
 SELECT private.slim_invitation_email(email) INTO email_key FROM public.workspace_invitations WHERE id=p_invitation_id AND workspace_id=p_workspace_id;
 IF email_key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('slim_invitation_email:'||p_workspace_id::text||':'||email_key,97));
 END IF;
 PERFORM private.slim_invitation_owner(p_workspace_id,p_actor_id,true);
 SELECT * INTO inv FROM public.workspace_invitations WHERE id=p_invitation_id AND workspace_id=p_workspace_id FOR SHARE;
 IF inv.id IS NULL OR inv.status IS DISTINCT FROM 'pending' OR inv.expires_at<=clock_timestamp() OR inv.accepted_at IS NOT NULL OR inv.accepted_by IS NOT NULL
    OR inv.access_role IS DISTINCT FROM 'admin' OR inv.access_days IS NOT NULL OR inv.role_type IS DISTINCT FROM 'parceiro' OR inv.is_partner IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Este convite não possui um link pendente válido. Atualize a lista.' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('version',1,'workspaceId',p_workspace_id,'actorId',p_actor_id,'invitationId',inv.id,
  'token',inv.token,'expiresAt',inv.expires_at,'revision',private.slim_invitation_summary(inv)->>'revision');
END;$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_link_impl(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.slim_invitation_link_impl(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.slim_invitation_link(p_workspace_id uuid,p_actor_id uuid,p_invitation_id uuid) RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_invitation_link_impl(p_workspace_id,p_actor_id,p_invitation_id);
$f$;
REVOKE ALL ON FUNCTION public.slim_invitation_link(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.slim_invitation_link(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION private.slim_invitation_preview_impl(p_token uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET row_security=off SET lock_timeout='5s' SET statement_timeout='20s' AS $f$
DECLARE inv public.workspace_invitations; email_key text; workspace_name text;
BEGIN
 -- The definer identity itself is not evidence of a service request.
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Prévia disponível somente pelo serviço autorizado.' USING ERRCODE='42501';
 END IF;
 SELECT private.slim_invitation_email(email) INTO email_key FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id='c49945db-1960-461a-9339-a43b8403bdd9'::uuid;
 IF email_key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('slim_invitation_email:c49945db-1960-461a-9339-a43b8403bdd9:'||email_key,97));
 END IF;
 SELECT * INTO inv FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id='c49945db-1960-461a-9339-a43b8403bdd9'::uuid FOR SHARE;
 IF inv.id IS NULL THEN RETURN jsonb_build_object('version',1,'status','invalid','code','INVITATION_UNAVAILABLE'); END IF;
 SELECT name INTO workspace_name FROM public.workspaces WHERE id=inv.workspace_id;
 RETURN jsonb_build_object('version',1,'status','valid','workspaceId',inv.workspace_id,'invitationId',inv.id,
  'workspaceName',workspace_name,'email',inv.email,'accessRole',inv.access_role,'accessDays',inv.access_days,'isPartner',inv.is_partner,
  'invitationStatus',CASE WHEN inv.status='pending' AND inv.expires_at<=clock_timestamp() THEN 'expired' ELSE inv.status END,'expiresAt',inv.expires_at);
END;$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_preview_impl(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.slim_invitation_preview_impl(uuid) TO service_role;
CREATE FUNCTION public.slim_invitation_preview(p_token uuid) RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_invitation_preview_impl(p_token);
$f$;
REVOKE ALL ON FUNCTION public.slim_invitation_preview(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.slim_invitation_preview(uuid) TO service_role;

CREATE FUNCTION private.slim_invitation_accept_impl(p_token uuid,p_actor_id uuid,p_approved boolean,p_mode text) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET row_security=off SET lock_timeout='5s' SET statement_timeout='20s' AS $f$
DECLARE inv public.workspace_invitations; member public.workspace_members; email_key text; actor_email text;
 confirmed_at timestamptz; active_workspace uuid; profile_found boolean; base jsonb; result_status text; was_pending boolean; inserted_count integer;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'Entre com a conta que recebeu o convite.' USING ERRCODE='42501';
 END IF;
 IF p_token IS NULL OR p_mode IS NULL OR p_mode NOT IN ('accept','lookup') THEN
  RAISE EXCEPTION 'Referência de aceite inválida.' USING ERRCODE='22023';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'O aceite requer uma transação READ COMMITTED.' USING ERRCODE='0A000';
 END IF;
 base:=jsonb_build_object('version',1,'workspaceId','c49945db-1960-461a-9339-a43b8403bdd9','actorId',p_actor_id,
  'invitationId',NULL,'acceptedAt',NULL,'membershipRole',NULL,'activeWorkspaceId',NULL,'status','rejected');
 SELECT private.slim_invitation_email(email) INTO email_key FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id='c49945db-1960-461a-9339-a43b8403bdd9'::uuid;
 IF email_key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('slim_invitation_email:c49945db-1960-461a-9339-a43b8403bdd9:'||email_key,97));
 END IF;
 -- Even lookup locks only for a consistent result; it never writes business state.
 SELECT * INTO inv FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id='c49945db-1960-461a-9339-a43b8403bdd9'::uuid FOR UPDATE;
 IF inv.id IS NULL THEN RETURN base||jsonb_build_object('code','INVITATION_UNAVAILABLE','message','Convite não encontrado ou substituído. Peça um link atual ao dono.'); END IF;
 base:=base||jsonb_build_object('invitationId',inv.id,'acceptedAt',inv.accepted_at);
 IF p_mode='accept' AND p_approved IS DISTINCT FROM true THEN
  RETURN base||jsonb_build_object('code','APPROVAL_REQUIRED','message','Revise o acesso e confirme o aceite.');
 END IF;
 SELECT private.slim_invitation_email(email),email_confirmed_at INTO actor_email,confirmed_at FROM auth.users WHERE id=p_actor_id FOR SHARE;
 IF actor_email IS NULL OR actor_email IS DISTINCT FROM private.slim_invitation_email(inv.email) THEN
  RETURN base||jsonb_build_object('code','EMAIL_MISMATCH','message','Entre com a conta do mesmo e-mail indicado no convite.');
 END IF;
 IF confirmed_at IS NULL THEN
  RETURN base||jsonb_build_object('code','EMAIL_UNCONFIRMED','message','Confirme o e-mail da sua conta antes de aceitar o convite.');
 END IF;
 IF inv.access_role IS DISTINCT FROM 'admin' OR inv.access_days IS NOT NULL
    OR inv.role_type IS DISTINCT FROM 'parceiro' OR inv.is_partner IS DISTINCT FROM true THEN
  RETURN base||jsonb_build_object('code','INVALID_ACCESS','message','Este convite não tem aprovação de acesso administrativo completo sem prazo. Peça um novo convite revisado.');
 END IF;
 IF inv.status='accepted' THEN
  IF inv.accepted_by IS DISTINCT FROM p_actor_id OR inv.accepted_at IS NULL THEN
   RETURN base||jsonb_build_object('code','INVITATION_CONSUMED','message','Este convite já foi consumido e não pode conceder novo acesso.');
  END IF;
 ELSIF inv.status='revoked' THEN
  RETURN base||jsonb_build_object('code','INVITATION_REVOKED','message','Este convite foi revogado. Peça um novo link ao dono.');
 ELSIF inv.status='expired' OR (inv.status='pending' AND inv.expires_at<=clock_timestamp()) THEN
  RETURN base||jsonb_build_object('code','INVITATION_EXPIRED','message','Este link expirou. Peça a renovação ao dono.');
 ELSIF inv.status IS DISTINCT FROM 'pending' OR inv.accepted_at IS NOT NULL OR inv.accepted_by IS NOT NULL THEN
  RETURN base||jsonb_build_object('code','INVITATION_UNAVAILABLE','message','Este convite não está disponível para aceite.');
 END IF;
 was_pending:=inv.status='pending';
 SELECT * INTO member FROM public.workspace_members WHERE workspace_id=inv.workspace_id AND user_id=p_actor_id FOR UPDATE;
 SELECT current_workspace_id INTO active_workspace FROM public.profiles WHERE id=p_actor_id FOR UPDATE;
 profile_found:=FOUND;
 -- A row lock may have waited across the token deadline. Recheck after all reads that can wait.
 IF was_pending AND inv.expires_at<=clock_timestamp() THEN
  RETURN base||jsonb_build_object('code','INVITATION_EXPIRED','message','Este link expirou. Peça a renovação ao dono.');
 END IF;
 IF member.id IS NOT NULL AND member.access_expires_at IS NOT NULL AND member.access_expires_at<=clock_timestamp() THEN
  RETURN base||jsonb_build_object('code','MEMBERSHIP_EXPIRED','message','Seu vínculo anterior expirou. O dono precisa gerenciar esse acesso.');
 END IF;
 IF inv.status='accepted' AND member.id IS NULL THEN
  RETURN base||jsonb_build_object('code','MEMBERSHIP_REMOVED','message','O convite foi usado, mas seu vínculo não está mais ativo. Peça ao dono para revisar o acesso.');
 END IF;
 IF NOT profile_found THEN
  RETURN base||jsonb_build_object('code','PROFILE_UNAVAILABLE','message','Seu perfil não está disponível para entrar na empresa. Tente novamente após regularizar a conta.');
 END IF;
 IF p_mode='lookup' THEN
  IF inv.status='pending' THEN
   RETURN base||jsonb_build_object('status','pending','activeWorkspaceId',active_workspace);
  END IF;
  RETURN base||jsonb_build_object('status','already_accepted','membershipRole',member.role,'activeWorkspaceId',active_workspace);
 END IF;
 IF inv.status='accepted' THEN
  result_status:='already_accepted';
 ELSE
  IF member.id IS NULL THEN
   INSERT INTO public.workspace_members(workspace_id,user_id,role,role_type,is_partner,access_expires_at)
    VALUES(inv.workspace_id,p_actor_id,'admin','parceiro',true,NULL) ON CONFLICT(workspace_id,user_id) DO NOTHING;
   GET DIAGNOSTICS inserted_count=ROW_COUNT;
   -- A simultaneous out-of-flow member creation is preserved, never upgraded.
   SELECT * INTO member FROM public.workspace_members WHERE workspace_id=inv.workspace_id AND user_id=p_actor_id FOR UPDATE;
   IF member.id IS NULL OR (member.access_expires_at IS NOT NULL AND member.access_expires_at<=clock_timestamp()) THEN
    RAISE EXCEPTION 'O vínculo mudou durante o aceite. Atualize o contexto antes de continuar.' USING ERRCODE='40001';
   END IF;
   result_status:=CASE WHEN inserted_count=1 THEN 'accepted' ELSE 'already_member' END;
  ELSE
   result_status:='already_member';
  END IF;
  UPDATE public.workspace_invitations SET status='accepted',accepted_by=p_actor_id,accepted_at=clock_timestamp()
   WHERE id=inv.id RETURNING * INTO inv;
 END IF;
 -- Explicit acceptance may select this workspace again, but never rewrites membership or permissions.
 -- Missing rows or failing profile triggers roll back member + consumed invitation in the same statement.
 IF active_workspace IS DISTINCT FROM inv.workspace_id THEN
  UPDATE public.profiles SET current_workspace_id=inv.workspace_id WHERE id=p_actor_id
   RETURNING current_workspace_id INTO active_workspace;
  IF NOT FOUND OR active_workspace IS DISTINCT FROM inv.workspace_id THEN
   RAISE EXCEPTION 'Não foi possível selecionar a empresa no seu perfil.' USING ERRCODE='40001';
  END IF;
 END IF;
 -- ON CONFLICT/FK checks can also wait after the initial locks. A late expiry must
 -- roll back all writes, never return a rejection that leaves a new member behind.
 IF was_pending AND inv.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Este link expirou durante o aceite. Consulte o resultado e peça a renovação ao dono.' USING ERRCODE='22023';
 END IF;
 RETURN base||jsonb_build_object('status',result_status,'acceptedAt',inv.accepted_at,'membershipRole',member.role,'activeWorkspaceId',active_workspace);
END;$f$;
REVOKE ALL ON FUNCTION private.slim_invitation_accept_impl(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.slim_invitation_accept_impl(uuid,uuid,boolean,text) TO authenticated;
CREATE FUNCTION public.slim_invitation_accept(p_token uuid,p_actor_id uuid,p_approved boolean,p_mode text) RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
 SELECT private.slim_invitation_accept_impl(p_token,p_actor_id,p_approved,p_mode);
$f$;
REVOKE ALL ON FUNCTION public.slim_invitation_accept(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.slim_invitation_accept(uuid,uuid,boolean,text) TO authenticated;
