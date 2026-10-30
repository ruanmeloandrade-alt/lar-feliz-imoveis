import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { contactPhoneKey } from '../src/lib/slim-contact-identity.core.ts';

// Disposable PostgreSQL only. No network connection, real lead, job, or message.
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const pg = new PGlite({ extensions: { pgcrypto } });
const W = randomUUID(), OTHER = randomUUID();
const owner = randomUUID(), operator = randomUUID(), viewer = randomUUID(), outsider = randomUUID();
const source = randomUUID(), linkedSource = randomUUID(), unusedSource = randomUUID(), foreignSource = randomUUID();
const pipe = randomUUID(), linkedPipe = randomUUID(), unrelatedPipe = randomUUID(), foreignPipe = randomUUID();
const from = randomUUID(), to = randomUUID(), linkedStage = randomUUID(), unrelatedStage = randomUUID();
const foreignStage = randomUUID(), corruptStage = randomUUID();
const lead = randomUUID(), selected = randomUUID(), sibling = randomUUID(), historicalLead = randomUUID(), foreignLead = randomUUID();
const company = randomUUID(), historicalRequest = randomUUID();
let baselineLeads = 0, baselineEvents = 0, n = 0;

const scalar = async (sql, args = []) => Object.values((await pg.query(sql, args)).rows[0])[0];
async function actor(id = owner) {
  await pg.exec('SET LOCAL ROLE authenticated');
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id]);
}
async function privilegedScalar(sql, args = []) {
  const role = await scalar('SELECT current_user');
  assert(['postgres', 'authenticated', 'anon', 'service_role'].includes(role));
  await pg.exec('SET LOCAL ROLE NONE');
  try { return await scalar(sql, args); }
  finally { await pg.exec(role === 'postgres' ? 'SET LOCAL ROLE NONE' : 'SET LOCAL ROLE ' + role); }
}
async function test(name, fn) {
  await pg.exec('BEGIN');
  try { await fn(); n++; console.log('PASS funnel PostgreSQL: ' + name); }
  finally { await pg.exec('ROLLBACK'); }
}
async function reject(fn, code = '42501') {
  await pg.exec('SAVEPOINT rejected');
  let error;
  try { await fn(); }
  catch (err) { error = err; await pg.exec('ROLLBACK TO SAVEPOINT rejected'); }
  await pg.exec('RELEASE SAVEPOINT rejected');
  assert(error, 'Expected rejection');
  assert.equal(error.code, code, error.message);
  return error;
}
function create(overrides = {}) {
  const data = {
    workspaceId: W, crmSourceId: source, pipelineId: pipe, stageId: to,
    name: 'Novo cliente', email: 'qa@example.invalid', phone: null, value: 10,
    requestId: randomUUID(), ...overrides,
  };
  return scalar('SELECT public.slim_create_lead_and_emit($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
    data.workspaceId, data.crmSourceId, data.pipelineId, data.stageId,
    data.name, data.email, data.phone, data.value, data.requestId,
  ]);
}
const move = (request = randomUUID(), stage = to, ws = W, id = lead) =>
  scalar('SELECT public.slim_move_lead_and_emit($1,$2,$3,$4)', [ws, id, stage, request]);
const bulk = (ids = [lead, selected], stage = to, request = randomUUID(), ws = W) =>
  scalar('SELECT public.slim_bulk_move_leads_and_emit($1,$2,$3,$4)', [ws, ids, stage, request]);
const stageOf = id => scalar('SELECT stage_id FROM public.leads WHERE id=$1', [id]);
const eventCount = () => privilegedScalar('SELECT count(*)::int FROM public.slim_stage_move_events');
const leadCount = () => privilegedScalar('SELECT count(*)::int FROM public.leads');
const receiptCount = () => privilegedScalar('SELECT count(*)::int FROM private.slim_funnel_write_requests');
async function noNewWrites() {
  assert.equal(await leadCount(), baselineLeads);
  assert.equal(await eventCount(), baselineEvents);
  assert.equal(await receiptCount(), 0);
}

