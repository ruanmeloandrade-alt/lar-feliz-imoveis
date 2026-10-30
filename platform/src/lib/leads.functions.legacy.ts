import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SLIM_LEAD_ACTIVITY_META_SELECT, slimProjectedActivity, slimAllowStoredMediaUrl, slimInboxStoredMediaPath, type SlimProjectedActivityRow } from "./slim-inbox-lazy-media.core";
import {prepareSlimInboxContactMap,loadContactIdentityIndex} from "./slim-contact-identity.core";
import {readSlimContactHistory} from "./slim-contact-history.core";
import { leadCustomFieldInput, leadCustomFieldRecord } from "@/lib/lead-custom-field-schema";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { loadEffectivePermissions } from "@/lib/permissions-core.functions";
import { allowedPipelines, scopeOf, requireAllowed } from "@/lib/permissions-core";

type AnySb = {
  from: (t: string) => any;
  rpc: (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function encKey() {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
  return k;
}

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

export interface LeadListRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  value: number;
  stageId: string | null;
  stageName: string | null;
  pipelineName: string | null;
  sourceId: string | null;
  sourceProvider: string;
  sourceDisplayName: string;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageFrom: "lead" | "us" | "none";
  tags: string[];
}

export const listLeads = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().optional(),
        sourceId: z.string().uuid().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const eff = await loadEffectivePermissions(sb, context.userId, wsId);
    // Se o módulo CRM não é permitido, devolve vazio (a UI mostra empty).
    if (scopeOf(eff, "crm", "leads", "view") === "none") {
      return { leads: [] as LeadListRow[] };
    }
    const viewScope = scopeOf(eff, "crm", "leads", "view");
    const pipelines = allowedPipelines(eff, "crm");
    let q = sb
      .from("leads")
      .select(
        "id, name, email, phone, value, stage_id, last_message_from, tags, external_id, created_at, updated_at, crm_source_id, pipeline_id, pipeline_stages(name), pipelines(name), crm_sources(provider, display_name)",
      )
      .eq("workspace_id", wsId)
      .eq("status", "active").is("merged_into_id",null)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (pipelines) {
      if (pipelines.length === 0) return { leads: [] as any[] };
      q = q.in("pipeline_id", pipelines);
    }
    if (viewScope === "assigned") q = q.eq("responsible_id", context.userId);
    if (data.sourceId) q = q.eq("crm_source_id", data.sourceId);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const leads: LeadListRow[] = (
      (rows ?? []) as Array<{
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        value: number;
        stage_id: string | null;
        last_message_from: string | null;
        conversation_status: string | null;
        tags: unknown;
        crm_source_id: string | null;
        external_id: string | null;
        created_at: string;
        updated_at: string;
        pipeline_stages: { name: string } | null;
        pipelines: { name: string } | null;
        crm_sources: { provider: string; display_name: string } | null;
      }>
    ).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      value: Number(r.value ?? 0),
      stageId: r.stage_id,
      stageName: r.pipeline_stages?.name ?? null,
      pipelineName: r.pipelines?.name ?? null,
      sourceId: r.crm_source_id,
      sourceProvider: r.crm_sources?.provider ?? "mkton",
      sourceDisplayName: r.crm_sources?.display_name ?? "MKTOn",
      externalId: r.external_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastMessageFrom: (r.last_message_from as "lead" | "us" | "none" | null) ?? "none",
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    }));
    return { leads };
  });

export interface LeadActivityRow {
  id: string;
  type: string;
  text: string | null;
  mediaUrl?: string | null;
  mediaDeferred?: boolean;
  transcription?: string | null;
  mediaType?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  durationSeconds?: number | null;
  whatsappMessageId?: string | null;
  reactions?: Array<string | { emoji: string; fromMe?: boolean | null; at?: string | null }>;
  deletedForMe?: boolean;
  deletedForAll?: boolean;
  occurredAt: string;
}

function mediaTextLabel(mediaType: unknown, fileName?: unknown) {
  const kind = String(mediaType ?? "").toLowerCase();
  const name = typeof fileName === "string" && fileName.trim() ? fileName.trim() : null;
  if (!kind && !name) return null;
  if (kind === "image") return "📷 Imagem";
  if (kind === "video") return "🎥 Vídeo";
  if (kind === "audio") return "🎙️ Áudio";
  if (kind === "sticker") return "Sticker";
  return name ? `📎 ${name}` : "📎 Documento";
}

export interface LeadDetailResponse {
  workspaceId?: string;
  actorId?: string;
  lead: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    value: number;
    stageId: string | null;
    stageName: string | null;
    pipelineId: string | null;
    pipelineName: string | null;
    sourceId: string | null;
    sourceProvider: string;
    sourceDisplayName: string;
    externalId: string | null;
    externalUrl: string | null;
    whatsappUrl: string | null;
    tags: string[];
    customFields: Array<{
      id: string;
      name: string;
      type: string;
      displayValue: string;
    }>;
    createdAt: string;
    updatedAt: string;
    keepFiles: boolean;
    responsibleId?: string | null;
    responsibleName?: string | null;
    status?: string;
    source?: string | null;
    conversationStatus?: string | null;
    lastMessageFrom?: string | null;
    address?: string | null;
    notes?: string | null;
  };
  activities: LeadActivityRow[];
}

type LocalCustomFieldRow = {
  id: string;
  name: string;
  field_type: string;
};

type LeadCustomValueRow = {
  value: unknown;
  lead_custom_fields: LocalCustomFieldRow | null;
};

function displayCustomValue(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as { display?: unknown; raw?: unknown };
    if (obj.display !== undefined && obj.display !== null && String(obj.display).trim())
      return String(obj.display);
    if (Array.isArray(obj.raw)) return obj.raw.map(String).join(", ");
  }
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

export const getLeadDetail = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        includeActivities: z.boolean().optional().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: row, error } = await sb
      .from("leads")
      .select(
        "id, name, email, phone, value, stage_id, pipeline_id, crm_source_id, external_id, tags, created_at, updated_at, keep_files, responsible_id, status, source, conversation_status, last_message_from, public_address:custom_data->endereco, public_address_fallback:custom_data->address, public_notes:custom_data->observacoes, public_notes_fallback:custom_data->notes, pipeline_stages(name), pipelines(name), crm_sources(provider, display_name)",
      )
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Lead não encontrado.");
    const r = row as {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      value: number;
      crm_source_id: string | null;
      stage_id: string | null;
      pipeline_id: string | null;
      external_id: string | null;
      tags: unknown;
      created_at: string;
      updated_at: string;
      keep_files: boolean | null;
      responsible_id: string | null;
      status: string;
      source: string | null;
      conversation_status: string | null;
      last_message_from: string | null;
      public_address: unknown;
      public_address_fallback: unknown;
      public_notes: unknown;
      public_notes_fallback: unknown;
      pipeline_stages: { name: string } | null;
      pipelines: { name: string } | null;
      crm_sources: { provider: string; display_name: string } | null;
    };

    const latestTags = Array.isArray(r.tags) ? (r.tags as string[]) : [];
    const publicText = (value: unknown, max: number): string | null =>
      typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
    let responsibleName: string | null = null;
    if (r.responsible_id) {
      // Resolve only public profile labels after confirming their link to this workspace.
      const [membership, workspace] = await Promise.all([
        sb.from("workspace_members").select("user_id")
          .eq("workspace_id", wsId).eq("user_id", r.responsible_id).maybeSingle(),
        sb.from("workspaces").select("owner_id").eq("id", wsId).maybeSingle(),
      ]);
      if (membership.error || workspace.error) throw new Error("Não foi possível conferir o responsável do contato.");
      if (membership.data?.user_id === r.responsible_id || workspace.data?.owner_id === r.responsible_id) {
        const profile = await sb.from("profiles").select("display_name,full_name")
          .eq("id", r.responsible_id).maybeSingle();
        if (profile.error) throw new Error("Não foi possível carregar o nome do responsável.");
        responsibleName = publicText(profile.data?.display_name, 200) ?? publicText(profile.data?.full_name, 200);
      }
    }

    const acts = data.includeActivities
      ? (
          await sb
            .from("lead_activities")
            .select(SLIM_LEAD_ACTIVITY_META_SELECT)
            .eq("workspace_id", wsId)
            .eq("lead_id", data.leadId)
            .order("occurred_at", { ascending: false })
            .limit(100)
        ).data
      : [];

    const { data: customValues } = await sb
      .from("lead_custom_field_values")
      .select("value, lead_custom_fields(id, name, field_type)")
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId)
      .order("updated_at", { ascending: false });

    const customFields: LeadDetailResponse["lead"]["customFields"] = [];
    for (const rowV of (customValues ?? []) as LeadCustomValueRow[]) {
      const field = rowV.lead_custom_fields;
      if (!field) continue;
      customFields.push({
        id: field.id,
        name: field.name,
        type: field.field_type,
        displayValue: displayCustomValue(rowV.value),
      });
    }

    const detail: LeadDetailResponse = {
      workspaceId: wsId,
      actorId: context.userId,
      lead: {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        value: Number(r.value ?? 0),
        stageId: r.stage_id,
        stageName: r.pipeline_stages?.name ?? null,
        pipelineId: r.pipeline_id ?? null,
        pipelineName: r.pipelines?.name ?? null,
        sourceId: r.crm_source_id,
        sourceProvider: r.crm_sources?.provider ?? "mkton",
        sourceDisplayName: r.crm_sources?.display_name ?? "MKTOn",
        externalId: r.external_id,
        externalUrl: null,
        whatsappUrl: (() => {
          const digits = (r.phone ?? "").replace(/\D/g, "");
          return digits.length >= 8 ? `https://wa.me/${digits}` : null;
        })(),
        tags: latestTags,
        customFields,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        keepFiles: !!r.keep_files,
        responsibleId: r.responsible_id ?? null,
        responsibleName,
        status: r.status,
        source: r.source ?? null,
        conversationStatus: r.conversation_status ?? null,
        lastMessageFrom: r.last_message_from ?? null,
        address: publicText(r.public_address, 1000) ?? publicText(r.public_address_fallback, 1000),
        notes: publicText(r.public_notes, 4000) ?? publicText(r.public_notes_fallback, 4000),
      },
      activities: ((acts ?? []) as SlimProjectedActivityRow[]).map(slimProjectedActivity),
    };
    return detail;
  });

