import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {
  SLIM_GROUP_MEDIA_ORIGIN, parseSlimGroupMediaInput, assertSlimGroupMediaMessage,
  slimGroupMediaParts, slimGroupEvolutionMediaKey, safeSlimGroupMediaType,
  slimGroupStoredMediaPath, slimGroupStoragePointer,
} from '../src/lib/slim-group-media.core.ts';
import { loadSlimGroupMediaServer, decodeSlimGroupInlineMedia, persistSlimGroupMediaPointer } from '../src/lib/slim-group-media.server.ts';
import { SLIM_MEDIA_BYTES } from '../src/lib/slim-media-transport.server.ts';

const ws = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const actor = '44444444-4444-4444-8444-444444444444';
const metadataId = '55555555-5555-4555-8555-555555555555';
const other = '66666666-6666-4666-8666-666666666666';
const jid = '120363000000000000@g.us';
const scope = { workspaceId: ws, sessionId: session, groupJid: jid, messageId: id, metadataId: null };
const args = { groupId: `${session}|${jid}`, messageId: id };
const bytes = Buffer.from('synthetic media fixture');
const row = {
  id, workspace_id: ws, session_id: session, remote_jid: jid, message_id: 'WA-SYNTHETIC-1',
  from_me: false, message_type: 'audioMessage', media_url: null, delivery_status: 'received',
  received_at: '2026-10-16T15:00:00Z',
  raw: { data: { key: { id: 'WA-SYNTHETIC-1', remoteJid: jid, fromMe: false, participant: '5511999999999@s.whatsapp.net' },
    message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } } } },
};
const legacyPath = `${ws}/groups/${args.groupId.replace(/[^a-zA-Z0-9_.-]/g, '_')}/1790000000000-test.ogg`;
const signed = path => `${SLIM_GROUP_MEDIA_ORIGIN}/storage/v1/object/sign/inbox-outgoing/${path}?token=synthetic`;
const clone = value => structuredClone(value);

function makeClient(options = {}) {
  const trace = [], writes = [], uploads = [], signatures = [];
  const currentRow = options.row ?? clone(row);
  const defaults = {
    profiles: { current_workspace_id: ws }, workspaces: { id: ws, owner_id: options.viewer ? other : actor },
    workspace_members: options.viewer ? { workspace_id: ws, user_id: actor, role_type: 'visualizador', access_expires_at: null } : null,
    whatsapp_groups: null,
    whatsapp_web_sessions: { id: session, workspace_id: ws, provider: 'evolution', metadata: {} },
    whatsapp_web_messages: currentRow,
  };
  let messageReads = 0;
  const client = {
    from(table) {
      const request = { table, select: null, filters: [], update: null };
      const q = {
        select(value) { request.select = value; return q; },
        update(value) { request.update = value; return q; },
        eq(column, value) { request.filters.push(['eq', column, value]); return q; },
        is(column, value) { request.filters.push(['is', column, value]); return q; },
        ilike(column, value) { request.filters.push(['ilike', column, value]); return q; },
        async maybeSingle() {
          trace.push(request);
          if (request.update) { writes.push(request); return options.persistResult ?? { data: { id }, error: null }; }
          if (options.queryError === table) return { data: null, error: { message: 'fake internal secret' } };
          let value = Object.hasOwn(options, table) ? options[table] : defaults[table];
          if (table === 'whatsapp_web_messages') {
            messageReads++;
            if (messageReads > 1 && options.latest) value = options.latest;
          }
          return { data: value, error: null };
        },
      };
      return q;
    },
    async rpc(name, params) {
      trace.push({ rpc: name, params });
      return options.credentialsError ? { data: null, error: { message: 'fake secret' } }
        : { data: { workspace_id: options.credentialsWorkspace ?? ws, instance_name: 'slim-fixture', api_key: 'fake-secret' }, error: null };
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'inbox-outgoing');
      return {
        async upload(path, content, params) { uploads.push({ path, content, params }); return options.uploadResult ?? { data: { path }, error: null }; },
        async createSignedUrl(path, seconds) {
          signatures.push({ path, seconds });
          return options.signResult ?? { data: { signedUrl: signed(path) }, error: null };
        },
      };
    } },
  };
  return { client, trace, writes, uploads, signatures, currentRow };
}

