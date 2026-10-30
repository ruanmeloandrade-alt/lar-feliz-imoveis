-- Saúde Slim: prevent NEW eligible phone collisions across all lead writers.
-- Existing aliases, contacts, messages, orders and links are never rewritten.
-- Only this company's future inserts / effective identity changes are guarded.
-- No unique index over historical rows, new public RPC or application grant.

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE
 v_normalizer record;
BEGIN
 SELECT p.prosrc,p.provolatile,p.proisstrict,p.prosecdef,p.proconfig
 INTO v_normalizer FROM pg_catalog.pg_proc p
 WHERE p.oid=pg_catalog.to_regprocedure('private.slim_funnel_contact_phone_key(text)');
 IF NOT FOUND OR v_normalizer.provolatile<>'i' OR NOT v_normalizer.proisstrict
    OR v_normalizer.prosecdef
    OR v_normalizer.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
    OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_normalizer.prosrc,'UTF8')),'hex')
       <> '13b638b254fabc1d3e3898016842732a045f95b0bca8d978c0a0640b3a5877e7' THEN
  RAISE EXCEPTION 'O contrato de telefone do Funil mudou. Revise a barreira antes de instalar.';
 END IF;
END;
$preflight$;

CREATE FUNCTION private.slim_leads_contact_phone_guard()
 RETURNS trigger
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=''
 SET row_security=off
 SET lock_timeout='5s'
AS $guard$
DECLARE
 v_workspace constant uuid := 'c49945db-1960-461a-9339-a43b8403bdd9';
 v_phone_key text;
BEGIN
 -- This is a trigger-only read barrier, not an alternate write API. PostgreSQL
 -- has already applied the caller's INSERT/UPDATE privileges and RLS checks.
 -- Definer visibility is needed solely to detect a collision hidden by a SELECT
 -- policy. row_security=off makes insufficient owner privileges fail closed;
 -- it does not itself bypass RLS. No existing row or identifier is returned.
 IF TG_RELID<>'public.leads'::pg_catalog.regclass OR TG_LEVEL<>'ROW'
    OR TG_WHEN<>'AFTER' OR TG_OP NOT IN ('INSERT','UPDATE') THEN
  RAISE EXCEPTION 'Barreira de contato fora do contexto permitido.' USING ERRCODE='42501';
 END IF;
 IF NEW.workspace_id IS DISTINCT FROM v_workspace
    OR NEW.merged_into_id IS NOT NULL
    OR NEW.status IN ('deleted','archived','merged') THEN
  RETURN NEW;
 END IF;
 -- NULL status is eligible, matching current contactPhoneKey consumers and the
 -- installed Funnel creation guard. Only the actual phone column is considered.
 -- Channel IDs live in separate columns; groups retain their full @g.us JID.
 -- Do not strip an identifier into digits or exclude a real phone by its source.
 v_phone_key := private.slim_funnel_contact_phone_key(NEW.phone);
 IF v_phone_key IS NULL THEN RETURN NEW; END IF;

 IF TG_OP='UPDATE' THEN
  -- Preserve edits to historical aliases when their effective identity remains
  -- the same, including phone punctuation and NULL -> active status changes.
  IF OLD.workspace_id IS NOT DISTINCT FROM NEW.workspace_id
     AND OLD.merged_into_id IS NULL
     AND (OLD.status IS NULL OR OLD.status NOT IN ('deleted','archived','merged'))
     AND private.slim_funnel_contact_phone_key(OLD.phone) IS NOT DISTINCT FROM v_phone_key THEN
   RETURN NEW;
  END IF;
 END IF;

 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Cadastro de contato exige isolamento READ COMMITTED.'
   USING ERRCODE='0A000',DETAIL='slim_leads_contact_phone_guard:requires_read_committed';
 END IF;
 -- A dedicated common lock is reached by every INSERT/UPDATE writer. Existing
 -- Funnel/checkout request and stock locks remain intact. The timeout is local
 -- to this function and transaction-level advisory locks live until commit or
 -- rollback. Multi-key transactions can be rejected on deadlock/timeout; they
 -- must roll back rather than automatically replaying a sale or automation.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'slim_leads_contact_phone_guard:'||NEW.workspace_id::text||':'||v_phone_key,83
 ));
 -- Keep this query separate from lock acquisition. VOLATILE + READ COMMITTED
 -- obtains a fresh snapshot AFTER a wait. AFTER ROW also sees all rows inserted
 -- or updated by the outer statement, so a colliding batch rolls back atomically.
 IF EXISTS (
  SELECT 1 FROM public.leads l
  WHERE l.workspace_id=NEW.workspace_id AND l.id<>NEW.id
   AND l.merged_into_id IS NULL
   AND (l.status IS NULL OR l.status NOT IN ('deleted','archived','merged'))
   AND private.slim_funnel_contact_phone_key(l.phone)=v_phone_key
 ) THEN
  RAISE EXCEPTION 'Telefone já cadastrado. Selecione o cliente existente.'
   USING ERRCODE='23505',CONSTRAINT='slim_leads_contact_phone_guard',
    DETAIL='slim_leads_contact_phone_guard';
 END IF;
 RETURN NEW;
END;
$guard$;

REVOKE ALL ON FUNCTION private.slim_leads_contact_phone_guard()
 FROM PUBLIC,anon,authenticated,service_role;

-- No UPDATE OF filter: a BEFORE trigger may change an identity even when the
-- caller only named a different column. The body cheaply skips unchanged keys.
CREATE TRIGGER slim_leads_contact_phone_guard
 AFTER INSERT OR UPDATE ON public.leads
 FOR EACH ROW EXECUTE FUNCTION private.slim_leads_contact_phone_guard();

COMMENT ON FUNCTION private.slim_leads_contact_phone_guard() IS
 'Saúde Slim only. Rejects new eligible full-phone collisions after a common transaction lock under READ COMMITTED; preserves historical aliases and all caller RLS/write permissions. No direct application execution.';