export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        text: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb.from("lead_activities").insert({
      workspace_id: wsId,
      lead_id: data.leadId,
      type: "note",
      payload: { text: data.text, by: context.userId },
      occurred_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    const { pauseLeadAiAgentInternal } = await import("./ai-agent-control.server");
    await pauseLeadAiAgentInternal({ workspaceId: wsId, leadId: data.leadId });
    await sb
      .from("leads")
      .update({
        last_message_from: "us",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.leadId)
      .eq("workspace_id", wsId);
    return { ok: true };
  });

/**
 * Envia mensagem ao lead via WhatsApp Web ou canal nativo.

 */
export const sendLeadMessage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        text: z.string().min(1).max(4000),
        clientRequestId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (data.clientRequestId) {
      const { data: existingRequest } = await sb
        .from("lead_activities")
        .select("id, payload")
        .eq("workspace_id", wsId)
        .eq("lead_id", data.leadId)
        .contains("payload", { client_request_id: data.clientRequestId })
        .limit(1)
        .maybeSingle();
      if (existingRequest) {
        const payload = (existingRequest as { payload?: Record<string, unknown> | null }).payload;
        return {
          ok: true,
          channel: (payload?.channel as string | undefined) ?? "whatsapp_web",
          messageId: (payload?.whatsapp_message_id as string | undefined) ?? null,
          deduped: true,
        };
      }
    }
    const { data: lead, error } = await sb
      .from("leads")
      .select(
        "id, phone, external_id, messenger_psid, instagram_igsid, custom_data, crm_sources(provider)",
      )
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead não encontrado.");
    const l = lead as {
      id: string;
      phone: string | null;
      external_id: string | null;
      messenger_psid: string | null;
      instagram_igsid: string | null;
      custom_data: Record<string, unknown> | null;
      crm_sources: { provider: string } | null;
    };

    // === Instagram DM / Messenger via Meta Graph API ===
    const igsid = l.instagram_igsid;
    const psid = l.messenger_psid;
    const metaChannel: "instagram" | "messenger" | null = igsid
      ? "instagram"
      : psid
        ? "messenger"
        : null;
    if (metaChannel) {
      const encKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
      const senderId = (metaChannel === "instagram" ? igsid : psid)!;
      const pageIdForToken = (l.custom_data?.page_id as string | undefined) ?? null;
      if (!pageIdForToken)
        throw new Error("Página vinculada ao contato não encontrada. Reconecte a integração Meta.");
      const { data: tok } = await sb.rpc("get_meta_page_token", {
        _workspace_id: wsId,
        _page_id: pageIdForToken,
        _key: encKey,
      });
      const pageToken = tok as string | null;
      if (!pageToken) throw new Error("Token da página Meta indisponível. Reconecte a integração.");

      // Checa janela 24h olhando última mensagem recebida em channel_messages
      const { data: lastIn } = await sb
        .from("channel_messages")
        .select("received_at")
        .eq("workspace_id", wsId)
        .eq("lead_id", data.leadId)
        .eq("direction", "in")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastInAt = lastIn
        ? new Date((lastIn as { received_at: string }).received_at).getTime()
        : 0;
      if (!lastInAt || Date.now() - lastInAt > 24 * 60 * 60 * 1000) {
        throw new Error(
          "Fora da janela de 24h da Meta. Aguarde uma nova mensagem do contato para responder por aqui.",
        );
      }

      const resp = await fetch(
        `https://graph.facebook.com/v23.0/me/messages?access_token=${encodeURIComponent(pageToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: senderId },
            messaging_type: "RESPONSE",
            message: { text: data.text },
          }),
        },
      );
      const respJson = (await resp.json().catch(() => null)) as {
        message_id?: string;
        error?: { message?: string };
      } | null;
      if (!resp.ok) {
        const errMsg = respJson?.error?.message ?? `HTTP ${resp.status}`;
        throw new Error(`Falha no envio (${metaChannel}): ${errMsg}`);
      }
      const mid = respJson?.message_id ?? null;
      const nowIso = new Date().toISOString();
      await sb.from("channel_messages").insert({
        workspace_id: wsId,
        lead_id: data.leadId,
        channel: metaChannel,
        page_id:
          metaChannel === "instagram"
            ? ((l.custom_data?.instagram_id as string | undefined) ?? null)
            : pageIdForToken,
        thread_id: senderId,
        external_message_id: mid,
        direction: "out",
        text: data.text,
        attachments: [],
        status: "sent",
        raw: {},
        sent_at: nowIso,
        received_at: nowIso,
      });
      await sb.from("lead_activities").insert({
        workspace_id: wsId,
        lead_id: data.leadId,
        type: "message_out",
        payload: {
          text: data.text,
          by: context.userId,
          channel: metaChannel,
          external_message_id: mid,
          client_request_id: data.clientRequestId ?? null,
        },
        occurred_at: nowIso,
      });
      const { pauseLeadAiAgentInternal } = await import("./ai-agent-control.server");
      await pauseLeadAiAgentInternal({ workspaceId: wsId, leadId: data.leadId });
      await sb
        .from("leads")
        .update({
          last_message_from: "us",
          updated_at: nowIso,
        })
        .eq("id", data.leadId)
        .eq("workspace_id", wsId);
      return { ok: true, channel: metaChannel, messageId: mid, error: null };
    }

    // WhatsApp Evolution: a conversa real (remote_jid + sessão) é autoritativa.
    // lead.phone só é fallback para primeiro envio e exige DDI explícito.
    const { preferredWhatsappSessionId, resolveLeadWhatsappRoutingTarget } =
      await import("@/lib/whatsapp-session-routing.server");
    const whatsappTarget = await resolveLeadWhatsappRoutingTarget(sb, {
      workspaceId: wsId,
      leadId: data.leadId,
      phone: l.phone,
      preferredSessionId: preferredWhatsappSessionId(l.custom_data),
    });
    const sessId = whatsappTarget.sessionId;

    const pickMessageId = (value: unknown): string | null => {
      const root = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
      const key = root?.key && typeof root.key === "object" ? (root.key as Record<string, unknown>) : null;
      const dataObj = root?.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
      const dataKey = dataObj?.key && typeof dataObj.key === "object" ? (dataObj.key as Record<string, unknown>) : null;
      const preferred = key?.id ?? dataKey?.id ?? root?.messageId ?? root?.message_id;
      if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
      const stack: unknown[] = [value];
      const seen = new Set<unknown>();
      while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object" || seen.has(current)) continue;
        seen.add(current);
        const obj = current as Record<string, unknown>;
        const direct = obj.id ?? obj.messageId ?? obj.message_id;
        if (typeof direct === "string" && direct.trim()) return direct.trim();
        for (const nested of Object.values(obj)) if (nested && typeof nested === "object") stack.push(nested);
      }
      return null;
    };

    const { data: creds } = await sb.rpc("get_evolution_credentials", {
      _session_id: sessId,
      _key: encKey(),
    });
    const c = creds as { instance_name?: string; api_key?: string } | null;
    if (!c?.instance_name || !c.api_key) throw new Error("Credenciais da sessão Evolution indisponíveis.");
    const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
    if (!base) throw new Error("Evolution não configurada.");

    const resp = await fetch(`${base}/message/sendText/${encodeURIComponent(c.instance_name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.api_key },
      body: JSON.stringify({ number: whatsappTarget.number, text: data.text }),
    });
    const responseBody = await resp.json().catch(() => null);
    if (!resp.ok) {
      const raw = responseBody && typeof responseBody === "object" ? responseBody as Record<string, unknown> : null;
      const err = raw?.message ?? raw?.error ?? `HTTP ${resp.status}`;
      throw new Error(`Falha no envio pelo WhatsApp: ${String(err)}`);
    }
    const messageId = pickMessageId(responseBody);
    const nowIso = new Date().toISOString();

    if (messageId) {
      await sb.from("whatsapp_web_messages").upsert({
        workspace_id: wsId,
        session_id: sessId,
        remote_jid: whatsappTarget.remoteJid,
        to_jid: whatsappTarget.remoteJid,
        message_id: messageId,
        from_me: true,
        message_type: "text",
        body: data.text,
        delivery_status: "sent",
        raw: {},
        received_at: nowIso,
      }, { onConflict: "workspace_id,message_id" });

      const { data: existingActivity } = await sb.from("lead_activities")
        .select("id")
        .eq("workspace_id", wsId)
        .eq("lead_id", data.leadId)
        .contains("payload", { whatsapp_message_id: messageId })
        .limit(1)
        .maybeSingle();
      if (!existingActivity) {
        await sb.from("lead_activities").insert({
          workspace_id: wsId,
          lead_id: data.leadId,
          type: "message_out",
          payload: {
            text: data.text,
            by: context.userId,
            channel: "whatsapp_web",
            whatsapp_message_id: messageId,
            client_request_id: data.clientRequestId ?? null,
            session_id: sessId,
            whatsapp_session_id: sessId,
            whatsapp_remote_jid: whatsappTarget.remoteJid,
            whatsapp_conversation_key: whatsappTarget.conversationKey,
          },
          occurred_at: nowIso,
        });
      }
    }

    const { pauseLeadAiAgentInternal } = await import("./ai-agent-control.server");
    await pauseLeadAiAgentInternal({ workspaceId: wsId, leadId: data.leadId });
    await sb.from("leads")
      .update({ last_message_from: "us", updated_at: nowIso })
      .eq("id", data.leadId)
      .eq("workspace_id", wsId);

    return { ok: true, channel: "whatsapp_web" as const, messageId, error: null };

  });

