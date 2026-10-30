-- Restrict browser-editable tracking metadata. Ingestion and verification remain server-owned.
REVOKE INSERT,UPDATE ON public.tracking_sites FROM authenticated;
GRANT INSERT(workspace_id,name,domain,created_by) ON public.tracking_sites TO authenticated;
GRANT UPDATE(name,domain) ON public.tracking_sites TO authenticated;
CREATE OR REPLACE FUNCTION public.tracking_overview(_workspace_id uuid,_days integer DEFAULT 7) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $body$
DECLARE result jsonb; cutoff timestamptz:=now()-make_interval(days=>_days);
BEGIN
 IF _days IS NULL OR _days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Período de tracking inválido.' USING ERRCODE='22023'; END IF;
 IF NOT private.slim_workspace_access(_workspace_id) THEN RAISE EXCEPTION 'Sem acesso ao tracking desta empresa.' USING ERRCODE='42501'; END IF;
 WITH all_events AS MATERIALIZED (
  SELECT * FROM public.tracking_events WHERE workspace_id=_workspace_id AND created_at>=cutoff AND created_at<=now()
 ), events AS MATERIALIZED (SELECT * FROM all_events WHERE source_class='cliente'),
 conversions AS MATERIALIZED (
  SELECT c.* FROM public.tracking_conversion_events c LEFT JOIN public.tracking_events e ON e.id=c.event_row_id
  WHERE c.workspace_id=_workspace_id AND c.created_at>=cutoff AND c.created_at<=now() AND (c.event_row_id IS NULL OR e.source_class='cliente')
 ), event_totals AS (SELECT event_name,count(*) n FROM events GROUP BY event_name),
 campaigns AS (SELECT coalesce(utm_campaign,'(sem campanha)') campaign,count(DISTINCT (site_id,session_id)) FILTER(WHERE session_id IS NOT NULL) sessions,count(DISTINCT lead_id) leads FROM events GROUP BY coalesce(utm_campaign,'(sem campanha)')),
 sources AS (SELECT coalesce(utm_source,'(sem origem)') source,count(DISTINCT (site_id,session_id)) FILTER(WHERE session_id IS NOT NULL) sessions,count(DISTINCT lead_id) leads FROM events GROUP BY coalesce(utm_source,'(sem origem)')),
 currencies AS (SELECT upper(currency) currency,sum(value) amount FROM conversions GROUP BY upper(currency)),
 conversion_campaigns AS (SELECT coalesce(utm_campaign,'(sem campanha)') campaign,count(*) conversions,coalesce(sum(value) FILTER(WHERE upper(currency)='BRL'),0) value_brl FROM conversions GROUP BY coalesce(utm_campaign,'(sem campanha)'))
 SELECT jsonb_build_object(
  'events',(SELECT count(*) FROM events),
  'sessions',(SELECT count(DISTINCT (site_id,session_id)) FROM events WHERE session_id IS NOT NULL),
  'visitors',(SELECT count(DISTINCT (site_id,visitor_id)) FROM events WHERE visitor_id IS NOT NULL),
  'identified_visitors',(SELECT count(DISTINCT (site_id,visitor_id)) FROM events WHERE visitor_id IS NOT NULL AND lead_id IS NOT NULL),
  'leads',(SELECT count(DISTINCT lead_id) FROM events),
  'page_views',(SELECT count(*) FROM events WHERE event_name='page_view'),
  'form_submits',(SELECT count(*) FROM events WHERE event_name='form_submit'),
  'conversions',(SELECT count(*) FROM conversions),
  'revenue',(SELECT coalesce(sum(value) FILTER(WHERE upper(currency)='BRL'),0) FROM conversions),
  'revenue_by_currency',coalesce((SELECT jsonb_object_agg(currency,amount) FROM currencies),'{}'::jsonb),
  'conversion_by_campaign',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY conversions DESC,campaign) FROM conversion_campaigns c),'[]'::jsonb),
  'by_event',coalesce((SELECT jsonb_object_agg(event_name,n) FROM event_totals),'{}'::jsonb),
  'by_campaign',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY sessions DESC,campaign) FROM campaigns c),'[]'::jsonb),
  'by_source',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY sessions DESC,source) FROM sources s),'[]'::jsonb),
  'quality',jsonb_build_object('internal_events',(SELECT count(*) FROM all_events WHERE source_class<>'cliente'),'orphan_events',(SELECT count(*) FROM events WHERE site_id IS NULL))
 ) INTO result;
 RETURN result;
END;$body$;
NOTIFY pgrst,'reload schema';
