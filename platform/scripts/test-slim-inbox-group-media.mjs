import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {
  SLIM_GROUP_HISTORY_SELECT, slimGroupMediaKind, slimProjectedGroupMessage,
  slimScrubGroupHistoryMedia, slimGroupRealtimeMessage,
} from '../src/lib/slim-inbox-group-history.core.ts';
import {
  slimDeferredInboundMediaUrl, slimSanitizeEvolutionMessage, slimEvolutionMessageSnapshot,
} from '../src/lib/slim-inbound-media.core.ts';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS group history/media: ' + name); }
const row = {
  id: 'message-row', message_id: 'provider-message', sender_name: 'Operador',
  from_me: false, body: null, received_at: '2026-10-16T17:00:00Z',
  message_type: 'audio', mime_type: 'audio/ogg', file_name: 'audio.ogg', duration_seconds: '9',
};
await test('history projects metadata without selecting inline file bodies', () => {
  assert(!SLIM_GROUP_HISTORY_SELECT.split(',').includes('raw'));
  assert(!SLIM_GROUP_HISTORY_SELECT.includes('media_url'));
  assert(SLIM_GROUP_HISTORY_SELECT.includes('raw->slim_media->>mime_type'));
  const message = slimProjectedGroupMessage({ ...row, media_url: 'data:audio/ogg;base64,QUJD', raw: { base64: 'QUJD' } });
  assert.equal(message.mediaUrl, null);
  assert.equal(message.mediaDeferred, true);
  assert.equal(message.durationSeconds, 9);
  assert.equal(message.whatsappMessageId, row.message_id);
  assert(!('raw' in message));
});
await test('round videos and document messages produce usable media kinds', () => {
  for (const [raw, expected] of [['ptv', 'video'], ['ptvMessage', 'video'], ['documentMessage', 'document'], ['ptt', 'audio'], ['sticker', 'sticker']]) {
    assert.equal(slimGroupMediaKind(raw), expected);
    assert.equal(slimProjectedGroupMessage({ ...row, message_type: raw }).mediaType, expected);
  }
  const plain = slimProjectedGroupMessage({ ...row, message_type: 'conversation', body: 'Olá' });
  assert.equal(plain.mediaDeferred, false);
  assert.equal(plain.text, 'Olá');
  assert.equal(slimProjectedGroupMessage({ ...row, message_type: 'unknown' }).text, 'Mensagem');
});
await test('old caches defer inline and expired signed media without mutating the original', () => {
  for (const mediaUrl of ['data:audio/ogg;base64,QUJD', 'https://project.supabase.co/storage/v1/object/sign/file?token=expired']) {
    const original = { id: row.id, mediaUrl, mediaType: 'audio' };
    const result = slimScrubGroupHistoryMedia(original);
    assert.equal(result.mediaUrl, null); assert.equal(result.mediaDeferred, true);
    assert.equal(original.mediaUrl, mediaUrl);
  }
});
const scope = { workspaceId: 'workspace-a', sessionId: 'session-a', groupJid: '1200000000@g.us' };
const event = { ...row, workspace_id: scope.workspaceId, session_id: scope.sessionId, remote_jid: scope.groupJid,
  media_url: 'data:audio/ogg;base64,QUJD', raw: { data: { message: { base64: 'QUJD' } }, slim_media: { mime_type: 'audio/ogg', duration_seconds: 8 } } };