/**
 * Atualiza campos básicos do lead (nome, email, telefone, valor, tags).

 */
export const updateLead = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        patch: z.object({
          name: z.string().min(1).max(200).optional(),
          email: z.string().email().nullable().optional(),
          phone: z.string().nullable().optional(),
          value: z.number().nonnegative().optional(),
          tags: z.array(z.string()).optional(),
          responsibleId: z.string().uuid().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const eff = await loadEffectivePermissions(sb, context.userId, wsId);
    const editScope = requireAllowed(eff, "crm", "leads", "edit");

    // Se o escopo é "assigned", só o próprio responsável pode editar.
    if (editScope === "assigned") {
      const { data: cur } = await sb
        .from("leads")
        .select("responsible_id")
        .eq("id", data.leadId)
        .eq("workspace_id", wsId)
        .maybeSingle();
      if ((cur as { responsible_id?: string } | null)?.responsible_id !== context.userId) {
        throw new Error("permission_denied: lead fora do seu escopo (assigned)");
      }
    }

    if (data.patch.responsibleId) {
      const { data: member } = await sb
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", wsId)
        .eq("user_id", data.patch.responsibleId)
        .maybeSingle();
      if (!member) throw new Error("Responsável não pertence a este workspace.");
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.patch.name !== undefined) update.name = data.patch.name;
    if (data.patch.email !== undefined) update.email = data.patch.email;
    if (data.patch.phone !== undefined) update.phone = data.patch.phone;
    if (data.patch.value !== undefined) update.value = data.patch.value;
    if (data.patch.tags !== undefined) update.tags = data.patch.tags;
    if (data.patch.responsibleId !== undefined) update.responsible_id = data.patch.responsibleId;

    // Snapshot prévio de tags para diff pós-atualização
    let prevTags: string[] = [];
    if (data.patch.tags !== undefined) {
      const { data: prev } = await sb
        .from("leads")
        .select("tags")
        .eq("id", data.leadId)
        .eq("workspace_id", wsId)
        .maybeSingle();
      prevTags = Array.isArray((prev as { tags?: unknown } | null)?.tags)
        ? (prev as { tags: unknown[] }).tags.map((t) => String(t))
        : [];
    }

    const { error } = await sb
      .from("leads")
      .update(update)
      .eq("id", data.leadId)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);

    // Tags novas usam o mesmo dispatcher canônico do restante do CRM.
    if (data.patch.tags !== undefined && Array.isArray(data.patch.tags)) {
      const prevSet = new Set(prevTags.map((t) => t.toLowerCase()));
      const added = data.patch.tags.filter((t) => !prevSet.has(t.toLowerCase()));
      if (added.length > 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchCrmTagAdded } = await import("@/lib/crm-event-dispatch.server");
        await dispatchCrmTagAdded(supabaseAdmin as never, { workspaceId: wsId, leadId: data.leadId, tags: added });
      }
    }

    // Alterações dos campos básicos também alimentam gatilhos field-updated.
    const changedBasicFields = (["name", "email", "phone", "value"] as const)
      .filter((field) => data.patch[field] !== undefined);
    if (changedBasicFields.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { dispatchCrmFieldUpdated } = await import("@/lib/crm-event-dispatch.server");
      for (const fieldName of changedBasicFields) {
        await dispatchCrmFieldUpdated(supabaseAdmin as never, {
          workspaceId: wsId,
          leadId: data.leadId,
          fieldName,
        });
      }
    }

    // Gatilho de troca de responsável (executado no servidor).
    if (data.patch.responsibleId !== undefined) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
        await enqueueLeadAutomationEvent(supabaseAdmin as never, {
          leadId: data.leadId,
          event: "assignee-changed",
          workspaceId: wsId,
        });
      } catch (e) {
        console.error("gatilhos de responsável", e);
      }
    }
    return { ok: true };
  });

export interface LeadConversationRow {
  whatsappSessionId?: string | null;
  whatsappOrigin?: string | null;
  id: string;
  leadId: string;
  name: string;
  subtitle: string;
  lastMessageFrom: "lead" | "us" | "none";
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  tags: string[];
  stageName: string | null;
  externalId: string | null;
  sourceProvider: string;
  companyId: string | null;
  productIds: string[];
  readStateUnavailable?: boolean;
  conversationStatus: "aberta" | "lida" | "fechada";
}

const LeadConversationCursorSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

type LeadConversationPageInput = {
  search?: string;
  cursor?: z.infer<typeof LeadConversationCursorSchema>;
  limit: number;
};