const config = {
  evolutionBaseUrl: 'https://evolution.example.test', encryptionKey: 'synthetic-vault-key',
};
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS group media: ${name}`); }

await check('only exact composite or metadata UUID inputs accepted', () => {
  assert.equal(parseSlimGroupMediaInput(args).sessionId, session);
  assert.equal(parseSlimGroupMediaInput({ ...args, groupId: metadataId }).metadataId, metadataId);
  for (const groupId of [jid, `${session}|../x@g.us`, `${session}|${jid}|other`, 'group:' + metadataId]) {
    assert.throws(() => parseSlimGroupMediaInput({ ...args, groupId }));
  }
  assert.throws(() => parseSlimGroupMediaInput({ ...args, messageId: 'WA-id' }));
});
await check('message authorization checks workspace, session, group and database UUID', () => {
  assert.doesNotThrow(() => assertSlimGroupMediaMessage(row, scope));
  for (const [field, value] of [['workspace_id', other], ['session_id', other], ['remote_jid', '120363999999@g.us'], ['id', other]]) {
    assert.throws(() => assertSlimGroupMediaMessage({ ...row, [field]: value }, scope), /não encontrada/);
  }
  assert.throws(() => assertSlimGroupMediaMessage({ ...row, raw: { deleted_for_me: true } }, scope), /apagada/);
  assert.throws(() => assertSlimGroupMediaMessage({ ...row, raw: { data: { deleted_for_all: 'true' } } }, scope), /apagada/);
  assert.throws(() => assertSlimGroupMediaMessage({ ...row, delivery_status: 'revoked' }, scope), /apagada/);
});
await check('Evolution key cannot cross message, group, direction or inject arbitrary keys', () => {
  const value = clone(row); value.raw.data.key.untrusted = 'ignored';
  assert.equal(slimGroupEvolutionMediaKey(value).untrusted, undefined);
  for (const [field, replacement] of [['id', 'other'], ['remoteJid', 'other@g.us'], ['fromMe', true], ['fromMe', 'false'], ['participant', 'https://evil.test']]) {
    const changed = clone(row); changed.raw.data.key[field] = replacement;
    assert.throws(() => slimGroupEvolutionMediaKey(changed));
  }
});
await check('legacy private URLs re-sign only same project and same group', () => {
  assert.equal(slimGroupStoredMediaPath({ media_url: signed(legacyPath), raw: {} }, scope), legacyPath);
  for (const url of [signed(legacyPath).replace('vyzvfcgpjjzvcjegzzza', 'foreignproject'),
    signed(legacyPath).replace(ws, other), signed(legacyPath).replace(session, other),
    signed(legacyPath).replace(jid.replace('@', '_'), 'other_g.us'), signed(legacyPath).replace('/179', '/%2E%2E/179'),
    signed(legacyPath).replace('https://', 'http://'), signed(legacyPath) + '#fragment']) {
    assert.equal(slimGroupStoredMediaPath({ media_url: url, raw: {} }, scope), null);
  }
  const metadataPath = `${ws}/groups/${metadataId}/1790000000000-file.pdf`;
  assert.equal(slimGroupStoredMediaPath({ media_url: signed(metadataPath), raw: {} }, { ...scope, metadataId }), metadataPath);
  assert.equal(slimGroupStoredMediaPath({ media_url: signed(metadataPath), raw: {} }, scope), null);
});
await check('new storage pointer ties workspace/session/group/message and contains no token', () => {
  const path = `${ws}/groups/${session}/${jid}/${id}/${'a'.repeat(64)}.ogg`;
  const pointer = slimGroupStoragePointer(path, scope);
  assert(!pointer.includes('token=')); assert(!pointer.includes('base64'));
  assert.equal(slimGroupStoredMediaPath({ media_url: pointer, raw: {} }, scope), path);
  assert.equal(slimGroupStoredMediaPath({ media_url: pointer.replace(id, other), raw: {} }, scope), null);
  assert.throws(() => slimGroupStoragePointer(path + '/../bad', scope));
});
await check('inline audio and legacy nested ptv bytes are preserved without base64 output', () => {
  const audio = { ...row, media_url: 'data:audio/ogg; codecs=opus;base64,' + bytes.toString('base64') };
  const decoded = decodeSlimGroupInlineMedia(audio);
  assert.deepEqual(decoded.bytes, bytes); assert.equal(decoded.mimeType, 'audio/ogg; codecs=opus');
  const ptv = clone(row); ptv.message_type = 'ptvMessage';
  ptv.raw.data.message = { ptvMessage: { mimetype: 'video/mp4' }, base64: bytes.toString('base64') };
  assert.equal(slimGroupMediaParts(ptv).kind, 'video');
  assert.equal(decodeSlimGroupInlineMedia(ptv).mimeType, 'video/mp4');
  assert.deepEqual(decodeSlimGroupInlineMedia(ptv).bytes, bytes);
});
await check('legacy outgoing MIME metadata at raw root is preserved when re-signing Storage', async () => {
  for (const field of ['mimeType', 'mimetype', 'mime_type']) {
    const outgoing = { ...row, from_me: true, message_type: 'document',
      media_url: signed(legacyPath), raw: { [field]: 'application/pdf', fileName: 'legacy.pdf' } };
    assert.equal(slimGroupMediaParts(outgoing).mimeType, 'application/pdf');
    const f = makeClient({ row: outgoing });
    const result = await loadSlimGroupMediaServer(f.client, actor, args, { ...config,
      recover: () => { throw new Error('must not recover stored media'); },
      persistPointer: () => { throw new Error('must not write stored media'); } });
    assert.equal(result.mimeType, 'application/pdf');
    assert.equal(result.mediaUrl, signed(legacyPath));
    assert.equal(f.uploads.length, 0);
  }
});
await check('invalid, empty, oversized and active MIME media are rejected or made inert', () => {
  assert.throws(() => decodeSlimGroupInlineMedia({ ...row, media_url: 'data:audio/ogg;base64,%%%%' }), /inválido/);
  assert.throws(() => decodeSlimGroupInlineMedia({ ...row, media_url: 'data:audio/ogg;base64,' }), /inválido/);
  assert.throws(() => decodeSlimGroupInlineMedia({ ...row, media_url: 'data:audio/ogg;base64,' + 'A'.repeat(4 * Math.ceil(SLIM_MEDIA_BYTES / 3) + 2049) }), /16 MB/);
  for (const mime of ['text/html', 'image/svg+xml', 'application/xml', 'audio/ogg\r\nX-Header: secret']) {
    assert.equal(safeSlimGroupMediaType(mime, 'audio').mimeType, 'application/octet-stream');
  }
  assert.throws(() => slimGroupMediaParts({ ...row, message_type: 'text', raw: {} }), /não contém/);
});
await check('historical metadata-free group media is read only once and cached privately via bearer Storage', async () => {
  const f = makeClient(); let recoveries = 0; let pointer;
  const result = await loadSlimGroupMediaServer(f.client, actor, args, { ...config,
    recover: async request => { recoveries++; assert.equal(request.messageType, 'audio'); assert.equal(request.key.remoteJid, jid);
      return { bytes, mimeType: 'audio/ogg; codecs=opus', extension: 'ogg' }; },
    persistPointer: async (original, authorized, value) => { assert.equal(original.id, id); assert.deepEqual(authorized, scope); pointer = value; },
  });
  assert.equal(recoveries, 1); assert.equal(f.uploads.length, 1); assert.equal(f.uploads[0].params.upsert, false);
  assert.deepEqual(f.uploads[0].content, bytes); assert.equal(result.mimeType, 'audio/ogg; codecs=opus');
  assert(result.mediaUrl.startsWith(SLIM_GROUP_MEDIA_ORIGIN)); assert(!JSON.stringify(result).includes(bytes.toString('base64')));
  assert(!pointer.includes('token='));
  const queries = f.trace.filter(x => x.table === 'whatsapp_web_messages');
  assert.equal(queries.filter(x => x.select.split(',').includes('raw')).length, 1);
  for (const q of queries) for (const pair of [['id', id], ['workspace_id', ws], ['session_id', session], ['remote_jid', jid]]) {
    assert(q.filters.some(([op, column, value]) => op === 'eq' && column === pair[0] && value === pair[1]));
  }
});
await check('stored file opens for active viewer without recovery, upload or write', async () => {
  const f = makeClient({ viewer: true, row: { ...row, media_url: signed(legacyPath) } });
  const result = await loadSlimGroupMediaServer(f.client, actor, args, { ...config, recover: () => { throw new Error('must not recover'); },
    persistPointer: () => { throw new Error('must not persist'); } });
  assert.equal(result.mediaUrl, signed(legacyPath)); assert.equal(f.uploads.length, 0);
  assert.equal(f.trace.filter(x => x.rpc).length, 0); assert.equal(f.signatures[0].seconds, 3600);
});
await check('viewer cannot perform a recovery or inline upload', async () => {
  for (const media_url of [null, 'data:audio/ogg;base64,' + bytes.toString('base64')]) {
    const f = makeClient({ viewer: true, row: { ...row, media_url } });
    await assert.rejects(loadSlimGroupMediaServer(f.client, actor, args, config), /Sem permissão/);
    assert.equal(f.uploads.length, 0); assert.equal(f.trace.filter(x => x.rpc).length, 0);
  }
});
await check('scope, expired access, deleted sessions/messages and query errors fail before external IO', async () => {
  for (const options of [
    { whatsapp_web_sessions: { id: session, workspace_id: other, provider: 'evolution', metadata: {} } },
    { whatsapp_web_sessions: { id: session, workspace_id: ws, provider: 'evolution', metadata: { deleted: true } } },
    { workspaces: null }, { viewer: true, workspace_members: { workspace_id: ws, user_id: actor, access_expires_at: '2020-01-01' } },
    { row: { ...row, session_id: other } }, { row: { ...row, raw: { deleted: true } } },
    { queryError: 'whatsapp_web_messages' }, { queryError: 'profiles' }, { queryError: 'whatsapp_groups' },
  ]) {
    const f = makeClient(options);
    await assert.rejects(loadSlimGroupMediaServer(f.client, actor, args, { ...config, recover: () => { throw new Error('recovery must not run'); } }),
      error => !error.message.includes('recovery must not run') && !error.message.includes('fake internal secret'));
    assert.equal(f.uploads.length, 0);
  }
});
await check('credential workspace mismatch and credentials errors never reach provider', async () => {
  for (const options of [{ credentialsWorkspace: other }, { credentialsError: true }]) {
    const f = makeClient(options); let called = false;
    await assert.rejects(loadSlimGroupMediaServer(f.client, actor, args, { ...config, recover: async () => { called = true; throw new Error(); } }));
    assert.equal(called, false); assert.equal(f.uploads.length, 0);
  }
});
await check('metadata UUID resolves into exact session and historical inline file needs no provider call', async () => {
  const f = makeClient({ whatsapp_groups: { id: metadataId, workspace_id: ws, session_id: session, group_jid: jid },
    row: { ...row, media_url: 'data:audio/ogg;base64,' + bytes.toString('base64') } });
  await loadSlimGroupMediaServer(f.client, actor, { ...args, groupId: metadataId }, { ...config,
    recover: () => { throw new Error('no provider'); }, persistPointer: async () => {} });
  assert.equal(f.uploads.length, 1); assert.equal(f.trace.filter(x => x.rpc).length, 0);
});
await check('delete while downloading stops upload/persistence and changed message never replaced', async () => {
  for (const latest of [{ ...row, deleted_for_all: 'true' }, { ...row, message_id: 'WA-CHANGED' }]) {
    const f = makeClient({ latest });
    await assert.rejects(loadSlimGroupMediaServer(f.client, actor, args, { ...config,
      recover: async () => ({ bytes, mimeType: 'audio/ogg', extension: 'ogg' }), persistPointer: async () => { throw new Error('unexpected write'); } }),
      error => !error.message.includes('unexpected write'));
    assert.equal(f.uploads.length, 0);
  }
});
await check('storage error never persists pointer; invalid signed URL is never returned', async () => {
  const f = makeClient({ uploadResult: { data: null, error: { statusCode: '403', message: 'fake secret' } } });
  await assert.rejects(loadSlimGroupMediaServer(f.client, actor, args, { ...config,
    recover: async () => ({ bytes, mimeType: 'audio/ogg', extension: 'ogg' }), persistPointer: async () => { throw new Error('unexpected write'); } }), /Não foi possível guardar/);
  const bad = makeClient({ row: { ...row, media_url: signed(legacyPath) }, signResult: { data: { signedUrl: 'https://evil.example/file' }, error: null } });
  await assert.rejects(loadSlimGroupMediaServer(bad.client, actor, args, config), /inválido/);
});
await check('scalar persistence has exact scope, conditional guard and never transmits inline in URL', async () => {
  const pointer = slimGroupStoragePointer(`${ws}/groups/${session}/${jid}/${id}/${'a'.repeat(64)}.ogg`, scope);
  for (const media_url of [null, signed(legacyPath), 'data:audio/ogg;base64,' + bytes.toString('base64')]) {
    const f = makeClient(); const original = { ...row, media_url };
    await persistSlimGroupMediaPointer(f.client, original, scope, pointer);
    const write = f.writes[0]; assert.deepEqual(write.update, { media_url: pointer });
    assert.equal(write.select, 'id'); assert(!JSON.stringify(write.filters).includes(bytes.toString('base64')));
    for (const key of ['id', 'workspace_id', 'session_id', 'remote_jid', 'message_id', 'from_me', 'received_at', 'message_type']) {
      assert(write.filters.some(([, column]) => column === key));
    }
    assert(write.filters.some(([, column]) => column === 'media_url'));
  }
  const race = makeClient({ persistResult: { data: null, error: null } });
  await assert.rejects(persistSlimGroupMediaPointer(race.client, row, scope, pointer), /mudou durante/);
  await assert.rejects(persistSlimGroupMediaPointer(race.client, row, scope, 'https://evil.example'), /inválida/);
});
await check('server function retains auth middleware and lazy server-only import; sources parse', () => {
  const root = new URL('../', import.meta.url);
  for (const path of ['src/lib/slim-group-media.functions.ts', 'src/lib/slim-group-media.server.ts', 'src/lib/slim-group-media.core.ts']) {
    const source = fs.readFileSync(new URL(path, root), 'utf8');
    assert.equal(ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0, path);
    assert(!source.includes('/message/send')); assert(!source.includes('/instance/restart'));
  }
  const fn = fs.readFileSync(new URL('src/lib/slim-group-media.functions.ts', root), 'utf8');
  assert(fn.includes('.middleware([attachSupabaseAuth, requireSupabaseAuth])'));
  assert(fn.includes("await import('./slim-group-media.server')"));
});
console.log(`${checks}/${checks} group attachment checks passed. Synthetic local fixtures only; no live messages or database writes.`);