await test('Realtime isolates a group by workspace, WhatsApp session and JID', () => {
  const actual = slimGroupRealtimeMessage(event, scope);
  assert.equal(actual.id, row.id); assert.equal(actual.mediaUrl, null); assert.equal(actual.durationSeconds, 8);
  for (const [field, value] of [['workspace_id', 'another'], ['session_id', 'another'], ['remote_jid', 'another@g.us']]) {
    assert.equal(slimGroupRealtimeMessage({ ...event, [field]: value }, scope), null);
  }
  assert.equal(slimGroupRealtimeMessage(event, { ...scope, sessionId: undefined }), null);
  assert(!JSON.stringify(actual).includes('QUJD'));
});
await test('receipt never retains inline media or an encrypted WhatsApp download URL', () => {
  for (const value of ['data:audio/ogg;base64,QUJD', 'javascript:alert(1)', 'https://mmg.whatsapp.net/file.enc', 'https://x.mmg.whatsapp.net/file', 'https://user:secret@example.com/file', null]) {
    assert.equal(slimDeferredInboundMediaUrl(value), null);
  }
  assert.equal(slimDeferredInboundMediaUrl('https://files.example.com/report.pdf'), 'https://files.example.com/report.pdf');
});
await test('sanitized provider snapshot keeps recovery keys and drops binary fields at any depth', () => {
  const key = { id: 'provider-message', remoteJid: scope.groupJid, fromMe: false };
  const item = { key, message: { base64: 'BINARY_FILE', ptvMessage: { mimetype: 'video/mp4', seconds: 4, jpegThumbnail: [1, 2, 3], mediaKey: 'RECOVERY_KEY' } } };
  const envelope = { event: 'messages.upsert', apikey: 'SECRET', data: [item], extra: { mediaBase64: 'BINARY_FILE', inline: 'data:image/jpeg;base64,QUJD' } };
  const snapshot = slimEvolutionMessageSnapshot(envelope, item, { kind: 'video', mimeType: 'video/mp4', fileName: null, durationSeconds: 4 });
  assert.deepEqual(snapshot.data.key, key);
  assert.equal(snapshot.data.message.ptvMessage.mediaKey, 'RECOVERY_KEY');
  assert.equal(snapshot.slim_media.mime_type, 'video/mp4');
  assert.equal(snapshot.slim_media.duration_seconds, 4);
  const serialized = JSON.stringify(snapshot);
  for (const token of ['BINARY_FILE', 'SECRET', 'jpegThumbnail', 'QUJD', 'mediaBase64']) assert(!serialized.includes(token), token);
  assert.equal(item.message.base64, 'BINARY_FILE');
  assert.deepEqual(slimSanitizeEvolutionMessage({ nested: [{ Base64: 'BYTES', text: 'texto' }] }), { nested: [{ text: 'texto' }] });
});