async function loadLeadConversationPage(
  sb: AnySb,
  wsId: string,
  data: LeadConversationPageInput,
) {
  const selectCols =
    "id, name, email, phone, custom_data, last_message_from, conversation_status, tags, external_id, updated_at, stage_id, company_id, pipeline_stages(name), crm_sources(provider, display_name)";

  // O Inbox é uma lista de conversas, portanto a ordem precisa seguir a
  // última mensagem real. leads.updated_at também muda por edição de nome,
  // etapa, tag e outros metadados e não pode decidir a posição do chat.
  const { data: orderRowsRaw, error: orderError } = await sb.rpc(
    "list_inbox_lead_order_page",
    {
      _workspace_id: wsId,
      _limit: data.limit,
      _cursor_at: data.cursor?.updatedAt ?? null,
      _cursor_id: data.cursor?.id ?? null,
    },
  );
  if (orderError) throw new Error(orderError.message);

  const orderedRows = (orderRowsRaw ?? []) as Array<{
    lead_id: string;
    conversation_at: string;
  }>;
  const hasMore = orderedRows.length > data.limit;
  const orderedPage = orderedRows.slice(0, data.limit);
  const identity=await loadContactIdentityIndex(sb,wsId);
  const pageLeadIds=[...new Set(orderedPage.map(row=>{try{return identity.resolve(row.lead_id);}catch{return null;}}).filter((id):id is string=>!!id))];
  const conversationAtByLead=new Map<string,string>();
  for(const row of orderedPage){try{const id=identity.resolve(row.lead_id);if(!conversationAtByLead.has(id))conversationAtByLead.set(id,row.conversation_at);}catch{/* Archived/unavailable records are not contacts. */}}


  const { data: leadRowsRaw, error: leadError } = pageLeadIds.length
    ? await sb
        .from("leads")
        .select(selectCols)
        .eq("workspace_id", wsId)
        .in("id", pageLeadIds).is("merged_into_id",null)
    : { data: [], error: null };
  if (leadError) throw new Error(leadError.message);

  type SourceRow = {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    last_message_from: string | null;
    conversation_status: string | null;
    tags: unknown;
    external_id: string | null;
    updated_at: string;
    company_id: string | null;
    custom_data?: Record<string, unknown> | null;
    pipeline_stages: { name: string } | null;
    crm_sources: { provider: string; display_name: string } | null;
  };

  const fetchedRows = (leadRowsRaw ?? []) as SourceRow[];
  const rowsById = new Map(fetchedRows.map((row) => [row.id, row] as const));
  const pageRows = pageLeadIds
    .map((leadId) => rowsById.get(leadId))
    .filter((row): row is SourceRow => Boolean(row));

  const previews = new Map<string, { text: string; at: string }>();
  let unreadByLead = new Map<string, number>();
  let activityUnavailable=false;
  let activityTruncated=false;

  if (pageLeadIds.length > 0) {
    // Uma única leitura limitada para a página atual substitui a varredura
    // workspace-wide usada anteriormente no carregamento inicial.
    const activityLimit = Math.min(160, Math.max(30, pageLeadIds.length * 4));
    const { data: recentActs, error: recentActsError } = await sb
      .from("lead_activities")
      .select("lead_id,type,occurred_at,preview_text:payload->>text,media_type:payload->>media_type,file_name:payload->>file_name")
      .eq("workspace_id", wsId)
      .in("lead_id", pageLeadIds)
      .in("type", ["message_in", "message_out", "conversation_read"])
      .order("occurred_at", { ascending: false })
      .limit(activityLimit)
      .abortSignal(AbortSignal.timeout(4_000));
    activityUnavailable=Boolean(recentActsError);
    if(activityUnavailable)console.warn("[Inbox] Leitura de prévias indisponível. Conversas preservadas.");

    const recentRows = ((recentActs ?? []) as Array<{
      lead_id:string;type:string;preview_text:string|null;media_type:string|null;file_name:string|null;occurred_at:string;
    }>).map(row => ({ lead_id:row.lead_id,type:row.type,occurred_at:row.occurred_at,
      payload:{text:row.preview_text,media_type:row.media_type,file_name:row.file_name} }));
    activityTruncated = recentRows.length >= activityLimit;
    const { computeUnreadCountsFromActivities } = await import("@/lib/inbox-read-state");
    unreadByLead = computeUnreadCountsFromActivities(recentRows);

    for (const activity of recentRows) {
      if (activity.type === "conversation_read" || previews.has(activity.lead_id)) continue;
      const text =
        (activity.payload?.text as string | undefined) ??
        mediaTextLabel(activity.payload?.media_type, activity.payload?.file_name) ??
        `(${activity.type})`;
      previews.set(activity.lead_id, { text, at: activity.occurred_at });
    }
  }

  const productsByLead = new Map<string, string[]>();
  if (pageLeadIds.length > 0) {
    const { data: lps, error: leadProductsError } = await sb
      .from("lead_products")
      .select("lead_id, product_id")
      .eq("workspace_id", wsId)
      .in("lead_id", pageLeadIds);
    if (leadProductsError) throw new Error(leadProductsError.message);
    for (const lp of (lps ?? []) as Array<{ lead_id: string; product_id: string }>) {
      const arr = productsByLead.get(lp.lead_id) ?? [];
      arr.push(lp.product_id);
      productsByLead.set(lp.lead_id, arr);
    }
  }

  const search = data.search?.trim().toLowerCase();
  const sourceRows = search
    ? pageRows.filter((row) =>
        [row.name, row.email, row.phone].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(search),
        ),
      )
    : pageRows;

  // A ordem da página segue o cursor da última mensagem real. Alterações
  // cadastrais do lead não promovem uma conversa antiga para o topo do Inbox.
  const originIds = [...new Set(sourceRows.map(row => row.custom_data?.whatsapp_session_id).filter((id): id is string => typeof id === "string" && !!id))];
  const origins = originIds.length ? await sb.from("whatsapp_web_sessions").select("id,phone_number,status").eq("workspace_id",wsId).in("id",originIds) : {data:[],error:null};
  const originMap = new Map<string, {phone_number:string|null;status:string|null}>((origins.data??[]).map((s:any)=>[s.id,s]));
  const conversations: LeadConversationRow[] = sourceRows.map((row) => {
    const preview = previews.get(row.id);
    return {
      id: row.id,
      leadId: row.id,
      name: row.name,
      subtitle:
        [row.phone, row.pipeline_stages?.name].filter(Boolean).join(" · ") ||
        row.email ||
        " - ",
      lastMessageFrom:
        (row.last_message_from as "lead" | "us" | "none" | null) ?? "none",
      lastMessagePreview: preview?.text ?? (activityUnavailable ? "Prévia indisponível. Abra a conversa." : "Sem mensagens ainda."),
      lastMessageAt:
        preview?.at ?? conversationAtByLead.get(row.id) ?? row.updated_at,
      unreadCount: unreadByLead.get(row.id) ?? 0,
      readStateUnavailable: activityUnavailable || (activityTruncated && !previews.has(row.id)),
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      stageName: row.pipeline_stages?.name ?? null,
      externalId: row.external_id,
      sourceProvider: row.crm_sources?.provider ?? "mkton",
      whatsappSessionId: typeof row.custom_data?.whatsapp_session_id === "string" ? row.custom_data.whatsapp_session_id : null,
      whatsappOrigin: (() => {const id=row.custom_data?.whatsapp_session_id;if(typeof id!=="string")return null;const s=originMap.get(id);return s?.phone_number ? "+"+s.phone_number.replace(/\D/g,"")+(s.status==="conectado"?"":" · desconectado") : "Origem não identificada";})(),
      companyId: row.company_id,
      productIds: productsByLead.get(row.id) ?? [],
      conversationStatus: (["aberta", "lida", "fechada"].includes(
        String(row.conversation_status),
      )
        ? (row.conversation_status as "aberta" | "lida" | "fechada")
        : "aberta"),
    };
  });

  const cursorRow = orderedPage.at(-1);
  return {
    conversations,
    hasMore,
    nextCursor:
      hasMore && cursorRow
        ? { updatedAt: cursorRow.conversation_at, id: cursorRow.lead_id }
        : null,
    pageSize: data.limit,
  };
}

export const listLeadConversations = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        cursor: LeadConversationCursorSchema.optional(),
        limit: z.number().int().min(10).max(100).optional().default(40),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    return loadLeadConversationPage(sb, wsId, data);
  });

export const getInboxBootstrap = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(10).max(100).optional().default(40),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const [leadPage, sessionResult] = await Promise.all([
      loadLeadConversationPage(sb, wsId, { limit: data.limit }),
      sb
        .from("whatsapp_web_sessions")
        .select("id, status, last_connected_at, last_disconnected_at, updated_at")
        .eq("workspace_id", wsId)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);
    if (sessionResult.error) throw new Error(sessionResult.error.message);

    const sessions = (sessionResult.data ?? []) as Array<{
      id: string;
      status: string | null;
      last_connected_at: string | null;
      last_disconnected_at: string | null;
      updated_at: string;
    }>;
    const connected = sessions.filter((session) => session.status === "conectado");

    return {
      userId: context.userId,
      workspaceId: wsId,
      leadPage,
      whatsapp: {
        hasConnectedSession: connected.length > 0,
        connectedSessionCount: connected.length,
        latestStatus: sessions[0]?.status ?? null,
        lastConnectedAt:
          connected.find((session) => session.last_connected_at)?.last_connected_at ??
          sessions.find((session) => session.last_connected_at)?.last_connected_at ??
          null,
        lastDisconnectedAt:
          sessions.find((session) => session.last_disconnected_at)?.last_disconnected_at ?? null,
      },
    };
  });

export const checkInboxHealth = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const [
      leadPage,
      leadsCountResult,
      activitiesCountResult,
      whatsappCountResult,
      latestActivityResult,
      latestWhatsappResult,
    ] = await Promise.all([
      loadLeadConversationPage(sb, wsId, { limit: 10 }),
      sb.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", wsId),
      sb
        .from("lead_activities")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .in("type", ["message_in", "message_out"]),
      sb
        .from("whatsapp_web_messages")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId),
      sb
        .from("lead_activities")
        .select("occurred_at")
        .eq("workspace_id", wsId)
        .in("type", ["message_in", "message_out"])
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("whatsapp_web_messages")
        .select("received_at")
        .eq("workspace_id", wsId)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    for (const result of [
      leadsCountResult,
      activitiesCountResult,
      whatsappCountResult,
      latestActivityResult,
      latestWhatsappResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const leadCount = leadsCountResult.count ?? 0;
    const messageActivityCount = activitiesCountResult.count ?? 0;
    const whatsappMessageCount = whatsappCountResult.count ?? 0;
    const conversationCount = leadPage.conversations.length;
    const hasStoredData = leadCount > 0 || messageActivityCount > 0 || whatsappMessageCount > 0;
    const needsRecovery = leadCount > 0 && conversationCount === 0;
    const reason = needsRecovery
      ? "lead-page-empty-with-existing-leads"
      : hasStoredData && conversationCount === 0
        ? "messages-exist-without-materialized-leads"
        : "healthy";

    const health = {
      workspaceId: wsId,
      conversationCount,
      leadCount,
      messageActivityCount,
      whatsappMessageCount,
      latestActivityAt:
        (latestActivityResult.data as { occurred_at?: string } | null)?.occurred_at ?? null,
      latestWhatsappAt:
        (latestWhatsappResult.data as { received_at?: string } | null)?.received_at ?? null,
      hasStoredData,
      needsRecovery,
      reason,
      checkedAt: new Date().toISOString(),
    };

    if (reason !== "healthy") {
      const { error: telemetryError } = await sb.from("security_events").insert({
        workspace_id: wsId,
        user_id: context.userId,
        actor_name: "MKTOn Inbox",
        type: "inbox_health",
        title: "Inconsistência detectada no Inbox",
        description:
          reason === "lead-page-empty-with-existing-leads"
            ? "Existem leads no workspace, mas a consulta de conversas retornou vazia."
            : "Existem mensagens armazenadas sem conversas materializadas no CRM.",
        severity: needsRecovery ? "warning" : "info",
        metadata: health,
      });
      if (telemetryError) {
        console.error("[Inbox health] Falha ao registrar telemetria", telemetryError);
      }
    }

    return health;
  });

export const markLeadConversationRead = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: lead, error: leadError } = await sb.from("leads")
      .select("id, conversation_status")
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead não encontrado.");
    const nowIso = new Date().toISOString();
    const { error } = await sb.from("lead_activities").insert({
      workspace_id: wsId,
      lead_id: data.leadId,
      type: "conversation_read",
      payload: { by: context.userId },
      occurred_at: nowIso,
    });
    if (error) throw new Error(error.message);
    if ((lead as { conversation_status?: string | null }).conversation_status !== "fechada") {
      await sb.from("leads")
        .update({ conversation_status: "lida" })
        .eq("id", data.leadId)
        .eq("workspace_id", wsId);
    }
    return { ok: true, readAt: nowIso };
  });

const LeadActivityCursorSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export const listLeadActivities = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        cursor: LeadActivityCursorSchema.optional(),
        // Compatibilidade transitória com chamadores antigos. Novos chamadores usam cursor.
        before: z.string().datetime({ offset: true }).optional(),
        // Delta incremental do cache F3. Não participa da paginação histórica.
        after: z.string().datetime({ offset: true }).optional(),
        limit: z.number().int().min(1).max(200).optional().default(50),
      })
      .refine(
        (value) => [Boolean(value.cursor), Boolean(value.before), Boolean(value.after)].filter(Boolean).length <= 1,
        { message: "cursor, before e after são mutuamente exclusivos" },
      )
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const identity=await loadContactIdentityIndex(sb,wsId);
    const canonicalId=identity.resolve(data.leadId),family=identity.family(canonicalId);
    if(family.length>1)return readSlimContactHistory(sb,wsId,canonicalId,family,data);
    data={...data,leadId:canonicalId};
    let q = sb
      .from("lead_activities")
      .select(SLIM_LEAD_ACTIVITY_META_SELECT)
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId);

    const isDelta = Boolean(data.after);
    if (data.cursor) {
      q = q.or(
        `occurred_at.lt.${data.cursor.occurredAt},and(occurred_at.eq.${data.cursor.occurredAt},id.lt.${data.cursor.id})`,
      );
    } else if (data.before) {
      q = q.lt("occurred_at", data.before);
    } else if (data.after) {
      q = q.gt("occurred_at", data.after);
    }

    // Histórico usa ordem DESC + cursor composto. Delta F3 usa ASC para aplicar
    // atualizações na ordem em que aconteceram, sem alterar o contrato da paginação.
    const { data: acts, error } = await q
      .order("occurred_at", { ascending: isDelta })
      .order("id", { ascending: isDelta })
      .limit(data.limit + 1);
    if (error) throw new Error(error.message);

    const rawRows = (acts ?? []) as SlimProjectedActivityRow[];
    const hasMore = rawRows.length > data.limit;
    const limitedRows = rawRows.slice(0, data.limit);
    const pageRows = isDelta ? limitedRows : limitedRows.slice().reverse();
    const activities = pageRows.map(slimProjectedActivity);

    const oldest = pageRows[0];
    return {
      activities,
      hasMore,
      earliestAt: oldest?.occurred_at ?? null,
      nextCursor:
        !isDelta && hasMore && oldest
          ? { occurredAt: oldest.occurred_at, id: oldest.id }
          : null,
    };
  });

/**
 * Authenticated single-attachment read. The history endpoint does not return
 * payload.media_url; the operator explicitly requests it by clicking a message.
 */
export const loadSlimLeadActivityMedia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), activityId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: act, error } = await sb.from("lead_activities")
      .select("id,type,payload")
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId)
      .eq("id", data.activityId)
      .maybeSingle();
    if (error) throw new Error("Não foi possível carregar o anexo.");
    if (!act || !["message_in", "message_out"].includes(String(act.type))) {
      throw new Error("Anexo não disponível nesta conversa.");
    }
    const payload = (act.payload ?? {}) as Record<string, unknown>;
    if (payload.deleted_for_all === true || payload.deleted_for_me === true) {
      throw new Error("A mensagem foi apagada.");
    }
    const path = slimInboxStoredMediaPath(payload, wsId, data.leadId);
    if (path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const signed = await supabaseAdmin.storage.from("inbox-outgoing").createSignedUrl(path, 3600);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Não foi possível abrir o anexo armazenado.");
      return { mediaUrl: signed.data.signedUrl };
    }
    const mediaUrl = slimAllowStoredMediaUrl(payload.media_url);
    return { mediaUrl };
  });

/**
 * Envia uma reação emoji para uma mensagem WhatsApp via Evolution.
 * Também atualiza payload.reactions da atividade local.
 */
export const sendLeadReaction = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        activityId: z.string().uuid(),
        emoji: z.string().max(16),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: act } = await sb
      .from("lead_activities")
      .select("id, payload")
      .eq("id", data.activityId)
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (!act) throw new Error("Mensagem não encontrada.");
    const payload = ((act as { payload: Record<string, unknown> | null }).payload ?? {}) as Record<
      string,
      unknown
    >;
    const waMsgId = payload.whatsapp_message_id as string | undefined;
    if (!waMsgId) throw new Error("Só é possível reagir a mensagens do WhatsApp.");

    const { data: waMsg } = await sb
      .from("whatsapp_web_messages")
      .select("remote_jid, from_me, session_id")
      .eq("workspace_id", wsId)
      .eq("message_id", waMsgId)
      .maybeSingle();
    const w = waMsg as { remote_jid?: string; from_me?: boolean; session_id?: string } | null;
    if (!w?.remote_jid || !w?.session_id) throw new Error("Mensagem WhatsApp não encontrada.");

    const { data: creds } = await sb.rpc("get_evolution_credentials", {
      _session_id: w.session_id,
      _key: encKey(),
    });
    const c = creds as { instance_name?: string; api_key?: string } | null;
    if (!c?.instance_name || !c.api_key) throw new Error("WhatsApp Web não conectado.");
    const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
    if (!base) throw new Error("Evolution não configurada.");

    type ReactionRecord = { emoji: string; fromMe: boolean | null; at: string | null };
    const normalizeReactions = (value: unknown): ReactionRecord[] => {
      if (!Array.isArray(value)) return [];
      const result: ReactionRecord[] = [];
      for (const item of value) {
        if (typeof item === "string" && item.trim()) {
          result.push({ emoji: item.trim(), fromMe: null, at: null });
          continue;
        }
        if (item && typeof item === "object") {
          const obj = item as { emoji?: unknown; fromMe?: unknown; at?: unknown };
          const emoji = typeof obj.emoji === "string" ? obj.emoji.trim() : "";
          if (!emoji) continue;
          result.push({
            emoji,
            fromMe: typeof obj.fromMe === "boolean" ? obj.fromMe : null,
            at: typeof obj.at === "string" ? obj.at : null,
          });
        }
      }
      return result;
    };

    const current = normalizeReactions(payload.reactions);
    const currentMine = current.find((r) => r.fromMe === true) ?? null;
    const sameLegacy = data.emoji
      ? current.some((r) => r.fromMe === null && r.emoji === data.emoji)
      : false;
    const shouldRemove = !data.emoji || currentMine?.emoji === data.emoji || sameLegacy;
    const reactionToSend = shouldRemove ? "" : data.emoji;

    const resp = await fetch(
      `${base}/message/sendReaction/${encodeURIComponent(c.instance_name)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: c.api_key },
        body: JSON.stringify({
          key: { remoteJid: w.remote_jid, fromMe: !!w.from_me, id: waMsgId },
          reaction: reactionToSend,
        }),
      },
    );
    if (!resp.ok) throw new Error(`Evolution ${resp.status}: ${await resp.text().catch(() => "")}`);

    const preserved = current.filter(
      (r) => r.fromMe !== true && !(r.fromMe === null && (!data.emoji || r.emoji === data.emoji)),
    );
    const next = shouldRemove
      ? preserved
      : [...preserved, { emoji: data.emoji, fromMe: true, at: new Date().toISOString() }];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin
      .from("lead_activities")
      .update({
        payload: { ...payload, reactions: next },
      })
      .eq("id", data.activityId)
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId);
    if (updateError) throw new Error(updateError.message);

    return { ok: true, removed: shouldRemove };
  });

/**
 * Exclui uma mensagem: "para mim" (soft delete local) ou "para todos" (Evolution deleteMessageForEveryone).
 */
export const deleteLeadMessage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        activityId: z.string().uuid(),
        forEveryone: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: act } = await sb
      .from("lead_activities")
      .select("id, payload, type")
      .eq("id", data.activityId)
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (!act) throw new Error("Mensagem não encontrada.");
    const row = act as { payload: Record<string, unknown> | null; type: string };
    const payload = (row.payload ?? {}) as Record<string, unknown>;

    if (data.forEveryone) {
      if (row.type !== "message_out")
        throw new Error("Só é possível excluir para todos mensagens enviadas por você.");
      const waMsgId = payload.whatsapp_message_id as string | undefined;
      if (!waMsgId) throw new Error("Mensagem sem referência WhatsApp.");
      const { data: waMsg } = await sb
        .from("whatsapp_web_messages")
        .select("remote_jid, from_me, session_id")
        .eq("workspace_id", wsId)
        .eq("message_id", waMsgId)
        .maybeSingle();
      const w = waMsg as { remote_jid?: string; from_me?: boolean; session_id?: string } | null;
      if (!w?.remote_jid || !w?.session_id) throw new Error("Mensagem WhatsApp não encontrada.");
      const { data: creds } = await sb.rpc("get_evolution_credentials", {
        _session_id: w.session_id,
        _key: encKey(),
      });
      const c = creds as { instance_name?: string; api_key?: string } | null;
      if (!c?.instance_name || !c.api_key) throw new Error("WhatsApp Web não conectado.");
      const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
      if (!base) throw new Error("Evolution não configurada.");
      const resp = await fetch(
        `${base}/chat/deleteMessageForEveryone/${encodeURIComponent(c.instance_name)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json", apikey: c.api_key },
          body: JSON.stringify({
            id: waMsgId,
            remoteJid: w.remote_jid,
            fromMe: !!w.from_me,
          }),
        },
      );
      if (!resp.ok)
        throw new Error(`Evolution ${resp.status}: ${await resp.text().catch(() => "")}`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nextPayload = data.forEveryone
      ? { ...payload, deleted_for_all: true, deleted_at: new Date().toISOString() }
      : { ...payload, deleted_for_me: true, deleted_at: new Date().toISOString() };
    const { error: updateError } = await supabaseAdmin
      .from("lead_activities")
      .update({ payload: nextPayload })
      .eq("id", data.activityId)
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, forEveryone: data.forEveryone };
  });

