/**
 * Regras de negócio do rastreio de ligações do WhatsApp (Evolution API).
 * Usado pelo webhook público, pelo cron de sincronização e pelas server functions.
 */

type AnySb = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type CallSettings = {
  workspace_id: string;
  enabled: boolean;
  create_lead_on_missed: boolean;
  lead_pipeline_id: string | null;
  lead_stage_id: string | null;
  lead_tag: string | null;
  auto_reply_missed: boolean;
  auto_reply_message: string | null;
  min_duration_seconds: number;
  last_sync_at: string | null;
};

export const DEFAULT_CALL_SETTINGS: Omit<CallSettings, "workspace_id"> = {
  enabled: true,
  create_lead_on_missed: false,
  lead_pipeline_id: null,
  lead_stage_id: null,
  lead_tag: "ligacao-perdida",
  auto_reply_missed: false,
  auto_reply_message:
    "Oi! Vi que você ligou agora e não consegui atender. Pode me contar por aqui o que você precisa?",
  min_duration_seconds: 0,
  last_sync_at: null,
};

export async function loadCallSettings(admin: AnySb, workspaceId: string): Promise<CallSettings> {
  const { data } = await admin
    .from("whatsapp_call_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return { workspace_id: workspaceId, ...DEFAULT_CALL_SETTINGS };
  return data as CallSettings;
}

const MISSED = ["offer", "missed", "timeout", "reject", "declin", "unanswered", "no_answer"];

export function isMissedCall(status: string | null | undefined, duration: number): boolean {
  const s = (status ?? "").toLowerCase();
  if (duration > 0) return false;
  if (s.includes("accept") || s.includes("answer")) return false;
  return MISSED.some((m) => s.includes(m)) || s === "unknown" || s === "";
}

/** Fonte de CRM padrão do workspace, criada se ainda não existir. */
async function ensureSource(admin: AnySb, wsId: string): Promise<string | null> {
  const { data: existing } = await admin
    .from("crm_sources")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("provider", "mkton")
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created } = await admin
    .from("crm_sources")
    .insert({ workspace_id: wsId, provider: "mkton", display_name: "CRM MKTOn", is_default: true })
    .select("id")
    .maybeSingle();
  return (created as { id: string } | null)?.id ?? null;
}

/** Envia texto pela Evolution usando a apikey da sessão. */
export async function sendEvolutionMessage(args: {
  instanceId: string;
  apiKey: string;
  number: string;
  text: string;
}): Promise<boolean> {
  const base = process.env.EVOLUTION_BASE_URL;
  if (!base) return false;
  try {
    const res = await fetch(
      `${base.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(args.instanceId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: args.apiKey },
        body: JSON.stringify({ number: args.number, text: args.text, textMessage: { text: args.text } }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Pós-processamento de uma ligação recebida: vincula ou cria lead, aplica etiqueta,
 * registra atividade e dispara a resposta automática de ligação perdida.
 */
export async function processCallEvent(
  admin: AnySb,
  args: {
    workspaceId: string;
    sessionId: string | null;
    instanceId?: string | null;
    apiKey?: string | null;
    callId?: string | null;
    phoneNormalized: string;
    fromNumber: string;
    status: string;
    durationSeconds: number;
    settings?: CallSettings;
  },
): Promise<{ leadId: string | null; leadCreated: boolean; replied: boolean }> {
  const settings = args.settings ?? (await loadCallSettings(admin, args.workspaceId));
  if (!settings.enabled || !args.phoneNormalized) return { leadId: null, leadCreated: false, replied: false };

  const missed = isMissedCall(args.status, args.durationSeconds);

  // Lead existente pelo telefone
  let leadId: string | null = null;
  let leadCreated = false;
  const tail = args.phoneNormalized.slice(-11);
  const { data: existing } = await admin
    .from("leads")
    .select("id")
    .eq("workspace_id", args.workspaceId)
    .ilike("phone_normalized", `%${tail}`)
    .limit(1)
    .maybeSingle();
  if (existing) leadId = (existing as { id: string }).id;

  if (!leadId && missed && settings.create_lead_on_missed) {
    const sourceId = await ensureSource(admin, args.workspaceId);
    const tags: Array<{ name: string }> = [{ name: settings.lead_tag || "ligacao-perdida" }];
    const { data: created } = await admin
      .from("leads")
      .insert({
        workspace_id: args.workspaceId,
        crm_source_id: sourceId,
        name: `Ligação de ${args.phoneNormalized}`,
        phone: args.fromNumber.replace(/[^\d+]/g, ""),
        source: "ligacao-whatsapp",
        pipeline_id: settings.lead_pipeline_id,
        stage_id: settings.lead_stage_id,
        tags,
      })
      .select("id")
      .maybeSingle();
    leadId = (created as { id: string } | null)?.id ?? null;
    leadCreated = !!leadId;
  }

  if (leadId && args.callId) {
    await admin.from("whatsapp_call_events").update({ lead_id: leadId }).eq("id", args.callId);
  }

  if (leadId) {
    try {
      await admin.from("lead_activities").insert({
        workspace_id: args.workspaceId,
        lead_id: leadId,
        type: "ligacao_whatsapp",
        payload: {
          status: args.status,
          duration_seconds: args.durationSeconds,
          missed,
          from: args.fromNumber,
        },
      });
    } catch {
      /* atividade é opcional */
    }
  }

  let replied = false;
  if (
    missed &&
    settings.auto_reply_missed &&
    settings.auto_reply_message &&
    args.instanceId &&
    args.apiKey
  ) {
    replied = await sendEvolutionMessage({
      instanceId: args.instanceId,
      apiKey: args.apiKey,
      number: args.phoneNormalized,
      text: settings.auto_reply_message,
    });
  }

  return { leadId, leadCreated, replied };
}
