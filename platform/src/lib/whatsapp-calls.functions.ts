import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolvePublicAppUrl } from "@/integrations/supabase/saude-slim-env";

// ============================================================
// Rastreio de ligações do WhatsApp (Evolution API)
// Painel funcional usado na aba Tracking.
// ============================================================

const wsSchema = z.object({ workspaceId: z.string().uuid() });

export type CallSettingsRow = {
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

type AnySb = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function assertMember(sb: AnySb, workspaceId: string) {
  const { data, error } = await sb.from("workspaces").select("id").eq("id", workspaceId).maybeSingle();
  if (error || !data) throw new Error("Sem acesso a este workspace.");
}

export type CallSession = {
  id: string;
  instance_id: string | null;
  phone_number: string | null;
  status: string;
  webhook_url: string | null;
};

/** Carrega tudo que o painel de ligações precisa em uma chamada só. */
export const getWhatsappCallPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => wsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertMember(sb, data.workspaceId);

    const publicBase = resolvePublicAppUrl();

    const [sessionsRes, settingsRes, callsRes, pipelinesRes, stagesRes] = await Promise.all([
      sb
        .from("whatsapp_web_sessions")
        .select("id, instance_id, phone_number, status, webhook_secret, metadata, last_connected_at")
        .eq("workspace_id", data.workspaceId)
        .eq("provider", "evolution")
        .order("created_at", { ascending: false }),
      sb.from("whatsapp_call_settings").select("*").eq("workspace_id", data.workspaceId).maybeSingle(),
      sb
        .from("whatsapp_call_events")
        .select("id, from_number, phone_normalized, direction, status, duration_seconds, started_at, lead_id")
        .eq("workspace_id", data.workspaceId)
        .order("started_at", { ascending: false })
        .limit(20),
      sb.from("pipelines").select("id, name").eq("workspace_id", data.workspaceId).order("position"),
      sb
        .from("pipeline_stages")
        .select("id, name, pipeline_id")
        .eq("workspace_id", data.workspaceId)
        .order("position"),
    ]);

    type SessRow = {
      id: string;
      instance_id: string | null;
      phone_number: string | null;
      status: string;
      webhook_secret: string | null;
      metadata?: { deleted?: boolean } | null;
      last_connected_at: string | null;
    };
    const sessions = (((sessionsRes.data as SessRow[]) ?? []) as SessRow[])
      .filter((s) => s.metadata?.deleted !== true)
      .map((s) => ({
        id: s.id,
        instance_id: s.instance_id,
        phone_number: s.phone_number,
        status: s.status,
        last_connected_at: s.last_connected_at,
        webhook_url: s.webhook_secret ? `${publicBase}/api/public/evolution/webhook/${s.webhook_secret}` : null,
      }));

    type CallRow = {
      id: string;
      from_number: string | null;
      phone_normalized: string | null;
      direction: string | null;
      status: string | null;
      duration_seconds: number | null;
      started_at: string | null;
      lead_id: string | null;
    };
    const calls = ((callsRes.data as CallRow[]) ?? []) as CallRow[];

    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const last30 = calls.filter((c) => (c.started_at ? new Date(c.started_at).getTime() : 0) >= since);
    const answered = last30.filter((c) => (c.duration_seconds ?? 0) > 0).length;

    return {
      sessions,
      settings: (settingsRes.data as CallSettingsRow | null) ?? null,
      calls,
      pipelines: ((pipelinesRes.data as Array<{ id: string; name: string }>) ?? []),
      stages: ((stagesRes.data as Array<{ id: string; name: string; pipeline_id: string }>) ?? []),
      stats: { total: last30.length, answered, missed: last30.length - answered },
    };
  });