/**
 * Resolve uma mídia do WhatsApp (principalmente figurinha) para data URL exibível no Inbox.
 */
export const resolveLeadMessageMedia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        activityId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: act } = await sb
      .from("lead_activities")
      .select("id, type, payload")
      .eq("id", data.activityId)
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (!act || !["message_in", "message_out"].includes(String((act as {type?:string}).type))) throw new Error("Mensagem não encontrada nesta conversa.");
    const payload = ((act as { payload: Record<string, unknown> | null }).payload ?? {}) as Record<
      string,
      unknown
    >;
    if (payload.deleted_for_me === true || payload.deleted_for_all === true) throw new Error("Mensagem apagada.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const storedPath = slimInboxStoredMediaPath(payload, wsId, data.leadId);
    if (storedPath) {
      const signed = await admin.storage.from("inbox-outgoing").createSignedUrl(storedPath, 3600);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Anexo armazenado indisponível.");
      return { ok: true, mediaUrl: signed.data.signedUrl, mimeType: typeof payload.mime_type === "string" ? payload.mime_type : null };
    }
    const waMsgId = payload.whatsapp_message_id as string | undefined;
    if (!waMsgId) throw new Error("Mídia sem referência do WhatsApp.");

    const { data: waMsg } = await sb
      .from("whatsapp_web_messages")
      .select("message_id, session_id, raw, message_type")
      .eq("workspace_id", wsId)
      .eq("message_id", waMsgId)
      .maybeSingle();
    const w = waMsg as {
      session_id?: string;
      raw?: Record<string, unknown> | null;
      message_type?: string | null;
    } | null;
    if (!w?.session_id) throw new Error("Mensagem WhatsApp não encontrada.");

    const raw = (w.raw ?? {}) as Record<string, unknown>;
    const rawData =
      raw.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : {};
    const key =
      rawData.key && typeof rawData.key === "object"
        ? (rawData.key as Record<string, unknown>)
        : null;
    if (!key?.id || !key?.remoteJid) throw new Error("Chave da mídia não encontrada.");

    const { data: creds } = await sb.rpc("get_evolution_credentials", {
      _session_id: w.session_id,
      _key: encKey(),
    });
    const c = creds as { instance_name?: string; api_key?: string } | null;
    if (!c?.instance_name || !c.api_key) throw new Error("WhatsApp Web não conectado.");
    const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
    if (!base) throw new Error("Evolution não configurada.");

    // Bounded on-demand retrieval; no session restart, retry or base64 in JSONB.
    const { downloadRecoveredEvolutionMedia } = await import("./slim-evolution-media-recovery.server");
    const result = await downloadRecoveredEvolutionMedia({
      url: base + "/chat/getBase64FromMediaMessage/" + encodeURIComponent(c.instance_name),
      apiKey: c.api_key,
      key,
      declaredMimeType: typeof payload.mime_type === "string" ? payload.mime_type : null,
      messageType: w.message_type,
    });
    const path = wsId + "/" + data.leadId + "/recovered/" + data.activityId +
      "-" + crypto.randomUUID() + "." + result.extension;
    // Storage RLS permits an authenticated operator to upload to own workspace.
    const storage = (sb as any).storage.from("inbox-outgoing");
    const { mediaPreparation } = await import("./slim-media-transport.server");
    const uploaded = await mediaPreparation(
      storage.upload(path, result.bytes, { contentType: result.mimeType, upsert: false }),
      "Armazenamento da mídia recuperada", 20_000,
    );
    if (uploaded.error) throw new Error("Não foi possível armazenar o anexo recuperado.");
    const signed = await mediaPreparation(storage.createSignedUrl(path, 3600), "Link de anexo", 15_000);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Link do anexo indisponível.");
    const saved = await admin.from("lead_activities")
      .update({ payload: { ...payload, media_storage_path: path, media_url: null,
        mime_type: result.mimeType, media_type: String(payload.media_type ?? w.message_type ?? "document") } })
      .eq("id", data.activityId).eq("workspace_id", wsId).eq("lead_id", data.leadId)
      .select("id").maybeSingle();
    if (saved.error || !saved.data) throw new Error("Arquivo recuperado, mas o registro não foi confirmado.");
    return { ok: true, mediaUrl: signed.data.signedUrl, mimeType: result.mimeType };
  });

/**
 * Envia mídia (imagem / vídeo / áudio / documento) para um lead via WhatsApp Web (Evolution).
 * Fluxo:
 *  1) Faz upload do arquivo (base64) para o bucket privado `inbox-outgoing`.
 *  2) Gera URL assinada (7 dias) e chama Evolution `sendMedia` ou `sendWhatsAppAudio`.
 *  3) Registra a mensagem em `whatsapp_web_messages` + `lead_activities` para
 *     aparecer imediatamente no Inbox (com media_url = URL assinada).
 */
