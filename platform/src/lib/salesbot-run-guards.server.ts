/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySb = { from: (table: string) => any };

const ACTIVE_RUN_STATUSES = ["running", "waiting_timer", "waiting_message"] as const;
const SINGLE_ENTRY_CONVERSATION_TRIGGERS = new Set(["primeira-mensagem", "qualquer-conversa"]);

export function isSingleEntryConversationTrigger(trigger: string | null | undefined): boolean {
  return SINGLE_ENTRY_CONVERSATION_TRIGGERS.has(String(trigger ?? "").trim().toLowerCase());
}

/**
 * Gatilhos de entrada única não podem iniciar novamente para o mesmo lead/bot
 * depois que uma run já foi criada. Isso evita o cenário em que o bot termina
 * e a próxima mensagem do lead reinicia o fluxo do zero.
 */
export async function findPriorSingleEntrySalesbotRunId(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; salesbotId: string; leadId: string; trigger: string | null | undefined },
): Promise<string | null> {
  if (!isSingleEntryConversationTrigger(params.trigger)) return null;

  const { data, error } = await supabaseAdmin.from("salesbot_runs")
    .select("id, status, variables")
    .eq("workspace_id", params.workspaceId)
    .eq("salesbot_id", params.salesbotId)
    .eq("lead_id", params.leadId)
    .in("status", [...ACTIVE_RUN_STATUSES, "finished"])
    .order("started_at", { ascending: false })
    .limit(25);

  if (error || !Array.isArray(data)) return null;
  const prior = data.find((row: { id?: unknown; variables?: Record<string, unknown> | null }) =>
    isSingleEntryConversationTrigger(
      typeof row.variables?.trigger === "string" ? row.variables.trigger : "",
    ),
  );
  return typeof prior?.id === "string" ? prior.id : null;
}

/** Busca uma run ativa estritamente dentro do workspace atual. */
export async function findActiveSalesbotRunId(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; salesbotId: string; leadId: string },
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("salesbot_runs")
    .select("id, status")
    .eq("workspace_id", params.workspaceId)
    .eq("salesbot_id", params.salesbotId)
    .eq("lead_id", params.leadId)
    .in("status", [...ACTIVE_RUN_STATUSES])
    .maybeSingle();

  if (error || !data) return null;
  return typeof data.id === "string" ? data.id : null;
}

/**
 * Persiste uma pausa curta antes de aguardar em memória e depois tenta
 * reivindicar a mesma run quando o prazo vence. Se o processo morrer durante
 * a espera, o scheduler continua enxergando a run em waiting_timer.
 */
export async function waitForDurableSalesbotTimer(
  supabaseAdmin: AnySb,
  params: {
    runId: string;
    workspaceId: string;
    currentBlockId: string;
    nextBlockId: string | null;
    waitingUntil: string;
    waitMs: number;
    waitingVariables: Record<string, unknown>;
    resumeVariables: Record<string, unknown>;
  },
  sleeper: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  const { data: parked, error: parkError } = await supabaseAdmin.from("salesbot_runs")
    .update({
      status: "waiting_timer",
      waiting_until: params.waitingUntil,
      current_block_id: params.currentBlockId,
      variables: params.waitingVariables,
    })
    .eq("id", params.runId)
    .eq("workspace_id", params.workspaceId)
    .eq("status", "running")
    .select("id");

  if (parkError || !Array.isArray(parked) || parked.length === 0) return false;

  await sleeper(Math.max(0, params.waitMs));
  const nowIso = new Date().toISOString();

  const { data: claimed, error: claimError } = await supabaseAdmin.from("salesbot_runs")
    .update({
      status: "running",
      waiting_until: null,
      current_block_id: params.nextBlockId,
      variables: params.resumeVariables,
      updated_at: nowIso,
    })
    .eq("id", params.runId)
    .eq("workspace_id", params.workspaceId)
    .eq("status", "waiting_timer")
    .lte("waiting_until", nowIso)
    .select("id");

  if (claimError) return false;
  return Array.isArray(claimed) && claimed.length > 0;
}