/** Salva as configurações do rastreio de ligações. */
export const saveWhatsappCallSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        enabled: z.boolean(),
        createLeadOnMissed: z.boolean(),
        leadPipelineId: z.string().uuid().nullable().optional(),
        leadStageId: z.string().uuid().nullable().optional(),
        leadTag: z.string().max(60).nullable().optional(),
        autoReplyMissed: z.boolean(),
        autoReplyMessage: z.string().max(1000).nullable().optional(),
        minDurationSeconds: z.number().int().min(0).max(600),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertMember(sb, data.workspaceId);
    const { error } = await sb.from("whatsapp_call_settings").upsert(
      {
        workspace_id: data.workspaceId,
        enabled: data.enabled,
        create_lead_on_missed: data.createLeadOnMissed,
        lead_pipeline_id: data.leadPipelineId ?? null,
        lead_stage_id: data.leadStageId ?? null,
        lead_tag: data.leadTag ?? null,
        auto_reply_missed: data.autoReplyMissed,
        auto_reply_message: data.autoReplyMessage ?? null,
        min_duration_seconds: data.minDurationSeconds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    );
    if (error) throw new Error((error as { message?: string }).message ?? "Falha ao salvar.");
    return { ok: true };
  });

/** Reaplica o webhook da Evolution já com o evento CALL habilitado. */
export const repairCallWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), sessionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertMember(sb, data.workspaceId);
    const { data: sess } = await sb
      .from("whatsapp_web_sessions")
      .select("id, instance_id, webhook_secret")
      .eq("id", data.sessionId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const row = sess as { instance_id: string | null; webhook_secret: string | null } | null;
    if (!row?.instance_id || !row.webhook_secret) throw new Error("Sessão sem instância ativa.");

    const base = process.env.EVOLUTION_BASE_URL;
    const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!base || !encKey) throw new Error("Servidor de WhatsApp não configurado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: creds } = await supabaseAdmin.rpc("get_evolution_credentials_service" as never, {
      _session_id: data.sessionId,
      _key: encKey,
    } as never);
    const apiKey = (creds as { api_key?: string } | null)?.api_key;
    if (!apiKey) throw new Error("Não foi possível ler a chave da instância.");

    const publicBase = resolvePublicAppUrl();
    const url = `${publicBase}/api/public/evolution/webhook/${row.webhook_secret}`;
    const res = await fetch(`${base.replace(/\/+$/, "")}/webhook/set/${encodeURIComponent(row.instance_id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url,
          byEvents: false,
          base64: true,
          events: ["QRCODE_UPDATED", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE", "CALL"],
        },
      }),
    });
    if (!res.ok) throw new Error(`A Evolution recusou a configuração (HTTP ${res.status}).`);
    return { ok: true, url };
  });

/** Importa agora o histórico de chamadas das sessões conectadas do workspace. */
export const syncWhatsappCallsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => wsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertMember(sb, data.workspaceId);

    const base = process.env.EVOLUTION_BASE_URL;
    const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!base || !encKey) throw new Error("Servidor de WhatsApp não configurado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCallSettings, processCallEvent } = await import("@/lib/whatsapp-calls.server");

    const { data: sessions } = await supabaseAdmin
      .from("whatsapp_web_sessions")
      .select("id, instance_id, status")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "evolution");

    const settings = await loadCallSettings(supabaseAdmin as never, data.workspaceId);
    let imported = 0;
    const problems: string[] = [];

    for (const s of ((sessions ?? []) as Array<{ id: string; instance_id: string | null; status: string }>)) {
      if (!s.instance_id) continue;
      const { data: creds } = await supabaseAdmin.rpc("get_evolution_credentials_service" as never, {
        _session_id: s.id,
        _key: encKey,
      } as never);
      const apiKey = (creds as { api_key?: string } | null)?.api_key;
      if (!apiKey) {
        problems.push(`Instância ${s.instance_id} sem chave válida.`);
        continue;
      }
      try {
        const res = await fetch(
          `${base.replace(/\/+$/, "")}/chat/findMessages/${encodeURIComponent(s.instance_id)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: apiKey },
            body: JSON.stringify({ where: {}, limit: 200 }),
          },
        );
        if (!res.ok) {
          problems.push(`Instância ${s.instance_id} respondeu HTTP ${res.status}.`);
          continue;
        }
        const payload = (await res.json().catch(() => null)) as unknown;
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { messages?: { records?: unknown[] } })?.messages?.records)
            ? (payload as { messages: { records: unknown[] } }).messages.records
            : [];
        for (const m of list as Array<Record<string, unknown>>) {
          const msgType = String((m.messageType ?? m.type ?? "") as string).toLowerCase();
          const message = (m.message ?? {}) as Record<string, unknown>;
          const isCall = msgType.includes("call") || "call" in message || "callLog" in message;
          if (!isCall) continue;
          const key_ = (m.key ?? {}) as Record<string, unknown>;
          const remote = String(key_.remoteJid ?? m.remoteJid ?? "");
          const external = String(key_.id ?? m.id ?? `${remote}-${m.messageTimestamp ?? Date.now()}`);
          const ts = m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : Date.now();
          const call = (message.call ?? message.callLog ?? {}) as Record<string, unknown>;
          const duration = Number(call.duration ?? 0);
          const status = String(call.status ?? call.outcome ?? "unknown");
          const isVideo = Boolean(call.isVideo);
          const phoneNorm = remote.replace(/[^\d]/g, "").slice(-14);
          const fromMe = Boolean(key_.fromMe);

          const { data: row, error } = await supabaseAdmin
            .from("whatsapp_call_events")
            .upsert(
              {
                workspace_id: data.workspaceId,
                session_id: s.id,
                external_id: external,
                direction: fromMe ? (isVideo ? "video_out" : "voice_out") : isVideo ? "video_in" : "voice_in",
                from_number: remote,
                phone_normalized: phoneNorm,
                status,
                duration_seconds: duration,
                started_at: new Date(ts).toISOString(),
                raw: m as never,
              } as never,
              { onConflict: "workspace_id,external_id" },
            )
            .select("id")
            .maybeSingle();
          if (error) continue;
          imported++;
          if (!fromMe) {
            await processCallEvent(supabaseAdmin as never, {
              workspaceId: data.workspaceId,
              sessionId: s.id,
              instanceId: s.instance_id,
              apiKey,
              callId: (row as { id: string } | null)?.id ?? null,
              phoneNormalized: phoneNorm,
              fromNumber: remote,
              status,
              durationSeconds: duration,
              settings: { ...settings, auto_reply_missed: false },
            });
          }
        }
      } catch (e) {
        problems.push((e as Error).message);
      }
    }

    await supabaseAdmin
      .from("whatsapp_call_settings")
      .upsert(
        { workspace_id: data.workspaceId, last_sync_at: new Date().toISOString() } as never,
        { onConflict: "workspace_id" },
      );

    return { ok: true, imported, problems };
  });

/** Gera uma ligação de teste para o usuário conferir o fluxo ponta a ponta. */
export const createTestCallEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), phone: z.string().min(8).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertMember(sb, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processCallEvent } = await import("@/lib/whatsapp-calls.server");
    const phoneNorm = data.phone.replace(/[^\d]/g, "").slice(-14);
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_call_events")
      .upsert(
        {
          workspace_id: data.workspaceId,
          external_id: `teste-${Date.now()}`,
          direction: "voice_in",
          from_number: phoneNorm,
          phone_normalized: phoneNorm,
          status: "missed",
          duration_seconds: 0,
          started_at: new Date().toISOString(),
          raw: { teste: true } as never,
        } as never,
        { onConflict: "workspace_id,external_id" },
      )
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const result = await processCallEvent(supabaseAdmin as never, {
      workspaceId: data.workspaceId,
      sessionId: null,
      callId: (row as { id: string } | null)?.id ?? null,
      phoneNormalized: phoneNorm,
      fromNumber: phoneNorm,
      status: "missed",
      durationSeconds: 0,
    });
    return { ok: true, ...result };
  });
