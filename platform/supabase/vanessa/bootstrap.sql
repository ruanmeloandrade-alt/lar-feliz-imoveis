-- Schema-only baseline for the exclusive Vanessa project. Fresh destination only.
-- No source/customer rows, auth identities, media, passwords or API keys.
-- 01-extensions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE SCHEMA IF NOT EXISTS private;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA private TO authenticated,service_role;
CREATE TYPE "public"."ai_agent_mode" AS ENUM ('consultor','gestor');
CREATE TYPE "public"."ai_agent_module" AS ENUM ('gestor_trafego','kommo_manager','salesbot','inbox','dashboard','social_media','strategist','support_robot');
CREATE TYPE "public"."app_role" AS ENUM ('super_admin','user');

COMMIT;
SELECT '01-extensions.sql' AS migration_batch,'OK' AS result;


-- 02-tables.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE TABLE IF NOT EXISTS "private"."bcpll_platform_support"(
"user_id" uuid NOT NULL,
"can_edit_tutorials" boolean DEFAULT false NOT NULL
);
ALTER TABLE "private"."bcpll_platform_support" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."bcpll_platform_support" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "private"."bcpll_support_context"(
"user_id" uuid NOT NULL,
"workspace_id" uuid NOT NULL
);
ALTER TABLE "private"."bcpll_support_context" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."bcpll_support_context" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "private"."integration_credentials"(
"integration_id" uuid NOT NULL,
"workspace_id" uuid NOT NULL,
"ciphertext" bytea NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "private"."integration_credentials" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."integration_credentials" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "private"."slim_copilot_proposal_audit"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"proposal_id" uuid NOT NULL,
"workspace_id" uuid NOT NULL,
"actor_id" uuid,
"event" text NOT NULL,
"from_status" text,
"to_status" text NOT NULL,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
ALTER TABLE "private"."slim_copilot_proposal_audit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."slim_copilot_proposal_audit" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "private"."slim_copilot_proposals"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"actor_id" uuid NOT NULL,
"request_id" uuid NOT NULL,
"version" uuid DEFAULT gen_random_uuid() NOT NULL,
"kind" text NOT NULL,
"status" text DEFAULT 'pending'::text NOT NULL,
"request_sha256" text NOT NULL,
"payload" jsonb NOT NULL,
"snapshot" jsonb NOT NULL,
"preview" jsonb NOT NULL,
"result" jsonb,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
"expires_at" timestamp with time zone DEFAULT (clock_timestamp() + '00:15:00'::interval) NOT NULL,
"decided_at" timestamp with time zone,
"decided_by" uuid,
"decision" text,
"claim_token" uuid,
"claimed_at" timestamp with time zone,
"finished_at" timestamp with time zone,
"final_outcome_sha256" text
);
ALTER TABLE "private"."slim_copilot_proposals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."slim_copilot_proposals" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "private"."slim_funnel_write_requests"(
"workspace_id" uuid NOT NULL,
"request_id" uuid NOT NULL,
"actor_id" uuid NOT NULL,
"operation" text NOT NULL,
"request_fingerprint" text NOT NULL,
"response" jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
ALTER TABLE "private"."slim_funnel_write_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."slim_funnel_write_requests" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "private"."slim_invitation_requests"(
"request_id" uuid NOT NULL,
"workspace_id" uuid NOT NULL,
"actor_id" uuid NOT NULL,
"action" text NOT NULL,
"target_id" uuid,
"payload_hash" text,
"expected_fingerprint" text,
"receipt" jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
ALTER TABLE "private"."slim_invitation_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."slim_invitation_requests" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."ai_agent_conversations"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"module" ai_agent_module NOT NULL,
"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
"last_message_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."ai_agent_conversations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."ai_agent_conversations" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."ai_agent_settings"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"module" ai_agent_module NOT NULL,
"mode" ai_agent_mode DEFAULT 'consultor'::ai_agent_mode NOT NULL,
"system_prompt_extra" text,
"updated_by" uuid DEFAULT auth.uid(),
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."ai_agent_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."ai_agent_settings" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."ai_brain_blocked_terms"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"term" text NOT NULL,
"enabled" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."ai_brain_blocked_terms" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."ai_brain_blocked_terms" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."ai_brain_chunks"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"source_id" uuid NOT NULL,
"workspace_id" uuid NOT NULL,
"chunk_index" integer NOT NULL,
"content" text NOT NULL,
"embedding" vector(1536),
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."ai_brain_chunks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."ai_brain_chunks" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."ai_brain_sources"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"title" text NOT NULL,
"source_type" text NOT NULL,
"content" text DEFAULT ''::text NOT NULL,
"url" text,
"storage_path" text,
"file_name" text,
"enabled" boolean DEFAULT true NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_by" uuid DEFAULT auth.uid() NOT NULL
);
ALTER TABLE "public"."ai_brain_sources" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."ai_brain_sources" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."bcpll_email_campaigns"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"subject" text NOT NULL,
"body_text" text NOT NULL,
"status" text DEFAULT 'draft'::text NOT NULL,
"request_id" uuid NOT NULL,
"fingerprint" text NOT NULL,
"created_by" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."bcpll_email_campaigns" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."bcpll_email_campaigns" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."bcpll_email_outbox"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"campaign_id" uuid,
"lead_id" uuid,
"to_email" text NOT NULL,
"subject" text NOT NULL,
"body_text" text NOT NULL,
"status" text NOT NULL,
"idempotency_key" text NOT NULL,
"provider_message_id" text,
"last_error" text,
"claimed_at" timestamp with time zone,
"sent_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."bcpll_email_outbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."bcpll_email_outbox" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."bcpll_email_stage_rules"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"stage_id" uuid NOT NULL,
"template_id" uuid NOT NULL,
"enabled" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."bcpll_email_stage_rules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."bcpll_email_stage_rules" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."bcpll_email_templates"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"subject" text NOT NULL,
"body_text" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."bcpll_email_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."bcpll_email_templates" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."bcpll_tutorial_lessons"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"module_id" uuid NOT NULL,
"title" text NOT NULL,
"video_id" text NOT NULL,
"position" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."bcpll_tutorial_lessons" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."bcpll_tutorial_lessons" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."bcpll_tutorial_modules"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"title" text NOT NULL,
"position" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."bcpll_tutorial_modules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."bcpll_tutorial_modules" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."bcpll_utm_links"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"destination_url" text NOT NULL,
"utm_source" text NOT NULL,
"utm_medium" text NOT NULL,
"utm_campaign" text NOT NULL,
"utm_content" text DEFAULT ''::text NOT NULL,
"utm_term" text DEFAULT ''::text NOT NULL,
"final_url" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."bcpll_utm_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."bcpll_utm_links" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."bcpll_workspaces"(
"workspace_id" uuid NOT NULL,
"owner_id" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."bcpll_workspaces" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."bcpll_workspaces" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."companies"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"crm_source_id" uuid,
"name" text NOT NULL,
"site" text,
"notes" text,
"phone" text,
"cnpj" text,
"logo_url" text,
"responsible_id" uuid,
"primary_lead_id" uuid,
"external_id" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."companies" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."conversation_agent_runs"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"agent_id" uuid NOT NULL,
"lead_id" uuid,
"channel" text,
"interactions_count" integer DEFAULT 0 NOT NULL,
"objective_reached" boolean DEFAULT false NOT NULL,
"objective_reached_at" timestamp with time zone,
"started_at" timestamp with time zone DEFAULT now() NOT NULL,
"last_message_at" timestamp with time zone,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."conversation_agent_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."conversation_agent_runs" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."conversation_ai_agents"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"persona" text,
"system_prompt" text,
"model" text DEFAULT 'openai/gpt-4o-mini'::text NOT NULL,
"temperature" numeric DEFAULT 0.7 NOT NULL,
"max_tokens" integer DEFAULT 1024 NOT NULL,
"cooldown_seconds" integer DEFAULT 15 NOT NULL,
"enabled" boolean DEFAULT false NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."conversation_ai_agents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."conversation_ai_agents" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."crm_automation_jobs"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"lead_id" uuid NOT NULL,
"pipeline_id" uuid,
"stage_id" uuid,
"action_id" text NOT NULL,
"action" jsonb NOT NULL,
"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
"status" text DEFAULT 'pending'::text NOT NULL,
"due_at" timestamp with time zone DEFAULT now() NOT NULL,
"executed_at" timestamp with time zone,
"started_at" timestamp with time zone,
"attempts" integer DEFAULT 0 NOT NULL,
"last_error" text,
"dedupe_key" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_automation_jobs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."crm_automation_jobs" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."crm_form_submissions"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"form_id" uuid NOT NULL,
"lead_id" uuid,
"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_form_submissions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."crm_form_submissions" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."crm_forms"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"slug" text NOT NULL,
"nome" text NOT NULL,
"descricao" text,
"campos" jsonb DEFAULT '[]'::jsonb NOT NULL,
"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
"origem" text DEFAULT 'mkton'::text NOT NULL,
"ingest_token" text,
"meta_form_id" text,
"meta_page_id" text,
"auto_criar_lead" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_forms" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."crm_forms" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."crm_lead_audiences"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"description" text,
"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
"cached_count" integer,
"cached_at" timestamp with time zone,
"meta_audience_id" uuid,
"last_synced_at" timestamp with time zone,
"created_by" uuid DEFAULT auth.uid(),
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_lead_audiences" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."crm_lead_audiences" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."crm_source_funnels"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"crm_source_id" uuid NOT NULL,
"pipeline_id" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_source_funnels" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."crm_source_funnels" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."crm_sources"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"provider" text DEFAULT 'manual'::text NOT NULL,
"display_name" text NOT NULL,
"external_account_id" text,
"is_default" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_sources" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."crm_sources" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."crm_stage_automations"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"pipeline_id" uuid NOT NULL,
"stage_id" uuid NOT NULL,
"action_id" text NOT NULL,
"action" jsonb NOT NULL,
"enabled" boolean DEFAULT true NOT NULL,
"position" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_stage_automations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."crm_stage_automations" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."group_ai_agents"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"persona" text,
"system_prompt" text,
"model" text DEFAULT 'openai/gpt-5.5'::text NOT NULL,
"temperature" numeric DEFAULT 0.7 NOT NULL,
"max_tokens" integer DEFAULT 1024 NOT NULL,
"cooldown_seconds" integer DEFAULT 30 NOT NULL,
"respond_only_when_mentioned" boolean DEFAULT true NOT NULL,
"enabled" boolean DEFAULT true NOT NULL,
"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
"metadata" jsonb DEFAULT '{"settings": {"mode": "prompt"}}'::jsonb NOT NULL,
"creation_request_id" uuid NOT NULL,
"creation_payload" jsonb NOT NULL,
"created_by" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
ALTER TABLE "public"."group_ai_agents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."group_ai_agents" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."inbox_label_assignments"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"label_id" uuid NOT NULL,
"thread_ref" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."inbox_label_assignments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."inbox_label_assignments" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."inbox_labels"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"group_name" text DEFAULT 'Geral'::text NOT NULL,
"name" text NOT NULL,
"color" text DEFAULT '#14b8a6'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."inbox_labels" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."inbox_labels" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."integrations"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"provider" text NOT NULL,
"status" text DEFAULT 'disconnected'::text NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"credentials_encrypted" text,
"expires_at" timestamp with time zone,
"last_check_at" timestamp with time zone,
"last_error" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."integrations" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."lead_activities"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"lead_id" uuid NOT NULL,
"type" text NOT NULL,
"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."lead_activities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."lead_activities" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."lead_custom_field_values"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"lead_id" uuid NOT NULL,
"field_id" uuid NOT NULL,
"value" jsonb,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."lead_custom_field_values" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."lead_custom_field_values" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."lead_custom_fields"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"field_type" text DEFAULT 'text'::text NOT NULL,
"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
"funnel_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"required" boolean DEFAULT false NOT NULL,
"unique_value" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."lead_custom_fields" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."lead_custom_fields" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."lead_dedupe_dismissals"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"signature" text NOT NULL,
"dismissed_by" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."lead_dedupe_dismissals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."lead_dedupe_dismissals" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."lead_products"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"lead_id" uuid NOT NULL,
"product_id" uuid NOT NULL,
"kind" text DEFAULT 'interesse'::text NOT NULL,
"quantity" numeric(12,2) DEFAULT 1 NOT NULL,
"unit_price" numeric(14,2),
"sold_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."lead_products" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."lead_products" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."leads"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"crm_source_id" uuid,
"pipeline_id" uuid,
"stage_id" uuid,
"company_id" uuid,
"name" text NOT NULL,
"email" text,
"phone" text,
"phone_normalized" text,
"value" numeric(14,2) DEFAULT 0,
"status" text DEFAULT 'active'::text NOT NULL,
"conversation_status" text DEFAULT 'open'::text NOT NULL,
"responsible_id" uuid,
"external_id" text,
"external_updated_at" timestamp with time zone,
"last_message_from" text,
"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
"custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
"source" text,
"ai_paused" boolean DEFAULT false NOT NULL,
"keep_files" boolean DEFAULT false NOT NULL,
"fb_external_id" text,
"fb_event_id" text,
"fb_fbc" text,
"fb_fbp" text,
"fb_client_ip" text,
"fb_client_ua" text,
"messenger_psid" text,
"instagram_igsid" text,
"merged_into_id" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"active_conversation_agent_id" uuid,
"active_conversation_agent_version" bigint DEFAULT 0 NOT NULL,
"active_conversation_agent_started_at" timestamp with time zone
);
ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."leads" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."marcos_tutorial_lessons"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"module_id" uuid NOT NULL,
"title" text NOT NULL,
"video_id" text NOT NULL,
"position" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."marcos_tutorial_lessons" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."marcos_tutorial_lessons" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."marcos_tutorial_modules"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"title" text NOT NULL,
"position" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."marcos_tutorial_modules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."marcos_tutorial_modules" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."module_permissions"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMIT;
SELECT '02-tables.sql' AS migration_batch,'OK' AS result;


-- 03-tables.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
REVOKE ALL ON "public"."module_permissions" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."permission_templates"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
"sector_id" uuid,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."permission_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."permission_templates" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."pipeline_stages"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"pipeline_id" uuid NOT NULL,
"name" text NOT NULL,
"description" text,
"position" integer DEFAULT 0 NOT NULL,
"color" text,
"external_id" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."pipeline_stages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."pipeline_stages" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."pipelines"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"crm_source_id" uuid,
"name" text NOT NULL,
"position" integer DEFAULT 0 NOT NULL,
"external_id" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."pipelines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."pipelines" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."product_catalogs"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"description" text DEFAULT ''::text NOT NULL,
"cover" text DEFAULT ''::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."product_catalogs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."product_catalogs" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."products"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"catalog_id" uuid NOT NULL,
"sku" text DEFAULT ''::text NOT NULL,
"name" text NOT NULL,
"description" text DEFAULT ''::text NOT NULL,
"image" text DEFAULT ''::text NOT NULL,
"price" numeric(14,2) DEFAULT 0 NOT NULL,
"promo_price" numeric(14,2),
"stock" integer DEFAULT 0 NOT NULL,
"category" text DEFAULT ''::text NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"cost_price" numeric,
"minimum_stock" integer,
"unit" text,
"stock_known" boolean DEFAULT true NOT NULL,
"import_snapshot" jsonb
);
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."products" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."profiles"(
"id" uuid NOT NULL,
"display_name" text,
"full_name" text,
"avatar_url" text,
"current_workspace_id" uuid,
"timezone" text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
"whatsapp_primary" text,
"whatsapp_secondary" text,
"phone_alt" text,
"preferred_contact" text,
"job_title" text,
"role_in_company" text,
"company_name" text,
"company_size" text,
"niche" text,
"city" text,
"state" text,
"country" text,
"website_url" text,
"instagram_handle" text,
"linkedin_url" text,
"acquisition_source" text,
"internal_notes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"cpf" text,
"birth_date" date,
"bio" text
);
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."profiles" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."salesbot_blocks"(
"id" uuid NOT NULL,
"salesbot_id" uuid NOT NULL,
"workspace_id" uuid NOT NULL,
"local_id" text NOT NULL,
"type" text NOT NULL,
"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
"position_x" integer DEFAULT 0 NOT NULL,
"position_y" integer DEFAULT 0 NOT NULL,
"next_block_id" uuid
);
ALTER TABLE "public"."salesbot_blocks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."salesbot_blocks" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."salesbot_revisions"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"salesbot_id" uuid NOT NULL,
"revision" integer NOT NULL,
"source_event" text,
"actor_user_id" uuid,
"request_id" uuid,
"created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."salesbot_revisions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."salesbot_revisions" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."salesbot_round_robin_state"(
"block_id" uuid NOT NULL,
"counter" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."salesbot_round_robin_state" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."salesbot_round_robin_state" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."salesbot_run_logs"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"salesbot_run_id" uuid NOT NULL,
"block_id" uuid,
"status" text NOT NULL,
"message" text,
"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."salesbot_run_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."salesbot_run_logs" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."salesbot_runs"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"salesbot_id" uuid NOT NULL,
"lead_id" uuid NOT NULL,
"current_block_id" uuid,
"status" text DEFAULT 'running'::text NOT NULL,
"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
"waiting_until" timestamp with time zone,
"started_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"finished_at" timestamp with time zone,
"last_error" text,
"request_id" uuid,
"actor_user_id" uuid,
"stopped_at" timestamp with time zone,
"stopped_by" uuid
);
ALTER TABLE "public"."salesbot_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."salesbot_runs" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."salesbots"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"local_id" text NOT NULL,
"name" text NOT NULL,
"trigger" text,
"is_active" boolean DEFAULT false NOT NULL,
"gatilhos" jsonb DEFAULT '[]'::jsonb NOT NULL,
"scope" text DEFAULT 'individual'::text NOT NULL,
"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
"revision" integer DEFAULT 1 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."salesbots" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."salesbots" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."slim_audience_campaigns"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"audience_id" uuid,
"audience_name" text NOT NULL,
"created_by" uuid NOT NULL,
"request_id" uuid NOT NULL,
"request_hash" text NOT NULL,
"kind" text NOT NULL,
"message" text DEFAULT ''::text NOT NULL,
"session_id" uuid,
"agent_id" uuid,
"salesbot_id" uuid,
"delay_ms" integer DEFAULT 1500 NOT NULL,
"delay_seconds" integer DEFAULT 0 NOT NULL,
"status" text DEFAULT 'queued'::text NOT NULL,
"next_due_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"finished_at" timestamp with time zone
);
ALTER TABLE "public"."slim_audience_campaigns" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."slim_audience_campaigns" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."slim_audience_deliveries"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"campaign_id" uuid NOT NULL,
"workspace_id" uuid NOT NULL,
"lead_id" uuid,
"recipient_key" text NOT NULL,
"phone" text,
"name" text,
"status" text DEFAULT 'pending'::text NOT NULL,
"message_id" text,
"last_error" text,
"started_at" timestamp with time zone,
"finished_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"origin_session_id" uuid
);
ALTER TABLE "public"."slim_audience_deliveries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."slim_audience_deliveries" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."slim_checkout_attempt_closures"(
"workspace_id" uuid NOT NULL,
"request_id" uuid NOT NULL,
"actor_id" uuid DEFAULT auth.uid() NOT NULL,
"closed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
ALTER TABLE "public"."slim_checkout_attempt_closures" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."slim_checkout_attempt_closures" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."slim_order_changes"(
"id" uuid NOT NULL,
"workspace_id" uuid NOT NULL,
"actor_id" uuid NOT NULL,
"order_id" uuid NOT NULL,
"operation" text NOT NULL,
"state" text NOT NULL,
"request_payload" jsonb,
"source_fingerprint" text,
"source_snapshot" jsonb,
"source_status" text,
"reason" text,
"replacement_order_id" uuid,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
ALTER TABLE "public"."slim_order_changes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."slim_order_changes" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."slim_order_document_deliveries"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"document_id" uuid NOT NULL,
"request_id" uuid NOT NULL,
"actor_id" uuid NOT NULL,
"session_id" uuid NOT NULL,
"phone" text NOT NULL,
"status" text DEFAULT 'pending'::text NOT NULL,
"message_id" text,
"last_error" text,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
"finished_at" timestamp with time zone,
"consent_sha256" text,
"approved_at" timestamp with time zone
);
ALTER TABLE "public"."slim_order_document_deliveries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."slim_order_document_deliveries" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."slim_order_documents"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"order_id" uuid NOT NULL,
"workspace_id" uuid NOT NULL,
"version" integer DEFAULT 1 NOT NULL,
"sha256" text NOT NULL,
"filename" text NOT NULL,
"pdf_base64" text NOT NULL,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
"requested_by" uuid
);
ALTER TABLE "public"."slim_order_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."slim_order_documents" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."slim_orders"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"request_id" uuid NOT NULL,
"request_payload" jsonb NOT NULL,
"created_by" uuid NOT NULL,
"customer_id" uuid NOT NULL,
"order_number" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
"status" text DEFAULT 'confirmed'::text NOT NULL,
"subtotal_cents" bigint NOT NULL,
"discount_cents" bigint NOT NULL,
"total_cents" bigint NOT NULL,
"snapshot" jsonb NOT NULL,
"confirmed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
"cancelled_at" timestamp with time zone,
"cancelled_by" uuid,
"cancellation_reason" text,
"legacy_lead_id" uuid,
"shipping_cents" bigint DEFAULT 0 NOT NULL
);
ALTER TABLE "public"."slim_orders" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."slim_orders" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."slim_stage_move_events"(
"id" uuid NOT NULL,
"workspace_id" uuid NOT NULL,
"lead_id" uuid NOT NULL,
"actor_id" uuid NOT NULL,
"from_stage_id" uuid,
"to_stage_id" uuid NOT NULL,
"pipeline_id" uuid NOT NULL,
"status" text DEFAULT 'pending'::text NOT NULL,
"attempts" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
"started_at" timestamp with time zone,
"finished_at" timestamp with time zone,
"last_error" text,
"event_kind" text DEFAULT 'moved'::text NOT NULL
);
ALTER TABLE "public"."slim_stage_move_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."slim_stage_move_events" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."slim_stock_movements"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"order_id" uuid NOT NULL,
"product_id" uuid NOT NULL,
"kind" text NOT NULL,
"quantity" integer NOT NULL,
"balance_after" integer NOT NULL,
"actor_id" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
ALTER TABLE "public"."slim_stock_movements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."slim_stock_movements" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."supplier_product_costs"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"supplier_id" uuid NOT NULL,
"product_id" uuid NOT NULL,
"cost" numeric(12,2) DEFAULT 0 NOT NULL,
"min_quantity" integer DEFAULT 1 NOT NULL,
"lead_time_days" integer,
"notes" text,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."supplier_product_costs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."supplier_product_costs" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."support_robot_messages"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"role" text NOT NULL,
"content" text DEFAULT ''::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."support_robot_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."support_robot_messages" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."tasks"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"lead_id" uuid,
"title" text NOT NULL,
"description" text,
"kind" text DEFAULT 'tarefa'::text NOT NULL,
"status" text DEFAULT 'pendente'::text NOT NULL,
"start_at" timestamp with time zone DEFAULT now() NOT NULL,
"end_at" timestamp with time zone DEFAULT now() NOT NULL,
"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
"location" text,
"meeting_url" text,
"reminder_minutes" integer,
"created_by" uuid DEFAULT auth.uid(),
"external_id" text,
"external_source" text,
"external_sync_status" text DEFAULT 'not_synced'::text NOT NULL,
"external_synced_at" timestamp with time zone,
"external_url" text,
"google_event_id" text,
"google_sync_status" text DEFAULT 'not_synced'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."tasks" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."team_chat_reads"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"conversation_key" text NOT NULL,
"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."team_chat_reads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."team_chat_reads" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."team_messages"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"sector_id" uuid,
"from_user_id" uuid,
"to_user_id" uuid,
"body" text NOT NULL,
"origin" text DEFAULT 'user'::text NOT NULL,
"read_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."team_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."team_messages" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."tracking_conversion_events"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"event_row_id" bigint,
"conversion_id" uuid,
"lead_id" uuid,
"value" numeric DEFAULT 0 NOT NULL,
"currency" text DEFAULT 'BRL'::text NOT NULL,
"utm_source" text,
"utm_campaign" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."tracking_conversion_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."tracking_conversion_events" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."tracking_events"(
"id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
"workspace_id" uuid NOT NULL,
"site_id" uuid,
"event_id" text,
"event_name" text NOT NULL,
"session_id" text,
"visitor_id" text,
"lead_id" uuid,
"source_class" text DEFAULT 'cliente'::text NOT NULL,
"page_path" text,
"page_url" text,
"referrer" text,
"utm_source" text,
"utm_medium" text,
"utm_campaign" text,
"utm_term" text,
"utm_content" text,
"fbclid" text,
"gclid" text,
"value" numeric,
"currency" text DEFAULT 'BRL'::text NOT NULL,
"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."tracking_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."tracking_events" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."tracking_sites"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"domain" text NOT NULL,
"pixel_token" text DEFAULT encode(gen_random_bytes(24), 'hex'::text) NOT NULL,
"verified" boolean DEFAULT false NOT NULL,
"last_event_at" timestamp with time zone,
"events_24h" bigint DEFAULT 0 NOT NULL,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."tracking_sites" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."tracking_sites" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."tutorial_lessons"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"module_id" uuid NOT NULL,
"title" text NOT NULL,
"video_id" text NOT NULL,
"position" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."tutorial_lessons" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."tutorial_lessons" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."tutorial_modules"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"title" text NOT NULL,
"position" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."tutorial_modules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."tutorial_modules" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."user_notification_settings"(
"user_id" uuid NOT NULL,
"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
"matrix" jsonb DEFAULT '{}'::jsonb NOT NULL,
"digest" jsonb DEFAULT '{}'::jsonb NOT NULL,
"quiet" jsonb DEFAULT '{}'::jsonb NOT NULL,
"sound" boolean DEFAULT true NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."user_notification_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."user_notification_settings" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."user_permissions"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
"updated_by" uuid,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."user_permissions" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."user_roles"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"role" app_role NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."user_roles" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."user_sessions"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"device_key" text NOT NULL,
"browser" text,
"os" text,
"device_type" text,
"ip_address" text,
"current_path" text,
"user_agent" text,
"started_at" timestamp with time zone DEFAULT now() NOT NULL,
"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
"revoked_at" timestamp with time zone
);
ALTER TABLE "public"."user_sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."user_sessions" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."whatsapp_groups"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"session_id" uuid NOT NULL,
"group_jid" text NOT NULL,
"name" text,
"subject" text,
"description" text,
"picture_url" text,
"participants_count" integer DEFAULT 0 NOT NULL,
"is_admin" boolean DEFAULT false NOT NULL,
"is_announce" boolean DEFAULT false NOT NULL,
"invite_code" text,
"active_bot_id" uuid,
"active_ai_agent_id" uuid,
"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"last_synced_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."whatsapp_groups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."whatsapp_groups" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."whatsapp_web_messages"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"session_id" uuid NOT NULL,
"remote_jid" text,
"to_jid" text,
"message_id" text NOT NULL,
"from_me" boolean DEFAULT false NOT NULL,
"sender_name" text,
"sender_phone" text,
"message_type" text DEFAULT 'text'::text NOT NULL,
"body" text,
"media_url" text,
"delivery_status" text,
"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
"received_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."whatsapp_web_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."whatsapp_web_messages" FROM PUBLIC,anon,authenticated;

COMMIT;
SELECT '03-tables.sql' AS migration_batch,'OK' AS result;


-- 04-tables.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE TABLE IF NOT EXISTS "public"."whatsapp_web_sessions"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"provider" text DEFAULT 'evolution'::text NOT NULL,
"instance_id" text NOT NULL,
"token_encrypted" bytea NOT NULL,
"webhook_secret" text NOT NULL,
"status" text DEFAULT 'configurando'::text NOT NULL,
"phone_number" text,
"last_qr" text,
"last_connected_at" timestamp with time zone,
"last_disconnected_at" timestamp with time zone,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."whatsapp_web_sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."whatsapp_web_sessions" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."workflow_sector_members"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"sector_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."workflow_sector_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."workflow_sector_members" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."workflow_sectors"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"color" text DEFAULT '#6366f1'::text NOT NULL,
"position" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."workflow_sectors" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."workflow_sectors" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."workspace_invitations"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"email" text NOT NULL,
"role_type" text DEFAULT 'funcionario'::text NOT NULL,
"is_partner" boolean DEFAULT false NOT NULL,
"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
"access_days" integer,
"status" text DEFAULT 'pending'::text NOT NULL,
"token" uuid DEFAULT gen_random_uuid() NOT NULL,
"invited_by" uuid,
"expires_at" timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"access_role" text,
"accepted_at" timestamp with time zone,
"accepted_by" uuid
);
ALTER TABLE "public"."workspace_invitations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."workspace_invitations" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."workspace_members"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"role" text DEFAULT 'member'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"role_type" text DEFAULT 'funcionario'::text NOT NULL,
"is_partner" boolean DEFAULT false NOT NULL,
"access_expires_at" timestamp with time zone
);
ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."workspace_members" FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS "public"."workspaces"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"slug" text NOT NULL,
"name" text NOT NULL,
"site_url" text,
"owner_id" uuid NOT NULL,
"feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"default_currency" text DEFAULT 'BRL'::text NOT NULL,
"business_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
"legal_name" text,
"cnpj" text,
"logo_path" text,
"phone" text,
"contact_email" text,
"industry" text,
"description" text,
"instagram_handle" text,
"legal_representative" text,
"address_zip" text,
"address_street" text,
"address_number" text,
"address_complement" text,
"address_district" text,
"address_city" text,
"address_state" text,
"address_country" text
);
ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."workspaces" FROM PUBLIC,anon,authenticated;

COMMIT;
SELECT '04-tables.sql' AS migration_batch,'OK' AS result;


-- 05-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.bcpll_email_rule_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.pipeline_stages WHERE id=NEW.stage_id AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Etapa não pertence a este workspace.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.bcpll_email_rule_scope() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_email_stage_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE rule record;
BEGIN
 IF OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id OR NOT private.bcpll_is_workspace(NEW.workspace_id) OR coalesce(NEW.email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RETURN NEW; END IF;
 FOR rule IN SELECT r.id,t.subject,t.body_text FROM public.bcpll_email_stage_rules r JOIN public.bcpll_email_templates t ON t.id=r.template_id AND t.workspace_id=r.workspace_id WHERE r.workspace_id=NEW.workspace_id AND r.stage_id=NEW.stage_id AND r.enabled LOOP
  INSERT INTO public.bcpll_email_outbox(workspace_id,lead_id,to_email,subject,body_text,status,idempotency_key)
   VALUES(NEW.workspace_id,NEW.id,lower(trim(NEW.email)),replace(replace(rule.subject,'{{nome}}',NEW.name),'{{email}}',NEW.email),replace(replace(rule.body_text,'{{nome}}',NEW.name),'{{email}}',NEW.email),'queued','stage:'||rule.id::text||':'||NEW.id::text||':'||txid_current()::text)
   ON CONFLICT(workspace_id,idempotency_key) DO NOTHING;
 END LOOP;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.bcpll_email_stage_event() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_guard_seats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE owner_user uuid; used integer;
BEGIN
 IF NOT private.bcpll_is_workspace(NEW.workspace_id) THEN RETURN NEW; END IF;
 SELECT owner_id INTO owner_user FROM public.workspaces WHERE id=NEW.workspace_id FOR UPDATE;
 IF NEW.user_id=owner_user THEN RETURN NEW; END IF;
 IF NEW.role='owner' OR NEW.role_type='owner' THEN RAISE EXCEPTION 'Somente o titular pode ser proprietário.' USING ERRCODE='42501'; END IF;
 IF private.bcpll_is_platform_support(NEW.user_id) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.bcpll_workspaces WHERE owner_id=NEW.user_id)
  OR EXISTS(SELECT 1 FROM public.workspace_members m JOIN public.bcpll_workspaces b ON b.workspace_id=m.workspace_id
   WHERE m.user_id=NEW.user_id AND m.workspace_id<>NEW.workspace_id) THEN
  RAISE EXCEPTION 'Esta conta já pertence a outro workspace BCPLL.' USING ERRCODE='42501';
 END IF;
 SELECT count(*) INTO used FROM public.workspace_members
  WHERE workspace_id=NEW.workspace_id AND user_id<>owner_user AND user_id<>NEW.user_id
   AND NOT private.bcpll_is_platform_support(user_id);
 IF used>=4 THEN RAISE EXCEPTION 'Limite de 4 contas de suporte atingido. Remova um suporte para liberar uma vaga.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.bcpll_guard_seats() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_is_platform_support(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM private.bcpll_platform_support WHERE user_id=_user_id);
$function$
;
REVOKE ALL ON FUNCTION private.bcpll_is_platform_support(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_is_workspace(_workspace uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.bcpll_workspaces WHERE workspace_id=_workspace);
$function$
;
REVOKE ALL ON FUNCTION private.bcpll_is_workspace(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_onboard_user(_user uuid, _email text, _metadata jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE display text; ws uuid;
BEGIN
 -- This transaction setting is set only by the private provisioner, never JWT metadata.
 IF current_setting('bcpll.provisioning',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Cadastro BCPLL restrito ao provisionamento interno.' USING ERRCODE='42501';
 END IF;
 display:=left(trim(_metadata->>'full_name'),100);
 INSERT INTO public.profiles(id,display_name,full_name) VALUES(_user,display,display);
 IF nullif(_metadata->>'support_workspace','') IS NOT NULL THEN
  ws:=(_metadata->>'support_workspace')::uuid;
  IF NOT private.bcpll_is_workspace(ws) THEN RAISE EXCEPTION 'Workspace de suporte inválido.' USING ERRCODE='42501'; END IF;
  INSERT INTO public.workspace_members(workspace_id,user_id,role,role_type,is_partner)
   VALUES(ws,_user,'member','funcionario',false);
  UPDATE public.profiles SET current_workspace_id=ws WHERE id=_user;
  RETURN;
 END IF;
 INSERT INTO public.workspaces(slug,name,owner_id)
  VALUES('bcpll-'||_user::text,'BCPLL · '||display,_user) RETURNING id INTO ws;
 INSERT INTO public.bcpll_workspaces(workspace_id,owner_id) VALUES(ws,_user);
 INSERT INTO public.workspace_members(workspace_id,user_id,role,role_type,is_partner)
  VALUES(ws,_user,'owner','owner',false);
 UPDATE public.profiles SET current_workspace_id=ws WHERE id=_user;
 UPDATE public.crm_sources SET display_name='BCPLL' WHERE workspace_id=ws;
 UPDATE public.pipelines SET name='Atendimento' WHERE workspace_id=ws;
 UPDATE public.pipeline_stages SET name=CASE position WHEN 1 THEN 'Novo atendimento' WHEN 2 THEN 'Em atendimento' WHEN 3 THEN 'Contratado' WHEN 4 THEN 'Encerrado' ELSE name END,
  color=CASE position WHEN 1 THEN '#c0c0c0' WHEN 2 THEN '#550000' WHEN 3 THEN '#737373' WHEN 4 THEN '#242424' ELSE color END WHERE workspace_id=ws;
 UPDATE public.product_catalogs SET name='Catálogo principal',description='Produtos e serviços deste workspace' WHERE workspace_id=ws;
END;$function$
;
REVOKE ALL ON FUNCTION private.bcpll_onboard_user(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_protect_platform_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NOT NULL AND private.bcpll_is_workspace(OLD.workspace_id)
  AND private.bcpll_is_platform_support(OLD.user_id) THEN
  RAISE EXCEPTION 'Acesso de suporte da plataforma é administrado internamente.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.bcpll_protect_platform_membership() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_provision_account(_email text, _password text, _full_name text, _support_ws uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE email_key text:=lower(trim(_email)); actor uuid:=gen_random_uuid(); previous text:=current_setting('bcpll.provisioning',true); ws uuid;
BEGIN
 IF email_key IS NULL OR length(email_key)>200 OR email_key !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Informe um e-mail válido.' USING ERRCODE='22023'; END IF;
 IF _full_name IS NULL OR length(trim(_full_name))<2 OR length(trim(_full_name))>100 THEN RAISE EXCEPTION 'Informe um nome entre 2 e 100 caracteres.' USING ERRCODE='22023'; END IF;
 IF _password IS NULL OR length(_password)<8 OR octet_length(_password)>72 THEN RAISE EXCEPTION 'Use uma senha com pelo menos 8 caracteres e até 72 bytes.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=email_key) THEN RAISE EXCEPTION 'Este e-mail já possui uma conta. Use outro e-mail; nenhuma senha ou vínculo existente foi alterado.' USING ERRCODE='23505'; END IF;
 PERFORM set_config('bcpll.provisioning','true',true);
 INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,created_at,updated_at)
 VALUES(actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email_key,
  extensions.crypt(_password,extensions.gen_salt('bf',10)),clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('signup_source','bcpll','full_name',trim(_full_name),'display_name',trim(_full_name),'email_verified',true,'support_workspace',_support_ws),
  '','','','','',clock_timestamp(),clock_timestamp());
 PERFORM set_config('bcpll.provisioning',coalesce(previous,''),true);
 INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
 VALUES(actor::text,actor,jsonb_build_object('sub',actor::text,'email',email_key,'email_verified',true),'email',clock_timestamp(),clock_timestamp());
 SELECT current_workspace_id INTO ws FROM public.profiles WHERE id=actor;
 RETURN jsonb_build_object('userId',actor,'workspaceId',ws,'email',email_key);
END;$function$
;
REVOKE ALL ON FUNCTION private.bcpll_provision_account(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_support_workspace_allowed(_workspace_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_session_security_allowed()
  OR NOT private.bcpll_is_platform_support(auth.uid())
  OR NOT private.bcpll_is_workspace(_workspace_id)
  OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN RETURN false; END IF;
 RETURN public.bcpll_current_workspace()=_workspace_id;
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END;$function$
;
REVOKE ALL ON FUNCTION private.bcpll_support_workspace_allowed(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_sync_platform_support()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_TABLE_NAME='bcpll_platform_support' THEN
  IF TG_OP='DELETE' THEN
   DELETE FROM public.workspace_members m USING public.bcpll_workspaces b
    WHERE m.workspace_id=b.workspace_id AND m.user_id=OLD.user_id AND m.user_id<>b.owner_id;
   RETURN OLD;
  END IF;
  IF EXISTS(SELECT 1 FROM public.bcpll_workspaces WHERE owner_id=NEW.user_id) THEN
   RAISE EXCEPTION 'Suporte da plataforma deve usar uma conta independente de titular.';
  END IF;
  INSERT INTO public.workspace_members(workspace_id,user_id,role,role_type)
   SELECT workspace_id,NEW.user_id,'admin','admin' FROM public.bcpll_workspaces
   ON CONFLICT(workspace_id,user_id) DO NOTHING;
 ELSE
  INSERT INTO public.workspace_members(workspace_id,user_id,role,role_type)
   SELECT NEW.workspace_id,user_id,'admin','admin' FROM private.bcpll_platform_support
   ON CONFLICT(workspace_id,user_id) DO NOTHING;
 END IF;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.bcpll_sync_platform_support() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bcpll_tutorial_access(_edit boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_session_security_allowed() THEN RETURN false; END IF;
 IF _edit THEN
  RETURN EXISTS(SELECT 1 FROM private.bcpll_platform_support WHERE user_id=auth.uid() AND can_edit_tutorials);
 END IF;
 PERFORM public.bcpll_current_workspace(); RETURN true;
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END;$function$
;
REVOKE ALL ON FUNCTION private.bcpll_tutorial_access(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.bcpll_tutorial_access(boolean) TO "authenticated";
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$function$
;
REVOKE ALL ON FUNCTION private.has_role(uuid,app_role) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid,app_role) TO PUBLIC,"authenticated","service_role";
CREATE OR REPLACE FUNCTION private.is_workspace_member(_workspace_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = _workspace_id
      and user_id = _user_id
  );
$function$
;
REVOKE ALL ON FUNCTION private.is_workspace_member(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.is_workspace_member(uuid,uuid) TO PUBLIC,"authenticated","service_role";
CREATE OR REPLACE FUNCTION private.marcos_guard_accounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE office_owner uuid;
BEGIN
 SELECT owner_id INTO office_owner FROM public.workspaces WHERE id=NEW.workspace_id AND slug='escritorio-marcos-mello';
 IF office_owner IS NULL THEN RETURN NEW; END IF;
 IF NEW.user_id=office_owner OR EXISTS(SELECT 1 FROM auth.users WHERE id=NEW.user_id AND lower(email)='ruanandradenegocios@hotmail.com') THEN RETURN NEW; END IF;
 IF private.bcpll_is_platform_support(NEW.user_id) THEN RETURN NULL; END IF;
 RAISE EXCEPTION 'Este escritório permite somente o titular e o suporte autorizado.' USING ERRCODE='42501';
END;$function$
;
REVOKE ALL ON FUNCTION private.marcos_guard_accounts() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.marcos_tutorial_access(_edit boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_session_security_allowed() THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.slug='escritorio-marcos-mello' AND private.slim_workspace_access(w.id,'member')
  AND (w.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND lower(u.email)='ruanandradenegocios@hotmail.com'))) THEN RETURN false; END IF;
 IF _edit THEN RETURN EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND lower(email)='ruanandradenegocios@hotmail.com'); END IF;
 RETURN true;
END;$function$
;
REVOKE ALL ON FUNCTION private.marcos_tutorial_access(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.marcos_tutorial_access(boolean) TO "authenticated";
CREATE OR REPLACE FUNCTION private.saude_slim_assert_workspace_member(_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not (
    private.is_workspace_member(_workspace_id, auth.uid())
    or private.has_role(auth.uid(), 'super_admin')
  ) then
    raise exception 'Saude Slim: workspace não autorizado' using errcode='42501';
  end if;
end;
$function$
;
REVOKE ALL ON FUNCTION private.saude_slim_assert_workspace_member(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.saude_slim_assert_workspace_member(uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION private.saude_slim_get_evolution_credentials(_session_id uuid, _key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare _session public.whatsapp_web_sessions%rowtype;
begin
  select * into _session from public.whatsapp_web_sessions where id = _session_id;
  if not found then return null; end if;
  perform private.saude_slim_assert_workspace_member(_session.workspace_id);
  return pg_catalog.jsonb_build_object(
    'workspace_id', _session.workspace_id,
    'instance_name', _session.instance_id,
    'api_key', extensions.pgp_sym_decrypt(_session.token_encrypted, _key),
    'webhook_secret', _session.webhook_secret,
    'status', _session.status
  );
end;
$function$
;
REVOKE ALL ON FUNCTION private.saude_slim_get_evolution_credentials(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.saude_slim_get_evolution_credentials(uuid,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION private.saude_slim_set_evolution_credentials(_workspace_id uuid, _instance_name text, _api_key text, _webhook_secret text, _key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare _id uuid;
begin
  perform private.saude_slim_assert_workspace_member(_workspace_id);
  if length(coalesce(_instance_name,'')) < 4
     or length(coalesce(_api_key,'')) < 12
     or length(coalesce(_webhook_secret,'')) < 20
     or length(coalesce(_key,'')) < 32 then
    raise exception 'Saude Slim: parâmetros Evolution inválidos';
  end if;
  insert into public.whatsapp_web_sessions
    (workspace_id, provider, instance_id, token_encrypted, webhook_secret)
  values
    (_workspace_id, 'evolution', _instance_name,
     extensions.pgp_sym_encrypt(_api_key, _key, 'cipher-algo=aes256'),
     _webhook_secret)
  returning id into _id;
  return _id;
end;
$function$
;
REVOKE ALL ON FUNCTION private.saude_slim_set_evolution_credentials(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.saude_slim_set_evolution_credentials(uuid,text,text,text,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION private.saude_slim_touch_ai_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$function$
;
REVOKE ALL ON FUNCTION private.saude_slim_touch_ai_updated_at() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.saude_slim_touch_ai_updated_at() TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION private.slim_audience_delivery_origin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare origin text; campaign_session uuid; kind text;
begin
  select nullif(btrim(l.custom_data->>'whatsapp_session_id'),'') into origin
    from public.leads l where l.id=new.lead_id and l.workspace_id=new.workspace_id;
  select c.session_id,c.kind into campaign_session,kind from public.slim_audience_campaigns c
    where c.id=new.campaign_id and c.workspace_id=new.workspace_id;
  new.origin_session_id:=coalesce(origin::uuid,campaign_session);
  if new.origin_session_id is not null and not exists(select 1 from public.whatsapp_web_sessions s where s.id=new.origin_session_id and s.workspace_id=new.workspace_id) then
    raise exception 'O WhatsApp de origem do disparo não pertence à empresa.' using errcode='23514';
  end if;
  if kind is distinct from 'salesbot' then
    new.recipient_key:=coalesce(new.origin_session_id::text,'unbound')||':'||new.phone;
  end if;
  return new;
end $function$
;
REVOKE ALL ON FUNCTION private.slim_audience_delivery_origin() FROM PUBLIC,anon,authenticated;

COMMIT;
SELECT '05-functions.sql' AS migration_batch,'OK' AS result;


-- 06-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_bulk_move_leads_and_emit_impl(_workspace_id uuid, _lead_ids uuid[], _stage_id uuid, _request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_ids uuid[];
 v_distinct_count integer;
 v_fingerprint text;
 v_receipt private.slim_funnel_write_requests;
 v_stage public.pipeline_stages;
 v_pipeline public.pipelines;
 v_lead public.leads;
 v_lead_id uuid;
 v_count integer := 0;
 v_moved integer := 0;
 v_event_ids jsonb := '[]'::jsonb;
 v_item jsonb;
 v_response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para mover os clientes.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _stage_id IS NULL OR _lead_ids IS NULL
    OR cardinality(_lead_ids) NOT BETWEEN 1 AND 100 OR array_ndims(_lead_ids)<>1 THEN
  RAISE EXCEPTION 'Selecione de 1 a 100 clientes para mover.' USING ERRCODE='22023';
 END IF;
 IF array_position(_lead_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Seleção de clientes inválida.' USING ERRCODE='22023';
 END IF;
 SELECT array_agg(id ORDER BY id),count(DISTINCT id)::integer INTO v_ids,v_distinct_count
  FROM unnest(_lead_ids) AS selected(id);
 IF v_distinct_count<>cardinality(_lead_ids) THEN
  RAISE EXCEPTION 'A seleção contém clientes repetidos.' USING ERRCODE='22023';
 END IF;
 v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'leadIds',v_ids,'stageId',_stage_id
 )::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,23));
 SELECT * INTO v_receipt FROM private.slim_funnel_write_requests
  WHERE workspace_id=_workspace_id AND request_id=_request_id;
 IF FOUND THEN
  IF v_receipt.actor_id<>auth.uid() OR v_receipt.operation<>'bulk_move'
     OR v_receipt.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'Referência de operação já utilizada.' USING ERRCODE='22023';
  END IF;
  RETURN v_receipt.response;
 END IF;
 IF EXISTS (SELECT 1 FROM public.slim_stage_move_events WHERE id=_request_id) THEN
  RAISE EXCEPTION 'Referência de operação já utilizada.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_stage FROM public.pipeline_stages
  WHERE id=_stage_id AND workspace_id=_workspace_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Etapa indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_pipeline FROM public.pipelines
  WHERE id=v_stage.pipeline_id AND workspace_id=_workspace_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Funil indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 -- Lock in a stable order and validate the whole selection before any movement.
 -- Company siblings that were not selected are deliberately never included.
 FOR v_lead IN
  SELECT * FROM public.leads WHERE workspace_id=_workspace_id AND id=ANY(v_ids)
   AND merged_into_id IS NULL AND status NOT IN ('deleted','archived','merged')
   ORDER BY id FOR UPDATE
 LOOP
  PERFORM 1 FROM public.crm_sources c
   WHERE c.id=v_lead.crm_source_id AND c.workspace_id=_workspace_id
    AND (v_pipeline.crm_source_id=c.id OR EXISTS (
     SELECT 1 FROM public.crm_source_funnels f
     WHERE f.workspace_id=_workspace_id AND f.crm_source_id=c.id AND f.pipeline_id=v_pipeline.id
    ));
  IF NOT FOUND THEN
   RAISE EXCEPTION 'O funil não está disponível para a fonte de um dos clientes.' USING ERRCODE='42501';
  END IF;
  v_count := v_count+1;
 END LOOP;
 IF v_count<>cardinality(v_ids) THEN
  RAISE EXCEPTION 'Um dos clientes está indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 FOREACH v_lead_id IN ARRAY v_ids
 LOOP
  v_item := public.slim_move_lead_and_emit(_workspace_id,v_lead_id,_stage_id,gen_random_uuid());
  IF (v_item->>'moved')::boolean THEN
   v_moved := v_moved+1;
   v_event_ids := v_event_ids||jsonb_build_array(v_item->>'eventId');
  END IF;
 END LOOP;
 v_response := jsonb_build_object('ok',true,'count',v_count,'movedCount',v_moved,
  'unchangedCount',v_count-v_moved,'eventIds',v_event_ids);
 INSERT INTO private.slim_funnel_write_requests(
  workspace_id,request_id,actor_id,operation,request_fingerprint,response
 ) VALUES (_workspace_id,_request_id,auth.uid(),'bulk_move',v_fingerprint,v_response);
 RETURN v_response;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_bulk_move_leads_and_emit_impl(uuid,uuid[],uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_bulk_move_leads_and_emit_impl(uuid,uuid[],uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_cancel_audience_campaign(_campaign_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c public.slim_audience_campaigns;BEGIN
 SELECT * INTO c FROM public.slim_audience_campaigns WHERE id=_campaign_id FOR UPDATE;
 IF NOT FOUND OR NOT private.slim_workspace_access(c.workspace_id,'operator') OR (c.created_by<>auth.uid() AND NOT private.slim_workspace_access(c.workspace_id,'admin')) THEN RAISE EXCEPTION 'Sem permissão para encerrar este disparo.' USING ERRCODE='42501';END IF;
 UPDATE public.slim_audience_campaigns SET status='cancelled',finished_at=now() WHERE id=c.id AND status IN ('queued','running');
 UPDATE public.slim_audience_deliveries SET status='cancelled',finished_at=now() WHERE campaign_id=c.id AND status='pending';
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_cancel_audience_campaign(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_cancel_audience_campaign(uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_cancel_order(_workspace_id uuid, _order_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o public.slim_orders;line jsonb;balance integer;BEGIN
 IF NOT private.slim_workspace_access(_workspace_id,'operator') THEN RAISE EXCEPTION 'Sem permissão para cancelar pedidos.' USING ERRCODE='42501';END IF;
 IF length(btrim(coalesce(_reason,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE='22023';END IF;
 SELECT * INTO o FROM public.slim_orders WHERE workspace_id=_workspace_id AND id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado nesta empresa.' USING ERRCODE='42501';END IF;
 IF o.status='cancelled' THEN RETURN;END IF;
 PERFORM p.id FROM public.products p WHERE p.workspace_id=_workspace_id AND p.id IN(SELECT (x->>'productId')::uuid FROM jsonb_array_elements(o.snapshot->'items') x) ORDER BY p.id FOR UPDATE;
 FOR line IN SELECT * FROM jsonb_array_elements(o.snapshot->'items') LOOP
  UPDATE public.products SET stock=stock+(line->>'quantity')::integer WHERE workspace_id=_workspace_id AND id=(line->>'productId')::uuid RETURNING stock INTO balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto necessário ao estorno não encontrado.' USING ERRCODE='22023';END IF;
  INSERT INTO public.slim_stock_movements(workspace_id,order_id,product_id,kind,quantity,balance_after,actor_id) VALUES(_workspace_id,_order_id,(line->>'productId')::uuid,'reversal',(line->>'quantity')::integer,balance,auth.uid());
 END LOOP;
 UPDATE public.slim_orders SET status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancellation_reason=btrim(_reason) WHERE id=_order_id AND workspace_id=_workspace_id;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_cancel_order(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_cancel_order(uuid,uuid,text) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_change_order(_workspace_id uuid, _order_id uuid, _request_id uuid, _operation text, _fingerprint text, _quote jsonb, _reason text, _approved boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
DECLARE o public.slim_orders;c public.slim_order_changes;payload jsonb;r jsonb;replacement uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') OR _approved IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'A alteração exige aprovação e permissão do operador.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _order_id IS NULL OR _operation IS NULL OR _operation NOT IN ('edit','delete')
  OR coalesce(_fingerprint,'') !~ '^[0-9a-f]{64}$' OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'Alteração ou motivo inválidos.' USING ERRCODE='22023';
 END IF;
 IF (_operation='edit' AND (jsonb_typeof(_quote) IS DISTINCT FROM 'object' OR length(_quote::text)>200000 OR jsonb_typeof(_quote->'items') IS DISTINCT FROM 'array'))
  OR (_operation='delete' AND _quote IS NOT NULL) THEN
  RAISE EXCEPTION 'Conteúdo da alteração inválido.' USING ERRCODE='22023';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'A alteração exige uma leitura atual do pedido. Inicie uma nova tentativa.' USING ERRCODE='25001';
 END IF;
 payload:=jsonb_build_object('operation',_operation,'orderId',_order_id,'fingerprint',_fingerprint,'quote',_quote,'reason',btrim(_reason));
 -- Same request lock as ordinary confirmation and attempt recovery; no automatic retry.
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,0));
 SELECT * INTO c FROM public.slim_order_changes WHERE workspace_id=_workspace_id AND id=_request_id;
 IF FOUND THEN
  IF c.actor_id<>auth.uid() OR c.order_id<>_order_id OR c.operation<>_operation THEN
   RAISE EXCEPTION 'Referência já utilizada por outra alteração.' USING ERRCODE='22023';
  END IF;
  IF c.state='closed' THEN RAISE EXCEPTION 'Tentativa encerrada sem alteração. Revise e inicie uma nova confirmação.' USING ERRCODE='22023';END IF;
  IF c.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'A aprovação não corresponde à alteração já registrada.' USING ERRCODE='22023';END IF;
  RETURN private.slim_order_change_result(c);
 END IF;
 IF EXISTS(SELECT 1 FROM public.slim_orders x WHERE x.workspace_id=_workspace_id AND x.request_id=_request_id) THEN
  RAISE EXCEPTION 'Referência já utilizada por outro pedido.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slim-order-change|'||_workspace_id::text||'|'||_order_id::text,0));
 SELECT * INTO o FROM public.slim_orders WHERE workspace_id=_workspace_id AND id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado nesta empresa.' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.slim_order_changes x WHERE x.workspace_id=_workspace_id AND x.order_id=_order_id AND x.state='completed') THEN
  RAISE EXCEPTION 'O pedido já foi alterado. Atualize a lista antes de continuar.' USING ERRCODE='22023';
 END IF;
 IF _fingerprint IS DISTINCT FROM encode(extensions.digest(o.snapshot::text||'|'||o.status,'sha256'),'hex') THEN
  RAISE EXCEPTION 'O pedido mudou. Reabra a edição antes de aprovar.' USING ERRCODE='22023';
 END IF;
 IF _operation='edit' AND o.status<>'confirmed' THEN RAISE EXCEPTION 'Pedido cancelado não pode ser editado.' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.slim_order_documents d JOIN public.slim_order_document_deliveries t ON t.document_id=d.id AND t.workspace_id=d.workspace_id
  WHERE d.workspace_id=_workspace_id AND d.order_id=_order_id AND t.status IN ('pending','uncertain')) THEN
  RAISE EXCEPTION 'Consulte o envio pendente do documento antes de alterar este pedido.' USING ERRCODE='22023';
 END IF;
 IF _operation='edit' THEN
  IF jsonb_array_length(_quote->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Inclua entre 1 e 100 itens.' USING ERRCODE='22023';END IF;
  IF _quote#>>'{customer,kind}' IS DISTINCT FROM 'existing' THEN RAISE EXCEPTION 'Selecione um cliente cadastrado para editar o pedido.' USING ERRCODE='22023';END IF;
  IF NOT (_quote ? 'fulfillment' AND _quote ? 'shippingCents') THEN
   RAISE EXCEPTION 'Escolha retirada ou entrega e revise o frete antes de confirmar.' USING ERRCODE='22023';
  END IF;
  PERFORM p.id FROM public.products p WHERE p.workspace_id=_workspace_id AND p.id IN(
   SELECT (x->>'productId')::uuid FROM jsonb_array_elements(o.snapshot->'items') x
   UNION SELECT (x->>'productId')::uuid FROM jsonb_array_elements(_quote->'items') x
  ) ORDER BY p.id FOR UPDATE;
 END IF;
 -- Existing cancellation and the CURRENT delivery/freight confirmation share this transaction.
 -- A failed replacement rolls back every reversal, new order and audit entry.
 PERFORM private.slim_cancel_order(_workspace_id,_order_id,btrim(_reason));
 IF _operation='edit' THEN
  r:=private.slim_confirm_order(_workspace_id,_request_id,_quote);replacement:=(r->>'orderId')::uuid;
  UPDATE public.slim_orders AS saved
   SET confirmed_at=o.confirmed_at,snapshot=saved.snapshot||jsonb_build_object('confirmedAt',o.confirmed_at,'revisionOf',o.id,'revisionReason',btrim(_reason))
   WHERE saved.id=replacement AND saved.workspace_id=_workspace_id;
 END IF;
 INSERT INTO public.slim_order_changes(id,workspace_id,actor_id,order_id,operation,state,request_payload,source_fingerprint,source_snapshot,source_status,reason,replacement_order_id)
  VALUES(_request_id,_workspace_id,auth.uid(),_order_id,_operation,'completed',payload,_fingerprint,o.snapshot,o.status,btrim(_reason),replacement)
  RETURNING * INTO c;
 RETURN private.slim_order_change_result(c);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_change_order(uuid,uuid,uuid,text,text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_change_order(uuid,uuid,uuid,text,text,jsonb,text,boolean) TO "authenticated";

COMMIT;
SELECT '06-functions.sql' AS migration_batch,'OK' AS result;


-- 07-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_confirm_order(_workspace_id uuid, _request_id uuid, _quote jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor uuid:=auth.uid(); customer_uuid uuid; old public.slim_orders; product public.products;
 customer_row public.leads; issuer public.workspaces; line jsonb; entry record;
 ids uuid[]; products_count integer; qty integer; unit_cents bigint; sub bigint; discount bigint;
 total numeric:=0; remaining bigint; calculated_items jsonb:='[]'; allocated_items jsonb:='[]';
 payment jsonb; note text; new_id uuid:=gen_random_uuid(); num bigint; confirmed timestamptz:=clock_timestamp(); full_snapshot jsonb;
 shipping bigint:=0; final_total numeric; has_delivery boolean; fulfillment jsonb; delivery jsonb; delivery_field record; delivery_text text;
BEGIN
 IF actor IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN RAISE EXCEPTION 'Sem permissão para finalizar pedidos nesta empresa.' USING ERRCODE='42501';END IF;
 IF _request_id IS NULL OR jsonb_typeof(_quote) IS DISTINCT FROM 'object' OR (_quote->>'workspaceId')::uuid IS DISTINCT FROM _workspace_id THEN RAISE EXCEPTION 'Pedido ou empresa inválidos.' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,0));
 IF EXISTS(SELECT 1 FROM public.slim_checkout_attempt_closures c WHERE c.workspace_id=_workspace_id AND c.request_id=_request_id) THEN
  RAISE EXCEPTION 'Tentativa encerrada sem pedido. Revise os itens e inicie uma nova confirmação.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO old FROM public.slim_orders WHERE workspace_id=_workspace_id AND request_id=_request_id;
 IF FOUND THEN
  IF old.created_by<>actor OR old.request_payload IS DISTINCT FROM _quote THEN RAISE EXCEPTION 'Referência já utilizada por outro conteúdo ou operador.' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('requestId',old.request_id,'workspaceId',old.workspace_id,'orderId',old.id,'number','SL-'||lpad(old.order_number::text,8,'0'),'status',old.status,'totalCents',old.total_cents);
 END IF;
 has_delivery:=_quote ? 'fulfillment' OR _quote ? 'shippingCents';
 IF has_delivery THEN
  IF NOT (_quote ? 'fulfillment' AND _quote ? 'shippingCents')
   OR jsonb_typeof(_quote->'fulfillment') IS DISTINCT FROM 'object'
   OR jsonb_typeof(_quote->'shippingCents') IS DISTINCT FROM 'number'
   OR (_quote->>'shippingCents') !~ '^[0-9]+$'
   OR (_quote->>'shippingCents')::numeric>99999999999999 THEN
   RAISE EXCEPTION 'Modalidade de entrega e frete inválidos.' USING ERRCODE='22023';
  END IF;
  shipping:=(_quote->>'shippingCents')::bigint;
  fulfillment:=_quote->'fulfillment';
  IF fulfillment->>'mode'='pickup' THEN
   IF fulfillment IS DISTINCT FROM jsonb_build_object('mode','pickup') OR shipping<>0 THEN
    RAISE EXCEPTION 'Retirada não permite endereço ou cobrança de frete.' USING ERRCODE='22023';
   END IF;
   delivery:=jsonb_build_object('mode','pickup');
  ELSIF fulfillment->>'mode'='delivery' THEN
   IF fulfillment-ARRAY['mode','recipient','phone','postalCode','street','number','complement','neighborhood','city','state','notes']::text[]<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Campo de entrega não reconhecido.' USING ERRCODE='22023';
   END IF;
   delivery:=jsonb_build_object('mode','delivery');
   FOR delivery_field IN SELECT * FROM (VALUES
    ('recipient',160,true),('phone',40,true),('postalCode',9,true),('street',200,true),
    ('number',30,true),('complement',120,false),('neighborhood',100,true),('city',100,true),('state',2,true),('notes',500,false)
   ) AS fields(name,maximum,required) LOOP
    IF jsonb_typeof(fulfillment->delivery_field.name) IS DISTINCT FROM 'string' THEN
     RAISE EXCEPTION 'Campo de entrega inválido: %.',delivery_field.name USING ERRCODE='22023';
    END IF;
    delivery_text:=fulfillment->>delivery_field.name;
    IF delivery_text ~ U&'[\0001-\001F\007F-\009F]' THEN
     RAISE EXCEPTION 'Campo de entrega contém caracteres inválidos: %.',delivery_field.name USING ERRCODE='22023';
    END IF;
    -- Match ECMAScript trim and string.length (UTF-16), including non-BMP text.
    delivery_text:=btrim(delivery_text,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
    IF length(delivery_text)+length(regexp_replace(delivery_text,U&'[\0001-\FFFF]','','g'))>delivery_field.maximum
     OR (delivery_field.required AND delivery_text='') THEN
     RAISE EXCEPTION 'Preencha o campo de entrega dentro do limite: %.',delivery_field.name USING ERRCODE='22023';
    END IF;
    delivery:=delivery||jsonb_build_object(delivery_field.name,delivery_text);
   END LOOP;
   IF (delivery->>'phone') !~ '^[+()0-9 .-]+$' THEN
    RAISE EXCEPTION 'Telefone de entrega inválido.' USING ERRCODE='22023';
   END IF;
   delivery_text:=regexp_replace(delivery->>'phone','[^0-9]','','g');
   IF length(delivery_text) NOT BETWEEN 10 AND 15 THEN
    RAISE EXCEPTION 'Telefone de entrega deve conter entre 10 e 15 dígitos.' USING ERRCODE='22023';
   END IF;
   delivery:=jsonb_set(delivery,'{phone}',to_jsonb(delivery_text));
   IF (delivery->>'postalCode') !~ '^[0-9]{5}-?[0-9]{3}$' THEN
    RAISE EXCEPTION 'CEP de entrega inválido.' USING ERRCODE='22023';
   END IF;
   delivery:=jsonb_set(delivery,'{postalCode}',to_jsonb(replace(delivery->>'postalCode','-','')));
   delivery_text:=upper(delivery->>'state');
   IF delivery_text NOT IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') THEN
    RAISE EXCEPTION 'UF de entrega inválida.' USING ERRCODE='22023';
   END IF;
   delivery:=jsonb_set(delivery,'{state}',to_jsonb(delivery_text));
  ELSE
   RAISE EXCEPTION 'Escolha retirada ou entrega.' USING ERRCODE='22023';
  END IF;
 END IF;
 IF jsonb_typeof(_quote->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(_quote->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Inclua entre 1 e 100 produtos.' USING ERRCODE='22023';END IF;
 SELECT array_agg((x->>'productId')::uuid) INTO ids FROM jsonb_array_elements(_quote->'items') x;
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Produto repetido. Ajuste a quantidade na mesma linha.' USING ERRCODE='22023';END IF;
 PERFORM p.id FROM public.products p WHERE p.workspace_id=_workspace_id AND p.id=ANY(ids) ORDER BY p.id FOR UPDATE;
 GET DIAGNOSTICS products_count=ROW_COUNT;
 IF products_count<>cardinality(ids) THEN RAISE EXCEPTION 'Produto não pertence à empresa.' USING ERRCODE='42501';END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(_quote->'items') LOOP
  SELECT * INTO STRICT product FROM public.products WHERE workspace_id=_workspace_id AND id=(line->>'productId')::uuid;
  IF (line->>'quantity') IS NULL OR (line->>'quantity') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Quantidade inválida.' USING ERRCODE='22023';END IF;
  qty:=(line->>'quantity')::integer;
  IF qty NOT BETWEEN 1 AND 999999 OR NOT product.active OR product.stock<qty THEN RAISE EXCEPTION 'Produto inativo ou estoque insuficiente: %',product.name USING ERRCODE='22023';END IF;
  unit_cents:=(coalesce(product.promo_price,product.price)*100)::bigint;
  IF unit_cents<0 OR unit_cents IS DISTINCT FROM (line->>'unitPriceCents')::bigint THEN RAISE EXCEPTION 'O preço mudou. Revise o pedido antes de confirmar.' USING ERRCODE='22023';END IF;
  IF length(product.name)>500 OR length(product.description)>10000 OR length(product.sku)>200 THEN RAISE EXCEPTION 'Cadastro do produto excede o limite do documento.' USING ERRCODE='22023';END IF;
  IF unit_cents::numeric*qty>99999999999999 THEN RAISE EXCEPTION 'Subtotal acima do limite.' USING ERRCODE='22023';END IF;
  sub:=unit_cents*qty;total:=total+sub;
  calculated_items:=calculated_items||jsonb_build_array(jsonb_build_object('productId',product.id,'name',product.name,'description',product.description,'sku',product.sku,'quantity',qty,'unitPriceCents',unit_cents,'subtotalCents',sub));
 END LOOP;
 IF total>99999999999999 OR (_quote->>'discountCents') IS NULL OR (_quote->>'discountCents') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Total ou desconto inválido.' USING ERRCODE='22023';END IF;
 discount:=(_quote->>'discountCents')::bigint;
 final_total:=total-discount+shipping;
 IF discount>total OR final_total>99999999999999 OR final_total IS DISTINCT FROM (_quote->>'totalCents')::numeric OR total IS DISTINCT FROM (_quote->>'subtotalCents')::numeric THEN RAISE EXCEPTION 'Totais divergentes. Revise o pedido.' USING ERRCODE='22023';END IF;
 IF total=0 THEN
  SELECT jsonb_agg(x||jsonb_build_object('discountCents',0,'totalCents',0)) INTO allocated_items FROM jsonb_array_elements(calculated_items) x;
 ELSE
  WITH portions AS (SELECT x,ord,floor((x->>'subtotalCents')::numeric*discount/total)::bigint AS base,mod((x->>'subtotalCents')::numeric*discount,total) AS remainder FROM jsonb_array_elements(calculated_items) WITH ORDINALITY t(x,ord)),
  ranked AS (SELECT *,row_number() OVER(ORDER BY remainder DESC,ord) AS rank,discount-sum(base) OVER() AS left_over FROM portions)
  SELECT jsonb_agg(x||jsonb_build_object('discountCents',base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END,'totalCents',(x->>'subtotalCents')::bigint-base-CASE WHEN rank<=left_over THEN 1 ELSE 0 END) ORDER BY ord) INTO allocated_items FROM ranked;
 END IF;
 payment:=_quote->'payment';note:=coalesce(_quote->>'notes','');
 IF jsonb_typeof(payment) IS DISTINCT FROM 'object' OR coalesce(payment->>'method','') NOT IN ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') OR coalesce(payment->>'status','') NOT IN ('paid','pending') OR coalesce(payment->>'installments','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Pagamento inválido.' USING ERRCODE='22023';END IF;
 IF (payment->>'installments')::integer NOT BETWEEN 1 AND 24 OR (payment->>'method'<>'credit_card' AND (payment->>'installments')::integer<>1) OR length(note)>2000 THEN RAISE EXCEPTION 'Parcelamento ou observações inválidos.' USING ERRCODE='22023';END IF;
 IF _quote#>>'{customer,kind}'='existing' THEN
  customer_uuid:=(_quote#>>'{customer,id}')::uuid;
  SELECT * INTO customer_row FROM public.leads WHERE id=customer_uuid AND workspace_id=_workspace_id AND merged_into_id IS NULL AND status NOT IN ('deleted','archived','merged');
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não disponível nesta empresa.' USING ERRCODE='42501';END IF;
 ELSIF _quote#>>'{customer,kind}'='new' THEN
  IF length(btrim(coalesce(_quote#>>'{customer,name}',''))) NOT BETWEEN 1 AND 160 OR length(coalesce(_quote#>>'{customer,email}',''))>254 OR length(coalesce(_quote#>>'{customer,phone}',''))>40 THEN RAISE EXCEPTION 'Dados do cliente inválidos.' USING ERRCODE='22023';END IF;
  IF coalesce(_quote#>>'{customer,email}','')<>'' AND (_quote#>>'{customer,email}') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'E-mail inválido.' USING ERRCODE='22023';END IF;
  IF length(regexp_replace(coalesce(_quote#>>'{customer,phone}',''),'[^0-9]','','g'))>0 THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||regexp_replace(_quote#>>'{customer,phone}','[^0-9]','','g'),1));
   IF EXISTS(SELECT 1 FROM public.leads l WHERE l.workspace_id=_workspace_id AND l.merged_into_id IS NULL AND regexp_replace(coalesce(l.phone,''),'[^0-9]','','g')=regexp_replace(_quote#>>'{customer,phone}','[^0-9]','','g')) THEN RAISE EXCEPTION 'Telefone já cadastrado. Selecione o cliente existente.' USING ERRCODE='22023';END IF;
  END IF;
  INSERT INTO public.leads(workspace_id,name,email,phone,status,source) VALUES(_workspace_id,btrim(_quote#>>'{customer,name}'),nullif(btrim(_quote#>>'{customer,email}'),''),nullif(btrim(_quote#>>'{customer,phone}'),''),'active','erp_checkout') RETURNING * INTO customer_row;
  customer_uuid:=customer_row.id;
 ELSE RAISE EXCEPTION 'Selecione um cliente ou cadastre um novo.' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT issuer FROM public.workspaces WHERE id=_workspace_id;
 full_snapshot:=jsonb_build_object('version',1,'workspaceId',_workspace_id,'orderId',new_id,'requestId',_request_id,'status','confirmed','confirmedAt',confirmed,'cancelledAt',NULL,'cancellationReason',NULL,
 'customer',jsonb_build_object('id',customer_uuid,'name',customer_row.name,'email',coalesce(customer_row.email,''),'phone',coalesce(customer_row.phone,'')),
 'issuer',jsonb_build_object('name',issuer.name,'legalName',coalesce(issuer.legal_name,''),'document',coalesce(issuer.cnpj,'')),
 'items',allocated_items,'subtotalCents',total,'discountCents',discount,'totalCents',final_total,
 'payment',jsonb_build_object('method',payment->>'method','status',payment->>'status','installments',(payment->>'installments')::integer),'notes',btrim(note));
 IF has_delivery THEN full_snapshot:=full_snapshot||jsonb_build_object('fulfillment',delivery,'shippingCents',shipping);END IF;
 INSERT INTO public.slim_orders(id,workspace_id,request_id,request_payload,created_by,customer_id,subtotal_cents,discount_cents,shipping_cents,total_cents,snapshot,confirmed_at)
 VALUES(new_id,_workspace_id,_request_id,_quote,actor,customer_uuid,total,discount,shipping,final_total,full_snapshot,confirmed) RETURNING order_number INTO num;
 UPDATE public.slim_orders SET snapshot=snapshot||jsonb_build_object('number','SL-'||lpad(num::text,8,'0')) WHERE id=new_id;
 FOR line IN SELECT * FROM jsonb_array_elements(allocated_items) LOOP
  UPDATE public.products SET stock=stock-(line->>'quantity')::integer WHERE workspace_id=_workspace_id AND id=(line->>'productId')::uuid RETURNING stock INTO remaining;
  INSERT INTO public.slim_stock_movements(workspace_id,order_id,product_id,kind,quantity,balance_after,actor_id) VALUES(_workspace_id,new_id,(line->>'productId')::uuid,'sale',(line->>'quantity')::integer,remaining,actor);
 END LOOP;
 RETURN jsonb_build_object('requestId',_request_id,'workspaceId',_workspace_id,'orderId',new_id,'number','SL-'||lpad(num::text,8,'0'),'status','confirmed','totalCents',final_total);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_confirm_order(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_confirm_order(uuid,uuid,jsonb) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_assert_scope(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid(); v_active uuid; v_owner uuid; v_member public.workspace_members;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL THEN
  RAISE EXCEPTION 'Entre novamente para usar o Copiloto.' USING ERRCODE='42501';
 END IF;
 SELECT current_workspace_id INTO v_active FROM public.profiles WHERE id=v_actor FOR SHARE;
 IF v_active IS DISTINCT FROM p_workspace_id AND NOT private.bcpll_support_workspace_allowed(p_workspace_id) THEN
  RAISE EXCEPTION 'A empresa ativa mudou. Reabra o Copiloto.' USING ERRCODE='42501';
 END IF;
 SELECT owner_id INTO v_owner FROM public.workspaces WHERE id=p_workspace_id FOR SHARE;
 SELECT * INTO v_member FROM public.workspace_members WHERE workspace_id=p_workspace_id AND user_id=v_actor FOR SHARE;
 IF v_owner IS DISTINCT FROM v_actor AND (v_member.id IS NULL OR coalesce(v_member.role_type,'funcionario')='visualizador'
   OR (v_member.access_expires_at IS NOT NULL AND v_member.access_expires_at<=clock_timestamp())) THEN
  RAISE EXCEPTION 'Operador sem permissão vigente nesta empresa.' USING ERRCODE='42501';
 END IF;
 IF NOT private.slim_workspace_access(p_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Operador não autorizado nesta empresa.' USING ERRCODE='42501';
 END IF;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_assert_scope(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_assert_scope(uuid) TO "authenticated";

COMMIT;
SELECT '07-functions.sql' AS migration_batch,'OK' AS result;


-- 08-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_copilot_capture(p_workspace_id uuid, p_kind text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 l public.leads; s public.pipeline_stages; p public.pipelines; b public.salesbots;
 v_lead jsonb; v_snapshot jsonb; v_preview jsonb; v_configs jsonb; v_blocks jsonb; v_live jsonb;
 v_run jsonb; v_row record; v_source_link boolean; v_from_stage text; v_from_pipeline text; v_count integer;
 v_known_phone text; v_preferred text; v_bound text; v_route_found boolean:=false; v_route_jid text; v_message_ids text[];
 v_session jsonb; v_identity jsonb; v_opted_out boolean; v_canonical uuid;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 SELECT * INTO l FROM public.leads WHERE id=(p_payload->>'leadId')::uuid AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR l.merged_into_id IS NOT NULL OR l.status IN ('deleted','archived','merged')
  OR coalesce(l.source,'')='whatsapp_group' OR coalesce(l.phone,'') LIKE '%@g.us'
  OR coalesce(l.custom_data->>'is_group','false')='true' THEN
  RAISE EXCEPTION 'Cliente individual indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 -- Preserve the canonical alias rule without merging, repairing or editing rows.
 IF l.source='pedido_saude_slim' AND jsonb_typeof(l.custom_data->'whatsapp_session_id')='string'
   AND length(l.custom_data->>'whatsapp_session_id')>0 THEN
  SELECT x.id INTO v_canonical FROM public.leads x WHERE x.workspace_id=p_workspace_id AND x.merged_into_id IS NULL
   AND x.status NOT IN ('deleted','archived','merged')
   AND coalesce(x.source,'') NOT IN ('pedido_saude_slim','whatsapp_group','instagram','facebook','messenger')
   AND private.slim_copilot_contact_key(x.phone)=private.slim_copilot_contact_key(l.phone)
   AND x.custom_data->>'whatsapp_session_id'=l.custom_data->>'whatsapp_session_id'
   ORDER BY x.created_at,x.id LIMIT 1;
  IF v_canonical IS NOT NULL AND v_canonical<>l.id THEN
   RAISE EXCEPTION 'A identidade do contato mudou. Prepare a proposta no cadastro principal.' USING ERRCODE='40001';
  END IF;
 END IF;
 v_opted_out:=coalesce(l.custom_data->>'opt_out','false')='true'
  OR coalesce(l.custom_data->>'do_not_contact','false')='true'
  OR coalesce(l.custom_data->>'whatsapp_opt_out','false')='true';
 IF p_kind IN ('move_lead_stage','send_text','start_salesbot') AND v_opted_out THEN
  RAISE EXCEPTION 'Este cliente possui bloqueio de contato.' USING ERRCODE='42501';
 END IF;
 v_lead:=jsonb_build_object('id',l.id,'name',l.name,'phone',l.phone,'phoneNormalized',l.phone_normalized,
  'status',l.status,'mergedIntoId',l.merged_into_id,'source',l.source,'createdAt',l.created_at,
  'crmSourceId',l.crm_source_id,'pipelineId',l.pipeline_id,'stageId',l.stage_id,
  'sessionId',l.custom_data->'whatsapp_session_id','optedOut',v_opted_out);
 v_snapshot:=jsonb_build_object('lead',v_lead);

 IF p_kind='move_lead_stage' THEN
  SELECT * INTO s FROM public.pipeline_stages WHERE id=(p_payload->>'stageId')::uuid AND workspace_id=p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa de destino indisponível nesta empresa.' USING ERRCODE='42501';END IF;
  -- The parent lock also serializes replace_crm_stage_automations and FK inserts.
  SELECT * INTO p FROM public.pipelines WHERE id=s.pipeline_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funil de destino indisponível nesta empresa.' USING ERRCODE='42501';END IF;
  SELECT * INTO s FROM public.pipeline_stages WHERE id=(p_payload->>'stageId')::uuid AND workspace_id=p_workspace_id AND pipeline_id=p.id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A etapa mudou de funil. Prepare uma nova proposta.' USING ERRCODE='40001';END IF;
  PERFORM 1 FROM public.crm_sources WHERE id=l.crm_source_id AND workspace_id=p_workspace_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Origem do cliente indisponível nesta empresa.' USING ERRCODE='42501';END IF;
  PERFORM 1 FROM public.crm_source_funnels WHERE workspace_id=p_workspace_id AND crm_source_id=l.crm_source_id AND pipeline_id=p.id FOR SHARE;
  v_source_link:=FOUND;
  IF p.crm_source_id IS DISTINCT FROM l.crm_source_id AND NOT v_source_link THEN
   RAISE EXCEPTION 'O funil não está vinculado à origem deste cliente.' USING ERRCODE='42501';
  END IF;
  SELECT name INTO v_from_stage FROM public.pipeline_stages WHERE id=l.stage_id AND workspace_id=p_workspace_id;
  SELECT name INTO v_from_pipeline FROM public.pipelines WHERE id=l.pipeline_id AND workspace_id=p_workspace_id;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]'::jsonb) INTO v_configs FROM (
   SELECT a.id,jsonb_build_object('id',a.id,'stageId',a.stage_id,'actionId',a.action_id,'action',a.action,
    'enabled',a.enabled,'position',a.position,'updatedAt',a.updated_at) item
   FROM public.crm_stage_automations a WHERE a.workspace_id=p_workspace_id AND a.pipeline_id=p.id ORDER BY a.id FOR SHARE
  ) x;
  SELECT count(*)::integer INTO v_count FROM jsonb_array_elements(v_configs) a
   WHERE coalesce(a->>'enabled','true')<>'false' AND coalesce(a#>>'{action,enabled}','true')<>'false'
    AND CASE WHEN jsonb_typeof(a#>'{action,stageIds}')='array' AND jsonb_array_length(a#>'{action,stageIds}')>0
     THEN (a#>'{action,stageIds}') ? s.id::text ELSE a->>'stageId'=s.id::text END;
  v_snapshot:=v_snapshot||jsonb_build_object('destination',jsonb_build_object('stageId',s.id,'stageName',s.name,'pipelineId',p.id,
   'pipelineName',p.name,'sourceId',p.crm_source_id,'sourceLinked',v_source_link),
   'fromStageName',v_from_stage,'fromPipelineName',v_from_pipeline,
   'automationHash',encode(sha256(convert_to(v_configs::text,'UTF8')),'hex'));
  v_preview:=jsonb_build_object('title','Mover cliente de etapa','targetLabel',l.name,
   'changes',jsonb_build_array(jsonb_build_object('label','Funil','before',coalesce(v_from_pipeline,'Sem funil'),'after',p.name),
    jsonb_build_object('label','Etapa','before',coalesce(v_from_stage,'Sem etapa'),'after',s.name)),
   'effects',jsonb_build_array(
    'A movimentação poderá acionar os gatilhos vigentes da etapa, inclusive mensagens, SalesBots e IA individual.',
    CASE WHEN v_count=0 THEN 'Não há gatilhos habilitados cobrindo esta etapa no momento da proposta.'
     ELSE v_count::text||' gatilho(s) habilitado(s) cobre(m) esta etapa; a execução depende dos critérios configurados.' END,
    'Depois da aprovação, as automações seguem a configuração vigente quando forem processadas.'),
   'cost','Podem ocorrer custos das integrações usadas pelo fluxo.');
 ELSIF p_kind='start_salesbot' THEN
  v_known_phone:=private.slim_copilot_phone(l.phone,true);
  IF v_known_phone IS NULL THEN RAISE EXCEPTION 'Confirme o telefone internacional do cliente antes de iniciar o SalesBot.' USING ERRCODE='22023';END IF;
  SELECT * INTO b FROM public.salesbots WHERE id=(p_payload->>'botId')::uuid AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND OR b.is_active IS DISTINCT FROM true OR b.scope IS DISTINCT FROM 'individual' THEN
   RAISE EXCEPTION 'Selecione um SalesBot individual ativo desta empresa.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]'::jsonb) INTO v_blocks FROM (
   SELECT z.id,jsonb_build_object('id',z.id,'type',z.type,'config',z.config,'nextBlockId',z.next_block_id) item
   FROM public.salesbot_blocks z WHERE z.salesbot_id=b.id AND z.workspace_id=p_workspace_id ORDER BY z.id FOR SHARE
  ) x;
  IF jsonb_array_length(v_blocks)=0 THEN RAISE EXCEPTION 'Este SalesBot não possui blocos salvos.' USING ERRCODE='22023';END IF;
  v_live:='[]'::jsonb;
  FOR v_row IN SELECT r.id,jsonb_build_object('id',r.id,'leadId',r.lead_id,'botId',r.salesbot_id,'status',r.status,
   'blockId',r.current_block_id,'waitingUntil',r.waiting_until,'stoppedAt',r.stopped_at,'updatedAt',r.updated_at) item
   FROM public.salesbot_runs r WHERE r.workspace_id=p_workspace_id AND r.lead_id=l.id AND r.salesbot_id=b.id
    AND r.status IN ('queued','pending','running','waiting','waiting_timer','waiting_message','paused') ORDER BY r.id LOOP
   PERFORM private.slim_copilot_lock_run(p_workspace_id,l.id,v_row.id,v_row.item);
   v_live:=v_live||jsonb_build_array(v_row.item);
  END LOOP;
  v_snapshot:=v_snapshot||jsonb_build_object('bot',jsonb_build_object('id',b.id,'name',b.name,'active',b.is_active,'scope',b.scope,
   'updatedAt',b.updated_at,'configHash',encode(sha256(convert_to(jsonb_build_object('settings',b.settings,'triggers',b.gatilhos,
    'trigger',b.trigger,'blocks',v_blocks)::text,'UTF8')),'hex')),'liveRuns',v_live,
   'agent',jsonb_build_object('id',l.active_conversation_agent_id,'paused',l.ai_paused,'version',l.active_conversation_agent_version));
  v_preview:=jsonb_build_object('title','Iniciar SalesBot','targetLabel',l.name,
   'changes',jsonb_build_array(jsonb_build_object('label','SalesBot','after',b.name)),
   'effects',jsonb_build_array('O SalesBot poderá enviar mensagens e, se configurado, encaminhar esta conversa à IA individual.',
    CASE WHEN jsonb_array_length(v_live)>0 THEN 'Já existe uma execução ativa deste SalesBot. Ela será preservada; outra execução não será criada.'
     ELSE 'A aprovação coloca este SalesBot na fila para o cliente indicado.' END,
    'Os blocos seguem a configuração vigente quando forem executados.'),
   'cost','Podem ocorrer custos das integrações usadas pelo fluxo.');
 ELSIF p_kind='stop_salesbot' THEN
  SELECT jsonb_build_object('id',r.id,'leadId',r.lead_id,'botId',r.salesbot_id,'status',r.status,
   'blockId',r.current_block_id,'waitingUntil',r.waiting_until,'stoppedAt',r.stopped_at,'updatedAt',r.updated_at)
   INTO v_run FROM public.salesbot_runs r WHERE r.id=(p_payload->>'runId')::uuid AND r.workspace_id=p_workspace_id AND r.lead_id=l.id;
  IF v_run IS NULL OR (v_run->>'status' IN ('queued','pending','running','waiting','waiting_timer','waiting_message','paused')) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Esta execução do SalesBot já foi encerrada ou não pertence ao cliente.' USING ERRCODE='40001';
  END IF;
  PERFORM private.slim_copilot_lock_run(p_workspace_id,l.id,(p_payload->>'runId')::uuid,v_run);
  SELECT * INTO b FROM public.salesbots WHERE id=(v_run->>'botId')::uuid AND workspace_id=p_workspace_id FOR SHARE;
  IF NOT FOUND OR b.scope IS DISTINCT FROM 'individual' THEN RAISE EXCEPTION 'SalesBot individual indisponível nesta empresa.' USING ERRCODE='42501';END IF;
  v_snapshot:=v_snapshot||jsonb_build_object('run',v_run,'botName',b.name);
  v_preview:=jsonb_build_object('title','Parar execução do SalesBot','targetLabel',l.name,
   'changes',jsonb_build_array(jsonb_build_object('label','SalesBot','after',b.name),
    jsonb_build_object('label','Execução','before',v_run->>'status','after','Encerrada')),
   'effects',jsonb_build_array('Encerra somente a execução indicada nesta proposta.',
    'Mensagens já aceitas pelo WhatsApp não podem ser desfeitas.'));
 ELSIF p_kind='send_text' THEN
  IF l.phone IS DISTINCT FROM p_payload->>'leadPhone' THEN RAISE EXCEPTION 'O telefone do cliente mudou. Prepare uma nova proposta.' USING ERRCODE='40001';END IF;
  v_known_phone:=private.slim_copilot_phone(l.phone,true);
  IF v_known_phone IS NULL OR v_known_phone IS DISTINCT FROM p_payload->>'number' THEN
   RAISE EXCEPTION 'O destinatário não corresponde ao telefone internacional deste cliente.' USING ERRCODE='42501';
  END IF;
  -- Same routing contract as the server adapter: the newest direct identity must
  -- agree with the complete phone; no suffix matching and no session fallback.
  v_message_ids:=ARRAY[]::text[];
  FOR v_row IN SELECT a.payload->>'whatsapp_remote_jid' jid,a.payload->>'whatsapp_session_id' session_id,
   a.payload->>'session_id' legacy_session_id,a.payload->>'whatsapp_message_id' message_id
   FROM public.lead_activities a WHERE a.workspace_id=p_workspace_id AND a.lead_id=l.id
    AND a.type IN ('message_in','message_out') ORDER BY a.occurred_at DESC LIMIT 80 LOOP
   IF length(coalesce(v_row.message_id,'')) BETWEEN 1 AND 256 THEN v_message_ids:=array_append(v_message_ids,v_row.message_id); END IF;
   IF NOT v_route_found AND length(coalesce(v_row.jid,''))>0 THEN
    v_identity:=private.slim_copilot_jid_identity(v_row.jid);
    IF (v_identity->>'kind') IS DISTINCT FROM 'direct' OR (v_identity->>'number') IS DISTINCT FROM v_known_phone THEN
     RAISE EXCEPTION 'A identidade da conversa não corresponde ao telefone do cliente.' USING ERRCODE='42501';
    END IF;
    v_bound:=coalesce(nullif(v_row.session_id,''),nullif(v_row.legacy_session_id,''));v_route_found:=true;
   END IF;
  END LOOP;
  IF NOT v_route_found AND cardinality(v_message_ids)>0 THEN
   FOR v_row IN SELECT m.remote_jid,m.to_jid,m.session_id FROM public.whatsapp_web_messages m
    WHERE m.workspace_id=p_workspace_id AND m.message_id=ANY(v_message_ids) ORDER BY m.received_at DESC LIMIT 80 LOOP
    v_identity:=coalesce(private.slim_copilot_jid_identity(v_row.remote_jid),private.slim_copilot_jid_identity(v_row.to_jid));
    IF v_identity->>'kind'='direct' AND v_identity->>'number'=v_known_phone THEN
     v_bound:=v_row.session_id::text;v_route_found:=true;EXIT;
    END IF;
   END LOOP;
  END IF;
  IF NOT v_route_found AND private.slim_copilot_phone(l.phone,false) IS NULL
    AND private.slim_copilot_phone(l.phone_normalized,true) IS DISTINCT FROM v_known_phone THEN
   RAISE EXCEPTION 'Confirme o telefone com DDI antes do primeiro envio.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(l.custom_data->'whatsapp_session_id')='string' THEN v_preferred:=nullif(btrim(l.custom_data->>'whatsapp_session_id'),'');END IF;
  v_bound:=coalesce(v_bound,v_preferred);
  IF v_bound IS NOT NULL AND v_bound IS DISTINCT FROM p_payload->>'sessionId' THEN
   RAISE EXCEPTION 'A proposta deve usar a sessão original da conversa.' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('id',z.id,'provider',z.provider,'status',z.status,'instanceId',z.instance_id,
   'phone',z.phone_number,'deleted',coalesce(z.metadata->>'deleted','false')) INTO v_session
   FROM public.whatsapp_web_sessions z WHERE z.id=(p_payload->>'sessionId')::uuid AND z.workspace_id=p_workspace_id
    AND z.provider='evolution' AND z.status='conectado' AND coalesce(z.metadata->>'deleted','false')<>'true' FOR SHARE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'A sessão aprovada está indisponível ou desconectada.' USING ERRCODE='42501';END IF;
  v_snapshot:=v_snapshot||jsonb_build_object('session',v_session,'routing',jsonb_build_object(
   'boundSessionId',v_bound,'number',v_known_phone,'remoteJid',p_payload->>'remoteJid','conversationKey',p_payload->>'conversationKey'));
  v_preview:=jsonb_build_object('title','Enviar mensagem de texto','targetLabel',l.name||' · +'||v_known_phone,
   'channel','WhatsApp · '||coalesce(nullif(v_session->>'phone',''),'sessão '||(p_payload->>'sessionId')),
   'content',p_payload->>'text',
   'changes',jsonb_build_array(jsonb_build_object('label','Destinatário','after','+'||v_known_phone)),
   'effects',jsonb_build_array('Envia uma única mensagem, com o texto e a sessão exibidos nesta proposta.',
    'O envio não ativa nem pausa a IA desta conversa.',
    'Uma tentativa sem confirmação não será repetida automaticamente.'),
   'cost','Podem ocorrer custos da integração de WhatsApp.');
 END IF;
 IF v_preview IS NULL THEN RAISE EXCEPTION 'Ação não permitida no Copiloto.' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('snapshot',v_snapshot,'preview',v_preview);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_capture(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_capture(uuid,text,jsonb) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_contact_key(p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
DECLARE
 v_space constant text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 v text:=btrim(p_phone,v_space);
BEGIN
 -- Same pure contactPhoneKey rule, without granting access to Block 2's helper.
 IF left(v,1)='+' THEN v:=substr(v,2);END IF;
 v:=translate(v,'().-'||v_space,'');
 IF v ~ '^[0-9]{8,15}$' THEN RETURN v;END IF;
 RETURN NULL;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_contact_key(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_contact_key(text) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_dto(p_row jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT jsonb_strip_nulls(jsonb_build_object(
  'id',p_row->'id','workspaceId',p_row->'workspace_id','actorId',p_row->'actor_id',
  'version',p_row->'version','kind',p_row->'kind','status',p_row->'status',
  'preview',p_row->'preview','createdAt',p_row->'created_at','expiresAt',p_row->'expires_at','result',p_row->'result'));
$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_dto(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_dto(jsonb) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION private.slim_copilot_find_request(p_workspace_id uuid, p_request_id uuid, p_kind text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r private.slim_copilot_proposals; v_hash text;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identificador da proposta obrigatório.' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_request_id::text,61));
 v_hash:=encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'payload',p_payload)::text,'UTF8')),'hex');
 SELECT * INTO r FROM private.slim_copilot_proposals WHERE workspace_id=p_workspace_id AND request_id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.actor_id IS DISTINCT FROM auth.uid() OR r.request_sha256 IS DISTINCT FROM v_hash THEN
  RAISE EXCEPTION 'Esta solicitação já pertence a outra proposta.' USING ERRCODE='42501';
 END IF;
 RETURN private.slim_copilot_refresh(p_workspace_id,r.id);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_find_request(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_find_request(uuid,uuid,text,jsonb) TO "authenticated";

COMMIT;
SELECT '08-functions.sql' AS migration_batch,'OK' AS result;


-- 09-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_copilot_finish_text_impl(p_workspace_id uuid, p_proposal_id uuid, p_claim_token uuid, p_outcome jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r private.slim_copilot_proposals; v_hash text; v_status text; v_result jsonb; v_from text;
BEGIN
 -- JWT callers cannot fabricate provider receipts. This entrypoint is granted
 -- only to service_role and must run under that role, with the durable claim.
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR p_claim_token IS NULL THEN
  RAISE EXCEPTION 'Finalização reservada ao servidor.' USING ERRCODE='42501';
 END IF;
 v_status:=p_outcome->>'status';v_result:=p_outcome->'result';
 IF jsonb_typeof(p_outcome) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_outcome) k WHERE k NOT IN ('status','result'))
   OR (v_status IN ('succeeded','failed','uncertain','stale')) IS DISTINCT FROM true
   OR jsonb_typeof(v_result) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_result) k WHERE k NOT IN ('summary','receiptId','historyPending','code'))
   OR jsonb_typeof(v_result->'summary') IS DISTINCT FROM 'string'
   OR length(coalesce(v_result->>'summary','')) NOT BETWEEN 1 AND 2000
   OR (v_result ? 'receiptId' AND (jsonb_typeof(v_result->'receiptId') IS DISTINCT FROM 'string' OR length(v_result->>'receiptId') NOT BETWEEN 1 AND 300))
   OR (v_result ? 'historyPending' AND jsonb_typeof(v_result->'historyPending') IS DISTINCT FROM 'boolean')
   OR (v_result ? 'code' AND (jsonb_typeof(v_result->'code') IS DISTINCT FROM 'string' OR length(v_result->>'code')>120))
   OR (v_status='succeeded' AND length(coalesce(v_result->>'receiptId',''))=0) THEN
  RAISE EXCEPTION 'Recibo de envio inválido.' USING ERRCODE='22023';
 END IF;
 v_hash:=encode(sha256(convert_to(p_outcome::text,'UTF8')),'hex');
 SELECT * INTO r FROM private.slim_copilot_proposals WHERE id=p_proposal_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR r.kind<>'send_text' OR r.claim_token IS DISTINCT FROM p_claim_token THEN
  RAISE EXCEPTION 'Tentativa de envio não autorizada.' USING ERRCODE='42501';
 END IF;
 IF r.final_outcome_sha256 IS NOT NULL THEN
  IF r.final_outcome_sha256 IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'Esta tentativa já possui outro recibo final.' USING ERRCODE='42501';END IF;
  RETURN private.slim_copilot_dto(to_jsonb(r));
 END IF;
 IF r.status NOT IN ('executing','uncertain') THEN RAISE EXCEPTION 'Tentativa de envio fora de execução.' USING ERRCODE='42501';END IF;
 v_from:=r.status;
 UPDATE private.slim_copilot_proposals SET status=v_status,result=v_result,finished_at=clock_timestamp(),final_outcome_sha256=v_hash
  WHERE id=r.id RETURNING * INTO r;
 INSERT INTO private.slim_copilot_proposal_audit(proposal_id,workspace_id,actor_id,event,from_status,to_status)
  VALUES(r.id,r.workspace_id,NULL,'provider_result',v_from,r.status);
 RETURN private.slim_copilot_dto(to_jsonb(r));
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_finish_text_impl(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_finish_text_impl(uuid,uuid,uuid,jsonb) TO "service_role";
CREATE OR REPLACE FUNCTION private.slim_copilot_immutable_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','result','decided_at','decided_by','decision','claim_token','claimed_at','finished_at','final_outcome_sha256'])
   IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','result','decided_at','decided_by','decision','claim_token','claimed_at','finished_at','final_outcome_sha256']) THEN
  RAISE EXCEPTION 'Conteúdo e identidade da proposta são imutáveis.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_immutable_proposal() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_copilot_jid_identity(p_jid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
DECLARE
 v_space constant text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 v_jid text:=lower(btrim(p_jid,v_space)); v_local text; v_number text;
BEGIN
 -- Same identity test as whatsappIdentityFromJid. A historical invalid primary
 -- may use its direct to_jid; a valid group primary never becomes a phone.
 IF right(v_jid,length('@s.whatsapp.net'))='@s.whatsapp.net' THEN
  v_local:=left(v_jid,length(v_jid)-length('@s.whatsapp.net'));v_number:=split_part(v_local,':',1);
  IF v_number ~ '^[1-9][0-9]{7,14}$' THEN RETURN jsonb_build_object('kind','direct','number',v_number);END IF;
 ELSIF right(v_jid,length('@g.us'))='@g.us' THEN
  v_local:=left(v_jid,length(v_jid)-length('@g.us'));
  IF v_local ~ '^[0-9-]+$' AND length(replace(v_local,'-',''))>=8 THEN RETURN jsonb_build_object('kind','group','number',v_jid);END IF;
 END IF;
 RETURN NULL;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_jid_identity(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_jid_identity(text) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_list(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r record; v_result jsonb:='[]'::jsonb;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 FOR r IN SELECT id FROM private.slim_copilot_proposals
  WHERE workspace_id=p_workspace_id AND actor_id=auth.uid() ORDER BY created_at DESC,id LIMIT 100 LOOP
  v_result:=v_result||jsonb_build_array(private.slim_copilot_dto(private.slim_copilot_refresh(p_workspace_id,r.id)));
 END LOOP;
 RETURN v_result;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_list(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_list(uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_lock_run(p_workspace_id uuid, p_lead_id uuid, p_run_id uuid, p_expected jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_run jsonb;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 IF NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=p_lead_id AND l.workspace_id=p_workspace_id
  AND l.merged_into_id IS NULL AND l.status NOT IN ('deleted','archived','merged')
  AND coalesce(l.source,'')<>'whatsapp_group' AND coalesce(l.phone,'') NOT LIKE '%@g.us') THEN
  RAISE EXCEPTION 'Cliente indisponível nesta empresa.' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object('id',r.id,'leadId',r.lead_id,'botId',r.salesbot_id,'status',r.status,
  'blockId',r.current_block_id,'waitingUntil',r.waiting_until,'stoppedAt',r.stopped_at,'updatedAt',r.updated_at)
  INTO v_run FROM public.salesbot_runs r WHERE r.id=p_run_id AND r.workspace_id=p_workspace_id AND r.lead_id=p_lead_id FOR UPDATE;
 IF v_run IS NULL OR v_run IS DISTINCT FROM p_expected THEN
  RAISE EXCEPTION 'A execução mudou. Prepare uma nova proposta.' USING ERRCODE='40001';
 END IF;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_lock_run(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_lock_run(uuid,uuid,uuid,jsonb) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_payload(p_kind text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE v_keys text[]; v_required text[]; v_key text; v_result jsonb; v_id uuid; v_text text;
BEGIN
 IF (p_kind IN ('move_lead_stage','start_salesbot','stop_salesbot','send_text')) IS DISTINCT FROM true
   OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>32768 THEN
  RAISE EXCEPTION 'Ação ou conteúdo de proposta inválido.' USING ERRCODE='22023';
 END IF;
 CASE p_kind
  WHEN 'move_lead_stage' THEN v_keys:=ARRAY['leadId','stageId','note'];v_required:=ARRAY['leadId','stageId'];
  WHEN 'start_salesbot' THEN v_keys:=ARRAY['leadId','botId'];v_required:=v_keys;
  WHEN 'stop_salesbot' THEN v_keys:=ARRAY['leadId','runId'];v_required:=v_keys;
  WHEN 'send_text' THEN v_keys:=ARRAY['leadId','text','sessionId','remoteJid','number','conversationKey','leadPhone'];v_required:=v_keys;
 END CASE;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(v_keys)) THEN
  RAISE EXCEPTION 'A proposta contém parâmetros não permitidos.' USING ERRCODE='22023';
 END IF;
 FOREACH v_key IN ARRAY v_required LOOP
  IF jsonb_typeof(p_payload->v_key) IS DISTINCT FROM 'string' OR length(btrim(p_payload->>v_key))=0 THEN
   RAISE EXCEPTION 'A proposta está incompleta.' USING ERRCODE='22023';
  END IF;
 END LOOP;
 v_result:=p_payload;
 FOREACH v_key IN ARRAY ARRAY['leadId','stageId','botId','runId','sessionId'] LOOP
  IF p_payload ? v_key THEN
   BEGIN v_id:=(p_payload->>v_key)::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Referência de proposta inválida.' USING ERRCODE='22023';END;
   v_result:=jsonb_set(v_result,ARRAY[v_key],to_jsonb(v_id::text));
  END IF;
 END LOOP;
 IF p_payload ? 'note' THEN
  IF jsonb_typeof(p_payload->'note') IS DISTINCT FROM 'string' OR length(p_payload->>'note')>1000
    OR translate(p_payload->>'note',E'\n\r\t','') ~ '[[:cntrl:]]' THEN
   RAISE EXCEPTION 'Motivo da proposta inválido.' USING ERRCODE='22023';
  END IF;
 END IF;
 IF p_kind='send_text' THEN
  v_text:=p_payload->>'text';
  IF length(v_text)>4000 OR length(p_payload->>'leadPhone')>200 OR translate(v_text,E'\n\r\t','') ~ '[[:cntrl:]]'
    OR (p_payload->>'number') !~ '^[1-9][0-9]{7,14}$'
    OR (p_payload->>'remoteJid') IS DISTINCT FROM (p_payload->>'number')||'@s.whatsapp.net'
    OR (p_payload->>'conversationKey') IS DISTINCT FROM (v_result->>'sessionId')||':'||(p_payload->>'remoteJid') THEN
   RAISE EXCEPTION 'Texto ou destinatário individual inválido.' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN v_result;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_payload(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_payload(text,jsonb) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_phone(p_phone text, p_allow_bare boolean)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE v text; v_space text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF p_phone IS NULL THEN RETURN NULL; END IF;
 v:=translate(p_phone,v_space||'().-','');
 IF v !~ '^[+0-9]+$' THEN RETURN NULL; END IF;
 IF left(v,1)='+' THEN v:=substr(v,2);
 ELSIF left(v,2)='00' THEN v:=substr(v,3);
 ELSIF NOT p_allow_bare THEN RETURN NULL;
 END IF;
 IF v ~ '^[1-9][0-9]{7,14}$' THEN RETURN v; END IF;
 RETURN NULL;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_phone(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_phone(text,boolean) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_refresh(p_workspace_id uuid, p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r private.slim_copilot_proposals; v_from text;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 SELECT * INTO r FROM private.slim_copilot_proposals
  WHERE id=p_proposal_id AND workspace_id=p_workspace_id AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada para este operador e empresa.' USING ERRCODE='42501';END IF;
 v_from:=r.status;
 IF r.status='pending' AND r.expires_at<=clock_timestamp() THEN
  UPDATE private.slim_copilot_proposals SET status='expired',finished_at=clock_timestamp(),
   result=jsonb_build_object('summary','Esta proposta venceu. Prepare uma nova proposta antes de executar.') WHERE id=r.id RETURNING * INTO r;
 ELSIF r.status='executing' AND r.kind='send_text' AND r.claimed_at<clock_timestamp()-interval '2 minutes' THEN
  UPDATE private.slim_copilot_proposals SET status='uncertain',
   result=jsonb_build_object('summary','A tentativa ficou sem confirmação. Confira o histórico; este texto não será reenviado automaticamente.')
   WHERE id=r.id RETURNING * INTO r;
 END IF;
 IF v_from<>r.status THEN
  INSERT INTO private.slim_copilot_proposal_audit(proposal_id,workspace_id,actor_id,event,from_status,to_status)
   VALUES(r.id,r.workspace_id,NULL,'timeout',v_from,r.status);
 END IF;
 RETURN to_jsonb(r);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_refresh(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_refresh(uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_store(p_workspace_id uuid, p_request_id uuid, p_kind text, p_payload jsonb, p_snapshot jsonb, p_preview jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r private.slim_copilot_proposals; v_existing jsonb;
BEGIN
 v_existing:=private.slim_copilot_find_request(p_workspace_id,p_request_id,p_kind,p_payload);
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR jsonb_typeof(p_preview) IS DISTINCT FROM 'object'
   OR (p_snapshot#>>'{lead,id}') IS DISTINCT FROM (p_payload->>'leadId') THEN
  RAISE EXCEPTION 'Prévia não corresponde ao alvo da proposta.' USING ERRCODE='22023';
 END IF;
 INSERT INTO private.slim_copilot_proposals(workspace_id,actor_id,request_id,kind,request_sha256,payload,snapshot,preview)
 VALUES(p_workspace_id,auth.uid(),p_request_id,p_kind,
  encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'payload',p_payload)::text,'UTF8')),'hex'),p_payload,p_snapshot,p_preview)
 RETURNING * INTO r;
 INSERT INTO private.slim_copilot_proposal_audit(proposal_id,workspace_id,actor_id,event,to_status)
 VALUES(r.id,r.workspace_id,auth.uid(),'proposed',r.status);
 RETURN to_jsonb(r);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_store(uuid,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_store(uuid,uuid,text,jsonb,jsonb,jsonb) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_copilot_transition(p_workspace_id uuid, p_proposal_id uuid, p_version uuid, p_status text, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r private.slim_copilot_proposals;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 SELECT * INTO r FROM private.slim_copilot_proposals
  WHERE id=p_proposal_id AND workspace_id=p_workspace_id AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Versão ou identidade da proposta inválida.' USING ERRCODE='42501';END IF;
 IF r.status<>'pending' THEN RETURN to_jsonb(r); END IF;
 IF (p_status IN ('executing','succeeded','failed','rejected','stale')) IS DISTINCT FROM true
   OR (p_status='executing' AND r.kind<>'send_text')
   OR (p_status='succeeded' AND r.kind='send_text')
   OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR length(coalesce(p_result->>'summary','')) NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'Transição de proposta inválida.' USING ERRCODE='22023';
 END IF;
 UPDATE private.slim_copilot_proposals SET status=p_status,result=p_result,decided_at=clock_timestamp(),decided_by=auth.uid(),
  decision=CASE WHEN p_status='rejected' THEN 'reject' ELSE 'approve' END,
  claim_token=CASE WHEN p_status='executing' THEN gen_random_uuid() ELSE NULL END,
  claimed_at=CASE WHEN p_status='executing' THEN clock_timestamp() ELSE NULL END,
  finished_at=CASE WHEN p_status<>'executing' THEN clock_timestamp() ELSE NULL END
 WHERE id=r.id RETURNING * INTO r;
 INSERT INTO private.slim_copilot_proposal_audit(proposal_id,workspace_id,actor_id,event,from_status,to_status)
 VALUES(r.id,r.workspace_id,auth.uid(),r.decision,'pending',r.status);
 RETURN to_jsonb(r);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_copilot_transition(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_copilot_transition(uuid,uuid,uuid,text,jsonb) TO "authenticated";

COMMIT;
SELECT '09-functions.sql' AS migration_batch,'OK' AS result;


-- 10-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_create_lead_and_emit_impl(_workspace_id uuid, _crm_source_id uuid, _pipeline_id uuid, _stage_id uuid, _name text, _email text, _phone text, _value numeric, _request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_name text := btrim(_name);
 v_email text := nullif(btrim(_email),'');
 v_phone text := nullif(btrim(_phone,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'');
 v_phone_key text;
 v_value numeric := trim_scale(coalesce(_value,0));
 v_fingerprint text;
 v_receipt private.slim_funnel_write_requests;
 v_lead_id uuid;
 v_event_id uuid;
 v_response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para cadastrar o cliente.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _crm_source_id IS NULL OR _pipeline_id IS NULL OR _stage_id IS NULL
    OR v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 200
    OR length(coalesce(v_email,''))>254 OR length(coalesce(v_phone,''))>64
    OR v_value<0 OR v_value::text IN ('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'Cadastro de cliente inválido.' USING ERRCODE='22023';
 END IF;
 v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'crmSourceId',_crm_source_id,'pipelineId',_pipeline_id,'stageId',_stage_id,
  'name',v_name,'email',v_email,'phone',v_phone,'value',v_value
 )::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,23));
 SELECT * INTO v_receipt FROM private.slim_funnel_write_requests
  WHERE workspace_id=_workspace_id AND request_id=_request_id;
 IF FOUND THEN
  IF v_receipt.actor_id<>auth.uid() OR v_receipt.operation<>'create'
     OR v_receipt.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'Referência de operação já utilizada.' USING ERRCODE='22023';
  END IF;
  RETURN v_receipt.response;
 END IF;
 IF EXISTS (SELECT 1 FROM public.slim_stage_move_events WHERE id=_request_id) THEN
  RAISE EXCEPTION 'Referência de operação já utilizada.' USING ERRCODE='22023';
 END IF;
 PERFORM 1
 FROM public.crm_sources c
 JOIN public.pipelines p ON p.id=_pipeline_id AND p.workspace_id=_workspace_id
 JOIN public.pipeline_stages s ON s.id=_stage_id AND s.pipeline_id=p.id AND s.workspace_id=_workspace_id
 WHERE c.id=_crm_source_id AND c.workspace_id=_workspace_id
  AND (p.crm_source_id=c.id OR EXISTS (
   SELECT 1 FROM public.crm_source_funnels f
   WHERE f.workspace_id=_workspace_id AND f.crm_source_id=c.id AND f.pipeline_id=p.id
  ));
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Fonte, funil ou etapa indisponível para sua empresa.' USING ERRCODE='42501';
 END IF;
 v_phone_key := private.slim_funnel_contact_phone_key(v_phone);
 IF v_phone IS NOT NULL AND v_phone_key IS NULL THEN
  RAISE EXCEPTION 'Informe o telefone completo. Identificadores de grupo não são números de cliente.' USING ERRCODE='22023';
 END IF;
 IF v_phone_key IS NOT NULL THEN
  -- Serialize distinct Funnel creation requests for this workspace/phone too.
  -- This is an entry-point guard, not a global phone index or a historical repair.
  PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||':'||v_phone_key,47));
  IF EXISTS (
   SELECT 1 FROM public.leads l WHERE l.workspace_id=_workspace_id
    AND l.merged_into_id IS NULL
    AND (l.status IS NULL OR l.status NOT IN ('deleted','archived','merged'))
    AND private.slim_funnel_contact_phone_key(l.phone)=v_phone_key
  ) THEN
   RAISE EXCEPTION 'Este telefone já possui um contato. Use o cadastro existente; a etapa e os dados dele foram preservados.' USING ERRCODE='23505';
  END IF;
 END IF;
 INSERT INTO public.leads(
  workspace_id,crm_source_id,pipeline_id,stage_id,name,email,phone,phone_normalized,value,source,status,last_message_from
 ) VALUES (
  _workspace_id,_crm_source_id,_pipeline_id,_stage_id,v_name,v_email,v_phone,v_phone_key,v_value,
  'cadastro_manual_saude_slim','active','none'
 ) RETURNING id INTO v_lead_id;
 v_event_id := gen_random_uuid();
 INSERT INTO public.slim_stage_move_events(
  id,workspace_id,lead_id,actor_id,from_stage_id,to_stage_id,pipeline_id,event_kind
 ) VALUES (
  v_event_id,_workspace_id,v_lead_id,auth.uid(),NULL,_stage_id,_pipeline_id,'created'
 );
 v_response := jsonb_build_object('ok',true,'id',v_lead_id,'leadId',v_lead_id,
  'eventId',v_event_id,'state','pending');
 INSERT INTO private.slim_funnel_write_requests(
  workspace_id,request_id,actor_id,operation,request_fingerprint,response
 ) VALUES (_workspace_id,_request_id,auth.uid(),'create',v_fingerprint,v_response);
 RETURN v_response;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_create_lead_and_emit_impl(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_create_lead_and_emit_impl(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_dashboard_source_references()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN RAISE EXCEPTION 'Empresa do registro não pode ser alterada.' USING ERRCODE='42501'; END IF;
 IF NEW.lead_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=NEW.lead_id AND l.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Cliente não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='crm_form_submissions' THEN
  IF NOT EXISTS(SELECT 1 FROM public.crm_forms f WHERE f.id=NEW.form_id AND f.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Formulário não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='tracking_events' THEN
  IF NEW.site_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tracking_sites s WHERE s.id=NEW.site_id AND s.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Site não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='tracking_conversion_events' THEN
  IF NEW.event_row_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tracking_events e WHERE e.id=NEW.event_row_id AND e.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Evento não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_dashboard_source_references() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_dashboard_source_references() TO "service_role";
CREATE OR REPLACE FUNCTION private.slim_enqueue_audience_campaign(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid:=(_payload->>'workspaceId')::uuid; aid uuid:=(_payload->>'id')::uuid; req uuid:=coalesce((_payload->>'requestId')::uuid,gen_random_uuid()); c public.slim_audience_campaigns; aud public.crm_lead_audiences;
 k text:=_payload->>'kind'; ids uuid[]; l public.leads; campaign uuid; key text; ph text; n integer; skips integer:=0; hash text; sess uuid:=(_payload->>'sessionId')::uuid; agent uuid:=(_payload->>'agentId')::uuid; bot uuid:=(_payload->>'salesbotId')::uuid;
BEGIN
 IF NOT private.slim_workspace_access(w,'operator') THEN RAISE EXCEPTION 'Sem permissão para disparar nesta empresa.' USING ERRCODE='42501';END IF;
 SELECT * INTO aud FROM public.crm_lead_audiences WHERE id=aid AND workspace_id=w;
 IF NOT FOUND THEN RAISE EXCEPTION 'Público não encontrado nesta empresa.' USING ERRCODE='42501';END IF;
 IF k IS NULL OR k NOT IN ('text','agent','salesbot') OR jsonb_typeof(_payload->'leadIds') IS DISTINCT FROM 'array' OR jsonb_array_length(_payload->'leadIds') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Destinatários ou tipo de campanha inválidos.' USING ERRCODE='22023';END IF;
 SELECT array_agg(DISTINCT x::uuid ORDER BY x::uuid) INTO ids FROM jsonb_array_elements_text(_payload->'leadIds') x;
 hash:=encode(extensions.digest(((_payload-'requestId'-'leadIds')||jsonb_build_object('leadIds',ids))::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(w::text||req::text,0));
 SELECT * INTO c FROM public.slim_audience_campaigns WHERE workspace_id=w AND request_id=req;
 IF FOUND THEN
  IF c.created_by<>auth.uid() OR c.request_hash<>hash THEN RAISE EXCEPTION 'Identificador de envio já utilizado com outro conteúdo.' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('campaignId',c.id,'queued',(SELECT count(*) FROM public.slim_audience_deliveries WHERE campaign_id=c.id),'reused',true);
 END IF;
 IF k IN ('text','agent') THEN
  IF length(btrim(coalesce(_payload->>'message',''))) NOT BETWEEN 1 AND 4096 THEN RAISE EXCEPTION 'Mensagem inválida.' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_web_sessions s WHERE s.id=sess AND s.workspace_id=w AND s.provider='evolution' AND s.status='conectado' AND coalesce(s.metadata->>'deleted','false')<>'true') THEN RAISE EXCEPTION 'Selecione um WhatsApp conectado desta empresa.' USING ERRCODE='42501';END IF;
 END IF;
 IF k='agent' AND NOT EXISTS(SELECT 1 FROM public.conversation_ai_agents a WHERE a.id=agent AND a.workspace_id=w AND a.enabled) THEN RAISE EXCEPTION 'Selecione um Agente IA ativo desta empresa.' USING ERRCODE='42501';END IF;
 IF k='salesbot' AND NOT EXISTS(SELECT 1 FROM public.salesbots b WHERE b.id=bot AND b.workspace_id=w AND b.is_active) THEN RAISE EXCEPTION 'Selecione um SalesBot ativo desta empresa.' USING ERRCODE='42501';END IF;
 IF (SELECT count(*) FROM public.leads WHERE id=ANY(ids) AND workspace_id=w AND merged_into_id IS NULL)<>cardinality(ids) THEN RAISE EXCEPTION 'Destinatário não pertence à empresa ou foi mesclado.' USING ERRCODE='42501';END IF;
 INSERT INTO public.slim_audience_campaigns(workspace_id,audience_id,audience_name,created_by,request_id,request_hash,kind,message,session_id,agent_id,salesbot_id,delay_ms,delay_seconds,next_due_at)
 VALUES(w,aid,aud.name,auth.uid(),req,hash,k,coalesce(_payload->>'message',''),sess,agent,bot,coalesce((_payload->>'delayMs')::integer,1500),coalesce((_payload->>'delaySeconds')::integer,0),now()+make_interval(secs=>coalesce((_payload->>'delaySeconds')::integer,0))) RETURNING id INTO campaign;
 FOR l IN SELECT * FROM public.leads WHERE workspace_id=w AND id=ANY(ids) ORDER BY id LOOP
  IF l.status IN ('archived','deleted','merged') OR coalesce(l.custom_data->>'opt_out','false')='true' OR coalesce(l.custom_data->>'do_not_contact','false')='true' OR coalesce(l.custom_data->>'whatsapp_opt_out','false')='true' THEN skips:=skips+1;CONTINUE;END IF;
  ph:=regexp_replace(coalesce(l.phone,''),'[^0-9]','','g');
  IF k<>'salesbot' AND length(ph) NOT BETWEEN 8 AND 15 THEN skips:=skips+1;CONTINUE;END IF;
  key:=CASE WHEN k='salesbot' THEN l.id::text ELSE ph END;
  INSERT INTO public.slim_audience_deliveries(campaign_id,workspace_id,lead_id,recipient_key,phone,name) VALUES(campaign,w,l.id,key,ph,l.name) ON CONFLICT(campaign_id,recipient_key) DO NOTHING;
 END LOOP;
 SELECT count(*) INTO n FROM public.slim_audience_deliveries WHERE campaign_id=campaign;
 IF n=0 THEN RAISE EXCEPTION 'Nenhum destinatário elegível. Verifique telefones e bloqueios de contato.' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('campaignId',campaign,'queued',n,'skipped',cardinality(ids)-n,'reused',false);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_enqueue_audience_campaign(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_enqueue_audience_campaign(jsonb) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_funnel_contact_phone_key(_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
DECLARE
 v_whitespace constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 v_phone text := btrim(_phone,v_whitespace);
 v_digits text;
BEGIN
 IF left(v_phone,1)='+' THEN v_phone := substr(v_phone,2); END IF;
 v_digits := translate(v_phone,'().-'||v_whitespace,'');
 IF v_digits ~ '^[0-9]{8,15}$' THEN RETURN v_digits; END IF;
 RETURN NULL;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_funnel_contact_phone_key(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_group_agent_config_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF (NEW.id,NEW.workspace_id,NEW.created_by,NEW.created_at,NEW.creation_request_id) IS DISTINCT FROM (OLD.id,OLD.workspace_id,OLD.created_by,OLD.created_at,OLD.creation_request_id) OR NEW.creation_payload IS DISTINCT FROM OLD.creation_payload THEN RAISE EXCEPTION 'Identidade e tentativa original do agente são imutáveis.' USING ERRCODE='22023';END IF;
 IF OLD.metadata ? 'objective_tree' AND NEW.metadata->'objective_tree' IS DISTINCT FROM OLD.metadata->'objective_tree' THEN RAISE EXCEPTION 'A árvore arquivada não pode ser sobrescrita pelo editor de prompt.' USING ERRCODE='22023';END IF;
 NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond');RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_group_agent_config_update() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_guard_caller_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o public.slim_orders;d public.slim_order_documents;recipient text;bytes bytea;expected text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(NEW.workspace_id,'operator') THEN RAISE EXCEPTION 'Operador não autorizado para este documento.' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='slim_order_documents' THEN
  IF TG_OP<>'INSERT' OR NEW.requested_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'O documento é imutável e exige autoria válida.' USING ERRCODE='42501';END IF;
  SELECT * INTO o FROM public.slim_orders WHERE id=NEW.order_id AND workspace_id=NEW.workspace_id;
  IF NOT FOUND OR o.status<>'confirmed' THEN RAISE EXCEPTION 'Pedido indisponível ou cancelado.' USING ERRCODE='22023';END IF;
  IF NEW.version<>1 OR NEW.filename IS DISTINCT FROM ('pedido-'||(o.snapshot->>'number')||'.pdf') OR length(NEW.pdf_base64) NOT BETWEEN 20 AND 4000000 THEN RAISE EXCEPTION 'Identificação ou tamanho do documento inválido.' USING ERRCODE='22023';END IF;
  bytes:=decode(NEW.pdf_base64,'base64');
  IF substring(bytes from 1 for 5)<>decode('255044462d','hex') OR encode(extensions.digest(bytes,'sha256'),'hex') IS DISTINCT FROM NEW.sha256 THEN RAISE EXCEPTION 'O conteúdo não corresponde ao hash do PDF.' USING ERRCODE='22023';END IF;
  NEW.created_at:=clock_timestamp();RETURN NEW;
 END IF;
 IF NEW.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Autor do envio inválido.' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status<>'pending' OR NEW.status NOT IN ('accepted','rejected','uncertain') OR (to_jsonb(NEW)-ARRAY['status','message_id','last_error','finished_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','message_id','last_error','finished_at']) THEN RAISE EXCEPTION 'A tentativa não pode ser reaberta ou redirecionada.' USING ERRCODE='42501';END IF;
  IF NEW.status='accepted' AND length(btrim(coalesce(NEW.message_id,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Aceite exige o protocolo do provedor.' USING ERRCODE='22023';END IF;
  IF NEW.status='rejected' AND NEW.message_id IS NOT NULL THEN RAISE EXCEPTION 'Resultado de envio inconsistente.' USING ERRCODE='22023';END IF;
  IF NEW.last_error IS NOT NULL AND NEW.last_error !~ '^[A-Z0-9_]{1,80}$' THEN RAISE EXCEPTION 'Código de diagnóstico inválido.' USING ERRCODE='22023';END IF;
  NEW.finished_at:=clock_timestamp();RETURN NEW;
 END IF;
 IF NEW.status<>'pending' OR NEW.message_id IS NOT NULL OR NEW.last_error IS NOT NULL OR NEW.finished_at IS NOT NULL THEN RAISE EXCEPTION 'A nova tentativa precisa iniciar pendente.' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM public.slim_order_documents WHERE id=NEW.document_id AND workspace_id=NEW.workspace_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento de outra empresa ou inexistente.' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM public.slim_orders WHERE id=d.order_id AND workspace_id=NEW.workspace_id;
 IF NOT FOUND OR o.status<>'confirmed' THEN RAISE EXCEPTION 'Pedido indisponível ou cancelado.' USING ERRCODE='22023';END IF;
 SELECT '+'||regexp_replace(coalesce(l.phone,''),'[^0-9]','','g') INTO recipient FROM public.leads l WHERE l.id=o.customer_id AND l.workspace_id=NEW.workspace_id AND l.merged_into_id IS NULL AND l.status NOT IN ('archived','deleted','merged');
 IF recipient IS DISTINCT FROM NEW.phone THEN RAISE EXCEPTION 'O telefone do cliente mudou. Revise o destino antes de enviar.' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.whatsapp_web_sessions s WHERE s.id=NEW.session_id AND s.workspace_id=NEW.workspace_id AND s.provider='evolution' AND s.status='conectado' AND coalesce(s.metadata->>'deleted','false')<>'true') THEN RAISE EXCEPTION 'Canal de WhatsApp não autorizado ou desconectado.' USING ERRCODE='42501';END IF;
 expected:=encode(extensions.digest(d.id::text||'|'||d.sha256||'|'||d.order_id::text||'|'||NEW.session_id::text||'|'||NEW.phone||'|'||NEW.request_id::text,'sha256'),'hex');
 IF NEW.consent_sha256 IS DISTINCT FROM expected THEN RAISE EXCEPTION 'A aprovação não corresponde ao arquivo, cliente, canal e tentativa.' USING ERRCODE='22023';END IF;
 NEW.created_at:=clock_timestamp();NEW.approved_at:=NEW.created_at;RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_guard_caller_document() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_guard_caller_document() TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_guard_checkout_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NEW.actor_id IS DISTINCT FROM auth.uid() OR NOT private.slim_workspace_access(NEW.workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para encerrar esta tentativa.' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'A recuperação exige uma leitura atual da transação.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text||NEW.request_id::text,0));
 IF EXISTS(SELECT 1 FROM public.slim_orders o WHERE o.workspace_id=NEW.workspace_id AND o.request_id=NEW.request_id) THEN
  RAISE EXCEPTION 'Esta tentativa já possui um pedido. Consulte o histórico.' USING ERRCODE='22023';
 END IF;
 NEW.closed_at:=clock_timestamp();
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_guard_checkout_close() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_guard_checkout_close() TO "authenticated";

COMMIT;
SELECT '10-functions.sql' AS migration_batch,'OK' AS result;


-- 11-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_guard_order_change_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
DECLARE order_uuid uuid;order_status text;
BEGIN
 IF TG_OP<>'INSERT' OR auth.uid() IS NULL OR NOT private.slim_workspace_access(NEW.workspace_id,'operator') THEN
  RAISE EXCEPTION 'Operador não autorizado para este documento.' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'O documento exige uma leitura atual do pedido. Inicie uma nova tentativa.' USING ERRCODE='25001';
 END IF;
 IF TG_TABLE_NAME='slim_order_documents' THEN
  order_uuid:=NEW.order_id;
 ELSE
  SELECT order_id INTO order_uuid FROM public.slim_order_documents WHERE id=NEW.document_id AND workspace_id=NEW.workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento de outra empresa ou inexistente.' USING ERRCODE='42501';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slim-order-change|'||NEW.workspace_id::text||'|'||order_uuid::text,0));
 SELECT status INTO order_status FROM public.slim_orders WHERE id=order_uuid AND workspace_id=NEW.workspace_id;
 IF NOT FOUND OR order_status<>'confirmed'
  OR EXISTS(SELECT 1 FROM public.slim_order_changes c WHERE c.workspace_id=NEW.workspace_id AND c.order_id=order_uuid AND c.state='completed') THEN
  RAISE EXCEPTION 'Pedido indisponível, cancelado ou já alterado.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_guard_order_change_document() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_guard_order_change_document() TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_guard_whatsapp_message_origin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if old.session_id is distinct from new.session_id or old.workspace_id is distinct from new.workspace_id then
    raise exception 'A mensagem pertence a outra conexão de WhatsApp.' using errcode='23514';
  end if;
  return new;
end $function$
;
REVOKE ALL ON FUNCTION private.slim_guard_whatsapp_message_origin() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_guard_whatsapp_origin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare old_session text; new_session text; target_session text;
begin
  new_session:=nullif(btrim(new.custom_data->>'whatsapp_session_id'),'');
  if tg_op='UPDATE' then
    old_session:=nullif(btrim(old.custom_data->>'whatsapp_session_id'),'');
    if old_session is not null and (old_session is distinct from new_session or old.workspace_id is distinct from new.workspace_id) then
      raise exception 'O WhatsApp de origem deste atendimento não pode ser alterado. Use o card do outro número.' using errcode='23514';
    end if;
  end if;
  if new_session is not null and (tg_op='INSERT' or old_session is null) then
    if not exists(select 1 from public.whatsapp_web_sessions s where s.id::text=new_session and s.workspace_id=new.workspace_id) then
      raise exception 'A conexão de WhatsApp não pertence à empresa deste atendimento.' using errcode='23514';
    end if;
  end if;
  if new.merged_into_id is not null then
    select nullif(btrim(l.custom_data->>'whatsapp_session_id'),'') into target_session from public.leads l where l.id=new.merged_into_id and l.workspace_id=new.workspace_id;
    if new_session is not null and target_session is distinct from new_session then
      raise exception 'Atendimentos de números de WhatsApp diferentes não podem ser mesclados.' using errcode='23514';
    end if;
  end if;
  return new;
end $function$
;
REVOKE ALL ON FUNCTION private.slim_guard_whatsapp_origin() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_inbox_agent_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if new.active_conversation_agent_id is not null and not exists(select 1 from public.conversation_ai_agents a where a.id=new.active_conversation_agent_id and a.workspace_id=new.workspace_id) then
  raise exception 'Agente IA não pertence a esta empresa.' using errcode='42501';
 end if;
 if new.active_conversation_agent_id is distinct from old.active_conversation_agent_id or new.ai_paused is distinct from old.ai_paused then
  new.active_conversation_agent_version:=old.active_conversation_agent_version+1;
  new.active_conversation_agent_started_at:=case when new.active_conversation_agent_id is not null and not new.ai_paused then clock_timestamp() else null end;
 else new.active_conversation_agent_version:=old.active_conversation_agent_version;
 end if;
 return new;
end $function$
;
REVOKE ALL ON FUNCTION private.slim_inbox_agent_version() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_inbox_assert_target(p_workspace_id uuid, p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p join public.workspace_members m on m.workspace_id=p.current_workspace_id and m.user_id=p.id where p.id=auth.uid() and p.current_workspace_id=p_workspace_id) and not private.bcpll_support_workspace_allowed(p_workspace_id) then
  raise exception 'Sessão ou empresa ativa mudou. Reabra esta conversa.' using errcode='42501';
 end if;
 if not exists(select 1 from public.leads where id=p_lead_id and workspace_id=p_workspace_id and coalesce(phone,'') not like '%@g.us') then
  raise exception 'Conversa individual não encontrada nesta empresa.' using errcode='42501';
 end if;
end $function$
;
REVOKE ALL ON FUNCTION private.slim_inbox_assert_target(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_inbox_group_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.whatsapp_web_sessions s WHERE s.id=NEW.session_id AND s.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'A sessão não pertence à empresa do grupo.' USING ERRCODE='42501';END IF;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_inbox_group_scope() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_inbox_guard_run()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if old.stopped_at is not null then return old; end if;
 new.updated_at:=clock_timestamp(); return new;
end $function$
;
REVOKE ALL ON FUNCTION private.slim_inbox_guard_run() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_inbox_media_access(_path text, _level text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN split_part(_path,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND length(split_part(_path,'/',2))>0 AND length(split_part(_path,'/',3))>0 THEN private.slim_workspace_access(split_part(_path,'/',1)::uuid,_level) ELSE false END;
$function$
;
REVOKE ALL ON FUNCTION private.slim_inbox_media_access(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_inbox_media_access(text,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION private.slim_inbox_thread_exists(_ws uuid, _thread text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.leads l WHERE l.workspace_id=_ws AND l.id::text=_thread) OR EXISTS(SELECT 1 FROM public.whatsapp_groups g WHERE g.workspace_id=_ws AND _thread IN(g.id::text,'group:'||g.id::text,g.group_jid,'group:'||g.group_jid));
$function$
;
REVOKE ALL ON FUNCTION private.slim_inbox_thread_exists(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_inbox_thread_exists(uuid,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION private.slim_invitation_accept_impl(p_token uuid, p_actor_id uuid, p_approved boolean, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
 SET statement_timeout TO '20s'
AS $function$
DECLARE office_workspace uuid; inv public.workspace_invitations; member public.workspace_members; email_key text; actor_email text;
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
 SELECT wi.workspace_id INTO office_workspace FROM public.workspace_invitations wi JOIN public.workspaces office ON office.id=wi.workspace_id WHERE wi.token=p_token AND (wi.workspace_id='c49945db-1960-461a-9339-a43b8403bdd9'::uuid OR office.slug='jonata-cordeiro-local');
 office_workspace:=coalesce(office_workspace,'c49945db-1960-461a-9339-a43b8403bdd9'::uuid);
 base:=jsonb_build_object('version',1,'workspaceId',office_workspace,'actorId',p_actor_id,
  'invitationId',NULL,'acceptedAt',NULL,'membershipRole',NULL,'activeWorkspaceId',NULL,'status','rejected');
 SELECT private.slim_invitation_email(email) INTO email_key FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id=office_workspace;
 IF email_key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(('slim_invitation_email:'||office_workspace::text||':')||email_key,97));
 END IF;
 -- Even lookup locks only for a consistent result; it never writes business state.
 SELECT * INTO inv FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id=office_workspace FOR UPDATE;
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
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_accept_impl(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_invitation_accept_impl(uuid,uuid,boolean,text) TO "authenticated";

COMMIT;
SELECT '11-functions.sql' AS migration_batch,'OK' AS result;


-- 12-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_invitation_change_impl(p_workspace_id uuid, p_actor_id uuid, p_request_id uuid, p_action text, p_payload jsonb, p_expected_fingerprint text, p_approved boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
 SET statement_timeout TO '20s'
AS $function$
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
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_change_impl(uuid,uuid,uuid,text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_invitation_change_impl(uuid,uuid,uuid,text,jsonb,text,boolean) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_invitation_change_lookup_impl(p_workspace_id uuid, p_actor_id uuid, p_request_id uuid, p_action text, p_invitation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
 SET statement_timeout TO '20s'
AS $function$
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
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_change_lookup_impl(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_invitation_change_lookup_impl(uuid,uuid,uuid,text,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_invitation_context_impl(p_workspace_id uuid, p_actor_id uuid, p_action text, p_email text DEFAULT NULL::text, p_invitation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
 SET statement_timeout TO '20s'
AS $function$
BEGIN
 PERFORM private.slim_invitation_owner(p_workspace_id,p_actor_id);
 RETURN private.slim_invitation_context_value(p_workspace_id,p_actor_id,p_action,p_email,p_invitation_id)->'context';
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_context_impl(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_invitation_context_impl(uuid,uuid,text,text,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_invitation_context_value(p_workspace_id uuid, p_actor_id uuid, p_action text, p_email text, p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_context_value(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_invitation_email(p_email text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
DECLARE normalized text:=lower(btrim(p_email));
BEGIN
 IF length(normalized) NOT BETWEEN 3 AND 200 OR normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR normalized ~ '[[:cntrl:]]' THEN RETURN NULL; END IF;
 RETURN normalized;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_email(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_invitation_link_impl(p_workspace_id uuid, p_actor_id uuid, p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
 SET statement_timeout TO '20s'
AS $function$
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
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_link_impl(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_invitation_link_impl(uuid,uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_invitation_owner(p_workspace_id uuid, p_actor_id uuid, p_lock boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE actual_owner uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor_id
 OR (p_workspace_id IS DISTINCT FROM 'c49945db-1960-461a-9339-a43b8403bdd9'::uuid AND NOT EXISTS (SELECT 1 FROM public.workspaces office WHERE office.id=p_workspace_id AND office.slug='jonata-cordeiro-local')) THEN
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
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_owner(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_invitation_preview_impl(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
 SET statement_timeout TO '20s'
AS $function$
DECLARE office_workspace uuid; inv public.workspace_invitations; email_key text; workspace_name text;
BEGIN
 -- The definer identity itself is not evidence of a service request.
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Prévia disponível somente pelo serviço autorizado.' USING ERRCODE='42501';
 END IF;
 SELECT wi.workspace_id INTO office_workspace FROM public.workspace_invitations wi JOIN public.workspaces office ON office.id=wi.workspace_id WHERE wi.token=p_token AND (wi.workspace_id='c49945db-1960-461a-9339-a43b8403bdd9'::uuid OR office.slug='jonata-cordeiro-local');
 office_workspace:=coalesce(office_workspace,'c49945db-1960-461a-9339-a43b8403bdd9'::uuid);
 SELECT private.slim_invitation_email(email) INTO email_key FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id=office_workspace;
 IF email_key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(('slim_invitation_email:'||office_workspace::text||':')||email_key,97));
 END IF;
 SELECT * INTO inv FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id=office_workspace FOR SHARE;
 IF inv.id IS NULL THEN RETURN jsonb_build_object('version',1,'status','invalid','code','INVITATION_UNAVAILABLE'); END IF;
 SELECT name INTO workspace_name FROM public.workspaces WHERE id=inv.workspace_id;
 RETURN jsonb_build_object('version',1,'status','valid','workspaceId',inv.workspace_id,'invitationId',inv.id,
  'workspaceName',workspace_name,'email',inv.email,'accessRole',inv.access_role,'accessDays',inv.access_days,'isPartner',inv.is_partner,
  'invitationStatus',CASE WHEN inv.status='pending' AND inv.expires_at<=clock_timestamp() THEN 'expired' ELSE inv.status END,'expiresAt',inv.expires_at);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_preview_impl(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_invitation_preview_impl(uuid) TO "service_role";

COMMIT;
SELECT '12-functions.sql' AS migration_batch,'OK' AS result;


-- 13-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_invitation_summary(p_invitation workspace_invitations)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN p_invitation.id IS NULL THEN NULL ELSE jsonb_build_object(
  'id',p_invitation.id,'email',p_invitation.email,'accessRole',p_invitation.access_role,
  'accessDays',p_invitation.access_days,'roleType',p_invitation.role_type,'isPartner',p_invitation.is_partner,
  'status',p_invitation.status,'expiresAt',p_invitation.expires_at,'createdAt',p_invitation.created_at,
  'acceptedAt',p_invitation.accepted_at,
  'revision',encode(extensions.digest(to_jsonb(p_invitation)::text,'sha256'),'hex')) END;
$function$
;
REVOKE ALL ON FUNCTION private.slim_invitation_summary(workspace_invitations) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_leads_contact_phone_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
AS $function$
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
 IF (NEW.workspace_id IS DISTINCT FROM v_workspace AND NOT EXISTS (SELECT 1 FROM public.workspaces office WHERE office.id=NEW.workspace_id AND private.bcpll_is_workspace(office.id)))
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
$function$
;
REVOKE ALL ON FUNCTION private.slim_leads_contact_phone_guard() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.slim_legacy_sale_source(_workspace_id uuid, _lead_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('leadId',l.id,'workspaceId',l.workspace_id,'name',l.name,'status',l.status,'mergedIntoId',l.merged_into_id,'value',l.value,'createdAt',l.created_at,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('linkId',x.id,'productId',x.product_id,'quantity',x.quantity,'unitPrice',x.unit_price,'soldAt',x.sold_at,'productName',p.name,'stock',p.stock,'active',p.active) ORDER BY x.id) FROM public.lead_products x LEFT JOIN public.products p ON p.id=x.product_id AND p.workspace_id=x.workspace_id WHERE x.lead_id=l.id AND x.workspace_id=l.workspace_id AND x.kind='comprou'),'[]'::jsonb)) FROM public.leads l WHERE l.id=_lead_id AND l.workspace_id=_workspace_id AND l.source='pedido_saude_slim';
$function$
;
REVOKE ALL ON FUNCTION private.slim_legacy_sale_source(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_legacy_sale_source(uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_lookup_order_change(_workspace_id uuid, _order_id uuid, _request_id uuid, _operation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
DECLARE c public.slim_order_changes;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Operador não autorizado para consultar esta tentativa.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _order_id IS NULL OR _operation IS NULL OR _operation NOT IN ('edit','delete') THEN
  RAISE EXCEPTION 'Referência inválida.' USING ERRCODE='22023';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'A recuperação exige uma leitura atual do pedido. Inicie uma nova consulta.' USING ERRCODE='25001';
 END IF;
 -- This explicit recovery action can close an absent request. It never guesses that a mutation failed.
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,0));
 SELECT * INTO c FROM public.slim_order_changes WHERE workspace_id=_workspace_id AND id=_request_id;
 IF FOUND THEN
  IF c.actor_id<>auth.uid() OR c.order_id<>_order_id OR c.operation<>_operation THEN
   RAISE EXCEPTION 'A tentativa pertence a outro operador ou pedido.' USING ERRCODE='42501';
  END IF;
  RETURN private.slim_order_change_result(c);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.slim_orders WHERE workspace_id=_workspace_id AND id=_order_id) THEN
  RAISE EXCEPTION 'Pedido de outra empresa ou inexistente.' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.slim_orders WHERE workspace_id=_workspace_id AND request_id=_request_id) THEN
  RAISE EXCEPTION 'Referência já utilizada por outro pedido.' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.slim_order_changes(id,workspace_id,actor_id,order_id,operation,state)
  VALUES(_request_id,_workspace_id,auth.uid(),_order_id,_operation,'closed') RETURNING * INTO c;
 RETURN private.slim_order_change_result(c);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_lookup_order_change(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_lookup_order_change(uuid,uuid,uuid,text) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_move_lead_and_emit_impl(_workspace_id uuid, _lead_id uuid, _stage_id uuid, _request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_fingerprint text;
 v_receipt private.slim_funnel_write_requests;
 v_lead public.leads;
 v_stage public.pipeline_stages;
 v_pipeline public.pipelines;
 v_event public.slim_stage_move_events;
 v_response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para mover o cliente.' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _lead_id IS NULL OR _stage_id IS NULL THEN
  RAISE EXCEPTION 'Movimentação inválida.' USING ERRCODE='22023';
 END IF;
 v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'leadId',_lead_id,'stageId',_stage_id
 )::text,'UTF8')),'hex');
 -- Keep the original lock key and event ID compatible with in-flight requests.
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,23));
 SELECT * INTO v_receipt FROM private.slim_funnel_write_requests
  WHERE workspace_id=_workspace_id AND request_id=_request_id;
 IF FOUND THEN
  IF v_receipt.actor_id<>auth.uid() OR v_receipt.operation<>'move'
     OR v_receipt.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'Referência de movimentação já utilizada.' USING ERRCODE='22023';
  END IF;
  RETURN v_receipt.response;
 END IF;
 -- Requests successfully completed before this migration have an outbox event,
 -- but no receipt. Recognize them without moving the contact a second time.
 SELECT * INTO v_event FROM public.slim_stage_move_events WHERE id=_request_id;
 IF FOUND THEN
  IF v_event.workspace_id<>_workspace_id OR v_event.actor_id<>auth.uid()
     OR v_event.lead_id<>_lead_id OR v_event.to_stage_id<>_stage_id
     OR v_event.event_kind<>'moved' THEN
   RAISE EXCEPTION 'Referência de movimentação já utilizada.' USING ERRCODE='22023';
  END IF;
  v_response := jsonb_build_object('ok',true,'moved',true,'eventId',v_event.id,
   'state',v_event.status,'leadId',v_event.lead_id);
 ELSE
  SELECT * INTO v_lead FROM public.leads
   WHERE id=_lead_id AND workspace_id=_workspace_id AND merged_into_id IS NULL
    AND status NOT IN ('deleted','archived','merged') FOR UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Cliente indisponível nesta empresa.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_stage FROM public.pipeline_stages
   WHERE id=_stage_id AND workspace_id=_workspace_id;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Etapa indisponível nesta empresa.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_pipeline FROM public.pipelines
   WHERE id=v_stage.pipeline_id AND workspace_id=_workspace_id;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Funil indisponível nesta empresa.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.crm_sources c
   WHERE c.id=v_lead.crm_source_id AND c.workspace_id=_workspace_id
    AND (v_pipeline.crm_source_id=c.id OR EXISTS (
     SELECT 1 FROM public.crm_source_funnels f
     WHERE f.workspace_id=_workspace_id AND f.crm_source_id=c.id AND f.pipeline_id=v_pipeline.id
    ));
  IF NOT FOUND THEN
   RAISE EXCEPTION 'O funil não está disponível para a fonte deste cliente.' USING ERRCODE='42501';
  END IF;
  IF v_lead.stage_id IS NOT DISTINCT FROM v_stage.id
     AND v_lead.pipeline_id IS NOT DISTINCT FROM v_stage.pipeline_id THEN
   v_response := jsonb_build_object('ok',true,'moved',false,'eventId',NULL,
    'state','unchanged','leadId',v_lead.id);
  ELSE
   INSERT INTO public.slim_stage_move_events(
    id,workspace_id,lead_id,actor_id,from_stage_id,to_stage_id,pipeline_id,event_kind
   ) VALUES (
    _request_id,_workspace_id,v_lead.id,auth.uid(),v_lead.stage_id,v_stage.id,v_stage.pipeline_id,'moved'
   );
   UPDATE public.leads SET stage_id=v_stage.id,pipeline_id=v_stage.pipeline_id,updated_at=clock_timestamp()
    WHERE id=v_lead.id AND workspace_id=_workspace_id;
   v_response := jsonb_build_object('ok',true,'moved',true,'eventId',_request_id,
    'state','pending','leadId',v_lead.id);
  END IF;
 END IF;
 INSERT INTO private.slim_funnel_write_requests(
  workspace_id,request_id,actor_id,operation,request_fingerprint,response
 ) VALUES (_workspace_id,_request_id,auth.uid(),'move',v_fingerprint,v_response);
 RETURN v_response;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_move_lead_and_emit_impl(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_move_lead_and_emit_impl(uuid,uuid,uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_operational_references()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN RAISE EXCEPTION 'Empresa do registro não pode ser alterada.' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME IN ('lead_custom_field_values','tasks','crm_automation_jobs') THEN
  IF NEW.lead_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=NEW.lead_id AND l.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Cliente não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='lead_custom_field_values' THEN
  IF NOT EXISTS(SELECT 1 FROM public.lead_custom_fields f WHERE f.id=NEW.field_id AND f.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Campo não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='lead_custom_fields' THEN
  IF EXISTS(SELECT 1 FROM unnest(NEW.funnel_ids) x WHERE NOT EXISTS(SELECT 1 FROM public.pipelines p WHERE p.id=x AND p.workspace_id=NEW.workspace_id)) THEN RAISE EXCEPTION 'Funil do campo inválido.' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME IN ('crm_stage_automations','crm_automation_jobs') THEN
  IF NEW.pipeline_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pipelines p WHERE p.id=NEW.pipeline_id AND p.workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Funil não pertence a esta empresa.' USING ERRCODE='42501'; END IF;
  IF NEW.stage_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pipeline_stages s WHERE s.id=NEW.stage_id AND s.workspace_id=NEW.workspace_id AND (NEW.pipeline_id IS NULL OR s.pipeline_id=NEW.pipeline_id)) THEN RAISE EXCEPTION 'Etapa não pertence ao funil.' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_operational_references() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_operational_references() TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION private.slim_order_change_result(_change slim_order_changes)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object(
  'workspaceId',_change.workspace_id,'requestId',_change.id,'orderId',_change.order_id,
  'operation',_change.operation,'state',_change.state,'replacementOrderId',_change.replacement_order_id,
  'replacementStatus',o.status,
  'receipt',CASE WHEN o.id IS NOT NULL AND o.status='confirmed' THEN jsonb_build_object(
   'workspaceId',o.workspace_id,'requestId',o.request_id,'orderId',o.id,'number',o.snapshot->>'number',
   'status',o.status,'totalCents',o.total_cents) ELSE NULL END)
 FROM (SELECT 1) one LEFT JOIN public.slim_orders o ON o.id=_change.replacement_order_id AND o.workspace_id=_change.workspace_id;
$function$
;
REVOKE ALL ON FUNCTION private.slim_order_change_result(slim_order_changes) FROM PUBLIC,anon,authenticated;

COMMIT;
SELECT '13-functions.sql' AS migration_batch,'OK' AS result;


-- 14-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_reconcile_legacy_sale(_workspace_id uuid, _lead_id uuid, _fingerprint text, _stock_mode text, _payment jsonb, _approved boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE l public.leads;o public.slim_orders;w public.workspaces;p public.products;s jsonb;i jsonb;items jsonb:='[]';total numeric:=0;unit bigint;qty integer;at_time timestamptz;ids uuid[];order_id uuid:=gen_random_uuid();num bigint;snapshot jsonb;balance integer;note text;
BEGIN
 IF _approved IS DISTINCT FROM true OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN RAISE EXCEPTION 'A regularização exige aprovação do operador.' USING ERRCODE='42501';END IF;
 IF _stock_mode IS NULL OR _stock_mode NOT IN ('apply_missing','already_accounted') THEN RAISE EXCEPTION 'Informe se a baixa de estoque ainda falta ou já foi realizada.' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(_payment) IS DISTINCT FROM 'object' OR coalesce(_payment->>'method','') NOT IN ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') OR coalesce(_payment->>'status','') NOT IN ('paid','pending') OR coalesce(_payment->>'installments','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Informe os dados de pagamento revisados.' USING ERRCODE='22023';END IF;
 IF (_payment->>'installments')::integer NOT BETWEEN 1 AND 24 OR (_payment->>'method'<>'credit_card' AND (_payment->>'installments')::integer<>1) THEN RAISE EXCEPTION 'Parcelamento inválido.' USING ERRCODE='22023';END IF;
 SELECT * INTO l FROM public.leads WHERE id=_lead_id AND workspace_id=_workspace_id AND source='pedido_saude_slim' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registro anterior não pertence à empresa.' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM public.slim_orders WHERE workspace_id=_workspace_id AND legacy_lead_id=_lead_id;
 IF FOUND THEN RETURN jsonb_build_object('orderId',o.id,'number',o.snapshot->>'number','status',o.status,'reused',true);END IF;
 IF l.merged_into_id IS NOT NULL OR l.status IN ('archived','deleted','merged','lost') THEN RAISE EXCEPTION 'Registro arquivado, mesclado ou perdido exige revisão individual.' USING ERRCODE='22023';END IF;
 PERFORM x.id FROM public.lead_products x WHERE x.workspace_id=_workspace_id AND x.lead_id=_lead_id FOR UPDATE;
 SELECT array_agg(x.product_id ORDER BY x.product_id) INTO ids FROM public.lead_products x WHERE x.workspace_id=_workspace_id AND x.lead_id=_lead_id AND x.kind='comprou';
 IF ids IS NULL OR cardinality(ids) NOT BETWEEN 1 AND 100 OR cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) THEN RAISE EXCEPTION 'Faltam itens válidos ou há produtos repetidos. Nada foi regularizado.' USING ERRCODE='22023';END IF;
 PERFORM p1.id FROM public.products p1 WHERE p1.workspace_id=_workspace_id AND p1.id=ANY(ids) ORDER BY p1.id FOR UPDATE;
 s:=private.slim_legacy_sale_source(_workspace_id,_lead_id);
 IF _fingerprint IS DISTINCT FROM encode(extensions.digest(s::text,'sha256'),'hex') THEN RAISE EXCEPTION 'Os dados ou o estoque mudaram. Atualize a conferência antes de aprovar.' USING ERRCODE='22023';END IF;
 at_time:=l.created_at;
 FOR i IN SELECT * FROM jsonb_array_elements(s->'items') LOOP
  IF coalesce(i->>'quantity','') !~ '^[0-9]+([.]0+)?$' OR i->>'unitPrice' IS NULL THEN RAISE EXCEPTION 'Quantidade ou preço original não registrados.' USING ERRCODE='22023';END IF;
  qty:=(i->>'quantity')::numeric::integer;
  IF qty NOT BETWEEN 1 AND 999999 OR (i->>'unitPrice')::numeric<0 OR (i->>'unitPrice')::numeric*100<>trunc((i->>'unitPrice')::numeric*100) THEN RAISE EXCEPTION 'Preço ou quantidade original inválidos.' USING ERRCODE='22023';END IF;
  unit:=((i->>'unitPrice')::numeric*100)::bigint;
  IF unit::numeric*qty>99999999999999 THEN RAISE EXCEPTION 'Valor acima do limite.' USING ERRCODE='22023';END IF;
  SELECT * INTO p FROM public.products WHERE id=(i->>'productId')::uuid AND workspace_id=_workspace_id;
  IF NOT FOUND OR p.stock IS NULL OR p.stock<0 THEN RAISE EXCEPTION 'Produto ou saldo não disponível.' USING ERRCODE='22023';END IF;
  IF _stock_mode='apply_missing' AND p.stock<qty THEN RAISE EXCEPTION 'Saldo insuficiente para registrar a baixa pendente.' USING ERRCODE='22023';END IF;
  IF i->>'soldAt' IS NULL OR (i->>'soldAt')::timestamptz>clock_timestamp() THEN RAISE EXCEPTION 'Data da compra não registrada ou inválida.' USING ERRCODE='22023';END IF;
  at_time:=greatest(at_time,(i->>'soldAt')::timestamptz);
  items:=items||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'description','Descrição histórica não registrada; produto identificado pelo cadastro atual.','sku',coalesce(p.sku,''),'quantity',qty,'unitPriceCents',unit,'subtotalCents',unit*qty,'discountCents',0,'totalCents',unit*qty));
  total:=total+unit::numeric*qty;
 END LOOP;
 IF l.value IS NULL OR total>99999999999999 OR total IS DISTINCT FROM l.value::numeric*100 THEN RAISE EXCEPTION 'Total do registro diverge dos itens. É necessária conferência individual.' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT w FROM public.workspaces WHERE id=_workspace_id;
 note:='Regularização do registro anterior '||_lead_id::text||'. Valores líquidos dos vínculos originais; desconto original não discriminado. Pagamento informado pelo operador na regularização. '||CASE WHEN _stock_mode='apply_missing' THEN 'Operador confirmou que a baixa ainda faltava; saldo reduzido agora.' ELSE 'Operador declarou que o saldo atual já incluía esta venda; nenhuma nova baixa aplicada.' END;
 snapshot:=jsonb_build_object('version',1,'workspaceId',_workspace_id,'orderId',order_id,'requestId',order_id,'status','confirmed','confirmedAt',at_time,'cancelledAt',NULL,'cancellationReason',NULL,'customer',jsonb_build_object('id',l.id,'name',l.name,'email',coalesce(l.email,''),'phone',coalesce(l.phone,'')),'issuer',jsonb_build_object('name',w.name,'legalName',coalesce(w.legal_name,''),'document',coalesce(w.cnpj,'')),'items',items,'subtotalCents',total,'discountCents',0,'totalCents',total,'payment',_payment,'notes',note,'legacy',jsonb_build_object('leadId',_lead_id,'sourceFingerprint',_fingerprint,'stockMode',_stock_mode,'reviewedAt',clock_timestamp(),'reviewedBy',auth.uid()));
 INSERT INTO public.slim_orders(id,workspace_id,request_id,request_payload,created_by,customer_id,subtotal_cents,discount_cents,total_cents,snapshot,confirmed_at,legacy_lead_id) VALUES(order_id,_workspace_id,order_id,jsonb_build_object('source',s,'payment',_payment,'stockMode',_stock_mode),auth.uid(),l.id,total,0,total,snapshot,at_time,_lead_id) RETURNING order_number INTO num;
 UPDATE public.slim_orders AS saved SET snapshot=saved.snapshot||jsonb_build_object('number','SL-'||lpad(num::text,8,'0')) WHERE saved.id=order_id;
 FOR i IN SELECT * FROM jsonb_array_elements(items) LOOP
  IF _stock_mode='apply_missing' THEN UPDATE public.products SET stock=stock-(i->>'quantity')::integer WHERE id=(i->>'productId')::uuid AND workspace_id=_workspace_id RETURNING stock INTO balance;
  ELSE SELECT stock INTO balance FROM public.products WHERE id=(i->>'productId')::uuid AND workspace_id=_workspace_id;END IF;
  INSERT INTO public.slim_stock_movements(workspace_id,order_id,product_id,kind,quantity,balance_after,actor_id) VALUES(_workspace_id,order_id,(i->>'productId')::uuid,'sale',(i->>'quantity')::integer,balance,auth.uid());
 END LOOP;
 RETURN jsonb_build_object('orderId',order_id,'number','SL-'||lpad(num::text,8,'0'),'status','confirmed','reused',false);
END;$function$
;
REVOKE ALL ON FUNCTION private.slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean) TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_session_security_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT private.slim_session_security_error() IS NULL $function$
;
REVOKE ALL ON FUNCTION private.slim_session_security_allowed() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_session_security_allowed() TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_session_security_error()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
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
$function$
;
REVOKE ALL ON FUNCTION private.slim_session_security_error() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_session_security_error() TO "authenticated";
CREATE OR REPLACE FUNCTION private.slim_workspace_access(_workspace_id uuid, _level text DEFAULT 'member'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=_workspace_id AND w.owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_workspace_id AND m.user_id=auth.uid() AND (m.access_expires_at IS NULL OR m.access_expires_at>now()) AND CASE _level WHEN 'admin' THEN m.role IN ('owner','admin') WHEN 'operator' THEN coalesce(m.role_type,'funcionario')<>'visualizador' WHEN 'member' THEN true ELSE false END));
$function$
;
REVOKE ALL ON FUNCTION private.slim_workspace_access(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.slim_workspace_access(uuid,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.ai_brain_chunk_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_content text;v_pos integer;v_idx integer:=0;v_step integer:=1000;
begin
 if tg_op='UPDATE' then delete from public.ai_brain_chunks where source_id=new.id; end if;
 if new.enabled and new.source_type in ('text','promotion') then
  v_content:=btrim(coalesce(new.content,''));
  v_pos:=1;
  while v_pos<=length(v_content) loop
   insert into public.ai_brain_chunks(source_id,workspace_id,chunk_index,content)
    values(new.id,new.workspace_id,v_idx,substring(v_content from v_pos for 1200));
   v_pos:=v_pos+v_step;v_idx:=v_idx+1;
  end loop;
 end if;
 return new;
end $function$
;
REVOKE ALL ON FUNCTION ai_brain_chunk_source() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ai_brain_chunk_source() TO PUBLIC,"anon","authenticated","service_role";
CREATE OR REPLACE FUNCTION public.ai_brain_validate_reply(p_workspace_id uuid, p_reply text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_term text;v_url text;v_found boolean;
begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=auth.uid()) then
 raise exception 'not_authorized'; end if;
 for v_term in select term from public.ai_brain_blocked_terms where workspace_id=p_workspace_id and enabled loop
  if position(lower(v_term) in lower(coalesce(p_reply,''))) > 0 then
   return jsonb_build_object('allowed',false,'reason','blocked_term');
  end if;
 end loop;
 for v_url in select (regexp_matches(coalesce(p_reply,''),'https?://[^[:space:]<>"''()]+','g'))[1] loop
  v_url := rtrim(v_url, '.,;!?');
  select exists(select 1 from public.ai_brain_sources where workspace_id=p_workspace_id and source_type='url' and enabled and rtrim(url,'/')=rtrim(v_url,'/')) into v_found;
  if not v_found then return jsonb_build_object('allowed',false,'reason','unapproved_link'); end if;
 end loop;
 return jsonb_build_object('allowed',true);
end $function$
;
REVOKE ALL ON FUNCTION ai_brain_validate_reply(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ai_brain_validate_reply(uuid,text) TO "anon","authenticated","service_role";
CREATE OR REPLACE FUNCTION public.bcpll_create_email_campaign(_request_id uuid, _name text, _subject text, _body text, _lead_ids uuid[] DEFAULT '{}'::uuid[], _manual_emails text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ws uuid:=public.bcpll_current_workspace(); campaign public.bcpll_email_campaigns; fp text; recipient record; total integer:=0;
BEGIN
 IF NOT private.slim_workspace_access(ws,'operator') THEN RAISE EXCEPTION 'Sem permissão para criar campanhas.' USING ERRCODE='42501'; END IF;
 IF _request_id IS NULL OR length(trim(coalesce(_name,''))) NOT BETWEEN 1 AND 120 OR length(trim(coalesce(_subject,''))) NOT BETWEEN 1 AND 200 OR length(coalesce(_body,'')) NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Preencha nome, assunto e mensagem.' USING ERRCODE='22023'; END IF;
 IF coalesce(cardinality(_lead_ids),0)+coalesce(cardinality(_manual_emails),0)>500 THEN RAISE EXCEPTION 'Selecione até 500 destinatários por campanha.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(_lead_ids) AS selected(lead_id) WHERE NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=selected.lead_id AND l.workspace_id=ws)) THEN RAISE EXCEPTION 'Seleção de clientes inválida para este workspace.' USING ERRCODE='42501'; END IF;
 fp:=md5(jsonb_build_object('name',_name,'subject',_subject,'body',_body,'leads',_lead_ids,'emails',_manual_emails)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended('bcpll_campaign:'||ws::text||':'||_request_id::text,119));
 SELECT * INTO campaign FROM public.bcpll_email_campaigns WHERE workspace_id=ws AND request_id=_request_id;
 IF campaign.id IS NOT NULL THEN
  IF campaign.fingerprint<>fp THEN RAISE EXCEPTION 'Tentativa já utilizada com outros dados.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('id',campaign.id,'recipients',(SELECT count(*) FROM public.bcpll_email_outbox WHERE campaign_id=campaign.id),'status',campaign.status);
 END IF;
 INSERT INTO public.bcpll_email_campaigns(workspace_id,name,subject,body_text,request_id,fingerprint,created_by)
  VALUES(ws,trim(_name),trim(_subject),_body,_request_id,fp,auth.uid()) RETURNING * INTO campaign;
 FOR recipient IN SELECT DISTINCT ON (email) * FROM (
  SELECT lower(trim(l.email)) email,l.id lead_id,l.name FROM public.leads l WHERE l.workspace_id=ws AND l.id=ANY(_lead_ids)
  UNION ALL SELECT lower(trim(e)),NULL::uuid,''::text FROM unnest(_manual_emails)e
 ) emails WHERE email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' ORDER BY email,lead_id NULLS LAST LOOP
  INSERT INTO public.bcpll_email_outbox(workspace_id,campaign_id,lead_id,to_email,subject,body_text,status,idempotency_key)
   VALUES(ws,campaign.id,recipient.lead_id,recipient.email,
    replace(replace(_subject,'{{nome}}',coalesce(recipient.name,'')),'{{email}}',recipient.email),
    replace(replace(_body,'{{nome}}',coalesce(recipient.name,'')),'{{email}}',recipient.email),'draft','campaign:'||campaign.id::text||':'||recipient.email);
  total:=total+1;
 END LOOP;
 IF total=0 THEN RAISE EXCEPTION 'Nenhum destinatário com e-mail válido.' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('id',campaign.id,'recipients',total,'status','draft');
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_create_email_campaign(uuid,text,text,text,uuid[],text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_create_email_campaign(uuid,text,text,text,uuid[],text[]) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_create_support(_email text, _password text, _full_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
DECLARE ws uuid:=public.bcpll_current_workspace();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.bcpll_workspaces WHERE workspace_id=ws AND owner_id=auth.uid()) THEN
  RAISE EXCEPTION 'Somente o titular pode criar contas de suporte.' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.workspaces WHERE id=ws FOR UPDATE;
 IF (SELECT count(*) FROM public.workspace_members m JOIN public.bcpll_workspaces b ON b.workspace_id=m.workspace_id
  WHERE m.workspace_id=ws AND m.user_id<>b.owner_id AND NOT private.bcpll_is_platform_support(m.user_id))>=4 THEN
  RAISE EXCEPTION 'Limite de 4 contas de suporte atingido. Remova um suporte para liberar uma vaga.' USING ERRCODE='23514';
 END IF;
 RETURN private.bcpll_provision_account(_email,_password,_full_name,ws);
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_create_support(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_create_support(text,text,text) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_current_workspace()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result uuid;
 product text:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-office-product','');
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_session_security_allowed() THEN
  RAISE EXCEPTION 'Entre na sua conta BCPLL para continuar.' USING ERRCODE='42501';
 END IF;

 IF product='escritorio-marcos-mello' THEN
  SELECT w.id INTO result FROM public.workspaces w JOIN public.bcpll_workspaces b ON b.workspace_id=w.id
   WHERE w.slug='escritorio-marcos-mello' AND private.slim_workspace_access(w.id,'member')
   AND (w.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND lower(u.email)='ruanandradenegocios@hotmail.com'));
  IF result IS NULL THEN RAISE EXCEPTION 'Esta conta não possui acesso ao Escritório Marcos Mello.' USING ERRCODE='42501'; END IF;
  RETURN result;
 END IF;
 IF product<>'' THEN RAISE EXCEPTION 'Escritório não autorizado.' USING ERRCODE='42501'; END IF;
 IF private.bcpll_is_platform_support(auth.uid()) THEN
  SELECT c.workspace_id INTO result FROM private.bcpll_support_context c
   WHERE c.user_id=auth.uid() AND private.slim_workspace_access(c.workspace_id,'member');
  IF result IS NULL THEN
   SELECT b.workspace_id INTO result FROM public.bcpll_workspaces b
    WHERE private.slim_workspace_access(b.workspace_id,'member') ORDER BY b.created_at,b.workspace_id LIMIT 1;
  END IF;
 ELSE
  SELECT p.current_workspace_id INTO result FROM public.profiles p
   JOIN public.bcpll_workspaces b ON b.workspace_id=p.current_workspace_id
   WHERE p.id=auth.uid() AND private.slim_workspace_access(b.workspace_id,'member');
 END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'Esta conta não possui um workspace BCPLL ativo.' USING ERRCODE='42501'; END IF;
 RETURN result;
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_current_workspace() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_current_workspace() TO "authenticated","service_role";

COMMIT;
SELECT '14-functions.sql' AS migration_batch,'OK' AS result;


-- 15-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION public.bcpll_email_campaign_action(_campaign_id uuid, _action text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ws uuid:=public.bcpll_current_workspace(); current_status text;
BEGIN
 IF NOT private.slim_workspace_access(ws,'operator') THEN RAISE EXCEPTION 'Sem permissão para gerenciar campanhas.' USING ERRCODE='42501'; END IF;
 SELECT status INTO current_status FROM public.bcpll_email_campaigns WHERE id=_campaign_id AND workspace_id=ws FOR UPDATE;
 IF current_status IS NULL THEN RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE='42501'; END IF;
 IF _action='start' AND current_status IN ('draft','paused','sending') THEN
  UPDATE public.bcpll_email_campaigns SET status='sending' WHERE id=_campaign_id;
  UPDATE public.bcpll_email_outbox SET status='queued' WHERE campaign_id=_campaign_id AND status='draft';
 ELSIF _action='pause' AND current_status='sending' THEN UPDATE public.bcpll_email_campaigns SET status='paused' WHERE id=_campaign_id;
 ELSIF _action='cancel' AND current_status IN ('draft','paused','sending') THEN
  UPDATE public.bcpll_email_campaigns SET status='cancelled' WHERE id=_campaign_id;
  UPDATE public.bcpll_email_outbox SET status='cancelled' WHERE campaign_id=_campaign_id AND status IN ('draft','queued');
 ELSIF _action='retry_failed' AND current_status<>'cancelled' THEN
  UPDATE public.bcpll_email_outbox SET status='queued',last_error=NULL WHERE campaign_id=_campaign_id AND status='failed';
  UPDATE public.bcpll_email_campaigns SET status='sending' WHERE id=_campaign_id;
 ELSE RAISE EXCEPTION 'Esta ação não está disponível no estado atual.' USING ERRCODE='22023'; END IF;
 RETURN true;
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_email_campaign_action(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_email_campaign_action(uuid,text) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_email_claim(_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE message public.bcpll_email_outbox;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR NOT private.bcpll_is_workspace(_workspace_id) THEN RAISE EXCEPTION 'Processador de e-mail não autorizado.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bcpll_email_rate:'||_workspace_id::text,121));
 -- Never automatically resend an unconfirmed provider attempt after a crash.
 UPDATE public.bcpll_email_outbox SET status='uncertain',last_error='Envio sem confirmação. Confira a pasta Enviados antes de qualquer nova tentativa.' WHERE workspace_id=_workspace_id AND status='sending' AND claimed_at<clock_timestamp()-interval '10 minutes';
 IF EXISTS(SELECT 1 FROM public.bcpll_email_outbox WHERE workspace_id=_workspace_id AND claimed_at>clock_timestamp()-interval '2 seconds') THEN RETURN NULL; END IF;
 SELECT o.* INTO message FROM public.bcpll_email_outbox o LEFT JOIN public.bcpll_email_campaigns c ON c.id=o.campaign_id
  WHERE o.workspace_id=_workspace_id AND o.status='queued' AND (o.campaign_id IS NULL OR c.status='sending') ORDER BY o.created_at,o.id FOR UPDATE OF o SKIP LOCKED LIMIT 1;
 IF message.id IS NULL THEN RETURN NULL; END IF;
 UPDATE public.bcpll_email_outbox SET status='sending',claimed_at=clock_timestamp() WHERE id=message.id RETURNING * INTO message;
 RETURN to_jsonb(message);
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_email_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_email_claim(uuid) TO "service_role";
CREATE OR REPLACE FUNCTION public.bcpll_email_finish(_id uuid, _status text, _provider_id text DEFAULT NULL::text, _error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ws uuid; campaign uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Processador de e-mail não autorizado.' USING ERRCODE='42501'; END IF;
 IF _status NOT IN ('sent','failed','uncertain') OR (_status='sent' AND nullif(_provider_id,'') IS NULL) THEN RAISE EXCEPTION 'Resultado de envio inválido.' USING ERRCODE='22023'; END IF;
 SELECT workspace_id,campaign_id INTO ws,campaign FROM public.bcpll_email_outbox WHERE id=_id AND status='sending' FOR UPDATE;
 IF ws IS NULL OR NOT private.bcpll_is_workspace(ws) THEN RETURN false; END IF;
 UPDATE public.bcpll_email_outbox SET status=_status,provider_message_id=_provider_id,last_error=left(_error,500),sent_at=CASE WHEN _status='sent' THEN clock_timestamp() ELSE NULL END WHERE id=_id;
 IF campaign IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bcpll_email_outbox WHERE campaign_id=campaign AND status IN ('draft','queued','sending')) THEN UPDATE public.bcpll_email_campaigns SET status='completed' WHERE id=campaign AND status='sending'; END IF;
 RETURN true;
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_email_finish(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_email_finish(uuid,text,text,text) TO "service_role";
CREATE OR REPLACE FUNCTION public.bcpll_enqueue_bot_email(_workspace_id uuid, _lead_id uuid, _subject text, _body text, _key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE contact public.leads; message_id uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR NOT private.bcpll_is_workspace(_workspace_id) THEN RAISE EXCEPTION 'Enfileiramento não autorizado.' USING ERRCODE='42501'; END IF;
 SELECT * INTO contact FROM public.leads WHERE id=_lead_id AND workspace_id=_workspace_id;
 IF contact.id IS NULL OR coalesce(contact.email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Cliente sem e-mail válido neste workspace.' USING ERRCODE='22023'; END IF;
 IF length(coalesce(_subject,'')) NOT BETWEEN 1 AND 200 OR length(coalesce(_body,'')) NOT BETWEEN 1 AND 100000 OR length(coalesce(_key,'')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Mensagem inválida.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.bcpll_email_outbox(workspace_id,lead_id,to_email,subject,body_text,status,idempotency_key)
 VALUES(_workspace_id,contact.id,lower(trim(contact.email)),_subject,_body,'queued','salesbot:'||_key)
 ON CONFLICT(workspace_id,idempotency_key) DO NOTHING RETURNING id INTO message_id;
 IF message_id IS NULL THEN SELECT id INTO message_id FROM public.bcpll_email_outbox WHERE workspace_id=_workspace_id AND idempotency_key='salesbot:'||_key; END IF;
 RETURN message_id;
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_enqueue_bot_email(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_enqueue_bot_email(uuid,uuid,text,text,text) TO "service_role";
CREATE OR REPLACE FUNCTION public.bcpll_profile_workspace(_profile_id uuid, _original uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF _profile_id=auth.uid() AND (private.bcpll_is_platform_support(auth.uid()) OR
 coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-office-product','')='escritorio-marcos-mello') THEN
  RETURN public.bcpll_current_workspace();
 END IF;
 RETURN _original;
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_profile_workspace(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_profile_workspace(uuid,uuid) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_remove_support(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ws uuid:=public.bcpll_current_workspace();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.bcpll_workspaces WHERE workspace_id=ws AND owner_id=auth.uid() AND owner_id<>_user_id) THEN RAISE EXCEPTION 'Somente o titular pode remover um suporte.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.workspaces WHERE id=ws FOR UPDATE;
 DELETE FROM public.workspace_members WHERE workspace_id=ws AND user_id=_user_id;
 RETURN FOUND;
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_remove_support(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_remove_support(uuid) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_salesbot_delete_v2(p_bot_local_id text, p_expected_revision integer, p_request_id uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_ws uuid;
  v_id uuid;
  v_revision integer;
  v_deleted integer;
begin
 PERFORM public.bcpll_current_workspace();
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if nullif(btrim(p_bot_local_id), '') is null
     or p_expected_revision is null or p_expected_revision <= 0 then
    raise exception 'salesbot_invalid_delete_request';
  end if;

  select current_workspace_id into v_ws
  from public.bcpll_profiles where id = auth.uid();
  if v_ws is null then raise exception 'workspace_not_found'; end if;
  perform 1 from public.workspace_members
  where workspace_id = v_ws and user_id = auth.uid();
  if not found then raise exception 'workspace_forbidden'; end if;

  select id, revision into v_id, v_revision
  from public.salesbots
  where workspace_id = v_ws
    and (local_id = p_bot_local_id
      or (local_id is null and id::text = p_bot_local_id))
  for update;
  if not found then
    return jsonb_build_object('ok', true, 'alreadyDeleted', true, 'requestId', p_request_id);
  end if;
  if v_revision is distinct from p_expected_revision then
    raise exception 'salesbot_revision_conflict';
  end if;

  -- Existing FK cascades remove child records atomically. Referenced campaigns
  -- keep their restrictive FK, so a failure rolls the entire deletion back.
  delete from public.salesbots
  where id = v_id and workspace_id = v_ws and revision = p_expected_revision;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then raise exception 'salesbot_delete_not_confirmed'; end if;
  return jsonb_build_object('ok', true, 'deleted', true, 'requestId', p_request_id);
end;
$function$
;
REVOKE ALL ON FUNCTION bcpll_salesbot_delete_v2(text,integer,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_salesbot_delete_v2(text,integer,uuid,text) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_salesbot_save_graph_v2(p_bot_local_id text, p_expected_revision integer, p_base_block_local_ids text[], p_bot jsonb, p_blocks jsonb, p_request_id uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_ws uuid;v_id uuid;v_rev integer;v_base text[];v_count integer;v_row jsonb;v_ids text[];v_deleted integer;v_new boolean:=false;
begin
 PERFORM public.bcpll_current_workspace();
 select current_workspace_id into v_ws from public.bcpll_profiles where id=auth.uid();
 if v_ws is null then raise exception 'workspace_not_found'; end if;
 perform 1 from public.workspace_members where workspace_id=v_ws and user_id=auth.uid();
 if not found then raise exception 'workspace_forbidden'; end if;
 select id,revision into v_id,v_rev from public.salesbots where workspace_id=v_ws and local_id=p_bot_local_id for update;
 if v_id is null then
  if p_expected_revision is not null then raise exception 'salesbot_missing_for_expected_revision'; end if;
  insert into public.salesbots(workspace_id,local_id,name,scope,gatilhos,settings)
   values(v_ws,p_bot_local_id,coalesce(p_bot->>'name','Novo bot'),coalesce(p_bot->>'scope','individual'),coalesce(p_bot->'gatilhos','[]'::jsonb),p_bot)
   returning id,revision into v_id,v_rev;
  v_new:=true;
 else
  if p_expected_revision is distinct from v_rev then raise exception 'salesbot_revision_conflict'; end if;
  select coalesce(array_agg(local_id order by local_id),array[]::text[]) into v_base from public.salesbot_blocks where salesbot_id=v_id;
  select coalesce(array_agg(x order by x),array[]::text[]) into v_ids from unnest(coalesce(p_base_block_local_ids,array[]::text[])) x;
  if v_base is distinct from v_ids then raise exception 'salesbot_incomplete_base'; end if;
  update public.salesbots set name=coalesce(p_bot->>'name',name),scope=coalesce(p_bot->>'scope',scope),
   gatilhos=coalesce(p_bot->'gatilhos',gatilhos),settings=p_bot,revision=revision+1,updated_at=now()
   where id=v_id returning revision into v_rev;
 end if;
 select count(*) into v_count from public.salesbot_blocks where salesbot_id=v_id;
 delete from public.salesbot_blocks where salesbot_id=v_id;
 for v_row in select value from jsonb_array_elements(coalesce(p_blocks,'[]'::jsonb)) loop
  insert into public.salesbot_blocks(id,salesbot_id,workspace_id,local_id,type,config,position_x,position_y,next_block_id)
   values((v_row->>'id')::uuid,v_id,v_ws,v_row->>'local_id',v_row->>'type',coalesce(v_row->'config','{}'::jsonb),
   coalesce((v_row->>'position_x')::integer,0),coalesce((v_row->>'position_y')::integer,0),nullif(v_row->>'next_block_id','')::uuid);
 end loop;
 insert into public.salesbot_revisions(workspace_id,salesbot_id,revision,source_event,actor_user_id,request_id)
 values(v_ws,v_id,v_rev,p_source,auth.uid(),p_request_id);
 return jsonb_build_object('id',v_id,'revision',v_rev,'baseBlockLocalIds',
  coalesce((select jsonb_agg(local_id order by local_id) from public.salesbot_blocks where salesbot_id=v_id),'[]'::jsonb),
  'deletedBlockCount',greatest(v_count-coalesce(jsonb_array_length(p_blocks),0),0),'requestId',p_request_id);
end $function$
;
REVOKE ALL ON FUNCTION bcpll_salesbot_save_graph_v2(text,integer,text[],jsonb,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_salesbot_save_graph_v2(text,integer,text[],jsonb,jsonb,uuid,text) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_salesbot_set_active_v2(p_bot_local_id text, p_expected_revision integer, p_is_active boolean, p_request_id uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_ws uuid;v_id uuid;v_rev integer;
begin
 PERFORM public.bcpll_current_workspace();
 select current_workspace_id into v_ws from public.bcpll_profiles where id=auth.uid();
 perform 1 from public.workspace_members where workspace_id=v_ws and user_id=auth.uid();
 if not found then raise exception 'workspace_forbidden'; end if;
 update public.salesbots set is_active=p_is_active,revision=revision+1,updated_at=now()
 where workspace_id=v_ws and local_id=p_bot_local_id and revision=p_expected_revision
 returning id,revision into v_id,v_rev;
 if v_id is null then raise exception 'salesbot_revision_conflict_or_missing'; end if;
 insert into public.salesbot_revisions(workspace_id,salesbot_id,revision,source_event,actor_user_id,request_id)
 values(v_ws,v_id,v_rev,p_source,auth.uid(),p_request_id);
 return jsonb_build_object('revision',v_rev,'isActive',p_is_active,'requestId',p_request_id);
end $function$
;
REVOKE ALL ON FUNCTION bcpll_salesbot_set_active_v2(text,integer,boolean,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_salesbot_set_active_v2(text,integer,boolean,uuid,text) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_saude_slim_merge_leads(p_primary_id uuid, p_merged_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
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
 PERFORM public.bcpll_current_workspace();
  IF actor IS NULL THEN RAISE EXCEPTION 'Acesso não autenticado'; END IF;
  SELECT p.current_workspace_id INTO ws FROM public.bcpll_profiles p WHERE p.id=actor;
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
;
REVOKE ALL ON FUNCTION bcpll_saude_slim_merge_leads(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_saude_slim_merge_leads(uuid,uuid[]) TO "service_role","authenticated";

COMMIT;
SELECT '15-functions.sql' AS migration_batch,'OK' AS result;


-- 16-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION public.bcpll_slim_save_custom_fields(p_deleted_ids uuid[], p_updated jsonb, p_created jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_ws uuid; v_field jsonb; v_id uuid; v_count integer; v_existing public.lead_custom_fields;
begin
 PERFORM public.bcpll_current_workspace();
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select current_workspace_id into v_ws from public.bcpll_profiles where id=auth.uid();
  if v_ws is null or not private.slim_workspace_access(v_ws,'operator') then
    raise exception 'workspace_forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_updated) is distinct from 'array' or jsonb_typeof(p_created) is distinct from 'array' then
    raise exception 'invalid_custom_fields';
  end if;
  foreach v_id in array coalesce(p_deleted_ids,array[]::uuid[]) loop
    -- FK cascade removes values in the same transaction, never before confirmation.
    delete from public.lead_custom_fields where workspace_id=v_ws and id=v_id;
  end loop;
  for v_field in select value from jsonb_array_elements(p_updated) loop
    update public.lead_custom_fields set name=v_field->>'name',field_type=v_field->>'fieldType',options=coalesce(v_field->'options','[]')
    where id=(v_field->>'id')::uuid and workspace_id=v_ws;
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception 'Campo não encontrado ou sem permissão para editar.'; end if;
  end loop;
  for v_field in select value from jsonb_array_elements(p_created) loop
    insert into public.lead_custom_fields(id,workspace_id,name,field_type,options)
    values((v_field->>'id')::uuid,v_ws,v_field->>'name',v_field->>'fieldType',coalesce(v_field->'options','[]'))
    on conflict(id) do nothing;
    select * into v_existing from public.lead_custom_fields where id=(v_field->>'id')::uuid and workspace_id=v_ws;
    if not found or v_existing.name is distinct from v_field->>'name'
      or v_existing.field_type is distinct from v_field->>'fieldType'
      or v_existing.options is distinct from coalesce(v_field->'options','[]') then
      raise exception 'Conflito ao confirmar o campo personalizado.';
    end if;
  end loop;
  if exists(select 1 from public.lead_custom_fields where workspace_id=v_ws and id=any(coalesce(p_deleted_ids,array[]::uuid[]))) then
    raise exception 'O banco não confirmou a exclusão dos campos.';
  end if;
  return jsonb_build_object('ok',true);
end $function$
;
REVOKE ALL ON FUNCTION bcpll_slim_save_custom_fields(uuid[],jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_slim_save_custom_fields(uuid[],jsonb,jsonb) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_slim_sync_group_catalog(_workspace_id uuid, _session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
DECLARE
 recovered_count integer;
 total_count integer;
BEGIN
 PERFORM public.bcpll_current_workspace();
 PERFORM public.slim_assert_session_security();
 IF _workspace_id IS NULL OR auth.uid() IS NULL
    OR NOT EXISTS(
     SELECT 1 FROM public.bcpll_profiles p
     WHERE p.id=auth.uid() AND p.current_workspace_id=_workspace_id
    ) OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para sincronizar os grupos desta empresa.' USING ERRCODE='42501';
 END IF;
 IF _session_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.whatsapp_web_sessions s
  WHERE s.id=_session_id AND s.workspace_id=_workspace_id
 ) THEN
  RAISE EXCEPTION 'A sessão não pertence à empresa selecionada.' USING ERRCODE='42501';
 END IF;

 INSERT INTO public.whatsapp_groups(
  workspace_id,session_id,group_jid,name,metadata,last_synced_at
 )
 SELECT _workspace_id,h.session_id,h.group_jid,
  'Grupo WhatsApp '||right(split_part(h.group_jid,'@',1),6),
  jsonb_build_object('source','inbox_history','history_latest_at',h.history_latest_at,'recovered_at',now()),
  NULL
 FROM (
  SELECT m.session_id,m.remote_jid AS group_jid,max(m.received_at) AS history_latest_at
  FROM public.whatsapp_web_messages m
  JOIN public.whatsapp_web_sessions s ON s.id=m.session_id AND s.workspace_id=m.workspace_id
  WHERE m.workspace_id=_workspace_id
   AND (_session_id IS NULL OR m.session_id=_session_id)
   AND m.remote_jid ~ '^[0-9]+(-[0-9]+)?@g[.]us$'
  GROUP BY m.session_id,m.remote_jid
 ) h
 ON CONFLICT(session_id,group_jid) DO NOTHING;
 GET DIAGNOSTICS recovered_count=ROW_COUNT;

 SELECT count(*)::integer INTO total_count
 FROM public.whatsapp_groups g
 WHERE g.workspace_id=_workspace_id AND (_session_id IS NULL OR g.session_id=_session_id);
 RETURN jsonb_build_object('recovered',recovered_count,'total',total_count);
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_slim_sync_group_catalog(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_slim_sync_group_catalog(uuid,uuid) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_support_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ws uuid:=public.bcpll_current_workspace(); staff boolean:=private.bcpll_is_platform_support(auth.uid());
BEGIN
 RETURN jsonb_build_object('workspaceId',ws,'isPlatformSupport',staff,
  'canEditTutorials',EXISTS(SELECT 1 FROM private.bcpll_platform_support WHERE user_id=auth.uid() AND can_edit_tutorials),
  'workspaces',CASE WHEN staff THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name',w.name) ORDER BY w.name,w.id)
   FROM public.bcpll_workspaces b JOIN public.workspaces w ON w.id=b.workspace_id
   WHERE private.slim_workspace_access(w.id,'member')),'[]'::jsonb) ELSE '[]'::jsonb END);
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_support_context() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_support_context() TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_switch_workspace(_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.bcpll_current_workspace();
 IF NOT private.bcpll_is_platform_support(auth.uid())
  OR NOT private.bcpll_is_workspace(_workspace_id)
  OR NOT private.slim_workspace_access(_workspace_id,'member') THEN
  RAISE EXCEPTION 'Você não tem acesso de suporte a este workspace BCPLL.' USING ERRCODE='42501';
 END IF;
 INSERT INTO private.bcpll_support_context(user_id,workspace_id) VALUES(auth.uid(),_workspace_id)
  ON CONFLICT(user_id) DO UPDATE SET workspace_id=EXCLUDED.workspace_id;
 RETURN _workspace_id;
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_switch_workspace(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_switch_workspace(uuid) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.bcpll_team_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ws uuid:=public.bcpll_current_workspace(); own boolean;
BEGIN
 SELECT owner_id=auth.uid() INTO own FROM public.bcpll_workspaces WHERE workspace_id=ws;
 RETURN jsonb_build_object('workspaceId',ws,'isOwner',own,'limit',4,
  'used',(SELECT count(*) FROM public.workspace_members m JOIN public.bcpll_workspaces b ON b.workspace_id=m.workspace_id WHERE m.workspace_id=ws AND m.user_id<>b.owner_id AND NOT private.bcpll_is_platform_support(m.user_id)),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('userId',m.user_id,'name',p.display_name,'email',u.email,'isOwner',m.user_id=b.owner_id))
   FROM public.workspace_members m JOIN public.bcpll_workspaces b ON b.workspace_id=m.workspace_id
   JOIN auth.users u ON u.id=m.user_id LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.workspace_id=ws AND NOT private.bcpll_is_platform_support(m.user_id)),'[]'::jsonb));
END;$function$
;
REVOKE ALL ON FUNCTION bcpll_team_context() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bcpll_team_context() TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.can_admin_workspace(_user_id uuid, _workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select _user_id=auth.uid() and private.slim_session_security_allowed()
    and private.slim_workspace_access(_workspace_id,'admin');
$function$
;
REVOKE ALL ON FUNCTION can_admin_workspace(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION can_admin_workspace(uuid,uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.count_active_whatsapp_sessions(_workspace_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE _count bigint;
BEGIN
  PERFORM private.saude_slim_assert_workspace_member(_workspace_id);
  SELECT count(*) INTO _count
  FROM public.whatsapp_web_sessions s
  WHERE s.workspace_id = _workspace_id
    AND s.status = 'conectado'
    AND (s.metadata->>'deleted') IS DISTINCT FROM 'true';
  RETURN _count;
END;
$function$
;
REVOKE ALL ON FUNCTION count_active_whatsapp_sessions(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION count_active_whatsapp_sessions(uuid) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.generate_workspace_slug(_base text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  base_clean text;
  candidate text;
  n integer := 0;
begin
  base_clean := regexp_replace(lower(coalesce(_base, 'saude-slim')), '[^a-z0-9]+', '-', 'g');
  base_clean := trim(both '-' from base_clean);
  if base_clean = '' then base_clean := 'saude-slim'; end if;
  candidate := base_clean;

  while exists (select 1 from public.workspaces where slug = candidate) loop
    n := n + 1;
    candidate := base_clean || '-' || n::text;
  end loop;

  return candidate;
end;
$function$
;
REVOKE ALL ON FUNCTION generate_workspace_slug(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION generate_workspace_slug(text) TO "service_role";
CREATE OR REPLACE FUNCTION public.get_evolution_credentials(_session_id uuid, _key text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.saude_slim_get_evolution_credentials(_session_id, _key);
$function$
;
REVOKE ALL ON FUNCTION get_evolution_credentials(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION get_evolution_credentials(uuid,text) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.get_evolution_credentials_service(_session_id uuid, _key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.whatsapp_web_sessions%rowtype;
begin
 select * into s from public.whatsapp_web_sessions where id=_session_id and provider='evolution';
 if not found then return null; end if;
 if length(coalesce(_key,''))<32 then raise exception 'Chave de integração inválida.'; end if;
 return pg_catalog.jsonb_build_object('workspace_id',s.workspace_id,'instance_name',s.instance_id,'api_key',extensions.pgp_sym_decrypt(s.token_encrypted,_key),'status',s.status);
end $function$
;
REVOKE ALL ON FUNCTION get_evolution_credentials_service(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION get_evolution_credentials_service(uuid,text) TO "service_role";
CREATE OR REPLACE FUNCTION public.get_evolution_session_by_secret(_webhook_secret text, _key text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'session_id', s.id,
    'workspace_id', s.workspace_id,
    'instance_name', s.instance_id,
    'api_key', extensions.pgp_sym_decrypt(s.token_encrypted, _key)
  )
  from public.whatsapp_web_sessions s
  where s.webhook_secret = _webhook_secret
    and (s.metadata->>'deleted') is distinct from 'true'
  limit 1;
$function$
;
REVOKE ALL ON FUNCTION get_evolution_session_by_secret(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION get_evolution_session_by_secret(text,text) TO "service_role";
CREATE OR REPLACE FUNCTION public.get_integration_secret(_workspace_id uuid, _provider text, _key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;
REVOKE ALL ON FUNCTION get_integration_secret(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION get_integration_secret(uuid,text,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.get_workspace_default_currency(_workspace_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE cur text;
BEGIN
  PERFORM private.saude_slim_assert_workspace_member(_workspace_id);
  SELECT COALESCE(w.default_currency,'BRL') INTO cur FROM public.workspaces w WHERE w.id=_workspace_id;
  IF cur IS NULL THEN RAISE EXCEPTION 'workspace not found'; END IF;
  RETURN cur;
END $function$
;
REVOKE ALL ON FUNCTION get_workspace_default_currency(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION get_workspace_default_currency(uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.get_workspace_regional_settings(_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM private.saude_slim_assert_workspace_member(_workspace_id);
  SELECT jsonb_build_object('currency',COALESCE(w.default_currency,'BRL'),
    'timezone',COALESCE(NULLIF(w.business_hours->>'timezone',''),'America/Sao_Paulo'))
  INTO v FROM public.workspaces w WHERE w.id=_workspace_id;
  IF v IS NULL THEN RAISE EXCEPTION 'workspace not found'; END IF;
  RETURN v;
END $function$
;
REVOKE ALL ON FUNCTION get_workspace_regional_settings(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION get_workspace_regional_settings(uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  email text;
  display text;
  ws_slug text;
  ws_id uuid;
begin
  IF new.raw_user_meta_data->>'signup_source'='bcpll' THEN
    PERFORM private.bcpll_onboard_user(new.id,new.email,new.raw_user_meta_data); RETURN new;
  END IF;
  email := lower(coalesce(new.email, ''));
  display := coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'Usuario');
  ws_slug := public.generate_workspace_slug(display);

  insert into public.profiles (id, display_name, full_name)
  values (new.id, display, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into public.workspaces (slug, name, owner_id)
  values (ws_slug, 'Saude Slim', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  update public.profiles
  set current_workspace_id = ws_id,
      updated_at = now()
  where id = new.id;

  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user() TO "service_role";
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$function$
;
REVOKE ALL ON FUNCTION has_role(uuid,app_role) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION has_role(uuid,app_role) TO "service_role";
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = _workspace_id
      and user_id = _user_id
  );
$function$
;
REVOKE ALL ON FUNCTION is_workspace_member(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION is_workspace_member(uuid,uuid) TO "service_role";
CREATE OR REPLACE FUNCTION public.list_inbox_group_conversations_page(_workspace_id uuid, _limit integer DEFAULT 40, _cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _cursor_key text DEFAULT NULL::text, _search text DEFAULT NULL::text)
 RETURNS TABLE(conversation_key text, group_id uuid, group_jid text, session_id uuid, name text, description text, picture_url text, participants_count integer, body text, message_type text, from_me boolean, sender_name text, last_message_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH latest AS (
  SELECT DISTINCT ON (m.session_id, m.remote_jid)
    m.session_id,m.remote_jid,m.body,m.message_type,m.from_me,m.sender_name,m.received_at
  FROM public.whatsapp_web_messages m
  WHERE m.workspace_id = _workspace_id AND m.remote_jid LIKE '%@g.us'
  ORDER BY m.session_id,m.remote_jid,m.received_at DESC,m.id DESC
),
keys AS (
  SELECT g.session_id,g.group_jid FROM public.whatsapp_groups g
   WHERE g.workspace_id = _workspace_id
  UNION
  SELECT m.session_id,m.remote_jid FROM latest m
),
data AS (
  SELECT
    k.session_id::text || '|' || k.group_jid AS conversation_key,
    g.id AS group_id,
    k.group_jid,
    k.session_id,
    coalesce(nullif(g.name,''),nullif(g.subject,''),'Grupo WhatsApp ' || right(split_part(k.group_jid,'@',1),6)) AS name,
    g.description,
    g.picture_url,
    g.participants_count,
    left(m.body,500) AS body,
    m.message_type,
    m.from_me,
    m.sender_name,
    coalesce(m.received_at,g.last_synced_at,g.updated_at,g.created_at,clock_timestamp()) AS last_message_at
  FROM keys k
  LEFT JOIN public.whatsapp_groups g
    ON g.workspace_id=_workspace_id AND g.session_id=k.session_id AND g.group_jid=k.group_jid
  LEFT JOIN latest m
    ON m.session_id=k.session_id AND m.remote_jid=k.group_jid
)
SELECT d.conversation_key,d.group_id,d.group_jid,d.session_id,
       d.name,d.description,d.picture_url,d.participants_count,
       d.body,d.message_type,d.from_me,d.sender_name,d.last_message_at
FROM data d
WHERE private.slim_workspace_access(_workspace_id,'member')
  AND (nullif(trim(_search),'') IS NULL OR
       d.name ILIKE '%' || trim(_search) || '%' OR
       d.group_jid ILIKE '%' || trim(_search) || '%' OR
       d.description ILIKE '%' || trim(_search) || '%')
  AND (_cursor_at IS NULL OR
       d.last_message_at < _cursor_at OR
       (d.last_message_at = _cursor_at AND
        d.conversation_key > coalesce(_cursor_key,'')))
ORDER BY d.last_message_at DESC,d.conversation_key ASC
LIMIT least(101,greatest(2,coalesce(_limit,40)+1));
$function$
;
REVOKE ALL ON FUNCTION list_inbox_group_conversations_page(uuid,integer,timestamp with time zone,text,text) FROM PUBLIC,anon,authenticated;

COMMIT;
SELECT '16-functions.sql' AS migration_batch,'OK' AS result;


-- 17-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
GRANT EXECUTE ON FUNCTION list_inbox_group_conversations_page(uuid,integer,timestamp with time zone,text,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.list_inbox_lead_order_page(_workspace_id uuid, _limit integer DEFAULT 40, _cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _cursor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(lead_id uuid, conversation_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.saude_slim_assert_workspace_member(_workspace_id);
  IF _limit IS NULL OR _limit < 1 OR _limit > 100 THEN
    RAISE EXCEPTION 'invalid inbox page limit';
  END IF;
  IF (_cursor_at IS NULL) <> (_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'invalid inbox cursor';
  END IF;

  RETURN QUERY
  WITH ordered AS (
    SELECT l.id AS lead_id,
           COALESCE(
             (
               SELECT max(a.occurred_at)
               FROM public.lead_activities a
               WHERE a.workspace_id = l.workspace_id
                 AND a.lead_id = l.id
                 AND a.type IN ('message_in', 'message_out')
             ),
             l.updated_at
           ) AS conversation_at
    FROM public.leads l
    WHERE l.workspace_id = _workspace_id
      AND l.merged_into_id IS NULL
  )
  SELECT ordered.lead_id, ordered.conversation_at
  FROM ordered
  WHERE _cursor_at IS NULL
     OR (ordered.conversation_at, ordered.lead_id) < (_cursor_at, _cursor_id)
  ORDER BY ordered.conversation_at DESC, ordered.lead_id DESC
  LIMIT _limit + 1;
END;
$function$
;
REVOKE ALL ON FUNCTION list_inbox_lead_order_page(uuid,integer,timestamp with time zone,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION list_inbox_lead_order_page(uuid,integer,timestamp with time zone,uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.list_workspace_users(_workspace_id uuid)
 RETURNS TABLE(id uuid, name text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.user_id,coalesce(nullif(p.display_name,''),nullif(p.full_name,''),u.email::text,'Usuário'),u.email::text
  from public.workspace_members m
  left join public.profiles p on p.id=m.user_id
  left join auth.users u on u.id=m.user_id
  where m.workspace_id=_workspace_id
    and (m.access_expires_at is null or m.access_expires_at>now())
    and private.slim_session_security_allowed()
    and private.slim_workspace_access(_workspace_id,'member');
$function$
;
REVOKE ALL ON FUNCTION list_workspace_users(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION list_workspace_users(uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.replace_crm_stage_automations(_pipeline_id uuid, _automations jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE w uuid;entry record;a jsonb;st uuid;pos integer;n integer:=0;
BEGIN
 SELECT workspace_id INTO w FROM public.pipelines WHERE id=_pipeline_id FOR UPDATE;
 IF w IS NULL OR NOT private.slim_workspace_access(w,'operator') THEN RAISE EXCEPTION 'Sem permissão para editar automações deste funil.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_automations) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Mapa de automações inválido.' USING ERRCODE='22023'; END IF;
 FOR entry IN SELECT * FROM jsonb_each(_automations) LOOP
  st:=entry.key::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.pipeline_stages s WHERE s.id=st AND s.pipeline_id=_pipeline_id AND s.workspace_id=w) OR jsonb_typeof(entry.value)<>'array' THEN RAISE EXCEPTION 'Etapa ou lista de ações inválida.' USING ERRCODE='22023'; END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(entry.value) LOOP
   IF jsonb_typeof(a)<>'object' OR length(coalesce(a->>'id',''))=0 THEN RAISE EXCEPTION 'Ação sem identificador.' USING ERRCODE='22023'; END IF;
   IF a ? 'stageIds' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(a->'stageIds') x WHERE NOT EXISTS(SELECT 1 FROM public.pipeline_stages s WHERE s.id=x::uuid AND s.pipeline_id=_pipeline_id AND s.workspace_id=w)) THEN RAISE EXCEPTION 'Ação cobre etapa não autorizada.' USING ERRCODE='42501'; END IF;
  END LOOP;
 END LOOP;
 DELETE FROM public.crm_stage_automations WHERE workspace_id=w AND pipeline_id=_pipeline_id;
 FOR entry IN SELECT * FROM jsonb_each(_automations) LOOP
  pos:=0;
  FOR a IN SELECT * FROM jsonb_array_elements(entry.value) LOOP
   INSERT INTO public.crm_stage_automations(workspace_id,pipeline_id,stage_id,action_id,action,enabled,position) VALUES(w,_pipeline_id,entry.key::uuid,a->>'id',a,coalesce((a->>'enabled')::boolean,true),pos);
   pos:=pos+1;n:=n+1;
  END LOOP;
 END LOOP;
 RETURN n;
END;$function$
;
REVOKE ALL ON FUNCTION replace_crm_stage_automations(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION replace_crm_stage_automations(uuid,jsonb) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.salesbot_batch_decrement(p_run_id uuid, p_text text, p_sender_phone text, p_sender_name text, p_next_block_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_run public.salesbot_runs; v_vars jsonb; v_events jsonb; v_event jsonb;
  v_index integer := -1; v_remaining integer; i integer;
begin
  select * into v_run from public.salesbot_runs
    where id=p_run_id and status='waiting_message' and stopped_at is null for update;
  if not found then return jsonb_build_object('success',false,'reason','run_not_waiting'); end if;
  if p_next_block_id is not null and not exists (
    select 1 from public.salesbot_blocks where id=p_next_block_id
      and workspace_id=v_run.workspace_id and salesbot_id=v_run.salesbot_id
  ) then raise exception 'batch_target_forbidden'; end if;
  v_vars := coalesce(v_run.variables,'{}');
  v_events := v_vars->'salesbot_waiting_branch'->'waitingEvents';
  if jsonb_typeof(v_events) is distinct from 'array' then
    return jsonb_build_object('success',false,'reason','lote_event_not_found');
  end if;
  for i in 0..jsonb_array_length(v_events)-1 loop
    v_event := v_events->i;
    if v_event->>'type'='lote-msgs' then
      v_index := i; v_remaining := (v_event->>'remaining')::integer; exit;
    end if;
  end loop;
  if v_index=-1 then return jsonb_build_object('success',false,'reason','lote_event_not_found'); end if;
  if v_remaining is null or v_remaining<1 or v_remaining>200 then raise exception 'invalid_batch_state'; end if;
  if p_sender_phone is not null then v_vars := v_vars||jsonb_build_object(
    'participante_telefone',regexp_replace(p_sender_phone,'[^0-9]','','g'),
    'participante_nome',coalesce(p_sender_name,'')); end if;
  v_vars := v_vars||jsonb_build_object('last_message',p_text);
  v_remaining := v_remaining-1;
  if v_remaining>0 then
    v_vars := jsonb_set(v_vars,array['salesbot_waiting_branch','waitingEvents',v_index::text,'remaining'],to_jsonb(v_remaining));
    update public.salesbot_runs set variables=v_vars,updated_at=clock_timestamp() where id=p_run_id;
  else
    v_vars := (v_vars-'salesbot_waiting_branch')||jsonb_build_object('salesbot_lote_completo',true);
    update public.salesbot_runs set status='running',waiting_until=null,variables=v_vars,
      current_block_id=p_next_block_id,updated_at=clock_timestamp() where id=p_run_id;
  end if;
  return jsonb_build_object('success',true,'completed',v_remaining=0,'remaining',v_remaining);
end $function$
;
REVOKE ALL ON FUNCTION salesbot_batch_decrement(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION salesbot_batch_decrement(uuid,text,text,text,uuid) TO "service_role";
CREATE OR REPLACE FUNCTION public.salesbot_delete_v2(p_bot_local_id text, p_expected_revision integer, p_request_id uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_ws uuid;
  v_id uuid;
  v_revision integer;
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if nullif(btrim(p_bot_local_id), '') is null
     or p_expected_revision is null or p_expected_revision <= 0 then
    raise exception 'salesbot_invalid_delete_request';
  end if;

  select current_workspace_id into v_ws
  from public.profiles where id = auth.uid();
  if v_ws is null then raise exception 'workspace_not_found'; end if;
  perform 1 from public.workspace_members
  where workspace_id = v_ws and user_id = auth.uid();
  if not found then raise exception 'workspace_forbidden'; end if;

  select id, revision into v_id, v_revision
  from public.salesbots
  where workspace_id = v_ws
    and (local_id = p_bot_local_id
      or (local_id is null and id::text = p_bot_local_id))
  for update;
  if not found then
    return jsonb_build_object('ok', true, 'alreadyDeleted', true, 'requestId', p_request_id);
  end if;
  if v_revision is distinct from p_expected_revision then
    raise exception 'salesbot_revision_conflict';
  end if;

  -- Existing FK cascades remove child records atomically. Referenced campaigns
  -- keep their restrictive FK, so a failure rolls the entire deletion back.
  delete from public.salesbots
  where id = v_id and workspace_id = v_ws and revision = p_expected_revision;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then raise exception 'salesbot_delete_not_confirmed'; end if;
  return jsonb_build_object('ok', true, 'deleted', true, 'requestId', p_request_id);
end;
$function$
;
REVOKE ALL ON FUNCTION salesbot_delete_v2(text,integer,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION salesbot_delete_v2(text,integer,uuid,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.salesbot_rr_next(_block_id uuid, _size integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_counter bigint;
begin
  if _size is null or _size < 1 or _size > 1000 then
    raise exception 'invalid_distribution_size';
  end if;
  insert into public.salesbot_round_robin_state(block_id,counter)
  values (_block_id,1)
  on conflict(block_id) do update
    set counter=public.salesbot_round_robin_state.counter+1,updated_at=clock_timestamp()
  returning counter into v_counter;
  return ((v_counter-1) % _size)::integer;
end $function$
;
REVOKE ALL ON FUNCTION salesbot_rr_next(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION salesbot_rr_next(uuid,integer) TO "service_role";
CREATE OR REPLACE FUNCTION public.salesbot_save_graph_v2(p_bot_local_id text, p_expected_revision integer, p_base_block_local_ids text[], p_bot jsonb, p_blocks jsonb, p_request_id uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_ws uuid;v_id uuid;v_rev integer;v_base text[];v_count integer;v_row jsonb;v_ids text[];v_deleted integer;v_new boolean:=false;
begin
 select current_workspace_id into v_ws from public.profiles where id=auth.uid();
 if v_ws is null then raise exception 'workspace_not_found'; end if;
 perform 1 from public.workspace_members where workspace_id=v_ws and user_id=auth.uid();
 if not found then raise exception 'workspace_forbidden'; end if;
 select id,revision into v_id,v_rev from public.salesbots where workspace_id=v_ws and local_id=p_bot_local_id for update;
 if v_id is null then
  if p_expected_revision is not null then raise exception 'salesbot_missing_for_expected_revision'; end if;
  insert into public.salesbots(workspace_id,local_id,name,scope,gatilhos,settings)
   values(v_ws,p_bot_local_id,coalesce(p_bot->>'name','Novo bot'),coalesce(p_bot->>'scope','individual'),coalesce(p_bot->'gatilhos','[]'::jsonb),p_bot)
   returning id,revision into v_id,v_rev;
  v_new:=true;
 else
  if p_expected_revision is distinct from v_rev then raise exception 'salesbot_revision_conflict'; end if;
  select coalesce(array_agg(local_id order by local_id),array[]::text[]) into v_base from public.salesbot_blocks where salesbot_id=v_id;
  select coalesce(array_agg(x order by x),array[]::text[]) into v_ids from unnest(coalesce(p_base_block_local_ids,array[]::text[])) x;
  if v_base is distinct from v_ids then raise exception 'salesbot_incomplete_base'; end if;
  update public.salesbots set name=coalesce(p_bot->>'name',name),scope=coalesce(p_bot->>'scope',scope),
   gatilhos=coalesce(p_bot->'gatilhos',gatilhos),settings=p_bot,revision=revision+1,updated_at=now()
   where id=v_id returning revision into v_rev;
 end if;
 select count(*) into v_count from public.salesbot_blocks where salesbot_id=v_id;
 delete from public.salesbot_blocks where salesbot_id=v_id;
 for v_row in select value from jsonb_array_elements(coalesce(p_blocks,'[]'::jsonb)) loop
  insert into public.salesbot_blocks(id,salesbot_id,workspace_id,local_id,type,config,position_x,position_y,next_block_id)
   values((v_row->>'id')::uuid,v_id,v_ws,v_row->>'local_id',v_row->>'type',coalesce(v_row->'config','{}'::jsonb),
   coalesce((v_row->>'position_x')::integer,0),coalesce((v_row->>'position_y')::integer,0),nullif(v_row->>'next_block_id','')::uuid);
 end loop;
 insert into public.salesbot_revisions(workspace_id,salesbot_id,revision,source_event,actor_user_id,request_id)
 values(v_ws,v_id,v_rev,p_source,auth.uid(),p_request_id);
 return jsonb_build_object('id',v_id,'revision',v_rev,'baseBlockLocalIds',
  coalesce((select jsonb_agg(local_id order by local_id) from public.salesbot_blocks where salesbot_id=v_id),'[]'::jsonb),
  'deletedBlockCount',greatest(v_count-coalesce(jsonb_array_length(p_blocks),0),0),'requestId',p_request_id);
end $function$
;
REVOKE ALL ON FUNCTION salesbot_save_graph_v2(text,integer,text[],jsonb,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION salesbot_save_graph_v2(text,integer,text[],jsonb,jsonb,uuid,text) TO "anon","authenticated","service_role";
CREATE OR REPLACE FUNCTION public.salesbot_set_active_v2(p_bot_local_id text, p_expected_revision integer, p_is_active boolean, p_request_id uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_ws uuid;v_id uuid;v_rev integer;
begin
 select current_workspace_id into v_ws from public.profiles where id=auth.uid();
 perform 1 from public.workspace_members where workspace_id=v_ws and user_id=auth.uid();
 if not found then raise exception 'workspace_forbidden'; end if;
 update public.salesbots set is_active=p_is_active,revision=revision+1,updated_at=now()
 where workspace_id=v_ws and local_id=p_bot_local_id and revision=p_expected_revision
 returning id,revision into v_id,v_rev;
 if v_id is null then raise exception 'salesbot_revision_conflict_or_missing'; end if;
 insert into public.salesbot_revisions(workspace_id,salesbot_id,revision,source_event,actor_user_id,request_id)
 values(v_ws,v_id,v_rev,p_source,auth.uid(),p_request_id);
 return jsonb_build_object('revision',v_rev,'isActive',p_is_active,'requestId',p_request_id);
end $function$
;
REVOKE ALL ON FUNCTION salesbot_set_active_v2(text,integer,boolean,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION salesbot_set_active_v2(text,integer,boolean,uuid,text) TO "anon","authenticated","service_role";
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
;
REVOKE ALL ON FUNCTION saude_slim_merge_leads(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION saude_slim_merge_leads(uuid,uuid[]) TO "anon","authenticated","service_role";
CREATE OR REPLACE FUNCTION public.search_ai_brain(p_workspace_id uuid, p_embedding vector, p_limit integer DEFAULT 5)
 RETURNS TABLE(source_id uuid, chunk_text text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select c.source_id,c.content, (1-(c.embedding operator(extensions.<=>) p_embedding))::float as similarity
 from public.ai_brain_chunks c join public.ai_brain_sources s on s.id=c.source_id
 where c.workspace_id=p_workspace_id and s.enabled and c.embedding is not null
 order by c.embedding operator(extensions.<=>) p_embedding limit least(greatest(p_limit,1),20)
$function$
;
REVOKE ALL ON FUNCTION search_ai_brain(uuid,vector,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION search_ai_brain(uuid,vector,integer) TO "anon","authenticated","service_role";

COMMIT;
SELECT '17-functions.sql' AS migration_batch,'OK' AS result;


-- 18-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION public.search_ai_brain_text(p_workspace_id uuid, p_query text, p_limit integer DEFAULT 5)
 RETURNS TABLE(source_id uuid, chunk_text text, relevance real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select c.source_id,c.content,ts_rank(to_tsvector('portuguese',c.content),plainto_tsquery('portuguese',p_query)) as relevance
from public.ai_brain_chunks c join public.ai_brain_sources s on s.id=c.source_id
where c.workspace_id=p_workspace_id and s.enabled
and to_tsvector('portuguese',c.content) @@ plainto_tsquery('portuguese',p_query)
order by relevance desc limit least(greatest(p_limit,1),20)
$function$
;
REVOKE ALL ON FUNCTION search_ai_brain_text(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION search_ai_brain_text(uuid,text,integer) TO "anon","authenticated","service_role";
CREATE OR REPLACE FUNCTION public.seed_workspace_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  source_id uuid;
  pipeline_id uuid;
begin
  insert into public.crm_sources (workspace_id, provider, display_name, is_default)
  values (new.id, 'manual', 'Saude Slim', true)
  returning id into source_id;

  insert into public.pipelines (workspace_id, crm_source_id, name, position)
  values (new.id, source_id, 'Vendas', 1)
  returning id into pipeline_id;

  insert into public.crm_source_funnels (workspace_id, crm_source_id, pipeline_id)
  values (new.id, source_id, pipeline_id);

  insert into public.pipeline_stages (workspace_id, pipeline_id, name, position, color)
  values
    (new.id, pipeline_id, 'Novo pedido', 1, '#22c55e'),
    (new.id, pipeline_id, 'Em atendimento', 2, '#84cc16'),
    (new.id, pipeline_id, 'Venda ganha', 3, '#16a34a'),
    (new.id, pipeline_id, 'Venda perdida', 4, '#ef4444');

  insert into public.product_catalogs (workspace_id, name, description)
  values (new.id, 'Catalogo principal', 'Produtos da Saude Slim');

  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION seed_workspace_defaults() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION seed_workspace_defaults() TO "service_role";
CREATE OR REPLACE FUNCTION public.set_evolution_credentials(_workspace_id uuid, _instance_name text, _api_key text, _webhook_secret text, _key text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.saude_slim_set_evolution_credentials(
    _workspace_id, _instance_name, _api_key, _webhook_secret, _key
  );
$function$
;
REVOKE ALL ON FUNCTION set_evolution_credentials(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION set_evolution_credentials(uuid,text,text,text,text) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.set_integration_secret(_workspace_id uuid, _provider text, _plaintext jsonb, _key text, _metadata jsonb DEFAULT '{}'::jsonb, _status text DEFAULT 'connected'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;
REVOKE ALL ON FUNCTION set_integration_secret(uuid,text,jsonb,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION set_integration_secret(uuid,text,jsonb,text,jsonb,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.set_workspace_default_currency(_workspace_id uuid, _currency text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.saude_slim_assert_workspace_member(_workspace_id);
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id=_workspace_id AND owner_id=(SELECT auth.uid())) THEN
    RAISE EXCEPTION 'owner required';
  END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'invalid currency'; END IF;
  UPDATE public.workspaces SET default_currency=_currency WHERE id=_workspace_id;
  RETURN _currency;
END $function$
;
REVOKE ALL ON FUNCTION set_workspace_default_currency(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION set_workspace_default_currency(uuid,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.set_workspace_regional_settings(_workspace_id uuid, _currency text, _timezone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.saude_slim_assert_workspace_member(_workspace_id);
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id=_workspace_id AND owner_id=(SELECT auth.uid())) THEN
    RAISE EXCEPTION 'owner required';
  END IF;
  IF _currency !~ '^[A-Z]{3}$' OR length(_timezone) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'invalid regional settings';
  END IF;
  UPDATE public.workspaces
  SET default_currency=_currency,
      business_hours=jsonb_set(COALESCE(business_hours,'{}'::jsonb),'{timezone}',to_jsonb(_timezone),true)
  WHERE id=_workspace_id;
  RETURN jsonb_build_object('currency',_currency,'timezone',_timezone);
END $function$
;
REVOKE ALL ON FUNCTION set_workspace_regional_settings(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION set_workspace_regional_settings(uuid,text,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_assert_session_security()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE failure text;
BEGIN
 failure:=private.slim_session_security_error();
 IF failure IS NOT NULL THEN RAISE EXCEPTION '%',failure USING ERRCODE='42501'; END IF;
 RETURN true;
END;
$function$
;
REVOKE ALL ON FUNCTION slim_assert_session_security() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_assert_session_security() TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_bulk_move_leads_and_emit(_workspace_id uuid, _lead_ids uuid[], _stage_id uuid, _request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_bulk_move_leads_and_emit_impl(_workspace_id,_lead_ids,_stage_id,_request_id);
$function$
;
REVOKE ALL ON FUNCTION slim_bulk_move_leads_and_emit(uuid,uuid[],uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_bulk_move_leads_and_emit(uuid,uuid[],uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_cancel_audience_campaign(_campaign_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.slim_cancel_audience_campaign(_campaign_id);$function$
;
REVOKE ALL ON FUNCTION slim_cancel_audience_campaign(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_cancel_audience_campaign(uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_cancel_order(_workspace_id uuid, _order_id uuid, _reason text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.slim_cancel_order(_workspace_id,_order_id,_reason); $function$
;
REVOKE ALL ON FUNCTION slim_cancel_order(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_cancel_order(uuid,uuid,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_change_order(_workspace_id uuid, _order_id uuid, _request_id uuid, _operation text, _fingerprint text, _quote jsonb, _reason text, _approved boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_change_order(_workspace_id,_order_id,_request_id,_operation,_fingerprint,_quote,_reason,_approved);
$function$
;
REVOKE ALL ON FUNCTION slim_change_order(uuid,uuid,uuid,text,text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_change_order(uuid,uuid,uuid,text,text,jsonb,text,boolean) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_check_api_request()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
 IF current_user IN ('anon','service_role') THEN RETURN; END IF;
 PERFORM public.slim_assert_session_security();
END;
$function$
;
REVOKE ALL ON FUNCTION slim_check_api_request() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_check_api_request() TO "anon","authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_claim_audience_delivery()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c public.slim_audience_campaigns;d public.slim_audience_deliveries;BEGIN
 UPDATE public.slim_audience_deliveries SET status='uncertain',last_error='Execução interrompida. Verificar entrega antes de reenviar.',finished_at=now() WHERE status='running' AND started_at<now()-interval '3 minutes';
 UPDATE public.slim_audience_campaigns c1 SET status='completed',finished_at=now() WHERE c1.status IN ('queued','running') AND NOT EXISTS(SELECT 1 FROM public.slim_audience_deliveries d1 WHERE d1.campaign_id=c1.id AND d1.status IN ('pending','running'));
 SELECT * INTO c FROM public.slim_audience_campaigns c1 WHERE c1.status IN ('queued','running') AND c1.next_due_at<=clock_timestamp() AND EXISTS(SELECT 1 FROM public.slim_audience_deliveries d1 WHERE d1.campaign_id=c1.id AND d1.status='pending') AND NOT EXISTS(SELECT 1 FROM public.slim_audience_deliveries d1 WHERE d1.campaign_id=c1.id AND d1.status='running') ORDER BY c1.next_due_at,c1.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO d FROM public.slim_audience_deliveries WHERE campaign_id=c.id AND status='pending' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.slim_audience_deliveries SET status='running',started_at=clock_timestamp() WHERE id=d.id;
 UPDATE public.slim_audience_campaigns SET status='running',next_due_at=clock_timestamp()+c.delay_ms*interval '1 millisecond' WHERE id=c.id;
 RETURN to_jsonb(d)||jsonb_build_object('campaign',to_jsonb(c));
END;$function$
;
REVOKE ALL ON FUNCTION slim_claim_audience_delivery() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_claim_audience_delivery() TO "service_role";
CREATE OR REPLACE FUNCTION public.slim_claim_inbox_salesbots()
 RETURNS SETOF salesbot_runs
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 with candidates as (select id from public.salesbot_runs where status='queued' and stopped_at is null order by started_at for update skip locked limit 5)
 update public.salesbot_runs r set status='running',updated_at=clock_timestamp() from candidates c where r.id=c.id returning r.*;
$function$
;
REVOKE ALL ON FUNCTION slim_claim_inbox_salesbots() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_claim_inbox_salesbots() TO "service_role";
CREATE OR REPLACE FUNCTION public.slim_claim_stage_job(_job_id uuid)
 RETURNS SETOF crm_automation_jobs
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 UPDATE public.crm_automation_jobs SET status='running',started_at=clock_timestamp() WHERE id=_job_id AND status='pending' AND due_at<=clock_timestamp() RETURNING *;
$function$
;
REVOKE ALL ON FUNCTION slim_claim_stage_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_claim_stage_job(uuid) TO "service_role";
CREATE OR REPLACE FUNCTION public.slim_claim_stage_move(_id uuid)
 RETURNS SETOF slim_stage_move_events
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 UPDATE public.slim_stage_move_events SET status='dispatching',attempts=attempts+1,started_at=clock_timestamp()
 WHERE id=_id AND attempts<5 AND (status='pending' OR(status='dispatching' AND started_at<clock_timestamp()-interval '2 minutes')) RETURNING *;
$function$
;
REVOKE ALL ON FUNCTION slim_claim_stage_move(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_claim_stage_move(uuid) TO "service_role";
CREATE OR REPLACE FUNCTION public.slim_close_checkout_attempt(_workspace_id uuid, _request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE existing public.slim_orders; closed public.slim_checkout_attempt_closures;
BEGIN
 IF auth.uid() IS NULL OR _request_id IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para encerrar a tentativa nesta empresa.' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'A recuperação exige uma leitura atual da transação.' USING ERRCODE='22023';
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(_workspace_id::text||_request_id::text,0)) THEN
  RETURN jsonb_build_object('state','processing','workspaceId',_workspace_id,'requestId',_request_id);
 END IF;
 SELECT * INTO existing FROM public.slim_orders o WHERE o.workspace_id=_workspace_id AND o.request_id=_request_id;
 IF FOUND THEN
  IF existing.created_by IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Referência pertence a outro operador.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('state','existing','workspaceId',_workspace_id,'requestId',_request_id,'orderId',existing.id);
 END IF;
 INSERT INTO public.slim_checkout_attempt_closures(workspace_id,request_id,actor_id)
  VALUES(_workspace_id,_request_id,auth.uid()) ON CONFLICT(workspace_id,request_id) DO NOTHING;
 SELECT * INTO closed FROM public.slim_checkout_attempt_closures c WHERE c.workspace_id=_workspace_id AND c.request_id=_request_id AND c.actor_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Referência não disponível para este operador.' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('state','closed','workspaceId',_workspace_id,'requestId',_request_id,'actorId',closed.actor_id);
END;$function$
;
REVOKE ALL ON FUNCTION slim_close_checkout_attempt(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_close_checkout_attempt(uuid,uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_confirm_order(_workspace_id uuid, _request_id uuid, _quote jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.slim_confirm_order(_workspace_id,_request_id,_quote); $function$
;
REVOKE ALL ON FUNCTION slim_confirm_order(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_confirm_order(uuid,uuid,jsonb) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_copilot_create_proposal(p_workspace_id uuid, p_request_id uuid, p_kind text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_payload jsonb; v_row jsonb; v_capture jsonb;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 v_payload:=private.slim_copilot_payload(p_kind,p_payload);
 v_row:=private.slim_copilot_find_request(p_workspace_id,p_request_id,p_kind,v_payload);
 IF v_row IS NOT NULL THEN RETURN private.slim_copilot_dto(v_row); END IF;
 v_capture:=private.slim_copilot_capture(p_workspace_id,p_kind,v_payload);
 v_row:=private.slim_copilot_store(p_workspace_id,p_request_id,p_kind,v_payload,v_capture->'snapshot',v_capture->'preview');
 RETURN private.slim_copilot_dto(v_row);
END;$function$
;
REVOKE ALL ON FUNCTION slim_copilot_create_proposal(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_copilot_create_proposal(uuid,uuid,text,jsonb) TO "authenticated";

COMMIT;
SELECT '18-functions.sql' AS migration_batch,'OK' AS result;


-- 19-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION public.slim_copilot_decide_proposal(p_workspace_id uuid, p_proposal_id uuid, p_expected_version uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_row jsonb; v_capture jsonb; v_reply jsonb; v_result jsonb; v_status text; v_payload jsonb;
BEGIN
 PERFORM private.slim_copilot_assert_scope(p_workspace_id);
 IF p_proposal_id IS NULL OR p_expected_version IS NULL OR (p_decision IN ('approve','reject')) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Informe a proposta, a versão e uma decisão explícita.' USING ERRCODE='22023';
 END IF;
 -- Same order as the established unitary move: request lock, then lead lock.
 -- Reentrant inside slim_move_lead_and_emit; no Node check/RPC race.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_proposal_id::text,23));
 v_row:=private.slim_copilot_refresh(p_workspace_id,p_proposal_id);
 IF (v_row->>'version')::uuid IS DISTINCT FROM p_expected_version THEN
  RAISE EXCEPTION 'A versão da proposta mudou. Reabra o cartão antes de decidir.' USING ERRCODE='42501';
 END IF;
 -- Replays return the stored receipt before reading mutable target state.
 IF v_row->>'status'<>'pending' THEN RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));END IF;
 IF p_decision='reject' THEN
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'rejected',
   jsonb_build_object('summary','Proposta rejeitada. A ação não foi executada.'));
  RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));
 END IF;
 v_payload:=v_row->'payload';
 BEGIN
  v_capture:=private.slim_copilot_capture(p_workspace_id,v_row->>'kind',v_payload);
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR serialization_failure THEN
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'stale',
   jsonb_build_object('summary','O alvo, o acesso ou a configuração mudou. Prepare uma nova proposta; esta ação não foi executada.'));
  RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));
 END;
 IF (v_capture->'snapshot') IS DISTINCT FROM (v_row->'snapshot') THEN
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'stale',
   jsonb_build_object('summary','O estado exibido na proposta mudou. Prepare uma nova proposta; esta ação não foi executada.'));
  RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));
 END IF;
 IF v_row->>'kind'='send_text' THEN
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'executing',
   jsonb_build_object('summary','Tentativa de envio registrada. Aguarde a confirmação e não repita o envio.'));
  -- The server consumes this one-time claim and returns only proposal to the UI.
  RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row),'claim',v_payload||jsonb_build_object(
   'fresh',true,'proposalId',p_proposal_id,'workspaceId',p_workspace_id,'actorId',auth.uid(),
   'version',p_expected_version,'claimToken',v_row->'claim_token','createdAt',v_row->'created_at'));
 END IF;
 -- A failed receipt save rolls back the business RPC and its outbox in this
 -- subtransaction. Only a no-effect failure/stale receipt may then be persisted.
 BEGIN
  CASE v_row->>'kind'
   WHEN 'move_lead_stage' THEN
    v_reply:=public.slim_move_lead_and_emit(p_workspace_id,(v_payload->>'leadId')::uuid,(v_payload->>'stageId')::uuid,p_proposal_id);
    IF (v_reply->>'ok') IS DISTINCT FROM 'true' OR v_reply->>'leadId' IS DISTINCT FROM v_payload->>'leadId' THEN
     RAISE EXCEPTION 'Movimentação não confirmada.';
    END IF;
    v_result:=jsonb_build_object('summary',CASE WHEN (v_reply->>'moved')='true'
      THEN 'Cliente movido. Os gatilhos aplicáveis entram na fila de automações.' ELSE 'O cliente já estava nesta etapa. Nenhuma nova movimentação foi feita.' END,
     'receiptId',coalesce(v_reply->>'eventId',p_proposal_id::text));
   WHEN 'start_salesbot' THEN
    v_reply:=public.slim_inbox_start_salesbot(p_workspace_id,(v_payload->>'leadId')::uuid,(v_payload->>'botId')::uuid,p_proposal_id);
    IF (v_reply->>'ok') IS DISTINCT FROM 'true' OR length(coalesce(v_reply->>'runId',''))=0 THEN RAISE EXCEPTION 'Início do SalesBot não confirmado.';END IF;
    IF v_reply->>'reused'='true' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_row#>'{snapshot,liveRuns}') r WHERE r->>'id'=v_reply->>'runId') THEN
     RAISE EXCEPTION 'Outra execução foi iniciada. Prepare uma nova proposta.' USING ERRCODE='40001';
    END IF;
    v_result:=jsonb_build_object('summary',CASE WHEN v_reply->>'reused'='true' THEN 'A execução já ativa foi preservada. Nenhum SalesBot duplicado foi iniciado.'
     ELSE 'SalesBot colocado na fila para este cliente. O andamento pode ser conferido no Inbox.' END,'receiptId',v_reply->>'runId');
   WHEN 'stop_salesbot' THEN
    v_reply:=public.slim_inbox_stop_salesbot(p_workspace_id,(v_payload->>'leadId')::uuid,(v_payload->>'runId')::uuid);
    IF (v_reply->>'ok') IS DISTINCT FROM 'true' OR (v_reply->>'stopped') IS DISTINCT FROM 'true'
      OR (v_reply->>'runId') IS DISTINCT FROM (v_payload->>'runId') THEN
     RAISE EXCEPTION 'A execução mudou antes de ser encerrada.' USING ERRCODE='40001';
    END IF;
    v_result:=jsonb_build_object('summary','A execução indicada foi encerrada. Mensagens já aceitas pelo WhatsApp não são desfeitas.','receiptId',v_reply->>'runId');
   ELSE RAISE EXCEPTION 'Ação não permitida no Copiloto.' USING ERRCODE='22023';
  END CASE;
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,'succeeded',v_result);
 EXCEPTION WHEN OTHERS THEN
  v_status:=CASE WHEN SQLSTATE IN ('40001','42501') THEN 'stale' ELSE 'failed' END;
  v_row:=private.slim_copilot_transition(p_workspace_id,p_proposal_id,p_expected_version,v_status,
   jsonb_build_object('summary',CASE WHEN v_status='stale' THEN 'O estado ou a permissão mudou. Prepare uma nova proposta; esta ação não foi executada.'
    ELSE 'Não foi possível concluir esta ação. As alterações desta tentativa foram desfeitas; confira o resultado antes de preparar outra proposta.' END,
    'code',SQLSTATE));
 END;
 RETURN jsonb_build_object('proposal',private.slim_copilot_dto(v_row));
END;$function$
;
REVOKE ALL ON FUNCTION slim_copilot_decide_proposal(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_copilot_decide_proposal(uuid,uuid,uuid,text) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_copilot_finish_text(p_workspace_id uuid, p_proposal_id uuid, p_claim_token uuid, p_outcome jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_copilot_finish_text_impl(p_workspace_id,p_proposal_id,p_claim_token,p_outcome);
$function$
;
REVOKE ALL ON FUNCTION slim_copilot_finish_text(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_copilot_finish_text(uuid,uuid,uuid,jsonb) TO "service_role";
CREATE OR REPLACE FUNCTION public.slim_copilot_get_proposal(p_workspace_id uuid, p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_copilot_dto(private.slim_copilot_refresh(p_workspace_id,p_proposal_id));
$function$
;
REVOKE ALL ON FUNCTION slim_copilot_get_proposal(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_copilot_get_proposal(uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_copilot_list_proposals(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_copilot_list(p_workspace_id);
$function$
;
REVOKE ALL ON FUNCTION slim_copilot_list_proposals(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_copilot_list_proposals(uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_create_lead_and_emit(_workspace_id uuid, _crm_source_id uuid, _pipeline_id uuid, _stage_id uuid, _name text, _email text, _phone text, _value numeric, _request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_create_lead_and_emit_impl(
  _workspace_id,_crm_source_id,_pipeline_id,_stage_id,_name,_email,_phone,_value,_request_id
 );
$function$
;
REVOKE ALL ON FUNCTION slim_create_lead_and_emit(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_create_lead_and_emit(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_enqueue_audience_campaign(_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.slim_enqueue_audience_campaign(_payload); $function$
;
REVOKE ALL ON FUNCTION slim_enqueue_audience_campaign(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_enqueue_audience_campaign(jsonb) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_inbox_automation_state(p_workspace_id uuid, p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare result jsonb;
begin
 perform private.slim_inbox_assert_target(p_workspace_id,p_lead_id);
 select jsonb_build_object('workspaceId',p_workspace_id,'leadId',p_lead_id,
 'bots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from public.salesbots s where s.workspace_id=p_workspace_id and s.is_active and s.scope='individual'),'[]'::jsonb),
 'agents',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) order by a.name) from public.conversation_ai_agents a where a.workspace_id=p_workspace_id and a.enabled),'[]'::jsonb),
 'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'botId',r.salesbot_id,'name',s.name,'status',r.status,'startedAt',r.started_at) order by r.started_at) from public.salesbot_runs r join public.salesbots s on s.id=r.salesbot_id and s.workspace_id=r.workspace_id where r.workspace_id=p_workspace_id and r.lead_id=p_lead_id and r.status in ('queued','pending','running','waiting','waiting_timer','waiting_message','paused')),'[]'::jsonb),
 'activeAgent',(select jsonb_build_object('id',a.id,'name',a.name,'version',l.active_conversation_agent_version,'paused',l.ai_paused,'startedAt',l.active_conversation_agent_started_at) from public.leads l join public.conversation_ai_agents a on a.id=l.active_conversation_agent_id and a.workspace_id=l.workspace_id where l.id=p_lead_id and l.workspace_id=p_workspace_id)) into result;
 return result;
end $function$
;
REVOKE ALL ON FUNCTION slim_inbox_automation_state(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_inbox_automation_state(uuid,uuid) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.slim_inbox_set_agent(p_workspace_id uuid, p_lead_id uuid, p_agent_id uuid, p_action text, p_expected_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare l public.leads; a public.conversation_ai_agents; v bigint;
begin
 perform private.slim_inbox_assert_target(p_workspace_id,p_lead_id);
 select * into l from public.leads where id=p_lead_id and workspace_id=p_workspace_id for update;
 if p_action='start' then
  select * into a from public.conversation_ai_agents where id=p_agent_id and workspace_id=p_workspace_id and enabled for share;
  if not found then raise exception 'Selecione um Agente IA ativo desta empresa.'; end if;
  if l.active_conversation_agent_id is not null and not l.ai_paused then
   if l.active_conversation_agent_id=p_agent_id then return jsonb_build_object('ok',true,'agentId',p_agent_id,'version',l.active_conversation_agent_version,'reused',true); end if;
   raise exception 'Encerre o agente atual desta conversa antes de iniciar outro.';
  end if;
  update public.leads set active_conversation_agent_id=p_agent_id,ai_paused=false,updated_at=clock_timestamp() where id=l.id returning active_conversation_agent_version into v;
  insert into public.lead_activities(workspace_id,lead_id,type,payload) values(p_workspace_id,p_lead_id,'note',jsonb_build_object('text','Agente IA '||a.name||' iniciado nesta conversa.','source','inbox_manual_control','agent_id',a.id,'version',v));
 elsif p_action='stop' then
  if l.active_conversation_agent_id is distinct from p_agent_id or l.active_conversation_agent_version is distinct from p_expected_version then raise exception 'O agente desta conversa mudou. Atualize a lista antes de encerrar.'; end if;
  update public.leads set active_conversation_agent_id=null,ai_paused=true,updated_at=clock_timestamp() where id=l.id returning active_conversation_agent_version into v;
  insert into public.lead_activities(workspace_id,lead_id,type,payload) values(p_workspace_id,p_lead_id,'note',jsonb_build_object('text','Agente IA encerrado nesta conversa.','source','inbox_manual_control','agent_id',p_agent_id,'version',v));
 else raise exception 'Ação inválida.';
 end if;
 return jsonb_build_object('ok',true,'agentId',p_agent_id,'version',v,'reused',false);
end $function$
;
REVOKE ALL ON FUNCTION slim_inbox_set_agent(uuid,uuid,uuid,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_inbox_set_agent(uuid,uuid,uuid,text,bigint) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.slim_inbox_start_salesbot(p_workspace_id uuid, p_lead_id uuid, p_salesbot_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.salesbot_runs; b public.salesbots; rid uuid:=gen_random_uuid();
begin
 perform private.slim_inbox_assert_target(p_workspace_id,p_lead_id);
 if p_request_id is null then raise exception 'Identificador da solicitação obrigatório.'; end if;
 perform 1 from public.leads where id=p_lead_id and workspace_id=p_workspace_id for update;
 select * into r from public.salesbot_runs where workspace_id=p_workspace_id and request_id=p_request_id;
 if found then
  if r.lead_id<>p_lead_id or r.salesbot_id<>p_salesbot_id then raise exception 'Solicitação pertence a outra execução.' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'runId',r.id,'status',r.status,'reused',true);
 end if;
 select * into b from public.salesbots where id=p_salesbot_id and workspace_id=p_workspace_id for share;
 if not found or not b.is_active or b.scope<>'individual' then raise exception 'Selecione um SalesBot individual ativo desta empresa.'; end if;
 if not exists(select 1 from public.salesbot_blocks where salesbot_id=b.id and workspace_id=p_workspace_id) then raise exception 'Este SalesBot não possui blocos salvos.'; end if;
 select * into r from public.salesbot_runs where workspace_id=p_workspace_id and lead_id=p_lead_id and salesbot_id=p_salesbot_id and status in ('queued','pending','running','waiting','waiting_timer','waiting_message','paused');
 if found then return jsonb_build_object('ok',true,'runId',r.id,'status',r.status,'reused',true); end if;
 insert into public.salesbot_runs(id,workspace_id,salesbot_id,lead_id,status,request_id,actor_user_id,variables)
 values(rid,p_workspace_id,p_salesbot_id,p_lead_id,'queued',p_request_id,auth.uid(),jsonb_build_object('trigger','inbox-manual','source','inbox_manual_control'));
 insert into public.salesbot_run_logs(workspace_id,salesbot_run_id,status,message,payload)
 values(p_workspace_id,rid,'ok','Iniciado manualmente no Inbox.',jsonb_build_object('actor_user_id',auth.uid(),'request_id',p_request_id));
 return jsonb_build_object('ok',true,'runId',rid,'status','queued','reused',false);
end $function$
;
REVOKE ALL ON FUNCTION slim_inbox_start_salesbot(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_inbox_start_salesbot(uuid,uuid,uuid,uuid) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.slim_inbox_stop_salesbot(p_workspace_id uuid, p_lead_id uuid, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.salesbot_runs; changed boolean:=false;
begin
 perform private.slim_inbox_assert_target(p_workspace_id,p_lead_id);
 select * into r from public.salesbot_runs where id=p_run_id and workspace_id=p_workspace_id and lead_id=p_lead_id for update;
 if not found then raise exception 'Execução não encontrada nesta conversa.' using errcode='42501'; end if;
 if r.status in ('queued','pending','running','waiting','waiting_timer','waiting_message','paused') then
  update public.salesbot_runs set status='finished',stopped_at=clock_timestamp(),stopped_by=auth.uid(),finished_at=clock_timestamp(),waiting_until=null,current_block_id=null,last_error=null where id=r.id;
  insert into public.salesbot_run_logs(workspace_id,salesbot_run_id,status,message,payload)
  values(p_workspace_id,r.id,'ok','Encerrado manualmente no Inbox.',jsonb_build_object('actor_user_id',auth.uid()));
  changed:=true;
 end if;
 return jsonb_build_object('ok',true,'runId',r.id,'stopped',changed);
end $function$
;
REVOKE ALL ON FUNCTION slim_inbox_stop_salesbot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_inbox_stop_salesbot(uuid,uuid,uuid) TO "service_role","authenticated";
CREATE OR REPLACE FUNCTION public.slim_invitation_accept(p_token uuid, p_actor_id uuid, p_approved boolean, p_mode text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_invitation_accept_impl(p_token,p_actor_id,p_approved,p_mode);
$function$
;
REVOKE ALL ON FUNCTION slim_invitation_accept(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_invitation_accept(uuid,uuid,boolean,text) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_invitation_change(p_workspace_id uuid, p_actor_id uuid, p_request_id uuid, p_action text, p_payload jsonb, p_expected_fingerprint text, p_approved boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_invitation_change_impl(p_workspace_id,p_actor_id,p_request_id,p_action,p_payload,p_expected_fingerprint,p_approved);
$function$
;
REVOKE ALL ON FUNCTION slim_invitation_change(uuid,uuid,uuid,text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_invitation_change(uuid,uuid,uuid,text,jsonb,text,boolean) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_invitation_change_lookup(p_workspace_id uuid, p_actor_id uuid, p_request_id uuid, p_action text, p_invitation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_invitation_change_lookup_impl(p_workspace_id,p_actor_id,p_request_id,p_action,p_invitation_id);
$function$
;
REVOKE ALL ON FUNCTION slim_invitation_change_lookup(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_invitation_change_lookup(uuid,uuid,uuid,text,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_invitation_context(p_workspace_id uuid, p_actor_id uuid, p_action text, p_email text DEFAULT NULL::text, p_invitation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_invitation_context_impl(p_workspace_id,p_actor_id,p_action,p_email,p_invitation_id);
$function$
;
REVOKE ALL ON FUNCTION slim_invitation_context(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_invitation_context(uuid,uuid,text,text,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_invitation_link(p_workspace_id uuid, p_actor_id uuid, p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_invitation_link_impl(p_workspace_id,p_actor_id,p_invitation_id);
$function$
;
REVOKE ALL ON FUNCTION slim_invitation_link(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

COMMIT;
SELECT '19-functions.sql' AS migration_batch,'OK' AS result;


-- 20-functions.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
GRANT EXECUTE ON FUNCTION slim_invitation_link(uuid,uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_invitation_preview(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_invitation_preview_impl(p_token);
$function$
;
REVOKE ALL ON FUNCTION slim_invitation_preview(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_invitation_preview(uuid) TO "service_role";
CREATE OR REPLACE FUNCTION public.slim_lookup_order_change(_workspace_id uuid, _order_id uuid, _request_id uuid, _operation text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_lookup_order_change(_workspace_id,_order_id,_request_id,_operation);
$function$
;
REVOKE ALL ON FUNCTION slim_lookup_order_change(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_lookup_order_change(uuid,uuid,uuid,text) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_move_lead_and_emit(_workspace_id uuid, _lead_id uuid, _stage_id uuid, _request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.slim_move_lead_and_emit_impl(_workspace_id,_lead_id,_stage_id,_request_id);
$function$
;
REVOKE ALL ON FUNCTION slim_move_lead_and_emit(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_move_lead_and_emit(uuid,uuid,uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION public.slim_order_change_context(_workspace_id uuid, _order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE o public.slim_orders;
BEGIN
 IF auth.uid() IS NULL OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para editar ou excluir pedidos.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO o FROM public.slim_orders WHERE id=_order_id AND workspace_id=_workspace_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado nesta empresa.' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.slim_order_changes c WHERE c.workspace_id=_workspace_id AND c.order_id=_order_id AND c.state='completed') THEN
  RAISE EXCEPTION 'O pedido já foi editado ou excluído. Atualize a lista.' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('row',to_jsonb(o)-'request_payload','fingerprint',encode(extensions.digest(o.snapshot::text||'|'||o.status,'sha256'),'hex'));
END;$function$
;
REVOKE ALL ON FUNCTION slim_order_change_context(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_order_change_context(uuid,uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_reconcile_legacy_sale(_workspace_id uuid, _lead_id uuid, _fingerprint text, _stock_mode text, _payment jsonb, _approved boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.slim_reconcile_legacy_sale(_workspace_id,_lead_id,_fingerprint,_stock_mode,_payment,_approved);$function$
;
REVOKE ALL ON FUNCTION slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_review_legacy_sales(_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT private.slim_workspace_access(_workspace_id) THEN RAISE EXCEPTION 'Empresa não autorizada.' USING ERRCODE='42501';END IF;
 IF (SELECT count(*) FROM public.leads WHERE workspace_id=_workspace_id AND source='pedido_saude_slim')>5000 THEN RAISE EXCEPTION 'A conferência excedeu o limite. Nenhum total parcial será exibido.' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',s,'fingerprint',encode(extensions.digest(s::text,'sha256'),'hex'),'orderId',o.id,'number',o.snapshot->>'number','orderStatus',o.status) ORDER BY l.created_at DESC,l.id),'[]'::jsonb) INTO result FROM public.leads l CROSS JOIN LATERAL (SELECT private.slim_legacy_sale_source(_workspace_id,l.id) AS s) source_row LEFT JOIN public.slim_orders o ON o.workspace_id=l.workspace_id AND o.legacy_lead_id=l.id WHERE l.workspace_id=_workspace_id AND l.source='pedido_saude_slim';
 RETURN result;
END;$function$
;
REVOKE ALL ON FUNCTION slim_review_legacy_sales(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_review_legacy_sales(uuid) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_save_custom_fields(p_deleted_ids uuid[], p_updated jsonb, p_created jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_ws uuid; v_field jsonb; v_id uuid; v_count integer; v_existing public.lead_custom_fields;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select current_workspace_id into v_ws from public.profiles where id=auth.uid();
  if v_ws is null or not private.slim_workspace_access(v_ws,'operator') then
    raise exception 'workspace_forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_updated) is distinct from 'array' or jsonb_typeof(p_created) is distinct from 'array' then
    raise exception 'invalid_custom_fields';
  end if;
  foreach v_id in array coalesce(p_deleted_ids,array[]::uuid[]) loop
    -- FK cascade removes values in the same transaction, never before confirmation.
    delete from public.lead_custom_fields where workspace_id=v_ws and id=v_id;
  end loop;
  for v_field in select value from jsonb_array_elements(p_updated) loop
    update public.lead_custom_fields set name=v_field->>'name',field_type=v_field->>'fieldType',options=coalesce(v_field->'options','[]')
    where id=(v_field->>'id')::uuid and workspace_id=v_ws;
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception 'Campo não encontrado ou sem permissão para editar.'; end if;
  end loop;
  for v_field in select value from jsonb_array_elements(p_created) loop
    insert into public.lead_custom_fields(id,workspace_id,name,field_type,options)
    values((v_field->>'id')::uuid,v_ws,v_field->>'name',v_field->>'fieldType',coalesce(v_field->'options','[]'))
    on conflict(id) do nothing;
    select * into v_existing from public.lead_custom_fields where id=(v_field->>'id')::uuid and workspace_id=v_ws;
    if not found or v_existing.name is distinct from v_field->>'name'
      or v_existing.field_type is distinct from v_field->>'fieldType'
      or v_existing.options is distinct from coalesce(v_field->'options','[]') then
      raise exception 'Conflito ao confirmar o campo personalizado.';
    end if;
  end loop;
  if exists(select 1 from public.lead_custom_fields where workspace_id=v_ws and id=any(coalesce(p_deleted_ids,array[]::uuid[]))) then
    raise exception 'O banco não confirmou a exclusão dos campos.';
  end if;
  return jsonb_build_object('ok',true);
end $function$
;
REVOKE ALL ON FUNCTION slim_save_custom_fields(uuid[],jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_save_custom_fields(uuid[],jsonb,jsonb) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.slim_sync_group_catalog(_workspace_id uuid, _session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
DECLARE
 recovered_count integer;
 total_count integer;
BEGIN
 PERFORM public.slim_assert_session_security();
 IF _workspace_id IS NULL OR auth.uid() IS NULL
    OR NOT EXISTS(
     SELECT 1 FROM public.profiles p
     WHERE p.id=auth.uid() AND p.current_workspace_id=_workspace_id
    ) OR NOT private.slim_workspace_access(_workspace_id,'operator') THEN
  RAISE EXCEPTION 'Sem permissão para sincronizar os grupos desta empresa.' USING ERRCODE='42501';
 END IF;
 IF _session_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.whatsapp_web_sessions s
  WHERE s.id=_session_id AND s.workspace_id=_workspace_id
 ) THEN
  RAISE EXCEPTION 'A sessão não pertence à empresa selecionada.' USING ERRCODE='42501';
 END IF;

 INSERT INTO public.whatsapp_groups(
  workspace_id,session_id,group_jid,name,metadata,last_synced_at
 )
 SELECT _workspace_id,h.session_id,h.group_jid,
  'Grupo WhatsApp '||right(split_part(h.group_jid,'@',1),6),
  jsonb_build_object('source','inbox_history','history_latest_at',h.history_latest_at,'recovered_at',now()),
  NULL
 FROM (
  SELECT m.session_id,m.remote_jid AS group_jid,max(m.received_at) AS history_latest_at
  FROM public.whatsapp_web_messages m
  JOIN public.whatsapp_web_sessions s ON s.id=m.session_id AND s.workspace_id=m.workspace_id
  WHERE m.workspace_id=_workspace_id
   AND (_session_id IS NULL OR m.session_id=_session_id)
   AND m.remote_jid ~ '^[0-9]+(-[0-9]+)?@g[.]us$'
  GROUP BY m.session_id,m.remote_jid
 ) h
 ON CONFLICT(session_id,group_jid) DO NOTHING;
 GET DIAGNOSTICS recovered_count=ROW_COUNT;

 SELECT count(*)::integer INTO total_count
 FROM public.whatsapp_groups g
 WHERE g.workspace_id=_workspace_id AND (_session_id IS NULL OR g.session_id=_session_id);
 RETURN jsonb_build_object('recovered',recovered_count,'total',total_count);
END;$function$
;
REVOKE ALL ON FUNCTION slim_sync_group_catalog(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION slim_sync_group_catalog(uuid,uuid) TO "authenticated";
CREATE OR REPLACE FUNCTION public.snapshot_lead_product_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  product_price numeric(14,2);
begin
  if new.kind = 'comprou' then
    if new.sold_at is null then
      new.sold_at := now();
    end if;

    if new.unit_price is null then
      select coalesce(promo_price, price, 0)
      into product_price
      from public.products
      where id = new.product_id
        and workspace_id = new.workspace_id;

      new.unit_price := coalesce(product_price, 0);
    end if;
  end if;

  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION snapshot_lead_product_sale() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION snapshot_lead_product_sale() TO "service_role";
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION touch_updated_at() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION touch_updated_at() TO PUBLIC,"anon","authenticated","service_role";
CREATE OR REPLACE FUNCTION public.tracking_overview(_workspace_id uuid, _days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
END;$function$
;
REVOKE ALL ON FUNCTION tracking_overview(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION tracking_overview(uuid,integer) TO "authenticated","service_role";
CREATE OR REPLACE FUNCTION public.whatsapp_number_limit(_workspace_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.saude_slim_assert_workspace_member(_workspace_id);
  RETURN 2147483647;
END;
$function$
;
REVOKE ALL ON FUNCTION whatsapp_number_limit(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION whatsapp_number_limit(uuid) TO "service_role","authenticated";

COMMIT;
SELECT '20-functions.sql' AS migration_batch,'OK' AS result;


-- 21-constraints.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
ALTER TABLE "private"."bcpll_platform_support" ADD CONSTRAINT "bcpll_platform_support_pkey" PRIMARY KEY (user_id);
ALTER TABLE "private"."bcpll_support_context" ADD CONSTRAINT "bcpll_support_context_pkey" PRIMARY KEY (user_id);
ALTER TABLE "private"."integration_credentials" ADD CONSTRAINT "integration_credentials_pkey" PRIMARY KEY (integration_id);
ALTER TABLE "private"."slim_copilot_proposal_audit" ADD CONSTRAINT "slim_copilot_proposal_audit_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_check" CHECK ((((claim_token IS NULL) AND (claimed_at IS NULL)) OR ((kind = 'send_text'::text) AND (claim_token IS NOT NULL) AND (claimed_at IS NOT NULL))));
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_decision_check" CHECK ((decision = ANY (ARRAY['approve'::text, 'reject'::text])));
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_kind_check" CHECK ((kind = ANY (ARRAY['move_lead_stage'::text, 'start_salesbot'::text, 'stop_salesbot'::text, 'send_text'::text])));
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_payload_check" CHECK ((jsonb_typeof(payload) = 'object'::text));
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_preview_check" CHECK ((jsonb_typeof(preview) = 'object'::text));
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_request_sha256_check" CHECK ((request_sha256 ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_result_check" CHECK (((result IS NULL) OR (jsonb_typeof(result) = 'object'::text)));
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_snapshot_check" CHECK ((jsonb_typeof(snapshot) = 'object'::text));
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'executing'::text, 'succeeded'::text, 'failed'::text, 'rejected'::text, 'stale'::text, 'expired'::text, 'uncertain'::text])));
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_workspace_id_request_id_key" UNIQUE (workspace_id, request_id);
ALTER TABLE "private"."slim_funnel_write_requests" ADD CONSTRAINT "slim_funnel_write_requests_operation_check" CHECK ((operation = ANY (ARRAY['create'::text, 'move'::text, 'bulk_move'::text])));
ALTER TABLE "private"."slim_funnel_write_requests" ADD CONSTRAINT "slim_funnel_write_requests_pkey" PRIMARY KEY (workspace_id, request_id);
ALTER TABLE "private"."slim_funnel_write_requests" ADD CONSTRAINT "slim_funnel_write_requests_request_fingerprint_check" CHECK ((request_fingerprint ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE "private"."slim_funnel_write_requests" ADD CONSTRAINT "slim_funnel_write_requests_response_check" CHECK ((jsonb_typeof(response) = 'object'::text));
ALTER TABLE "private"."slim_invitation_requests" ADD CONSTRAINT "slim_invitation_requests_action_check" CHECK ((action = ANY (ARRAY['create'::text, 'renew'::text, 'revoke'::text])));
ALTER TABLE "private"."slim_invitation_requests" ADD CONSTRAINT "slim_invitation_requests_check" CHECK ((((action = 'create'::text) AND (target_id IS NULL)) OR ((action = ANY (ARRAY['renew'::text, 'revoke'::text])) AND (target_id IS NOT NULL))));
ALTER TABLE "private"."slim_invitation_requests" ADD CONSTRAINT "slim_invitation_requests_check1" CHECK ((((payload_hash IS NULL) AND (expected_fingerprint IS NULL)) OR ((payload_hash ~ '^[0-9a-f]{64}$'::text) AND (expected_fingerprint ~ '^[0-9a-f]{64}$'::text))));
ALTER TABLE "private"."slim_invitation_requests" ADD CONSTRAINT "slim_invitation_requests_pkey" PRIMARY KEY (request_id);
ALTER TABLE "private"."slim_invitation_requests" ADD CONSTRAINT "slim_invitation_requests_receipt_check" CHECK ((jsonb_typeof(receipt) = 'object'::text));
ALTER TABLE "public"."ai_agent_conversations" ADD CONSTRAINT "ai_agent_conversations_messages_check" CHECK ((jsonb_typeof(messages) = 'array'::text));
ALTER TABLE "public"."ai_agent_conversations" ADD CONSTRAINT "ai_agent_conversations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."ai_agent_conversations" ADD CONSTRAINT "ai_agent_conversations_workspace_id_user_id_module_key" UNIQUE (workspace_id, user_id, module);
ALTER TABLE "public"."ai_agent_settings" ADD CONSTRAINT "ai_agent_settings_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."ai_agent_settings" ADD CONSTRAINT "ai_agent_settings_workspace_id_module_key" UNIQUE (workspace_id, module);
ALTER TABLE "public"."ai_brain_blocked_terms" ADD CONSTRAINT "ai_brain_blocked_terms_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."ai_brain_blocked_terms" ADD CONSTRAINT "ai_brain_blocked_terms_term_check" CHECK (((length(btrim(term)) >= 1) AND (length(btrim(term)) <= 120)));
ALTER TABLE "public"."ai_brain_blocked_terms" ADD CONSTRAINT "ai_brain_blocked_terms_workspace_id_term_key" UNIQUE (workspace_id, term);
ALTER TABLE "public"."ai_brain_chunks" ADD CONSTRAINT "ai_brain_chunks_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."ai_brain_chunks" ADD CONSTRAINT "ai_brain_chunks_source_id_chunk_index_key" UNIQUE (source_id, chunk_index);
ALTER TABLE "public"."ai_brain_sources" ADD CONSTRAINT "ai_brain_sources_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."ai_brain_sources" ADD CONSTRAINT "ai_brain_sources_source_type_check" CHECK ((source_type = ANY (ARRAY['text'::text, 'url'::text, 'document'::text, 'promotion'::text])));
ALTER TABLE "public"."bcpll_email_campaigns" ADD CONSTRAINT "bcpll_email_campaigns_id_workspace_id_key" UNIQUE (id, workspace_id);
ALTER TABLE "public"."bcpll_email_campaigns" ADD CONSTRAINT "bcpll_email_campaigns_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bcpll_email_campaigns" ADD CONSTRAINT "bcpll_email_campaigns_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'sending'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE "public"."bcpll_email_campaigns" ADD CONSTRAINT "bcpll_email_campaigns_workspace_id_request_id_key" UNIQUE (workspace_id, request_id);
ALTER TABLE "public"."bcpll_email_outbox" ADD CONSTRAINT "bcpll_email_outbox_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bcpll_email_outbox" ADD CONSTRAINT "bcpll_email_outbox_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'uncertain'::text, 'cancelled'::text])));
ALTER TABLE "public"."bcpll_email_outbox" ADD CONSTRAINT "bcpll_email_outbox_workspace_id_idempotency_key_key" UNIQUE (workspace_id, idempotency_key);
ALTER TABLE "public"."bcpll_email_stage_rules" ADD CONSTRAINT "bcpll_email_stage_rules_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bcpll_email_stage_rules" ADD CONSTRAINT "bcpll_email_stage_rules_workspace_id_stage_id_template_id_key" UNIQUE (workspace_id, stage_id, template_id);
ALTER TABLE "public"."bcpll_email_templates" ADD CONSTRAINT "bcpll_email_templates_body_text_check" CHECK (((length(body_text) >= 1) AND (length(body_text) <= 100000)));
ALTER TABLE "public"."bcpll_email_templates" ADD CONSTRAINT "bcpll_email_templates_id_workspace_id_key" UNIQUE (id, workspace_id);
ALTER TABLE "public"."bcpll_email_templates" ADD CONSTRAINT "bcpll_email_templates_name_check" CHECK (((length(name) >= 1) AND (length(name) <= 120)));
ALTER TABLE "public"."bcpll_email_templates" ADD CONSTRAINT "bcpll_email_templates_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bcpll_email_templates" ADD CONSTRAINT "bcpll_email_templates_subject_check" CHECK (((length(subject) >= 1) AND (length(subject) <= 200)));
ALTER TABLE "public"."bcpll_tutorial_lessons" ADD CONSTRAINT "bcpll_tutorial_lessons_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bcpll_tutorial_lessons" ADD CONSTRAINT "bcpll_tutorial_lessons_position_check" CHECK ((("position" >= 0) AND ("position" <= 1000000)));
ALTER TABLE "public"."bcpll_tutorial_lessons" ADD CONSTRAINT "bcpll_tutorial_lessons_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 160)));
ALTER TABLE "public"."bcpll_tutorial_lessons" ADD CONSTRAINT "bcpll_tutorial_lessons_video_id_check" CHECK ((video_id ~ '^[A-Za-z0-9_-]{11}$'::text));
ALTER TABLE "public"."bcpll_tutorial_modules" ADD CONSTRAINT "bcpll_tutorial_modules_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bcpll_tutorial_modules" ADD CONSTRAINT "bcpll_tutorial_modules_position_check" CHECK ((("position" >= 0) AND ("position" <= 1000000)));
ALTER TABLE "public"."bcpll_tutorial_modules" ADD CONSTRAINT "bcpll_tutorial_modules_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 160)));
ALTER TABLE "public"."bcpll_utm_links" ADD CONSTRAINT "bcpll_utm_links_final_url_check" CHECK ((final_url ~ '^https?://'::text));
ALTER TABLE "public"."bcpll_utm_links" ADD CONSTRAINT "bcpll_utm_links_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bcpll_utm_links" ADD CONSTRAINT "bcpll_utm_links_workspace_id_final_url_key" UNIQUE (workspace_id, final_url);
ALTER TABLE "public"."bcpll_workspaces" ADD CONSTRAINT "bcpll_workspaces_owner_id_key" UNIQUE (owner_id);
ALTER TABLE "public"."bcpll_workspaces" ADD CONSTRAINT "bcpll_workspaces_pkey" PRIMARY KEY (workspace_id);
ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."conversation_agent_runs" ADD CONSTRAINT "conversation_agent_runs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."conversation_ai_agents" ADD CONSTRAINT "conversation_ai_agents_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."conversation_ai_agents" ADD CONSTRAINT "conversation_ai_agents_workspace_id_id_key" UNIQUE (workspace_id, id);
ALTER TABLE "public"."crm_automation_jobs" ADD CONSTRAINT "crm_automation_jobs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."crm_automation_jobs" ADD CONSTRAINT "crm_automation_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'skipped'::text, 'error'::text, 'cancelled'::text])));
ALTER TABLE "public"."crm_automation_jobs" ADD CONSTRAINT "crm_automation_jobs_workspace_id_dedupe_key_key" UNIQUE (workspace_id, dedupe_key);
ALTER TABLE "public"."crm_form_submissions" ADD CONSTRAINT "crm_form_submissions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."crm_form_submissions" ADD CONSTRAINT "crm_form_submissions_values_check" CHECK ((jsonb_typeof("values") = 'object'::text));
ALTER TABLE "public"."crm_forms" ADD CONSTRAINT "crm_forms_origin_check" CHECK ((origem = ANY (ARRAY['mkton'::text, 'externo'::text, 'meta'::text])));
ALTER TABLE "public"."crm_forms" ADD CONSTRAINT "crm_forms_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."crm_forms" ADD CONSTRAINT "crm_forms_workspace_slug_uniq" UNIQUE (workspace_id, slug);
ALTER TABLE "public"."crm_lead_audiences" ADD CONSTRAINT "crm_lead_audiences_cached_count_check" CHECK ((cached_count >= 0));
ALTER TABLE "public"."crm_lead_audiences" ADD CONSTRAINT "crm_lead_audiences_filters_check" CHECK ((jsonb_typeof(filters) = 'object'::text));
ALTER TABLE "public"."crm_lead_audiences" ADD CONSTRAINT "crm_lead_audiences_name_check" CHECK (((length(btrim(name)) >= 2) AND (length(btrim(name)) <= 120)));
ALTER TABLE "public"."crm_lead_audiences" ADD CONSTRAINT "crm_lead_audiences_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."crm_source_funnels" ADD CONSTRAINT "crm_source_funnels_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."crm_source_funnels" ADD CONSTRAINT "crm_source_funnels_workspace_id_crm_source_id_pipeline_id_key" UNIQUE (workspace_id, crm_source_id, pipeline_id);
ALTER TABLE "public"."crm_sources" ADD CONSTRAINT "crm_sources_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."crm_sources" ADD CONSTRAINT "crm_sources_workspace_id_provider_external_account_id_key" UNIQUE (workspace_id, provider, external_account_id);
ALTER TABLE "public"."crm_stage_automations" ADD CONSTRAINT "crm_stage_automations_action_check" CHECK ((jsonb_typeof(action) = 'object'::text));
ALTER TABLE "public"."crm_stage_automations" ADD CONSTRAINT "crm_stage_automations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."crm_stage_automations" ADD CONSTRAINT "crm_stage_automations_workspace_id_pipeline_id_stage_id_act_key" UNIQUE (workspace_id, pipeline_id, stage_id, action_id);
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_check" CHECK (((NOT enabled) OR (length(btrim(COALESCE(system_prompt, ''::text))) > 0)));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_cooldown_seconds_check" CHECK (((cooldown_seconds >= 0) AND (cooldown_seconds <= 3600)));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_creation_payload_check" CHECK ((jsonb_typeof(creation_payload) = 'object'::text));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_id_workspace_id_key" UNIQUE (id, workspace_id);
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_max_tokens_check" CHECK (((max_tokens >= 64) AND (max_tokens <= 8192)));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_metadata_check" CHECK (((jsonb_typeof(metadata) = 'object'::text) AND (NOT ((metadata #>> '{settings,mode}'::text[]) IS DISTINCT FROM 'prompt'::text))));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_model_check" CHECK (((length(model) >= 1) AND (length(model) <= 120)));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120)));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_persona_check" CHECK ((length(persona) <= 2000));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_system_prompt_check" CHECK ((length(system_prompt) <= 20000));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_temperature_check" CHECK (((temperature >= (0)::numeric) AND (temperature <= (2)::numeric)));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_triggers_check" CHECK ((jsonb_typeof(triggers) = 'array'::text));
ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_workspace_id_creation_request_id_key" UNIQUE (workspace_id, creation_request_id);
ALTER TABLE "public"."inbox_label_assignments" ADD CONSTRAINT "inbox_label_assignments_label_id_thread_ref_key" UNIQUE (label_id, thread_ref);
ALTER TABLE "public"."inbox_label_assignments" ADD CONSTRAINT "inbox_label_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."inbox_label_assignments" ADD CONSTRAINT "inbox_label_assignments_thread_ref_check" CHECK (((length(thread_ref) >= 1) AND (length(thread_ref) <= 200)));
ALTER TABLE "public"."inbox_labels" ADD CONSTRAINT "inbox_labels_color_check" CHECK (((length(color) >= 1) AND (length(color) <= 80)));
ALTER TABLE "public"."inbox_labels" ADD CONSTRAINT "inbox_labels_group_name_check" CHECK (((length(btrim(group_name)) >= 1) AND (length(btrim(group_name)) <= 80)));
ALTER TABLE "public"."inbox_labels" ADD CONSTRAINT "inbox_labels_id_workspace_id_key" UNIQUE (id, workspace_id);
ALTER TABLE "public"."inbox_labels" ADD CONSTRAINT "inbox_labels_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)));
ALTER TABLE "public"."inbox_labels" ADD CONSTRAINT "inbox_labels_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."inbox_labels" ADD CONSTRAINT "inbox_labels_workspace_id_group_name_name_key" UNIQUE (workspace_id, group_name, name);
ALTER TABLE "public"."integrations" ADD CONSTRAINT "integrations_id_workspace_id_key" UNIQUE (id, workspace_id);
ALTER TABLE "public"."integrations" ADD CONSTRAINT "integrations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrations" ADD CONSTRAINT "integrations_workspace_id_provider_key" UNIQUE (workspace_id, provider);
ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."lead_custom_field_values" ADD CONSTRAINT "lead_custom_field_values_lead_id_field_id_key" UNIQUE (lead_id, field_id);
ALTER TABLE "public"."lead_custom_field_values" ADD CONSTRAINT "lead_custom_field_values_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."lead_custom_fields" ADD CONSTRAINT "lead_custom_fields_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 160)));
ALTER TABLE "public"."lead_custom_fields" ADD CONSTRAINT "lead_custom_fields_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."lead_dedupe_dismissals" ADD CONSTRAINT "lead_dedupe_dismissals_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."lead_dedupe_dismissals" ADD CONSTRAINT "lead_dedupe_dismissals_signature_unique" UNIQUE (workspace_id, signature);
ALTER TABLE "public"."lead_products" ADD CONSTRAINT "lead_products_lead_id_product_id_kind_key" UNIQUE (lead_id, product_id, kind);
ALTER TABLE "public"."lead_products" ADD CONSTRAINT "lead_products_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."marcos_tutorial_lessons" ADD CONSTRAINT "marcos_tutorial_lessons_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."marcos_tutorial_lessons" ADD CONSTRAINT "marcos_tutorial_lessons_position_check" CHECK ((("position" >= 0) AND ("position" <= 1000000)));
ALTER TABLE "public"."marcos_tutorial_lessons" ADD CONSTRAINT "marcos_tutorial_lessons_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 160)));
ALTER TABLE "public"."marcos_tutorial_lessons" ADD CONSTRAINT "marcos_tutorial_lessons_video_id_check" CHECK ((video_id ~ '^[A-Za-z0-9_-]{11}$'::text));
ALTER TABLE "public"."marcos_tutorial_modules" ADD CONSTRAINT "marcos_tutorial_modules_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."marcos_tutorial_modules" ADD CONSTRAINT "marcos_tutorial_modules_position_check" CHECK ((("position" >= 0) AND ("position" <= 1000000)));
ALTER TABLE "public"."marcos_tutorial_modules" ADD CONSTRAINT "marcos_tutorial_modules_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 160)));
ALTER TABLE "public"."module_permissions" ADD CONSTRAINT "module_permissions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."module_permissions" ADD CONSTRAINT "module_permissions_workspace_id_user_id_key" UNIQUE (workspace_id, user_id);
ALTER TABLE "public"."permission_templates" ADD CONSTRAINT "permission_templates_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."permission_templates" ADD CONSTRAINT "permission_templates_workspace_id_name_key" UNIQUE (workspace_id, name);
ALTER TABLE "public"."pipeline_stages" ADD CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."pipelines" ADD CONSTRAINT "pipelines_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."product_catalogs" ADD CONSTRAINT "product_catalogs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."products" ADD CONSTRAINT "products_cost_price_check" CHECK (((cost_price IS NULL) OR (cost_price >= (0)::numeric)));
ALTER TABLE "public"."products" ADD CONSTRAINT "products_minimum_stock_check" CHECK (((minimum_stock IS NULL) OR (minimum_stock >= 0)));
ALTER TABLE "public"."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."salesbot_blocks" ADD CONSTRAINT "salesbot_blocks_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."salesbot_blocks" ADD CONSTRAINT "salesbot_blocks_salesbot_id_local_id_key" UNIQUE (salesbot_id, local_id);
ALTER TABLE "public"."salesbot_revisions" ADD CONSTRAINT "salesbot_revisions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."salesbot_round_robin_state" ADD CONSTRAINT "salesbot_round_robin_state_counter_check" CHECK ((counter >= 0));
ALTER TABLE "public"."salesbot_round_robin_state" ADD CONSTRAINT "salesbot_round_robin_state_pkey" PRIMARY KEY (block_id);

COMMIT;
SELECT '21-constraints.sql' AS migration_batch,'OK' AS result;


-- 22-constraints.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
ALTER TABLE "public"."salesbot_run_logs" ADD CONSTRAINT "salesbot_run_logs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."salesbot_runs" ADD CONSTRAINT "salesbot_runs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."salesbot_runs" ADD CONSTRAINT "salesbot_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'pending'::text, 'running'::text, 'waiting'::text, 'waiting_timer'::text, 'waiting_message'::text, 'paused'::text, 'finished'::text, 'error'::text, 'cancelled'::text])));
ALTER TABLE "public"."salesbot_runs" ADD CONSTRAINT "salesbot_runs_workspace_id_id_key" UNIQUE (workspace_id, id);
ALTER TABLE "public"."salesbot_runs" ADD CONSTRAINT "salesbot_runs_workspace_id_request_id_key" UNIQUE (workspace_id, request_id);
ALTER TABLE "public"."salesbots" ADD CONSTRAINT "salesbots_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."salesbots" ADD CONSTRAINT "salesbots_workspace_id_local_id_key" UNIQUE (workspace_id, local_id);
ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_delay_ms_check" CHECK (((delay_ms >= 500) AND (delay_ms <= 15000)));
ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_delay_seconds_check" CHECK (((delay_seconds >= 0) AND (delay_seconds <= 86400)));
ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_kind_check" CHECK ((kind = ANY (ARRAY['text'::text, 'agent'::text, 'salesbot'::text])));
ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_workspace_id_request_id_key" UNIQUE (workspace_id, request_id);
ALTER TABLE "public"."slim_audience_deliveries" ADD CONSTRAINT "slim_audience_deliveries_campaign_id_recipient_key_key" UNIQUE (campaign_id, recipient_key);
ALTER TABLE "public"."slim_audience_deliveries" ADD CONSTRAINT "slim_audience_deliveries_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."slim_audience_deliveries" ADD CONSTRAINT "slim_audience_deliveries_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'sent'::text, 'failed'::text, 'uncertain'::text, 'skipped'::text, 'cancelled'::text])));
ALTER TABLE "public"."slim_checkout_attempt_closures" ADD CONSTRAINT "slim_checkout_attempt_closures_pkey" PRIMARY KEY (workspace_id, request_id);
ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_check" CHECK (((replacement_order_id IS NULL) OR (replacement_order_id <> order_id)));
ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_check1" CHECK ((((state = 'closed'::text) AND (request_payload IS NULL) AND (source_fingerprint IS NULL) AND (source_snapshot IS NULL) AND (source_status IS NULL) AND (reason IS NULL) AND (replacement_order_id IS NULL)) OR ((state = 'completed'::text) AND (request_payload IS NOT NULL) AND (jsonb_typeof(request_payload) = 'object'::text) AND (source_fingerprint IS NOT NULL) AND (source_fingerprint ~ '^[0-9a-f]{64}$'::text) AND (source_snapshot IS NOT NULL) AND (jsonb_typeof(source_snapshot) = 'object'::text) AND (source_status IS NOT NULL) AND (source_status = ANY (ARRAY['confirmed'::text, 'cancelled'::text])) AND (reason IS NOT NULL) AND ((length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 500)) AND (((operation = 'edit'::text) AND (replacement_order_id IS NOT NULL)) OR ((operation = 'delete'::text) AND (replacement_order_id IS NULL))))));
ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_id_workspace_id_key" UNIQUE (id, workspace_id);
ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_operation_check" CHECK ((operation = ANY (ARRAY['edit'::text, 'delete'::text])));
ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_state_check" CHECK ((state = ANY (ARRAY['completed'::text, 'closed'::text])));
ALTER TABLE "public"."slim_order_document_deliveries" ADD CONSTRAINT "slim_order_document_deliveries_consent_sha256_check" CHECK (((consent_sha256 IS NULL) OR (consent_sha256 ~ '^[0-9a-f]{64}$'::text)));
ALTER TABLE "public"."slim_order_document_deliveries" ADD CONSTRAINT "slim_order_document_deliveries_phone_check" CHECK ((phone ~ '^[+][1-9][0-9]{7,14}$'::text));
ALTER TABLE "public"."slim_order_document_deliveries" ADD CONSTRAINT "slim_order_document_deliveries_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."slim_order_document_deliveries" ADD CONSTRAINT "slim_order_document_deliveries_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'uncertain'::text])));
ALTER TABLE "public"."slim_order_document_deliveries" ADD CONSTRAINT "slim_order_document_deliveries_workspace_id_request_id_key" UNIQUE (workspace_id, request_id);
ALTER TABLE "public"."slim_order_documents" ADD CONSTRAINT "slim_order_documents_order_id_key" UNIQUE (order_id);
ALTER TABLE "public"."slim_order_documents" ADD CONSTRAINT "slim_order_documents_pdf_base64_check" CHECK (((length(pdf_base64) >= 20) AND (length(pdf_base64) <= 4000000)));
ALTER TABLE "public"."slim_order_documents" ADD CONSTRAINT "slim_order_documents_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."slim_order_documents" ADD CONSTRAINT "slim_order_documents_sha256_check" CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE "public"."slim_order_documents" ADD CONSTRAINT "slim_order_documents_version_check" CHECK ((version = 1));
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_check" CHECK (((((subtotal_cents - discount_cents) + shipping_cents) = total_cents) AND (discount_cents <= subtotal_cents) AND (total_cents <= '99999999999999'::bigint)));
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_check1" CHECK ((((status = 'confirmed'::text) AND (cancelled_at IS NULL) AND (cancellation_reason IS NULL)) OR ((status = 'cancelled'::text) AND (cancelled_at IS NOT NULL) AND ((length(btrim(cancellation_reason)) >= 1) AND (length(btrim(cancellation_reason)) <= 500)))));
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_discount_cents_check" CHECK ((discount_cents >= 0));
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_id_workspace_id_key" UNIQUE (id, workspace_id);
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_order_number_key" UNIQUE (order_number);
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_shipping_cents_check" CHECK (((shipping_cents >= 0) AND (shipping_cents <= '99999999999999'::bigint)));
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_snapshot_check" CHECK ((jsonb_typeof(snapshot) = 'object'::text));
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_status_check" CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text])));
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_subtotal_cents_check" CHECK (((subtotal_cents >= 0) AND (subtotal_cents <= '99999999999999'::bigint)));
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_total_cents_check" CHECK ((total_cents >= 0));
ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_workspace_id_request_id_key" UNIQUE (workspace_id, request_id);
ALTER TABLE "public"."slim_stage_move_events" ADD CONSTRAINT "slim_stage_move_events_attempts_check" CHECK ((attempts >= 0));
ALTER TABLE "public"."slim_stage_move_events" ADD CONSTRAINT "slim_stage_move_events_event_kind_check" CHECK ((event_kind = ANY (ARRAY['moved'::text, 'created'::text])));
ALTER TABLE "public"."slim_stage_move_events" ADD CONSTRAINT "slim_stage_move_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."slim_stage_move_events" ADD CONSTRAINT "slim_stage_move_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'dispatching'::text, 'dispatched'::text, 'skipped'::text, 'error'::text])));
ALTER TABLE "public"."slim_stock_movements" ADD CONSTRAINT "slim_stock_movements_balance_after_check" CHECK ((balance_after >= 0));
ALTER TABLE "public"."slim_stock_movements" ADD CONSTRAINT "slim_stock_movements_kind_check" CHECK ((kind = ANY (ARRAY['sale'::text, 'reversal'::text])));
ALTER TABLE "public"."slim_stock_movements" ADD CONSTRAINT "slim_stock_movements_order_id_product_id_kind_key" UNIQUE (order_id, product_id, kind);
ALTER TABLE "public"."slim_stock_movements" ADD CONSTRAINT "slim_stock_movements_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."slim_stock_movements" ADD CONSTRAINT "slim_stock_movements_quantity_check" CHECK ((quantity > 0));
ALTER TABLE "public"."supplier_product_costs" ADD CONSTRAINT "supplier_product_costs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."supplier_product_costs" ADD CONSTRAINT "supplier_product_costs_workspace_id_supplier_id_product_id_key" UNIQUE (workspace_id, supplier_id, product_id);
ALTER TABLE "public"."support_robot_messages" ADD CONSTRAINT "support_robot_messages_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."support_robot_messages" ADD CONSTRAINT "support_robot_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'tool'::text])));
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."team_chat_reads" ADD CONSTRAINT "team_chat_reads_conversation_key_check" CHECK (((length(conversation_key) >= 1) AND (length(conversation_key) <= 80)));
ALTER TABLE "public"."team_chat_reads" ADD CONSTRAINT "team_chat_reads_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."team_chat_reads" ADD CONSTRAINT "team_chat_reads_user_id_workspace_id_conversation_key_key" UNIQUE (user_id, workspace_id, conversation_key);
ALTER TABLE "public"."team_messages" ADD CONSTRAINT "team_messages_body_check" CHECK (((length(body) >= 1) AND (length(body) <= 4000)));
ALTER TABLE "public"."team_messages" ADD CONSTRAINT "team_messages_origin_check" CHECK ((origin = ANY (ARRAY['user'::text, 'salesbot'::text])));
ALTER TABLE "public"."team_messages" ADD CONSTRAINT "team_messages_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."team_messages" ADD CONSTRAINT "team_messages_target_check" CHECK (((sector_id IS NOT NULL) <> (to_user_id IS NOT NULL)));
ALTER TABLE "public"."tracking_conversion_events" ADD CONSTRAINT "tracking_conversion_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."tracking_conversion_events" ADD CONSTRAINT "tracking_conversion_events_workspace_id_event_row_id_conver_key" UNIQUE (workspace_id, event_row_id, conversion_id);
ALTER TABLE "public"."tracking_events" ADD CONSTRAINT "tracking_events_event_name_check" CHECK (((length(event_name) >= 1) AND (length(event_name) <= 120)));
ALTER TABLE "public"."tracking_events" ADD CONSTRAINT "tracking_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."tracking_events" ADD CONSTRAINT "tracking_events_workspace_id_site_id_event_id_key" UNIQUE (workspace_id, site_id, event_id);
ALTER TABLE "public"."tracking_sites" ADD CONSTRAINT "tracking_sites_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 160)));
ALTER TABLE "public"."tracking_sites" ADD CONSTRAINT "tracking_sites_pixel_token_key" UNIQUE (pixel_token);
ALTER TABLE "public"."tracking_sites" ADD CONSTRAINT "tracking_sites_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."tracking_sites" ADD CONSTRAINT "tracking_sites_workspace_id_domain_key" UNIQUE (workspace_id, domain);
ALTER TABLE "public"."tutorial_lessons" ADD CONSTRAINT "tutorial_lessons_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."tutorial_lessons" ADD CONSTRAINT "tutorial_lessons_position_check" CHECK ((("position" >= 0) AND ("position" <= 1000000)));
ALTER TABLE "public"."tutorial_lessons" ADD CONSTRAINT "tutorial_lessons_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 160)));
ALTER TABLE "public"."tutorial_lessons" ADD CONSTRAINT "tutorial_lessons_video_id_check" CHECK ((video_id ~ '^[A-Za-z0-9_-]{11}$'::text));
ALTER TABLE "public"."tutorial_modules" ADD CONSTRAINT "tutorial_modules_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."tutorial_modules" ADD CONSTRAINT "tutorial_modules_position_check" CHECK ((("position" >= 0) AND ("position" <= 1000000)));
ALTER TABLE "public"."tutorial_modules" ADD CONSTRAINT "tutorial_modules_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 160)));
ALTER TABLE "public"."user_notification_settings" ADD CONSTRAINT "user_notification_settings_pkey" PRIMARY KEY (user_id);
ALTER TABLE "public"."user_permissions" ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."user_permissions" ADD CONSTRAINT "user_permissions_workspace_id_user_id_key" UNIQUE (workspace_id, user_id);
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE (user_id, role);
ALTER TABLE "public"."user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."user_sessions" ADD CONSTRAINT "user_sessions_workspace_id_user_id_device_key_key" UNIQUE (workspace_id, user_id, device_key);
ALTER TABLE "public"."whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_group_jid_check" CHECK ((group_jid ~ '^[0-9-]+@g[.]us$'::text));
ALTER TABLE "public"."whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_id_workspace_id_key" UNIQUE (id, workspace_id);
ALTER TABLE "public"."whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_participants_count_check" CHECK ((participants_count >= 0));
ALTER TABLE "public"."whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_session_id_group_jid_key" UNIQUE (session_id, group_jid);
ALTER TABLE "public"."whatsapp_web_messages" ADD CONSTRAINT "whatsapp_messages_workspace_message_unique" UNIQUE (workspace_id, message_id);
ALTER TABLE "public"."whatsapp_web_messages" ADD CONSTRAINT "whatsapp_web_messages_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."whatsapp_web_sessions" ADD CONSTRAINT "whatsapp_sessions_evolution_only" CHECK ((provider = 'evolution'::text));
ALTER TABLE "public"."whatsapp_web_sessions" ADD CONSTRAINT "whatsapp_web_sessions_instance_id_key" UNIQUE (instance_id);
ALTER TABLE "public"."whatsapp_web_sessions" ADD CONSTRAINT "whatsapp_web_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."whatsapp_web_sessions" ADD CONSTRAINT "whatsapp_web_sessions_webhook_secret_key" UNIQUE (webhook_secret);
ALTER TABLE "public"."workflow_sector_members" ADD CONSTRAINT "workflow_sector_members_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workflow_sector_members" ADD CONSTRAINT "workflow_sector_members_sector_id_user_id_key" UNIQUE (sector_id, user_id);
ALTER TABLE "public"."workflow_sectors" ADD CONSTRAINT "workflow_sectors_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workflow_sectors" ADD CONSTRAINT "workflow_sectors_workspace_id_name_key" UNIQUE (workspace_id, name);
ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_token_key" UNIQUE (token);
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_user_id_key" UNIQUE (workspace_id, user_id);
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_slug_key" UNIQUE (slug);
ALTER TABLE "private"."bcpll_platform_support" ADD CONSTRAINT "bcpll_platform_support_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "private"."bcpll_support_context" ADD CONSTRAINT "bcpll_support_context_user_id_fkey" FOREIGN KEY (user_id) REFERENCES private.bcpll_platform_support(user_id) ON DELETE CASCADE;
ALTER TABLE "private"."bcpll_support_context" ADD CONSTRAINT "bcpll_support_context_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES bcpll_workspaces(workspace_id) ON DELETE CASCADE;
ALTER TABLE "private"."integration_credentials" ADD CONSTRAINT "integration_credentials_integration_id_workspace_id_fkey" FOREIGN KEY (integration_id, workspace_id) REFERENCES integrations(id, workspace_id) ON DELETE CASCADE;
ALTER TABLE "private"."slim_copilot_proposal_audit" ADD CONSTRAINT "slim_copilot_proposal_audit_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE "private"."slim_copilot_proposal_audit" ADD CONSTRAINT "slim_copilot_proposal_audit_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES private.slim_copilot_proposals(id);
ALTER TABLE "private"."slim_copilot_proposal_audit" ADD CONSTRAINT "slim_copilot_proposal_audit_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id);
ALTER TABLE "private"."slim_copilot_proposals" ADD CONSTRAINT "slim_copilot_proposals_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE "private"."slim_funnel_write_requests" ADD CONSTRAINT "slim_funnel_write_requests_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE "private"."slim_funnel_write_requests" ADD CONSTRAINT "slim_funnel_write_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE "private"."slim_invitation_requests" ADD CONSTRAINT "slim_invitation_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_agent_conversations" ADD CONSTRAINT "ai_agent_conversations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_agent_conversations" ADD CONSTRAINT "ai_agent_conversations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_agent_settings" ADD CONSTRAINT "ai_agent_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."ai_agent_settings" ADD CONSTRAINT "ai_agent_settings_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_brain_blocked_terms" ADD CONSTRAINT "ai_brain_blocked_terms_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_brain_chunks" ADD CONSTRAINT "ai_brain_chunks_source_id_fkey" FOREIGN KEY (source_id) REFERENCES ai_brain_sources(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_brain_chunks" ADD CONSTRAINT "ai_brain_chunks_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_brain_sources" ADD CONSTRAINT "ai_brain_sources_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."bcpll_email_campaigns" ADD CONSTRAINT "bcpll_email_campaigns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE "public"."bcpll_email_campaigns" ADD CONSTRAINT "bcpll_email_campaigns_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES bcpll_workspaces(workspace_id) ON DELETE CASCADE;
ALTER TABLE "public"."bcpll_email_outbox" ADD CONSTRAINT "bcpll_email_outbox_campaign_id_workspace_id_fkey" FOREIGN KEY (campaign_id, workspace_id) REFERENCES bcpll_email_campaigns(id, workspace_id) ON DELETE CASCADE;

COMMIT;
SELECT '22-constraints.sql' AS migration_batch,'OK' AS result;


-- 25-indexes.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE INDEX user_roles_user_idx ON public.user_roles USING btree (user_id);
CREATE INDEX workspace_members_user_idx ON public.workspace_members USING btree (user_id);
CREATE INDEX workspace_members_workspace_idx ON public.workspace_members USING btree (workspace_id);
CREATE INDEX crm_sources_workspace_idx ON public.crm_sources USING btree (workspace_id);
CREATE INDEX pipelines_workspace_idx ON public.pipelines USING btree (workspace_id);
CREATE INDEX pipeline_stages_pipeline_idx ON public.pipeline_stages USING btree (pipeline_id, "position");
CREATE INDEX crm_source_funnels_workspace_idx ON public.crm_source_funnels USING btree (workspace_id);
CREATE INDEX companies_workspace_idx ON public.companies USING btree (workspace_id);
CREATE INDEX leads_workspace_idx ON public.leads USING btree (workspace_id);
CREATE INDEX leads_pipeline_idx ON public.leads USING btree (pipeline_id);
CREATE INDEX leads_stage_idx ON public.leads USING btree (stage_id);
CREATE UNIQUE INDEX leads_external_uniq ON public.leads USING btree (crm_source_id, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX lead_activities_lead_idx ON public.lead_activities USING btree (lead_id);
CREATE INDEX product_catalogs_workspace_idx ON public.product_catalogs USING btree (workspace_id);
CREATE INDEX products_workspace_idx ON public.products USING btree (workspace_id);
CREATE INDEX products_catalog_idx ON public.products USING btree (catalog_id);
CREATE INDEX lead_products_workspace_kind_sold_at_idx ON public.lead_products USING btree (workspace_id, kind, sold_at DESC);
CREATE INDEX supplier_product_costs_ws_supplier_idx ON public.supplier_product_costs USING btree (workspace_id, supplier_id);
CREATE INDEX supplier_product_costs_ws_product_idx ON public.supplier_product_costs USING btree (workspace_id, product_id);
CREATE INDEX workspaces_owner_idx ON public.workspaces USING btree (owner_id);
CREATE INDEX profiles_current_workspace_idx ON public.profiles USING btree (current_workspace_id);
CREATE INDEX pipelines_crm_source_idx ON public.pipelines USING btree (crm_source_id);
CREATE INDEX pipeline_stages_workspace_idx ON public.pipeline_stages USING btree (workspace_id);
CREATE INDEX crm_source_funnels_source_idx ON public.crm_source_funnels USING btree (crm_source_id);
CREATE INDEX crm_source_funnels_pipeline_idx ON public.crm_source_funnels USING btree (pipeline_id);
CREATE INDEX companies_crm_source_idx ON public.companies USING btree (crm_source_id);
CREATE INDEX companies_primary_lead_idx ON public.companies USING btree (primary_lead_id);
CREATE INDEX companies_responsible_idx ON public.companies USING btree (responsible_id);
CREATE INDEX leads_company_idx ON public.leads USING btree (company_id);
CREATE INDEX leads_responsible_idx ON public.leads USING btree (responsible_id);
CREATE INDEX leads_merged_into_idx ON public.leads USING btree (merged_into_id);
CREATE INDEX lead_activities_workspace_idx ON public.lead_activities USING btree (workspace_id);
CREATE INDEX lead_products_product_idx ON public.lead_products USING btree (product_id);
CREATE INDEX supplier_product_costs_supplier_idx ON public.supplier_product_costs USING btree (supplier_id);
CREATE INDEX supplier_product_costs_product_idx ON public.supplier_product_costs USING btree (product_id);
CREATE INDEX whatsapp_sessions_workspace_status_idx ON public.whatsapp_web_sessions USING btree (workspace_id, status);
CREATE INDEX whatsapp_messages_workspace_session_received_idx ON public.whatsapp_web_messages USING btree (workspace_id, session_id, received_at DESC);
CREATE INDEX whatsapp_web_messages_session_id_idx ON public.whatsapp_web_messages USING btree (session_id);
CREATE INDEX workspace_invitations_by_workspace ON public.workspace_invitations USING btree (workspace_id, created_at DESC);
CREATE INDEX user_sessions_workspace_seen ON public.user_sessions USING btree (workspace_id, last_seen_at DESC);
CREATE INDEX crm_forms_workspace_recent_idx ON public.crm_forms USING btree (workspace_id, updated_at DESC);
CREATE UNIQUE INDEX crm_forms_unique_slug_idx ON public.crm_forms USING btree (slug);
CREATE UNIQUE INDEX crm_forms_unique_ingest_token_idx ON public.crm_forms USING btree (ingest_token) WHERE (ingest_token IS NOT NULL);
CREATE INDEX ai_brain_sources_workspace_idx ON public.ai_brain_sources USING btree (workspace_id);
CREATE INDEX ai_brain_chunks_workspace_idx ON public.ai_brain_chunks USING btree (workspace_id);
CREATE INDEX salesbot_blocks_salesbot_id_idx ON public.salesbot_blocks USING btree (salesbot_id);
CREATE INDEX salesbot_revisions_salesbot_id_revision_idx ON public.salesbot_revisions USING btree (salesbot_id, revision DESC);
CREATE UNIQUE INDEX slim_one_live_salesbot_per_lead ON public.salesbot_runs USING btree (workspace_id, lead_id, salesbot_id) WHERE (status = ANY (ARRAY['queued'::text, 'pending'::text, 'running'::text, 'waiting'::text, 'waiting_timer'::text, 'waiting_message'::text, 'paused'::text]));
CREATE INDEX slim_salesbot_run_inbox ON public.salesbot_runs USING btree (workspace_id, lead_id, status);
CREATE INDEX slim_salesbot_run_timer ON public.salesbot_runs USING btree (waiting_until) WHERE (status = ANY (ARRAY['waiting_timer'::text, 'waiting_message'::text]));
CREATE INDEX slim_salesbot_logs_run ON public.salesbot_run_logs USING btree (salesbot_run_id, created_at);
CREATE INDEX support_robot_messages_workspace_user_created_idx ON public.support_robot_messages USING btree (workspace_id, user_id, created_at DESC, id);
CREATE INDEX slim_audiences_workspace_updated ON public.crm_lead_audiences USING btree (workspace_id, updated_at DESC);
CREATE INDEX slim_fields_workspace ON public.lead_custom_fields USING btree (workspace_id);
CREATE INDEX slim_values_workspace_lead ON public.lead_custom_field_values USING btree (workspace_id, lead_id);
CREATE INDEX slim_tasks_workspace_lead ON public.tasks USING btree (workspace_id, lead_id, status);
CREATE INDEX slim_stage_actions_pipeline ON public.crm_stage_automations USING btree (workspace_id, pipeline_id, "position");
CREATE INDEX slim_jobs_due ON public.crm_automation_jobs USING btree (status, due_at) WHERE (status = 'pending'::text);
CREATE INDEX slim_jobs_lead ON public.crm_automation_jobs USING btree (workspace_id, lead_id, created_at DESC);
CREATE INDEX slim_campaign_due ON public.slim_audience_campaigns USING btree (status, next_due_at);
CREATE INDEX slim_delivery_state ON public.slim_audience_deliveries USING btree (campaign_id, status);
CREATE INDEX slim_form_submissions_workspace_date ON public.crm_form_submissions USING btree (workspace_id, created_at DESC);
CREATE INDEX slim_form_submissions_form ON public.crm_form_submissions USING btree (form_id, created_at DESC);
CREATE INDEX slim_tracking_events_workspace_date ON public.tracking_events USING btree (workspace_id, created_at DESC);
CREATE INDEX slim_tracking_events_site_date ON public.tracking_events USING btree (site_id, created_at DESC);
CREATE INDEX slim_tracking_conversions_workspace_date ON public.tracking_conversion_events USING btree (workspace_id, created_at DESC);
CREATE INDEX slim_orders_company_date ON public.slim_orders USING btree (workspace_id, confirmed_at DESC, id);
CREATE INDEX slim_stock_company_product ON public.slim_stock_movements USING btree (workspace_id, product_id, created_at DESC);
CREATE INDEX slim_document_delivery_company ON public.slim_order_document_deliveries USING btree (workspace_id, created_at DESC);
CREATE UNIQUE INDEX slim_document_one_unresolved_delivery ON public.slim_order_document_deliveries USING btree (document_id) WHERE (status = ANY (ARRAY['pending'::text, 'uncertain'::text]));
CREATE UNIQUE INDEX slim_one_order_per_legacy_sale ON public.slim_orders USING btree (workspace_id, legacy_lead_id) WHERE (legacy_lead_id IS NOT NULL);
CREATE INDEX slim_inbox_groups_workspace ON public.whatsapp_groups USING btree (workspace_id, updated_at DESC);
CREATE INDEX slim_inbox_assignments_workspace_thread ON public.inbox_label_assignments USING btree (workspace_id, thread_ref);
CREATE INDEX slim_group_agents_workspace_updated ON public.group_ai_agents USING btree (workspace_id, updated_at DESC);
CREATE INDEX slim_stage_move_pending ON public.slim_stage_move_events USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'dispatching'::text]));
CREATE INDEX slim_group_inbox_message_recent ON public.whatsapp_web_messages USING btree (workspace_id, session_id, remote_jid, received_at DESC, id DESC) WHERE (remote_jid ~~ '%@g.us'::text);
CREATE INDEX slim_copilot_proposals_actor_created ON private.slim_copilot_proposals USING btree (workspace_id, actor_id, created_at DESC, id);
CREATE INDEX slim_copilot_audit_proposal ON private.slim_copilot_proposal_audit USING btree (proposal_id, created_at, id);
CREATE UNIQUE INDEX slim_order_one_completed_change ON public.slim_order_changes USING btree (workspace_id, order_id) WHERE (state = 'completed'::text);
CREATE INDEX slim_order_changes_workspace ON public.slim_order_changes USING btree (workspace_id, created_at DESC);
CREATE INDEX tutorial_lessons_module_position_idx ON public.tutorial_lessons USING btree (module_id, "position", id);
CREATE UNIQUE INDEX leads_wa_workspace_phone_active_unique ON public.leads USING btree (workspace_id, phone_normalized, COALESCE((custom_data ->> 'whatsapp_session_id'::text), ''::text)) WHERE ((source = 'whatsapp'::text) AND (merged_into_id IS NULL) AND (phone_normalized IS NOT NULL));
CREATE INDEX team_messages_sector_idx ON public.team_messages USING btree (workspace_id, sector_id, created_at DESC);
CREATE INDEX team_messages_dm_idx ON public.team_messages USING btree (workspace_id, to_user_id, from_user_id, created_at DESC);
CREATE INDEX bcpll_email_pending ON public.bcpll_email_outbox USING btree (workspace_id, status, created_at);
CREATE UNIQUE INDEX bcpll_single_tutorial_editor ON private.bcpll_platform_support USING btree (can_edit_tutorials) WHERE can_edit_tutorials;
CREATE INDEX bcpll_tutorial_lessons_module_order ON public.bcpll_tutorial_lessons USING btree (module_id, "position", id);
CREATE INDEX marcos_tutorial_lesson_order ON public.marcos_tutorial_lessons USING btree (module_id, "position", id);

COMMIT;
SELECT '25-indexes.sql' AS migration_batch,'OK' AS result;


-- 25b-reference-indexes.sql
BEGIN; CREATE UNIQUE INDEX IF NOT EXISTS slim_leads_workspace_id_id ON public.leads(workspace_id,id); CREATE UNIQUE INDEX IF NOT EXISTS slim_salesbots_workspace_id_id ON public.salesbots(workspace_id,id); COMMIT; SELECT '25b-reference-indexes.sql' AS migration_batch,'OK' AS result;


-- 23-constraints.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_email_outbox"'::regclass AND conname='bcpll_email_outbox_lead_id_fkey') THEN ALTER TABLE "public"."bcpll_email_outbox" ADD CONSTRAINT "bcpll_email_outbox_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_email_outbox"'::regclass AND conname='bcpll_email_outbox_workspace_id_fkey') THEN ALTER TABLE "public"."bcpll_email_outbox" ADD CONSTRAINT "bcpll_email_outbox_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES bcpll_workspaces(workspace_id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_email_stage_rules"'::regclass AND conname='bcpll_email_stage_rules_stage_id_fkey') THEN ALTER TABLE "public"."bcpll_email_stage_rules" ADD CONSTRAINT "bcpll_email_stage_rules_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_email_stage_rules"'::regclass AND conname='bcpll_email_stage_rules_template_id_workspace_id_fkey') THEN ALTER TABLE "public"."bcpll_email_stage_rules" ADD CONSTRAINT "bcpll_email_stage_rules_template_id_workspace_id_fkey" FOREIGN KEY (template_id, workspace_id) REFERENCES bcpll_email_templates(id, workspace_id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_email_stage_rules"'::regclass AND conname='bcpll_email_stage_rules_workspace_id_fkey') THEN ALTER TABLE "public"."bcpll_email_stage_rules" ADD CONSTRAINT "bcpll_email_stage_rules_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES bcpll_workspaces(workspace_id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_email_templates"'::regclass AND conname='bcpll_email_templates_workspace_id_fkey') THEN ALTER TABLE "public"."bcpll_email_templates" ADD CONSTRAINT "bcpll_email_templates_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES bcpll_workspaces(workspace_id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_tutorial_lessons"'::regclass AND conname='bcpll_tutorial_lessons_module_id_fkey') THEN ALTER TABLE "public"."bcpll_tutorial_lessons" ADD CONSTRAINT "bcpll_tutorial_lessons_module_id_fkey" FOREIGN KEY (module_id) REFERENCES bcpll_tutorial_modules(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_utm_links"'::regclass AND conname='bcpll_utm_links_workspace_id_fkey') THEN ALTER TABLE "public"."bcpll_utm_links" ADD CONSTRAINT "bcpll_utm_links_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES bcpll_workspaces(workspace_id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_workspaces"'::regclass AND conname='bcpll_workspaces_owner_id_fkey') THEN ALTER TABLE "public"."bcpll_workspaces" ADD CONSTRAINT "bcpll_workspaces_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."bcpll_workspaces"'::regclass AND conname='bcpll_workspaces_workspace_id_fkey') THEN ALTER TABLE "public"."bcpll_workspaces" ADD CONSTRAINT "bcpll_workspaces_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."companies"'::regclass AND conname='companies_crm_source_id_fkey') THEN ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_crm_source_id_fkey" FOREIGN KEY (crm_source_id) REFERENCES crm_sources(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."companies"'::regclass AND conname='companies_primary_lead_fk') THEN ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_primary_lead_fk" FOREIGN KEY (primary_lead_id) REFERENCES leads(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."companies"'::regclass AND conname='companies_responsible_id_fkey') THEN ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_responsible_id_fkey" FOREIGN KEY (responsible_id) REFERENCES profiles(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."companies"'::regclass AND conname='companies_workspace_id_fkey') THEN ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."conversation_agent_runs"'::regclass AND conname='conversation_agent_runs_workspace_id_agent_id_fkey') THEN ALTER TABLE "public"."conversation_agent_runs" ADD CONSTRAINT "conversation_agent_runs_workspace_id_agent_id_fkey" FOREIGN KEY (workspace_id, agent_id) REFERENCES conversation_ai_agents(workspace_id, id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."conversation_agent_runs"'::regclass AND conname='conversation_agent_runs_workspace_id_fkey') THEN ALTER TABLE "public"."conversation_agent_runs" ADD CONSTRAINT "conversation_agent_runs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."conversation_agent_runs"'::regclass AND conname='conversation_agent_runs_workspace_id_lead_id_fkey') THEN ALTER TABLE "public"."conversation_agent_runs" ADD CONSTRAINT "conversation_agent_runs_workspace_id_lead_id_fkey" FOREIGN KEY (workspace_id, lead_id) REFERENCES leads(workspace_id, id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."conversation_ai_agents"'::regclass AND conname='conversation_ai_agents_workspace_id_fkey') THEN ALTER TABLE "public"."conversation_ai_agents" ADD CONSTRAINT "conversation_ai_agents_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_automation_jobs"'::regclass AND conname='crm_automation_jobs_lead_id_fkey') THEN ALTER TABLE "public"."crm_automation_jobs" ADD CONSTRAINT "crm_automation_jobs_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_automation_jobs"'::regclass AND conname='crm_automation_jobs_pipeline_id_fkey') THEN ALTER TABLE "public"."crm_automation_jobs" ADD CONSTRAINT "crm_automation_jobs_pipeline_id_fkey" FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_automation_jobs"'::regclass AND conname='crm_automation_jobs_stage_id_fkey') THEN ALTER TABLE "public"."crm_automation_jobs" ADD CONSTRAINT "crm_automation_jobs_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_automation_jobs"'::regclass AND conname='crm_automation_jobs_workspace_id_fkey') THEN ALTER TABLE "public"."crm_automation_jobs" ADD CONSTRAINT "crm_automation_jobs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_form_submissions"'::regclass AND conname='crm_form_submissions_form_id_fkey') THEN ALTER TABLE "public"."crm_form_submissions" ADD CONSTRAINT "crm_form_submissions_form_id_fkey" FOREIGN KEY (form_id) REFERENCES crm_forms(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_form_submissions"'::regclass AND conname='crm_form_submissions_lead_id_fkey') THEN ALTER TABLE "public"."crm_form_submissions" ADD CONSTRAINT "crm_form_submissions_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_form_submissions"'::regclass AND conname='crm_form_submissions_workspace_id_fkey') THEN ALTER TABLE "public"."crm_form_submissions" ADD CONSTRAINT "crm_form_submissions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_forms"'::regclass AND conname='crm_forms_workspace_id_fkey') THEN ALTER TABLE "public"."crm_forms" ADD CONSTRAINT "crm_forms_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_lead_audiences"'::regclass AND conname='crm_lead_audiences_created_by_fkey') THEN ALTER TABLE "public"."crm_lead_audiences" ADD CONSTRAINT "crm_lead_audiences_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_lead_audiences"'::regclass AND conname='crm_lead_audiences_workspace_id_fkey') THEN ALTER TABLE "public"."crm_lead_audiences" ADD CONSTRAINT "crm_lead_audiences_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_source_funnels"'::regclass AND conname='crm_source_funnels_crm_source_id_fkey') THEN ALTER TABLE "public"."crm_source_funnels" ADD CONSTRAINT "crm_source_funnels_crm_source_id_fkey" FOREIGN KEY (crm_source_id) REFERENCES crm_sources(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_source_funnels"'::regclass AND conname='crm_source_funnels_pipeline_id_fkey') THEN ALTER TABLE "public"."crm_source_funnels" ADD CONSTRAINT "crm_source_funnels_pipeline_id_fkey" FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_source_funnels"'::regclass AND conname='crm_source_funnels_workspace_id_fkey') THEN ALTER TABLE "public"."crm_source_funnels" ADD CONSTRAINT "crm_source_funnels_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_sources"'::regclass AND conname='crm_sources_workspace_id_fkey') THEN ALTER TABLE "public"."crm_sources" ADD CONSTRAINT "crm_sources_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_stage_automations"'::regclass AND conname='crm_stage_automations_pipeline_id_fkey') THEN ALTER TABLE "public"."crm_stage_automations" ADD CONSTRAINT "crm_stage_automations_pipeline_id_fkey" FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_stage_automations"'::regclass AND conname='crm_stage_automations_stage_id_fkey') THEN ALTER TABLE "public"."crm_stage_automations" ADD CONSTRAINT "crm_stage_automations_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."crm_stage_automations"'::regclass AND conname='crm_stage_automations_workspace_id_fkey') THEN ALTER TABLE "public"."crm_stage_automations" ADD CONSTRAINT "crm_stage_automations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."group_ai_agents"'::regclass AND conname='group_ai_agents_created_by_fkey') THEN ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."group_ai_agents"'::regclass AND conname='group_ai_agents_workspace_id_fkey') THEN ALTER TABLE "public"."group_ai_agents" ADD CONSTRAINT "group_ai_agents_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."inbox_label_assignments"'::regclass AND conname='inbox_label_assignments_label_id_workspace_id_fkey') THEN ALTER TABLE "public"."inbox_label_assignments" ADD CONSTRAINT "inbox_label_assignments_label_id_workspace_id_fkey" FOREIGN KEY (label_id, workspace_id) REFERENCES inbox_labels(id, workspace_id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."inbox_label_assignments"'::regclass AND conname='inbox_label_assignments_workspace_id_fkey') THEN ALTER TABLE "public"."inbox_label_assignments" ADD CONSTRAINT "inbox_label_assignments_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."inbox_labels"'::regclass AND conname='inbox_labels_workspace_id_fkey') THEN ALTER TABLE "public"."inbox_labels" ADD CONSTRAINT "inbox_labels_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."integrations"'::regclass AND conname='integrations_workspace_id_fkey') THEN ALTER TABLE "public"."integrations" ADD CONSTRAINT "integrations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_activities"'::regclass AND conname='lead_activities_lead_id_fkey') THEN ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_activities"'::regclass AND conname='lead_activities_workspace_id_fkey') THEN ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_custom_field_values"'::regclass AND conname='lead_custom_field_values_field_id_fkey') THEN ALTER TABLE "public"."lead_custom_field_values" ADD CONSTRAINT "lead_custom_field_values_field_id_fkey" FOREIGN KEY (field_id) REFERENCES lead_custom_fields(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_custom_field_values"'::regclass AND conname='lead_custom_field_values_lead_id_fkey') THEN ALTER TABLE "public"."lead_custom_field_values" ADD CONSTRAINT "lead_custom_field_values_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_custom_field_values"'::regclass AND conname='lead_custom_field_values_workspace_id_fkey') THEN ALTER TABLE "public"."lead_custom_field_values" ADD CONSTRAINT "lead_custom_field_values_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_custom_fields"'::regclass AND conname='lead_custom_fields_workspace_id_fkey') THEN ALTER TABLE "public"."lead_custom_fields" ADD CONSTRAINT "lead_custom_fields_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_dedupe_dismissals"'::regclass AND conname='lead_dedupe_dismissals_dismissed_by_fkey') THEN ALTER TABLE "public"."lead_dedupe_dismissals" ADD CONSTRAINT "lead_dedupe_dismissals_dismissed_by_fkey" FOREIGN KEY (dismissed_by) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_dedupe_dismissals"'::regclass AND conname='lead_dedupe_dismissals_workspace_id_fkey') THEN ALTER TABLE "public"."lead_dedupe_dismissals" ADD CONSTRAINT "lead_dedupe_dismissals_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_products"'::regclass AND conname='lead_products_lead_id_fkey') THEN ALTER TABLE "public"."lead_products" ADD CONSTRAINT "lead_products_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_products"'::regclass AND conname='lead_products_product_id_fkey') THEN ALTER TABLE "public"."lead_products" ADD CONSTRAINT "lead_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."lead_products"'::regclass AND conname='lead_products_workspace_id_fkey') THEN ALTER TABLE "public"."lead_products" ADD CONSTRAINT "lead_products_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."leads"'::regclass AND conname='leads_active_conversation_agent_id_fkey') THEN ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_active_conversation_agent_id_fkey" FOREIGN KEY (active_conversation_agent_id) REFERENCES conversation_ai_agents(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."leads"'::regclass AND conname='leads_company_id_fkey') THEN ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."leads"'::regclass AND conname='leads_crm_source_id_fkey') THEN ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_crm_source_id_fkey" FOREIGN KEY (crm_source_id) REFERENCES crm_sources(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."leads"'::regclass AND conname='leads_merged_into_id_fkey') THEN ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_merged_into_id_fkey" FOREIGN KEY (merged_into_id) REFERENCES leads(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."leads"'::regclass AND conname='leads_pipeline_id_fkey') THEN ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_pipeline_id_fkey" FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."leads"'::regclass AND conname='leads_responsible_id_fkey') THEN ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_responsible_id_fkey" FOREIGN KEY (responsible_id) REFERENCES profiles(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."leads"'::regclass AND conname='leads_stage_id_fkey') THEN ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."leads"'::regclass AND conname='leads_workspace_id_fkey') THEN ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."marcos_tutorial_lessons"'::regclass AND conname='marcos_tutorial_lessons_module_id_fkey') THEN ALTER TABLE "public"."marcos_tutorial_lessons" ADD CONSTRAINT "marcos_tutorial_lessons_module_id_fkey" FOREIGN KEY (module_id) REFERENCES marcos_tutorial_modules(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."module_permissions"'::regclass AND conname='module_permissions_user_id_fkey') THEN ALTER TABLE "public"."module_permissions" ADD CONSTRAINT "module_permissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."module_permissions"'::regclass AND conname='module_permissions_workspace_id_fkey') THEN ALTER TABLE "public"."module_permissions" ADD CONSTRAINT "module_permissions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."permission_templates"'::regclass AND conname='permission_templates_created_by_fkey') THEN ALTER TABLE "public"."permission_templates" ADD CONSTRAINT "permission_templates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."permission_templates"'::regclass AND conname='permission_templates_sector_id_fkey') THEN ALTER TABLE "public"."permission_templates" ADD CONSTRAINT "permission_templates_sector_id_fkey" FOREIGN KEY (sector_id) REFERENCES workflow_sectors(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."permission_templates"'::regclass AND conname='permission_templates_workspace_id_fkey') THEN ALTER TABLE "public"."permission_templates" ADD CONSTRAINT "permission_templates_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."pipeline_stages"'::regclass AND conname='pipeline_stages_pipeline_id_fkey') THEN ALTER TABLE "public"."pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."pipeline_stages"'::regclass AND conname='pipeline_stages_workspace_id_fkey') THEN ALTER TABLE "public"."pipeline_stages" ADD CONSTRAINT "pipeline_stages_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."pipelines"'::regclass AND conname='pipelines_crm_source_id_fkey') THEN ALTER TABLE "public"."pipelines" ADD CONSTRAINT "pipelines_crm_source_id_fkey" FOREIGN KEY (crm_source_id) REFERENCES crm_sources(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."pipelines"'::regclass AND conname='pipelines_workspace_id_fkey') THEN ALTER TABLE "public"."pipelines" ADD CONSTRAINT "pipelines_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."product_catalogs"'::regclass AND conname='product_catalogs_workspace_id_fkey') THEN ALTER TABLE "public"."product_catalogs" ADD CONSTRAINT "product_catalogs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."products"'::regclass AND conname='products_catalog_id_fkey') THEN ALTER TABLE "public"."products" ADD CONSTRAINT "products_catalog_id_fkey" FOREIGN KEY (catalog_id) REFERENCES product_catalogs(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."products"'::regclass AND conname='products_workspace_id_fkey') THEN ALTER TABLE "public"."products" ADD CONSTRAINT "products_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."profiles"'::regclass AND conname='profiles_current_workspace_id_fkey') THEN ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_current_workspace_id_fkey" FOREIGN KEY (current_workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."profiles"'::regclass AND conname='profiles_id_fkey') THEN ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_blocks"'::regclass AND conname='salesbot_blocks_salesbot_id_fkey') THEN ALTER TABLE "public"."salesbot_blocks" ADD CONSTRAINT "salesbot_blocks_salesbot_id_fkey" FOREIGN KEY (salesbot_id) REFERENCES salesbots(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_blocks"'::regclass AND conname='salesbot_blocks_workspace_id_fkey') THEN ALTER TABLE "public"."salesbot_blocks" ADD CONSTRAINT "salesbot_blocks_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_revisions"'::regclass AND conname='salesbot_revisions_salesbot_id_fkey') THEN ALTER TABLE "public"."salesbot_revisions" ADD CONSTRAINT "salesbot_revisions_salesbot_id_fkey" FOREIGN KEY (salesbot_id) REFERENCES salesbots(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_revisions"'::regclass AND conname='salesbot_revisions_workspace_id_fkey') THEN ALTER TABLE "public"."salesbot_revisions" ADD CONSTRAINT "salesbot_revisions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_round_robin_state"'::regclass AND conname='salesbot_round_robin_state_block_id_fkey') THEN ALTER TABLE "public"."salesbot_round_robin_state" ADD CONSTRAINT "salesbot_round_robin_state_block_id_fkey" FOREIGN KEY (block_id) REFERENCES salesbot_blocks(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_run_logs"'::regclass AND conname='salesbot_run_logs_workspace_id_fkey') THEN ALTER TABLE "public"."salesbot_run_logs" ADD CONSTRAINT "salesbot_run_logs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_run_logs"'::regclass AND conname='salesbot_run_logs_workspace_id_salesbot_run_id_fkey') THEN ALTER TABLE "public"."salesbot_run_logs" ADD CONSTRAINT "salesbot_run_logs_workspace_id_salesbot_run_id_fkey" FOREIGN KEY (workspace_id, salesbot_run_id) REFERENCES salesbot_runs(workspace_id, id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_runs"'::regclass AND conname='salesbot_runs_workspace_id_fkey') THEN ALTER TABLE "public"."salesbot_runs" ADD CONSTRAINT "salesbot_runs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_runs"'::regclass AND conname='salesbot_runs_workspace_id_lead_id_fkey') THEN ALTER TABLE "public"."salesbot_runs" ADD CONSTRAINT "salesbot_runs_workspace_id_lead_id_fkey" FOREIGN KEY (workspace_id, lead_id) REFERENCES leads(workspace_id, id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbot_runs"'::regclass AND conname='salesbot_runs_workspace_id_salesbot_id_fkey') THEN ALTER TABLE "public"."salesbot_runs" ADD CONSTRAINT "salesbot_runs_workspace_id_salesbot_id_fkey" FOREIGN KEY (workspace_id, salesbot_id) REFERENCES salesbots(workspace_id, id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."salesbots"'::regclass AND conname='salesbots_workspace_id_fkey') THEN ALTER TABLE "public"."salesbots" ADD CONSTRAINT "salesbots_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_campaigns"'::regclass AND conname='slim_audience_campaigns_agent_id_fkey') THEN ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES conversation_ai_agents(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_campaigns"'::regclass AND conname='slim_audience_campaigns_audience_id_fkey') THEN ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_audience_id_fkey" FOREIGN KEY (audience_id) REFERENCES crm_lead_audiences(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_campaigns"'::regclass AND conname='slim_audience_campaigns_created_by_fkey') THEN ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_campaigns"'::regclass AND conname='slim_audience_campaigns_salesbot_id_fkey') THEN ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_salesbot_id_fkey" FOREIGN KEY (salesbot_id) REFERENCES salesbots(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_campaigns"'::regclass AND conname='slim_audience_campaigns_session_id_fkey') THEN ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_session_id_fkey" FOREIGN KEY (session_id) REFERENCES whatsapp_web_sessions(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_campaigns"'::regclass AND conname='slim_audience_campaigns_workspace_id_fkey') THEN ALTER TABLE "public"."slim_audience_campaigns" ADD CONSTRAINT "slim_audience_campaigns_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_deliveries"'::regclass AND conname='slim_audience_deliveries_campaign_id_fkey') THEN ALTER TABLE "public"."slim_audience_deliveries" ADD CONSTRAINT "slim_audience_deliveries_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES slim_audience_campaigns(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_deliveries"'::regclass AND conname='slim_audience_deliveries_lead_id_fkey') THEN ALTER TABLE "public"."slim_audience_deliveries" ADD CONSTRAINT "slim_audience_deliveries_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_deliveries"'::regclass AND conname='slim_audience_deliveries_origin_session_id_fkey') THEN ALTER TABLE "public"."slim_audience_deliveries" ADD CONSTRAINT "slim_audience_deliveries_origin_session_id_fkey" FOREIGN KEY (origin_session_id) REFERENCES whatsapp_web_sessions(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_audience_deliveries"'::regclass AND conname='slim_audience_deliveries_workspace_id_fkey') THEN ALTER TABLE "public"."slim_audience_deliveries" ADD CONSTRAINT "slim_audience_deliveries_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_checkout_attempt_closures"'::regclass AND conname='slim_checkout_attempt_closures_actor_id_fkey') THEN ALTER TABLE "public"."slim_checkout_attempt_closures" ADD CONSTRAINT "slim_checkout_attempt_closures_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_checkout_attempt_closures"'::regclass AND conname='slim_checkout_attempt_closures_workspace_id_fkey') THEN ALTER TABLE "public"."slim_checkout_attempt_closures" ADD CONSTRAINT "slim_checkout_attempt_closures_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_changes"'::regclass AND conname='slim_order_changes_actor_id_fkey') THEN ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_changes"'::regclass AND conname='slim_order_changes_order_id_workspace_id_fkey') THEN ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_order_id_workspace_id_fkey" FOREIGN KEY (order_id, workspace_id) REFERENCES slim_orders(id, workspace_id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_changes"'::regclass AND conname='slim_order_changes_replacement_order_id_workspace_id_fkey') THEN ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_replacement_order_id_workspace_id_fkey" FOREIGN KEY (replacement_order_id, workspace_id) REFERENCES slim_orders(id, workspace_id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_changes"'::regclass AND conname='slim_order_changes_workspace_id_fkey') THEN ALTER TABLE "public"."slim_order_changes" ADD CONSTRAINT "slim_order_changes_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_document_deliveries"'::regclass AND conname='slim_order_document_deliveries_actor_id_fkey') THEN ALTER TABLE "public"."slim_order_document_deliveries" ADD CONSTRAINT "slim_order_document_deliveries_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_document_deliveries"'::regclass AND conname='slim_order_document_deliveries_document_id_fkey') THEN ALTER TABLE "public"."slim_order_document_deliveries" ADD CONSTRAINT "slim_order_document_deliveries_document_id_fkey" FOREIGN KEY (document_id) REFERENCES slim_order_documents(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_document_deliveries"'::regclass AND conname='slim_order_document_deliveries_session_id_fkey') THEN ALTER TABLE "public"."slim_order_document_deliveries" ADD CONSTRAINT "slim_order_document_deliveries_session_id_fkey" FOREIGN KEY (session_id) REFERENCES whatsapp_web_sessions(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_document_deliveries"'::regclass AND conname='slim_order_document_deliveries_workspace_id_fkey') THEN ALTER TABLE "public"."slim_order_document_deliveries" ADD CONSTRAINT "slim_order_document_deliveries_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_documents"'::regclass AND conname='slim_order_documents_order_id_workspace_id_fkey') THEN ALTER TABLE "public"."slim_order_documents" ADD CONSTRAINT "slim_order_documents_order_id_workspace_id_fkey" FOREIGN KEY (order_id, workspace_id) REFERENCES slim_orders(id, workspace_id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_order_documents"'::regclass AND conname='slim_order_documents_requested_by_fkey') THEN ALTER TABLE "public"."slim_order_documents" ADD CONSTRAINT "slim_order_documents_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_orders"'::regclass AND conname='slim_orders_cancelled_by_fkey') THEN ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_cancelled_by_fkey" FOREIGN KEY (cancelled_by) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_orders"'::regclass AND conname='slim_orders_created_by_fkey') THEN ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_orders"'::regclass AND conname='slim_orders_customer_id_fkey') THEN ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES leads(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_orders"'::regclass AND conname='slim_orders_legacy_lead_id_fkey') THEN ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_legacy_lead_id_fkey" FOREIGN KEY (legacy_lead_id) REFERENCES leads(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_orders"'::regclass AND conname='slim_orders_workspace_id_fkey') THEN ALTER TABLE "public"."slim_orders" ADD CONSTRAINT "slim_orders_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_stage_move_events"'::regclass AND conname='slim_stage_move_events_actor_id_fkey') THEN ALTER TABLE "public"."slim_stage_move_events" ADD CONSTRAINT "slim_stage_move_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_stage_move_events"'::regclass AND conname='slim_stage_move_events_lead_id_fkey') THEN ALTER TABLE "public"."slim_stage_move_events" ADD CONSTRAINT "slim_stage_move_events_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_stage_move_events"'::regclass AND conname='slim_stage_move_events_workspace_id_fkey') THEN ALTER TABLE "public"."slim_stage_move_events" ADD CONSTRAINT "slim_stage_move_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_stock_movements"'::regclass AND conname='slim_stock_movements_actor_id_fkey') THEN ALTER TABLE "public"."slim_stock_movements" ADD CONSTRAINT "slim_stock_movements_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_stock_movements"'::regclass AND conname='slim_stock_movements_order_id_workspace_id_fkey') THEN ALTER TABLE "public"."slim_stock_movements" ADD CONSTRAINT "slim_stock_movements_order_id_workspace_id_fkey" FOREIGN KEY (order_id, workspace_id) REFERENCES slim_orders(id, workspace_id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."slim_stock_movements"'::regclass AND conname='slim_stock_movements_product_id_fkey') THEN ALTER TABLE "public"."slim_stock_movements" ADD CONSTRAINT "slim_stock_movements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."supplier_product_costs"'::regclass AND conname='supplier_product_costs_product_id_fkey') THEN ALTER TABLE "public"."supplier_product_costs" ADD CONSTRAINT "supplier_product_costs_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."supplier_product_costs"'::regclass AND conname='supplier_product_costs_supplier_id_fkey') THEN ALTER TABLE "public"."supplier_product_costs" ADD CONSTRAINT "supplier_product_costs_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES companies(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;

COMMIT;
SELECT '23-constraints.sql' AS migration_batch,'OK' AS result;


-- 24-constraints.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."supplier_product_costs"'::regclass AND conname='supplier_product_costs_workspace_id_fkey') THEN ALTER TABLE "public"."supplier_product_costs" ADD CONSTRAINT "supplier_product_costs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."support_robot_messages"'::regclass AND conname='support_robot_messages_user_id_fkey') THEN ALTER TABLE "public"."support_robot_messages" ADD CONSTRAINT "support_robot_messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."support_robot_messages"'::regclass AND conname='support_robot_messages_workspace_id_fkey') THEN ALTER TABLE "public"."support_robot_messages" ADD CONSTRAINT "support_robot_messages_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tasks"'::regclass AND conname='tasks_created_by_fkey') THEN ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tasks"'::regclass AND conname='tasks_lead_id_fkey') THEN ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tasks"'::regclass AND conname='tasks_workspace_id_fkey') THEN ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."team_chat_reads"'::regclass AND conname='team_chat_reads_user_id_fkey') THEN ALTER TABLE "public"."team_chat_reads" ADD CONSTRAINT "team_chat_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."team_chat_reads"'::regclass AND conname='team_chat_reads_workspace_id_fkey') THEN ALTER TABLE "public"."team_chat_reads" ADD CONSTRAINT "team_chat_reads_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."team_messages"'::regclass AND conname='team_messages_from_user_id_fkey') THEN ALTER TABLE "public"."team_messages" ADD CONSTRAINT "team_messages_from_user_id_fkey" FOREIGN KEY (from_user_id) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."team_messages"'::regclass AND conname='team_messages_sector_id_fkey') THEN ALTER TABLE "public"."team_messages" ADD CONSTRAINT "team_messages_sector_id_fkey" FOREIGN KEY (sector_id) REFERENCES workflow_sectors(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."team_messages"'::regclass AND conname='team_messages_to_user_id_fkey') THEN ALTER TABLE "public"."team_messages" ADD CONSTRAINT "team_messages_to_user_id_fkey" FOREIGN KEY (to_user_id) REFERENCES auth.users(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."team_messages"'::regclass AND conname='team_messages_workspace_id_fkey') THEN ALTER TABLE "public"."team_messages" ADD CONSTRAINT "team_messages_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tracking_conversion_events"'::regclass AND conname='tracking_conversion_events_event_row_id_fkey') THEN ALTER TABLE "public"."tracking_conversion_events" ADD CONSTRAINT "tracking_conversion_events_event_row_id_fkey" FOREIGN KEY (event_row_id) REFERENCES tracking_events(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tracking_conversion_events"'::regclass AND conname='tracking_conversion_events_lead_id_fkey') THEN ALTER TABLE "public"."tracking_conversion_events" ADD CONSTRAINT "tracking_conversion_events_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tracking_conversion_events"'::regclass AND conname='tracking_conversion_events_workspace_id_fkey') THEN ALTER TABLE "public"."tracking_conversion_events" ADD CONSTRAINT "tracking_conversion_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tracking_events"'::regclass AND conname='tracking_events_lead_id_fkey') THEN ALTER TABLE "public"."tracking_events" ADD CONSTRAINT "tracking_events_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tracking_events"'::regclass AND conname='tracking_events_site_id_fkey') THEN ALTER TABLE "public"."tracking_events" ADD CONSTRAINT "tracking_events_site_id_fkey" FOREIGN KEY (site_id) REFERENCES tracking_sites(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tracking_events"'::regclass AND conname='tracking_events_workspace_id_fkey') THEN ALTER TABLE "public"."tracking_events" ADD CONSTRAINT "tracking_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tracking_sites"'::regclass AND conname='tracking_sites_workspace_id_fkey') THEN ALTER TABLE "public"."tracking_sites" ADD CONSTRAINT "tracking_sites_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."tutorial_lessons"'::regclass AND conname='tutorial_lessons_module_id_fkey') THEN ALTER TABLE "public"."tutorial_lessons" ADD CONSTRAINT "tutorial_lessons_module_id_fkey" FOREIGN KEY (module_id) REFERENCES tutorial_modules(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."user_notification_settings"'::regclass AND conname='user_notification_settings_user_id_fkey') THEN ALTER TABLE "public"."user_notification_settings" ADD CONSTRAINT "user_notification_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."user_permissions"'::regclass AND conname='user_permissions_updated_by_fkey') THEN ALTER TABLE "public"."user_permissions" ADD CONSTRAINT "user_permissions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."user_permissions"'::regclass AND conname='user_permissions_user_id_fkey') THEN ALTER TABLE "public"."user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."user_permissions"'::regclass AND conname='user_permissions_workspace_id_fkey') THEN ALTER TABLE "public"."user_permissions" ADD CONSTRAINT "user_permissions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."user_roles"'::regclass AND conname='user_roles_user_id_fkey') THEN ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."user_sessions"'::regclass AND conname='user_sessions_user_id_fkey') THEN ALTER TABLE "public"."user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."user_sessions"'::regclass AND conname='user_sessions_workspace_id_fkey') THEN ALTER TABLE "public"."user_sessions" ADD CONSTRAINT "user_sessions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."whatsapp_groups"'::regclass AND conname='whatsapp_groups_session_id_fkey') THEN ALTER TABLE "public"."whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_session_id_fkey" FOREIGN KEY (session_id) REFERENCES whatsapp_web_sessions(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."whatsapp_groups"'::regclass AND conname='whatsapp_groups_workspace_id_fkey') THEN ALTER TABLE "public"."whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id); END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."whatsapp_web_messages"'::regclass AND conname='whatsapp_web_messages_session_id_fkey') THEN ALTER TABLE "public"."whatsapp_web_messages" ADD CONSTRAINT "whatsapp_web_messages_session_id_fkey" FOREIGN KEY (session_id) REFERENCES whatsapp_web_sessions(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."whatsapp_web_messages"'::regclass AND conname='whatsapp_web_messages_workspace_id_fkey') THEN ALTER TABLE "public"."whatsapp_web_messages" ADD CONSTRAINT "whatsapp_web_messages_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."whatsapp_web_sessions"'::regclass AND conname='whatsapp_web_sessions_workspace_id_fkey') THEN ALTER TABLE "public"."whatsapp_web_sessions" ADD CONSTRAINT "whatsapp_web_sessions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workflow_sector_members"'::regclass AND conname='workflow_sector_members_sector_id_fkey') THEN ALTER TABLE "public"."workflow_sector_members" ADD CONSTRAINT "workflow_sector_members_sector_id_fkey" FOREIGN KEY (sector_id) REFERENCES workflow_sectors(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workflow_sector_members"'::regclass AND conname='workflow_sector_members_user_id_fkey') THEN ALTER TABLE "public"."workflow_sector_members" ADD CONSTRAINT "workflow_sector_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workflow_sector_members"'::regclass AND conname='workflow_sector_members_workspace_id_fkey') THEN ALTER TABLE "public"."workflow_sector_members" ADD CONSTRAINT "workflow_sector_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workflow_sectors"'::regclass AND conname='workflow_sectors_workspace_id_fkey') THEN ALTER TABLE "public"."workflow_sectors" ADD CONSTRAINT "workflow_sectors_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workspace_invitations"'::regclass AND conname='workspace_invitations_accepted_by_fkey') THEN ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_fkey" FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workspace_invitations"'::regclass AND conname='workspace_invitations_invited_by_fkey') THEN ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workspace_invitations"'::regclass AND conname='workspace_invitations_workspace_id_fkey') THEN ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workspace_members"'::regclass AND conname='workspace_members_user_id_fkey') THEN ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workspace_members"'::regclass AND conname='workspace_members_workspace_id_fkey') THEN ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;
DO $vanessa_migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."workspaces"'::regclass AND conname='workspaces_owner_id_fkey') THEN ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $vanessa_migration$;

COMMIT;
SELECT '24-constraints.sql' AS migration_batch,'OK' AS result;


-- 26-triggers.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE TRIGGER touch_workspaces BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_workspace_seed_defaults AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION seed_workspace_defaults();
CREATE TRIGGER bcpll_members_seat_limit BEFORE INSERT OR UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION private.bcpll_guard_seats();
CREATE TRIGGER bcpll_protect_platform_membership BEFORE DELETE OR UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION private.bcpll_protect_platform_membership();
CREATE TRIGGER marcos_single_office_accounts BEFORE INSERT OR UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION private.marcos_guard_accounts();
CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_crm_sources_updated BEFORE UPDATE ON public.crm_sources FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_pipelines_updated BEFORE UPDATE ON public.pipelines FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_pipeline_stages_updated BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER bcpll_email_stage_event AFTER UPDATE OF stage_id ON public.leads FOR EACH ROW EXECUTE FUNCTION private.bcpll_email_stage_event();
CREATE TRIGGER slim_guard_whatsapp_origin BEFORE INSERT OR UPDATE OF custom_data, workspace_id, merged_into_id ON public.leads FOR EACH ROW EXECUTE FUNCTION private.slim_guard_whatsapp_origin();
CREATE TRIGGER slim_inbox_agent_version BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION private.slim_inbox_agent_version();
CREATE TRIGGER slim_leads_contact_phone_guard AFTER INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION private.slim_leads_contact_phone_guard();
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER product_catalogs_touch BEFORE UPDATE ON public.product_catalogs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_snapshot_lead_product_sale BEFORE INSERT OR UPDATE ON public.lead_products FOR EACH ROW EXECUTE FUNCTION snapshot_lead_product_sale();
CREATE TRIGGER trg_supplier_product_costs_updated BEFORE UPDATE ON public.supplier_product_costs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER whatsapp_sessions_touch_updated_at BEFORE UPDATE ON public.whatsapp_web_sessions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER slim_guard_whatsapp_message_origin BEFORE UPDATE OF session_id, workspace_id ON public.whatsapp_web_messages FOR EACH ROW EXECUTE FUNCTION private.slim_guard_whatsapp_message_origin();
CREATE TRIGGER ai_brain_sources_chunk_sync AFTER INSERT OR UPDATE OF content, enabled, source_type ON public.ai_brain_sources FOR EACH ROW EXECUTE FUNCTION ai_brain_chunk_source();
CREATE TRIGGER slim_inbox_run_guard BEFORE UPDATE ON public.salesbot_runs FOR EACH ROW EXECUTE FUNCTION private.slim_inbox_guard_run();
CREATE TRIGGER ai_agent_settings_updated_at BEFORE UPDATE ON public.ai_agent_settings FOR EACH ROW EXECUTE FUNCTION private.saude_slim_touch_ai_updated_at();
CREATE TRIGGER ai_agent_conversations_updated_at BEFORE UPDATE ON public.ai_agent_conversations FOR EACH ROW EXECUTE FUNCTION private.saude_slim_touch_ai_updated_at();
CREATE TRIGGER slim_refs BEFORE INSERT OR UPDATE ON public.crm_lead_audiences FOR EACH ROW EXECUTE FUNCTION private.slim_operational_references();
CREATE TRIGGER slim_touch BEFORE UPDATE ON public.crm_lead_audiences FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER slim_refs BEFORE INSERT OR UPDATE ON public.lead_custom_fields FOR EACH ROW EXECUTE FUNCTION private.slim_operational_references();
CREATE TRIGGER slim_touch BEFORE UPDATE ON public.lead_custom_fields FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER slim_refs BEFORE INSERT OR UPDATE ON public.lead_custom_field_values FOR EACH ROW EXECUTE FUNCTION private.slim_operational_references();
CREATE TRIGGER slim_touch BEFORE UPDATE ON public.lead_custom_field_values FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER slim_refs BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION private.slim_operational_references();
CREATE TRIGGER slim_touch BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER slim_refs BEFORE INSERT OR UPDATE ON public.crm_stage_automations FOR EACH ROW EXECUTE FUNCTION private.slim_operational_references();
CREATE TRIGGER slim_touch BEFORE UPDATE ON public.crm_stage_automations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER slim_refs BEFORE INSERT OR UPDATE ON public.crm_automation_jobs FOR EACH ROW EXECUTE FUNCTION private.slim_operational_references();
CREATE TRIGGER slim_audience_delivery_origin BEFORE INSERT ON public.slim_audience_deliveries FOR EACH ROW EXECUTE FUNCTION private.slim_audience_delivery_origin();
CREATE TRIGGER slim_form_submission_refs BEFORE INSERT OR UPDATE ON public.crm_form_submissions FOR EACH ROW EXECUTE FUNCTION private.slim_dashboard_source_references();
CREATE TRIGGER slim_tracking_event_refs BEFORE INSERT OR UPDATE ON public.tracking_events FOR EACH ROW EXECUTE FUNCTION private.slim_dashboard_source_references();
CREATE TRIGGER slim_tracking_conversion_refs BEFORE INSERT OR UPDATE ON public.tracking_conversion_events FOR EACH ROW EXECUTE FUNCTION private.slim_dashboard_source_references();
CREATE TRIGGER slim_00_order_change_document_barrier BEFORE INSERT ON public.slim_order_documents FOR EACH ROW EXECUTE FUNCTION private.slim_guard_order_change_document();
CREATE TRIGGER slim_document_insert_guard BEFORE INSERT ON public.slim_order_documents FOR EACH ROW EXECUTE FUNCTION private.slim_guard_caller_document();
CREATE TRIGGER slim_00_order_change_delivery_barrier BEFORE INSERT ON public.slim_order_document_deliveries FOR EACH ROW EXECUTE FUNCTION private.slim_guard_order_change_document();
CREATE TRIGGER slim_document_delivery_guard BEFORE INSERT OR UPDATE ON public.slim_order_document_deliveries FOR EACH ROW EXECUTE FUNCTION private.slim_guard_caller_document();
CREATE TRIGGER slim_guard_attempt_closure BEFORE INSERT ON public.slim_checkout_attempt_closures FOR EACH ROW EXECUTE FUNCTION private.slim_guard_checkout_close();
CREATE TRIGGER slim_inbox_group_scope BEFORE INSERT OR UPDATE ON public.whatsapp_groups FOR EACH ROW EXECUTE FUNCTION private.slim_inbox_group_scope();
CREATE TRIGGER slim_group_agent_config_update BEFORE UPDATE ON public.group_ai_agents FOR EACH ROW EXECUTE FUNCTION private.slim_group_agent_config_update();
CREATE TRIGGER slim_copilot_immutable_proposal BEFORE UPDATE ON private.slim_copilot_proposals FOR EACH ROW EXECUTE FUNCTION private.slim_copilot_immutable_proposal();
CREATE TRIGGER bcpll_attach_platform_support AFTER INSERT ON public.bcpll_workspaces FOR EACH ROW EXECUTE FUNCTION private.bcpll_sync_platform_support();
CREATE TRIGGER bcpll_email_rule_scope BEFORE INSERT OR UPDATE ON public.bcpll_email_stage_rules FOR EACH ROW EXECUTE FUNCTION private.bcpll_email_rule_scope();
CREATE TRIGGER bcpll_sync_platform_support AFTER INSERT OR DELETE ON private.bcpll_platform_support FOR EACH ROW EXECUTE FUNCTION private.bcpll_sync_platform_support();

COMMIT;
SELECT '26-triggers.sql' AS migration_batch,'OK' AS result;


-- 27-access.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
ALTER TABLE "private"."integration_credentials" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "private"."integration_credentials" TO "authenticated";
GRANT SELECT ON "private"."integration_credentials" TO "authenticated";
GRANT UPDATE ON "private"."integration_credentials" TO "authenticated";
GRANT DELETE ON "private"."integration_credentials" TO "authenticated";
GRANT INSERT ON "private"."integration_credentials" TO "service_role";
GRANT SELECT ON "private"."integration_credentials" TO "service_role";
GRANT UPDATE ON "private"."integration_credentials" TO "service_role";
GRANT DELETE ON "private"."integration_credentials" TO "service_role";
ALTER TABLE "private"."slim_copilot_proposal_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."slim_copilot_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."slim_funnel_write_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."slim_invitation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_agent_conversations" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."ai_agent_conversations" TO "authenticated";
GRANT SELECT ON "public"."ai_agent_conversations" TO "authenticated";
GRANT UPDATE ON "public"."ai_agent_conversations" TO "authenticated";
GRANT DELETE ON "public"."ai_agent_conversations" TO "authenticated";
GRANT TRUNCATE ON "public"."ai_agent_conversations" TO "authenticated";
GRANT REFERENCES ON "public"."ai_agent_conversations" TO "authenticated";
GRANT TRIGGER ON "public"."ai_agent_conversations" TO "authenticated";
GRANT MAINTAIN ON "public"."ai_agent_conversations" TO "authenticated";
GRANT INSERT ON "public"."ai_agent_conversations" TO "service_role";
GRANT SELECT ON "public"."ai_agent_conversations" TO "service_role";
GRANT UPDATE ON "public"."ai_agent_conversations" TO "service_role";
GRANT DELETE ON "public"."ai_agent_conversations" TO "service_role";
GRANT TRUNCATE ON "public"."ai_agent_conversations" TO "service_role";
GRANT REFERENCES ON "public"."ai_agent_conversations" TO "service_role";
GRANT TRIGGER ON "public"."ai_agent_conversations" TO "service_role";
GRANT MAINTAIN ON "public"."ai_agent_conversations" TO "service_role";
ALTER TABLE "public"."ai_agent_settings" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."ai_agent_settings" TO "authenticated";
GRANT SELECT ON "public"."ai_agent_settings" TO "authenticated";
GRANT UPDATE ON "public"."ai_agent_settings" TO "authenticated";
GRANT DELETE ON "public"."ai_agent_settings" TO "authenticated";
GRANT TRUNCATE ON "public"."ai_agent_settings" TO "authenticated";
GRANT REFERENCES ON "public"."ai_agent_settings" TO "authenticated";
GRANT TRIGGER ON "public"."ai_agent_settings" TO "authenticated";
GRANT MAINTAIN ON "public"."ai_agent_settings" TO "authenticated";
GRANT INSERT ON "public"."ai_agent_settings" TO "service_role";
GRANT SELECT ON "public"."ai_agent_settings" TO "service_role";
GRANT UPDATE ON "public"."ai_agent_settings" TO "service_role";
GRANT DELETE ON "public"."ai_agent_settings" TO "service_role";
GRANT TRUNCATE ON "public"."ai_agent_settings" TO "service_role";
GRANT REFERENCES ON "public"."ai_agent_settings" TO "service_role";
GRANT TRIGGER ON "public"."ai_agent_settings" TO "service_role";
GRANT MAINTAIN ON "public"."ai_agent_settings" TO "service_role";
ALTER TABLE "public"."ai_brain_blocked_terms" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."ai_brain_blocked_terms" TO "anon";
GRANT SELECT ON "public"."ai_brain_blocked_terms" TO "anon";
GRANT UPDATE ON "public"."ai_brain_blocked_terms" TO "anon";
GRANT DELETE ON "public"."ai_brain_blocked_terms" TO "anon";
GRANT TRUNCATE ON "public"."ai_brain_blocked_terms" TO "anon";
GRANT REFERENCES ON "public"."ai_brain_blocked_terms" TO "anon";
GRANT TRIGGER ON "public"."ai_brain_blocked_terms" TO "anon";
GRANT MAINTAIN ON "public"."ai_brain_blocked_terms" TO "anon";
GRANT INSERT ON "public"."ai_brain_blocked_terms" TO "authenticated";
GRANT SELECT ON "public"."ai_brain_blocked_terms" TO "authenticated";
GRANT UPDATE ON "public"."ai_brain_blocked_terms" TO "authenticated";
GRANT DELETE ON "public"."ai_brain_blocked_terms" TO "authenticated";
GRANT TRUNCATE ON "public"."ai_brain_blocked_terms" TO "authenticated";
GRANT REFERENCES ON "public"."ai_brain_blocked_terms" TO "authenticated";
GRANT TRIGGER ON "public"."ai_brain_blocked_terms" TO "authenticated";
GRANT MAINTAIN ON "public"."ai_brain_blocked_terms" TO "authenticated";
GRANT INSERT ON "public"."ai_brain_blocked_terms" TO "service_role";
GRANT SELECT ON "public"."ai_brain_blocked_terms" TO "service_role";
GRANT UPDATE ON "public"."ai_brain_blocked_terms" TO "service_role";
GRANT DELETE ON "public"."ai_brain_blocked_terms" TO "service_role";
GRANT TRUNCATE ON "public"."ai_brain_blocked_terms" TO "service_role";
GRANT REFERENCES ON "public"."ai_brain_blocked_terms" TO "service_role";
GRANT TRIGGER ON "public"."ai_brain_blocked_terms" TO "service_role";
GRANT MAINTAIN ON "public"."ai_brain_blocked_terms" TO "service_role";
ALTER TABLE "public"."ai_brain_chunks" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."ai_brain_chunks" TO "anon";
GRANT SELECT ON "public"."ai_brain_chunks" TO "anon";
GRANT UPDATE ON "public"."ai_brain_chunks" TO "anon";
GRANT DELETE ON "public"."ai_brain_chunks" TO "anon";
GRANT TRUNCATE ON "public"."ai_brain_chunks" TO "anon";
GRANT REFERENCES ON "public"."ai_brain_chunks" TO "anon";
GRANT TRIGGER ON "public"."ai_brain_chunks" TO "anon";
GRANT MAINTAIN ON "public"."ai_brain_chunks" TO "anon";
GRANT INSERT ON "public"."ai_brain_chunks" TO "authenticated";
GRANT SELECT ON "public"."ai_brain_chunks" TO "authenticated";
GRANT UPDATE ON "public"."ai_brain_chunks" TO "authenticated";
GRANT DELETE ON "public"."ai_brain_chunks" TO "authenticated";
GRANT TRUNCATE ON "public"."ai_brain_chunks" TO "authenticated";
GRANT REFERENCES ON "public"."ai_brain_chunks" TO "authenticated";
GRANT TRIGGER ON "public"."ai_brain_chunks" TO "authenticated";
GRANT MAINTAIN ON "public"."ai_brain_chunks" TO "authenticated";
GRANT INSERT ON "public"."ai_brain_chunks" TO "service_role";
GRANT SELECT ON "public"."ai_brain_chunks" TO "service_role";
GRANT UPDATE ON "public"."ai_brain_chunks" TO "service_role";
GRANT DELETE ON "public"."ai_brain_chunks" TO "service_role";
GRANT TRUNCATE ON "public"."ai_brain_chunks" TO "service_role";
GRANT REFERENCES ON "public"."ai_brain_chunks" TO "service_role";
GRANT TRIGGER ON "public"."ai_brain_chunks" TO "service_role";
GRANT MAINTAIN ON "public"."ai_brain_chunks" TO "service_role";
ALTER TABLE "public"."ai_brain_sources" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."ai_brain_sources" TO "anon";
GRANT SELECT ON "public"."ai_brain_sources" TO "anon";
GRANT UPDATE ON "public"."ai_brain_sources" TO "anon";
GRANT DELETE ON "public"."ai_brain_sources" TO "anon";
GRANT TRUNCATE ON "public"."ai_brain_sources" TO "anon";
GRANT REFERENCES ON "public"."ai_brain_sources" TO "anon";
GRANT TRIGGER ON "public"."ai_brain_sources" TO "anon";
GRANT MAINTAIN ON "public"."ai_brain_sources" TO "anon";
GRANT INSERT ON "public"."ai_brain_sources" TO "authenticated";
GRANT SELECT ON "public"."ai_brain_sources" TO "authenticated";
GRANT UPDATE ON "public"."ai_brain_sources" TO "authenticated";
GRANT DELETE ON "public"."ai_brain_sources" TO "authenticated";
GRANT TRUNCATE ON "public"."ai_brain_sources" TO "authenticated";
GRANT REFERENCES ON "public"."ai_brain_sources" TO "authenticated";
GRANT TRIGGER ON "public"."ai_brain_sources" TO "authenticated";
GRANT MAINTAIN ON "public"."ai_brain_sources" TO "authenticated";
GRANT INSERT ON "public"."ai_brain_sources" TO "service_role";
GRANT SELECT ON "public"."ai_brain_sources" TO "service_role";
GRANT UPDATE ON "public"."ai_brain_sources" TO "service_role";
GRANT DELETE ON "public"."ai_brain_sources" TO "service_role";
GRANT TRUNCATE ON "public"."ai_brain_sources" TO "service_role";
GRANT REFERENCES ON "public"."ai_brain_sources" TO "service_role";
GRANT TRIGGER ON "public"."ai_brain_sources" TO "service_role";
GRANT MAINTAIN ON "public"."ai_brain_sources" TO "service_role";
ALTER TABLE "public"."bcpll_email_campaigns" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."bcpll_email_campaigns" TO "service_role";
GRANT SELECT ON "public"."bcpll_email_campaigns" TO "service_role";
GRANT UPDATE ON "public"."bcpll_email_campaigns" TO "service_role";
GRANT DELETE ON "public"."bcpll_email_campaigns" TO "service_role";
GRANT TRUNCATE ON "public"."bcpll_email_campaigns" TO "service_role";
GRANT REFERENCES ON "public"."bcpll_email_campaigns" TO "service_role";
GRANT TRIGGER ON "public"."bcpll_email_campaigns" TO "service_role";
GRANT MAINTAIN ON "public"."bcpll_email_campaigns" TO "service_role";
GRANT SELECT ON "public"."bcpll_email_campaigns" TO "authenticated";
ALTER TABLE "public"."bcpll_email_outbox" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."bcpll_email_outbox" TO "service_role";
GRANT SELECT ON "public"."bcpll_email_outbox" TO "service_role";
GRANT UPDATE ON "public"."bcpll_email_outbox" TO "service_role";
GRANT DELETE ON "public"."bcpll_email_outbox" TO "service_role";
GRANT TRUNCATE ON "public"."bcpll_email_outbox" TO "service_role";
GRANT REFERENCES ON "public"."bcpll_email_outbox" TO "service_role";
GRANT TRIGGER ON "public"."bcpll_email_outbox" TO "service_role";
GRANT MAINTAIN ON "public"."bcpll_email_outbox" TO "service_role";
GRANT SELECT ON "public"."bcpll_email_outbox" TO "authenticated";
ALTER TABLE "public"."bcpll_email_stage_rules" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."bcpll_email_stage_rules" TO "service_role";
GRANT SELECT ON "public"."bcpll_email_stage_rules" TO "service_role";
GRANT UPDATE ON "public"."bcpll_email_stage_rules" TO "service_role";
GRANT DELETE ON "public"."bcpll_email_stage_rules" TO "service_role";
GRANT TRUNCATE ON "public"."bcpll_email_stage_rules" TO "service_role";
GRANT REFERENCES ON "public"."bcpll_email_stage_rules" TO "service_role";
GRANT TRIGGER ON "public"."bcpll_email_stage_rules" TO "service_role";
GRANT MAINTAIN ON "public"."bcpll_email_stage_rules" TO "service_role";
GRANT INSERT ON "public"."bcpll_email_stage_rules" TO "authenticated";
GRANT SELECT ON "public"."bcpll_email_stage_rules" TO "authenticated";
GRANT UPDATE ON "public"."bcpll_email_stage_rules" TO "authenticated";
GRANT DELETE ON "public"."bcpll_email_stage_rules" TO "authenticated";
ALTER TABLE "public"."bcpll_email_templates" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."bcpll_email_templates" TO "service_role";
GRANT SELECT ON "public"."bcpll_email_templates" TO "service_role";
GRANT UPDATE ON "public"."bcpll_email_templates" TO "service_role";
GRANT DELETE ON "public"."bcpll_email_templates" TO "service_role";
GRANT TRUNCATE ON "public"."bcpll_email_templates" TO "service_role";
GRANT REFERENCES ON "public"."bcpll_email_templates" TO "service_role";
GRANT TRIGGER ON "public"."bcpll_email_templates" TO "service_role";
GRANT MAINTAIN ON "public"."bcpll_email_templates" TO "service_role";
GRANT INSERT ON "public"."bcpll_email_templates" TO "authenticated";
GRANT SELECT ON "public"."bcpll_email_templates" TO "authenticated";
GRANT UPDATE ON "public"."bcpll_email_templates" TO "authenticated";
GRANT DELETE ON "public"."bcpll_email_templates" TO "authenticated";
ALTER TABLE "public"."bcpll_tutorial_lessons" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."bcpll_tutorial_lessons" TO "service_role";
GRANT SELECT ON "public"."bcpll_tutorial_lessons" TO "service_role";
GRANT UPDATE ON "public"."bcpll_tutorial_lessons" TO "service_role";
GRANT DELETE ON "public"."bcpll_tutorial_lessons" TO "service_role";
GRANT TRUNCATE ON "public"."bcpll_tutorial_lessons" TO "service_role";
GRANT REFERENCES ON "public"."bcpll_tutorial_lessons" TO "service_role";
GRANT TRIGGER ON "public"."bcpll_tutorial_lessons" TO "service_role";
GRANT MAINTAIN ON "public"."bcpll_tutorial_lessons" TO "service_role";
GRANT INSERT ON "public"."bcpll_tutorial_lessons" TO "authenticated";
GRANT SELECT ON "public"."bcpll_tutorial_lessons" TO "authenticated";
GRANT UPDATE ON "public"."bcpll_tutorial_lessons" TO "authenticated";
GRANT DELETE ON "public"."bcpll_tutorial_lessons" TO "authenticated";
ALTER TABLE "public"."bcpll_tutorial_modules" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."bcpll_tutorial_modules" TO "service_role";
GRANT SELECT ON "public"."bcpll_tutorial_modules" TO "service_role";
GRANT UPDATE ON "public"."bcpll_tutorial_modules" TO "service_role";
GRANT DELETE ON "public"."bcpll_tutorial_modules" TO "service_role";
GRANT TRUNCATE ON "public"."bcpll_tutorial_modules" TO "service_role";
GRANT REFERENCES ON "public"."bcpll_tutorial_modules" TO "service_role";
GRANT TRIGGER ON "public"."bcpll_tutorial_modules" TO "service_role";
GRANT MAINTAIN ON "public"."bcpll_tutorial_modules" TO "service_role";
GRANT INSERT ON "public"."bcpll_tutorial_modules" TO "authenticated";
GRANT SELECT ON "public"."bcpll_tutorial_modules" TO "authenticated";
GRANT UPDATE ON "public"."bcpll_tutorial_modules" TO "authenticated";
GRANT DELETE ON "public"."bcpll_tutorial_modules" TO "authenticated";
ALTER TABLE "public"."bcpll_utm_links" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."bcpll_utm_links" TO "service_role";
GRANT SELECT ON "public"."bcpll_utm_links" TO "service_role";
GRANT UPDATE ON "public"."bcpll_utm_links" TO "service_role";
GRANT DELETE ON "public"."bcpll_utm_links" TO "service_role";
GRANT TRUNCATE ON "public"."bcpll_utm_links" TO "service_role";
GRANT REFERENCES ON "public"."bcpll_utm_links" TO "service_role";
GRANT TRIGGER ON "public"."bcpll_utm_links" TO "service_role";
GRANT MAINTAIN ON "public"."bcpll_utm_links" TO "service_role";
GRANT INSERT ON "public"."bcpll_utm_links" TO "authenticated";
GRANT SELECT ON "public"."bcpll_utm_links" TO "authenticated";
GRANT UPDATE ON "public"."bcpll_utm_links" TO "authenticated";
GRANT DELETE ON "public"."bcpll_utm_links" TO "authenticated";
ALTER TABLE "public"."bcpll_workspaces" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."bcpll_workspaces" TO "service_role";
GRANT SELECT ON "public"."bcpll_workspaces" TO "service_role";
GRANT UPDATE ON "public"."bcpll_workspaces" TO "service_role";
GRANT DELETE ON "public"."bcpll_workspaces" TO "service_role";
GRANT TRUNCATE ON "public"."bcpll_workspaces" TO "service_role";
GRANT REFERENCES ON "public"."bcpll_workspaces" TO "service_role";
GRANT TRIGGER ON "public"."bcpll_workspaces" TO "service_role";
GRANT MAINTAIN ON "public"."bcpll_workspaces" TO "service_role";
GRANT SELECT ON "public"."bcpll_workspaces" TO "authenticated";
ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."companies" TO "anon";
GRANT SELECT ON "public"."companies" TO "anon";
GRANT UPDATE ON "public"."companies" TO "anon";
GRANT DELETE ON "public"."companies" TO "anon";
GRANT TRUNCATE ON "public"."companies" TO "anon";
GRANT REFERENCES ON "public"."companies" TO "anon";
GRANT TRIGGER ON "public"."companies" TO "anon";
GRANT MAINTAIN ON "public"."companies" TO "anon";
GRANT INSERT ON "public"."companies" TO "authenticated";
GRANT SELECT ON "public"."companies" TO "authenticated";
GRANT UPDATE ON "public"."companies" TO "authenticated";
GRANT DELETE ON "public"."companies" TO "authenticated";
GRANT TRUNCATE ON "public"."companies" TO "authenticated";
GRANT REFERENCES ON "public"."companies" TO "authenticated";
GRANT TRIGGER ON "public"."companies" TO "authenticated";
GRANT MAINTAIN ON "public"."companies" TO "authenticated";
GRANT INSERT ON "public"."companies" TO "service_role";
GRANT SELECT ON "public"."companies" TO "service_role";
GRANT UPDATE ON "public"."companies" TO "service_role";
GRANT DELETE ON "public"."companies" TO "service_role";
GRANT TRUNCATE ON "public"."companies" TO "service_role";
GRANT REFERENCES ON "public"."companies" TO "service_role";
GRANT TRIGGER ON "public"."companies" TO "service_role";
GRANT MAINTAIN ON "public"."companies" TO "service_role";
ALTER TABLE "public"."conversation_agent_runs" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."conversation_agent_runs" TO "service_role";
GRANT SELECT ON "public"."conversation_agent_runs" TO "service_role";
GRANT UPDATE ON "public"."conversation_agent_runs" TO "service_role";
GRANT DELETE ON "public"."conversation_agent_runs" TO "service_role";
GRANT TRUNCATE ON "public"."conversation_agent_runs" TO "service_role";
GRANT REFERENCES ON "public"."conversation_agent_runs" TO "service_role";
GRANT TRIGGER ON "public"."conversation_agent_runs" TO "service_role";
GRANT MAINTAIN ON "public"."conversation_agent_runs" TO "service_role";
GRANT SELECT ON "public"."conversation_agent_runs" TO "authenticated";
ALTER TABLE "public"."conversation_ai_agents" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."conversation_ai_agents" TO "service_role";
GRANT SELECT ON "public"."conversation_ai_agents" TO "service_role";
GRANT UPDATE ON "public"."conversation_ai_agents" TO "service_role";
GRANT DELETE ON "public"."conversation_ai_agents" TO "service_role";
GRANT TRUNCATE ON "public"."conversation_ai_agents" TO "service_role";
GRANT REFERENCES ON "public"."conversation_ai_agents" TO "service_role";
GRANT TRIGGER ON "public"."conversation_ai_agents" TO "service_role";
GRANT MAINTAIN ON "public"."conversation_ai_agents" TO "service_role";
GRANT INSERT ON "public"."conversation_ai_agents" TO "authenticated";
GRANT SELECT ON "public"."conversation_ai_agents" TO "authenticated";
GRANT UPDATE ON "public"."conversation_ai_agents" TO "authenticated";
GRANT DELETE ON "public"."conversation_ai_agents" TO "authenticated";
ALTER TABLE "public"."crm_automation_jobs" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."crm_automation_jobs" TO "service_role";
GRANT SELECT ON "public"."crm_automation_jobs" TO "service_role";
GRANT UPDATE ON "public"."crm_automation_jobs" TO "service_role";
GRANT DELETE ON "public"."crm_automation_jobs" TO "service_role";
GRANT TRUNCATE ON "public"."crm_automation_jobs" TO "service_role";
GRANT REFERENCES ON "public"."crm_automation_jobs" TO "service_role";
GRANT TRIGGER ON "public"."crm_automation_jobs" TO "service_role";
GRANT MAINTAIN ON "public"."crm_automation_jobs" TO "service_role";
GRANT SELECT ON "public"."crm_automation_jobs" TO "authenticated";
ALTER TABLE "public"."crm_form_submissions" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."crm_form_submissions" TO "service_role";
GRANT SELECT ON "public"."crm_form_submissions" TO "service_role";
GRANT UPDATE ON "public"."crm_form_submissions" TO "service_role";
GRANT DELETE ON "public"."crm_form_submissions" TO "service_role";
GRANT TRUNCATE ON "public"."crm_form_submissions" TO "service_role";
GRANT REFERENCES ON "public"."crm_form_submissions" TO "service_role";
GRANT TRIGGER ON "public"."crm_form_submissions" TO "service_role";
GRANT MAINTAIN ON "public"."crm_form_submissions" TO "service_role";
GRANT SELECT ON "public"."crm_form_submissions" TO "authenticated";
ALTER TABLE "public"."crm_forms" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."crm_forms" TO "anon";
GRANT SELECT ON "public"."crm_forms" TO "anon";
GRANT UPDATE ON "public"."crm_forms" TO "anon";
GRANT DELETE ON "public"."crm_forms" TO "anon";
GRANT TRUNCATE ON "public"."crm_forms" TO "anon";
GRANT REFERENCES ON "public"."crm_forms" TO "anon";
GRANT TRIGGER ON "public"."crm_forms" TO "anon";
GRANT MAINTAIN ON "public"."crm_forms" TO "anon";
GRANT INSERT ON "public"."crm_forms" TO "authenticated";
GRANT SELECT ON "public"."crm_forms" TO "authenticated";
GRANT UPDATE ON "public"."crm_forms" TO "authenticated";
GRANT DELETE ON "public"."crm_forms" TO "authenticated";
GRANT TRUNCATE ON "public"."crm_forms" TO "authenticated";
GRANT REFERENCES ON "public"."crm_forms" TO "authenticated";
GRANT TRIGGER ON "public"."crm_forms" TO "authenticated";
GRANT MAINTAIN ON "public"."crm_forms" TO "authenticated";
GRANT INSERT ON "public"."crm_forms" TO "service_role";
GRANT SELECT ON "public"."crm_forms" TO "service_role";
GRANT UPDATE ON "public"."crm_forms" TO "service_role";

COMMIT;
SELECT '27-access.sql' AS migration_batch,'OK' AS result;


-- 28-access.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
GRANT DELETE ON "public"."crm_forms" TO "service_role";
GRANT TRUNCATE ON "public"."crm_forms" TO "service_role";
GRANT REFERENCES ON "public"."crm_forms" TO "service_role";
GRANT TRIGGER ON "public"."crm_forms" TO "service_role";
GRANT MAINTAIN ON "public"."crm_forms" TO "service_role";
ALTER TABLE "public"."crm_lead_audiences" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."crm_lead_audiences" TO "service_role";
GRANT SELECT ON "public"."crm_lead_audiences" TO "service_role";
GRANT UPDATE ON "public"."crm_lead_audiences" TO "service_role";
GRANT DELETE ON "public"."crm_lead_audiences" TO "service_role";
GRANT TRUNCATE ON "public"."crm_lead_audiences" TO "service_role";
GRANT REFERENCES ON "public"."crm_lead_audiences" TO "service_role";
GRANT TRIGGER ON "public"."crm_lead_audiences" TO "service_role";
GRANT MAINTAIN ON "public"."crm_lead_audiences" TO "service_role";
GRANT INSERT ON "public"."crm_lead_audiences" TO "authenticated";
GRANT SELECT ON "public"."crm_lead_audiences" TO "authenticated";
GRANT UPDATE ON "public"."crm_lead_audiences" TO "authenticated";
GRANT DELETE ON "public"."crm_lead_audiences" TO "authenticated";
ALTER TABLE "public"."crm_source_funnels" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."crm_source_funnels" TO "anon";
GRANT SELECT ON "public"."crm_source_funnels" TO "anon";
GRANT UPDATE ON "public"."crm_source_funnels" TO "anon";
GRANT DELETE ON "public"."crm_source_funnels" TO "anon";
GRANT TRUNCATE ON "public"."crm_source_funnels" TO "anon";
GRANT REFERENCES ON "public"."crm_source_funnels" TO "anon";
GRANT TRIGGER ON "public"."crm_source_funnels" TO "anon";
GRANT MAINTAIN ON "public"."crm_source_funnels" TO "anon";
GRANT INSERT ON "public"."crm_source_funnels" TO "authenticated";
GRANT SELECT ON "public"."crm_source_funnels" TO "authenticated";
GRANT UPDATE ON "public"."crm_source_funnels" TO "authenticated";
GRANT DELETE ON "public"."crm_source_funnels" TO "authenticated";
GRANT TRUNCATE ON "public"."crm_source_funnels" TO "authenticated";
GRANT REFERENCES ON "public"."crm_source_funnels" TO "authenticated";
GRANT TRIGGER ON "public"."crm_source_funnels" TO "authenticated";
GRANT MAINTAIN ON "public"."crm_source_funnels" TO "authenticated";
GRANT INSERT ON "public"."crm_source_funnels" TO "service_role";
GRANT SELECT ON "public"."crm_source_funnels" TO "service_role";
GRANT UPDATE ON "public"."crm_source_funnels" TO "service_role";
GRANT DELETE ON "public"."crm_source_funnels" TO "service_role";
GRANT TRUNCATE ON "public"."crm_source_funnels" TO "service_role";
GRANT REFERENCES ON "public"."crm_source_funnels" TO "service_role";
GRANT TRIGGER ON "public"."crm_source_funnels" TO "service_role";
GRANT MAINTAIN ON "public"."crm_source_funnels" TO "service_role";
ALTER TABLE "public"."crm_sources" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."crm_sources" TO "anon";
GRANT SELECT ON "public"."crm_sources" TO "anon";
GRANT UPDATE ON "public"."crm_sources" TO "anon";
GRANT DELETE ON "public"."crm_sources" TO "anon";
GRANT TRUNCATE ON "public"."crm_sources" TO "anon";
GRANT REFERENCES ON "public"."crm_sources" TO "anon";
GRANT TRIGGER ON "public"."crm_sources" TO "anon";
GRANT MAINTAIN ON "public"."crm_sources" TO "anon";
GRANT INSERT ON "public"."crm_sources" TO "authenticated";
GRANT SELECT ON "public"."crm_sources" TO "authenticated";
GRANT UPDATE ON "public"."crm_sources" TO "authenticated";
GRANT DELETE ON "public"."crm_sources" TO "authenticated";
GRANT TRUNCATE ON "public"."crm_sources" TO "authenticated";
GRANT REFERENCES ON "public"."crm_sources" TO "authenticated";
GRANT TRIGGER ON "public"."crm_sources" TO "authenticated";
GRANT MAINTAIN ON "public"."crm_sources" TO "authenticated";
GRANT INSERT ON "public"."crm_sources" TO "service_role";
GRANT SELECT ON "public"."crm_sources" TO "service_role";
GRANT UPDATE ON "public"."crm_sources" TO "service_role";
GRANT DELETE ON "public"."crm_sources" TO "service_role";
GRANT TRUNCATE ON "public"."crm_sources" TO "service_role";
GRANT REFERENCES ON "public"."crm_sources" TO "service_role";
GRANT TRIGGER ON "public"."crm_sources" TO "service_role";
GRANT MAINTAIN ON "public"."crm_sources" TO "service_role";
ALTER TABLE "public"."crm_stage_automations" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."crm_stage_automations" TO "service_role";
GRANT SELECT ON "public"."crm_stage_automations" TO "service_role";
GRANT UPDATE ON "public"."crm_stage_automations" TO "service_role";
GRANT DELETE ON "public"."crm_stage_automations" TO "service_role";
GRANT TRUNCATE ON "public"."crm_stage_automations" TO "service_role";
GRANT REFERENCES ON "public"."crm_stage_automations" TO "service_role";
GRANT TRIGGER ON "public"."crm_stage_automations" TO "service_role";
GRANT MAINTAIN ON "public"."crm_stage_automations" TO "service_role";
GRANT INSERT ON "public"."crm_stage_automations" TO "authenticated";
GRANT SELECT ON "public"."crm_stage_automations" TO "authenticated";
GRANT UPDATE ON "public"."crm_stage_automations" TO "authenticated";
GRANT DELETE ON "public"."crm_stage_automations" TO "authenticated";
ALTER TABLE "public"."group_ai_agents" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."group_ai_agents" TO "service_role";
GRANT SELECT ON "public"."group_ai_agents" TO "service_role";
GRANT UPDATE ON "public"."group_ai_agents" TO "service_role";
GRANT DELETE ON "public"."group_ai_agents" TO "service_role";
GRANT TRUNCATE ON "public"."group_ai_agents" TO "service_role";
GRANT REFERENCES ON "public"."group_ai_agents" TO "service_role";
GRANT TRIGGER ON "public"."group_ai_agents" TO "service_role";
GRANT MAINTAIN ON "public"."group_ai_agents" TO "service_role";
GRANT INSERT ON "public"."group_ai_agents" TO "authenticated";
GRANT SELECT ON "public"."group_ai_agents" TO "authenticated";
GRANT UPDATE ON "public"."group_ai_agents" TO "authenticated";
GRANT DELETE ON "public"."group_ai_agents" TO "authenticated";
ALTER TABLE "public"."inbox_label_assignments" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."inbox_label_assignments" TO "service_role";
GRANT SELECT ON "public"."inbox_label_assignments" TO "service_role";
GRANT UPDATE ON "public"."inbox_label_assignments" TO "service_role";
GRANT DELETE ON "public"."inbox_label_assignments" TO "service_role";
GRANT TRUNCATE ON "public"."inbox_label_assignments" TO "service_role";
GRANT REFERENCES ON "public"."inbox_label_assignments" TO "service_role";
GRANT TRIGGER ON "public"."inbox_label_assignments" TO "service_role";
GRANT MAINTAIN ON "public"."inbox_label_assignments" TO "service_role";
GRANT INSERT ON "public"."inbox_label_assignments" TO "authenticated";
GRANT SELECT ON "public"."inbox_label_assignments" TO "authenticated";
GRANT UPDATE ON "public"."inbox_label_assignments" TO "authenticated";
GRANT DELETE ON "public"."inbox_label_assignments" TO "authenticated";
ALTER TABLE "public"."inbox_labels" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."inbox_labels" TO "service_role";
GRANT SELECT ON "public"."inbox_labels" TO "service_role";
GRANT UPDATE ON "public"."inbox_labels" TO "service_role";
GRANT DELETE ON "public"."inbox_labels" TO "service_role";
GRANT TRUNCATE ON "public"."inbox_labels" TO "service_role";
GRANT REFERENCES ON "public"."inbox_labels" TO "service_role";
GRANT TRIGGER ON "public"."inbox_labels" TO "service_role";
GRANT MAINTAIN ON "public"."inbox_labels" TO "service_role";
GRANT INSERT ON "public"."inbox_labels" TO "authenticated";
GRANT SELECT ON "public"."inbox_labels" TO "authenticated";
GRANT UPDATE ON "public"."inbox_labels" TO "authenticated";
GRANT DELETE ON "public"."inbox_labels" TO "authenticated";
ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."integrations" TO "authenticated";
GRANT SELECT ON "public"."integrations" TO "authenticated";
GRANT UPDATE ON "public"."integrations" TO "authenticated";
GRANT DELETE ON "public"."integrations" TO "authenticated";
GRANT TRUNCATE ON "public"."integrations" TO "authenticated";
GRANT REFERENCES ON "public"."integrations" TO "authenticated";
GRANT TRIGGER ON "public"."integrations" TO "authenticated";
GRANT MAINTAIN ON "public"."integrations" TO "authenticated";
GRANT INSERT ON "public"."integrations" TO "service_role";
GRANT SELECT ON "public"."integrations" TO "service_role";
GRANT UPDATE ON "public"."integrations" TO "service_role";
GRANT DELETE ON "public"."integrations" TO "service_role";
GRANT TRUNCATE ON "public"."integrations" TO "service_role";
GRANT REFERENCES ON "public"."integrations" TO "service_role";
GRANT TRIGGER ON "public"."integrations" TO "service_role";
GRANT MAINTAIN ON "public"."integrations" TO "service_role";
ALTER TABLE "public"."lead_activities" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."lead_activities" TO "anon";
GRANT SELECT ON "public"."lead_activities" TO "anon";
GRANT UPDATE ON "public"."lead_activities" TO "anon";
GRANT DELETE ON "public"."lead_activities" TO "anon";
GRANT TRUNCATE ON "public"."lead_activities" TO "anon";
GRANT REFERENCES ON "public"."lead_activities" TO "anon";
GRANT TRIGGER ON "public"."lead_activities" TO "anon";
GRANT MAINTAIN ON "public"."lead_activities" TO "anon";
GRANT INSERT ON "public"."lead_activities" TO "authenticated";
GRANT SELECT ON "public"."lead_activities" TO "authenticated";
GRANT UPDATE ON "public"."lead_activities" TO "authenticated";
GRANT DELETE ON "public"."lead_activities" TO "authenticated";
GRANT TRUNCATE ON "public"."lead_activities" TO "authenticated";
GRANT REFERENCES ON "public"."lead_activities" TO "authenticated";
GRANT TRIGGER ON "public"."lead_activities" TO "authenticated";
GRANT MAINTAIN ON "public"."lead_activities" TO "authenticated";
GRANT INSERT ON "public"."lead_activities" TO "service_role";
GRANT SELECT ON "public"."lead_activities" TO "service_role";
GRANT UPDATE ON "public"."lead_activities" TO "service_role";
GRANT DELETE ON "public"."lead_activities" TO "service_role";
GRANT TRUNCATE ON "public"."lead_activities" TO "service_role";
GRANT REFERENCES ON "public"."lead_activities" TO "service_role";
GRANT TRIGGER ON "public"."lead_activities" TO "service_role";
GRANT MAINTAIN ON "public"."lead_activities" TO "service_role";
ALTER TABLE "public"."lead_custom_field_values" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."lead_custom_field_values" TO "service_role";
GRANT SELECT ON "public"."lead_custom_field_values" TO "service_role";
GRANT UPDATE ON "public"."lead_custom_field_values" TO "service_role";
GRANT DELETE ON "public"."lead_custom_field_values" TO "service_role";
GRANT TRUNCATE ON "public"."lead_custom_field_values" TO "service_role";
GRANT REFERENCES ON "public"."lead_custom_field_values" TO "service_role";
GRANT TRIGGER ON "public"."lead_custom_field_values" TO "service_role";
GRANT MAINTAIN ON "public"."lead_custom_field_values" TO "service_role";
GRANT INSERT ON "public"."lead_custom_field_values" TO "authenticated";
GRANT SELECT ON "public"."lead_custom_field_values" TO "authenticated";
GRANT UPDATE ON "public"."lead_custom_field_values" TO "authenticated";
GRANT DELETE ON "public"."lead_custom_field_values" TO "authenticated";
ALTER TABLE "public"."lead_custom_fields" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."lead_custom_fields" TO "service_role";
GRANT SELECT ON "public"."lead_custom_fields" TO "service_role";
GRANT UPDATE ON "public"."lead_custom_fields" TO "service_role";
GRANT DELETE ON "public"."lead_custom_fields" TO "service_role";
GRANT TRUNCATE ON "public"."lead_custom_fields" TO "service_role";
GRANT REFERENCES ON "public"."lead_custom_fields" TO "service_role";
GRANT TRIGGER ON "public"."lead_custom_fields" TO "service_role";
GRANT MAINTAIN ON "public"."lead_custom_fields" TO "service_role";
GRANT INSERT ON "public"."lead_custom_fields" TO "authenticated";
GRANT SELECT ON "public"."lead_custom_fields" TO "authenticated";
GRANT UPDATE ON "public"."lead_custom_fields" TO "authenticated";
GRANT DELETE ON "public"."lead_custom_fields" TO "authenticated";
ALTER TABLE "public"."lead_dedupe_dismissals" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."lead_dedupe_dismissals" TO "anon";
GRANT SELECT ON "public"."lead_dedupe_dismissals" TO "anon";
GRANT UPDATE ON "public"."lead_dedupe_dismissals" TO "anon";
GRANT DELETE ON "public"."lead_dedupe_dismissals" TO "anon";
GRANT TRUNCATE ON "public"."lead_dedupe_dismissals" TO "anon";
GRANT REFERENCES ON "public"."lead_dedupe_dismissals" TO "anon";
GRANT TRIGGER ON "public"."lead_dedupe_dismissals" TO "anon";
GRANT MAINTAIN ON "public"."lead_dedupe_dismissals" TO "anon";
GRANT INSERT ON "public"."lead_dedupe_dismissals" TO "authenticated";
GRANT SELECT ON "public"."lead_dedupe_dismissals" TO "authenticated";
GRANT UPDATE ON "public"."lead_dedupe_dismissals" TO "authenticated";
GRANT DELETE ON "public"."lead_dedupe_dismissals" TO "authenticated";
GRANT TRUNCATE ON "public"."lead_dedupe_dismissals" TO "authenticated";
GRANT REFERENCES ON "public"."lead_dedupe_dismissals" TO "authenticated";
GRANT TRIGGER ON "public"."lead_dedupe_dismissals" TO "authenticated";
GRANT MAINTAIN ON "public"."lead_dedupe_dismissals" TO "authenticated";
GRANT INSERT ON "public"."lead_dedupe_dismissals" TO "service_role";
GRANT SELECT ON "public"."lead_dedupe_dismissals" TO "service_role";
GRANT UPDATE ON "public"."lead_dedupe_dismissals" TO "service_role";
GRANT DELETE ON "public"."lead_dedupe_dismissals" TO "service_role";
GRANT TRUNCATE ON "public"."lead_dedupe_dismissals" TO "service_role";
GRANT REFERENCES ON "public"."lead_dedupe_dismissals" TO "service_role";
GRANT TRIGGER ON "public"."lead_dedupe_dismissals" TO "service_role";
GRANT MAINTAIN ON "public"."lead_dedupe_dismissals" TO "service_role";
ALTER TABLE "public"."lead_products" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."lead_products" TO "anon";
GRANT SELECT ON "public"."lead_products" TO "anon";
GRANT UPDATE ON "public"."lead_products" TO "anon";
GRANT DELETE ON "public"."lead_products" TO "anon";
GRANT TRUNCATE ON "public"."lead_products" TO "anon";
GRANT REFERENCES ON "public"."lead_products" TO "anon";
GRANT TRIGGER ON "public"."lead_products" TO "anon";
GRANT MAINTAIN ON "public"."lead_products" TO "anon";
GRANT INSERT ON "public"."lead_products" TO "authenticated";
GRANT SELECT ON "public"."lead_products" TO "authenticated";
GRANT UPDATE ON "public"."lead_products" TO "authenticated";
GRANT DELETE ON "public"."lead_products" TO "authenticated";
GRANT TRUNCATE ON "public"."lead_products" TO "authenticated";
GRANT REFERENCES ON "public"."lead_products" TO "authenticated";
GRANT TRIGGER ON "public"."lead_products" TO "authenticated";
GRANT MAINTAIN ON "public"."lead_products" TO "authenticated";
GRANT INSERT ON "public"."lead_products" TO "service_role";
GRANT SELECT ON "public"."lead_products" TO "service_role";
GRANT UPDATE ON "public"."lead_products" TO "service_role";
GRANT DELETE ON "public"."lead_products" TO "service_role";
GRANT TRUNCATE ON "public"."lead_products" TO "service_role";
GRANT REFERENCES ON "public"."lead_products" TO "service_role";
GRANT TRIGGER ON "public"."lead_products" TO "service_role";
GRANT MAINTAIN ON "public"."lead_products" TO "service_role";
ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."leads" TO "anon";
GRANT SELECT ON "public"."leads" TO "anon";
GRANT UPDATE ON "public"."leads" TO "anon";
GRANT DELETE ON "public"."leads" TO "anon";
GRANT TRUNCATE ON "public"."leads" TO "anon";
GRANT REFERENCES ON "public"."leads" TO "anon";
GRANT TRIGGER ON "public"."leads" TO "anon";
GRANT MAINTAIN ON "public"."leads" TO "anon";
GRANT INSERT ON "public"."leads" TO "authenticated";
GRANT SELECT ON "public"."leads" TO "authenticated";
GRANT UPDATE ON "public"."leads" TO "authenticated";
GRANT DELETE ON "public"."leads" TO "authenticated";
GRANT TRUNCATE ON "public"."leads" TO "authenticated";
GRANT REFERENCES ON "public"."leads" TO "authenticated";
GRANT TRIGGER ON "public"."leads" TO "authenticated";
GRANT MAINTAIN ON "public"."leads" TO "authenticated";
GRANT INSERT ON "public"."leads" TO "service_role";
GRANT SELECT ON "public"."leads" TO "service_role";
GRANT UPDATE ON "public"."leads" TO "service_role";
GRANT DELETE ON "public"."leads" TO "service_role";
GRANT TRUNCATE ON "public"."leads" TO "service_role";
GRANT REFERENCES ON "public"."leads" TO "service_role";
GRANT TRIGGER ON "public"."leads" TO "service_role";
GRANT MAINTAIN ON "public"."leads" TO "service_role";
ALTER TABLE "public"."marcos_tutorial_lessons" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."marcos_tutorial_lessons" TO "service_role";
GRANT SELECT ON "public"."marcos_tutorial_lessons" TO "service_role";
GRANT UPDATE ON "public"."marcos_tutorial_lessons" TO "service_role";
GRANT DELETE ON "public"."marcos_tutorial_lessons" TO "service_role";
GRANT TRUNCATE ON "public"."marcos_tutorial_lessons" TO "service_role";
GRANT REFERENCES ON "public"."marcos_tutorial_lessons" TO "service_role";
GRANT TRIGGER ON "public"."marcos_tutorial_lessons" TO "service_role";
GRANT MAINTAIN ON "public"."marcos_tutorial_lessons" TO "service_role";
GRANT INSERT ON "public"."marcos_tutorial_lessons" TO "authenticated";
GRANT SELECT ON "public"."marcos_tutorial_lessons" TO "authenticated";
GRANT UPDATE ON "public"."marcos_tutorial_lessons" TO "authenticated";
GRANT DELETE ON "public"."marcos_tutorial_lessons" TO "authenticated";
ALTER TABLE "public"."marcos_tutorial_modules" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."marcos_tutorial_modules" TO "service_role";
GRANT SELECT ON "public"."marcos_tutorial_modules" TO "service_role";
GRANT UPDATE ON "public"."marcos_tutorial_modules" TO "service_role";
GRANT DELETE ON "public"."marcos_tutorial_modules" TO "service_role";
GRANT TRUNCATE ON "public"."marcos_tutorial_modules" TO "service_role";
GRANT REFERENCES ON "public"."marcos_tutorial_modules" TO "service_role";
GRANT TRIGGER ON "public"."marcos_tutorial_modules" TO "service_role";
GRANT MAINTAIN ON "public"."marcos_tutorial_modules" TO "service_role";
GRANT INSERT ON "public"."marcos_tutorial_modules" TO "authenticated";
GRANT SELECT ON "public"."marcos_tutorial_modules" TO "authenticated";
GRANT UPDATE ON "public"."marcos_tutorial_modules" TO "authenticated";
GRANT DELETE ON "public"."marcos_tutorial_modules" TO "authenticated";
ALTER TABLE "public"."module_permissions" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."module_permissions" TO "anon";
GRANT SELECT ON "public"."module_permissions" TO "anon";
GRANT UPDATE ON "public"."module_permissions" TO "anon";
GRANT DELETE ON "public"."module_permissions" TO "anon";
GRANT TRUNCATE ON "public"."module_permissions" TO "anon";
GRANT REFERENCES ON "public"."module_permissions" TO "anon";
GRANT TRIGGER ON "public"."module_permissions" TO "anon";
GRANT MAINTAIN ON "public"."module_permissions" TO "anon";
GRANT INSERT ON "public"."module_permissions" TO "authenticated";
GRANT SELECT ON "public"."module_permissions" TO "authenticated";
GRANT UPDATE ON "public"."module_permissions" TO "authenticated";
GRANT DELETE ON "public"."module_permissions" TO "authenticated";
GRANT TRUNCATE ON "public"."module_permissions" TO "authenticated";
GRANT REFERENCES ON "public"."module_permissions" TO "authenticated";
GRANT TRIGGER ON "public"."module_permissions" TO "authenticated";
GRANT MAINTAIN ON "public"."module_permissions" TO "authenticated";
GRANT INSERT ON "public"."module_permissions" TO "service_role";
GRANT SELECT ON "public"."module_permissions" TO "service_role";
GRANT UPDATE ON "public"."module_permissions" TO "service_role";
GRANT DELETE ON "public"."module_permissions" TO "service_role";
GRANT TRUNCATE ON "public"."module_permissions" TO "service_role";
GRANT REFERENCES ON "public"."module_permissions" TO "service_role";
GRANT TRIGGER ON "public"."module_permissions" TO "service_role";
GRANT MAINTAIN ON "public"."module_permissions" TO "service_role";
ALTER TABLE "public"."permission_templates" ENABLE ROW LEVEL SECURITY;

COMMIT;
SELECT '28-access.sql' AS migration_batch,'OK' AS result;


-- 29-access.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
GRANT INSERT ON "public"."permission_templates" TO "anon";
GRANT SELECT ON "public"."permission_templates" TO "anon";
GRANT UPDATE ON "public"."permission_templates" TO "anon";
GRANT DELETE ON "public"."permission_templates" TO "anon";
GRANT TRUNCATE ON "public"."permission_templates" TO "anon";
GRANT REFERENCES ON "public"."permission_templates" TO "anon";
GRANT TRIGGER ON "public"."permission_templates" TO "anon";
GRANT MAINTAIN ON "public"."permission_templates" TO "anon";
GRANT INSERT ON "public"."permission_templates" TO "authenticated";
GRANT SELECT ON "public"."permission_templates" TO "authenticated";
GRANT UPDATE ON "public"."permission_templates" TO "authenticated";
GRANT DELETE ON "public"."permission_templates" TO "authenticated";
GRANT TRUNCATE ON "public"."permission_templates" TO "authenticated";
GRANT REFERENCES ON "public"."permission_templates" TO "authenticated";
GRANT TRIGGER ON "public"."permission_templates" TO "authenticated";
GRANT MAINTAIN ON "public"."permission_templates" TO "authenticated";
GRANT INSERT ON "public"."permission_templates" TO "service_role";
GRANT SELECT ON "public"."permission_templates" TO "service_role";
GRANT UPDATE ON "public"."permission_templates" TO "service_role";
GRANT DELETE ON "public"."permission_templates" TO "service_role";
GRANT TRUNCATE ON "public"."permission_templates" TO "service_role";
GRANT REFERENCES ON "public"."permission_templates" TO "service_role";
GRANT TRIGGER ON "public"."permission_templates" TO "service_role";
GRANT MAINTAIN ON "public"."permission_templates" TO "service_role";
ALTER TABLE "public"."pipeline_stages" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."pipeline_stages" TO "anon";
GRANT SELECT ON "public"."pipeline_stages" TO "anon";
GRANT UPDATE ON "public"."pipeline_stages" TO "anon";
GRANT DELETE ON "public"."pipeline_stages" TO "anon";
GRANT TRUNCATE ON "public"."pipeline_stages" TO "anon";
GRANT REFERENCES ON "public"."pipeline_stages" TO "anon";
GRANT TRIGGER ON "public"."pipeline_stages" TO "anon";
GRANT MAINTAIN ON "public"."pipeline_stages" TO "anon";
GRANT INSERT ON "public"."pipeline_stages" TO "authenticated";
GRANT SELECT ON "public"."pipeline_stages" TO "authenticated";
GRANT UPDATE ON "public"."pipeline_stages" TO "authenticated";
GRANT DELETE ON "public"."pipeline_stages" TO "authenticated";
GRANT TRUNCATE ON "public"."pipeline_stages" TO "authenticated";
GRANT REFERENCES ON "public"."pipeline_stages" TO "authenticated";
GRANT TRIGGER ON "public"."pipeline_stages" TO "authenticated";
GRANT MAINTAIN ON "public"."pipeline_stages" TO "authenticated";
GRANT INSERT ON "public"."pipeline_stages" TO "service_role";
GRANT SELECT ON "public"."pipeline_stages" TO "service_role";
GRANT UPDATE ON "public"."pipeline_stages" TO "service_role";
GRANT DELETE ON "public"."pipeline_stages" TO "service_role";
GRANT TRUNCATE ON "public"."pipeline_stages" TO "service_role";
GRANT REFERENCES ON "public"."pipeline_stages" TO "service_role";
GRANT TRIGGER ON "public"."pipeline_stages" TO "service_role";
GRANT MAINTAIN ON "public"."pipeline_stages" TO "service_role";
ALTER TABLE "public"."pipelines" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."pipelines" TO "anon";
GRANT SELECT ON "public"."pipelines" TO "anon";
GRANT UPDATE ON "public"."pipelines" TO "anon";
GRANT DELETE ON "public"."pipelines" TO "anon";
GRANT TRUNCATE ON "public"."pipelines" TO "anon";
GRANT REFERENCES ON "public"."pipelines" TO "anon";
GRANT TRIGGER ON "public"."pipelines" TO "anon";
GRANT MAINTAIN ON "public"."pipelines" TO "anon";
GRANT INSERT ON "public"."pipelines" TO "authenticated";
GRANT SELECT ON "public"."pipelines" TO "authenticated";
GRANT UPDATE ON "public"."pipelines" TO "authenticated";
GRANT DELETE ON "public"."pipelines" TO "authenticated";
GRANT TRUNCATE ON "public"."pipelines" TO "authenticated";
GRANT REFERENCES ON "public"."pipelines" TO "authenticated";
GRANT TRIGGER ON "public"."pipelines" TO "authenticated";
GRANT MAINTAIN ON "public"."pipelines" TO "authenticated";
GRANT INSERT ON "public"."pipelines" TO "service_role";
GRANT SELECT ON "public"."pipelines" TO "service_role";
GRANT UPDATE ON "public"."pipelines" TO "service_role";
GRANT DELETE ON "public"."pipelines" TO "service_role";
GRANT TRUNCATE ON "public"."pipelines" TO "service_role";
GRANT REFERENCES ON "public"."pipelines" TO "service_role";
GRANT TRIGGER ON "public"."pipelines" TO "service_role";
GRANT MAINTAIN ON "public"."pipelines" TO "service_role";
ALTER TABLE "public"."product_catalogs" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."product_catalogs" TO "anon";
GRANT SELECT ON "public"."product_catalogs" TO "anon";
GRANT UPDATE ON "public"."product_catalogs" TO "anon";
GRANT DELETE ON "public"."product_catalogs" TO "anon";
GRANT TRUNCATE ON "public"."product_catalogs" TO "anon";
GRANT REFERENCES ON "public"."product_catalogs" TO "anon";
GRANT TRIGGER ON "public"."product_catalogs" TO "anon";
GRANT MAINTAIN ON "public"."product_catalogs" TO "anon";
GRANT INSERT ON "public"."product_catalogs" TO "authenticated";
GRANT SELECT ON "public"."product_catalogs" TO "authenticated";
GRANT UPDATE ON "public"."product_catalogs" TO "authenticated";
GRANT DELETE ON "public"."product_catalogs" TO "authenticated";
GRANT TRUNCATE ON "public"."product_catalogs" TO "authenticated";
GRANT REFERENCES ON "public"."product_catalogs" TO "authenticated";
GRANT TRIGGER ON "public"."product_catalogs" TO "authenticated";
GRANT MAINTAIN ON "public"."product_catalogs" TO "authenticated";
GRANT INSERT ON "public"."product_catalogs" TO "service_role";
GRANT SELECT ON "public"."product_catalogs" TO "service_role";
GRANT UPDATE ON "public"."product_catalogs" TO "service_role";
GRANT DELETE ON "public"."product_catalogs" TO "service_role";
GRANT TRUNCATE ON "public"."product_catalogs" TO "service_role";
GRANT REFERENCES ON "public"."product_catalogs" TO "service_role";
GRANT TRIGGER ON "public"."product_catalogs" TO "service_role";
GRANT MAINTAIN ON "public"."product_catalogs" TO "service_role";
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."products" TO "anon";
GRANT SELECT ON "public"."products" TO "anon";
GRANT UPDATE ON "public"."products" TO "anon";
GRANT DELETE ON "public"."products" TO "anon";
GRANT TRUNCATE ON "public"."products" TO "anon";
GRANT REFERENCES ON "public"."products" TO "anon";
GRANT TRIGGER ON "public"."products" TO "anon";
GRANT MAINTAIN ON "public"."products" TO "anon";
GRANT INSERT ON "public"."products" TO "authenticated";
GRANT SELECT ON "public"."products" TO "authenticated";
GRANT UPDATE ON "public"."products" TO "authenticated";
GRANT DELETE ON "public"."products" TO "authenticated";
GRANT TRUNCATE ON "public"."products" TO "authenticated";
GRANT REFERENCES ON "public"."products" TO "authenticated";
GRANT TRIGGER ON "public"."products" TO "authenticated";
GRANT MAINTAIN ON "public"."products" TO "authenticated";
GRANT INSERT ON "public"."products" TO "service_role";
GRANT SELECT ON "public"."products" TO "service_role";
GRANT UPDATE ON "public"."products" TO "service_role";
GRANT DELETE ON "public"."products" TO "service_role";
GRANT TRUNCATE ON "public"."products" TO "service_role";
GRANT REFERENCES ON "public"."products" TO "service_role";
GRANT TRIGGER ON "public"."products" TO "service_role";
GRANT MAINTAIN ON "public"."products" TO "service_role";
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."profiles" TO "anon";
GRANT SELECT ON "public"."profiles" TO "anon";
GRANT UPDATE ON "public"."profiles" TO "anon";
GRANT DELETE ON "public"."profiles" TO "anon";
GRANT TRUNCATE ON "public"."profiles" TO "anon";
GRANT REFERENCES ON "public"."profiles" TO "anon";
GRANT TRIGGER ON "public"."profiles" TO "anon";
GRANT MAINTAIN ON "public"."profiles" TO "anon";
GRANT INSERT ON "public"."profiles" TO "authenticated";
GRANT SELECT ON "public"."profiles" TO "authenticated";
GRANT UPDATE ON "public"."profiles" TO "authenticated";
GRANT DELETE ON "public"."profiles" TO "authenticated";
GRANT TRUNCATE ON "public"."profiles" TO "authenticated";
GRANT REFERENCES ON "public"."profiles" TO "authenticated";
GRANT TRIGGER ON "public"."profiles" TO "authenticated";
GRANT MAINTAIN ON "public"."profiles" TO "authenticated";
GRANT INSERT ON "public"."profiles" TO "service_role";
GRANT SELECT ON "public"."profiles" TO "service_role";
GRANT UPDATE ON "public"."profiles" TO "service_role";
GRANT DELETE ON "public"."profiles" TO "service_role";
GRANT TRUNCATE ON "public"."profiles" TO "service_role";
GRANT REFERENCES ON "public"."profiles" TO "service_role";
GRANT TRIGGER ON "public"."profiles" TO "service_role";
GRANT MAINTAIN ON "public"."profiles" TO "service_role";
ALTER TABLE "public"."salesbot_blocks" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."salesbot_blocks" TO "anon";
GRANT SELECT ON "public"."salesbot_blocks" TO "anon";
GRANT UPDATE ON "public"."salesbot_blocks" TO "anon";
GRANT DELETE ON "public"."salesbot_blocks" TO "anon";
GRANT TRUNCATE ON "public"."salesbot_blocks" TO "anon";
GRANT REFERENCES ON "public"."salesbot_blocks" TO "anon";
GRANT TRIGGER ON "public"."salesbot_blocks" TO "anon";
GRANT MAINTAIN ON "public"."salesbot_blocks" TO "anon";
GRANT INSERT ON "public"."salesbot_blocks" TO "authenticated";
GRANT SELECT ON "public"."salesbot_blocks" TO "authenticated";
GRANT UPDATE ON "public"."salesbot_blocks" TO "authenticated";
GRANT DELETE ON "public"."salesbot_blocks" TO "authenticated";
GRANT TRUNCATE ON "public"."salesbot_blocks" TO "authenticated";
GRANT REFERENCES ON "public"."salesbot_blocks" TO "authenticated";
GRANT TRIGGER ON "public"."salesbot_blocks" TO "authenticated";
GRANT MAINTAIN ON "public"."salesbot_blocks" TO "authenticated";
GRANT INSERT ON "public"."salesbot_blocks" TO "service_role";
GRANT SELECT ON "public"."salesbot_blocks" TO "service_role";
GRANT UPDATE ON "public"."salesbot_blocks" TO "service_role";
GRANT DELETE ON "public"."salesbot_blocks" TO "service_role";
GRANT TRUNCATE ON "public"."salesbot_blocks" TO "service_role";
GRANT REFERENCES ON "public"."salesbot_blocks" TO "service_role";
GRANT TRIGGER ON "public"."salesbot_blocks" TO "service_role";
GRANT MAINTAIN ON "public"."salesbot_blocks" TO "service_role";
ALTER TABLE "public"."salesbot_revisions" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."salesbot_revisions" TO "anon";
GRANT SELECT ON "public"."salesbot_revisions" TO "anon";
GRANT UPDATE ON "public"."salesbot_revisions" TO "anon";
GRANT DELETE ON "public"."salesbot_revisions" TO "anon";
GRANT TRUNCATE ON "public"."salesbot_revisions" TO "anon";
GRANT REFERENCES ON "public"."salesbot_revisions" TO "anon";
GRANT TRIGGER ON "public"."salesbot_revisions" TO "anon";
GRANT MAINTAIN ON "public"."salesbot_revisions" TO "anon";
GRANT INSERT ON "public"."salesbot_revisions" TO "authenticated";
GRANT SELECT ON "public"."salesbot_revisions" TO "authenticated";
GRANT UPDATE ON "public"."salesbot_revisions" TO "authenticated";
GRANT DELETE ON "public"."salesbot_revisions" TO "authenticated";
GRANT TRUNCATE ON "public"."salesbot_revisions" TO "authenticated";
GRANT REFERENCES ON "public"."salesbot_revisions" TO "authenticated";
GRANT TRIGGER ON "public"."salesbot_revisions" TO "authenticated";
GRANT MAINTAIN ON "public"."salesbot_revisions" TO "authenticated";
GRANT INSERT ON "public"."salesbot_revisions" TO "service_role";
GRANT SELECT ON "public"."salesbot_revisions" TO "service_role";
GRANT UPDATE ON "public"."salesbot_revisions" TO "service_role";
GRANT DELETE ON "public"."salesbot_revisions" TO "service_role";
GRANT TRUNCATE ON "public"."salesbot_revisions" TO "service_role";
GRANT REFERENCES ON "public"."salesbot_revisions" TO "service_role";
GRANT TRIGGER ON "public"."salesbot_revisions" TO "service_role";
GRANT MAINTAIN ON "public"."salesbot_revisions" TO "service_role";
ALTER TABLE "public"."salesbot_round_robin_state" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."salesbot_round_robin_state" TO "service_role";
GRANT SELECT ON "public"."salesbot_round_robin_state" TO "service_role";
GRANT UPDATE ON "public"."salesbot_round_robin_state" TO "service_role";
GRANT DELETE ON "public"."salesbot_round_robin_state" TO "service_role";
GRANT TRUNCATE ON "public"."salesbot_round_robin_state" TO "service_role";
GRANT REFERENCES ON "public"."salesbot_round_robin_state" TO "service_role";
GRANT TRIGGER ON "public"."salesbot_round_robin_state" TO "service_role";
GRANT MAINTAIN ON "public"."salesbot_round_robin_state" TO "service_role";
ALTER TABLE "public"."salesbot_run_logs" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."salesbot_run_logs" TO "service_role";
GRANT SELECT ON "public"."salesbot_run_logs" TO "service_role";
GRANT UPDATE ON "public"."salesbot_run_logs" TO "service_role";
GRANT DELETE ON "public"."salesbot_run_logs" TO "service_role";
GRANT TRUNCATE ON "public"."salesbot_run_logs" TO "service_role";
GRANT REFERENCES ON "public"."salesbot_run_logs" TO "service_role";
GRANT TRIGGER ON "public"."salesbot_run_logs" TO "service_role";
GRANT MAINTAIN ON "public"."salesbot_run_logs" TO "service_role";
GRANT SELECT ON "public"."salesbot_run_logs" TO "authenticated";
ALTER TABLE "public"."salesbot_runs" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."salesbot_runs" TO "service_role";
GRANT SELECT ON "public"."salesbot_runs" TO "service_role";
GRANT UPDATE ON "public"."salesbot_runs" TO "service_role";
GRANT DELETE ON "public"."salesbot_runs" TO "service_role";
GRANT TRUNCATE ON "public"."salesbot_runs" TO "service_role";
GRANT REFERENCES ON "public"."salesbot_runs" TO "service_role";
GRANT TRIGGER ON "public"."salesbot_runs" TO "service_role";
GRANT MAINTAIN ON "public"."salesbot_runs" TO "service_role";
GRANT SELECT ON "public"."salesbot_runs" TO "authenticated";
ALTER TABLE "public"."salesbots" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."salesbots" TO "anon";
GRANT SELECT ON "public"."salesbots" TO "anon";
GRANT UPDATE ON "public"."salesbots" TO "anon";
GRANT DELETE ON "public"."salesbots" TO "anon";
GRANT TRUNCATE ON "public"."salesbots" TO "anon";
GRANT REFERENCES ON "public"."salesbots" TO "anon";
GRANT TRIGGER ON "public"."salesbots" TO "anon";
GRANT MAINTAIN ON "public"."salesbots" TO "anon";
GRANT INSERT ON "public"."salesbots" TO "authenticated";
GRANT SELECT ON "public"."salesbots" TO "authenticated";
GRANT UPDATE ON "public"."salesbots" TO "authenticated";
GRANT DELETE ON "public"."salesbots" TO "authenticated";
GRANT TRUNCATE ON "public"."salesbots" TO "authenticated";
GRANT REFERENCES ON "public"."salesbots" TO "authenticated";
GRANT TRIGGER ON "public"."salesbots" TO "authenticated";
GRANT MAINTAIN ON "public"."salesbots" TO "authenticated";
GRANT INSERT ON "public"."salesbots" TO "service_role";
GRANT SELECT ON "public"."salesbots" TO "service_role";
GRANT UPDATE ON "public"."salesbots" TO "service_role";
GRANT DELETE ON "public"."salesbots" TO "service_role";
GRANT TRUNCATE ON "public"."salesbots" TO "service_role";
GRANT REFERENCES ON "public"."salesbots" TO "service_role";
GRANT TRIGGER ON "public"."salesbots" TO "service_role";
GRANT MAINTAIN ON "public"."salesbots" TO "service_role";
ALTER TABLE "public"."slim_audience_campaigns" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."slim_audience_campaigns" TO "service_role";
GRANT SELECT ON "public"."slim_audience_campaigns" TO "service_role";
GRANT UPDATE ON "public"."slim_audience_campaigns" TO "service_role";
GRANT DELETE ON "public"."slim_audience_campaigns" TO "service_role";
GRANT TRUNCATE ON "public"."slim_audience_campaigns" TO "service_role";
GRANT REFERENCES ON "public"."slim_audience_campaigns" TO "service_role";
GRANT TRIGGER ON "public"."slim_audience_campaigns" TO "service_role";
GRANT MAINTAIN ON "public"."slim_audience_campaigns" TO "service_role";
GRANT SELECT ON "public"."slim_audience_campaigns" TO "authenticated";
ALTER TABLE "public"."slim_audience_deliveries" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."slim_audience_deliveries" TO "service_role";
GRANT SELECT ON "public"."slim_audience_deliveries" TO "service_role";
GRANT UPDATE ON "public"."slim_audience_deliveries" TO "service_role";
GRANT DELETE ON "public"."slim_audience_deliveries" TO "service_role";
GRANT TRUNCATE ON "public"."slim_audience_deliveries" TO "service_role";
GRANT REFERENCES ON "public"."slim_audience_deliveries" TO "service_role";
GRANT TRIGGER ON "public"."slim_audience_deliveries" TO "service_role";
GRANT MAINTAIN ON "public"."slim_audience_deliveries" TO "service_role";
GRANT SELECT ON "public"."slim_audience_deliveries" TO "authenticated";
ALTER TABLE "public"."slim_checkout_attempt_closures" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."slim_checkout_attempt_closures" TO "service_role";
GRANT SELECT ON "public"."slim_checkout_attempt_closures" TO "service_role";
GRANT UPDATE ON "public"."slim_checkout_attempt_closures" TO "service_role";
GRANT DELETE ON "public"."slim_checkout_attempt_closures" TO "service_role";
GRANT TRUNCATE ON "public"."slim_checkout_attempt_closures" TO "service_role";
GRANT REFERENCES ON "public"."slim_checkout_attempt_closures" TO "service_role";
GRANT TRIGGER ON "public"."slim_checkout_attempt_closures" TO "service_role";
GRANT MAINTAIN ON "public"."slim_checkout_attempt_closures" TO "service_role";
GRANT INSERT ON "public"."slim_checkout_attempt_closures" TO "authenticated";
GRANT SELECT ON "public"."slim_checkout_attempt_closures" TO "authenticated";
ALTER TABLE "public"."slim_order_changes" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."slim_order_changes" TO "service_role";
GRANT SELECT ON "public"."slim_order_changes" TO "service_role";
GRANT UPDATE ON "public"."slim_order_changes" TO "service_role";
GRANT DELETE ON "public"."slim_order_changes" TO "service_role";
GRANT TRUNCATE ON "public"."slim_order_changes" TO "service_role";
GRANT REFERENCES ON "public"."slim_order_changes" TO "service_role";
GRANT TRIGGER ON "public"."slim_order_changes" TO "service_role";
GRANT MAINTAIN ON "public"."slim_order_changes" TO "service_role";
GRANT SELECT ON "public"."slim_order_changes" TO "authenticated";
ALTER TABLE "public"."slim_order_document_deliveries" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."slim_order_document_deliveries" TO "service_role";
GRANT SELECT ON "public"."slim_order_document_deliveries" TO "service_role";
GRANT UPDATE ON "public"."slim_order_document_deliveries" TO "service_role";
GRANT DELETE ON "public"."slim_order_document_deliveries" TO "service_role";
GRANT TRUNCATE ON "public"."slim_order_document_deliveries" TO "service_role";
GRANT REFERENCES ON "public"."slim_order_document_deliveries" TO "service_role";
GRANT TRIGGER ON "public"."slim_order_document_deliveries" TO "service_role";
GRANT MAINTAIN ON "public"."slim_order_document_deliveries" TO "service_role";
GRANT SELECT ON "public"."slim_order_document_deliveries" TO "authenticated";
ALTER TABLE "public"."slim_order_documents" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."slim_order_documents" TO "service_role";
GRANT SELECT ON "public"."slim_order_documents" TO "service_role";
GRANT UPDATE ON "public"."slim_order_documents" TO "service_role";
GRANT DELETE ON "public"."slim_order_documents" TO "service_role";
GRANT TRUNCATE ON "public"."slim_order_documents" TO "service_role";
GRANT REFERENCES ON "public"."slim_order_documents" TO "service_role";
GRANT TRIGGER ON "public"."slim_order_documents" TO "service_role";
GRANT MAINTAIN ON "public"."slim_order_documents" TO "service_role";
GRANT SELECT ON "public"."slim_order_documents" TO "authenticated";
ALTER TABLE "public"."slim_orders" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."slim_orders" TO "service_role";
GRANT SELECT ON "public"."slim_orders" TO "service_role";
GRANT UPDATE ON "public"."slim_orders" TO "service_role";
GRANT DELETE ON "public"."slim_orders" TO "service_role";
GRANT TRUNCATE ON "public"."slim_orders" TO "service_role";

COMMIT;
SELECT '29-access.sql' AS migration_batch,'OK' AS result;


-- 30-access.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
GRANT REFERENCES ON "public"."slim_orders" TO "service_role";
GRANT TRIGGER ON "public"."slim_orders" TO "service_role";
GRANT MAINTAIN ON "public"."slim_orders" TO "service_role";
GRANT SELECT ON "public"."slim_orders" TO "authenticated";
ALTER TABLE "public"."slim_stage_move_events" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."slim_stage_move_events" TO "service_role";
GRANT SELECT ON "public"."slim_stage_move_events" TO "service_role";
GRANT UPDATE ON "public"."slim_stage_move_events" TO "service_role";
GRANT DELETE ON "public"."slim_stage_move_events" TO "service_role";
GRANT TRUNCATE ON "public"."slim_stage_move_events" TO "service_role";
GRANT REFERENCES ON "public"."slim_stage_move_events" TO "service_role";
GRANT TRIGGER ON "public"."slim_stage_move_events" TO "service_role";
GRANT MAINTAIN ON "public"."slim_stage_move_events" TO "service_role";
GRANT SELECT ON "public"."slim_stage_move_events" TO "authenticated";
ALTER TABLE "public"."slim_stock_movements" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."slim_stock_movements" TO "service_role";
GRANT SELECT ON "public"."slim_stock_movements" TO "service_role";
GRANT UPDATE ON "public"."slim_stock_movements" TO "service_role";
GRANT DELETE ON "public"."slim_stock_movements" TO "service_role";
GRANT TRUNCATE ON "public"."slim_stock_movements" TO "service_role";
GRANT REFERENCES ON "public"."slim_stock_movements" TO "service_role";
GRANT TRIGGER ON "public"."slim_stock_movements" TO "service_role";
GRANT MAINTAIN ON "public"."slim_stock_movements" TO "service_role";
GRANT SELECT ON "public"."slim_stock_movements" TO "authenticated";
ALTER TABLE "public"."supplier_product_costs" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."supplier_product_costs" TO "anon";
GRANT SELECT ON "public"."supplier_product_costs" TO "anon";
GRANT UPDATE ON "public"."supplier_product_costs" TO "anon";
GRANT DELETE ON "public"."supplier_product_costs" TO "anon";
GRANT TRUNCATE ON "public"."supplier_product_costs" TO "anon";
GRANT REFERENCES ON "public"."supplier_product_costs" TO "anon";
GRANT TRIGGER ON "public"."supplier_product_costs" TO "anon";
GRANT MAINTAIN ON "public"."supplier_product_costs" TO "anon";
GRANT INSERT ON "public"."supplier_product_costs" TO "authenticated";
GRANT SELECT ON "public"."supplier_product_costs" TO "authenticated";
GRANT UPDATE ON "public"."supplier_product_costs" TO "authenticated";
GRANT DELETE ON "public"."supplier_product_costs" TO "authenticated";
GRANT TRUNCATE ON "public"."supplier_product_costs" TO "authenticated";
GRANT REFERENCES ON "public"."supplier_product_costs" TO "authenticated";
GRANT TRIGGER ON "public"."supplier_product_costs" TO "authenticated";
GRANT MAINTAIN ON "public"."supplier_product_costs" TO "authenticated";
GRANT INSERT ON "public"."supplier_product_costs" TO "service_role";
GRANT SELECT ON "public"."supplier_product_costs" TO "service_role";
GRANT UPDATE ON "public"."supplier_product_costs" TO "service_role";
GRANT DELETE ON "public"."supplier_product_costs" TO "service_role";
GRANT TRUNCATE ON "public"."supplier_product_costs" TO "service_role";
GRANT REFERENCES ON "public"."supplier_product_costs" TO "service_role";
GRANT TRIGGER ON "public"."supplier_product_costs" TO "service_role";
GRANT MAINTAIN ON "public"."supplier_product_costs" TO "service_role";
ALTER TABLE "public"."support_robot_messages" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."support_robot_messages" TO "authenticated";
GRANT SELECT ON "public"."support_robot_messages" TO "authenticated";
GRANT UPDATE ON "public"."support_robot_messages" TO "authenticated";
GRANT DELETE ON "public"."support_robot_messages" TO "authenticated";
GRANT TRUNCATE ON "public"."support_robot_messages" TO "authenticated";
GRANT REFERENCES ON "public"."support_robot_messages" TO "authenticated";
GRANT TRIGGER ON "public"."support_robot_messages" TO "authenticated";
GRANT MAINTAIN ON "public"."support_robot_messages" TO "authenticated";
GRANT INSERT ON "public"."support_robot_messages" TO "service_role";
GRANT SELECT ON "public"."support_robot_messages" TO "service_role";
GRANT UPDATE ON "public"."support_robot_messages" TO "service_role";
GRANT DELETE ON "public"."support_robot_messages" TO "service_role";
GRANT TRUNCATE ON "public"."support_robot_messages" TO "service_role";
GRANT REFERENCES ON "public"."support_robot_messages" TO "service_role";
GRANT TRIGGER ON "public"."support_robot_messages" TO "service_role";
GRANT MAINTAIN ON "public"."support_robot_messages" TO "service_role";
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."tasks" TO "service_role";
GRANT SELECT ON "public"."tasks" TO "service_role";
GRANT UPDATE ON "public"."tasks" TO "service_role";
GRANT DELETE ON "public"."tasks" TO "service_role";
GRANT TRUNCATE ON "public"."tasks" TO "service_role";
GRANT REFERENCES ON "public"."tasks" TO "service_role";
GRANT TRIGGER ON "public"."tasks" TO "service_role";
GRANT MAINTAIN ON "public"."tasks" TO "service_role";
GRANT INSERT ON "public"."tasks" TO "authenticated";
GRANT SELECT ON "public"."tasks" TO "authenticated";
GRANT UPDATE ON "public"."tasks" TO "authenticated";
GRANT DELETE ON "public"."tasks" TO "authenticated";
ALTER TABLE "public"."team_chat_reads" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."team_chat_reads" TO "authenticated";
GRANT SELECT ON "public"."team_chat_reads" TO "authenticated";
GRANT UPDATE ON "public"."team_chat_reads" TO "authenticated";
GRANT DELETE ON "public"."team_chat_reads" TO "authenticated";
GRANT TRUNCATE ON "public"."team_chat_reads" TO "authenticated";
GRANT REFERENCES ON "public"."team_chat_reads" TO "authenticated";
GRANT TRIGGER ON "public"."team_chat_reads" TO "authenticated";
GRANT MAINTAIN ON "public"."team_chat_reads" TO "authenticated";
GRANT INSERT ON "public"."team_chat_reads" TO "service_role";
GRANT SELECT ON "public"."team_chat_reads" TO "service_role";
GRANT UPDATE ON "public"."team_chat_reads" TO "service_role";
GRANT DELETE ON "public"."team_chat_reads" TO "service_role";
GRANT TRUNCATE ON "public"."team_chat_reads" TO "service_role";
GRANT REFERENCES ON "public"."team_chat_reads" TO "service_role";
GRANT TRIGGER ON "public"."team_chat_reads" TO "service_role";
GRANT MAINTAIN ON "public"."team_chat_reads" TO "service_role";
ALTER TABLE "public"."team_messages" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."team_messages" TO "service_role";
GRANT SELECT ON "public"."team_messages" TO "service_role";
GRANT UPDATE ON "public"."team_messages" TO "service_role";
GRANT DELETE ON "public"."team_messages" TO "service_role";
GRANT TRUNCATE ON "public"."team_messages" TO "service_role";
GRANT REFERENCES ON "public"."team_messages" TO "service_role";
GRANT TRIGGER ON "public"."team_messages" TO "service_role";
GRANT MAINTAIN ON "public"."team_messages" TO "service_role";
GRANT INSERT ON "public"."team_messages" TO "authenticated";
GRANT SELECT ON "public"."team_messages" TO "authenticated";
GRANT DELETE ON "public"."team_messages" TO "authenticated";
ALTER TABLE "public"."tracking_conversion_events" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."tracking_conversion_events" TO "service_role";
GRANT SELECT ON "public"."tracking_conversion_events" TO "service_role";
GRANT UPDATE ON "public"."tracking_conversion_events" TO "service_role";
GRANT DELETE ON "public"."tracking_conversion_events" TO "service_role";
GRANT TRUNCATE ON "public"."tracking_conversion_events" TO "service_role";
GRANT REFERENCES ON "public"."tracking_conversion_events" TO "service_role";
GRANT TRIGGER ON "public"."tracking_conversion_events" TO "service_role";
GRANT MAINTAIN ON "public"."tracking_conversion_events" TO "service_role";
GRANT SELECT ON "public"."tracking_conversion_events" TO "authenticated";
ALTER TABLE "public"."tracking_events" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."tracking_events" TO "service_role";
GRANT SELECT ON "public"."tracking_events" TO "service_role";
GRANT UPDATE ON "public"."tracking_events" TO "service_role";
GRANT DELETE ON "public"."tracking_events" TO "service_role";
GRANT TRUNCATE ON "public"."tracking_events" TO "service_role";
GRANT REFERENCES ON "public"."tracking_events" TO "service_role";
GRANT TRIGGER ON "public"."tracking_events" TO "service_role";
GRANT MAINTAIN ON "public"."tracking_events" TO "service_role";
GRANT SELECT ON "public"."tracking_events" TO "authenticated";
ALTER TABLE "public"."tracking_sites" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."tracking_sites" TO "service_role";
GRANT SELECT ON "public"."tracking_sites" TO "service_role";
GRANT UPDATE ON "public"."tracking_sites" TO "service_role";
GRANT DELETE ON "public"."tracking_sites" TO "service_role";
GRANT TRUNCATE ON "public"."tracking_sites" TO "service_role";
GRANT REFERENCES ON "public"."tracking_sites" TO "service_role";
GRANT TRIGGER ON "public"."tracking_sites" TO "service_role";
GRANT MAINTAIN ON "public"."tracking_sites" TO "service_role";
GRANT SELECT ON "public"."tracking_sites" TO "authenticated";
GRANT DELETE ON "public"."tracking_sites" TO "authenticated";
ALTER TABLE "public"."tutorial_lessons" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."tutorial_lessons" TO "service_role";
GRANT SELECT ON "public"."tutorial_lessons" TO "service_role";
GRANT UPDATE ON "public"."tutorial_lessons" TO "service_role";
GRANT DELETE ON "public"."tutorial_lessons" TO "service_role";
GRANT TRUNCATE ON "public"."tutorial_lessons" TO "service_role";
GRANT REFERENCES ON "public"."tutorial_lessons" TO "service_role";
GRANT TRIGGER ON "public"."tutorial_lessons" TO "service_role";
GRANT MAINTAIN ON "public"."tutorial_lessons" TO "service_role";
GRANT INSERT ON "public"."tutorial_lessons" TO "authenticated";
GRANT SELECT ON "public"."tutorial_lessons" TO "authenticated";
GRANT UPDATE ON "public"."tutorial_lessons" TO "authenticated";
GRANT DELETE ON "public"."tutorial_lessons" TO "authenticated";
ALTER TABLE "public"."tutorial_modules" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."tutorial_modules" TO "service_role";
GRANT SELECT ON "public"."tutorial_modules" TO "service_role";
GRANT UPDATE ON "public"."tutorial_modules" TO "service_role";
GRANT DELETE ON "public"."tutorial_modules" TO "service_role";
GRANT TRUNCATE ON "public"."tutorial_modules" TO "service_role";
GRANT REFERENCES ON "public"."tutorial_modules" TO "service_role";
GRANT TRIGGER ON "public"."tutorial_modules" TO "service_role";
GRANT MAINTAIN ON "public"."tutorial_modules" TO "service_role";
GRANT INSERT ON "public"."tutorial_modules" TO "authenticated";
GRANT SELECT ON "public"."tutorial_modules" TO "authenticated";
GRANT UPDATE ON "public"."tutorial_modules" TO "authenticated";
GRANT DELETE ON "public"."tutorial_modules" TO "authenticated";
ALTER TABLE "public"."user_notification_settings" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."user_notification_settings" TO "anon";
GRANT SELECT ON "public"."user_notification_settings" TO "anon";
GRANT UPDATE ON "public"."user_notification_settings" TO "anon";
GRANT DELETE ON "public"."user_notification_settings" TO "anon";
GRANT TRUNCATE ON "public"."user_notification_settings" TO "anon";
GRANT REFERENCES ON "public"."user_notification_settings" TO "anon";
GRANT TRIGGER ON "public"."user_notification_settings" TO "anon";
GRANT MAINTAIN ON "public"."user_notification_settings" TO "anon";
GRANT INSERT ON "public"."user_notification_settings" TO "authenticated";
GRANT SELECT ON "public"."user_notification_settings" TO "authenticated";
GRANT UPDATE ON "public"."user_notification_settings" TO "authenticated";
GRANT DELETE ON "public"."user_notification_settings" TO "authenticated";
GRANT TRUNCATE ON "public"."user_notification_settings" TO "authenticated";
GRANT REFERENCES ON "public"."user_notification_settings" TO "authenticated";
GRANT TRIGGER ON "public"."user_notification_settings" TO "authenticated";
GRANT MAINTAIN ON "public"."user_notification_settings" TO "authenticated";
GRANT INSERT ON "public"."user_notification_settings" TO "service_role";
GRANT SELECT ON "public"."user_notification_settings" TO "service_role";
GRANT UPDATE ON "public"."user_notification_settings" TO "service_role";
GRANT DELETE ON "public"."user_notification_settings" TO "service_role";
GRANT TRUNCATE ON "public"."user_notification_settings" TO "service_role";
GRANT REFERENCES ON "public"."user_notification_settings" TO "service_role";
GRANT TRIGGER ON "public"."user_notification_settings" TO "service_role";
GRANT MAINTAIN ON "public"."user_notification_settings" TO "service_role";
ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."user_permissions" TO "anon";
GRANT SELECT ON "public"."user_permissions" TO "anon";
GRANT UPDATE ON "public"."user_permissions" TO "anon";
GRANT DELETE ON "public"."user_permissions" TO "anon";
GRANT TRUNCATE ON "public"."user_permissions" TO "anon";
GRANT REFERENCES ON "public"."user_permissions" TO "anon";
GRANT TRIGGER ON "public"."user_permissions" TO "anon";
GRANT MAINTAIN ON "public"."user_permissions" TO "anon";
GRANT INSERT ON "public"."user_permissions" TO "authenticated";
GRANT SELECT ON "public"."user_permissions" TO "authenticated";
GRANT UPDATE ON "public"."user_permissions" TO "authenticated";
GRANT DELETE ON "public"."user_permissions" TO "authenticated";
GRANT TRUNCATE ON "public"."user_permissions" TO "authenticated";
GRANT REFERENCES ON "public"."user_permissions" TO "authenticated";
GRANT TRIGGER ON "public"."user_permissions" TO "authenticated";
GRANT MAINTAIN ON "public"."user_permissions" TO "authenticated";
GRANT INSERT ON "public"."user_permissions" TO "service_role";
GRANT SELECT ON "public"."user_permissions" TO "service_role";
GRANT UPDATE ON "public"."user_permissions" TO "service_role";
GRANT DELETE ON "public"."user_permissions" TO "service_role";
GRANT TRUNCATE ON "public"."user_permissions" TO "service_role";
GRANT REFERENCES ON "public"."user_permissions" TO "service_role";
GRANT TRIGGER ON "public"."user_permissions" TO "service_role";
GRANT MAINTAIN ON "public"."user_permissions" TO "service_role";
ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."user_roles" TO "anon";
GRANT SELECT ON "public"."user_roles" TO "anon";
GRANT UPDATE ON "public"."user_roles" TO "anon";
GRANT DELETE ON "public"."user_roles" TO "anon";
GRANT TRUNCATE ON "public"."user_roles" TO "anon";
GRANT REFERENCES ON "public"."user_roles" TO "anon";
GRANT TRIGGER ON "public"."user_roles" TO "anon";
GRANT MAINTAIN ON "public"."user_roles" TO "anon";
GRANT INSERT ON "public"."user_roles" TO "authenticated";
GRANT SELECT ON "public"."user_roles" TO "authenticated";
GRANT UPDATE ON "public"."user_roles" TO "authenticated";
GRANT DELETE ON "public"."user_roles" TO "authenticated";
GRANT TRUNCATE ON "public"."user_roles" TO "authenticated";
GRANT REFERENCES ON "public"."user_roles" TO "authenticated";
GRANT TRIGGER ON "public"."user_roles" TO "authenticated";
GRANT MAINTAIN ON "public"."user_roles" TO "authenticated";
GRANT INSERT ON "public"."user_roles" TO "service_role";
GRANT SELECT ON "public"."user_roles" TO "service_role";
GRANT UPDATE ON "public"."user_roles" TO "service_role";
GRANT DELETE ON "public"."user_roles" TO "service_role";
GRANT TRUNCATE ON "public"."user_roles" TO "service_role";
GRANT REFERENCES ON "public"."user_roles" TO "service_role";
GRANT TRIGGER ON "public"."user_roles" TO "service_role";
GRANT MAINTAIN ON "public"."user_roles" TO "service_role";
ALTER TABLE "public"."user_sessions" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."user_sessions" TO "anon";
GRANT SELECT ON "public"."user_sessions" TO "anon";
GRANT UPDATE ON "public"."user_sessions" TO "anon";
GRANT DELETE ON "public"."user_sessions" TO "anon";
GRANT TRUNCATE ON "public"."user_sessions" TO "anon";
GRANT REFERENCES ON "public"."user_sessions" TO "anon";
GRANT TRIGGER ON "public"."user_sessions" TO "anon";
GRANT MAINTAIN ON "public"."user_sessions" TO "anon";
GRANT INSERT ON "public"."user_sessions" TO "authenticated";
GRANT SELECT ON "public"."user_sessions" TO "authenticated";
GRANT UPDATE ON "public"."user_sessions" TO "authenticated";
GRANT DELETE ON "public"."user_sessions" TO "authenticated";
GRANT TRUNCATE ON "public"."user_sessions" TO "authenticated";
GRANT REFERENCES ON "public"."user_sessions" TO "authenticated";
GRANT TRIGGER ON "public"."user_sessions" TO "authenticated";
GRANT MAINTAIN ON "public"."user_sessions" TO "authenticated";
GRANT INSERT ON "public"."user_sessions" TO "service_role";
GRANT SELECT ON "public"."user_sessions" TO "service_role";
GRANT UPDATE ON "public"."user_sessions" TO "service_role";
GRANT DELETE ON "public"."user_sessions" TO "service_role";
GRANT TRUNCATE ON "public"."user_sessions" TO "service_role";
GRANT REFERENCES ON "public"."user_sessions" TO "service_role";
GRANT TRIGGER ON "public"."user_sessions" TO "service_role";
GRANT MAINTAIN ON "public"."user_sessions" TO "service_role";
ALTER TABLE "public"."whatsapp_groups" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."whatsapp_groups" TO "service_role";
GRANT SELECT ON "public"."whatsapp_groups" TO "service_role";
GRANT UPDATE ON "public"."whatsapp_groups" TO "service_role";
GRANT DELETE ON "public"."whatsapp_groups" TO "service_role";
GRANT TRUNCATE ON "public"."whatsapp_groups" TO "service_role";
GRANT REFERENCES ON "public"."whatsapp_groups" TO "service_role";
GRANT TRIGGER ON "public"."whatsapp_groups" TO "service_role";
GRANT MAINTAIN ON "public"."whatsapp_groups" TO "service_role";
GRANT INSERT ON "public"."whatsapp_groups" TO "authenticated";
GRANT SELECT ON "public"."whatsapp_groups" TO "authenticated";
GRANT UPDATE ON "public"."whatsapp_groups" TO "authenticated";
GRANT DELETE ON "public"."whatsapp_groups" TO "authenticated";
ALTER TABLE "public"."whatsapp_web_messages" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."whatsapp_web_messages" TO "service_role";
GRANT SELECT ON "public"."whatsapp_web_messages" TO "service_role";
GRANT UPDATE ON "public"."whatsapp_web_messages" TO "service_role";
GRANT DELETE ON "public"."whatsapp_web_messages" TO "service_role";
GRANT TRUNCATE ON "public"."whatsapp_web_messages" TO "service_role";
GRANT REFERENCES ON "public"."whatsapp_web_messages" TO "service_role";
GRANT TRIGGER ON "public"."whatsapp_web_messages" TO "service_role";
GRANT MAINTAIN ON "public"."whatsapp_web_messages" TO "service_role";
GRANT INSERT ON "public"."whatsapp_web_messages" TO "authenticated";
GRANT SELECT ON "public"."whatsapp_web_messages" TO "authenticated";
ALTER TABLE "public"."whatsapp_web_sessions" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."whatsapp_web_sessions" TO "service_role";
GRANT SELECT ON "public"."whatsapp_web_sessions" TO "service_role";
GRANT UPDATE ON "public"."whatsapp_web_sessions" TO "service_role";
GRANT DELETE ON "public"."whatsapp_web_sessions" TO "service_role";
GRANT TRUNCATE ON "public"."whatsapp_web_sessions" TO "service_role";
GRANT REFERENCES ON "public"."whatsapp_web_sessions" TO "service_role";
GRANT TRIGGER ON "public"."whatsapp_web_sessions" TO "service_role";
GRANT MAINTAIN ON "public"."whatsapp_web_sessions" TO "service_role";
ALTER TABLE "public"."workflow_sector_members" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."workflow_sector_members" TO "anon";
GRANT SELECT ON "public"."workflow_sector_members" TO "anon";
GRANT UPDATE ON "public"."workflow_sector_members" TO "anon";
GRANT DELETE ON "public"."workflow_sector_members" TO "anon";
GRANT TRUNCATE ON "public"."workflow_sector_members" TO "anon";
GRANT REFERENCES ON "public"."workflow_sector_members" TO "anon";
GRANT TRIGGER ON "public"."workflow_sector_members" TO "anon";
GRANT MAINTAIN ON "public"."workflow_sector_members" TO "anon";
GRANT INSERT ON "public"."workflow_sector_members" TO "authenticated";
GRANT SELECT ON "public"."workflow_sector_members" TO "authenticated";

COMMIT;
SELECT '30-access.sql' AS migration_batch,'OK' AS result;


-- 31-access.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
GRANT UPDATE ON "public"."workflow_sector_members" TO "authenticated";
GRANT DELETE ON "public"."workflow_sector_members" TO "authenticated";
GRANT TRUNCATE ON "public"."workflow_sector_members" TO "authenticated";
GRANT REFERENCES ON "public"."workflow_sector_members" TO "authenticated";
GRANT TRIGGER ON "public"."workflow_sector_members" TO "authenticated";
GRANT MAINTAIN ON "public"."workflow_sector_members" TO "authenticated";
GRANT INSERT ON "public"."workflow_sector_members" TO "service_role";
GRANT SELECT ON "public"."workflow_sector_members" TO "service_role";
GRANT UPDATE ON "public"."workflow_sector_members" TO "service_role";
GRANT DELETE ON "public"."workflow_sector_members" TO "service_role";
GRANT TRUNCATE ON "public"."workflow_sector_members" TO "service_role";
GRANT REFERENCES ON "public"."workflow_sector_members" TO "service_role";
GRANT TRIGGER ON "public"."workflow_sector_members" TO "service_role";
GRANT MAINTAIN ON "public"."workflow_sector_members" TO "service_role";
ALTER TABLE "public"."workflow_sectors" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."workflow_sectors" TO "anon";
GRANT SELECT ON "public"."workflow_sectors" TO "anon";
GRANT UPDATE ON "public"."workflow_sectors" TO "anon";
GRANT DELETE ON "public"."workflow_sectors" TO "anon";
GRANT TRUNCATE ON "public"."workflow_sectors" TO "anon";
GRANT REFERENCES ON "public"."workflow_sectors" TO "anon";
GRANT TRIGGER ON "public"."workflow_sectors" TO "anon";
GRANT MAINTAIN ON "public"."workflow_sectors" TO "anon";
GRANT INSERT ON "public"."workflow_sectors" TO "authenticated";
GRANT SELECT ON "public"."workflow_sectors" TO "authenticated";
GRANT UPDATE ON "public"."workflow_sectors" TO "authenticated";
GRANT DELETE ON "public"."workflow_sectors" TO "authenticated";
GRANT TRUNCATE ON "public"."workflow_sectors" TO "authenticated";
GRANT REFERENCES ON "public"."workflow_sectors" TO "authenticated";
GRANT TRIGGER ON "public"."workflow_sectors" TO "authenticated";
GRANT MAINTAIN ON "public"."workflow_sectors" TO "authenticated";
GRANT INSERT ON "public"."workflow_sectors" TO "service_role";
GRANT SELECT ON "public"."workflow_sectors" TO "service_role";
GRANT UPDATE ON "public"."workflow_sectors" TO "service_role";
GRANT DELETE ON "public"."workflow_sectors" TO "service_role";
GRANT TRUNCATE ON "public"."workflow_sectors" TO "service_role";
GRANT REFERENCES ON "public"."workflow_sectors" TO "service_role";
GRANT TRIGGER ON "public"."workflow_sectors" TO "service_role";
GRANT MAINTAIN ON "public"."workflow_sectors" TO "service_role";
ALTER TABLE "public"."workspace_invitations" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."workspace_invitations" TO "anon";
GRANT SELECT ON "public"."workspace_invitations" TO "anon";
GRANT UPDATE ON "public"."workspace_invitations" TO "anon";
GRANT DELETE ON "public"."workspace_invitations" TO "anon";
GRANT TRUNCATE ON "public"."workspace_invitations" TO "anon";
GRANT REFERENCES ON "public"."workspace_invitations" TO "anon";
GRANT TRIGGER ON "public"."workspace_invitations" TO "anon";
GRANT MAINTAIN ON "public"."workspace_invitations" TO "anon";
GRANT INSERT ON "public"."workspace_invitations" TO "authenticated";
GRANT SELECT ON "public"."workspace_invitations" TO "authenticated";
GRANT UPDATE ON "public"."workspace_invitations" TO "authenticated";
GRANT DELETE ON "public"."workspace_invitations" TO "authenticated";
GRANT TRUNCATE ON "public"."workspace_invitations" TO "authenticated";
GRANT REFERENCES ON "public"."workspace_invitations" TO "authenticated";
GRANT TRIGGER ON "public"."workspace_invitations" TO "authenticated";
GRANT MAINTAIN ON "public"."workspace_invitations" TO "authenticated";
GRANT INSERT ON "public"."workspace_invitations" TO "service_role";
GRANT SELECT ON "public"."workspace_invitations" TO "service_role";
GRANT UPDATE ON "public"."workspace_invitations" TO "service_role";
GRANT DELETE ON "public"."workspace_invitations" TO "service_role";
GRANT TRUNCATE ON "public"."workspace_invitations" TO "service_role";
GRANT REFERENCES ON "public"."workspace_invitations" TO "service_role";
GRANT TRIGGER ON "public"."workspace_invitations" TO "service_role";
GRANT MAINTAIN ON "public"."workspace_invitations" TO "service_role";
ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."workspace_members" TO "anon";
GRANT SELECT ON "public"."workspace_members" TO "anon";
GRANT UPDATE ON "public"."workspace_members" TO "anon";
GRANT DELETE ON "public"."workspace_members" TO "anon";
GRANT TRUNCATE ON "public"."workspace_members" TO "anon";
GRANT REFERENCES ON "public"."workspace_members" TO "anon";
GRANT TRIGGER ON "public"."workspace_members" TO "anon";
GRANT MAINTAIN ON "public"."workspace_members" TO "anon";
GRANT INSERT ON "public"."workspace_members" TO "authenticated";
GRANT SELECT ON "public"."workspace_members" TO "authenticated";
GRANT UPDATE ON "public"."workspace_members" TO "authenticated";
GRANT DELETE ON "public"."workspace_members" TO "authenticated";
GRANT TRUNCATE ON "public"."workspace_members" TO "authenticated";
GRANT REFERENCES ON "public"."workspace_members" TO "authenticated";
GRANT TRIGGER ON "public"."workspace_members" TO "authenticated";
GRANT MAINTAIN ON "public"."workspace_members" TO "authenticated";
GRANT INSERT ON "public"."workspace_members" TO "service_role";
GRANT SELECT ON "public"."workspace_members" TO "service_role";
GRANT UPDATE ON "public"."workspace_members" TO "service_role";
GRANT DELETE ON "public"."workspace_members" TO "service_role";
GRANT TRUNCATE ON "public"."workspace_members" TO "service_role";
GRANT REFERENCES ON "public"."workspace_members" TO "service_role";
GRANT TRIGGER ON "public"."workspace_members" TO "service_role";
GRANT MAINTAIN ON "public"."workspace_members" TO "service_role";
ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "public"."workspaces" TO "anon";
GRANT SELECT ON "public"."workspaces" TO "anon";
GRANT UPDATE ON "public"."workspaces" TO "anon";
GRANT DELETE ON "public"."workspaces" TO "anon";
GRANT TRUNCATE ON "public"."workspaces" TO "anon";
GRANT REFERENCES ON "public"."workspaces" TO "anon";
GRANT TRIGGER ON "public"."workspaces" TO "anon";
GRANT MAINTAIN ON "public"."workspaces" TO "anon";
GRANT INSERT ON "public"."workspaces" TO "authenticated";
GRANT SELECT ON "public"."workspaces" TO "authenticated";
GRANT UPDATE ON "public"."workspaces" TO "authenticated";
GRANT DELETE ON "public"."workspaces" TO "authenticated";
GRANT TRUNCATE ON "public"."workspaces" TO "authenticated";
GRANT REFERENCES ON "public"."workspaces" TO "authenticated";
GRANT TRIGGER ON "public"."workspaces" TO "authenticated";
GRANT MAINTAIN ON "public"."workspaces" TO "authenticated";
GRANT INSERT ON "public"."workspaces" TO "service_role";
GRANT SELECT ON "public"."workspaces" TO "service_role";
GRANT UPDATE ON "public"."workspaces" TO "service_role";
GRANT DELETE ON "public"."workspaces" TO "service_role";
GRANT TRUNCATE ON "public"."workspaces" TO "service_role";
GRANT REFERENCES ON "public"."workspaces" TO "service_role";
GRANT TRIGGER ON "public"."workspaces" TO "service_role";
GRANT MAINTAIN ON "public"."workspaces" TO "service_role";

COMMIT;
SELECT '31-access.sql' AS migration_batch,'OK' AS result;


-- 32-policies.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE POLICY "integration_credentials_member_access" ON "private"."integration_credentials" AS PERMISSIVE FOR ALL TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = integration_credentials.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = integration_credentials.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = integration_credentials.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = integration_credentials.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "ai_agent_conversations_private_user_access" ON "public"."ai_agent_conversations" AS PERMISSIVE FOR ALL TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_agent_conversations.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = ai_agent_conversations.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_agent_conversations.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = ai_agent_conversations.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "slim_session_security_required" ON "public"."ai_agent_conversations" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ai_agent_settings_workspace_access" ON "public"."ai_agent_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_agent_settings.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = ai_agent_settings.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((updated_by = ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_agent_settings.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = ai_agent_settings.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "slim_session_security_required" ON "public"."ai_agent_settings" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "brain_terms_delete" ON "public"."ai_brain_blocked_terms" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_blocked_terms.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "brain_terms_insert" ON "public"."ai_brain_blocked_terms" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_blocked_terms.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "brain_terms_read" ON "public"."ai_brain_blocked_terms" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_blocked_terms.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "brain_terms_update" ON "public"."ai_brain_blocked_terms" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_blocked_terms.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_blocked_terms.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."ai_brain_blocked_terms" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ai_brain_chunks_delete" ON "public"."ai_brain_chunks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_chunks.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "ai_brain_chunks_insert" ON "public"."ai_brain_chunks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_chunks.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM ai_brain_sources s
  WHERE ((s.id = ai_brain_chunks.source_id) AND (s.workspace_id = ai_brain_chunks.workspace_id))))));
CREATE POLICY "ai_brain_chunks_select" ON "public"."ai_brain_chunks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_chunks.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."ai_brain_chunks" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ai_brain_member_delete" ON "public"."ai_brain_sources" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_sources.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "ai_brain_member_insert" ON "public"."ai_brain_sources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_sources.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "ai_brain_member_read" ON "public"."ai_brain_sources" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_sources.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "ai_brain_member_update" ON "public"."ai_brain_sources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_sources.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = ai_brain_sources.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."ai_brain_sources" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "own_workspace_read" ON "public"."bcpll_email_campaigns" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = bcpll_current_workspace()));
CREATE POLICY "own_workspace_read" ON "public"."bcpll_email_outbox" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = bcpll_current_workspace()));
CREATE POLICY "own_workspace_read" ON "public"."bcpll_email_stage_rules" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = bcpll_current_workspace()));
CREATE POLICY "own_workspace_write" ON "public"."bcpll_email_stage_rules" AS PERMISSIVE FOR ALL TO "authenticated" USING (((workspace_id = bcpll_current_workspace()) AND private.slim_workspace_access(workspace_id, 'operator'::text))) WITH CHECK (((workspace_id = bcpll_current_workspace()) AND private.slim_workspace_access(workspace_id, 'operator'::text)));
CREATE POLICY "own_workspace_read" ON "public"."bcpll_email_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = bcpll_current_workspace()));
CREATE POLICY "own_workspace_write" ON "public"."bcpll_email_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING (((workspace_id = bcpll_current_workspace()) AND private.slim_workspace_access(workspace_id, 'operator'::text))) WITH CHECK (((workspace_id = bcpll_current_workspace()) AND private.slim_workspace_access(workspace_id, 'operator'::text)));
CREATE POLICY "bcpll_tutorials_editor" ON "public"."bcpll_tutorial_lessons" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT private.bcpll_tutorial_access(true) AS bcpll_tutorial_access)) WITH CHECK (( SELECT private.bcpll_tutorial_access(true) AS bcpll_tutorial_access));
CREATE POLICY "bcpll_tutorials_read" ON "public"."bcpll_tutorial_lessons" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT private.bcpll_tutorial_access(false) AS bcpll_tutorial_access));
CREATE POLICY "bcpll_tutorials_editor" ON "public"."bcpll_tutorial_modules" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT private.bcpll_tutorial_access(true) AS bcpll_tutorial_access)) WITH CHECK (( SELECT private.bcpll_tutorial_access(true) AS bcpll_tutorial_access));
CREATE POLICY "bcpll_tutorials_read" ON "public"."bcpll_tutorial_modules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT private.bcpll_tutorial_access(false) AS bcpll_tutorial_access));
CREATE POLICY "own_workspace_read" ON "public"."bcpll_utm_links" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = bcpll_current_workspace()));
CREATE POLICY "own_workspace_write" ON "public"."bcpll_utm_links" AS PERMISSIVE FOR ALL TO "authenticated" USING (((workspace_id = bcpll_current_workspace()) AND private.slim_workspace_access(workspace_id, 'operator'::text))) WITH CHECK (((workspace_id = bcpll_current_workspace()) AND private.slim_workspace_access(workspace_id, 'operator'::text)));
CREATE POLICY "bcpll_members_read" ON "public"."bcpll_workspaces" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.slim_workspace_access(workspace_id, 'member'::text) AND private.slim_session_security_allowed()));
CREATE POLICY "slim_session_security_required" ON "public"."companies" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage companies" ON "public"."companies" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_conversation_runs_read" ON "public"."conversation_agent_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)));
CREATE POLICY "slim_session_security_required" ON "public"."conversation_agent_runs" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_conversation_agents_members" ON "public"."conversation_ai_agents" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid))) WITH CHECK (private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)));
CREATE POLICY "slim_session_security_required" ON "public"."conversation_ai_agents" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_read" ON "public"."crm_automation_jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."crm_automation_jobs" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_form_submission_read" ON "public"."crm_form_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."crm_form_submissions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_session_security_required" ON "public"."crm_forms" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "workspace members manage crm forms" ON "public"."crm_forms" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid))) WITH CHECK (private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)));
CREATE POLICY "workspace members view crm forms" ON "public"."crm_forms" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)));
CREATE POLICY "slim_delete" ON "public"."crm_lead_audiences" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_insert" ON "public"."crm_lead_audiences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_read" ON "public"."crm_lead_audiences" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."crm_lead_audiences" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_update" ON "public"."crm_lead_audiences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_session_security_required" ON "public"."crm_source_funnels" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage crm_source_funnels" ON "public"."crm_source_funnels" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."crm_sources" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage crm_sources" ON "public"."crm_sources" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_delete" ON "public"."crm_stage_automations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_insert" ON "public"."crm_stage_automations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_read" ON "public"."crm_stage_automations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."crm_stage_automations" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_update" ON "public"."crm_stage_automations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_group_agents_delete" ON "public"."group_ai_agents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_group_agents_insert" ON "public"."group_ai_agents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.slim_workspace_access(workspace_id, 'operator'::text) AND (created_by = auth.uid())));
CREATE POLICY "slim_group_agents_read" ON "public"."group_ai_agents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_group_agents_update" ON "public"."group_ai_agents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_session_security_required" ON "public"."group_ai_agents" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_inbox_assignments_delete" ON "public"."inbox_label_assignments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_inbox_assignments_insert" ON "public"."inbox_label_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.slim_workspace_access(workspace_id, 'operator'::text) AND private.slim_inbox_thread_exists(workspace_id, thread_ref)));

COMMIT;
SELECT '32-policies.sql' AS migration_batch,'OK' AS result;


-- 33-policies.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE POLICY "slim_inbox_assignments_read" ON "public"."inbox_label_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_inbox_assignments_update" ON "public"."inbox_label_assignments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK ((private.slim_workspace_access(workspace_id, 'operator'::text) AND private.slim_inbox_thread_exists(workspace_id, thread_ref)));
CREATE POLICY "slim_session_security_required" ON "public"."inbox_label_assignments" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_inbox_labels_delete" ON "public"."inbox_labels" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_inbox_labels_insert" ON "public"."inbox_labels" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_inbox_labels_read" ON "public"."inbox_labels" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_inbox_labels_update" ON "public"."inbox_labels" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_session_security_required" ON "public"."inbox_labels" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "integrations_member_access" ON "public"."integrations" AS PERMISSIVE FOR ALL TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = integrations.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = integrations.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = integrations.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = integrations.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "slim_session_security_required" ON "public"."integrations" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_session_security_required" ON "public"."lead_activities" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members insert activities" ON "public"."lead_activities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "ws members read activities" ON "public"."lead_activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_delete" ON "public"."lead_custom_field_values" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_insert" ON "public"."lead_custom_field_values" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_read" ON "public"."lead_custom_field_values" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."lead_custom_field_values" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_update" ON "public"."lead_custom_field_values" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_delete" ON "public"."lead_custom_fields" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_insert" ON "public"."lead_custom_fields" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_read" ON "public"."lead_custom_fields" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."lead_custom_fields" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_update" ON "public"."lead_custom_fields" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "saude_slim_owner_manage_dismissals" ON "public"."lead_dedupe_dismissals" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.workspace_id = lead_dedupe_dismissals.workspace_id) AND (wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.workspace_id = lead_dedupe_dismissals.workspace_id) AND (wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))) AND (dismissed_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "slim_session_security_required" ON "public"."lead_dedupe_dismissals" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_session_security_required" ON "public"."lead_products" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage lead_products" ON "public"."lead_products" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."leads" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage leads" ON "public"."leads" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "marcos_tutorial_edit" ON "public"."marcos_tutorial_lessons" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT private.marcos_tutorial_access(true) AS marcos_tutorial_access)) WITH CHECK (( SELECT private.marcos_tutorial_access(true) AS marcos_tutorial_access));
CREATE POLICY "marcos_tutorial_read" ON "public"."marcos_tutorial_lessons" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT private.marcos_tutorial_access(false) AS marcos_tutorial_access));
CREATE POLICY "marcos_tutorial_edit" ON "public"."marcos_tutorial_modules" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT private.marcos_tutorial_access(true) AS marcos_tutorial_access)) WITH CHECK (( SELECT private.marcos_tutorial_access(true) AS marcos_tutorial_access));
CREATE POLICY "marcos_tutorial_read" ON "public"."marcos_tutorial_modules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT private.marcos_tutorial_access(false) AS marcos_tutorial_access));
CREATE POLICY "owner_manage_module_permissions" ON "public"."module_permissions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = module_permissions.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = module_permissions.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."module_permissions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "owner_manage_permission_templates" ON "public"."permission_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = permission_templates.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = permission_templates.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."permission_templates" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_session_security_required" ON "public"."pipeline_stages" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage pipeline_stages" ON "public"."pipeline_stages" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."pipelines" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage pipelines" ON "public"."pipelines" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."product_catalogs" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage product_catalogs" ON "public"."product_catalogs" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."products" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage products" ON "public"."products" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."profiles" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "users insert own profile" ON "public"."profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "users update own profile" ON "public"."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "users view own profile" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((id = ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "salesbot_blocks_members" ON "public"."salesbot_blocks" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = salesbot_blocks.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = salesbot_blocks.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."salesbot_blocks" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "salesbot_revisions_insert_own_workspace" ON "public"."salesbot_revisions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((actor_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = salesbot_revisions.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM salesbots b
  WHERE ((b.id = salesbot_revisions.salesbot_id) AND (b.workspace_id = salesbot_revisions.workspace_id) AND (b.revision = salesbot_revisions.revision))))));
CREATE POLICY "salesbot_revisions_members" ON "public"."salesbot_revisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = salesbot_revisions.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."salesbot_revisions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_salesbot_logs_read" ON "public"."salesbot_run_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)));
CREATE POLICY "slim_session_security_required" ON "public"."salesbot_run_logs" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_salesbot_runs_read" ON "public"."salesbot_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)));
CREATE POLICY "slim_session_security_required" ON "public"."salesbot_runs" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "salesbots_members" ON "public"."salesbots" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = salesbots.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = salesbots.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."salesbots" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_campaign_read" ON "public"."slim_audience_campaigns" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."slim_audience_campaigns" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_delivery_read" ON "public"."slim_audience_deliveries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."slim_audience_deliveries" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_attempt_closure_insert" ON "public"."slim_checkout_attempt_closures" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((actor_id = ( SELECT auth.uid() AS uid)) AND private.slim_workspace_access(workspace_id, 'operator'::text)));
CREATE POLICY "slim_attempt_closure_read" ON "public"."slim_checkout_attempt_closures" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((actor_id = ( SELECT auth.uid() AS uid)) AND private.slim_workspace_access(workspace_id)));

COMMIT;
SELECT '33-policies.sql' AS migration_batch,'OK' AS result;


-- 34-policies.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE POLICY "slim_session_security_required" ON "public"."slim_checkout_attempt_closures" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_order_changes_read" ON "public"."slim_order_changes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."slim_order_changes" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_delivery_caller_finish" ON "public"."slim_order_document_deliveries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((actor_id = auth.uid()) AND (status = 'pending'::text) AND private.slim_workspace_access(workspace_id, 'operator'::text))) WITH CHECK (((actor_id = auth.uid()) AND (status = ANY (ARRAY['accepted'::text, 'rejected'::text, 'uncertain'::text])) AND private.slim_workspace_access(workspace_id, 'operator'::text)));
CREATE POLICY "slim_delivery_caller_insert" ON "public"."slim_order_document_deliveries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((actor_id = auth.uid()) AND (status = 'pending'::text) AND private.slim_workspace_access(workspace_id, 'operator'::text)));
CREATE POLICY "slim_document_deliveries_read" ON "public"."slim_order_document_deliveries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."slim_order_document_deliveries" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_document_caller_insert" ON "public"."slim_order_documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((requested_by = auth.uid()) AND private.slim_workspace_access(workspace_id, 'operator'::text)));
CREATE POLICY "slim_documents_read" ON "public"."slim_order_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."slim_order_documents" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_orders_read" ON "public"."slim_orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."slim_orders" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_session_security_required" ON "public"."slim_stage_move_events" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_stage_move_read" ON "public"."slim_stage_move_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."slim_stock_movements" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_stock_read" ON "public"."slim_stock_movements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."supplier_product_costs" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "ws members manage supplier_product_costs" ON "public"."supplier_product_costs" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."support_robot_messages" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "support_robot_messages_private_user_access" ON "public"."support_robot_messages" AS PERMISSIVE FOR ALL TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = support_robot_messages.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = support_robot_messages.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = support_robot_messages.workspace_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = support_robot_messages.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "slim_delete" ON "public"."tasks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_insert" ON "public"."tasks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_read" ON "public"."tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."tasks" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_update" ON "public"."tasks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_session_security_required" ON "public"."team_chat_reads" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_team_own_reads" ON "public"."team_chat_reads" AS PERMISSIVE FOR ALL TO "authenticated" USING (((user_id = auth.uid()) AND private.slim_workspace_access(workspace_id, 'member'::text))) WITH CHECK (((user_id = auth.uid()) AND private.slim_workspace_access(workspace_id, 'member'::text)));
CREATE POLICY "slim_session_security_required" ON "public"."team_messages" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_team_delete" ON "public"."team_messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((from_user_id = auth.uid()) AND private.slim_workspace_access(workspace_id, 'operator'::text)));
CREATE POLICY "slim_team_mark_read" ON "public"."team_messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((to_user_id = auth.uid()) AND private.slim_workspace_access(workspace_id, 'member'::text))) WITH CHECK (((to_user_id = auth.uid()) AND private.slim_workspace_access(workspace_id, 'member'::text)));
CREATE POLICY "slim_team_read" ON "public"."team_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.slim_workspace_access(workspace_id, 'member'::text) AND (((auth.uid() = to_user_id) OR (auth.uid() = from_user_id)) OR ((sector_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM workflow_sectors s
  WHERE ((s.id = team_messages.sector_id) AND (s.workspace_id = team_messages.workspace_id) AND (private.slim_workspace_access(s.workspace_id, 'admin'::text) OR (EXISTS ( SELECT 1
           FROM workflow_sector_members m
          WHERE ((m.sector_id = s.id) AND (m.user_id = auth.uid()))))))))))));
CREATE POLICY "slim_team_send" ON "public"."team_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.slim_workspace_access(workspace_id, 'operator'::text) AND (from_user_id = auth.uid()) AND (origin = 'user'::text) AND (((to_user_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE ((m.workspace_id = team_messages.workspace_id) AND (m.user_id = team_messages.to_user_id) AND ((m.access_expires_at IS NULL) OR (m.access_expires_at > now())))))) OR ((sector_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM workflow_sectors s
  WHERE ((s.id = team_messages.sector_id) AND (s.workspace_id = team_messages.workspace_id) AND (private.slim_workspace_access(s.workspace_id, 'admin'::text) OR (EXISTS ( SELECT 1
           FROM workflow_sector_members m
          WHERE ((m.sector_id = s.id) AND (m.user_id = auth.uid()))))))))))));
CREATE POLICY "slim_session_security_required" ON "public"."tracking_conversion_events" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_tracking_conversion_read" ON "public"."tracking_conversion_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."tracking_events" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_tracking_events_read" ON "public"."tracking_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_session_security_required" ON "public"."tracking_sites" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_tracking_sites_delete" ON "public"."tracking_sites" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_tracking_sites_insert" ON "public"."tracking_sites" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.slim_workspace_access(workspace_id, 'operator'::text) AND (created_by = auth.uid())));
CREATE POLICY "slim_tracking_sites_read" ON "public"."tracking_sites" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_tracking_sites_update" ON "public"."tracking_sites" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "tutorials_editor" ON "public"."tutorial_lessons" AS PERMISSIVE FOR ALL TO "authenticated" USING ((( SELECT auth.uid() AS uid) = 'e8f2252b-c0bc-4336-9912-2e62e73ddd2e'::uuid)) WITH CHECK ((( SELECT auth.uid() AS uid) = 'e8f2252b-c0bc-4336-9912-2e62e73ddd2e'::uuid));
CREATE POLICY "tutorials_read" ON "public"."tutorial_lessons" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY "tutorials_editor" ON "public"."tutorial_modules" AS PERMISSIVE FOR ALL TO "authenticated" USING ((( SELECT auth.uid() AS uid) = 'e8f2252b-c0bc-4336-9912-2e62e73ddd2e'::uuid)) WITH CHECK ((( SELECT auth.uid() AS uid) = 'e8f2252b-c0bc-4336-9912-2e62e73ddd2e'::uuid));
CREATE POLICY "tutorials_read" ON "public"."tutorial_modules" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY "slim_session_security_required" ON "public"."user_notification_settings" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "users_manage_notification_settings" ON "public"."user_notification_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "owner_manage_user_permissions" ON "public"."user_permissions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = user_permissions.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = user_permissions.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."user_permissions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "slim_session_security_required" ON "public"."user_roles" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "users read own roles" ON "public"."user_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "authorized users update sessions" ON "public"."user_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = user_sessions.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = user_sessions.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "slim_session_security_required" ON "public"."user_sessions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "users create own sessions" ON "public"."user_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid))));
CREATE POLICY "workspace members access sessions" ON "public"."user_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = user_sessions.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "slim_inbox_groups_delete" ON "public"."whatsapp_groups" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_inbox_groups_insert" ON "public"."whatsapp_groups" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_inbox_groups_read" ON "public"."whatsapp_groups" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.slim_workspace_access(workspace_id));
CREATE POLICY "slim_inbox_groups_update" ON "public"."whatsapp_groups" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.slim_workspace_access(workspace_id, 'operator'::text)) WITH CHECK (private.slim_workspace_access(workspace_id, 'operator'::text));
CREATE POLICY "slim_session_security_required" ON "public"."whatsapp_groups" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "saude slim members insert outbound evolution messages" ON "public"."whatsapp_web_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) AND (EXISTS ( SELECT 1
   FROM whatsapp_web_sessions s
  WHERE ((s.id = whatsapp_web_messages.session_id) AND (s.workspace_id = s.workspace_id))))));
CREATE POLICY "saude slim members read evolution messages" ON "public"."whatsapp_web_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."whatsapp_web_messages" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "saude slim members read evolution sessions" ON "public"."whatsapp_web_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "saude slim members update evolution session status" ON "public"."whatsapp_web_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK ((private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."whatsapp_web_sessions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));

COMMIT;
SELECT '34-policies.sql' AS migration_batch,'OK' AS result;


-- 35-policies.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE POLICY "owner_manage_workflow_sector_members" ON "public"."workflow_sector_members" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workflow_sector_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workflow_sector_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."workflow_sector_members" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "owner_manage_workflow_sectors" ON "public"."workflow_sectors" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workflow_sectors.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workflow_sectors.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."workflow_sectors" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "owners manage invitations" ON "public"."workspace_invitations" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_invitations.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_invitations.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "slim_session_security_required" ON "public"."workspace_invitations" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "members view memberships" ON "public"."workspace_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_workspace_member(workspace_id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "owner deletes members" ON "public"."workspace_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "owner inserts members" ON "public"."workspace_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "owner updates members" ON "public"."workspace_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK (((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."workspace_members" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
CREATE POLICY "authenticated create workspace" ON "public"."workspaces" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "members view workspace" ON "public"."workspaces" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.is_workspace_member(id, ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "owner deletes workspace" ON "public"."workspaces" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((owner_id = ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "owner updates workspace" ON "public"."workspaces" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((owner_id = ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))) WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) OR private.has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));
CREATE POLICY "slim_session_security_required" ON "public"."workspaces" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));

COMMIT;
SELECT '35-policies.sql' AS migration_batch,'OK' AS result;


-- 36-views.sql
BEGIN;
SET LOCAL search_path=public,extensions;
SET LOCAL check_function_bodies=false;
CREATE VIEW "public"."bcpll_profiles" WITH(security_invoker=true) AS  SELECT id,
    display_name,
    full_name,
    avatar_url,
    bcpll_profile_workspace(id, current_workspace_id) AS current_workspace_id,
    timezone,
    notification_prefs,
    whatsapp_primary,
    whatsapp_secondary,
    phone_alt,
    preferred_contact,
    job_title,
    role_in_company,
    company_name,
    company_size,
    niche,
    city,
    state,
    country,
    website_url,
    instagram_handle,
    linkedin_url,
    acquisition_source,
    internal_notes,
    created_at,
    updated_at,
    cpf,
    birth_date,
    bio
   FROM profiles p;
REVOKE ALL ON "public"."bcpll_profiles" FROM PUBLIC,anon,authenticated;

COMMIT;
SELECT '36-views.sql' AS migration_batch,'OK' AS result;


-- 37-owner-setup.sql
BEGIN; SET LOCAL search_path=public,extensions; SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  email text;
  display text;
  ws_slug text;
  ws_id uuid;
begin
  IF new.raw_user_meta_data->>'signup_source'='bcpll' THEN
    PERFORM private.bcpll_onboard_user(new.id,new.email,new.raw_user_meta_data); RETURN new;
  END IF;
  email := lower(coalesce(new.email, ''));
  display := coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'Usuario');
  ws_slug := public.generate_workspace_slug(display);

  insert into public.profiles (id, display_name, full_name)
  values (new.id, display, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into public.workspaces (slug, name, owner_id)
  values (ws_slug, 'Vanessa Simoni', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  update public.profiles
  set current_workspace_id = ws_id,
      updated_at = now()
  where id = new.id;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.seed_workspace_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  source_id uuid;
  pipeline_id uuid;
begin
  insert into public.crm_sources (workspace_id, provider, display_name, is_default)
  values (new.id, 'manual', 'Vanessa Simoni', true)
  returning id into source_id;

  insert into public.pipelines (workspace_id, crm_source_id, name, position)
  values (new.id, source_id, 'Vendas', 1)
  returning id into pipeline_id;

  insert into public.crm_source_funnels (workspace_id, crm_source_id, pipeline_id)
  values (new.id, source_id, pipeline_id);

  insert into public.pipeline_stages (workspace_id, pipeline_id, name, position, color)
  values
    (new.id, pipeline_id, 'Novo pedido', 1, '#22c55e'),
    (new.id, pipeline_id, 'Em atendimento', 2, '#84cc16'),
    (new.id, pipeline_id, 'Venda ganha', 3, '#16a34a'),
    (new.id, pipeline_id, 'Venda perdida', 4, '#ef4444');

  insert into public.product_catalogs (workspace_id, name, description)
  values (new.id, 'Catalogo principal', 'Imóveis e serviços Vanessa Simoni');

  return new;
end;
$function$
;
DO $vanessa_setup$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created') THEN CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); END IF; END $vanessa_setup$;
COMMIT;SELECT '37-owner-setup.sql' AS migration_batch,'OK' AS result;


-- 38-workspace-identity.sql
BEGIN; SET LOCAL search_path=public,extensions; SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION private.slim_invitation_accept_impl(p_token uuid, p_actor_id uuid, p_approved boolean, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
 SET statement_timeout TO '20s'
AS $function$
DECLARE office_workspace uuid; inv public.workspace_invitations; member public.workspace_members; email_key text; actor_email text;
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
 SELECT wi.workspace_id INTO office_workspace FROM public.workspace_invitations wi JOIN public.workspaces office ON office.id=wi.workspace_id WHERE wi.token=p_token AND (wi.workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698'::uuid OR office.slug='vanessa-simoni');
 office_workspace:=coalesce(office_workspace,'2a0e0d29-4e23-47e6-bd9f-30aa8e15e698'::uuid);
 base:=jsonb_build_object('version',1,'workspaceId',office_workspace,'actorId',p_actor_id,
  'invitationId',NULL,'acceptedAt',NULL,'membershipRole',NULL,'activeWorkspaceId',NULL,'status','rejected');
 SELECT private.slim_invitation_email(email) INTO email_key FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id=office_workspace;
 IF email_key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(('slim_invitation_email:'||office_workspace::text||':')||email_key,97));
 END IF;
 -- Even lookup locks only for a consistent result; it never writes business state.
 SELECT * INTO inv FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id=office_workspace FOR UPDATE;
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
END;$function$
;
CREATE OR REPLACE FUNCTION private.slim_invitation_owner(p_workspace_id uuid, p_actor_id uuid, p_lock boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE actual_owner uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor_id
 OR (p_workspace_id IS DISTINCT FROM '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698'::uuid AND NOT EXISTS (SELECT 1 FROM public.workspaces office WHERE office.id=p_workspace_id AND office.slug='vanessa-simoni')) THEN
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
END;$function$
;
CREATE OR REPLACE FUNCTION private.slim_invitation_preview_impl(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
 SET statement_timeout TO '20s'
AS $function$
DECLARE office_workspace uuid; inv public.workspace_invitations; email_key text; workspace_name text;
BEGIN
 -- The definer identity itself is not evidence of a service request.
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Prévia disponível somente pelo serviço autorizado.' USING ERRCODE='42501';
 END IF;
 SELECT wi.workspace_id INTO office_workspace FROM public.workspace_invitations wi JOIN public.workspaces office ON office.id=wi.workspace_id WHERE wi.token=p_token AND (wi.workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698'::uuid OR office.slug='vanessa-simoni');
 office_workspace:=coalesce(office_workspace,'2a0e0d29-4e23-47e6-bd9f-30aa8e15e698'::uuid);
 SELECT private.slim_invitation_email(email) INTO email_key FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id=office_workspace;
 IF email_key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(('slim_invitation_email:'||office_workspace::text||':')||email_key,97));
 END IF;
 SELECT * INTO inv FROM public.workspace_invitations
  WHERE token=p_token AND workspace_id=office_workspace FOR SHARE;
 IF inv.id IS NULL THEN RETURN jsonb_build_object('version',1,'status','invalid','code','INVITATION_UNAVAILABLE'); END IF;
 SELECT name INTO workspace_name FROM public.workspaces WHERE id=inv.workspace_id;
 RETURN jsonb_build_object('version',1,'status','valid','workspaceId',inv.workspace_id,'invitationId',inv.id,
  'workspaceName',workspace_name,'email',inv.email,'accessRole',inv.access_role,'accessDays',inv.access_days,'isPartner',inv.is_partner,
  'invitationStatus',CASE WHEN inv.status='pending' AND inv.expires_at<=clock_timestamp() THEN 'expired' ELSE inv.status END,'expiresAt',inv.expires_at);
END;$function$
;
CREATE OR REPLACE FUNCTION private.slim_leads_contact_phone_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
 SET lock_timeout TO '5s'
AS $function$
DECLARE
 v_workspace constant uuid := '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698';
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
 IF (NEW.workspace_id IS DISTINCT FROM v_workspace AND NOT EXISTS (SELECT 1 FROM public.workspaces office WHERE office.id=NEW.workspace_id AND private.bcpll_is_workspace(office.id)))
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
$function$
;
COMMIT; SELECT '38-workspace-identity.sql' AS migration_batch,'OK' AS result;


-- 39-storage-policies.sql
CREATE POLICY "ai_brain_delete_files" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'saude-slim-brain'::text) AND (EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE (((m.workspace_id)::text = split_part(objects.name, '/'::text, 1)) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "ai_brain_read_files" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'saude-slim-brain'::text) AND (EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE (((m.workspace_id)::text = split_part(objects.name, '/'::text, 1)) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "ai_brain_upload" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'saude-slim-brain'::text) AND (EXISTS ( SELECT 1
   FROM workspace_members m
  WHERE (((m.workspace_id)::text = split_part(objects.name, '/'::text, 1)) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "slim_inbox_media_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'inbox-outgoing'::text) AND private.slim_inbox_media_access(name, 'operator'::text)));
CREATE POLICY "slim_inbox_media_read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'inbox-outgoing'::text) AND private.slim_inbox_media_access(name, 'member'::text)));
CREATE POLICY "slim_salesbot_media_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'salesbot-media'::text) AND
CASE
    WHEN ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) AND (length(split_part(name, '/'::text, 2)) > 0)) THEN private.slim_workspace_access((split_part(name, '/'::text, 1))::uuid, 'operator'::text)
    ELSE false
END));
CREATE POLICY "slim_salesbot_media_read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'salesbot-media'::text) AND
CASE
    WHEN ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) AND (length(split_part(name, '/'::text, 2)) > 0)) THEN private.slim_workspace_access((split_part(name, '/'::text, 1))::uuid, 'member'::text)
    ELSE false
END));
CREATE POLICY "slim_session_security_required" ON "storage"."objects" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed)) WITH CHECK (( SELECT private.slim_session_security_allowed() AS slim_session_security_allowed));
SELECT '39-storage-policies.sql' AS file,'OK' AS status;


CREATE SCHEMA IF NOT EXISTS vanessa_private;
REVOKE ALL ON SCHEMA vanessa_private FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS vanessa_private.records(collection text NOT NULL,id text NOT NULL,data text NOT NULL,PRIMARY KEY(collection,id));
ALTER TABLE vanessa_private.records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vanessa_private.records FROM PUBLIC,anon,authenticated;

BEGIN;
CREATE OR REPLACE FUNCTION public.vanessa_catalog() RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (r.data::jsonb-'created_by') || jsonb_build_object('title',p.name,'description',p.description,'price',CASE WHEN p.price=0 AND (r.data::jsonb->>'price') IS NULL THEN NULL ELSE p.price END,'published',p.active,'updated_at',p.updated_at)
 FROM vanessa_private.records r JOIN public.products p ON p.id=r.id::uuid
 WHERE r.collection='properties' AND p.workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' AND p.active;
$$;
REVOKE ALL ON FUNCTION public.vanessa_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vanessa_catalog() TO anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS vanessa_private.cloud_files(disk text PRIMARY KEY,metadata jsonb NOT NULL);
ALTER TABLE vanessa_private.cloud_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vanessa_private.cloud_files FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.vanessa_public_file(p_disk text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT metadata FROM vanessa_private.cloud_files WHERE disk=p_disk AND p_disk~'^[a-f0-9]{64}\.[a-zA-Z0-9]+$';
$$;
REVOKE ALL ON FUNCTION public.vanessa_public_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vanessa_public_file(text) TO anon,authenticated,service_role;
COMMIT;
SELECT '40-public-catalog.sql' AS file,'OK' AS status;


BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversation_ai_agents') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_ai_agents; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_activities') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activities; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='leads') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.leads; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='salesbot_runs') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.salesbot_runs; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='salesbots') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.salesbots; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='whatsapp_web_messages') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_web_messages; END IF; END $$;
COMMIT;
SELECT '43-realtime.sql' AS file,'OK' AS status;

-- Column-level ACL parity from the canonical source, verified in production.
GRANT INSERT(workspace_id,document_id,request_id,actor_id,session_id,phone,status,consent_sha256) ON public.slim_order_document_deliveries TO authenticated;
GRANT UPDATE(status,message_id,last_error,finished_at) ON public.slim_order_document_deliveries TO authenticated;
GRANT INSERT(order_id,workspace_id,version,sha256,filename,pdf_base64,requested_by) ON public.slim_order_documents TO authenticated;
GRANT UPDATE(read_at) ON public.team_messages TO authenticated;
GRANT INSERT(workspace_id,name,domain,created_by) ON public.tracking_sites TO authenticated;
GRANT UPDATE(name,domain) ON public.tracking_sites TO authenticated;
GRANT SELECT(id,workspace_id,provider,instance_id,webhook_secret,status,phone_number,last_qr,last_connected_at,last_disconnected_at,metadata,created_at,updated_at) ON public.whatsapp_web_sessions TO authenticated;
GRANT UPDATE(status,phone_number,last_qr,last_connected_at,last_disconnected_at,metadata,updated_at) ON public.whatsapp_web_sessions TO authenticated;


-- 20261031001000_vanessa_marketplace.sql
BEGIN;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS partner_details jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS public_property jsonb;
COMMENT ON COLUMN public.products.public_property IS 'Dados públicos do empreendimento Vanessa; campos comerciais internos permanecem separados.';
CREATE OR REPLACE FUNCTION public.vanessa_catalog() RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH listing AS (
 SELECT p.*,COALESCE(p.public_property,p.import_snapshot->'property',r.data::jsonb,'{}'::jsonb) AS estate
 FROM public.products p LEFT JOIN vanessa_private.records r ON r.collection='properties' AND r.id=p.id::text
 WHERE p.workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' AND p.active
 )
 SELECT jsonb_build_object(
 'id',id,'title',name,'description',description,'city',COALESCE(estate->>'city',''),'address',estate->'address',
 'price',CASE WHEN price=0 AND import_snapshot->'property'->>'price' IS NULL AND import_snapshot->>'source'='vanessa-original' THEN NULL ELSE price END,
 'images',CASE WHEN COALESCE(image,'')<>'' THEN jsonb_build_array(image)||COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(COALESCE(estate->'images','[]'::jsonb)) x WHERE x<>to_jsonb(image)),'[]'::jsonb) ELSE COALESCE(estate->'images','[]'::jsonb) END,
 'pdfs',COALESCE(estate->'pdfs','[]'::jsonb),'plans',COALESCE(estate->'plans','[]'::jsonb),
 'bedrooms',estate->'bedrooms','bathrooms',estate->'bathrooms','area_m2',estate->'area_m2','tag',estate->'tag',
 'construction_status',COALESCE(estate->>'construction_status','na_planta'),'launch_date',estate->'launch_date',
 'subsidy_estimate',estate->'subsidy_estimate','monthly_parcel',estate->'monthly_parcel','down_payment',estate->'down_payment',
 'show_parcel',COALESCE(estate->'show_parcel','false'::jsonb),'show_down_payment',COALESCE(estate->'show_down_payment','false'::jsonb),
 'published',true,'created_at',created_at,'updated_at',updated_at)
 FROM listing WHERE COALESCE((estate->>'published')::boolean,true) ORDER BY created_at DESC,id;
$$;
REVOKE ALL ON FUNCTION public.vanessa_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vanessa_catalog() TO anon,authenticated,service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('vanessa-listings','vanessa-listings',true,52428800,ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','application/pdf']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY vanessa_listing_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='vanessa-listings' AND (storage.foldername(name))[1]=auth.uid()::text AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' AND m.user_id=auth.uid()));
CREATE POLICY vanessa_listing_owner_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='vanessa-listings' AND (storage.foldername(name))[1]=auth.uid()::text);
COMMIT;
SELECT '45-marketplace' AS file,'OK' AS status;


-- 20261031002000_vanessa_support_onboarding.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  email text;
  display text;
  ws_slug text;
  ws_id uuid;
begin
  IF new.raw_user_meta_data->>'signup_source'='bcpll' THEN
    PERFORM private.bcpll_onboard_user(new.id,new.email,new.raw_user_meta_data); RETURN new;
  END IF;
  email := lower(coalesce(new.email, ''));
  display := coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'Usuario');
  IF email='ruanandradenegocios@hotmail.com' THEN
    INSERT INTO public.profiles(id,display_name,full_name,current_workspace_id) VALUES(new.id,'Suporte Ruan','Ruan Andrade','2a0e0d29-4e23-47e6-bd9f-30aa8e15e698') ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES('2a0e0d29-4e23-47e6-bd9f-30aa8e15e698',new.id,'admin') ON CONFLICT DO NOTHING;
    RETURN new;
  END IF;
  ws_slug := public.generate_workspace_slug(display);

  insert into public.profiles (id, display_name, full_name)
  values (new.id, display, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into public.workspaces (slug, name, owner_id)
  values (ws_slug, 'Vanessa Simoni', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  update public.profiles
  set current_workspace_id = ws_id,
      updated_at = now()
  where id = new.id;

  return new;
end;
$function$
;
SELECT '46-support-onboarding' AS file,'OK' AS status;

-- 20261031003000_vanessa_tutorial_support.sql
BEGIN;
ALTER POLICY tutorials_editor ON public.tutorial_modules USING ((SELECT auth.uid())='b6bf8bde-340c-4a98-9fb4-179e2fcf3464'::uuid) WITH CHECK ((SELECT auth.uid())='b6bf8bde-340c-4a98-9fb4-179e2fcf3464'::uuid);
ALTER POLICY tutorials_editor ON public.tutorial_lessons USING ((SELECT auth.uid())='b6bf8bde-340c-4a98-9fb4-179e2fcf3464'::uuid) WITH CHECK ((SELECT auth.uid())='b6bf8bde-340c-4a98-9fb4-179e2fcf3464'::uuid);
COMMIT;
SELECT '47-support-tutorials' AS file,'OK' AS status;


-- 20261031004000_vanessa_tracking_site.sql
INSERT INTO public.tracking_sites(workspace_id,name,domain,created_by) SELECT '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698','Site Vanessa Simoni','corretoravanessasimoni.com','b93ed466-4cff-423d-9dc3-3b0492fc9345' WHERE NOT EXISTS(SELECT 1 FROM public.tracking_sites WHERE workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' AND domain='corretoravanessasimoni.com');


-- 20261031005000_vanessa_tracking_runtime.sql
BEGIN;
ALTER TABLE public.tracking_events ADD COLUMN IF NOT EXISTS anon_id text, ADD COLUMN IF NOT EXISTS props jsonb, ADD COLUMN IF NOT EXISTS user_agent text, ADD COLUMN IF NOT EXISTS ip text, ADD COLUMN IF NOT EXISTS country text;
CREATE OR REPLACE FUNCTION private.vanessa_tracking_compat() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN NEW.visitor_id:=COALESCE(NEW.anon_id,NEW.visitor_id); NEW.properties:=COALESCE(NEW.props,NEW.properties,'{}'::jsonb); NEW.currency:=COALESCE(NULLIF(NEW.currency,''),'BRL'); RETURN NEW; END $$;
CREATE TRIGGER vanessa_tracking_compat BEFORE INSERT OR UPDATE ON public.tracking_events FOR EACH ROW EXECUTE FUNCTION private.vanessa_tracking_compat();
CREATE INDEX IF NOT EXISTS vanessa_tracking_anon_idx ON public.tracking_events(workspace_id,anon_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS vanessa_tracking_event_id_idx ON public.tracking_events(workspace_id,event_id) WHERE event_id IS NOT NULL;
ALTER TABLE public.tracking_conversion_events ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS vanessa_tracking_conversion_dedupe_idx ON public.tracking_conversion_events(workspace_id,dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.tracking_identities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,anon_id text NOT NULL,lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,email text,phone text,first_utm jsonb NOT NULL DEFAULT '{}',last_utm jsonb NOT NULL DEFAULT '{}',first_seen_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,anon_id));
CREATE TABLE IF NOT EXISTS public.tracking_dispatch_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,event_row_id bigint REFERENCES public.tracking_events(id) ON DELETE CASCADE,event_name text,module text NOT NULL,status text NOT NULL CHECK(status IN ('ok','skip','error')),detail text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS vanessa_dispatch_event_idx ON public.tracking_dispatch_log(workspace_id,event_row_id,module,status);
CREATE TABLE IF NOT EXISTS public.tracking_conversions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,name text NOT NULL,event_name text NOT NULL,active boolean NOT NULL DEFAULT true,default_value numeric,currency text DEFAULT 'BRL',value_expr text,created_by uuid REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS vanessa_conversions_workspace_idx ON public.tracking_conversions(workspace_id,active);
CREATE TABLE IF NOT EXISTS public.workflow_pipelines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,name text NOT NULL DEFAULT 'Novo fluxo',color text NOT NULL DEFAULT '#C40008',position integer NOT NULL DEFAULT 0,is_default boolean NOT NULL DEFAULT false,sector_id uuid REFERENCES public.workflow_sectors(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.workflow_stages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,pipeline_id uuid NOT NULL REFERENCES public.workflow_pipelines(id) ON DELETE CASCADE,name text NOT NULL,color text NOT NULL DEFAULT '#C40008',position integer NOT NULL DEFAULT 0,is_done_stage boolean NOT NULL DEFAULT false,is_incomplete_stage boolean NOT NULL DEFAULT false,is_review_stage boolean NOT NULL DEFAULT false,product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.workflow_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,pipeline_id uuid NOT NULL REFERENCES public.workflow_pipelines(id) ON DELETE CASCADE,stage_id uuid NOT NULL REFERENCES public.workflow_stages(id) ON DELETE CASCADE,title text NOT NULL,description text,position numeric NOT NULL DEFAULT 0,priority text NOT NULL DEFAULT 'media',status text NOT NULL DEFAULT 'pending',tags jsonb NOT NULL DEFAULT '[]',created_by uuid REFERENCES auth.users(id),assignee_id uuid REFERENCES auth.users(id),due_at timestamptz,completed_at timestamptz,estimated_seconds integer,time_spent_seconds integer NOT NULL DEFAULT 0,credentials jsonb NOT NULL DEFAULT '{}',links jsonb NOT NULL DEFAULT '[]',automation_state jsonb NOT NULL DEFAULT '{}',parent_task_id uuid REFERENCES public.workflow_tasks(id),is_review_copy boolean NOT NULL DEFAULT false,review_copy_of uuid REFERENCES public.workflow_tasks(id),review_round integer NOT NULL DEFAULT 0,review_status text,review_notes text,review_outcome text,reviewed_at timestamptz,reviewed_by uuid REFERENCES auth.users(id),submitted_for_review_at timestamptz,incomplete_reason text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['tracking_identities','tracking_dispatch_log','tracking_conversions','workflow_pipelines','workflow_stages','workflow_tasks'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT ALL ON public.%I TO service_role',t);IF t<>'tracking_identities' THEN EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);EXECUTE format('CREATE POLICY vanessa_member_read ON public.%I FOR SELECT TO authenticated USING (private.slim_workspace_access(workspace_id,%L) AND private.slim_session_security_allowed())',t,CASE WHEN t LIKE 'workflow_%' THEN 'admin' ELSE 'member' END);END IF;IF t IN ('tracking_conversions','workflow_pipelines','workflow_stages','workflow_tasks') THEN EXECUTE format('GRANT INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);EXECUTE format('CREATE POLICY vanessa_operator_write ON public.%I FOR ALL TO authenticated USING(private.slim_workspace_access(workspace_id,%L) AND private.slim_session_security_allowed()) WITH CHECK(private.slim_workspace_access(workspace_id,%L) AND private.slim_session_security_allowed())',t,CASE WHEN t LIKE 'workflow_%' THEN 'admin' ELSE 'operator' END,CASE WHEN t LIKE 'workflow_%' THEN 'admin' ELSE 'operator' END);END IF;END LOOP;END $$;
GRANT USAGE,SELECT ON SEQUENCE public.tracking_dispatch_log_id_seq TO service_role;
CREATE INDEX IF NOT EXISTS vanessa_workflow_pipeline_idx ON public.workflow_pipelines(workspace_id,position);
CREATE INDEX IF NOT EXISTS vanessa_workflow_stages_idx ON public.workflow_stages(workspace_id,pipeline_id,position);
CREATE INDEX IF NOT EXISTS vanessa_workflow_tasks_idx ON public.workflow_tasks(workspace_id,stage_id,position);
COMMIT;
NOTIFY pgrst,'reload schema';
SELECT '49-tracking-runtime' AS file,'OK' AS status;


-- 20261031006000_vanessa_vgv_commissions.sql
BEGIN;
CREATE TABLE public.vanessa_deal_financials(lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,property_id uuid REFERENCES public.products(id) ON DELETE SET NULL,partner_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,deal_kind text NOT NULL CHECK(deal_kind IN ('venda','locacao')),deal_value_cents bigint NOT NULL CHECK(deal_value_cents BETWEEN 0 AND 99999999999999),commission_mode text NOT NULL CHECK(commission_mode IN ('percentual','fixa')),commission_bps integer CHECK(commission_bps BETWEEN 0 AND 10000),commission_cents bigint NOT NULL CHECK(commission_cents BETWEEN 0 AND 99999999999999),received_cents bigint NOT NULL DEFAULT 0 CHECK(received_cents>=0 AND received_cents<=commission_cents),due_on date,notes text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL REFERENCES auth.users(id));
ALTER TABLE public.vanessa_deal_financials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vanessa_deal_financials FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vanessa_deal_financials TO authenticated;
GRANT ALL ON public.vanessa_deal_financials TO service_role;
CREATE POLICY vanessa_finance_read ON public.vanessa_deal_financials FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id) AND private.slim_session_security_allowed());
CREATE INDEX vanessa_finance_workspace_idx ON public.vanessa_deal_financials(workspace_id,due_on);
CREATE OR REPLACE FUNCTION public.vanessa_save_financials(_lead_id uuid,_kind text,_value_cents bigint,_mode text,_bps integer,_fixed_cents bigint,_received_cents bigint,_property_id uuid DEFAULT NULL,_partner_id uuid DEFAULT NULL,_due_on date DEFAULT NULL,_notes text DEFAULT '',_expected_updated_at timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ws uuid;previous public.vanessa_deal_financials;total bigint;saved public.vanessa_deal_financials;
BEGIN
SELECT workspace_id INTO ws FROM public.leads WHERE id=_lead_id FOR UPDATE;
IF ws IS DISTINCT FROM '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698'::uuid OR NOT private.slim_workspace_access(ws,'operator') OR NOT private.slim_session_security_allowed() THEN RAISE EXCEPTION 'Acesso não autorizado à negociação.';END IF;
IF _kind NOT IN ('venda','locacao') OR _mode NOT IN ('percentual','fixa') OR _value_cents IS NULL OR _value_cents<0 OR _value_cents>99999999999999 OR char_length(COALESCE(_notes,''))>3000 THEN RAISE EXCEPTION 'Confira os valores da negociação.';END IF;
IF _mode='percentual' THEN IF _bps IS NULL OR _bps<0 OR _bps>10000 THEN RAISE EXCEPTION 'Comissão percentual inválida.';END IF;total:=round((_value_cents::numeric*_bps)/10000)::bigint;ELSE total:=_fixed_cents;END IF;
IF total IS NULL OR total<0 OR total>99999999999999 OR _received_cents IS NULL OR _received_cents<0 OR _received_cents>total THEN RAISE EXCEPTION 'O recebimento informado deve estar entre zero e a comissão combinada.';END IF;
IF _property_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=_property_id AND workspace_id=ws) THEN RAISE EXCEPTION 'Imóvel não pertence à Vanessa.';END IF;
IF _partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.companies WHERE id=_partner_id AND workspace_id=ws) THEN RAISE EXCEPTION 'Parceiro não pertence à Vanessa.';END IF;
SELECT * INTO previous FROM public.vanessa_deal_financials WHERE lead_id=_lead_id;
IF previous.lead_id IS NOT NULL AND previous.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'Esta negociação foi atualizada em outra tela. Reabra a ficha antes de salvar.';END IF;
INSERT INTO public.vanessa_deal_financials(lead_id,workspace_id,property_id,partner_id,deal_kind,deal_value_cents,commission_mode,commission_bps,commission_cents,received_cents,due_on,notes,updated_by)
VALUES(_lead_id,ws,_property_id,_partner_id,_kind,_value_cents,_mode,CASE WHEN _mode='percentual' THEN _bps ELSE NULL END,total,_received_cents,_due_on,COALESCE(_notes,''),auth.uid())
ON CONFLICT(lead_id) DO UPDATE SET property_id=EXCLUDED.property_id,partner_id=EXCLUDED.partner_id,deal_kind=EXCLUDED.deal_kind,deal_value_cents=EXCLUDED.deal_value_cents,commission_mode=EXCLUDED.commission_mode,commission_bps=EXCLUDED.commission_bps,commission_cents=EXCLUDED.commission_cents,received_cents=EXCLUDED.received_cents,due_on=EXCLUDED.due_on,notes=EXCLUDED.notes,updated_by=auth.uid(),updated_at=clock_timestamp() RETURNING * INTO saved;
UPDATE public.leads SET value=_value_cents::numeric/100,updated_at=clock_timestamp() WHERE id=_lead_id AND workspace_id=ws;
INSERT INTO public.lead_activities(workspace_id,lead_id,type,payload) VALUES(ws,_lead_id,'note',jsonb_build_object('source','vanessa_finance','text','Dados de VGV e comissão atualizados. Recebimento informado pelo operador.','actor_id',auth.uid(),'deal_value_cents',_value_cents,'commission_cents',total,'received_cents',_received_cents));
RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.vanessa_save_financials(uuid,text,bigint,text,integer,bigint,bigint,uuid,uuid,date,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vanessa_save_financials(uuid,text,bigint,text,integer,bigint,bigint,uuid,uuid,date,text,timestamptz) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
SELECT '51-vgv-commissions' AS file,'OK' AS status;


-- 20261031007000_vanessa_site_chat.sql
BEGIN;
CREATE TABLE public.vanessa_site_chats(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL DEFAULT '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' REFERENCES public.workspaces(id),messages jsonb NOT NULL DEFAULT '[]',facts jsonb NOT NULL DEFAULT '{}',lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,contact_name text,contact_phone text,consent_at timestamptz,automation_dispatched boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.vanessa_site_chats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vanessa_site_chats FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vanessa_site_chats TO authenticated;
GRANT ALL ON public.vanessa_site_chats TO service_role;
CREATE POLICY vanessa_chat_member_read ON public.vanessa_site_chats FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id) AND private.slim_session_security_allowed());
CREATE INDEX vanessa_chat_lead_idx ON public.vanessa_site_chats(workspace_id,lead_id,updated_at DESC);
INSERT INTO public.lead_custom_fields(workspace_id,name,field_type) SELECT '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698',x.name,x.kind FROM (VALUES('Idade','number'),('Orçamento','number'),('Quartos desejados','number')) x(name,kind) WHERE NOT EXISTS(SELECT 1 FROM public.lead_custom_fields f WHERE f.workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' AND lower(f.name)=lower(x.name));
CREATE OR REPLACE FUNCTION public.vanessa_register_site_contact(_chat_id uuid,_name text,_phone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.vanessa_site_chats;l public.leads;src uuid;pl uuid;st uuid;made boolean:=false;digits text;target_field_id uuid;kv record;label text;
BEGIN
SELECT * INTO c FROM public.vanessa_site_chats WHERE id=_chat_id AND workspace_id='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698' FOR UPDATE;
IF c.id IS NULL OR c.created_at<now()-interval '24 hours' THEN RAISE EXCEPTION 'Conversa expirada.';END IF;
digits:=regexp_replace(_phone,'[^0-9]','','g');IF length(btrim(_name))<2 OR length(_name)>120 OR length(digits)<10 OR length(digits)>15 THEN RAISE EXCEPTION 'Confira seu nome e WhatsApp.';END IF;
IF c.lead_id IS NOT NULL AND regexp_replace(c.contact_phone,'[^0-9]','','g') IS DISTINCT FROM digits THEN RAISE EXCEPTION 'Este atendimento já está associado a outro WhatsApp. Inicie uma nova conversa.';END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(c.workspace_id::text||':'||digits,0));
IF c.lead_id IS NOT NULL THEN SELECT * INTO l FROM public.leads WHERE id=c.lead_id AND workspace_id=c.workspace_id;END IF;
IF l.id IS NULL THEN SELECT * INTO l FROM public.leads WHERE workspace_id=c.workspace_id AND CASE WHEN phone LIKE '+%' THEN regexp_replace(phone,'[^0-9]','','g') WHEN length(regexp_replace(COALESCE(phone,''),'[^0-9]','','g')) IN (10,11) THEN '55'||regexp_replace(phone,'[^0-9]','','g') ELSE regexp_replace(COALESCE(phone,''),'[^0-9]','','g') END=digits ORDER BY created_at LIMIT 1;END IF;
IF l.id IS NULL THEN
SELECT s.id,p.id,ps.id INTO src,pl,st FROM public.crm_sources s JOIN public.pipelines p ON p.crm_source_id=s.id AND p.workspace_id=s.workspace_id JOIN public.pipeline_stages ps ON ps.pipeline_id=p.id AND ps.workspace_id=p.workspace_id WHERE s.workspace_id=c.workspace_id ORDER BY s.is_default DESC,p.position,p.created_at,ps.position,ps.created_at LIMIT 1;
IF st IS NULL THEN RAISE EXCEPTION 'Funil de atendimento indisponível.';END IF;
INSERT INTO public.leads(workspace_id,crm_source_id,pipeline_id,stage_id,name,phone,value,status,source,tags,custom_data) VALUES(c.workspace_id,src,pl,st,btrim(_name),'+'||digits,0,'active','site-assistente','["site","atendimento-ia"]'::jsonb,jsonb_build_object('site_chat_id',c.id,'whatsapp_contact_consent',true)) RETURNING * INTO l;made:=true;
END IF;
IF c.lead_id IS NULL THEN INSERT INTO public.lead_activities(workspace_id,lead_id,type,payload) VALUES(c.workspace_id,l.id,'note',jsonb_build_object('source','site-assistente','text','Cliente solicitou atendimento por WhatsApp no chat do site.','chat_id',c.id,'consent_at',now(),'conversation',c.messages));END IF;
FOR kv IN SELECT key,value FROM jsonb_each_text(c.facts) LOOP
label:=CASE kv.key WHEN 'age' THEN 'Idade' WHEN 'city' THEN 'cidade' WHEN 'budget' THEN 'Orçamento' WHEN 'bedrooms' THEN 'Quartos desejados' ELSE NULL END;
IF label IS NOT NULL AND length(kv.value)<300 THEN SELECT f.id INTO target_field_id FROM public.lead_custom_fields f WHERE f.workspace_id=c.workspace_id AND lower(f.name)=lower(label) AND f.active LIMIT 1;IF target_field_id IS NOT NULL THEN INSERT INTO public.lead_custom_field_values(workspace_id,lead_id,field_id,value) VALUES(c.workspace_id,l.id,target_field_id,jsonb_build_object('display',kv.value,'raw',jsonb_build_array(kv.value),'source','site-chat','chat_id',c.id)) ON CONFLICT(lead_id,field_id) DO UPDATE SET value=EXCLUDED.value,updated_at=now();END IF;END IF;
END LOOP;
UPDATE public.vanessa_site_chats SET lead_id=l.id,contact_name=btrim(_name),contact_phone='+'||digits,consent_at=COALESCE(consent_at,now()),automation_dispatched=CASE WHEN NOT made AND c.lead_id IS NULL THEN true ELSE automation_dispatched END,updated_at=now() WHERE id=c.id;
RETURN jsonb_build_object('leadId',l.id,'leadCreated',made,'pipelineId',l.pipeline_id,'stageId',l.stage_id,'automationDispatched',CASE WHEN NOT made AND c.lead_id IS NULL THEN true ELSE c.automation_dispatched END);
END $$;
REVOKE ALL ON FUNCTION public.vanessa_register_site_contact(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vanessa_register_site_contact(uuid,text,text) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
SELECT '52-site-chat' AS file,'OK' AS status;
