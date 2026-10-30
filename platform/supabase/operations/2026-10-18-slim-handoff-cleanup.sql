-- Saúde Slim / SLIM-HANDOFF-20261018
-- Authorized operational reset of test data, restricted to the workspace below.
-- No Auth account deletion, ownership transfer, credential value, or customer content.
-- Preconditions outside this transaction:
--   (1) Both administrator accounts are provisioned in the operational workspace.
--   (2) Test senders are disabled; Evolution instances are verified absent.
--   (3) Only then, the five local WhatsApp sessions are marked disconnected/deleted.
-- Storage objects must be removed through the Storage API, not this SQL file.
-- A failed guard aborts the entire transaction. Do not relax it without reconciliation.

SELECT pg_catalog.set_config('slim.handoff_cleanup_receipt', '{}', false);
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $cleanup$
DECLARE
  v_workspace constant uuid := 'c49945db-1960-461a-9339-a43b8403bdd9';
  v_owner constant uuid := 'faaad2a3-52ef-41a6-846b-ee1f64f3ed38';
  v_admins constant uuid[] := ARRAY[
    'ef744fda-72b1-4cc5-b06e-76f9610a01c6'::uuid,
    'e8f2252b-c0bc-4336-9912-2e62e73ddd2e'::uuid
  ];
  v_sessions constant uuid[] := ARRAY[
    '33ecf991-003a-4e8d-95f3-3c255f550ae0'::uuid,
    '4334a4dd-ac29-4950-b496-721c2275553d'::uuid,
    '63a9d9af-3f8e-483e-9edc-99f4be1d146f'::uuid,
    '7e92dc1a-af8a-4b89-ae86-b0f26f583db4'::uuid,
    '9b0d5aa4-8f0f-425e-b7a7-5570c635fd15'::uuid
  ];
  v_source constant uuid := 'e3aa9029-2381-4010-a686-cf7b5bea2f3d';
  v_extra_source constant uuid := 'e301f396-4022-4b6a-91b0-a140cbbffc1b';
  v_pipeline constant uuid := 'fa570a3c-e8ed-4201-a4cb-923c14783352';
  v_catalog constant uuid := 'e62a4920-937a-422a-8aa6-5aba1badb539';
  v_extra_stage constant uuid := 'e50a49f6-22d4-4d3b-8d97-6a47f1d2b45d';
  v_stages constant uuid[] := ARRAY[
    '51121833-aad6-470e-a5f6-2de7a887578a'::uuid,
    '0a864325-902c-4fe5-9671-32e033791bd1'::uuid,
    '94f371d9-b67f-4209-b54a-2d9720428fb9'::uuid,
    'a5ffdb46-80c6-4287-8b0e-270079e28935'::uuid
  ];
  -- Fixed, reviewed child-before-parent order. No table name comes from user input.
  v_delete_tables constant text[] := ARRAY['crm_automation_jobs','crm_stage_automations','slim_stage_move_events','slim_audience_deliveries','slim_audience_campaigns','crm_lead_audiences','slim_order_document_deliveries','slim_order_documents','slim_order_changes','slim_stock_movements','slim_checkout_attempt_closures','slim_orders','salesbot_run_logs','salesbot_runs','salesbot_blocks','salesbot_revisions','salesbots','conversation_agent_runs','conversation_ai_agents','group_ai_agents','inbox_label_assignments','inbox_labels','whatsapp_groups','whatsapp_web_messages','lead_activities','lead_products','lead_custom_field_values','tasks','crm_form_submissions','tracking_conversion_events','tracking_events','tracking_sites','crm_forms','supplier_product_costs','products','lead_dedupe_dismissals','leads','companies','lead_custom_fields','ai_brain_chunks','ai_brain_sources','ai_brain_blocked_terms','ai_agent_conversations','ai_agent_settings','support_robot_messages','integrations','whatsapp_web_sessions'];
  v_expected_counts constant jsonb := '{"crm_automation_jobs":1,"crm_stage_automations":1,"slim_stage_move_events":2,"slim_audience_deliveries":2,"slim_audience_campaigns":2,"crm_lead_audiences":1,"slim_order_document_deliveries":0,"slim_order_documents":0,"slim_order_changes":0,"slim_stock_movements":4,"slim_checkout_attempt_closures":0,"slim_orders":2,"salesbot_run_logs":17,"salesbot_runs":6,"salesbot_blocks":6,"salesbot_revisions":13,"salesbots":3,"conversation_agent_runs":0,"conversation_ai_agents":1,"group_ai_agents":0,"inbox_label_assignments":0,"inbox_labels":0,"whatsapp_groups":40,"whatsapp_web_messages":360,"lead_activities":439,"lead_products":2,"lead_custom_field_values":0,"tasks":0,"crm_form_submissions":0,"tracking_conversion_events":0,"tracking_events":0,"tracking_sites":0,"crm_forms":1,"supplier_product_costs":1,"products":1,"lead_dedupe_dismissals":0,"leads":26,"companies":1,"lead_custom_fields":0,"ai_brain_chunks":0,"ai_brain_sources":0,"ai_brain_blocked_terms":0,"ai_agent_conversations":0,"ai_agent_settings":0,"support_robot_messages":21,"integrations":1,"whatsapp_web_sessions":5}'::jsonb;
  -- Every public workspace-scoped table is classified as erased or preserved.
  v_known_tables constant text[] := ARRAY['ai_agent_conversations','ai_agent_settings','ai_brain_blocked_terms','ai_brain_chunks','ai_brain_sources','companies','conversation_agent_runs','conversation_ai_agents','crm_automation_jobs','crm_form_submissions','crm_forms','crm_lead_audiences','crm_source_funnels','crm_sources','crm_stage_automations','group_ai_agents','inbox_label_assignments','inbox_labels','integrations','lead_activities','lead_custom_field_values','lead_custom_fields','lead_dedupe_dismissals','lead_products','leads','module_permissions','permission_templates','pipeline_stages','pipelines','product_catalogs','products','salesbot_blocks','salesbot_revisions','salesbot_run_logs','salesbot_runs','salesbots','slim_audience_campaigns','slim_audience_deliveries','slim_checkout_attempt_closures','slim_order_changes','slim_order_document_deliveries','slim_order_documents','slim_orders','slim_stage_move_events','slim_stock_movements','supplier_product_costs','support_robot_messages','tasks','tracking_conversion_events','tracking_events','tracking_sites','user_permissions','user_sessions','whatsapp_groups','whatsapp_web_messages','whatsapp_web_sessions','workflow_sector_members','workflow_sectors','workspace_invitations','workspace_members'];
  v_preserve_tables constant text[] := ARRAY[
    'module_permissions','permission_templates','user_permissions','user_sessions',
    'workflow_sector_members','workflow_sectors','workspace_invitations','workspace_members'
  ];
  v_private_preserve constant text[] := ARRAY[
    'slim_copilot_proposals','slim_copilot_proposal_audit',
    'slim_funnel_write_requests','slim_invitation_requests'
  ];
  v_table text;
  v_schema text;
  v_relation regclass;
  v_count bigint;
  v_deleted bigint;
  v_cap bigint;
  v_hash text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_receipt jsonb := '{}'::jsonb;
  v_preserved_hashes jsonb := '{}'::jsonb;
  v_structural_before jsonb;
  v_structural_after jsonb;
  v_workspace_hash text;
  v_profiles_hash text;
  v_cross_refs bigint;
  v_fk record;
  v_checked_fks integer := 0;
