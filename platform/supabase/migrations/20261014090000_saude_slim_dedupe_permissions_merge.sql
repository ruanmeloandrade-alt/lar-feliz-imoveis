-- Saude Slim exclusiva: persistencia de grupos de leads duplicados.
-- Alinhada a migration aplicada no Supabase vyzvfcgpjjzvcjegzzza.
CREATE TABLE IF NOT EXISTS public.lead_dedupe_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  signature text NOT NULL,
  dismissed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_dedupe_dismissals_signature_unique UNIQUE (workspace_id, signature)
);
ALTER TABLE public.lead_dedupe_dismissals ENABLE ROW LEVEL SECURITY;
DO $policies$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='lead_dedupe_dismissals' AND policyname='saude_slim_owner_manage_dismissals') THEN
    CREATE POLICY saude_slim_owner_manage_dismissals
    ON public.lead_dedupe_dismissals FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id=lead_dedupe_dismissals.workspace_id
        AND wm.user_id=(select auth.uid()) AND wm.role IN ('owner','admin')
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id=lead_dedupe_dismissals.workspace_id
        AND wm.user_id=(select auth.uid()) AND wm.role IN ('owner','admin')
    ) AND dismissed_by=(select auth.uid()));
  END IF;
END $policies$;
GRANT SELECT, INSERT ON public.lead_dedupe_dismissals TO authenticated;

CREATE OR REPLACE FUNCTION public.saude_slim_merge_leads(p_primary_id uuid, p_merged_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  actor uuid := auth.uid();
  ws uuid;
  primary_row public.leads%ROWTYPE;
  n integer;
  email_value text;
  phone_value text;
  max_value numeric;
  all_tags jsonb;
  history jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Acesso não autenticado'; END IF;
  SELECT p.current_workspace_id INTO ws FROM public.profiles p WHERE p.id=actor;
  IF ws IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id=actor AND wm.workspace_id=ws AND wm.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'Usuário sem permissão de mesclagem'; END IF;
  n := cardinality(p_merged_ids);
  IF n IS NULL OR n < 1 OR n > 10
     OR p_primary_id=ANY(p_merged_ids)
     OR n <> (SELECT count(DISTINCT id) FROM unnest(p_merged_ids) AS ids(id))
     OR EXISTS (SELECT 1 FROM unnest(p_merged_ids) AS ids(id) WHERE id IS NULL)
  THEN RAISE EXCEPTION 'Seleção de leads inválida'; END IF;

  PERFORM l.id FROM public.leads l
  WHERE l.workspace_id=ws AND l.id=ANY(array_append(p_merged_ids,p_primary_id))
  ORDER BY l.id FOR UPDATE;

  SELECT * INTO primary_row FROM public.leads l
  WHERE l.workspace_id=ws AND l.id=p_primary_id AND l.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead principal indisponível'; END IF;
  IF (SELECT count(*) FROM public.leads l
      WHERE l.workspace_id=ws AND l.id=ANY(p_merged_ids) AND l.status='active') <> n
  THEN RAISE EXCEPTION 'Os leads não pertencem à empresa ou já foram mesclados'; END IF;

  SELECT
    (SELECT l.email FROM public.leads l
      WHERE l.workspace_id=ws AND l.id=ANY(p_merged_ids) AND l.email IS NOT NULL LIMIT 1),
    (SELECT l.phone FROM public.leads l
      WHERE l.workspace_id=ws AND l.id=ANY(p_merged_ids) AND l.phone IS NOT NULL LIMIT 1),
    (SELECT max(l.value) FROM public.leads l WHERE l.workspace_id=ws AND l.id=ANY(p_merged_ids))
  INTO email_value,phone_value,max_value;

  SELECT coalesce(jsonb_agg(DISTINCT tag_value), '[]'::jsonb)
  INTO all_tags
  FROM public.leads l,
       LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(l.tags)='array' THEN l.tags ELSE '[]'::jsonb END) AS t(tag_value)
  WHERE l.workspace_id=ws AND l.id=ANY(array_append(p_merged_ids,p_primary_id));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'email',l.email,'phone',l.phone,
    'value',l.value,'custom_data',l.custom_data
  )), '[]'::jsonb)
  INTO history
  FROM public.leads l WHERE l.workspace_id=ws AND l.id=ANY(p_merged_ids);

  UPDATE public.leads SET
    email=coalesce(primary_row.email,email_value),
    phone=coalesce(primary_row.phone,phone_value),
    value=greatest(coalesce(primary_row.value,0),coalesce(max_value,0)),
    tags=all_tags,
    custom_data=jsonb_set(
      coalesce(primary_row.custom_data,'{}'::jsonb),'{merged_history}',
      coalesce(primary_row.custom_data->'merged_history','[]'::jsonb) || history,true)
  WHERE id=p_primary_id AND workspace_id=ws;

  UPDATE public.lead_activities SET lead_id=p_primary_id
  WHERE workspace_id=ws AND lead_id=ANY(p_merged_ids);
  UPDATE public.lead_products SET lead_id=p_primary_id
  WHERE workspace_id=ws AND lead_id=ANY(p_merged_ids);
  UPDATE public.leads SET status='merged',merged_into_id=p_primary_id
  WHERE workspace_id=ws AND id=ANY(p_merged_ids);
  INSERT INTO public.lead_activities(workspace_id,lead_id,type,payload)
  VALUES(ws,p_primary_id,'merge',jsonb_build_object('merged_ids',p_merged_ids,'by',actor,'at',now()));

  RETURN jsonb_build_object('ok',true,'primaryId',p_primary_id,'mergedCount',n);
END;
$function$

REVOKE ALL ON FUNCTION public.saude_slim_merge_leads(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.saude_slim_merge_leads(uuid,uuid[]) TO authenticated;
