import fs from 'node:fs';
import ts from 'typescript';

// The legacy lead-media transforms run first; this extends their click-only UI.
const root = new URL('../', import.meta.url);
const path = 'src/components/inbox/InboxPage.legacy.tsx';
const url = new URL(path, root);
const marker = '// SLIM_GROUP_MEDIA_ON_DEMAND_V1';
let code = fs.readFileSync(url, 'utf8');
if (!code.includes(marker)) {
  const once = (old, next) => {
    const count = code.split(old).length - 1;
    if (count !== 1) throw new Error(`[Group media] ${count} anchors: ${old.slice(0, 100)}`);
    code = code.replace(old, () => next);
  };
  const section = (start, end, run) => {
    const i = code.indexOf(start), j = code.indexOf(end, i + start.length);
    if (i < 0 || j < 0 || code.split(start).length !== 2) throw new Error('[Group media] Missing section: ' + start);
    let part = code.slice(i, j);
    const replace = (old, next) => {
      const count = part.split(old).length - 1;
      if (count !== 1) throw new Error(`[Group media] ${count} scoped anchors: ${old.slice(0, 100)}`);
      part = part.replace(old, () => next);
    };
    const between = (a, b, next) => {
      const x = part.indexOf(a), y = part.indexOf(b, x + a.length);
      if (x < 0 || y < 0) throw new Error('[Group media] Missing block: ' + a);
      part = part.slice(0, x) + next + part.slice(y);
    };
    run({ replace, between });
    code = code.slice(0, i) + part + code.slice(j);
  };

  once('import { slimScrubInlineMedia } from "@/lib/slim-inbox-lazy-media.core";',
    'import { slimScrubInlineMedia } from "@/lib/slim-inbox-lazy-media.core";\n' +
    'import { slimScrubGroupHistoryMedia, slimGroupRealtimeMessage } from "@/lib/slim-inbox-group-history.core";\n' +
    'import { loadSlimGroupMessageMedia } from "@/lib/slim-group-media.functions";');
  once('messages: snapshot.items,', 'messages: snapshot.items.map(slimScrubGroupHistoryMedia),');
  once('mergeThreadCacheRows(previous, cached.messages)',
    'mergeThreadCacheRows(previous, cached.messages.map(slimScrubGroupHistoryMedia))');
  once('const messages = [...olderGroupMessages, ...(effectiveGroupPage?.messages ?? [])];',
    'const messages = [...olderGroupMessages, ...(effectiveGroupPage?.messages ?? [])].map(slimScrubGroupHistoryMedia);');
  once('        mediaUrl: m.mediaUrl ?? null,\n        mediaType: m.mediaType ?? null,',
    '        mediaUrl: m.mediaUrl ?? null,\n        mediaDeferred: m.mediaDeferred === true,\n        audioSeconds: m.durationSeconds ?? undefined,\n        mediaType: m.mediaType ?? null,');

  section('    const applyGroupMessage =', '  const sendGroupFn =', ({ replace, between }) => {
    between('      if (record.remote_jid !== conversation.groupJid) return;',
      '      queryClient.setQueryData(groupQueryKey,',
      '      const message = slimGroupRealtimeMessage(record, {\n' +
      '        workspaceId, sessionId: conversation.groupSessionId, groupJid: conversation.groupJid,\n' +
      '      });\n      if (!message) return;\n\n');
    replace('    conversation.groupJid,\n    workspaceId,',
      '    conversation.groupJid,\n    conversation.groupSessionId,\n    workspaceId,');
  });

  once('                  leadId={isLead ? conversation.id : undefined}',
    '                  leadId={isLead ? conversation.id : undefined}\n' +
    '                  groupId={isGroupThread ? conversation.id : undefined}');
  section('function MessageBubble({', 'function ReactionPicker({', ({ replace }) => {
    replace('  leadId,\n  onReact,', '  leadId,\n  groupId,\n  onReact,');
    replace('  leadId?: string;', '  leadId?: string;\n  groupId?: string;');
    replace('<MediaAttachment msg={msg} mine={mine} leadId={leadId} />',
      '<MediaAttachment msg={msg} mine={mine} leadId={leadId} groupId={groupId} />');
  });
  section('function MediaAttachment({', 'function StickerAttachment({', ({ replace }) => {
    replace('  leadId,\n}: {', '  leadId,\n  groupId,\n}: {');
    replace('  leadId?: string;', '  leadId?: string;\n  groupId?: string;');
    replace('  const source = leadId && (msg.mediaDeferred || rawSource.startsWith("data:")) ? "" : rawSource;',
      '  const source = (leadId || groupId) && (msg.mediaDeferred || rawSource.startsWith("data:")) ? "" : rawSource;');
    replace('  const recoverMediaFn = useServerFn(resolveLeadMessageMedia);',
      '  const recoverMediaFn = useServerFn(resolveLeadMessageMedia);\n' +
      '  const loadGroupMediaFn = useServerFn(loadSlimGroupMessageMedia);');
    replace('      if (!leadId) throw new Error("Não foi possível identificar a conversa.");',
      '      if (groupId) {\n' +
      '        const recovered = await loadGroupMediaFn({ data: { groupId, messageId: msg.id } });\n' +
      '        if (recovered.mediaUrl) return recovered.mediaUrl;\n' +
      '        throw new Error("O arquivo não está disponível neste grupo.");\n' +
      '      }\n      if (!leadId) throw new Error("Não foi possível identificar a conversa.");');
    replace('  const needsManualLoad = Boolean(leadId && !displaySource &&',
      '  const needsManualLoad = Boolean((leadId || groupId) && !displaySource &&');
  });

  const parsed = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (parsed.parseDiagnostics.length) throw new Error('[Group media] Invalid TSX: ' +
    parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));
  fs.writeFileSync(url, code + '\n' + marker + '\n');
  console.log('[Group media] Click-only attachments and session-scoped Realtime integrated.');
}
