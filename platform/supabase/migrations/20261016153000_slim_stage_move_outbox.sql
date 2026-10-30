-- Atomic lead movement + durable event. Installation does not move contacts or start bots.
CREATE TABLE public.slim_stage_move_events(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),lead_id uuid NOT NULL REFERENCES public.leads(id),actor_id uuid NOT NULL REFERENCES auth.users(id),
 from_stage_id uuid,to_stage_id uuid NOT NULL,pipeline_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','dispatching','dispatched','skipped','error')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),started_at timestamptz,finished_at timestamptz,last_error text
);
CREATE INDEX slim_stage_move_pending ON public.slim_stage_move_events(status,created_at) WHERE status IN('pending','dispatching');
ALTER TABLE public.slim_stage_move_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.slim_stage_move_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.slim_stage_move_events TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.slim_stage_move_events TO service_role;
CREATE POLICY slim_stage_move_read ON public.slim_stage_move_events FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id));
CREATE FUNCTION public.slim_move_lead_and_emit(_workspace_id uuid,_lead_id uuid,_stage_id uuid,_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE l public.leads;s public.pipeline_stages;e public.slim_stage_move_events;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN RAISE EXCEPTION 'Sem permissão para mover o cliente.' USING ERRCODE='42501';END IF;
 IF _request_id IS NULL OR _lead_id IS NULL OR _stage_id IS NULL THEN RAISE EXCEPTION 'Movimentação inválida.' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,23));
 SELECT * INTO e FROM public.slim_stage_move_events WHERE id=_request_id;
 IF FOUND THEN
  IF e.workspace_id<>_workspace_id OR e.actor_id<>auth.uid() OR e.lead_id<>_lead_id OR e.to_stage_id<>_stage_id THEN RAISE EXCEPTION 'Referência de movimentação já utilizada.' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('ok',true,'moved',true,'eventId',e.id,'state',e.status,'leadId',e.lead_id);
 END IF;
 SELECT * INTO l FROM public.leads WHERE id=_lead_id AND workspace_id=_workspace_id AND merged_into_id IS NULL AND status NOT IN('deleted','archived','merged') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente indisponível nesta empresa.' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.pipeline_stages WHERE id=_stage_id AND workspace_id=_workspace_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Etapa indisponível nesta empresa.' USING ERRCODE='42501';END IF;
 IF l.stage_id IS NOT DISTINCT FROM s.id AND l.pipeline_id IS NOT DISTINCT FROM s.pipeline_id THEN
  RETURN jsonb_build_object('ok',true,'moved',false,'eventId',NULL,'state','unchanged','leadId',l.id);
 END IF;
 INSERT INTO public.slim_stage_move_events(id,workspace_id,lead_id,actor_id,from_stage_id,to_stage_id,pipeline_id) VALUES(_request_id,_workspace_id,l.id,auth.uid(),l.stage_id,s.id,s.pipeline_id);
 UPDATE public.leads SET stage_id=s.id,pipeline_id=s.pipeline_id,updated_at=clock_timestamp() WHERE id=l.id AND workspace_id=_workspace_id;
 RETURN jsonb_build_object('ok',true,'moved',true,'eventId',_request_id,'state','pending','leadId',l.id);
END;$f$;
REVOKE ALL ON FUNCTION public.slim_move_lead_and_emit(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.slim_move_lead_and_emit(uuid,uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.slim_claim_stage_move(_id uuid) RETURNS SETOF public.slim_stage_move_events LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 UPDATE public.slim_stage_move_events SET status='dispatching',attempts=attempts+1,started_at=clock_timestamp()
 WHERE id=_id AND attempts<5 AND (status='pending' OR(status='dispatching' AND started_at<clock_timestamp()-interval '2 minutes')) RETURNING *;
$f$;
REVOKE ALL ON FUNCTION public.slim_claim_stage_move(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.slim_claim_stage_move(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