try {
  await pg.exec(read('scripts/fixtures/slim-legacy-isolated-schema.sql'));
  await pg.exec(`
    CREATE TABLE public.crm_sources(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id));
    CREATE TABLE public.pipelines(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),crm_source_id uuid REFERENCES public.crm_sources(id));
    CREATE TABLE public.pipeline_stages(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),pipeline_id uuid NOT NULL REFERENCES public.pipelines(id));
    CREATE TABLE public.crm_source_funnels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),crm_source_id uuid NOT NULL REFERENCES public.crm_sources(id),pipeline_id uuid NOT NULL REFERENCES public.pipelines(id));
    ALTER TABLE public.leads
      ADD COLUMN crm_source_id uuid REFERENCES public.crm_sources(id),
      ADD COLUMN pipeline_id uuid REFERENCES public.pipelines(id),
      ADD COLUMN stage_id uuid REFERENCES public.pipeline_stages(id),
      ADD COLUMN company_id uuid,
      ADD COLUMN phone_normalized text,
      ADD COLUMN updated_at timestamptz DEFAULT clock_timestamp(),
      ADD COLUMN last_message_from text;
  `);
  // Load the exact established access helper and the already shipped outbox migration.
  await pg.exec(read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql').split('CREATE TABLE public.crm_lead_audiences')[0]);
  await pg.exec(read('supabase/migrations/20261016153000_slim_stage_move_outbox.sql'));
  for (const id of [owner, operator, viewer, outsider]) await pg.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
  await pg.query("INSERT INTO public.workspaces(id,owner_id,name) VALUES($1,$2,'Isolated workspace'),($3,$4,'Foreign isolated workspace')", [W, owner, OTHER, outsider]);
  await pg.query("INSERT INTO public.workspace_members(workspace_id,user_id,role_type) VALUES($1,$2,'funcionario'),($1,$3,'visualizador')", [W, operator, viewer]);
  await pg.query('INSERT INTO public.crm_sources VALUES($1,$2),($3,$2),($4,$2),($5,$6)', [source, W, linkedSource, unusedSource, foreignSource, OTHER]);
  await pg.query('INSERT INTO public.pipelines VALUES($1,$2,$3),($4,$2,NULL),($5,$2,$6),($7,$8,$9)', [pipe, W, source, linkedPipe, unrelatedPipe, unusedSource, foreignPipe, OTHER, foreignSource]);
  await pg.query('INSERT INTO public.pipeline_stages VALUES($1,$2,$3),($4,$2,$3),($5,$2,$6),($7,$2,$8),($9,$10,$11),($12,$2,$11)', [from, W, pipe, to, linkedStage, linkedPipe, unrelatedStage, unrelatedPipe, foreignStage, OTHER, foreignPipe, corruptStage]);
  await pg.query('INSERT INTO public.crm_source_funnels(workspace_id,crm_source_id,pipeline_id) VALUES($1,$2,$3),($1,$4,$3)', [W, source, linkedPipe, linkedSource]);
  for (const [id, name] of [[lead, 'Selected A'], [selected, 'Selected B'], [sibling, 'Unselected company sibling'], [historicalLead, 'Historical contact']]) {
    await pg.query("INSERT INTO public.leads(id,workspace_id,name,crm_source_id,pipeline_id,stage_id,company_id,last_message_from,custom_data) VALUES($1,$2,$3,$4,$5,$6,$7,'lead','{\"unread\":true,\"marker\":\"keep\"}')", [id, W, name, source, pipe, from, company]);
  }
  await pg.query("INSERT INTO public.leads(id,workspace_id,name,crm_source_id,pipeline_id,stage_id) VALUES($1,$2,'Foreign contact',$3,$4,$5)", [foreignLead, OTHER, foreignSource, foreignPipe, foreignStage]);
  await pg.exec(`
    ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.leads TO authenticated;
    CREATE POLICY test_lead_read ON public.leads FOR SELECT TO authenticated USING(private.slim_workspace_access(workspace_id));
  `);
  // A genuine invocation of the OLD function creates a receipt-less historical event.
  await pg.exec('BEGIN'); await actor(); await move(historicalRequest, to, W, historicalLead); await pg.exec('COMMIT');
  await pg.query('UPDATE public.leads SET stage_id=$1 WHERE id=$2', [from, historicalLead]);
  const migrations = readdirSync(new URL('supabase/migrations/', root)).filter(path => path.endsWith('_slim_funnel_create_bulk_outbox.sql'));
  assert.equal(migrations.length, 1, 'Expected one CLI-generated additive migration');
  await pg.exec(read('supabase/migrations/' + migrations[0]));
  baselineLeads = await scalar('SELECT count(*)::int FROM public.leads');
  baselineEvents = await scalar('SELECT count(*)::int FROM public.slim_stage_move_events');
  assert.equal(baselineEvents, 1);

  await test('creation inserts the lead and created event together', async () => {
    await actor(); const result = await create();
    assert.equal(result.ok, true); assert.equal(result.id, result.leadId); assert.equal(result.state, 'pending');
    assert.equal(await leadCount(), baselineLeads + 1); assert.equal(await eventCount(), baselineEvents + 1);
    const event = (await pg.query('SELECT * FROM public.slim_stage_move_events WHERE id=$1', [result.eventId])).rows[0];
    assert.equal(event.event_kind, 'created'); assert.equal(event.from_stage_id, null);
    assert.equal(event.to_stage_id, to); assert.equal(event.pipeline_id, pipe); assert.equal(event.actor_id, owner);
    assert.equal(event.workspace_id, W); assert.equal(event.lead_id, result.leadId);
  });
  await test('manual fields are normalized and conversation defaults are preserved', async () => {
    await actor(); const result = await create({ name: '  Cadastro  ', email: '  ', phone: '  ', value: null });
    const item = (await pg.query('SELECT name,email,phone,value,source,status,last_message_from FROM public.leads WHERE id=$1', [result.leadId])).rows[0];
    assert.deepEqual(item, { name: 'Cadastro', email: null, phone: null, value: '0.00', source: 'cadastro_manual_saude_slim', status: 'active', last_message_from: 'none' });
  });
  await test('database phone keys match the existing contactPhoneKey including whitespace and DDI', async () => {
    const whitespace = ['\t', '\n', '\v', '\f', '\r', ' ', '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff'];
    const phones = [
      null, '', '   ', '1234567', '12345678', '123456789012345', '1234567890123456',
      '+55 (11) 90000-0001', '5511900000001', '11 90000-0001', '+1 (11) 90000-0001',
      '(+55) 11 90000-0001', '++5511900000001', '55+11900000001', '55/11900000001',
      '5511900000001@g.us', '5511900000001@s.whatsapp.net', 'phone5511900000001',
      '１２３４５６７８', '١٢٣٤٥٦٧٨', '().- ', '+', '\u0085+5511900000001\u0085',
      ...whitespace.map(space => space + '+55' + space + '(11)' + space + '90000-0001' + space),
    ];
    for (const phone of phones) {
      assert.equal(await scalar('SELECT private.slim_funnel_contact_phone_key($1)', [phone]), contactPhoneKey(phone), JSON.stringify(phone));
    }
  });
  await test('creation writes phone_normalized and explicit initial conversation state with null table defaults', async () => {
    await actor(); const result = await create({ phone: '\u00a0+55 (11) 90000-0001\ufeff' });
    const item = (await pg.query('SELECT phone,phone_normalized,last_message_from FROM public.leads WHERE id=$1', [result.leadId])).rows[0];
    assert.deepEqual(item, { phone: '+55 (11) 90000-0001', phone_normalized: '5511900000001', last_message_from: 'none' });
  });
  await test('equivalent formatted phones are rejected without modifying the existing contact or creating an event', async () => {
    await pg.query("UPDATE public.leads SET phone=$1,phone_normalized=NULL,crm_source_id=$2,pipeline_id=$3,stage_id=$4,source='pedido_saude_slim' WHERE id=$5", ['+55 (11) 90000-0001', unusedSource, unrelatedPipe, unrelatedStage, lead]);
    const before = await scalar('SELECT to_jsonb(l) FROM public.leads l WHERE id=$1', [lead]);
    await actor();
    for (const phone of ['5511900000001', '+55 11 90000 0001', '55.11.90000.0001', '\t+55\u00a0(11)\n90000-0001\ufeff']) {
      const error = await reject(() => create({ phone }), '23505');
      assert.equal(error.message, 'Este telefone já possui um contato. Use o cadastro existente; a etapa e os dados dele foram preservados.');
    }
    assert.deepEqual(await scalar('SELECT to_jsonb(l) FROM public.leads l WHERE id=$1', [lead]), before);
    await noNewWrites();
  });
  await test('creation replay returns its own saved result before the duplicate-phone guard', async () => {
    await actor(); const requestId = randomUUID(), phone = '+55 (11) 90000-0001';
    const first = await create({ requestId, phone });
    assert.deepEqual(await create({ requestId, phone }), first);
    await reject(() => create({ phone: '5511900000001' }), '23505');
    assert.equal(await leadCount(), baselineLeads + 1); assert.equal(await eventCount(), baselineEvents + 1);
    assert.equal(await receiptCount(), 1);
  });
  await test('phone identity preserves different DDI values and does not infer a missing DDI', async () => {
    await pg.query('UPDATE public.leads SET phone=$1 WHERE id=$2', ['+55 (11) 90000-0001', lead]);
    await actor();
    const foreignDDI = await create({ phone: '+1 (11) 90000-0001' });
    const noDDI = await create({ phone: '11 90000-0001' });
    assert.equal(await scalar('SELECT phone_normalized FROM public.leads WHERE id=$1', [foreignDDI.leadId]), '111900000001');
    assert.equal(await scalar('SELECT phone_normalized FROM public.leads WHERE id=$1', [noDDI.leadId]), '11900000001');
    assert.equal(await leadCount(), baselineLeads + 2);
  });
  for (const status of ['archived', 'deleted', 'merged']) {
    await test('an existing ' + status + ' row does not block a new eligible contact', async () => {
      await pg.query('UPDATE public.leads SET phone=$1,status=$2 WHERE id=$3', ['+55 (11) 90000-0001', status, lead]);
      await actor(); const result = await create({ phone: '5511900000001' });
      assert.notEqual(result.leadId, lead); assert.equal(await scalar('SELECT status FROM public.leads WHERE id=$1', [lead]), status);
      assert.equal(await stageOf(lead), from); assert.equal(await eventCount(), baselineEvents + 1);
    });
  }
  await test('an existing merged_into_id row does not block new creation or get repaired', async () => {
    await pg.query('UPDATE public.leads SET phone=$1,merged_into_id=$2 WHERE id=$3', ['+55 (11) 90000-0001', sibling, lead]);
    const before = await scalar('SELECT to_jsonb(l) FROM public.leads l WHERE id=$1', [lead]);
    await actor(); const result = await create({ phone: '5511900000001' });
    assert.notEqual(result.leadId, lead);
    assert.deepEqual(await scalar('SELECT to_jsonb(l) FROM public.leads l WHERE id=$1', [lead]), before);
  });
  await test('same phone in another workspace cannot block creation or be modified', async () => {
    await pg.query('UPDATE public.leads SET phone=$1 WHERE id=$2', ['+55 (11) 90000-0001', foreignLead]);
    const before = await scalar('SELECT to_jsonb(l) FROM public.leads l WHERE id=$1', [foreignLead]);
    await actor(); assert.equal((await create({ phone: '5511900000001' })).ok, true);
    assert.deepEqual(await privilegedScalar('SELECT to_jsonb(l) FROM public.leads l WHERE id=$1', [foreignLead]), before);
  });
  await test('blank phones remain null and malformed nonblank phones are not turned into identities', async () => {
    await actor();
    for (const phone of ['1234567', '1234567890123456', '++5511900000001', '5511900000001@g.us', 'phone5511900000001', '55/11900000001']) {
      await reject(() => create({ phone }), '22023');
    }
    await noNewWrites();
    const requestId = randomUUID(), first = await create({ requestId, phone: '\t \u00a0\ufeff' });
    assert.deepEqual(await create({ requestId, phone: null }), first);
    assert.equal(await scalar('SELECT phone FROM public.leads WHERE id=$1', [first.leadId]), null);
    assert.equal(await scalar('SELECT phone_normalized FROM public.leads WHERE id=$1', [first.leadId]), null);
  });
  await test('a primary source association works without a separate link row', async () => {
    await actor(); assert.equal((await create()).ok, true);
    assert.equal(await privilegedScalar('SELECT count(*)::int FROM public.crm_source_funnels WHERE pipeline_id=$1', [pipe]), 0);
  });
  await test('an explicitly linked source works with no primary pipeline source', async () => {
    await actor(); const result = await create({ crmSourceId: linkedSource, pipelineId: linkedPipe, stageId: linkedStage });
    assert.equal(await stageOf(result.leadId), linkedStage);
  });
  await test('creation replay normalizes whitespace and numeric scale without a second insert', async () => {
    await actor(); const requestId = randomUUID();
    const first = await create({ requestId, name: ' Cadastro ', email: ' qa@example.invalid ', value: '1.00' });
    const second = await create({ requestId, name: 'Cadastro', value: 1 });
    assert.deepEqual(second, first); assert.equal(await leadCount(), baselineLeads + 1); assert.equal(await receiptCount(), 1);
    const fingerprint = await privilegedScalar('SELECT request_fingerprint FROM private.slim_funnel_write_requests WHERE request_id=$1', [requestId]);
    assert.match(fingerprint, /^[0-9a-f]{64}$/);
  });
  await test('creation replay does not overwrite later edits to the created customer', async () => {
    await actor(); const requestId = randomUUID(), result = await create({ requestId });
    await pg.exec('SET LOCAL ROLE NONE'); await pg.query("UPDATE public.leads SET name='Later edit',stage_id=$1 WHERE id=$2", [from, result.leadId]);
    await actor(); assert.deepEqual(await create({ requestId }), result);
    assert.equal(await scalar('SELECT name FROM public.leads WHERE id=$1', [result.leadId]), 'Later edit');
    assert.equal(await stageOf(result.leadId), from); assert.equal(await eventCount(), baselineEvents + 1);
  });
  await test('creation rejects a reused request with changed payload or another actor', async () => {
    await actor(); const requestId = randomUUID(); await create({ requestId });
    await reject(() => create({ requestId, name: 'Different' }), '22023');
    await reject(() => create({ requestId, phone: '123' }), '22023');
    await reject(() => create({ requestId, value: 11 }), '22023');
    await actor(operator); await reject(() => create({ requestId }), '22023');
    assert.equal(await leadCount(), baselineLeads + 1); assert.equal(await receiptCount(), 1);
  });
  await test('creation rejects cross-company or unlinked source/pipeline/stage combinations', async () => {
    await actor();
    for (const patch of [
      { crmSourceId: foreignSource }, { crmSourceId: unusedSource },
      { pipelineId: foreignPipe, stageId: foreignStage },
      { stageId: linkedStage }, { pipelineId: foreignPipe, stageId: corruptStage },
    ]) await reject(() => create(patch));
    await noNewWrites();
  });
  await test('creation rejects missing references, blank names and non-finite values', async () => {
    await actor();
    for (const patch of [{ requestId: null }, { crmSourceId: null }, { name: ' ' }, { name: null }, { name: 'x'.repeat(201) }, { email: 'x'.repeat(255) }, { phone: '1'.repeat(65) }, { value: -1 }, { value: 'NaN' }, { value: 'Infinity' }, { value: '-Infinity' }]) {
      await reject(() => create(patch), '22023');
    }
    await noNewWrites();
  });
  await test('creation rolls back its lead if writing the event fails', async () => {
    await pg.exec("CREATE FUNCTION public.test_block_created_event() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event_kind='created' THEN RAISE EXCEPTION 'Isolated event failure' USING ERRCODE='22023'; END IF; RETURN NEW; END$$; CREATE TRIGGER test_block_created_event BEFORE INSERT ON public.slim_stage_move_events FOR EACH ROW EXECUTE FUNCTION public.test_block_created_event();");
    await actor(); await reject(() => create(), '22023'); await noNewWrites();
  });
  await test('failed lead insertion leaves no event or request receipt', async () => {
    await pg.exec("CREATE FUNCTION public.test_block_lead_insert() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Isolated lead failure' USING ERRCODE='22023'; END$$; CREATE TRIGGER test_block_lead_insert BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.test_block_lead_insert();");
    await actor(); await reject(() => create(), '22023'); await noNewWrites();
  });
  await test('a receipt cannot be reused for a different operation kind', async () => {
    await actor(); const request = randomUUID(); await create({ requestId: request });
    await reject(() => move(request), '22023'); await reject(() => bulk([lead], to, request), '22023');
    assert.equal(await stageOf(lead), from); assert.equal(await eventCount(), baselineEvents + 1);
  });
  await test('only an authenticated current operator can create or move', async () => {
    for (const id of [viewer, outsider]) {
      await actor(id); await reject(() => create()); await reject(() => move()); await reject(() => bulk());
    }
    await actor(''); await reject(() => create()); await reject(() => move()); await reject(() => bulk());
    await noNewWrites();
  });
  await test('expired membership is denied even when replaying a prior success', async () => {
    await actor(operator); const requestId = randomUUID(); await create({ requestId });
    await pg.exec('SET LOCAL ROLE NONE');
    await pg.query("UPDATE public.workspace_members SET access_expires_at=clock_timestamp()-interval '1 hour' WHERE user_id=$1", [operator]);
    await actor(operator); await reject(() => create({ requestId })); await reject(() => move()); await reject(() => bulk());
    assert.equal(await receiptCount(), 1);
  });
  await test('authorized operators can use all three RPCs', async () => {
    await actor(operator); assert.equal((await create()).ok, true); assert.equal((await move()).moved, true);
    assert.equal((await bulk([selected])).movedCount, 1);
  });
  await test('unitary move retains its event id and preserves chat and company siblings', async () => {
    await actor(); const request = randomUUID(), result = await move(request);
    assert.equal(result.eventId, request); assert.equal(result.moved, true); assert.equal(await stageOf(lead), to);
    assert.equal(await stageOf(sibling), from); assert.equal(await stageOf(selected), from);
    assert.equal(await scalar('SELECT last_message_from FROM public.leads WHERE id=$1', [lead]), 'lead');
    assert.deepEqual(await scalar('SELECT custom_data FROM public.leads WHERE id=$1', [lead]), { unread: true, marker: 'keep' });
    assert.equal(await scalar('SELECT event_kind FROM public.slim_stage_move_events WHERE id=$1', [request]), 'moved');
  });
  await test('unitary replay after a later move cannot move the customer back again', async () => {
    await actor(); const request = randomUUID(), result = await move(request); await move(randomUUID(), from);
    assert.deepEqual(await move(request), result); assert.equal(await stageOf(lead), from);
    assert.equal(await eventCount(), baselineEvents + 2);
  });
  await test('unitary no-op has a durable receipt and remains a no-op on a delayed replay', async () => {
    await actor(); const request = randomUUID(), first = await move(request, from);
    assert.equal(first.moved, false); assert.equal(first.eventId, null); assert.equal(first.state, 'unchanged');
    await move(randomUUID(), to); assert.deepEqual(await move(request, from), first);
    assert.equal(await stageOf(lead), to); assert.equal(await eventCount(), baselineEvents + 1); assert.equal(await receiptCount(), 2);
  });
  await test('unitary requests cannot change destination, lead or approving actor on replay', async () => {
    await actor(); const request = randomUUID(); await move(request);
    await reject(() => move(request, from), '22023'); await reject(() => move(request, to, W, selected), '22023');
    await actor(operator); await reject(() => move(request), '22023');
    assert.equal(await eventCount(), baselineEvents + 1);
  });
  await test('unitary move validates source association and destination pipeline workspace', async () => {
    await actor(); await reject(() => move(randomUUID(), unrelatedStage));
    await reject(() => move(randomUUID(), foreignStage)); await reject(() => move(randomUUID(), corruptStage));
    assert.equal(await stageOf(lead), from); await noNewWrites();
  });
  await test('unitary move supports an explicitly linked destination source', async () => {
    await actor(); assert.equal((await move(randomUUID(), linkedStage)).moved, true); assert.equal(await stageOf(lead), linkedStage);
  });
  await test('historical events written before this migration replay without a new movement', async () => {
    await actor(); const first = await move(historicalRequest, to, W, historicalLead);
    assert.equal(first.eventId, historicalRequest); assert.equal(first.moved, true);
    assert.equal(await stageOf(historicalLead), from); assert.equal(await eventCount(), baselineEvents);
    assert.equal(await receiptCount(), 1); assert.deepEqual(await move(historicalRequest, to, W, historicalLead), first);
  });
  await test('historical event references reject another actor, destination and contact', async () => {
    await actor(); await reject(() => move(historicalRequest, from, W, historicalLead), '22023');
    await reject(() => move(historicalRequest, to, W, lead), '22023');
    await actor(operator); await reject(() => move(historicalRequest, to, W, historicalLead), '22023');
    await noNewWrites();
  });
  await test('create and bulk cannot occupy a request already used by a historical move', async () => {
    await actor();
    await reject(() => create({ requestId: historicalRequest }), '22023');
    await reject(() => bulk([lead], to, historicalRequest), '22023');
    await noNewWrites();
    assert.equal((await move(historicalRequest, to, W, historicalLead)).eventId, historicalRequest);
    assert.equal(await stageOf(historicalLead), from);
  });
  await test('a created event id cannot be reinterpreted as a movement request', async () => {
    await actor(); const result = await create();
    await reject(() => move(result.eventId, to, W, result.leadId), '22023');
    assert.equal(await eventCount(), baselineEvents + 1);
  });
  await test('bulk movement changes only explicitly selected customer ids', async () => {
    await actor(); const result = await bulk();
    assert.equal(result.ok, true); assert.equal(result.count, 2); assert.equal(result.movedCount, 2); assert.equal(result.unchangedCount, 0);
    assert.equal(result.eventIds.length, 2); assert.equal(new Set(result.eventIds).size, 2);
    assert.equal(await stageOf(lead), to); assert.equal(await stageOf(selected), to);
    assert.equal(await stageOf(sibling), from); assert.equal(await stageOf(historicalLead), from);
    assert.equal(await scalar('SELECT last_message_from FROM public.leads WHERE id=$1', [lead]), 'lead');
    assert.equal(await eventCount(), baselineEvents + 2);
  });
  await test('bulk mixed changes and no-ops produce one event per changed contact', async () => {
    await pg.query('UPDATE public.leads SET stage_id=$1 WHERE id=$2', [to, lead]);
    await actor(); const result = await bulk();
    assert.equal(result.count, 2); assert.equal(result.movedCount, 1); assert.equal(result.unchangedCount, 1);
    assert.equal(result.eventIds.length, 1); assert.equal(await eventCount(), baselineEvents + 1);
  });
  await test('bulk replay is stable when selection order changes', async () => {
    await actor(); const request = randomUUID(), first = await bulk([lead, selected], to, request);
    assert.deepEqual(await bulk([selected, lead], to, request), first);
    assert.equal(await eventCount(), baselineEvents + 2); assert.equal(await receiptCount(), 3);
  });
  await test('bulk replay after later movements preserves the original receipt without changing leads again', async () => {
    await actor(); const request = randomUUID(), first = await bulk([lead, selected], to, request);
    await move(randomUUID(), from, W, lead); await move(randomUUID(), from, W, selected);
    assert.deepEqual(await bulk([lead, selected], to, request), first);
    assert.equal(await stageOf(lead), from); assert.equal(await stageOf(selected), from);
    assert.equal(await eventCount(), baselineEvents + 4);
  });
  await test('bulk no-op receipt survives a later independent move', async () => {
    await actor(); const request = randomUUID(), first = await bulk([lead, selected], from, request);
    assert.equal(first.movedCount, 0); assert.equal(first.unchangedCount, 2); assert.deepEqual(first.eventIds, []);
    await move(); assert.deepEqual(await bulk([selected, lead], from, request), first);
    assert.equal(await stageOf(lead), to); assert.equal(await eventCount(), baselineEvents + 1);
  });
  await test('bulk replay rejects changed selection, destination or actor', async () => {
    await actor(); const request = randomUUID(); await bulk([lead, selected], to, request);
    await reject(() => bulk([lead], to, request), '22023'); await reject(() => bulk([lead, selected], from, request), '22023');
    await actor(operator); await reject(() => bulk([lead, selected], to, request), '22023');
    assert.equal(await eventCount(), baselineEvents + 2);
  });
  await test('bulk validates array bounds, null ids and duplicates before any changes', async () => {
    await actor();
    for (const ids of [[], null, [lead, lead], [lead, null], Array.from({ length: 101 }, () => randomUUID())]) {
      await reject(() => bulk(ids), '22023');
    }
    await reject(() => bulk([lead], null), '22023'); await reject(() => bulk([lead], to, null), '22023');
    await noNewWrites();
  });
  await test('bulk rejects a foreign or missing member without moving the valid selection', async () => {
    await actor(); await reject(() => bulk([lead, foreignLead])); await reject(() => bulk([lead, randomUUID()]));
    assert.equal(await stageOf(lead), from); await noNewWrites();
  });
  await test('unitary and bulk reject archived, deleted and merged customers', async () => {
    for (const status of ['archived', 'deleted', 'merged']) {
      await pg.exec('SET LOCAL ROLE NONE'); await pg.query('UPDATE public.leads SET status=$1 WHERE id=$2', [status, selected]);
      await actor(); await reject(() => move(randomUUID(), to, W, selected)); await reject(() => bulk());
    }
    assert.equal(await stageOf(lead), from); await noNewWrites();
  });
  await test('merged_into_id blocks movement even when status remains active', async () => {
    await pg.query('UPDATE public.leads SET merged_into_id=$1 WHERE id=$2', [sibling, selected]);
    await actor(); await reject(() => move(randomUUID(), to, W, selected)); await reject(() => bulk()); await noNewWrites();
  });
  await test('existing won and lost statuses retain the old unitary movement semantics', async () => {
    await pg.query("UPDATE public.leads SET status=CASE WHEN id=$1 THEN 'won' ELSE 'lost' END WHERE id=ANY($2)", [lead, [lead, selected]]);
    await actor(); assert.equal((await bulk()).movedCount, 2);
    assert.equal(await scalar('SELECT status FROM public.leads WHERE id=$1', [lead]), 'won');
    assert.equal(await scalar('SELECT status FROM public.leads WHERE id=$1', [selected]), 'lost');
  });
  await test('bulk rejects an unlinked or missing source before moving any selected contact', async () => {
    await pg.query('UPDATE public.leads SET crm_source_id=$1 WHERE id=$2', [unusedSource, selected]);
    await actor(); await reject(() => bulk()); assert.equal(await stageOf(lead), from); await noNewWrites();
    await pg.exec('SET LOCAL ROLE NONE'); await pg.query('UPDATE public.leads SET crm_source_id=NULL WHERE id=$1', [selected]);
    await actor(); await reject(() => bulk()); await noNewWrites();
  });
  await test('bulk rejects a destination whose pipeline belongs to another company', async () => {
    await actor(); await reject(() => bulk([lead, selected], corruptStage));
    await reject(() => bulk([lead, selected], foreignStage)); await noNewWrites();
  });
  await test('a second update failure rolls back all bulk movements, events and receipts', async () => {
    const last = [lead, selected].sort().at(-1);
    await pg.exec(`CREATE FUNCTION public.test_block_last_move() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='${last}'::uuid THEN RAISE EXCEPTION 'Isolated second update failure' USING ERRCODE='22023'; END IF; RETURN NEW; END$$; CREATE TRIGGER test_block_last_move BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.test_block_last_move();`);
    await actor(); await reject(() => bulk(), '22023');
    assert.equal(await stageOf(lead), from); assert.equal(await stageOf(selected), from); await noNewWrites();
  });
  await test('failure while persisting a private receipt also rolls back lead and event', async () => {
    await pg.exec("CREATE FUNCTION public.test_block_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Isolated receipt failure' USING ERRCODE='22023'; END$$; CREATE TRIGGER test_block_receipt BEFORE INSERT ON private.slim_funnel_write_requests FOR EACH ROW EXECUTE FUNCTION public.test_block_receipt();");
    await actor(); await reject(() => create(), '22023'); await reject(() => move(), '22023'); await reject(() => bulk(), '22023');
    assert.equal(await stageOf(lead), from); await noNewWrites();
  });
  await test('RPC privileges and private ledger are restricted at the database boundary', async () => {
    const signatures = [
      'public.slim_create_lead_and_emit(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid)',
      'public.slim_move_lead_and_emit(uuid,uuid,uuid,uuid)',
      'public.slim_bulk_move_leads_and_emit(uuid,uuid[],uuid,uuid)',
    ];
    for (const signature of signatures) {
      assert.equal(await scalar("SELECT has_function_privilege('anon',$1,'EXECUTE')", [signature]), false);
      assert.equal(await scalar("SELECT has_function_privilege('authenticated',$1,'EXECUTE')", [signature]), true);
      assert.equal(await scalar('SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure', [signature]), false);
    }
    assert.equal(await scalar("SELECT relrowsecurity FROM pg_class WHERE oid='private.slim_funnel_write_requests'::regclass"), true);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal(await scalar("SELECT has_table_privilege($1,'private.slim_funnel_write_requests',$2)", [role, privilege]), false);
      }
    }
    await actor(); await reject(() => pg.query('SELECT * FROM private.slim_funnel_write_requests'));
    assert.equal(await scalar("SELECT has_table_privilege('authenticated','public.slim_stage_move_events','INSERT')"), false);
  });
  await test('outbox records remain hidden from another workspace', async () => {
    await actor(); await create(); await bulk(); await actor(outsider);
    assert.equal(await scalar('SELECT count(*)::int FROM public.slim_stage_move_events'), 0);
  });
  // PGlite has one backend and queues transactions. This checks two simultaneously
  // submitted application requests; it is not a multi-backend lock race simulation.
  const concurrentPg = await pg.clone();
  try {
    const simultaneousCreate = (phone, requestId) => concurrentPg.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
      const result = await tx.query('SELECT public.slim_create_lead_and_emit($1,$2,$3,$4,$5,$6,$7,$8,$9)', [W, source, pipe, to, 'Simultaneous isolated request', null, phone, 0, requestId]);
      return Object.values(result.rows[0])[0];
    });
    const results = await Promise.allSettled([
      simultaneousCreate('+55 (11) 90000-0042', randomUUID()),
      simultaneousCreate('55 11 90000 0042', randomUUID()),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.filter(result => result.status === 'rejected');
    assert.equal(rejected.length, 1); assert.equal(rejected[0].reason.code, '23505');
    assert.equal(Number((await concurrentPg.query('SELECT count(*) FROM public.leads')).rows[0].count), baselineLeads + 1);
    assert.equal(Number((await concurrentPg.query('SELECT count(*) FROM public.slim_stage_move_events')).rows[0].count), baselineEvents + 1);
    assert.equal(Number((await concurrentPg.query('SELECT count(*) FROM private.slim_funnel_write_requests')).rows[0].count), 1);
    n++; console.log('PASS funnel PostgreSQL: two submitted creation requests produce one contact (PGlite serializes transactions)');
  } finally { await concurrentPg.close(); }
  assert.equal(await scalar('SELECT count(*)::int FROM public.leads'), baselineLeads);
  assert.equal(await scalar('SELECT count(*)::int FROM public.slim_stage_move_events'), baselineEvents);
  assert.equal(await scalar('SELECT count(*)::int FROM private.slim_funnel_write_requests'), 0);
  assert.equal(await scalar('SELECT count(*)::int FROM public.slim_orders'), 0);
  console.log(`${n}/${n} isolated funnel PostgreSQL checks passed. No real customer, job or WhatsApp message created.`);
} finally { await pg.close(); }
