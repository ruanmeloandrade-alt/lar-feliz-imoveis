import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {boundedMediaRequest,decodeSlimMedia,mediaPreparation} from "./slim-media-transport.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

export * from "./leads.functions.legacy";

type AnySb = {
  from: (table: string) => any;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  storage: { from: (bucket: string) => any };
};

type EvolutionRequestResult = {
  response: Response;
  body: unknown;
};

function encKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
  return key;
}

function evolutionGlobalKey(): string {
  const key = process.env.EVOLUTION_GLOBAL_API_KEY;
  if (!key) throw new Error("EVOLUTION_GLOBAL_API_KEY missing");
  return key;
}

async function loadActiveWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const workspaceId = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!workspaceId) throw new Error("Workspace ativo não encontrado.");
  return workspaceId;
}

function deepString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const stack: unknown[] = [value];
  const seen = new Set<unknown>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
      if (typeof nested === "string" && nested.trim() && wanted.has(key.toLowerCase())) {
        return nested.trim();
      }
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
  return null;
}

function pickMessageId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const key = root.key && typeof root.key === "object" ? (root.key as Record<string, unknown>) : null;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
  const dataKey = data?.key && typeof data.key === "object" ? (data.key as Record<string, unknown>) : null;
  const preferred = key?.id ?? dataKey?.id ?? root.messageId ?? root.message_id;
  if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
  return deepString(value, ["messageId", "message_id", "id"]);
}

export function normalizeEvolutionDeliveryStatus(value: unknown): string {
  const raw = (deepString(value, ["status", "deliveryStatus", "messageStatus"]) ?? "pending")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (["delivery_ack", "delivered", "delivery"].includes(raw)) return "delivered";
  if (["read", "read_ack"].includes(raw)) return "read";
  if (["played", "played_ack"].includes(raw)) return "played";
  if (["server_ack", "sent"].includes(raw)) return "sent";
  if (["error", "failed", "failure", "closed", "close"].includes(raw)) return "failed";
  return "pending";
}

const EXPLICITLY_DISCONNECTED_STATES = new Set([
  "close",
  "closed",
  "disconnect",
  "disconnected",
  "logout",
  "logged_out",
  "loggedout",
]);

export function isEvolutionConnectionClosedMessage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /\bconnection\b.*\bclos(?:e|ed)\b/i.test(value.trim());
}

function isExplicitEvolutionDisconnectedState(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return EXPLICITLY_DISCONNECTED_STATES.has(value.trim().toLowerCase());
}

function extractEvolutionProviderMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const record = value as {
    message?: string | string[];
    error?: string;
    details?: string;
    raw?: string;
    response?: { message?: string | string[] };
  };
  const candidate = record.response?.message ?? record.message ?? record.error ?? record.details ?? record.raw;
  if (Array.isArray(candidate)) {
    const joined = candidate.map(String).filter(Boolean).join(", ").trim();
    if (joined) return joined;
  }
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return deepString(value, ["message", "error", "details", "raw"]) ?? fallback;
}

async function sendEvolutionMediaRequest(args:{url:string;apiKey:string;payload:Record<string,unknown>}):Promise<EvolutionRequestResult>{return boundedMediaRequest(args);}

const CreateMediaSchema = z.object({
  leadId: z.string().uuid(),
  kind: z.enum(["image", "video", "audio", "document"]),
  mimeType: z.string().min(1).max(200),
  fileName: z.string().min(1).max(300),
  base64: z.string().min(1).max(22369624),
  caption: z.string().max(2000).optional(),
});

