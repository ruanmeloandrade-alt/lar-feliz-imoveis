import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const once = (source, before, after, label) => {
  if (source.includes(after)) return source;
  const n = source.split(before).length - 1;
  if (n !== 1) throw new Error(`[Inbox] ${label}: expected one anchor, found ${n}`);
  return source.replace(before, after);
};
function edit(file, transform) {
  const full = path.join(root, file);
  const before = fs.readFileSync(full, 'utf8');
  const after = transform(before);
  if (transform(after) !== after) throw new Error(`[Inbox] Non-idempotent patch: ${file}`);
  if (before !== after) fs.writeFileSync(full, after);
}

edit('src/lib/inbox-group-salesbot.functions.ts', code => once(code,
`    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    const group = await findGroup(sb, workspaceId, data.conversationId);`,
`    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    // SLIM_INBOX_DIRECT_FIRST: a client conversation never depends on group tables.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.conversationId)) {
      const direct = await sb.from("leads").select("id")
        .eq("workspace_id", workspaceId).eq("id", data.conversationId).maybeSingle();
      if (direct.error) throw new Error(direct.error.message);
      if (direct.data) return { kind: "lead" as const, activeRunId: null, workspaceId, userId: context.userId };
    }
    const group = await findGroup(sb, workspaceId, data.conversationId);`, 'direct conversation target'));

edit('src/server.ts', code => {
  // Other transforms add workers between this hook and getServerEntry. Detect
  // the hook itself rather than requiring those statements to remain adjacent.
  const declarations = [...code.matchAll(/\bconst\s*\{\s*ensureInboxAutomationWorker\s*\}\s*=\s*await\s+import\(["']\.\/lib\/inbox-automation-worker\.server(?:\.ts)?["']\)/g)].length;
  const calls = [...code.matchAll(/\bensureInboxAutomationWorker\(\s*\)\s*;/g)].length;
  if (declarations || calls) {
    if (declarations !== 1 || calls !== 1) throw new Error('[Inbox] Expected exactly one server worker declaration and call');
    return code;
  }
  return once(code,
` const handler = await getServerEntry();`,
` const { ensureInboxAutomationWorker } = await import("./lib/inbox-automation-worker.server");
 ensureInboxAutomationWorker();
 const handler = await getServerEntry();`, 'server-owned durable queue worker');
});

edit('src/lib/salesbot-runtime.server.ts', code => {
  const imports = 'import { withSalesbotGuard, withAgentGuard, assertAutomationMayContinue, guardedAutomationFetch } from "./inbox-automation-guards.server";';
  if (!code.includes(imports)) code = imports+'\n'+code;
  code = once(code,
`export async function executeRun(supabaseAdmin: AnySb, runInput: string | RunRow): Promise<void> {`,
`export async function executeRun(supabaseAdmin: AnySb, runInput: string | RunRow): Promise<void> {
  await withSalesbotGuard(supabaseAdmin, runInput, () => executeRunUnchecked(supabaseAdmin, runInput));
}
async function executeRunUnchecked(supabaseAdmin: AnySb, runInput: string | RunRow): Promise<void> {`, 'per-execution stop guard');
  code = once(code,
`  while (current && steps < MAX_STEPS_PER_TICK) {
    steps++;`,
`  while (current && steps < MAX_STEPS_PER_TICK) {
    await assertAutomationMayContinue();
    steps++;`, 'stop check between blocks');
  code = once(code,
`async function runAiAgentTurn(
  supabaseAdmin: AnySb,`,
`async function runAiAgentTurn(
  supabaseAdmin: AnySb, workspaceId: string, leadId: string, phone: string, agentId: string, extraUserMessage?: string, expectedVersion?: number,
): Promise<{ reply: string; handoff: boolean; error?: string }> {
  try {
    return await withAgentGuard(supabaseAdmin, workspaceId, leadId,
      () => runAiAgentTurnUnchecked(supabaseAdmin, workspaceId, leadId, phone, agentId, extraUserMessage), agentId, expectedVersion);
  } catch (error) {
    return { reply: "", handoff: false, error: error instanceof Error ? error.message : "Agente IA interrompido." };
  }
}
async function runAiAgentTurnUnchecked(
  supabaseAdmin: AnySb,`, 'agent generation fence');
  code = once(code,
`    const raw = json.choices?.[0]?.message?.content ?? "";`,
`    await assertAutomationMayContinue();
    const raw = json.choices?.[0]?.message?.content ?? "";`, 'stop after AI response before side effects');
  const deliveryError = `            else await log(supabaseAdmin, run, b, "error", r.error);`;
  const deliveryFailure = `            else { await log(supabaseAdmin, run, b, "error", r.error); throw new Error(r.error ?? "Falha no envio da mensagem."); }`;
  if (!code.includes(deliveryFailure)) {
    const count = code.split(deliveryError).length - 1;
    if (count !== 2) throw new Error(`[Inbox] Expected text and attachment error handlers, found ${count}`);
    code = code.replaceAll(deliveryError, deliveryFailure);
  }
  // Guard every HTTP side effect in this executor, including after typing delays.
  code = code.replace(/\bawait fetch\(/g, 'await guardedAutomationFetch(');
  if (!code.includes('await guardedAutomationFetch(')) throw new Error('[Inbox] No guarded executor HTTP calls');
  return code;
});
console.log('[Inbox] Verified: direct target, server queue and persisted per-run/agent cancellation.');
