import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// In-memory PostgreSQL only. Importing this module does not run SQL or contact a
// service. The fixture mirrors the column/grant metadata read on 17 Oct 2026.
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const roles = new Set(['postgres', 'authenticated', 'anon', 'service_role']);

export async function createSlimCopilotFixture() {
  const db = new PGlite({ extensions: { pgcrypto } });
  const ids = Object.fromEntries([
    'workspace', 'otherWorkspace', 'owner', 'operator', 'viewer', 'expired', 'outsider',
    'source', 'otherSource', 'pipeline', 'otherPipeline', 'fromStage', 'toStage', 'laterStage', 'otherStage',
    'lead', 'otherLead', 'secondLead', 'bot', 'secondBot', 'otherBot', 'block', 'secondBlock', 'otherBlock',
    'session', 'secondSession', 'otherSession', 'automation',
  ].map(key => [key, randomUUID()]));
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const setActor = async (id = ids.owner, role = 'authenticated') => {
    assert(roles.has(role));
    await db.exec(role === 'postgres' ? 'SET ROLE NONE' : 'SET ROLE ' + role);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
  };
  const privileged = async fn => {
    const role = await scalar('SELECT current_user');
    assert(roles.has(role));
    await db.exec('SET ROLE NONE');
    let failure;
    try { return await fn(); }
    catch (error) { failure = error; throw error; }
    finally {
      try { await db.exec(role === 'postgres' ? 'SET ROLE NONE' : 'SET ROLE ' + role); }
      catch (error) { if (!failure) throw error; } // caller rolls back the failed savepoint
    }
  };
  try {
    await db.exec(read('scripts/fixtures/slim-legacy-isolated-schema.sql'));
    await db.exec(`
      CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),current_workspace_id uuid REFERENCES public.workspaces(id));
      CREATE TABLE public.crm_sources(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),name text NOT NULL);
      CREATE TABLE public.pipelines(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),crm_source_id uuid REFERENCES public.crm_sources(id),name text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
      CREATE TABLE public.pipeline_stages(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),pipeline_id uuid NOT NULL REFERENCES public.pipelines(id),name text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
      CREATE TABLE public.crm_source_funnels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),crm_source_id uuid NOT NULL REFERENCES public.crm_sources(id),pipeline_id uuid NOT NULL REFERENCES public.pipelines(id));
      ALTER TABLE public.leads
        ADD COLUMN crm_source_id uuid REFERENCES public.crm_sources(id),
        ADD COLUMN pipeline_id uuid REFERENCES public.pipelines(id),
        ADD COLUMN stage_id uuid REFERENCES public.pipeline_stages(id),
        ADD COLUMN company_id uuid,
        ADD COLUMN phone_normalized text,
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        ADD COLUMN last_message_from text,
        ADD COLUMN ai_paused boolean NOT NULL DEFAULT true;
      CREATE TABLE public.salesbots(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),name text NOT NULL,is_active boolean NOT NULL DEFAULT false,scope text NOT NULL DEFAULT 'individual',settings jsonb NOT NULL DEFAULT '{}',gatilhos jsonb NOT NULL DEFAULT '[]',trigger text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
      -- Live salesbot_blocks has no created_at/updated_at; do not mask that gap.
      CREATE TABLE public.salesbot_blocks(id uuid PRIMARY KEY,salesbot_id uuid NOT NULL REFERENCES public.salesbots(id),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),local_id text,type text NOT NULL,config jsonb NOT NULL DEFAULT '{}',position_x numeric,position_y numeric,next_block_id uuid);
      CREATE TABLE public.lead_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),lead_id uuid NOT NULL REFERENCES public.leads(id),type text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT clock_timestamp());
      CREATE TABLE public.whatsapp_web_sessions(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),provider text NOT NULL DEFAULT 'evolution',instance_id text NOT NULL,token_encrypted bytea,webhook_secret text,status text NOT NULL DEFAULT 'conectado',phone_number text,metadata jsonb NOT NULL DEFAULT '{}',last_qr text,last_connected_at timestamptz,last_disconnected_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
      CREATE TABLE public.whatsapp_web_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),session_id uuid NOT NULL REFERENCES public.whatsapp_web_sessions(id),message_id text NOT NULL,remote_jid text,to_jid text,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),from_me boolean NOT NULL DEFAULT false,body text,raw jsonb NOT NULL DEFAULT '{}',UNIQUE(workspace_id,session_id,message_id));
      CREATE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=clock_timestamp();RETURN NEW;END $$;
      CREATE PUBLICATION supabase_realtime;
    `);
    const helpers = read('supabase/migrations/20261012185151_saude_slim_private_rls_helpers.sql');
    await db.exec(helpers.slice(helpers.indexOf('create or replace function private.is_workspace_member'), helpers.indexOf('grant usage on schema private')));
    await db.exec('GRANT EXECUTE ON FUNCTION private.is_workspace_member(uuid,uuid) TO authenticated,service_role');
    await db.exec(read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql'));
    await db.exec(read('supabase/migrations/20261015013145_slim_inbox_per_conversation_automation_controls.sql'));
    await db.exec(read('supabase/migrations/20261016153000_slim_stage_move_outbox.sql'));
    const migrations = readdirSync(new URL('supabase/migrations/', root));
    for (const suffix of ['_slim_funnel_create_bulk_outbox.sql', '_slim_copilot_approval_ledger.sql']) {
      const matching = migrations.filter(path => path.endsWith(suffix));
      assert.equal(matching.length, 1, 'Expected exactly one CLI-generated migration: ' + suffix);
      await db.exec(read('supabase/migrations/' + matching[0]));
    }
    for (const id of [ids.owner, ids.operator, ids.viewer, ids.expired, ids.outsider]) {
      await db.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
    }
    await db.query("INSERT INTO public.workspaces(id,owner_id,name) VALUES($1,$2,'Isolated Slim'),($3,$4,'Foreign isolated workspace')", [ids.workspace, ids.owner, ids.otherWorkspace, ids.outsider]);
    for (const [user, workspace, role, expired] of [
      [ids.owner, ids.workspace, 'funcionario', false], [ids.operator, ids.workspace, 'funcionario', false],
      [ids.viewer, ids.workspace, 'visualizador', false], [ids.expired, ids.workspace, 'funcionario', true],
      [ids.outsider, ids.otherWorkspace, 'funcionario', false],
    ]) {
      await db.query('INSERT INTO public.profiles(id,current_workspace_id) VALUES($1,$2)', [user, workspace]);
      await db.query("INSERT INTO public.workspace_members(workspace_id,user_id,role_type,access_expires_at) VALUES($1,$2,$3,CASE WHEN $4 THEN clock_timestamp()-interval '1 day' ELSE NULL END)", [workspace, user, role, expired]);
    }
    await db.query("INSERT INTO public.crm_sources VALUES($1,$2,'CRM'),($3,$4,'Foreign CRM')", [ids.source, ids.workspace, ids.otherSource, ids.otherWorkspace]);
    await db.query("INSERT INTO public.pipelines(id,workspace_id,crm_source_id,name) VALUES($1,$2,$3,'Vendas'),($4,$5,$6,'Foreign pipeline')", [ids.pipeline, ids.workspace, ids.source, ids.otherPipeline, ids.otherWorkspace, ids.otherSource]);
    for (const [id, workspace, pipeline, name] of [
      [ids.fromStage, ids.workspace, ids.pipeline, 'Novo'], [ids.toStage, ids.workspace, ids.pipeline, 'Em atendimento'],
      [ids.laterStage, ids.workspace, ids.pipeline, 'Concluído'], [ids.otherStage, ids.otherWorkspace, ids.otherPipeline, 'Foreign stage'],
    ]) await db.query('INSERT INTO public.pipeline_stages(id,workspace_id,pipeline_id,name) VALUES($1,$2,$3,$4)', [id, workspace, pipeline, name]);
    for (const [id, workspace, source, pipeline, stage, name, phone, session] of [
      [ids.lead, ids.workspace, ids.source, ids.pipeline, ids.fromStage, 'Contato isolado', '+5511900000001', ids.session],
      [ids.secondLead, ids.workspace, ids.source, ids.pipeline, ids.fromStage, 'Segundo contato isolado', '+5511900000002', ids.secondSession],
      [ids.otherLead, ids.otherWorkspace, ids.otherSource, ids.otherPipeline, ids.otherStage, 'Contato externo isolado', '+5511900000003', ids.otherSession],
    ]) await db.query("INSERT INTO public.leads(id,workspace_id,crm_source_id,pipeline_id,stage_id,name,phone,phone_normalized,source,last_message_from,custom_data) VALUES($1,$2,$3,$4,$5,$6,$7,substr($7,2),'whatsapp','lead',jsonb_build_object('whatsapp_session_id',$8::text,'unread',true,'preserved','yes'))", [id, workspace, source, pipeline, stage, name, phone, session]);
    for (const [id, workspace, phone] of [[ids.session, ids.workspace, '+551130000001'], [ids.secondSession, ids.workspace, '+551130000002'], [ids.otherSession, ids.otherWorkspace, '+551130000003']]) {
      await db.query("INSERT INTO public.whatsapp_web_sessions(id,workspace_id,instance_id,phone_number,token_encrypted,webhook_secret) VALUES($1::uuid,$2,'isolated-'||($1::uuid)::text,$3,'\\x00'::bytea,'fixture-secret')", [id, workspace, phone]);
    }
    for (const [id, block, workspace, name] of [[ids.bot, ids.block, ids.workspace, 'SalesBot isolado'], [ids.secondBot, ids.secondBlock, ids.workspace, 'Segundo SalesBot'], [ids.otherBot, ids.otherBlock, ids.otherWorkspace, 'Foreign bot']]) {
      await db.query("INSERT INTO public.salesbots(id,workspace_id,name,is_active,settings) VALUES($1,$2,$3,true,'{\"mode\":\"test\"}')", [id, workspace, name]);
      await db.query("INSERT INTO public.salesbot_blocks(id,salesbot_id,workspace_id,type,config) VALUES($1,$2,$3,'send-message','{\"text\":\"Isolated fixture only\"}')", [block, id, workspace]);
    }
    await db.query("INSERT INTO public.crm_stage_automations(id,workspace_id,pipeline_id,stage_id,action_id,action) VALUES($1,$2,$3,$4,'fixture-stage-action',$5)", [ids.automation, ids.workspace, ids.pipeline, ids.toStage, { id: 'fixture-stage-action', type: 'salesbot', enabled: true, stageIds: [ids.toStage], config: { salesbotId: ids.bot } }]);
    // Existing caller grants, including column-level sessions and SELECT-only runs.
    await db.exec(`
      DO $$ DECLARE t text; BEGIN
        FOREACH t IN ARRAY ARRAY['leads','crm_sources','pipelines','pipeline_stages','crm_source_funnels','salesbots','salesbot_blocks','lead_activities','whatsapp_web_messages'] LOOP
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
          EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
          EXECUTE format('CREATE POLICY fixture_members ON public.%I FOR ALL TO authenticated USING(private.is_workspace_member(workspace_id,auth.uid())) WITH CHECK(private.is_workspace_member(workspace_id,auth.uid()))',t);
        END LOOP;
      END $$;
      REVOKE UPDATE,DELETE ON public.whatsapp_web_messages FROM authenticated;
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,UPDATE ON public.profiles TO authenticated;
      CREATE POLICY fixture_self ON public.profiles FOR ALL TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
      GRANT SELECT ON public.workspaces,public.workspace_members TO authenticated;
      ALTER TABLE public.whatsapp_web_sessions ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.whatsapp_web_sessions FROM PUBLIC,anon,authenticated;
      GRANT SELECT(id,workspace_id,provider,instance_id,status,phone_number,metadata,last_connected_at,last_disconnected_at,created_at,updated_at) ON public.whatsapp_web_sessions TO authenticated;
      GRANT UPDATE(metadata,status,phone_number,last_connected_at,last_disconnected_at,last_qr,updated_at) ON public.whatsapp_web_sessions TO authenticated;
      CREATE POLICY fixture_session_read ON public.whatsapp_web_sessions FOR SELECT TO authenticated USING(private.is_workspace_member(workspace_id,auth.uid()));
      CREATE POLICY fixture_session_update ON public.whatsapp_web_sessions FOR UPDATE TO authenticated USING(private.is_workspace_member(workspace_id,auth.uid())) WITH CHECK(private.is_workspace_member(workspace_id,auth.uid()));
      GRANT ALL ON public.whatsapp_web_sessions TO service_role;
    `);
    const textPayload = (overrides = {}) => ({
      leadId: ids.lead, text: 'Mensagem de teste isolado.\nSem envio externo.', sessionId: ids.session,
      remoteJid: '5511900000001@s.whatsapp.net', number: '5511900000001',
      conversationKey: ids.session + ':5511900000001@s.whatsapp.net', leadPhone: '+5511900000001', ...overrides,
    });
    const create = (kind = 'move_lead_stage', payload = { leadId: ids.lead, stageId: ids.toStage }, requestId = randomUUID(), workspaceId = ids.workspace) =>
      scalar('SELECT public.slim_copilot_create_proposal($1,$2,$3,$4)', [workspaceId, requestId, kind, payload]);
    const decide = (proposal, decision = 'approve', overrides = {}) => {
      const args = { workspaceId: ids.workspace, id: proposal.id, version: proposal.version, decision, ...overrides };
      return scalar('SELECT public.slim_copilot_decide_proposal($1,$2,$3,$4)', [args.workspaceId, args.id, args.version, args.decision]);
    };
    return { db, ids, scalar, setActor, privileged, textPayload, create, decide };
  } catch (error) { await db.close(); throw error; }
}