export const sendLeadMedia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateMediaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    const {assertSlimOperator}=await import("@/lib/slim-workspace-operator.server");
    await assertSlimOperator(sb as any,workspaceId,context.userId);

    const { data: lead, error: leadError } = await sb
      .from("leads")
      .select("id, phone, custom_data")
      .eq("id", data.leadId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead não encontrado.");

    const leadRow = lead as {
      id: string;
      phone: string | null;
      custom_data: Record<string, unknown> | null;
    };
    const {preferredWhatsappSessionId,resolveLeadWhatsappRoutingTarget}=await import('@/lib/whatsapp-session-routing.server');
    const target=await resolveLeadWhatsappRoutingTarget(sb,{workspaceId,leadId:data.leadId,phone:leadRow.phone,preferredSessionId:preferredWhatsappSessionId(leadRow.custom_data)});
    const sessionId=target.sessionId,phoneDigits=target.number;

    const { data: creds, error: credsError } = await sb.rpc("get_evolution_credentials", {
      _session_id: sessionId,
      _key: encKey(),
    });
    if (credsError) throw new Error(credsError.message ?? "Credenciais do Evolution indisponíveis.");
    const credentialRow = creds as { instance_name?: string; api_key?: string } | null;
    if (!credentialRow?.instance_name || !credentialRow.api_key) {
      throw new Error("Credenciais do Evolution ausentes.");
    }

    const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
    if (!base) throw new Error("Evolution não configurada.");

    // Sending a file must never restart the shared WhatsApp session.

    const bytes = decodeSlimMedia(data.base64);
    if(bytes.length<1||bytes.length>16*1024*1024)throw new Error("Arquivo fora do limite permitido de 16 MB.");
    const safeName = data.fileName.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${workspaceId}/${data.leadId}/${Date.now()}-${safeName}`;
    const upload = await mediaPreparation(sb.storage.from("inbox-outgoing").upload(storagePath, bytes, {
      contentType: data.mimeType,
      upsert: false,
    }),"Armazenamento do arquivo");
    if (upload.error) throw new Error(`upload_failed: ${upload.error.message}`);

    const signed = await mediaPreparation(sb.storage
      .from("inbox-outgoing")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7),"Preparação do arquivo");
    const mediaUrl: string | undefined = signed.data?.signedUrl;
    if (!mediaUrl) throw new Error("Falha ao gerar URL da mídia.");

    const isAudio = data.kind === "audio";
    const url = isAudio
      ? `${base}/message/sendWhatsAppAudio/${encodeURIComponent(credentialRow.instance_name)}`
      : `${base}/message/sendMedia/${encodeURIComponent(credentialRow.instance_name)}`;
    const payload: Record<string, unknown> = isAudio
      ? { number: phoneDigits, audio: mediaUrl, encoding: true }
      : {
          number: phoneDigits,
          mediatype: data.kind,
          mimetype: data.mimeType,
          media: mediaUrl,
          fileName: data.fileName,
          caption: data.caption ?? "",
        };

    const {getRequest}=await import("@tanstack/react-start/server");
    if(getRequest()?.signal.aborted)throw new Error("A tentativa foi encerrada antes do envio ao WhatsApp.");
    const sendResult = await sendEvolutionMediaRequest({
      url,
      apiKey: credentialRow.api_key,
      payload,
    });

    // No restart and no resend after contacting the provider.

    if (!sendResult.response.ok) {
      const providerMessage = extractEvolutionProviderMessage(
        sendResult.body,
        `Falha no envio pelo WhatsApp (Evolution ${sendResult.response.status}).`,
      );
      throw new Error(`Falha no envio pelo WhatsApp: ${providerMessage}`);
    }

    const responseBody = sendResult.body;
    const messageId = pickMessageId(responseBody);
    if (!messageId) {
      throw new Error("A Evolution aceitou a requisição, mas não confirmou um ID de mensagem.");
    }

    const deliveryStatus = normalizeEvolutionDeliveryStatus(responseBody);
    if (deliveryStatus === "failed") {
      throw new Error("A Evolution rejeitou a mídia antes da entrega ao WhatsApp.");
    }

    const now = new Date().toISOString();
    try {
    const {persistAcknowledgedMedia}=await import('./slim-media-receipt.server');
    await persistAcknowledgedMedia(sb,{workspaceId,actorId:context.userId,leadId:data.leadId,sessionId,remoteJid:target.remoteJid,messageId,kind:data.kind,caption:data.caption,mediaUrl,deliveryStatus,occurredAt:now});

    const { data: existingActivity } = await sb
      .from("lead_activities")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", data.leadId)
      .contains("payload", { whatsapp_message_id: messageId })
      .limit(1)
      .maybeSingle();

    if (!existingActivity) {
      const { error: activityError } = await sb.from("lead_activities").insert({
        workspace_id: workspaceId,
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
          session_id: sessionId,
          whatsapp_session_id:sessionId,
          whatsapp_remote_jid:target.remoteJid,
          whatsapp_conversation_key:target.conversationKey,
          delivery_status: deliveryStatus,
        },
        occurred_at: now,
      });
      if (activityError) throw new Error(activityError.message);
    }

    await sb
      .from("leads")
      .update({ last_message_from: "us", updated_at: now })
      .eq("id", data.leadId)
      .eq("workspace_id", workspaceId);

    const { pauseLeadAiAgentInternal } = await import("./ai-agent-control.server");
    await pauseLeadAiAgentInternal({ workspaceId, leadId: data.leadId });

    return { ok: true, messageId, mediaUrl, deliveryStatus, historyRecorded:true };
    } catch {
      console.error('[Vanessa Simoni mídia] Provedor confirmou a mensagem; persistência local não confirmada. Sem reenvio automático.');
      return {ok:true,messageId,mediaUrl,deliveryStatus,historyRecorded:false,warning:'O WhatsApp confirmou a aceitação do arquivo, mas o registro no histórico não foi concluído. Não reenvie sem conferir a conversa.'};
    }
  });
// SLIM_INBOX_RESUMPTION_V1

// SLIM_HISTORY_MEDIA_STAGE_HOTFIX_V1

// SLIM_MEDIA_ACK_RECEIPT_V1
