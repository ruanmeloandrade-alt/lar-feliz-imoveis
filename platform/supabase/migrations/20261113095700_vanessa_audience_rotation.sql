BEGIN;

ALTER TABLE public.slim_audience_deliveries
  ADD COLUMN queue_position integer CHECK (queue_position > 0),
  ADD COLUMN message_variant text CHECK (length(message_variant) BETWEEN 1 AND 4096),
  ADD COLUMN interval_after_ms integer CHECK (interval_after_ms BETWEEN 500 AND 15000);

CREATE FUNCTION private.vanessa_enqueue_rotating_audience(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  result jsonb;
  messages text[];
  intervals integer[];
  campaign uuid;
BEGIN
  IF NOT private.slim_workspace_access((_payload->>'workspaceId')::uuid, 'operator') THEN
    RAISE EXCEPTION 'Sem permissão para disparar nesta empresa.' USING ERRCODE = '42501';
  END IF;
  IF (_payload->>'kind') IS DISTINCT FROM 'text'
    OR jsonb_typeof(_payload->'messages') IS DISTINCT FROM 'array'
    OR jsonb_typeof(_payload->'intervalsMs') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Informe as duas listas de rotação.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_payload->'messages') NOT BETWEEN 1 AND 50
    OR jsonb_array_length(_payload->'intervalsMs') NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Use de 1 a 50 frases e de 1 a 50 intervalos.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_payload->'messages') item(value)
      WHERE jsonb_typeof(value) <> 'string' OR length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 4096
      OR (value #>> '{}') ~ '[\r\n]') THEN
    RAISE EXCEPTION 'Informe uma frase válida por linha.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_payload->'intervalsMs') item(value)
      WHERE CASE WHEN jsonb_typeof(value) = 'number' AND value::text ~ '^[0-9]{3,5}$'
        THEN (value::text)::integer NOT BETWEEN 500 AND 15000 ELSE true END) THEN
    RAISE EXCEPTION 'Use intervalos entre 0,5 e 15 segundos.' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(btrim(value) ORDER BY position) INTO messages
  FROM jsonb_array_elements_text(_payload->'messages') WITH ORDINALITY item(value, position);
  SELECT array_agg(value::integer ORDER BY position) INTO intervals
  FROM jsonb_array_elements_text(_payload->'intervalsMs') WITH ORDINALITY item(value, position);

  -- The existing enqueue owns idempotency, recipient eligibility and WhatsApp origin.
  result := private.slim_enqueue_audience_campaign(_payload || jsonb_build_object(
    'message', messages[1], 'delayMs', intervals[1],
    'messages', messages, 'intervalsMs', intervals,
    'rotationRecipientOrder', _payload->'leadIds'
  ));
  IF (result->>'reused')::boolean THEN RETURN result; END IF;
  campaign := (result->>'campaignId')::uuid;

  WITH recipient_order AS (
    SELECT lead_id::uuid, min(position) AS position
    FROM jsonb_array_elements_text(_payload->'leadIds') WITH ORDINALITY item(lead_id, position)
    GROUP BY lead_id::uuid
  ), ranked AS (
    SELECT delivery.id, row_number() OVER (ORDER BY recipient_order.position, delivery.id)::integer AS position
    FROM public.slim_audience_deliveries delivery JOIN recipient_order USING (lead_id)
    WHERE delivery.campaign_id = campaign
  )
  UPDATE public.slim_audience_deliveries delivery
  SET queue_position = ranked.position,
      message_variant = messages[1 + (ranked.position - 1) % cardinality(messages)],
      interval_after_ms = intervals[1 + (ranked.position - 1) % cardinality(intervals)]
  FROM ranked WHERE delivery.id = ranked.id;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION private.vanessa_enqueue_rotating_audience(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.vanessa_enqueue_rotating_audience(jsonb) TO authenticated;

CREATE FUNCTION public.vanessa_enqueue_rotating_audience(_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT private.vanessa_enqueue_rotating_audience(_payload);
$function$;

REVOKE ALL ON FUNCTION public.vanessa_enqueue_rotating_audience(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vanessa_enqueue_rotating_audience(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.slim_claim_audience_delivery()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  campaign public.slim_audience_campaigns;
  delivery public.slim_audience_deliveries;
  claimed_at timestamptz;
BEGIN
  UPDATE public.slim_audience_deliveries SET status='uncertain', last_error='Execução interrompida. Verificar entrega antes de reenviar.', finished_at=now()
    WHERE status='running' AND started_at < now() - interval '3 minutes';
  UPDATE public.slim_audience_campaigns c SET status='completed', finished_at=now()
    WHERE c.status IN ('queued','running') AND NOT EXISTS (
      SELECT 1 FROM public.slim_audience_deliveries d WHERE d.campaign_id=c.id AND d.status IN ('pending','running')
    );
  SELECT * INTO campaign FROM public.slim_audience_campaigns c
    WHERE c.status IN ('queued','running') AND c.next_due_at <= clock_timestamp()
      AND EXISTS (SELECT 1 FROM public.slim_audience_deliveries d WHERE d.campaign_id=c.id AND d.status='pending')
      AND NOT EXISTS (SELECT 1 FROM public.slim_audience_deliveries d WHERE d.campaign_id=c.id AND d.status='running')
    ORDER BY c.next_due_at, c.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO delivery FROM public.slim_audience_deliveries d
    WHERE d.campaign_id=campaign.id AND d.status='pending'
    ORDER BY d.queue_position NULLS LAST, d.created_at, d.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  claimed_at := clock_timestamp();
  UPDATE public.slim_audience_deliveries SET status='running', started_at=claimed_at WHERE id=delivery.id;
  UPDATE public.slim_audience_campaigns SET status='running',
    next_due_at=claimed_at + coalesce(delivery.interval_after_ms, campaign.delay_ms) * interval '1 millisecond'
    WHERE id=campaign.id;
  RETURN to_jsonb(delivery) || jsonb_build_object('campaign', to_jsonb(campaign), 'claimed_at', claimed_at);
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