export const sendLeadMedia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        kind: z.enum(["image", "video", "audio", "document"]),
        mimeType: z.string().min(1).max(200),
        fileName: z.string().min(1).max(300),
        base64: z.string().min(1),
        caption: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: lead, error } = await sb
      .from("leads")
      .select("id, phone, custom_data, crm_sources(provider)")
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead não encontrado.");
    const l = lead as {
      id: string;
      phone: string | null;
      custom_data: Record<string, unknown> | null;
      crm_sources: { provider: string } | null;
    };
    const { preferredWhatsappSessionId, resolveLeadWhatsappRoutingTarget } =
      await import("@/lib/whatsapp-session-routing.server");
    const whatsappTarget = await resolveLeadWhatsappRoutingTarget(sb, {
      workspaceId: wsId,
      leadId: data.leadId,
      phone: l.phone,
      preferredSessionId: preferredWhatsappSessionId(l.custom_data),
    });
    const sessId = whatsappTarget.sessionId;

    // 1) Upload
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const safeName = data.fileName.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${wsId}/${data.leadId}/${Date.now()}-${safeName}`;
    const anySb = sb as unknown as { storage: { from: (b: string) => any } };
    const up = await anySb.storage.from("inbox-outgoing").upload(storagePath, bytes, {
      contentType: data.mimeType,
      upsert: false,
    });
    if (up.error) throw new Error(`upload_failed: ${up.error.message}`);
    const signed = await anySb.storage
      .from("inbox-outgoing")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    const mediaUrl: string = signed.data?.signedUrl;
    if (!mediaUrl) throw new Error("Falha ao gerar URL da mídia.");

    // 2) Evolution
    const { data: creds } = await sb.rpc("get_evolution_credentials", {
      _session_id: sessId,
      _key: encKey(),
    });
    const c = creds as { instance_name?: string; api_key?: string } | null;
    if (!c?.instance_name || !c.api_key) throw new Error("Credenciais do Evolution ausentes.");
    const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
    let messageId: string | null = null;
    let sendError: string | null = null;
    const pickMessageId = (value: unknown): string | null => {
      const root = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
      const key =
        root?.key && typeof root.key === "object" ? (root.key as Record<string, unknown>) : null;
      const data =
        root?.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
      const dataKey =
        data?.key && typeof data.key === "object" ? (data.key as Record<string, unknown>) : null;
      const preferred = key?.id ?? dataKey?.id ?? root?.messageId ?? root?.message_id;
      if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
      const stack: unknown[] = [value];
      const seen = new Set<unknown>();
      while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object" || seen.has(current)) continue;
        seen.add(current);
        const obj = current as Record<string, unknown>;
        const direct = obj.id ?? obj.messageId ?? obj.message_id;
        if (typeof direct === "string" && direct.trim()) return direct.trim();
        for (const nested of Object.values(obj)) {
          if (nested && typeof nested === "object") stack.push(nested);
        }
      }
      return null;
    };
    try {
      const isAudio = data.kind === "audio";
      const url = isAudio
        ? `${base}/message/sendWhatsAppAudio/${encodeURIComponent(c.instance_name)}`
        : `${base}/message/sendMedia/${encodeURIComponent(c.instance_name)}`;
      const body = isAudio
        ? { number: whatsappTarget.number, audio: mediaUrl, encoding: true }
        : {
            number: whatsappTarget.number,
            mediatype: data.kind, // image | video | document
            mimetype: data.mimeType,
            media: mediaUrl,
            fileName: data.fileName,
            caption: data.caption ?? "",
          };
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: c.api_key },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        sendError = `Evolution ${resp.status}: ${await resp.text().catch(() => "")}`;
      } else {
        const j = await resp.json().catch(() => null);
        messageId = pickMessageId(j);
      }
    } catch (e) {
      sendError = e instanceof Error ? e.message : "evolution_error";
    }

    // 3) Registrar mensagem usando apenas o id real da Evolution; id local causava duplicidade com o webhook.
    if (messageId) {
      await sb.from("whatsapp_web_messages").upsert(
        {
          workspace_id: wsId,
          session_id: sessId,
          remote_jid: whatsappTarget.remoteJid,
          to_jid: whatsappTarget.remoteJid,
          message_id: messageId,
          from_me: true,
          message_type: data.kind,
          body: data.caption ?? null,
          media_url: mediaUrl,
          delivery_status: "sent",
          raw: {},
          received_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,message_id" },
      );
    }
    const shouldInsertActivity = Boolean(messageId || sendError);
    if (messageId) {
      const { data: existingActivity } = await sb
        .from("lead_activities")
        .select("id")
        .eq("workspace_id", wsId)
        .eq("lead_id", data.leadId)
        .contains("payload", { whatsapp_message_id: messageId })
        .limit(1)
        .maybeSingle();
      if (existingActivity) {
        await sb
          .from("leads")
          .update({ last_message_from: "us", updated_at: new Date().toISOString() })
          .eq("id", data.leadId)
          .eq("workspace_id", wsId);
        if (sendError) throw new Error(sendError);
        return { ok: true, messageId, mediaUrl };
      }
    }
    if (shouldInsertActivity) {
      await sb.from("lead_activities").insert({
        workspace_id: wsId,
        lead_id: data.leadId,
        type: "message_out",
        payload: {
          text: data.caption ?? null,
          media_url: mediaUrl,
          media_type: data.kind,
          mime_type: data.mimeType,
          file_name: data.fileName,
          by: context.userId,
          channel: "whatsapp_web",
          whatsapp_message_id: messageId,
          whatsapp_session_id: sessId,
          whatsapp_remote_jid: whatsappTarget.remoteJid,
          whatsapp_conversation_key: whatsappTarget.conversationKey,
          error: sendError,
        },
        occurred_at: new Date().toISOString(),
      });
    }
    if (sendError) throw new Error(sendError);
    await sb
      .from("leads")
      .update({ last_message_from: "us", updated_at: new Date().toISOString() })
      .eq("id", data.leadId)
      .eq("workspace_id", wsId);

    const { pauseLeadAiAgentInternal } = await import("./ai-agent-control.server");
    await pauseLeadAiAgentInternal({ workspaceId: wsId, leadId: data.leadId });
    return { ok: true, messageId, mediaUrl };
  });

/**
 * Sincroniza o Inbox com as mensagens do WhatsApp Web (Evolution).
 * - Cria leads no CRM MKTOn para números novos que ainda não existem
 * - Backfill de lead_activities a partir da tabela whatsapp_web_messages
 * Idempotente: dedupe por whatsapp_message_id no payload.
 */
export const syncWhatsAppInbox = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const { data: msgs } = await sb
      .from("whatsapp_web_messages")
      .select(
        "id, session_id, message_id, remote_jid, to_jid, sender_phone, sender_name, body, from_me, received_at, message_type, media_url",
      )
      .eq("workspace_id", wsId)
      .gte("received_at", cutoff)
      .order("received_at", { ascending: false })
      .limit(3000);

    const rows = (msgs ?? []) as Array<{
      id: string;
      session_id: string | null;
      message_id: string;
      remote_jid: string | null;
      to_jid: string | null;
      sender_phone: string | null;
      sender_name: string | null;
      body: string | null;
      from_me: boolean;
      received_at: string;
      message_type: string;
      media_url: string | null;
    }>;
    if (rows.length === 0) return { ok: true, leadsCreated: 0, activitiesInserted: 0 };

    // Agrupa apenas por identidade direta roteável. @lid sem JID alternativo
    // nunca vira telefone por extração de dígitos.
    const { whatsappIdentityFromJid } = await import("@/lib/whatsapp-identity");
    const byPhone = new Map<string, typeof rows>();
    for (const m of rows) {
      const identity =
        whatsappIdentityFromJid(m.remote_jid) ?? whatsappIdentityFromJid(m.to_jid);
      if (identity?.kind !== "direct") continue;
      if (!m.session_id) continue;
      const rawPhone = m.session_id + ":" + identity.digits;
      const arr = byPhone.get(rawPhone) ?? [];
      arr.push(m);
      byPhone.set(rawPhone, arr);
    }
    const phones = Array.from(byPhone.keys());
    if (phones.length === 0) return { ok: true, leadsCreated: 0, activitiesInserted: 0 };

    // Shared contact identity: Clients, Funnel, webhook and backfill never choose different order clones.
    const {leadByPhone,customDataByLead,leadsCreated,pendingCreated}=await prepareSlimInboxContactMap(sb,wsId,byPhone);

    // Dedupe: mensagens já viradas em lead_activities
    // - por whatsapp_message_id (fonte principal)
    // - por chave composta (lead_id|from_me|text|minuto), absorve envios antigos que
    //   entraram sem o id do webhook (ex.: local-<ts>).
    const leadIds = Array.from(new Set(Array.from(leadByPhone.values())));
    const seenById = new Set<string>();
    const seenByComposite = new Set<string>();
    const compositeKey = (leadId: string, fromMe: boolean, text: string, iso: string) =>
      `${leadId}|${fromMe ? "1" : "0"}|${text.trim().slice(0, 200)}|${iso.slice(0, 16)}`;
    if (leadIds.length > 0) {
      const { data: acts } = await sb
        .from("lead_activities")
        .select("lead_id, type, payload, occurred_at")
        .in("lead_id", leadIds)
        .in("type", ["message_in", "message_out"]);
      for (const a of (acts ?? []) as Array<{
        lead_id: string;
        type: string;
        payload: Record<string, unknown> | null;
        occurred_at: string;
      }>) {
        const id = a.payload?.whatsapp_message_id as string | undefined;
        if (id) seenById.add(String(a.payload?.whatsapp_session_id ?? a.payload?.session_id ?? "")+":"+id);
        const text = (a.payload?.text as string | undefined) ?? "";
        seenByComposite.add(compositeKey(a.lead_id, a.type === "message_out", text, a.occurred_at));
      }
    }

    // Backfill de atividades
    const toInsert: Array<Record<string, unknown>> = [];
    const latestByLead = new Map<string, { fromMe: boolean; receivedAt: string; sessionId: string | null }>();
    for (const [phone, arr] of byPhone) {
      const leadId = leadByPhone.get(phone);
      if (!leadId) continue;
      const latest = arr[0];
      if (latest)
        latestByLead.set(leadId, { fromMe: latest.from_me, receivedAt: latest.received_at, sessionId: latest.session_id });
      for (const m of arr) {
        const messageIdentity =
          whatsappIdentityFromJid(m.remote_jid) ?? whatsappIdentityFromJid(m.to_jid);
        if (messageIdentity?.kind !== "direct") continue;
        const messageRemoteJid = messageIdentity.remoteJid;
        // Backfill is compatibility-only. Avoid selecting/parsing raw payloads,
        // which can be hundreds of MiB per batch; the live webhook persists rich metadata.
        const typedMedia = m.message_type && m.message_type !== "text" ? m.message_type : null;
        const fileName = null;
        const mimeType = null;
        const duration = Number.NaN;
        const text = m.body ?? (typedMedia ? mediaTextLabel(typedMedia, fileName) : null);
        if (!text && !m.media_url) continue;
        if (seenById.has(m.session_id+":"+m.message_id)) continue;
        const ck = compositeKey(leadId, m.from_me, text ?? "", m.received_at);
        if (seenByComposite.has(ck)) continue;
        toInsert.push({
          workspace_id: wsId,
          lead_id: leadId,
          type: m.from_me ? "message_out" : "message_in",
          payload: {
            text,
            channel: "whatsapp_web",
            whatsapp_message_id: m.message_id,
            whatsapp_session_id: m.session_id,
            whatsapp_remote_jid: messageRemoteJid,
            whatsapp_source_jid: m.remote_jid,
            whatsapp_conversation_key: m.session_id
              ? `${m.session_id}:${messageRemoteJid.toLowerCase()}`
              : null,
            media_url: m.media_url,
            media_type: typedMedia,
            mime_type: mimeType,
            file_name: fileName,
            duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : null,
          },
          occurred_at: m.received_at,
        });
        seenById.add(m.session_id+":"+m.message_id);
        seenByComposite.add(ck);
      }
    }

    let activitiesInserted = 0;
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error } = await sb.from("lead_activities").insert(chunk);
      if (error) throw new Error("Não foi possível salvar o histórico recebido; a automação será tentada novamente na próxima sincronização.");
      activitiesInserted += chunk.length;
    }

    for (const [leadId, latest] of latestByLead) {
      await sb
        .from("leads")
        .update({
          last_message_from: latest.fromMe ? "us" : "lead",
          custom_data: latest.sessionId
            ? { ...(customDataByLead.get(leadId) ?? {}), whatsapp_session_id: latest.sessionId }
            : (customDataByLead.get(leadId) ?? {}),
          updated_at: latest.receivedAt,
        })
        .eq("id", leadId)
        .eq("workspace_id", wsId);
    }

    // Recover the creation event only after the real inbound history is saved.
    if(pendingCreated.length){
      const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
      const {dispatchCrmLeadCreated}=await import('@/lib/crm-event-dispatch.server');
      const {dispatchSlimRecoveredCreations}=await import('@/lib/slim-whatsapp-entry.core');
      await dispatchSlimRecoveredCreations(supabaseAdmin as never,wsId,pendingCreated,input=>dispatchCrmLeadCreated(supabaseAdmin as never,input));
    }
    return { ok: true, leadsCreated, activitiesInserted };
  });

/** Lista campos personalizados da workspace (para o seletor de "Alterar campo"). */
export const listLeadCustomFields = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("lead_custom_fields")
      .select("id, name, field_type, options")
      .eq("workspace_id", wsId)
      .order("name");
    if (error) throw new Error(error.message);
    const fields = (
      (data ?? []) as Array<{ id: string; name: string; field_type: string; options?: unknown }>
    ).map((r) => ({
      id: r.id,
      name: r.name,
      fieldType: r.field_type,
      options: Array.isArray(r.options) ? (r.options as unknown[]).map(String) : [],
    }));
    return { fields, workspaceId: wsId, actorId: context.userId };
  });

/** Saves definition changes together; any failure rolls back the entire edit. */
export const saveLeadCustomFields = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const field = leadCustomFieldRecord;
    return z.object({
      deletedIds: z.array(z.string().uuid()).max(500),
      updated: z.array(field).max(500),
      created: z.array(field).max(500),
    }).parse(d);
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await loadActiveWorkspace(sb, context.userId);
    const { data: result, error } = await sb.rpc("slim_save_custom_fields", {
      p_deleted_ids: data.deletedIds, p_updated: data.updated, p_created: data.created,
    });
    if (error) throw new Error(error.message);
    if (!(result as { ok?: boolean } | null)?.ok) throw new Error("O banco não confirmou os campos personalizados.");
    return { ok: true };
  });

/** Cria um campo personalizado na workspace ativa. */
export const createLeadCustomField = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => leadCustomFieldInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const id = data.id ?? globalThis.crypto.randomUUID();
    const saved = await sb.rpc("slim_save_custom_fields", {
      p_deleted_ids: [], p_updated: [], p_created: [{ ...data, id }],
    });
    if (saved.error) throw new Error(saved.error.message);
    if (!(saved.data as { ok?: boolean } | null)?.ok) throw new Error("O banco não confirmou a criação do campo.");
    const { data: row, error } = await sb
      .from("lead_custom_fields")
      .select("id, name, field_type, options")
      .eq("workspace_id", wsId)
      .eq("id", id)
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) throw new Error("Já existe um campo com esse nome.");
      throw new Error(error.message);
    }
    const r = row as { id: string; name: string; field_type: string; options?: unknown };
    return {
      field: {
        id: r.id,
        name: r.name,
        fieldType: r.field_type,
        options: Array.isArray(r.options) ? (r.options as unknown[]).map(String) : [],
      },
    };
  });

/** Atualiza nome/tipo/opções de um campo personalizado. */
export const updateLeadCustomField = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        fieldType: z.string().trim().min(1).max(40).optional(),
        options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.fieldType !== undefined) patch.field_type = data.fieldType;
    if (data.options !== undefined) patch.options = data.options;
    const { error } = await sb
      .from("lead_custom_fields")
      .update(patch)
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove um campo personalizado (e os valores gravados nos leads). */
export const deleteLeadCustomField = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    await sb
      .from("lead_custom_field_values")
      .delete()
      .eq("workspace_id", wsId)
      .eq("field_id", data.id);
    const { error } = await sb
      .from("lead_custom_fields")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** Grava valor de um campo personalizado (usado pelo runner de automação). */
export const setLeadCustomFieldValue = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        fieldId: z.string().uuid(),
        value: z.string().max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    // Confirma que lead e campo pertencem à mesma workspace ativa.
    const { data: lead, error: leadError } = await sb
      .from("leads")
      .select("id")
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead não encontrado.");

    const { data: field, error: fieldError } = await sb
      .from("lead_custom_fields")
      .select("id, name, field_type")
      .eq("id", data.fieldId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (fieldError) throw new Error(fieldError.message);
    if (!field) throw new Error("Campo não encontrado.");

    // Não regrava nem redispara automações quando o valor não mudou.
    const { data: current, error: currentError } = await sb
      .from("lead_custom_field_values")
      .select("value")
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId)
      .eq("field_id", data.fieldId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);

    const previousValue = displayCustomValue((current as { value?: unknown } | null)?.value);
    if (previousValue === data.value) {
      return {
        ok: true,
        changed: false,
        value: previousValue,
        fieldId: data.fieldId,
        fieldName: (field as { name?: string }).name ?? "",
      };
    }

    const { data: persisted, error } = await sb
      .from("lead_custom_field_values")
      .upsert(
        {
          workspace_id: wsId,
          lead_id: data.leadId,
          field_id: data.fieldId,
          value: { display: data.value, raw: [data.value] },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "lead_id,field_id" },
      )
      .select("field_id, value, updated_at")
      .single();
    if (error) throw new Error(error.message);

    const persistedValue = displayCustomValue((persisted as { value?: unknown } | null)?.value);
    if (persistedValue !== data.value) {
      throw new Error("O campo foi enviado, mas o banco não confirmou o valor salvo.");
    }

    // Só depois da persistência confirmada os runtimes recebem o evento.
    try {
      const { dispatchCustomFieldChanged } = await import("@/lib/salesbot-runtime.server");
      await dispatchCustomFieldChanged(sb as any, {
        workspaceId: wsId,
        leadId: data.leadId,
        fieldId: data.fieldId,
        fieldName: (field as { name?: string } | null)?.name,
        value: data.value,
      });
    } catch (err) {
      console.error("[setLeadCustomFieldValue] dispatch:", err);
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
      await enqueueLeadAutomationEvent(supabaseAdmin as never, {
        leadId: data.leadId,
        event: "field-updated",
        workspaceId: wsId,
        fieldId: data.fieldId,
        fieldName: (field as { name?: string } | null)?.name,
      });
    } catch (err) {
      console.error("[setLeadCustomFieldValue] gatilhos:", err);
    }

    return {
      ok: true,
      changed: true,
      value: persistedValue,
      fieldId: data.fieldId,
      fieldName: (field as { name?: string }).name ?? "",
    };
  });

/**
 * Lista todas as tags únicas em uso pelos leads da workspace ativa.
 * Usado por seletores (ex.: condições do Salesbot) para escolher tag existente.
 */
export const listWorkspaceTags = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const set = new Set<string>();
    const push = (raw: unknown) => {
      const s = String(raw ?? "").trim();
      if (s) set.add(s);
    };

    const { data, error } = await sb.from("leads").select("tags").eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ tags: unknown }>) {
      if (Array.isArray(row.tags)) for (const t of row.tags) push(t);
    }

    // Tags que só existem dentro dos bots (ação "Gerenciar tags") também são
    // tags do workspace: precisam aparecer como sugestão mesmo antes de
    // qualquer lead tê-las recebido.
    const { data: blocks } = await sb
      .from("salesbot_blocks")
      .select("config")
      .eq("workspace_id", wsId)
      .eq("type", "acao");
    for (const row of (blocks ?? []) as Array<{ config: unknown }>) {
      const cfg = (row.config ?? {}) as Record<string, unknown>;
      if (String(cfg.acaoTipo ?? "") !== "tags") continue;
      for (const part of String(cfg.acaoConfig ?? "").split(",")) {
        push(part.replace(/^[+-]/, ""));
      }
    }

    return { tags: Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR")) };
  });

/**
 * Transcreve um áudio de uma atividade de lead.
 */
export const transcribeLeadAudio = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), activityId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const { data: act } = await sb
      .from("lead_activities")
      .select("id, payload")
      .eq("id", data.activityId)
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId)
      .maybeSingle();

    if (!act) throw new Error("Atividade não encontrada.");
    const payload = (act.payload ?? {}) as Record<string, any>;

    // Se já tem transcrição, retorna ela
    if (payload.transcription) {
      return { text: payload.transcription };
    }

    if (!payload.media_url || payload.media_type !== "audio") {
      throw new Error("Esta atividade não possui áudio para transcrever.");
    }

    const { transcribeAudioUrl } = await import("@/lib/audio-transcription.server");
    const text = await transcribeAudioUrl(sb, wsId, payload.media_url);

    if (!text) throw new Error("Não foi possível transcrever este áudio.");

    // Salva a transcrição no payload da atividade para cache
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("lead_activities")
      .update({
        payload: { ...payload, transcription: text },
      })
      .eq("id", data.activityId)
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId);

    return { text };
  });


// SLIM_CONTACT_IDENTITY_V1

// SLIM_INBOX_DB_RELIEF_V1

// SLIM_INBOX_MEDIA_ON_DEMAND_V1

// SLIM_EVOLUTION_MEDIA_RECOVERY_V1

// SLIM_WHATSAPP_ORIGIN_V1

// SLIM_FIRST_INBOUND_V1