BEGIN
  -- The workspace lock prevents new inserts through its foreign-key references.
  -- Existing records are subsequently locked individually, without locking other tenants.
  PERFORM 1 FROM public.workspaces
    WHERE id=v_workspace AND owner_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLIM_CLEANUP_WORKSPACE_OWNER_CHANGED';
  END IF;
  SELECT md5(to_jsonb(w)::text) INTO v_workspace_hash
    FROM public.workspaces w WHERE id=v_workspace;

  -- Reject an unreviewed table/schema change rather than silently skipping new data.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND column_name='workspace_id'
      AND NOT (table_name=ANY(v_known_tables))
  ) OR (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND column_name='workspace_id'
      AND table_name=ANY(v_known_tables) AND udt_name='uuid'
  ) <> cardinality(v_known_tables) THEN
    RAISE EXCEPTION 'SLIM_CLEANUP_TABLE_ALLOWLIST_CHANGED';
  END IF;

  FOREACH v_table IN ARRAY v_known_tables LOOP
    v_relation := to_regclass(format('%I.%I','public',v_table));
    IF v_relation IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid=v_relation AND relkind='r'
    ) THEN
      RAISE EXCEPTION 'SLIM_CLEANUP_TABLE_UNAVAILABLE: %',v_table;
    END IF;
    EXECUTE format('SELECT 1 FROM public.%I WHERE workspace_id=$1 ORDER BY ctid FOR UPDATE',v_table)
      USING v_workspace;
  END LOOP;

  PERFORM 1 FROM public.profiles WHERE id=ANY(v_admins) FOR UPDATE;
  IF (SELECT count(*) FROM public.workspace_members
       WHERE workspace_id=v_workspace AND user_id=ANY(v_admins)
         AND role='admin' AND role_type='admin'
         AND (access_expires_at IS NULL OR access_expires_at>clock_timestamp()))<>2
     OR (SELECT count(*) FROM public.profiles
          WHERE id=ANY(v_admins) AND current_workspace_id=v_workspace)<>2 THEN
    RAISE EXCEPTION 'SLIM_CLEANUP_ADMIN_PROVISIONING_NOT_CONFIRMED';
  END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'|' ORDER BY p.id),'')) INTO v_profiles_hash
    FROM public.profiles p WHERE id=ANY(v_admins);

  IF (SELECT count(*) FROM public.whatsapp_web_sessions WHERE workspace_id=v_workspace)<>5
     OR EXISTS (SELECT 1 FROM public.whatsapp_web_sessions
                WHERE workspace_id=v_workspace AND NOT (id=ANY(v_sessions)))
     OR EXISTS (SELECT 1 FROM public.whatsapp_web_sessions
                WHERE workspace_id=v_workspace AND
                 (provider IS DISTINCT FROM 'evolution'
                  OR status IS DISTINCT FROM 'desconectado'
                  OR metadata->>'deleted' IS DISTINCT FROM 'true')) THEN
    RAISE EXCEPTION 'SLIM_CLEANUP_PROVIDER_SHUTDOWN_NOT_CONFIRMED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.salesbots WHERE workspace_id=v_workspace AND is_active)
     OR EXISTS (SELECT 1 FROM public.conversation_ai_agents WHERE workspace_id=v_workspace AND enabled)
     OR EXISTS (SELECT 1 FROM public.group_ai_agents WHERE workspace_id=v_workspace AND enabled)
     OR EXISTS (SELECT 1 FROM public.crm_stage_automations WHERE workspace_id=v_workspace AND enabled)
     OR EXISTS (SELECT 1 FROM public.salesbot_runs WHERE workspace_id=v_workspace AND status NOT IN ('finished','error','cancelled','stopped'))
     OR EXISTS (SELECT 1 FROM public.crm_automation_jobs WHERE workspace_id=v_workspace AND status IN ('pending','running'))
     OR EXISTS (SELECT 1 FROM public.slim_audience_campaigns WHERE workspace_id=v_workspace AND status IN ('queued','running'))
     OR EXISTS (SELECT 1 FROM public.slim_audience_deliveries WHERE workspace_id=v_workspace AND status IN ('pending','queued','running'))
     OR EXISTS (SELECT 1 FROM public.slim_stage_move_events WHERE workspace_id=v_workspace AND status IN ('pending','dispatching'))
     OR EXISTS (SELECT 1 FROM private.slim_copilot_proposals WHERE workspace_id=v_workspace AND status IN ('pending','executing')) THEN
    RAISE EXCEPTION 'SLIM_CLEANUP_ACTIVE_AUTOMATION';
  END IF;

  -- IDs prove precisely which source/stage is extra; the initial structure remains usable.
  IF (SELECT count(*) FROM public.crm_sources WHERE workspace_id=v_workspace)<>2
     OR NOT EXISTS (SELECT 1 FROM public.crm_sources
                    WHERE workspace_id=v_workspace AND id=v_source AND is_default AND provider='manual')
     OR NOT EXISTS (SELECT 1 FROM public.crm_sources
                    WHERE workspace_id=v_workspace AND id=v_extra_source AND NOT is_default)
     OR (SELECT count(*) FROM public.pipelines WHERE workspace_id=v_workspace)<>1
     OR NOT EXISTS (SELECT 1 FROM public.pipelines
                    WHERE workspace_id=v_workspace AND id=v_pipeline AND crm_source_id=v_source)
     OR (SELECT count(*) FROM public.pipeline_stages WHERE workspace_id=v_workspace)<>5
     OR (SELECT count(*) FROM public.pipeline_stages
         WHERE workspace_id=v_workspace AND pipeline_id=v_pipeline AND id=ANY(v_stages))<>4
     OR NOT EXISTS (SELECT 1 FROM public.pipeline_stages
                    WHERE workspace_id=v_workspace AND pipeline_id=v_pipeline AND id=v_extra_stage)
     OR (SELECT count(*) FROM public.product_catalogs WHERE workspace_id=v_workspace)<>1
     OR NOT EXISTS (SELECT 1 FROM public.product_catalogs WHERE workspace_id=v_workspace AND id=v_catalog)
     OR (SELECT count(*) FROM public.crm_source_funnels WHERE workspace_id=v_workspace)<>1
     OR NOT EXISTS (SELECT 1 FROM public.crm_source_funnels
                    WHERE workspace_id=v_workspace AND crm_source_id=v_source AND pipeline_id=v_pipeline) THEN
    RAISE EXCEPTION 'SLIM_CLEANUP_DEFAULT_STRUCTURE_CHANGED';
  END IF;

  -- Empty JSON defaults have no residual session/bot references to clear.
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id=v_workspace
             AND (feature_flags<>'{}'::jsonb OR business_hours<>'{}'::jsonb))
     OR EXISTS (SELECT 1 FROM public.crm_sources WHERE id=v_source AND external_account_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.pipelines WHERE id=v_pipeline AND external_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.pipeline_stages WHERE id=ANY(v_stages) AND external_id IS NOT NULL) THEN
    RAISE EXCEPTION 'SLIM_CLEANUP_PRESERVED_CONFIGURATION_CHANGED';
  END IF;

  SELECT jsonb_build_object(
    'source',(SELECT to_jsonb(s) FROM public.crm_sources s WHERE id=v_source),
    'pipeline',(SELECT to_jsonb(p) FROM public.pipelines p WHERE id=v_pipeline),
    'stages',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.pipeline_stages s WHERE id=ANY(v_stages)),
    'catalog',(SELECT to_jsonb(c) FROM public.product_catalogs c WHERE id=v_catalog),
    'source_funnel',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.crm_source_funnels f WHERE workspace_id=v_workspace)
  ) INTO v_structural_before;

  FOREACH v_table IN ARRAY v_delete_tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id=$1',v_table)
      INTO v_count USING v_workspace;
    v_cap := (v_expected_counts->>v_table)::bigint;
    IF v_cap IS NULL OR v_count>v_cap THEN
      RAISE EXCEPTION 'SLIM_CLEANUP_COUNT_EXCEEDS_REVIEW: %',v_table;
    END IF;
    v_before := v_before || jsonb_build_object(v_table,v_count);
  END LOOP;

  -- Check the live FK graph while parents/children are locked. This includes private
  -- credential cascades and catches foreign tenants even for single-column legacy FKs.
  FOR v_fk IN
    SELECT cn.nspname AS child_schema,c.relname AS child_table,
           pn.nspname AS parent_schema,p.relname AS parent_table,
           j.join_condition
    FROM pg_constraint fk
    JOIN pg_class c ON c.oid=fk.conrelid
    JOIN pg_namespace cn ON cn.oid=c.relnamespace
    JOIN pg_class p ON p.oid=fk.confrelid
    JOIN pg_namespace pn ON pn.oid=p.relnamespace
    CROSS JOIN LATERAL (
      SELECT string_agg(format('c.%I=p.%I',ca.attname,pa.attname),' AND ') AS join_condition
      FROM unnest(fk.conkey,fk.confkey) k(child_num,parent_num)
      JOIN pg_attribute ca ON ca.attrelid=c.oid AND ca.attnum=k.child_num
      JOIN pg_attribute pa ON pa.attrelid=p.oid AND pa.attnum=k.parent_num
    ) j
    WHERE fk.contype='f' AND cn.nspname IN ('public','private') AND pn.nspname='public'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='workspace_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=p.oid AND a.attname='workspace_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I c JOIN %I.%I p ON %s WHERE p.workspace_id=$1 AND c.workspace_id IS DISTINCT FROM $1',
      v_fk.child_schema,v_fk.child_table,v_fk.parent_schema,v_fk.parent_table,v_fk.join_condition
    ) INTO v_cross_refs USING v_workspace;
    IF v_cross_refs<>0 THEN
      RAISE EXCEPTION 'SLIM_CLEANUP_CROSS_WORKSPACE_REFERENCE';
    END IF;
    v_checked_fks := v_checked_fks+1;
  END LOOP;

  FOREACH v_table IN ARRAY v_preserve_tables LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text,''|'' ORDER BY to_jsonb(t)::text),'''')) FROM public.%I t WHERE workspace_id=$1',v_table)
      INTO v_hash USING v_workspace;
    v_preserved_hashes := v_preserved_hashes || jsonb_build_object('public.'||v_table,v_hash);
  END LOOP;
  FOREACH v_table IN ARRAY v_private_preserve LOOP
    EXECUTE format('SELECT 1 FROM private.%I WHERE workspace_id=$1 ORDER BY ctid FOR UPDATE',v_table)
      USING v_workspace;
    EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text,''|'' ORDER BY to_jsonb(t)::text),'''')) FROM private.%I t WHERE workspace_id=$1',v_table)
      INTO v_hash USING v_workspace;
    v_preserved_hashes := v_preserved_hashes || jsonb_build_object('private.'||v_table,v_hash);
  END LOOP;

  -- All mutations begin only after every authorization, count, dependency and idle guard.
  FOREACH v_table IN ARRAY v_delete_tables LOOP
    EXECUTE format('DELETE FROM public.%I WHERE workspace_id=$1',v_table) USING v_workspace;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted>(v_before->>v_table)::bigint THEN
      RAISE EXCEPTION 'SLIM_CLEANUP_UNEXPECTED_DELETE_COUNT: %',v_table;
    END IF;
    v_receipt := v_receipt || jsonb_build_object(v_table,v_deleted);
  END LOOP;

  DELETE FROM public.pipeline_stages WHERE workspace_id=v_workspace AND id=v_extra_stage;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted<>1 THEN RAISE EXCEPTION 'SLIM_CLEANUP_EXTRA_STAGE_NOT_REMOVED'; END IF;
  v_receipt := v_receipt || jsonb_build_object('pipeline_stages',v_deleted);
  DELETE FROM public.crm_sources WHERE workspace_id=v_workspace AND id=v_extra_source;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted<>1 THEN RAISE EXCEPTION 'SLIM_CLEANUP_EXTRA_SOURCE_NOT_REMOVED'; END IF;
  v_receipt := v_receipt || jsonb_build_object('crm_sources',v_deleted);

  FOREACH v_table IN ARRAY v_delete_tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id=$1',v_table)
      INTO v_count USING v_workspace;
    IF v_count<>0 THEN RAISE EXCEPTION 'SLIM_CLEANUP_RESIDUAL_ROWS: %',v_table; END IF;
    v_after := v_after || jsonb_build_object(v_table,v_count);
  END LOOP;
  IF EXISTS (SELECT 1 FROM private.integration_credentials WHERE workspace_id=v_workspace) THEN
    RAISE EXCEPTION 'SLIM_CLEANUP_RESIDUAL_INTEGRATION_CREDENTIALS';
  END IF;

  SELECT jsonb_build_object(
    'source',(SELECT to_jsonb(s) FROM public.crm_sources s WHERE id=v_source),
    'pipeline',(SELECT to_jsonb(p) FROM public.pipelines p WHERE id=v_pipeline),
    'stages',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.pipeline_stages s WHERE id=ANY(v_stages)),
    'catalog',(SELECT to_jsonb(c) FROM public.product_catalogs c WHERE id=v_catalog),
    'source_funnel',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.crm_source_funnels f WHERE workspace_id=v_workspace)
  ) INTO v_structural_after;
  IF v_structural_after IS DISTINCT FROM v_structural_before
     OR (SELECT count(*) FROM public.crm_sources WHERE workspace_id=v_workspace)<>1
     OR (SELECT count(*) FROM public.pipeline_stages WHERE workspace_id=v_workspace)<>4
     OR (SELECT md5(to_jsonb(w)::text) FROM public.workspaces w WHERE id=v_workspace) IS DISTINCT FROM v_workspace_hash
     OR (SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'|' ORDER BY p.id),'')) FROM public.profiles p WHERE id=ANY(v_admins)) IS DISTINCT FROM v_profiles_hash THEN
    RAISE EXCEPTION 'SLIM_CLEANUP_PRESERVED_STRUCTURE_CHANGED';
  END IF;

  FOREACH v_schema IN ARRAY ARRAY['public','private'] LOOP
    FOREACH v_table IN ARRAY CASE WHEN v_schema='public' THEN v_preserve_tables ELSE v_private_preserve END LOOP
      EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text,''|'' ORDER BY to_jsonb(t)::text),'''')) FROM %I.%I t WHERE workspace_id=$1',v_schema,v_table)
        INTO v_hash USING v_workspace;
      IF v_hash IS DISTINCT FROM v_preserved_hashes->>(v_schema||'.'||v_table) THEN
        RAISE EXCEPTION 'SLIM_CLEANUP_ACCESS_OR_LEDGER_CHANGED: %.%',v_schema,v_table;
      END IF;
    END LOOP;
  END LOOP;

  PERFORM pg_catalog.set_config('slim.handoff_cleanup_receipt',
    jsonb_build_object(
      'operation','SLIM-HANDOFF-20261018',
      'workspace_id',v_workspace,
      'verified_at',clock_timestamp(),
      'before_counts',v_before,
      'deleted_counts',v_receipt,
      'after_counts',v_after,
      'foreign_key_relationships_checked',v_checked_fks,
      'admins_preserved',2,
      'all_memberships_preserved',true,
      'default_pipeline_preserved',true,
      'default_stages_preserved',4,
      'default_source_preserved',true,
      'default_catalog_preserved',true,
      'organizational_sectors_preserved',true,
      'private_security_ledgers_preserved',true,
      'storage_cleanup_is_separate',true
    )::text,false);
END;
$cleanup$;
COMMIT;

-- The connector exposes the last result set. This executes after a successful COMMIT.
SELECT jsonb_build_object(
  'committed',true,
  'receipt',current_setting('slim.handoff_cleanup_receipt',true)::jsonb
) AS cleanup_result;