const webhook = read('src/routes/api/public/evolution/webhook.$secret.ts');
const ast = ts.createSourceFile('webhook.ts', webhook, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functionNames = ['asRecord', 'pickString', 'normalizeMediaKind', 'defaultMime', 'mediaLabel', 'extractMediaInfo'];
const declarations = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && functionNames.includes(node.name.text)) declarations.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const compiled = ts.transpileModule(functionNames.map(name => {
  assert(declarations.has(name), 'Missing webhook function ' + name);
  return declarations.get(name);
}).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const extractMediaInfo = new Function('slimDeferredInboundMediaUrl', compiled + '; return extractMediaInfo;')(slimDeferredInboundMediaUrl);
await test('actual webhook parser recognizes ptv and preserves duration while deferring bytes', () => {
  const result = extractMediaInfo('ptvMessage', { base64: 'QUJD', ptvMessage: { mimetype: 'video/mp4', seconds: 5, url: 'https://mmg.whatsapp.net/file.enc' } }, { base64: 'QUJD' });
  assert.equal(result.kind, 'video'); assert.equal(result.mimeType, 'video/mp4'); assert.equal(result.durationSeconds, 5); assert.equal(result.url, null);
  const audio = extractMediaInfo('audioMessage', { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 11 } }, { base64: 'QUJD' });
  assert.equal(audio.url, null); assert.equal(audio.durationSeconds, 11);
  assert.equal(extractMediaInfo('conversation', { conversation: 'Olá' }, {}), null);
});
await test('message webhook does not eagerly request media and stores its sanitized snapshot', () => {
  assert(!webhook.includes('/chat/getBase64FromMediaMessage/'));
  assert(webhook.includes('raw: slimEvolutionMessageSnapshot(payload, itemObj, mediaInfo)'));
  assert(webhook.includes('media_url: mediaInfo?.url ?? null'));
  // QR login still needs its existing image support; this patch concerns message attachments.
  assert(webhook.includes('const lastQr = looksLikeQrImage(qr)'));
});
await test('real group webhook resumes only the origin session and can dispatch the first trigger', async () => {
  const snippet = webhook.slice(webhook.indexOf('              if (remoteJid.endsWith("@g.us") && !msg.key?.fromMe)'),
    webhook.indexOf('              // Dispatcher Salesbot, inbound do lead dispara/retoma bots.'));
  assert(snippet.includes('dispatchGroupEvent'));
  const standalone = snippet
    .replace('await import("@/lib/salesbot-runtime.server")', '({ resumeRunsOnInboundMessage: mockResumeRuns })')
    .replace('await import("@/lib/whatsapp-group-rules.server")', '({ dispatchGroupEvent: mockDispatchGroupEvent })');
  const body = ts.transpileModule('async function invoke() { ' + standalone + ' }',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  for (const existingId of [null, 'technical-group-a']) {
    const filters = [], resumed = [], dispatched = [];
    const q = { select() { return q; }, eq(key, value) { filters.push([key, value]); return q; },
      limit() { return q; }, async maybeSingle() { return { data: existingId ? { id: existingId } : null, error: null }; } };
    const invoke = new Function('supabaseAdmin', 'sess', 'remoteJid', 'msg', 'body', 'mediaInfo',
      'normalizeEvolutionParticipantPhone', 'mockResumeRuns', 'mockDispatchGroupEvent', body + '; return invoke;')(
        { from: table => { assert.equal(table, 'leads'); return q; } },
        { workspace_id: scope.workspaceId, session_id: scope.sessionId }, scope.groupJid,
        { key: { fromMe: false }, pushName: 'Participante de teste' }, 'Mensagem sintética', null,
        () => null, async (_db, args) => resumed.push(args), async args => dispatched.push(args));
    await invoke();
    assert(filters.some(([key, value]) => key === 'custom_data->>whatsapp_session_id' && value === scope.sessionId));
    assert(filters.some(([key, value]) => key === 'custom_data->>technical_group_context' && value === 'true'));
    assert.equal(resumed.length, existingId ? 1 : 0);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].sessionId, scope.sessionId);
    assert.equal(dispatched[0].groupJid, scope.groupJid);
  }
});

const ui = read('src/components/inbox/InboxPage.legacy.tsx');
await test('Inbox connects group identity and a click-only media request without changing lead recovery', () => {
  assert(ui.includes('groupId={isGroupThread ? conversation.id : undefined}'));
  const media = ui.split('function MediaAttachment({')[1]?.split('function StickerAttachment({')[0];
  assert(media.includes('loadGroupMediaFn({ data: { groupId, messageId: msg.id } })'));
  assert(media.includes('loadStoredMediaFn({ data: { leadId, activityId: msg.id } })'));
  assert(media.includes('recoverMediaFn({ data: { leadId, activityId: msg.id } })'));
  assert(media.includes('onClick={() => manualMedia.mutate()}'));
  assert(media.includes('retry: false'));
  assert(!media.includes('useQuery({'));
  assert(ui.includes('sessionId: conversation.groupSessionId'));
  assert(ui.includes('messages: snapshot.items.map(slimScrubGroupHistoryMedia)'));
  assert(ui.includes('cached.messages.map(slimScrubGroupHistoryMedia)'));
});
await test('history endpoint retains workspace, session and group restrictions', () => {
  const groups = read('src/lib/whatsapp-groups.functions.legacy.ts').split('export const listInboxGroupMessages =')[1]?.split('const SyncSchema')[0];
  assert(groups.includes('.select(SLIM_GROUP_HISTORY_SELECT)'));
  for (const filter of ['.eq("workspace_id", wsId)', '.eq("remote_jid", groupJid)', '.eq("session_id", sessionId)']) assert(groups.includes(filter), filter);
  assert(groups.includes('pageRows.map(slimProjectedGroupMessage)'));
});
console.log(`${passed} group history/media checks passed; no production data or messages touched.`);
