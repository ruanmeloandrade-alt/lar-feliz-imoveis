import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSlimCopilotFixture } from './fixtures/slim-copilot-isolated.mjs';
import { parseSlimCopilotProposal } from '../src/lib/slim-copilot-contract.core.ts';
import { normalizeInternationalPhone, whatsappIdentityFromJid } from '../src/lib/whatsapp-identity.ts';
import { contactPhoneKey } from '../src/lib/slim-contact-identity.core.ts';

// Actual PostgreSQL functions, grants, RLS and rollback; no network, production
// rows or worker. PGlite serializes one backend, so this is not a multi-session
// concurrency claim. The tests exercise changed-state interleavings and retries.
let fixture, passed = 0, current = 'load isolated schema';
try {
  fixture = await createSlimCopilotFixture();
  const { db, ids: I, scalar, setActor, privileged, textPayload, create, decide } = fixture;
  const count = table => privileged(() => scalar(`SELECT count(*)::integer FROM ${table}`));
  const update = (sql, args = []) => privileged(() => db.query(sql, args));
  const get = proposal => scalar('SELECT public.slim_copilot_get_proposal($1,$2)', [I.workspace, proposal.id]);
  const list = (workspace = I.workspace) => scalar('SELECT public.slim_copilot_list_proposals($1)', [workspace]);
  const stage = (id = I.lead) => privileged(() => scalar('SELECT stage_id FROM public.leads WHERE id=$1', [id]));
  const start = (bot = I.bot, lead = I.lead) => scalar('SELECT public.slim_inbox_start_salesbot($1,$2,$3,$4)', [I.workspace, lead, bot, randomUUID()]);
  const finish = (claim, outcome, overrides = {}) => {
    const p = { workspaceId: I.workspace, proposalId: claim.proposalId, claimToken: claim.claimToken, outcome, ...overrides };
    return scalar('SELECT public.slim_copilot_finish_text($1,$2,$3,$4)', [p.workspaceId, p.proposalId, p.claimToken, p.outcome]);
  };
  const successfulText = { status: 'succeeded', result: { summary: 'Recibo sintético confirmado.', receiptId: 'SYNTHETIC_PROVIDER_ID', historyPending: false } };
  async function unchanged() {
    assert.equal(await stage(), I.fromStage);
    for (const table of ['public.slim_stage_move_events', 'public.salesbot_runs', 'public.salesbot_run_logs', 'public.crm_automation_jobs', 'public.whatsapp_web_messages', 'public.lead_activities']) assert.equal(await count(table), 0, table);
  }
  async function test(name, fn) {
    current = name;
    await db.exec('BEGIN');
    try { await setActor(); await fn(); passed++; console.log('PASS copilot PostgreSQL: ' + name); }
    finally { await db.exec('ROLLBACK'); await setActor(null, 'postgres'); }
  }
  async function rejects(fn, code = '42501') {
    await db.exec('SAVEPOINT expected_error');
    let error;
    try { await fn(); }
    catch (err) { error = err; await db.exec('ROLLBACK TO SAVEPOINT expected_error'); }
    await db.exec('RELEASE SAVEPOINT expected_error');
    assert(error, 'Expected rejection');
    assert.equal(error.code, code, error.message);
    return error;
  }
  async function expire(proposal) {
    // Test-clock fixture only: protected immutable timestamps are never edited
    // by application code, and no real time delay is needed.
    await privileged(async () => {
      await db.exec('ALTER TABLE private.slim_copilot_proposals DISABLE TRIGGER slim_copilot_immutable_proposal');
      await db.query("UPDATE private.slim_copilot_proposals SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [proposal.id]);
      await db.exec('ALTER TABLE private.slim_copilot_proposals ENABLE TRIGGER slim_copilot_immutable_proposal');
    });
  }
  const movePayload = (overrides = {}) => ({ leadId: I.lead, stageId: I.toStage, ...overrides });
  const startPayload = (overrides = {}) => ({ leadId: I.lead, botId: I.bot, ...overrides });

  await test('public entrypoints are invoker and private definer helpers execute no business RPC', async () => {
    const rows = await privileged(() => db.query("SELECT n.nspname,p.proname,p.prosecdef,pg_get_functiondef(p.oid) body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'slim_copilot_%' AND n.nspname IN ('public','private')"));
    const publicRows = rows.rows.filter(r => r.nspname === 'public');
    assert.equal(publicRows.length, 5);
    for (const row of publicRows) assert.equal(row.prosecdef, false, row.proname);
    for (const row of rows.rows.filter(r => r.nspname === 'private' && r.prosecdef)) assert(!/public\.slim_(?:move_lead_and_emit|inbox_(?:start|stop)_salesbot)\s*\(/.test(row.body), row.proname);
    assert.equal(await scalar("SELECT has_table_privilege('authenticated','public.salesbot_runs','UPDATE')"), false);
    assert.equal(await scalar("SELECT has_table_privilege('authenticated','public.whatsapp_web_messages','UPDATE')"), false);
    assert.equal(await scalar("SELECT has_table_privilege('authenticated','public.whatsapp_web_messages','DELETE')"), false);
    assert.equal(await scalar("SELECT has_table_privilege('authenticated','public.whatsapp_web_sessions','SELECT')"), false);
    assert.equal(await scalar("SELECT has_column_privilege('authenticated','public.whatsapp_web_sessions','status','UPDATE')"), true);
    assert.equal(await scalar("SELECT has_column_privilege('authenticated','public.whatsapp_web_sessions','token_encrypted','SELECT')"), false);
    await rejects(() => db.query('SELECT * FROM private.slim_copilot_proposals'));
    await rejects(() => db.query('SELECT * FROM private.slim_copilot_proposal_audit'));
    await rejects(() => db.query('SELECT token_encrypted FROM public.whatsapp_web_sessions'));
  });
  await test('preparing a move saves an immutable preview without moving, queuing or sending', async () => {
    const p = await create();
    assert.equal(p.status, 'pending'); assert.equal(p.kind, 'move_lead_stage');
    assert.equal(p.preview.targetLabel, 'Contato isolado'); assert.equal(p.preview.changes[1].before, 'Novo');
    assert.equal(p.preview.changes[1].after, 'Em atendimento'); assert(p.preview.effects.some(x => /gatilhos/.test(x)));
    assert(p.preview.cost); assert.equal(await count('private.slim_copilot_proposals'), 1);
    assert.equal(await count('private.slim_copilot_proposal_audit'), 1); await unchanged();
    parseSlimCopilotProposal(p, { workspaceId: I.workspace, actorId: I.owner });
  });
  await test('all proposal kinds prepare without performing their action', async () => {
    const bot = await create('start_salesbot', startPayload());
    const msg = await create('send_text', textPayload());
    assert.equal(bot.status, 'pending'); assert.equal(msg.status, 'pending');
    assert.equal(msg.preview.content, textPayload().text); await unchanged();
    const live = await start();
    const stop = await create('stop_salesbot', { leadId: I.lead, runId: live.runId });
    assert.equal(stop.status, 'pending'); assert.equal(await scalar('SELECT status FROM public.salesbot_runs WHERE id=$1', [live.runId]), 'queued');
  });
  for (const [label, actor, role] of [['no JWT', null, 'authenticated'], ['anonymous', null, 'anon'], ['viewer', I.viewer, 'authenticated'], ['expired member', I.expired, 'authenticated'], ['other workspace member', I.outsider, 'authenticated']]) {
    await test(`${label} cannot prepare a proposal or action`, async () => {
      await setActor(actor, role); await rejects(() => create()); await unchanged();
      assert.equal(await count('private.slim_copilot_proposals'), 0);
    });
  }
  await test('workspace switch blocks decisions even if membership remains valid', async () => {
    const p = await create();
    await update('UPDATE public.profiles SET current_workspace_id=$1 WHERE id=$2', [I.otherWorkspace, I.owner]);
    await rejects(() => decide(p)); await unchanged();
  });
  await test('another operator cannot list or approve the requester proposal', async () => {
    const p = await create(); await setActor(I.operator);
    assert.deepEqual(await list(), []); await rejects(() => get(p)); await rejects(() => decide(p)); await unchanged();
  });
  await test('viewer and expired access are rechecked at the time of approval', async () => {
    await setActor(I.operator); const p = await create();
    await update("UPDATE public.workspace_members SET role_type='visualizador' WHERE workspace_id=$1 AND user_id=$2", [I.workspace, I.operator]);
    await rejects(() => decide(p));
    await update("UPDATE public.workspace_members SET role_type='funcionario',access_expires_at=clock_timestamp()-interval '1 second' WHERE workspace_id=$1 AND user_id=$2", [I.workspace, I.operator]);
    await rejects(() => decide(p)); await unchanged();
  });
  await test('cross-workspace lead, stage, bot, and session references are refused', async () => {
    await rejects(() => create('move_lead_stage', movePayload({ leadId: I.otherLead })));
    await rejects(() => create('move_lead_stage', movePayload({ stageId: I.otherStage })));
    await rejects(() => create('start_salesbot', startPayload({ botId: I.otherBot })));
    await rejects(() => create('send_text', textPayload({ sessionId: I.otherSession, conversationKey: I.otherSession + ':5511900000001@s.whatsapp.net' })));
    await unchanged();
  });
  await test('caller RLS denial remains effective despite ledger definer helpers', async () => {
    await privileged(() => db.exec("CREATE POLICY fixture_hidden_lead ON public.leads AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false)"));
    await rejects(() => create()); await unchanged();
  });
  await test('idempotent proposal request replays the same preview and rejects other payload/actor', async () => {
    const request = randomUUID(), p = await create('move_lead_stage', movePayload(), request);
    assert.deepEqual(await create('move_lead_stage', movePayload(), request), p);
    await rejects(() => create('move_lead_stage', movePayload({ stageId: I.laterStage }), request));
    await setActor(I.operator); await rejects(() => create('move_lead_stage', movePayload(), request));
    assert.equal(await count('private.slim_copilot_proposals'), 1); await unchanged();
  });
  await test('payload, snapshot, version, preview and expiry cannot be overwritten', async () => {
    const p = await create();
    for (const [field, value] of [['payload', { leadId: I.secondLead, stageId: I.toStage }], ['snapshot', {}], ['preview', {}]]) {
      await rejects(() => privileged(() => db.query(`UPDATE private.slim_copilot_proposals SET ${field}=$1 WHERE id=$2`, [value, p.id])), '22023');
    }
    await rejects(() => privileged(() => db.query('UPDATE private.slim_copilot_proposals SET version=$1 WHERE id=$2', [randomUUID(), p.id])), '22023');
    await rejects(() => privileged(() => db.query("UPDATE private.slim_copilot_proposals SET expires_at=clock_timestamp()+interval '1 day' WHERE id=$1", [p.id])), '22023');
    assert.deepEqual(await get(p), p); await unchanged();
  });
  await test('unlisted actions, extra payloads and content tampering are rejected', async () => {
    await rejects(() => create('invite_user', {}), '22023');
    await rejects(() => create('move_lead_stage', { ...movePayload(), approvalRequired: false }), '22023');
    await rejects(() => create('start_salesbot', { ...startPayload(), workspaceId: I.otherWorkspace }), '22023');
    await rejects(() => create('send_text', textPayload({ text: ' ' })), '22023');
    await rejects(() => create('send_text', textPayload({ text: 'x'.repeat(4001) })), '22023');
    await rejects(() => create('send_text', textPayload({ number: '5511900000002' })), '22023');
    await rejects(() => create('send_text', textPayload({ remoteJid: '123456789@g.us' })), '22023');
    await unchanged();
  });
  await test('a decision requires the exact immutable version and a literal decision', async () => {
    const p = await create(); await rejects(() => decide(p, 'approve', { version: randomUUID() }));
    await rejects(() => decide(p, 'yes'), '22023'); await unchanged();
  });
  await test('rejection is durable, idempotent and cannot later turn into approval', async () => {
    const p = await create(), rejected = await decide(p, 'reject');
    assert.equal(rejected.proposal.status, 'rejected'); assert.deepEqual(await decide(p, 'reject'), rejected);
    assert.deepEqual(await decide(p, 'approve'), rejected); await unchanged();
  });
  await test('expired proposals are marked expired and produce no action', async () => {
    const p = await create(); await expire(p); const result = await decide(p);
    assert.equal(result.proposal.status, 'expired'); assert.equal((await get(p)).status, 'expired'); await unchanged();
  });
  await test('approving a move atomically saves one event and one successful proposal receipt', async () => {
    const p = await create(), result = await decide(p);
    assert.equal(result.proposal.status, 'succeeded'); assert.equal(await stage(), I.toStage);
    assert.equal(result.proposal.result.receiptId, p.id); assert.equal(await count('public.slim_stage_move_events'), 1);
    const event = await scalar('SELECT to_jsonb(e) FROM public.slim_stage_move_events e WHERE id=$1', [p.id]);
    assert.equal(event.actor_id, I.owner); assert.equal(event.event_kind, 'moved'); assert.equal(event.from_stage_id, I.fromStage);
    assert.equal(await count('public.salesbot_runs'), 0); assert.equal(await count('public.crm_automation_jobs'), 0);
  });
  await test('duplicate approvals have one effect and one approval audit event', async () => {
    const p = await create(), first = await decide(p);
    const repeats = await Promise.all([decide(p), decide(p), decide(p)]);
    for (const repeat of repeats) assert.deepEqual(repeat, first);
    assert.equal(await count('public.slim_stage_move_events'), 1);
    assert.equal(await privileged(() => scalar("SELECT count(*)::integer FROM private.slim_copilot_proposal_audit WHERE proposal_id=$1 AND event='approve'", [p.id])), 1);
  });
  await test('successful approval replay after a later move returns its original receipt', async () => {
    const p = await create(), first = await decide(p);
    await scalar('SELECT public.slim_move_lead_and_emit($1,$2,$3,$4)', [I.workspace, I.lead, I.laterStage, randomUUID()]);
    assert.deepEqual(await decide(p), first); assert.equal(await stage(), I.laterStage); assert.equal(await count('public.slim_stage_move_events'), 2);
  });
  await test('no-op move approval also has a durable receipt and never moves a later stage back', async () => {
    const p = await create('move_lead_stage', movePayload({ stageId: I.fromStage })), first = await decide(p);
    assert.equal(first.proposal.status, 'succeeded'); assert.equal(await count('public.slim_stage_move_events'), 0);
    await scalar('SELECT public.slim_move_lead_and_emit($1,$2,$3,$4)', [I.workspace, I.lead, I.laterStage, randomUUID()]);
    assert.deepEqual(await decide(p), first); assert.equal(await stage(), I.laterStage); assert.equal(await count('public.slim_stage_move_events'), 1);
  });
  await test('changed source stage becomes stale before the movement RPC', async () => {
    const p = await create(); await update('UPDATE public.leads SET stage_id=$1 WHERE id=$2', [I.laterStage, I.lead]);
    assert.equal((await decide(p)).proposal.status, 'stale'); assert.equal(await stage(), I.laterStage);
    assert.equal(await count('public.slim_stage_move_events'), 0);
  });
  for (const [label, sql, args] of [
    ['archived lead', "UPDATE public.leads SET status='archived' WHERE id=$1", [I.lead]],
    ['merged lead', 'UPDATE public.leads SET merged_into_id=$1 WHERE id=$2', [I.secondLead, I.lead]],
    ['renamed target', "UPDATE public.pipeline_stages SET name='Outra descrição' WHERE id=$1", [I.toStage]],
    ['modified action configuration', "UPDATE public.crm_stage_automations SET action=jsonb_set(action,'{config,new}','true',true) WHERE id=$1", [I.automation]],
    ['disabled stage action', 'UPDATE public.crm_stage_automations SET enabled=false WHERE id=$1', [I.automation]],
    ['changed opt-out', "UPDATE public.leads SET custom_data=custom_data||'{\"opt_out\":true}' WHERE id=$1", [I.lead]],
  ]) {
    await test(`${label} invalidates an existing move proposal`, async () => {
      const p = await create(); await update(sql, args); assert.equal((await decide(p)).proposal.status, 'stale');
      assert.equal(await count('public.slim_stage_move_events'), 0);
    });
  }
  await test('new stage action also invalidates the proposal configuration hash', async () => {
    const p = await create();
    await update("INSERT INTO public.crm_stage_automations(workspace_id,pipeline_id,stage_id,action_id,action) VALUES($1,$2,$3,'new-action','{\"id\":\"new-action\",\"enabled\":true}')", [I.workspace, I.pipeline, I.toStage]);
    assert.equal((await decide(p)).proposal.status, 'stale'); assert.equal(await count('public.slim_stage_move_events'), 0);
  });
  await test('unrelated chat/unread state changes do not invalidate a move or get overwritten', async () => {
    const p = await create(); await update("UPDATE public.leads SET last_message_from='us',custom_data=custom_data||'{\"unread\":false,\"newChatData\":true}',updated_at=clock_timestamp() WHERE id=$1", [I.lead]);
    assert.equal((await decide(p)).proposal.status, 'succeeded');
    assert.deepEqual(await scalar('SELECT jsonb_build_object(\'last\',last_message_from,\'unread\',custom_data->\'unread\',\'new\',custom_data->\'newChatData\') FROM public.leads WHERE id=$1', [I.lead]), { last: 'us', unread: false, new: true });
  });
  await test('receipt failure rolls back lead movement, durable event and underlying request ledger', async () => {
    const p = await create();
    await privileged(() => db.exec(`CREATE FUNCTION private.fixture_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='succeeded' THEN RAISE EXCEPTION 'isolated receipt failure';END IF;RETURN NEW;END $$;
      CREATE TRIGGER fixture_fail_receipt BEFORE UPDATE ON private.slim_copilot_proposals FOR EACH ROW EXECUTE FUNCTION private.fixture_fail_receipt();`));
    const result = await decide(p); assert.equal(result.proposal.status, 'failed');
    assert.equal(await stage(), I.fromStage); assert.equal(await count('public.slim_stage_move_events'), 0);
    assert.equal(await count('private.slim_funnel_write_requests'), 0); assert.deepEqual(await decide(p), result);
  });
  await test('operator access is checked before calling business functions with stronger privileges', async () => {
    await setActor(I.operator); const p = await create('start_salesbot', startPayload());
    await update('DELETE FROM public.workspace_members WHERE workspace_id=$1 AND user_id=$2', [I.workspace, I.operator]);
    await rejects(() => decide(p)); await unchanged();
  });
  await test('start approval queues exactly one run, actor log and receipt without executing blocks', async () => {
    const p = await create('start_salesbot', startPayload()), first = await decide(p);
    assert.equal(first.proposal.status, 'succeeded'); assert.equal(await count('public.salesbot_runs'), 1);
    const run = await scalar('SELECT to_jsonb(r) FROM public.salesbot_runs r WHERE id=$1', [first.proposal.result.receiptId]);
    assert.equal(run.status, 'queued'); assert.equal(run.actor_user_id, I.owner); assert.equal(run.request_id, p.id);
    assert.equal(await count('public.salesbot_run_logs'), 1); assert.equal(await count('public.whatsapp_web_messages'), 0);
    assert.deepEqual(await decide(p), first); assert.equal(await count('public.salesbot_runs'), 1);
  });
  await test('an already-running bot is shown and reused without creating another run', async () => {
    const prior = await start(); const p = await create('start_salesbot', startPayload());
    assert(p.preview.effects.some(x => /Já existe/.test(x))); const result = await decide(p);
    assert.equal(result.proposal.result.receiptId, prior.runId); assert.equal(await count('public.salesbot_runs'), 1);
    assert.equal(await count('public.salesbot_run_logs'), 1);
  });
  for (const [label, sql, args] of [
    ['bot settings', "UPDATE public.salesbots SET settings='{\"mode\":\"changed\"}' WHERE id=$1", [I.bot]],
    ['bot activation', 'UPDATE public.salesbots SET is_active=false WHERE id=$1', [I.bot]],
    ['bot scope', "UPDATE public.salesbots SET scope='group' WHERE id=$1", [I.bot]],
    ['block contents', "UPDATE public.salesbot_blocks SET config='{\"text\":\"changed\"}' WHERE id=$1", [I.block]],
    ['block graph links', 'UPDATE public.salesbot_blocks SET next_block_id=$1 WHERE id=$2', [randomUUID(), I.block]],
  ]) {
    await test(`${label} changes invalidate an approved start snapshot`, async () => {
      const p = await create('start_salesbot', startPayload()); await update(sql, args);
      assert.equal((await decide(p)).proposal.status, 'stale'); assert.equal(await count('public.salesbot_runs'), 0);
    });
  }
  await test('new run started after proposal becomes stale rather than silently approving it', async () => {
    const p = await create('start_salesbot', startPayload()); const other = await start();
    assert.equal((await decide(p)).proposal.status, 'stale'); assert.equal(await count('public.salesbot_runs'), 1);
    assert.equal(await scalar('SELECT status FROM public.salesbot_runs WHERE id=$1', [other.runId]), 'queued');
  });
  await test('stop approval locks and ends only the exact run, retaining audit and other bots', async () => {
    const target = await start(), other = await start(I.secondBot);
    const p = await create('stop_salesbot', { leadId: I.lead, runId: target.runId }), first = await decide(p);
    assert.equal(first.proposal.status, 'succeeded'); assert.equal(first.proposal.result.receiptId, target.runId);
    const run = await scalar('SELECT to_jsonb(r) FROM public.salesbot_runs r WHERE id=$1', [target.runId]);
    assert.equal(run.status, 'finished'); assert.equal(run.stopped_by, I.owner); assert(run.stopped_at);
    assert.equal(await scalar('SELECT status FROM public.salesbot_runs WHERE id=$1', [other.runId]), 'queued');
    assert.deepEqual(await decide(p), first); assert.equal(await count('public.salesbot_run_logs'), 3);
    await rejects(() => db.query('UPDATE public.salesbot_runs SET status=\'running\' WHERE id=$1', [target.runId]));
  });
  await test('worker progress between proposal and stop is detected without stopping its new state', async () => {
    const target = await start(), p = await create('stop_salesbot', { leadId: I.lead, runId: target.runId });
    await update("UPDATE public.salesbot_runs SET status='running',current_block_id=$1 WHERE id=$2", [I.block, target.runId]);
    assert.equal((await decide(p)).proposal.status, 'stale');
    assert.equal(await scalar('SELECT status FROM public.salesbot_runs WHERE id=$1', [target.runId]), 'running');
    assert.equal(await scalar('SELECT stopped_at FROM public.salesbot_runs WHERE id=$1', [target.runId]), null);
  });
  await test('private run lock rejects wrong lead, missing auth, viewer, expired and cross-workspace callers', async () => {
    const target = await start(); const p = await create('stop_salesbot', { leadId: I.lead, runId: target.runId });
    const snapshot = await privileged(() => scalar("SELECT snapshot->'run' FROM private.slim_copilot_proposals WHERE id=$1", [p.id]));
    const lock = (workspace = I.workspace, lead = I.lead) => scalar('SELECT private.slim_copilot_lock_run($1,$2,$3,$4)', [workspace, lead, target.runId, snapshot]);
    await rejects(() => lock(I.workspace, I.secondLead), '40001');
    for (const actor of [null, I.viewer, I.expired, I.outsider]) { await setActor(actor); await rejects(() => lock()); }
    await setActor(I.owner); await rejects(() => lock(I.otherWorkspace));
    assert.equal(await scalar('SELECT status FROM public.salesbot_runs WHERE id=$1', [target.runId]), 'queued');
  });
  await test('opt-out blocks all actions with outbound effects but still permits stopping an existing run', async () => {
    const run = await start();
    await update("UPDATE public.leads SET custom_data=custom_data||'{\"opt_out\":true}' WHERE id=$1", [I.lead]);
    await rejects(() => create()); await rejects(() => create('start_salesbot', startPayload())); await rejects(() => create('send_text', textPayload()));
    const p = await create('stop_salesbot', { leadId: I.lead, runId: run.runId });
    assert.equal((await decide(p)).proposal.status, 'succeeded'); assert.equal(await count('public.slim_stage_move_events'), 0);
  });
  await test('text approval returns the exact immutable claim only once and changes no conversation state', async () => {
    const payload = textPayload({ text: '  Linha 1\nLinha 2\t  ' }); const p = await create('send_text', payload);
    const first = await decide(p); assert.equal(first.proposal.status, 'executing'); assert.equal(first.claim.fresh, true);
    for (const [key, value] of Object.entries(payload)) assert.equal(first.claim[key], value, key);
    assert.equal(first.proposal.preview.content, payload.text); assert.equal(first.claim.actorId, I.owner); assert.equal(first.claim.version, p.version);
    const repeated = await decide(p); assert.equal(repeated.claim, undefined); assert.deepEqual(repeated.proposal, first.proposal);
    const fetched = await get(p); assert(!('claimToken' in fetched)); assert(!('payload' in fetched)); assert(!JSON.stringify(await list()).includes(first.claim.claimToken));
    await unchanged();
    assert.equal(await scalar('SELECT ai_paused FROM public.leads WHERE id=$1', [I.lead]), true);
    assert.equal(await scalar('SELECT last_message_from FROM public.leads WHERE id=$1', [I.lead]), 'lead');
  });
  await test('same text proposal request cannot be reused with edited content', async () => {
    const request = randomUUID(); await create('send_text', textPayload(), request);
    await rejects(() => create('send_text', textPayload({ text: 'Outro conteúdo' }), request)); await unchanged();
  });
  await test('a forged direct number or different original session is rejected', async () => {
    await rejects(() => create('send_text', textPayload({ number: '5511900000002', remoteJid: '5511900000002@s.whatsapp.net', conversationKey: I.session + ':5511900000002@s.whatsapp.net' })));
    await rejects(() => create('send_text', textPayload({ sessionId: I.secondSession, conversationKey: I.secondSession + ':5511900000001@s.whatsapp.net' })));
    await unchanged();
  });
  for (const [label, sql, args] of [
    ['phone', "UPDATE public.leads SET phone='+5511900000099' WHERE id=$1", [I.lead]],
    ['preferred session', "UPDATE public.leads SET custom_data=jsonb_set(custom_data,'{whatsapp_session_id}',to_jsonb($1::text)) WHERE id=$2", [I.secondSession, I.lead]],
    ['session disconnect', "UPDATE public.whatsapp_web_sessions SET status='desconectado' WHERE id=$1", [I.session]],
    ['session deleted flag', "UPDATE public.whatsapp_web_sessions SET metadata='{\"deleted\":true}' WHERE id=$1", [I.session]],
    ['session phone/account', "UPDATE public.whatsapp_web_sessions SET phone_number='+551130000099' WHERE id=$1", [I.session]],
    ['instance identity', "UPDATE public.whatsapp_web_sessions SET instance_id='changed-instance' WHERE id=$1", [I.session]],
    ['opt-out', "UPDATE public.leads SET custom_data=custom_data||'{\"do_not_contact\":true}' WHERE id=$1", [I.lead]],
  ]) {
    await test(`changed text ${label} becomes stale without a send claim`, async () => {
      const p = await create('send_text', textPayload()); await update(sql, args);
      const result = await decide(p); assert.equal(result.proposal.status, 'stale'); assert.equal(result.claim, undefined);
      assert.equal(await count('public.whatsapp_web_messages'), 0); assert.equal(await count('public.lead_activities'), 0);
    });
  }
  await test('new same-route messages do not invalidate approval or copy media into the snapshot', async () => {
    const p = await create('send_text', textPayload());
    await update('INSERT INTO public.lead_activities(workspace_id,lead_id,type,payload) VALUES($1,$2,\'message_in\',$3)', [I.workspace, I.lead, { whatsapp_remote_jid: textPayload().remoteJid, whatsapp_session_id: I.session, base64: 'MEDIA_NEVER_COPY'.repeat(1000) }]);
    const result = await decide(p); assert.equal(result.proposal.status, 'executing'); assert(result.claim);
    const stored = await privileged(() => scalar('SELECT snapshot::text FROM private.slim_copilot_proposals WHERE id=$1', [p.id]));
    assert(!stored.includes('MEDIA_NEVER_COPY'));
  });
  await test('new conflicting technical identity prevents text claim', async () => {
    const p = await create('send_text', textPayload());
    await update('INSERT INTO public.lead_activities(workspace_id,lead_id,type,payload) VALUES($1,$2,\'message_in\',$3)', [I.workspace, I.lead, { whatsapp_remote_jid: '5511900000002@s.whatsapp.net', whatsapp_session_id: I.session }]);
    assert.equal((await decide(p)).proposal.status, 'stale');
  });
  await test('historical direct to_jid resolves its original session when primary JID is invalid', async () => {
    await update('INSERT INTO public.lead_activities(workspace_id,lead_id,type,payload) VALUES($1,$2,\'message_in\',$3)', [I.workspace, I.lead, { whatsapp_message_id: 'HISTORICAL_FIXTURE_ID' }]);
    await update('INSERT INTO public.whatsapp_web_messages(workspace_id,session_id,message_id,remote_jid,to_jid) VALUES($1,$2,$3,$4,$5)', [I.workspace, I.secondSession, 'HISTORICAL_FIXTURE_ID', '999999999@lid', textPayload().remoteJid]);
    const p = await create('send_text', textPayload({ sessionId: I.secondSession, conversationKey: I.secondSession + ':' + textPayload().remoteJid }));
    const approved = await decide(p); assert.equal(approved.proposal.status, 'executing'); assert.equal(approved.claim.sessionId, I.secondSession);
  });
  await test('legacy group, LID or social identity is never converted into a text recipient', async () => {
    for (const jid of ['123456789@g.us', '123456789@lid', 'status@broadcast']) {
      await update('DELETE FROM public.lead_activities');
      await update('INSERT INTO public.lead_activities(workspace_id,lead_id,type,payload) VALUES($1,$2,\'message_in\',$3)', [I.workspace, I.lead, { whatsapp_remote_jid: jid, whatsapp_session_id: I.session }]);
      await rejects(() => create('send_text', textPayload()));
    }
    assert.equal(await count('private.slim_copilot_proposals'), 0);
  });
  await test('PostgreSQL phone keys agree with the adapter, including DDI and Unicode whitespace', async () => {
    for (const value of [null, '', '5511900000001', '+55 (11) 90000-0001', '005511900000001', '+351 912 345 678', '1234567', '+05511900000001', '+5511900000001@g.us', '(+55) 11 90000-0001', '\u00a0+55\u2007(11)\ufeff90000-0001\u2028']) {
      for (const allowTrustedBare of [false, true]) {
        const expected = normalizeInternationalPhone(value, { allowTrustedBare });
        assert.equal(await scalar('SELECT private.slim_copilot_phone($1,$2)', [value, allowTrustedBare]), expected.ok ? expected.digits : null);
      }
      assert.equal(await scalar('SELECT private.slim_copilot_contact_key($1)', [value]), contactPhoneKey(value));
    }
    for (const jid of [null, '', '5511900000001@s.whatsapp.net', '5511900000001:15@s.whatsapp.net', '5511900000001:device@s.whatsapp.net', '120363000000000@g.us', '1234-5678@g.us', '999999999@lid', 'status@broadcast', 'x@s.whatsapp.net', '\u00a05511900000001@S.WHATSAPP.NET\ufeff']) {
      const identity = whatsappIdentityFromJid(jid);
      const actual = await scalar('SELECT private.slim_copilot_jid_identity($1)', [jid]);
      assert.deepEqual(actual, identity ? { kind: identity.kind, number: identity.kind === 'direct' ? identity.number : identity.number.toLowerCase() } : null);
    }
  });
  await test('canonical order alias cannot substitute for its original contact', async () => {
    const alias = randomUUID();
    await update("INSERT INTO public.leads(id,workspace_id,crm_source_id,pipeline_id,stage_id,name,phone,source,custom_data) VALUES($1,$2,$3,$4,$5,'Legacy alias','+5511900000001','pedido_saude_slim',jsonb_build_object('whatsapp_session_id',$6::text))", [alias, I.workspace, I.source, I.pipeline, I.fromStage, I.session]);
    await rejects(() => create('move_lead_stage', movePayload({ leadId: alias })), '40001');
    assert.equal(await count('public.slim_stage_move_events'), 0);
  });
  await test('authenticated caller cannot forge provider completion even with its own claim token', async () => {
    const p = await create('send_text', textPayload()), { claim } = await decide(p);
    await rejects(() => finish(claim, successfulText));
    assert.equal((await get(p)).status, 'executing');
  });
  await test('service completion needs the exact workspace and durable claim token', async () => {
    const p = await create('send_text', textPayload()), { claim } = await decide(p); await setActor(null, 'service_role');
    await rejects(() => finish(claim, successfulText, { claimToken: randomUUID() }));
    await rejects(() => finish(claim, successfulText, { workspaceId: I.otherWorkspace }));
    await rejects(() => finish(claim, { status: 'succeeded', result: { summary: 'Missing provider id' } }), '22023');
    await rejects(() => finish(claim, { ...successfulText, forged: true }), '22023');
  });
  await test('confirmed provider receipt is idempotent and retains a history-pending result', async () => {
    const p = await create('send_text', textPayload()), { claim } = await decide(p);
    await setActor(null, 'service_role');
    const outcome = { ...successfulText, result: { ...successfulText.result, historyPending: true } };
    const first = await finish(claim, outcome); assert.equal(first.status, 'succeeded'); assert.equal(first.result.historyPending, true);
    assert.deepEqual(await finish(claim, outcome), first);
    await rejects(() => finish(claim, { status: 'failed', result: { summary: 'Changed final receipt' } }));
    await setActor(); assert.deepEqual(await get(p), first); assert.equal((await decide(p)).claim, undefined);
    assert.equal(await privileged(() => scalar("SELECT count(*)::integer FROM private.slim_copilot_proposal_audit WHERE proposal_id=$1 AND event='provider_result'", [p.id])), 1);
  });
  for (const state of ['uncertain', 'failed', 'stale']) {
    await test(`text result ${state} is terminal and is never claimed again`, async () => {
      const p = await create('send_text', textPayload()), { claim } = await decide(p); await setActor(null, 'service_role');
      await finish(claim, { status: state, result: { summary: 'Synthetic ' + state, code: 'ISOLATED_' + state.toUpperCase() } });
      await setActor(); const replay = await decide(p); assert.equal(replay.proposal.status, state); assert.equal(replay.claim, undefined);
      assert.equal(await count('public.whatsapp_web_messages'), 0);
    });
  }
  await test('orphaned text claim becomes uncertain after its deadline and is never retried', async () => {
    const p = await create('send_text', textPayload()), { claim } = await decide(p);
    await update("UPDATE private.slim_copilot_proposals SET claimed_at=clock_timestamp()-interval '3 minutes' WHERE id=$1", [p.id]);
    assert.equal((await get(p)).status, 'uncertain'); const replay = await decide(p);
    assert.equal(replay.proposal.status, 'uncertain'); assert.equal(replay.claim, undefined);
    // A late, authentic server receipt may still resolve this timeout state.
    await setActor(null, 'service_role'); assert.equal((await finish(claim, successfulText)).status, 'succeeded');
  });
  await test('list and get return only display DTOs scoped to the current requester', async () => {
    const p = await create('send_text', textPayload()), { claim } = await decide(p); const rows = await list();
    assert.equal(rows.length, 1); assert.equal(rows[0].id, p.id);
    for (const field of ['payload', 'snapshot', 'claim_token', 'claimToken', 'request_sha256']) assert(!Object.hasOwn(rows[0], field));
    assert(!JSON.stringify(rows).includes(claim.claimToken));
    parseSlimCopilotProposal(rows[0], { workspaceId: I.workspace, actorId: I.owner });
    await setActor(I.operator); assert.deepEqual(await list(), []);
  });
  console.log(`Copilot isolated PostgreSQL: ${passed}/${passed} passed. No provider, worker or production operation was executed.`);
} catch (error) {
  console.error(JSON.stringify({ test: current, passed, code: error.code, message: error.message, where: error.where }, null, 2));
  process.exitCode = 1;
} finally { if (fixture) await fixture.db.close(); }
