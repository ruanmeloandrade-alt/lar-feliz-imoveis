import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareSlimCopilotTextTarget, executeSlimCopilotTextClaim } from '../src/lib/slim-copilot-text.server.ts';

const ws = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000002';
const leadId = '30000000-0000-4000-8000-000000000003';
const sessionId = '40000000-0000-4000-8000-000000000004';
const proposalId = '50000000-0000-4000-8000-000000000005';
const version = '60000000-0000-4000-8000-000000000006';
const claimToken = '70000000-0000-4000-8000-000000000007';
const other = '80000000-0000-4000-8000-000000000008';
const number = '5511999990000', remoteJid = `${number}@s.whatsapp.net`, text = 'Mensagem de teste sintética.\nRevisada pelo operador.';
const input = { workspaceId: ws, leadId, text };
const claim = { fresh: true, proposalId, version, claimToken, workspaceId: ws, actorId: actor, leadId, sessionId,
  text, number, remoteJid, conversationKey: `${sessionId}:${remoteJid}`, leadPhone: '+' + number };

function fixture(options = {}) {
  const traces = [], writes = [], requests = [];
  const lead = { id: leadId, phone: '+' + number, phone_normalized: number, status: 'active', merged_into_id: null,
    custom_data: { whatsapp_session_id: sessionId }, ...options.lead };
  const defaults = {
    profiles: { current_workspace_id: options.activeWorkspace ?? ws },
    workspaces: { owner_id: options.nonOwner ? other : actor },
    workspace_members: options.member ?? null, leads: options.missingLead ? null : lead,
    lead_activities: options.activities ?? [{ id: proposalId, remote_jid: remoteJid, session_id: sessionId, message_id: 'WA-PRIOR' }],
    whatsapp_web_sessions: options.sessions ?? [{ id: sessionId, status: 'conectado', metadata: {} }],
    whatsapp_web_messages: options.messages ?? [],
  };
  const db = {
    from(table) {
      const trace = { table, columns: null, filters: [], inserted: null, limit: null };
      let single = false;
      const run = async () => {
        traces.push(trace);
        if (trace.inserted) {
          writes.push(trace);
          if (options.historyFail === table) return { data: null, error: { code: '57014', message: 'SYNTHETIC_DATABASE_DETAIL' } };
          if (options.historyDuplicate === table) return { data: null, error: { code: '23505' } };
          return { data: { id: trace.inserted.id }, error: null };
        }
        if (options.queryError === table) return { data: null, error: { message: 'SYNTHETIC_DATABASE_DETAIL' } };
        if (single && table === 'whatsapp_web_messages') return { data: options.recordedMessage ?? null, error: null };
        if (single && table === 'lead_activities') return { data: options.recordedActivity ?? null, error: null };
        return { data: defaults[table], error: null };
      };
      const q = {
        select(columns) { trace.columns = columns; return q; },
        eq(key, value) { trace.filters.push(['eq', key, value]); return q; },
        in(key, value) { trace.filters.push(['in', key, value]); return q; },
        order(key, value) { trace.order = [key, value]; return q; },
        limit(value) { trace.limit = value; return q; },
        insert(value) { trace.inserted = value; return q; },
        maybeSingle() { single = true; return run(); },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      return q;
    },
    async rpc(name, params) {
      traces.push({ rpc: name, params });
      assert.equal(name, 'get_evolution_credentials');
      return options.credentialError ? { error: { message: 'SYNTHETIC_SECRET_DETAIL' } }
        : { data: { workspace_id: options.credentialWorkspace ?? ws, status: 'conectado', instance_name: 'synthetic-instance', api_key: 'synthetic-api-key' }, error: null };
    },
  };
  const fetcher = async (url, request) => {
    requests.push({ url, request });
    if (options.fetchThrow) throw new Error('SYNTHETIC_PROVIDER_DETAIL');
    if (options.hang) return new Promise(() => {});
    return options.response?.() ?? new Response(JSON.stringify({ key: { id: 'WA-APPROVED', remoteJid, fromMe: true } }), { status: 201 });
  };
  return { context: { supabase: db, userId: actor }, traces, writes, requests, fetcher };
}
let count = 0;
async function check(name, fn) { await fn(); count++; console.log('PASS copilot text: ' + name); }
const originalKey = process.env.INTEGRATION_ENCRYPTION_KEY, originalUrl = process.env.EVOLUTION_BASE_URL;
// All tests inject a fake fetcher; these strings are fixtures, never real credentials.
process.env.INTEGRATION_ENCRYPTION_KEY = 'synthetic-encryption-key';
process.env.EVOLUTION_BASE_URL = 'https://evolution.example.invalid';
try {
  await check('prepare reads exact identity without credentials, writes or delivery', async () => {
    const f = fixture(); const prepared = await prepareSlimCopilotTextTarget(f.context, input);
    assert.deepEqual(prepared, Object.fromEntries(['leadId','text','sessionId','remoteJid','number','conversationKey','leadPhone'].map(k => [k, claim[k]])));
    assert.equal(f.writes.length, 0); assert.equal(f.requests.length, 0); assert(!f.traces.some(t => t.rpc));
    const history = f.traces.find(t => t.table === 'lead_activities');
    assert(history.columns.includes('payload->>whatsapp_remote_jid')); assert(!/(^|,)payload(,|$)/.test(history.columns)); assert.equal(history.limit, 80);
  });
  await check('foreign active workspace denied without profile fallback', async () => {
    const f = fixture({ activeWorkspace: other }); await assert.rejects(prepareSlimCopilotTextTarget(f.context, input), /empresa ativa/); assert.equal(f.writes.length, 0);
  });
  await check('viewer and expired operator cannot prepare a proposal', async () => {
    for (const member of [{ role_type: 'visualizador' }, { role_type: 'vendas', access_expires_at: '2020-01-01T00:00:00Z' }]) {
      const f = fixture({ nonOwner: true, member }); await assert.rejects(prepareSlimCopilotTextTarget(f.context, input), /permissão/); assert.equal(f.requests.length, 0);
    }
  });
  await check('missing, archived, merged and opted-out contacts denied', async () => {
    for (const options of [{ missingLead: true }, { lead: { status: 'archived' } }, { lead: { merged_into_id: other } }, { lead: { custom_data: { opt_out: true } } }]) {
      const f = fixture(options); await assert.rejects(prepareSlimCopilotTextTarget(f.context, input), /indisponível|bloqueio/);
    }
  });
  await check('group and unrelated phone are not routed as a direct contact', async () => {
    for (const jid of ['120363000000000@g.us', '5511888880000@s.whatsapp.net', '123456789@lid']) {
      const f = fixture({ activities: [{ remote_jid: jid, session_id: sessionId }] }); await assert.rejects(prepareSlimCopilotTextTarget(f.context, input), /identidade/);
    }
  });
  await check('an explicit other session cannot replace the conversation session', async () => {
    const f = fixture(); await assert.rejects(prepareSlimCopilotTextTarget(f.context, { ...input, sessionId: other }), /sessão original/);
  });
  await check('disconnected and deleted sessions fail before any write', async () => {
    for (const sessions of [[], [{ id: sessionId, metadata: { deleted: true } }]]) {
      const f = fixture({ sessions }); await assert.rejects(prepareSlimCopilotTextTarget(f.context, input), /sessão WhatsApp conectada/);
    }
  });
  await check('ambiguous bare phone without trustworthy normalization does not become a recipient', async () => {
    const f = fixture({ activities: [], lead: { phone: number, phone_normalized: null } }); await assert.rejects(prepareSlimCopilotTextTarget(f.context, input), /DDI/);
  });
  await check('empty, oversized and control-byte text rejected', async () => {
    for (const content of ['', ' '.repeat(10), 'a'.repeat(4001), 'bad\u0001text']) {
      const f = fixture(); await assert.rejects(prepareSlimCopilotTextTarget(f.context, { ...input, text: content }), /4.000/);
      assert.equal(f.traces.length, 0);
    }
  });
  await check('exact approved text is sent once and both histories use the provider receipt', async () => {
    const f = fixture(); const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher });
    assert.equal(r.status, 'succeeded'); assert.equal(r.result.receiptId, 'WA-APPROVED'); assert.equal(r.result.historyPending, false);
    assert.equal(f.requests.length, 1); assert.deepEqual(JSON.parse(f.requests[0].request.body), { number, text });
    assert.equal(f.requests[0].request.redirect, 'error');
    assert.equal(f.writes.length, 2); assert.equal(f.writes[0].inserted.message_id, 'WA-APPROVED');
    assert.equal(f.writes[1].inserted.payload.proposal_id, proposalId); assert.equal(f.writes[1].inserted.payload.whatsapp_message_id, 'WA-APPROVED');
    assert(f.writes.every(w => w.inserted.workspace_id === ws)); assert(!JSON.stringify(f.writes).includes('synthetic-api-key'));
  });
  await check('replayed or foreign-actor claims never reach the provider', async () => {
    for (const delta of [{ fresh: false }, { actorId: other }, { claimToken: '' }]) {
      const f = fixture(); const r = await executeSlimCopilotTextClaim(f.context, { ...claim, ...delta }, { fetcher: f.fetcher });
      assert.equal(r.status, 'failed'); assert.equal(f.requests.length, 0);
    }
  });
  await check('changed phone or recipient invalidates a claimed proposal', async () => {
    const f = fixture(); const r = await executeSlimCopilotTextClaim(f.context, { ...claim, number: '5511888880000' }, { fetcher: f.fetcher });
    assert.equal(r.status, 'stale'); assert.equal(f.requests.length, 0); assert.equal(f.writes.length, 0);
  });
  await check('credential from a different company cannot be used', async () => {
    const f = fixture({ credentialWorkspace: other }); const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher });
    assert.equal(r.status, 'failed'); assert.equal(f.requests.length, 0);
  });
  await check('credential outage is bounded preparation failure with no internal detail', async () => {
    const f = fixture({ credentialError: true }); const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher });
    assert.equal(r.status, 'failed'); assert.equal(f.requests.length, 0); assert(!JSON.stringify(r).includes('SYNTHETIC_SECRET_DETAIL'));
  });
  await check('aborted request before POST never sends', async () => {
    const f = fixture(), controller = new AbortController(); controller.abort();
    const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher, signal: controller.signal });
    assert.equal(r.status, 'failed'); assert.equal(f.requests.length, 0);
  });
  await check('timeout and network errors are uncertain with exactly one request and no retry', async () => {
    for (const options of [{ hang: true }, { fetchThrow: true }]) {
      const f = fixture(options); const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher, timeoutMs: 15 });
      assert.equal(r.status, 'uncertain'); assert.equal(f.requests.length, 1); assert.equal(f.writes.length, 0);
      assert(!JSON.stringify(r).includes('SYNTHETIC_PROVIDER_DETAIL'));
    }
  });
  await check('successful HTTP without provider ID is not a confirmed send', async () => {
    const f = fixture({ response: () => new Response('{}', { status: 200 }) }); const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher });
    assert.equal(r.status, 'uncertain'); assert.equal(f.requests.length, 1); assert.equal(f.writes.length, 0);
  });
  await check('oversized body and stalled response stream stay uncertain and bounded', async () => {
    for (const response of [() => new Response('x'.repeat(2048)), () => new Response(new ReadableStream({ start() {} }))]) {
      const f = fixture({ response }); const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher, timeoutMs: 15, maxBodyBytes: 1024 });
      assert.equal(r.status, 'uncertain'); assert.equal(f.requests.length, 1); assert.equal(f.writes.length, 0);
    }
  });
  await check('receipt for another recipient or direction is not accepted', async () => {
    for (const key of [{ id: 'WA-WRONG', remoteJid: '5511888880000@s.whatsapp.net' }, { id: 'WA-WRONG', fromMe: false }]) {
      const f = fixture({ response: () => new Response(JSON.stringify({ key })) }); const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher });
      assert.equal(r.status, 'uncertain'); assert.equal(f.writes.length, 0);
    }
  });
  await check('provider rejection and upstream failure are not shown as success', async () => {
    for (const [status, expected] of [[400, 'failed'], [401, 'failed'], [503, 'uncertain']]) {
      const f = fixture({ response: () => new Response('{}', { status }) }); const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher });
      assert.equal(r.status, expected); assert.equal(f.requests.length, 1); assert.equal(f.writes.length, 0);
    }
  });
  await check('partial history failure keeps the accepted provider receipt without resending', async () => {
    for (const historyFail of ['whatsapp_web_messages', 'lead_activities']) {
      const f = fixture({ historyFail }); const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher });
      assert.equal(r.status, 'succeeded'); assert.equal(r.result.historyPending, true); assert.equal(r.result.receiptId, 'WA-APPROVED'); assert.equal(f.requests.length, 1);
    }
  });
  await check('webhook duplicate requires exact session/receipt/recipient and content evidence', async () => {
    const f = fixture({ historyDuplicate: 'whatsapp_web_messages', recordedMessage: { id: other, remote_jid: remoteJid, from_me: true, body: text } });
    const r = await executeSlimCopilotTextClaim(f.context, claim, { fetcher: f.fetcher }); assert.equal(r.result.historyPending, false); assert.equal(f.requests.length, 1);
    const read = f.traces.find(t => t.table === 'whatsapp_web_messages' && !t.inserted);
    assert(read.filters.some(([op,k,v]) => op === 'eq' && k === 'session_id' && v === sessionId));
    const wrong = fixture({ historyDuplicate: 'whatsapp_web_messages', recordedMessage: { id: other, remote_jid: 'other', from_me: true, body: text } });
    const refused = await executeSlimCopilotTextClaim(wrong.context, claim, { fetcher: wrong.fetcher }); assert.equal(refused.result.historyPending, true);
  });
  await check('new adapter cannot invoke legacy auto-pause, credentials admin or media transport fallback', () => {
    const source = fs.readFileSync(new URL('../src/lib/slim-copilot-text.server.ts', import.meta.url), 'utf8');
    assert(!/sendLeadMessage|pauseLeadAiAgentInternal|supabaseAdmin|resolveActiveWorkspace|requireActiveWorkspace/.test(source));
    assert(source.includes('timeoutMs: options.timeoutMs ?? 25_000')); assert(source.includes('maxBodyBytes: options.maxBodyBytes ?? 64 * 1024'));
  });
} finally {
  if (originalKey == null) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = originalKey;
  if (originalUrl == null) delete process.env.EVOLUTION_BASE_URL; else process.env.EVOLUTION_BASE_URL = originalUrl;
}
console.log(`${count}/${count} copilot text checks passed. All recipients, credentials, provider responses and writes are synthetic; no production messages sent.`);
