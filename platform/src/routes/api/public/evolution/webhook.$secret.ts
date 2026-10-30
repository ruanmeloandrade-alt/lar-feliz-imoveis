import { createFileRoute } from "@tanstack/react-router";
import { renderSVG } from "uqr";
import { normalizeEvolutionParticipantPhone } from "@/lib/salesbot-group-actions.server";
import { shouldDispatchEvolutionInbound, withEvolutionDispatchStatus } from "@/lib/evolution-inbound-lifecycle";
import { slimDeferredInboundMediaUrl, slimEvolutionMessageSnapshot } from "@/lib/slim-inbound-media.core";
import {
  conversationKey,
  whatsappIdentityFromEvolutionJids,
} from "@/lib/whatsapp-identity";

// Webhook público da Evolution API. URL contém segredo por sessão:
//   /api/public/evolution/webhook/<webhook_secret>

export const Route = createFileRoute("/api/public/evolution/webhook/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const secret = params.secret;
        if (!secret || secret.length < 20) {
          return new Response("bad secret", { status: 400 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("bad payload", { status: 400 });
        }

        const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
        if (!encKey) return new Response("server misconfigured", { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: sessData, error: sessErr } = await supabaseAdmin.rpc(
          "get_evolution_session_by_secret",
          { _webhook_secret: secret, _key: encKey },
        );
        if (sessErr || !sessData) {
          return new Response("unknown session", { status: 404 });
        }
        const sess = sessData as unknown as {
          session_id: string;
          workspace_id: string;
          instance_name: string;
          api_key: string;
        };

        // Valida apikey no header quando presente
        const headerKey = request.headers.get("apikey");
        if (headerKey && headerKey !== sess.api_key) {
          return new Response("unauthorized", { status: 401 });
        }

        const rawEvent = String(payload.event ?? payload.type ?? "");
        const event = rawEvent.toLowerCase().replace(/_/g, ".");
        const dataObj = (payload.data ?? {}) as Record<string, unknown>;
        const QR_VPS_FIX_MESSAGE =
          "Webhook recebido, mas a Evolution não enviou code/base64 do QR. Isso indica falha de geração na VPS/container da Evolution.";
        const PAIRING_VPS_FIX_MESSAGE =
          "O QR Code foi gerado, mas o WhatsApp recusou o pareamento. Revise cache/history e CONFIG_SESSION_PHONE_VERSION na VPS, reinicie a Evolution e recrie a inst-ncia.";

        // Conexão
        if (event === "connection.update") {
          const state = String(
            (dataObj as { state?: string; status?: string }).state ??
              (dataObj as { state?: string; status?: string }).status ??
              findDeepString(payload, ["state", "status"]) ??
              "",
          ).toLowerCase();
          if (state === "open") {
            await supabaseAdmin
              .from("whatsapp_web_sessions")
              .update({ status: "conectado", last_connected_at: new Date().toISOString() })
              .eq("id", sess.session_id);
          } else if (state === "close") {
            const { data: currentSession } = await supabaseAdmin
              .from("whatsapp_web_sessions")
              .select("status, metadata")
              .eq("id", sess.session_id)
              .maybeSingle();
            const current = currentSession as { status?: string; metadata?: { deleted?: boolean } } | null;
            if (current?.metadata?.deleted === true || current?.status === "desconectado") {
              return Response.json({ ok: true, ignored: "closed deleted session" });
            }
            const isPairingAttempt =
              current?.status === "aguardando_qr" ||
              current?.status === "conectando" ||
              current?.status === "falha_pareamento";
            await supabaseAdmin
              .from("whatsapp_web_sessions")
              .update({
                status: isPairingAttempt ? "falha_pareamento" : "desconectado",
                ...(isPairingAttempt ? { last_qr: null } : {}),
                last_disconnected_at: new Date().toISOString(),
                ...(isPairingAttempt
                  ? {
                      metadata: {
                        last_error: PAIRING_VPS_FIX_MESSAGE,
                        last_event: rawEvent || event || "connection.update",
                        last_state: state,
                        checked_at: new Date().toISOString(),
                      },
                    }
                  : {}),
              })
              .eq("id", sess.session_id);
          }
          return Response.json({ ok: true });
        }

        function findDeepString(value: unknown, keys: string[]): string | null {
          if (!value || typeof value !== "object") return null;
          const stack = [value as Record<string, unknown>];
          const wanted = new Set(keys.map((k) => k.toLowerCase()));
          while (stack.length) {
            const current = stack.pop();
            if (!current) continue;
            for (const [key, nested] of Object.entries(current)) {
              if (typeof nested === "string" && nested.trim() && wanted.has(key.toLowerCase())) {
                return nested.trim();
              }
              if (nested && typeof nested === "object") stack.push(nested as Record<string, unknown>);
            }
          }
          return null;
        }

        function looksLikeQrImage(value: string): boolean {
          const v = value.trim();
          return v.startsWith("data:image/") || v.startsWith("iVBOR") || v.startsWith("/9j/");
        }

        function looksLikeBase64ImageData(value: string): boolean {
          const v = value.trim();
          return v.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(v);
        }

        function renderQrDataUrl(qrPayload: string): string {
          const svg = renderSVG(qrPayload, { border: 1, ecc: "M" });
          return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        }

        function asRecord(value: unknown): Record<string, unknown> | null {
          return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        }

        function pickString(value: Record<string, unknown> | null | undefined, keys: string[]): string | null {
          if (!value) return null;
          for (const key of keys) {
            const direct = value[key];
            if (typeof direct === "string" && direct.trim()) return direct.trim();
          }
          return null;
        }

        function normalizeMediaKind(rawType: string): "image" | "video" | "audio" | "document" | "sticker" | null {
          const t = rawType.toLowerCase();
          if (t.includes("image")) return "image";
          if (t.includes("video") || t === "ptv" || t === "ptvmessage") return "video";
          if (t.includes("audio") || t.includes("ptt")) return "audio";
          if (t.includes("document")) return "document";
          if (t.includes("sticker")) return "sticker";
          return null;
        }

        function defaultMime(kind: string) {
          if (kind === "image") return "image/jpeg";
          if (kind === "video") return "video/mp4";
          if (kind === "audio") return "audio/ogg";
          if (kind === "sticker") return "image/webp";
          return "application/octet-stream";
        }

        function mediaLabel(kind: string, fileName?: string | null) {
          if (kind === "image") return "📷 Imagem";
          if (kind === "video") return "🎥 Vídeo";
          if (kind === "audio") return "🎙️ Áudio";
          if (kind === "sticker") return "Sticker";
          return fileName ? `📎 ${fileName}` : "📎 Documento";
        }

        function extractMediaInfo(rawType: string, message: Record<string, unknown>, data: Record<string, unknown>) {
          const image = asRecord(message.imageMessage);
          const video = asRecord(message.videoMessage) ?? asRecord(message.ptvMessage);
          const audio = asRecord(message.audioMessage);
          const document = asRecord(message.documentMessage);
          const sticker = asRecord(message.stickerMessage);
          const kind = image ? "image"
            : video ? "video"
            : audio ? "audio"
            : document ? "document"
            : sticker ? "sticker"
            : normalizeMediaKind(rawType);
          if (!kind) return null;

          const media = image ?? video ?? audio ?? document ?? sticker ?? asRecord(message[rawType]) ?? null;
          const mimeType = pickString(media, ["mimetype", "mimeType"]) ?? defaultMime(kind);
          const fileName = pickString(media, ["fileName", "filename", "title"]);
          const directUrl =
            pickString(data, ["mediaUrl", "media_url", "url", "imageUrl", "audioUrl", "videoUrl", "documentUrl"]) ??
            pickString(media, ["mediaUrl", "media_url", "url", "imageUrl", "audioUrl", "videoUrl", "documentUrl"]);
          const url = slimDeferredInboundMediaUrl(directUrl);
          const secondsRaw = Number((media?.seconds as number | string | undefined) ?? (media?.duration as number | string | undefined));
          return {
            kind,
            mimeType,
            fileName,
            url,
            durationSeconds: Number.isFinite(secondsRaw) && secondsRaw > 0 ? secondsRaw : null,
            label: mediaLabel(kind, fileName),
          };
        }

        // QR atualizado, persiste para a tela conseguir mostrar mesmo quando a API não retorna no polling
        if (event === "qrcode.updated" || event === "qrcode.update" || event.includes("qrcode")) {
          const qr = findDeepString(payload, ["base64", "image", "qrcode", "qr", "code"]);
          if (qr) {
            const lastQr = looksLikeQrImage(qr) || looksLikeBase64ImageData(qr)
              ? qr.startsWith("data:image/") ? qr : `data:image/png;base64,${qr}`
              : renderQrDataUrl(qr);
            await supabaseAdmin
              .from("whatsapp_web_sessions")
              .update({ status: "aguardando_qr", last_qr: lastQr, updated_at: new Date().toISOString() })
              .eq("id", sess.session_id);
          } else {
            await supabaseAdmin
              .from("whatsapp_web_sessions")
              .update({
                status: "erro_qr",
                metadata: {
                  last_error: QR_VPS_FIX_MESSAGE,
                  last_event: rawEvent || event || "qrcode",
                  checked_at: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", sess.session_id);
          }
          return Response.json({ ok: true });
        }

        // Status de mensagem (entrega/leitura)
        if (event === "messages.update") {
          const upd = dataObj as { key?: { id?: string }; status?: string };
          if (upd.key?.id && upd.status) {
            const normalizedStatus = upd.status.toLowerCase();
            const { data: trackedMessage } = await supabaseAdmin
              .from("whatsapp_web_messages")
              .select("sender_phone, remote_jid, to_jid")
              .eq("message_id", upd.key.id)
              .eq("workspace_id", sess.workspace_id)
              .maybeSingle();
            await supabaseAdmin
              .from("whatsapp_web_messages")
              .update({ delivery_status: normalizedStatus })
              .eq("message_id", upd.key.id)
              .eq("workspace_id", sess.workspace_id);
            if (normalizedStatus === "read" || normalizedStatus === "played") {
              const tracked = trackedMessage as {
                sender_phone?: string | null;
                remote_jid?: string | null;
                to_jid?: string | null;
              } | null;
              const trackedIdentity =
                whatsappIdentityFromEvolutionJids(tracked?.remote_jid, tracked?.to_jid) ??
                whatsappIdentityFromEvolutionJids(tracked?.to_jid);
              const unresolvedTrackedLid = [tracked?.remote_jid, tracked?.to_jid].some(
                (jid) => typeof jid === "string" && jid.trim().toLowerCase().endsWith("@lid"),
              ) && trackedIdentity?.kind !== "direct";
              const phone =
                trackedIdentity?.kind === "direct"
                  ? trackedIdentity.digits
                  : unresolvedTrackedLid
                    ? ""
                    : (tracked?.sender_phone ?? "").replace(/\D/g, "");
              if (phone) {
                const { data: lead } = await supabaseAdmin.from("leads")
                  .select("id").eq("workspace_id", sess.workspace_id).eq("phone_normalized", phone).maybeSingle();
                const leadId = (lead as { id?: string } | null)?.id;
                if (leadId) {
                  const { resumeRunsOnMediaEvent } = await import("@/lib/salesbot-runtime.server");
                  await resumeRunsOnMediaEvent(supabaseAdmin as unknown as never, {
                    workspaceId: sess.workspace_id, leadId, messageId: upd.key.id, status: normalizedStatus,
                  });
                }
              }
            }
          }
          return Response.json({ ok: true });
        }

        // Mensagem nova (recebida ou enviada)
        if (event === "messages.upsert" || event === "send.message") {
          const rawData = payload.data;
          const items = Array.isArray(rawData)
            ? rawData
            : Array.isArray(dataObj.messages)
              ? dataObj.messages
              : [dataObj];
          let processed = 0;
          let skipped = 0;
          let processingErrors = 0;

          for (const item of items) {
            const itemObj = asRecord(item);
            if (!itemObj) {
              skipped++;
              continue;
            }
            const msg = itemObj as {
              key?: {
                id?: string;
                remoteJid?: string;
                remoteJidAlt?: string;
                fromMe?: boolean;
                participant?: string;
              };
              pushName?: string;
              messageType?: string;
              message?: Record<string, unknown>;
              messageTimestamp?: number;
            };
            const remoteJid = msg.key?.remoteJid ?? "";
            const routableIdentity = whatsappIdentityFromEvolutionJids(
              remoteJid,
              msg.key?.remoteJidAlt,
            );
            const routableRemoteJid = routableIdentity?.remoteJid ?? remoteJid;
            const unresolvedLid =
              remoteJid.trim().toLowerCase().endsWith("@lid") && !routableIdentity;
            const isGroup =
              remoteJid.endsWith("@g.us") ||
              remoteJid.endsWith("@broadcast") ||
              remoteJid.startsWith("status@");
            const phone =
              routableIdentity?.kind === "direct"
                ? routableIdentity.digits
                : isGroup
                  ? (remoteJid.split("@")[0]?.replace(/\D/g, "") ?? "")
                  : "";
            if (unresolvedLid) {
              console.warn(
                "[evolution-webhook] @lid sem remoteJidAlt roteável; mensagem preservada sem associação automática a lead.",
              );
            }
            if (!phone && !unresolvedLid) {
              skipped++;
              continue;
            }

            const rawMessageType = msg.messageType ?? "text";
            const m = msg.message ?? {};

            // Reação a uma mensagem existente, atualiza payload.reactions da atividade alvo.
            const reactionMsg = asRecord(m.reactionMessage);
            if (reactionMsg) {
              const targetKey = asRecord(reactionMsg.key);
              const targetId = typeof targetKey?.id === "string" ? targetKey.id : null;
              const emoji = typeof reactionMsg.text === "string" ? reactionMsg.text : "";
              const reactedFromMe = !!msg.key?.fromMe;
              if (targetId) {
                const { data: target } = await supabaseAdmin
                  .from("lead_activities")
                  .select("id, lead_id, payload")
                  .eq("workspace_id", sess.workspace_id)
                  .contains("payload", { whatsapp_message_id: targetId })
                  .limit(1)
                  .maybeSingle();
                const t = target as { id?: string; payload?: Record<string, unknown> | null } | null;
                if (t?.id) {
                  const prevRaw = Array.isArray(t.payload?.reactions) ? t.payload!.reactions as unknown[] : [];
                  const prev = prevRaw
                    .map((item) => {
                      if (typeof item === "string" && item.trim()) return { emoji: item.trim(), fromMe: null as boolean | null };
                      if (item && typeof item === "object") {
                        const obj = item as { emoji?: unknown; fromMe?: unknown; at?: unknown };
                        const value = typeof obj.emoji === "string" ? obj.emoji.trim() : "";
                        if (!value) return null;
                        return { emoji: value, fromMe: typeof obj.fromMe === "boolean" ? obj.fromMe : null as boolean | null, at: typeof obj.at === "string" ? obj.at : null };
                      }
                      return null;
                    })
                    .filter((item): item is { emoji: string; fromMe: boolean | null; at?: string | null } => Boolean(item));
                  const preserved = prev.filter((r) => r.fromMe !== reactedFromMe && r.fromMe !== null);
                  const next = emoji ? [...preserved, { emoji, fromMe: reactedFromMe, at: new Date().toISOString() }] : preserved;
                  await supabaseAdmin
                    .from("lead_activities")
                    .update({ payload: { ...(t.payload ?? {}), reactions: next } })
                    .eq("id", t.id);
                }
              }
              processed++;
              continue;
            }

            const mediaInfo = extractMediaInfo(rawMessageType, m, itemObj);

            // Persist the message immediately. A clicked attachment is recovered
            // through the authenticated, bounded Inbox media operation.

            const messageType = mediaInfo?.kind ?? rawMessageType.replace(/Message$/i, "") ?? "text";
            const body =
              (m.conversation as string | undefined) ??
              ((m.extendedTextMessage as { text?: string } | undefined)?.text) ??
              ((m.imageMessage as { caption?: string } | undefined)?.caption) ??
              ((m.videoMessage as { caption?: string } | undefined)?.caption) ??
              ((m.documentMessage as { fileName?: string } | undefined)?.fileName) ??
              mediaInfo?.label ??
              null;

            const receivedAt = msg.messageTimestamp
              ? new Date(msg.messageTimestamp * 1000).toISOString()
              : new Date().toISOString();
            const messageId = msg.key?.id ?? `wh-${Date.now()}-${processed}`;

            await supabaseAdmin.from("whatsapp_web_messages").upsert(
              {
                workspace_id: sess.workspace_id,
                session_id: sess.session_id,
                remote_jid: remoteJid,
                to_jid: routableRemoteJid !== remoteJid ? routableRemoteJid : null,
                message_id: messageId,
                from_me: !!msg.key?.fromMe,
                sender_name: msg.pushName ?? null,
                sender_phone: phone || null,
                message_type: messageType,
                body,
                media_url: mediaInfo?.url ?? null,
                delivery_status: msg.key?.fromMe ? "sent" : "received",
                raw: slimEvolutionMessageSnapshot(payload, itemObj, mediaInfo),
                received_at: receivedAt,
              },
              { onConflict: "workspace_id,message_id" },
            );

            // Vincula ao lead correspondente (por telefone) para aparecer no Inbox.
            // Grupos/broadcast não viram leads.
            try {
              const {findSlimContact,createSlimCanonicalContact}=await import('@/lib/slim-contact-identity.core');
              let resolvedLeadId: string | null = null;
              let freshInboundForLead = !msg.key?.fromMe;
              if (!isGroup && !unresolvedLid) {
                const leadMatch=await findSlimContact(supabaseAdmin as never,sess.workspace_id,phone,sess.session_id);
                const match = leadMatch as {
                  id: string;
                  name?: string | null;
                  source?: string | null;
                  status: string;
                  phone_normalized?: string | null;
                  custom_data?: Record<string, unknown> | null;
                  pipeline_id?: string | null;
                  stage_id?: string | null;
                } | null;
                resolvedLeadId = match?.id ?? null;
                if (resolvedLeadId && match) {
                  let currentCustom = match.custom_data ?? {};
                  if (currentCustom.crm_created_dispatched === false) {
                    const { dispatchCrmLeadCreated } = await import("@/lib/crm-event-dispatch.server");
                    await dispatchCrmLeadCreated(supabaseAdmin as never, {
                      workspaceId: sess.workspace_id,
                      leadId: resolvedLeadId,
                      pipelineId: match.pipeline_id ?? null,
                      stageId: match.stage_id ?? null,
                    });
                    currentCustom = { ...currentCustom, crm_created_dispatched: true };
                  }

                  const inboundPushName = !msg.key?.fromMe ? msg.pushName?.trim() ?? "" : "";
                  const currentName = match.name?.trim() ?? "";
                  const nameSource = currentCustom.whatsapp_name_source;
                  const canEnrichWhatsappName =
                    !!inboundPushName &&
                    match.source === "whatsapp" &&
                    (
                      currentName === phone ||
                      currentName === `+${phone}` ||
                      nameSource === "phone_fallback"
                    );

                  const leadPatch: Record<string, unknown> = {
                    custom_data: { ...currentCustom, whatsapp_session_id: sess.session_id },
                  };
                  // Persistir a identidade usada na busca. Evita múltiplas conversas
                  // do mesmo WhatsApp e permite que o índice único evite races.
                  if (match.source === "whatsapp" && match.phone_normalized !== phone) {
                    leadPatch.phone_normalized = phone;
                  }
                  if (canEnrichWhatsappName) {
                    leadPatch.name = inboundPushName;
                    leadPatch.custom_data = {
                      ...currentCustom,
                      whatsapp_session_id: sess.session_id,
                      whatsapp_name_source: "inbound_push_name",
                    };
                  }

                  if (
                    canEnrichWhatsappName ||
                    leadPatch.phone_normalized !== undefined ||
                    currentCustom.whatsapp_session_id !== sess.session_id ||
                    currentCustom !== match.custom_data
                  ) {
                    await supabaseAdmin
                      .from("leads")
                      .update(leadPatch as never)
                      .eq("id", resolvedLeadId)
                      .eq("workspace_id", sess.workspace_id);
                  }
                }

                // O lead já existe. Não alteramos o status automaticamente aqui.
                // O status só deve mudar via Salesbot (bloco de ação) ou manualmente.
                // Removida a reativação automática para 'active' atendendo ao pedido do Ruan.

                if (!resolvedLeadId && !msg.key?.fromMe) {
                  // Novos leads de WhatsApp nascem somente de inbound real.
                  // Em eventos outbound, pushName representa a própria conta conectada e
                  // nunca deve virar o nome do contato.
                  // CRM principal do workspace (is_default=true), fallback mkton, fallback primeiro.
                  const { data: sources } = await supabaseAdmin
                    .from("crm_sources")
                    .select("id, provider, is_default")
                    .eq("workspace_id", sess.workspace_id);
                  const sourceList = (sources as Array<{ id: string; provider: string; is_default: boolean }> | null) ?? [];
                  const chosen =
                    sourceList.find((s) => s.is_default) ??
                    sourceList.find((s) => s.provider === "mkton") ??
                    sourceList[0] ??
                    null;
                  const sourceId = chosen?.id ?? null;

                  let pipelineId: string | null = null;
                  let stageId: string | null = null;
                  if (sourceId) {
                    const { data: pipeline } = await supabaseAdmin
                      .from("pipelines")
                      .select("id")
                      .eq("workspace_id", sess.workspace_id)
                      .eq("crm_source_id", sourceId)
                      .order("position", { ascending: true })
                      .limit(1)
                      .maybeSingle();
                    pipelineId = (pipeline as { id?: string } | null)?.id ?? null;
                    if (pipelineId) {
                      const { data: stage } = await supabaseAdmin
                        .from("pipeline_stages")
                        .select("id")
                        .eq("workspace_id", sess.workspace_id)
                        .eq("pipeline_id", pipelineId)
                        .order("position", { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      stageId = (stage as { id?: string } | null)?.id ?? null;
                    }
                  }

                  if (sourceId) {
                    const inboundPushName = msg.pushName?.trim() ?? "";
                    const displayName = inboundPushName || `+${phone}`;
                    const created=await createSlimCanonicalContact(supabaseAdmin as never,sess.workspace_id,{
                      crm_source_id:sourceId,pipeline_id:pipelineId,stage_id:stageId,name:displayName,phone:'+'+phone,source:'whatsapp',
                      custom_data:{whatsapp_session_id:sess.session_id,crm_created_dispatched:false,whatsapp_name_source:inboundPushName?'inbound_push_name':'phone_fallback'},last_message_from:'lead'
                    });
                    resolvedLeadId=created.id;
                    if(created.created){
                      const {dispatchCrmLeadCreated}=await import('@/lib/crm-event-dispatch.server');
                      await dispatchCrmLeadCreated(supabaseAdmin as never,{workspaceId:sess.workspace_id,leadId:created.id,pipelineId,stageId});
                      await supabaseAdmin.from('leads').update({custom_data:{whatsapp_session_id:sess.session_id,crm_created_dispatched:true,whatsapp_name_source:inboundPushName?'inbound_push_name':'phone_fallback'}}).eq('id',created.id).eq('workspace_id',sess.workspace_id);
                    }
                  } else {
                    console.warn("[evolution-webhook] no crm_source for workspace", sess.workspace_id);
                  }
                }
              }


              let inboundActivityId: string | null = null;
              let inboundActivityPayload: Record<string, unknown> | null = null;
              if (resolvedLeadId && (body || mediaInfo?.url)) {
                const whatsappMsgId = msg.key?.id ?? null;
                let alreadyLogged = false;
                if (whatsappMsgId) {
                  const { data: dup } = await supabaseAdmin
                    .from("lead_activities")
                    .select("id, payload")
                    .eq("workspace_id", sess.workspace_id)
                    .eq("lead_id", resolvedLeadId)
                    .contains("payload", { whatsapp_message_id: whatsappMsgId })
                    .limit(1)
                    .maybeSingle();
                  const duplicate = dup as { id?: string; payload?: Record<string, unknown> | null } | null;
                  alreadyLogged = !!duplicate?.id;
                  inboundActivityId = duplicate?.id ?? null;
                  inboundActivityPayload = duplicate?.payload ?? null;
                  freshInboundForLead = shouldDispatchEvolutionInbound({
                    fromMe: !!msg.key?.fromMe,
                    activityExists: alreadyLogged,
                    dispatchStatus: inboundActivityPayload?.inbound_dispatch_status,
                  });
                }
                if (!alreadyLogged) {
                  const activityPayload = {
                    text: body ?? mediaInfo?.label ?? "Mensagem",
                    channel: "whatsapp_web",
                    whatsapp_message_id: whatsappMsgId,
                    whatsapp_session_id: sess.session_id,
                    whatsapp_remote_jid: routableRemoteJid,
                    whatsapp_source_jid: remoteJid,
                    whatsapp_conversation_key: conversationKey(
                      sess.session_id,
                      routableRemoteJid,
                    ),
                    media_url: mediaInfo?.url ?? null,
                    media_type: mediaInfo?.kind ?? null,
                    mime_type: mediaInfo?.mimeType ?? null,
                    file_name: mediaInfo?.fileName ?? null,
                    duration_seconds: mediaInfo?.durationSeconds ?? null,
                    ...(!msg.key?.fromMe ? { inbound_dispatch_status: "pending" } : {}),
                  };
                  const { data: insertedActivity, error: activityError } = await supabaseAdmin
                    .from("lead_activities")
                    .insert({
                      workspace_id: sess.workspace_id,
                      lead_id: resolvedLeadId,
                      type: msg.key?.fromMe ? "message_out" : "message_in",
                      payload: activityPayload,
                      occurred_at: receivedAt,
                    })
                    .select("id, payload")
                    .maybeSingle();
                  if (activityError) throw new Error(`lead_activity_insert_failed: ${activityError.message}`);
                  const inserted = insertedActivity as { id?: string; payload?: Record<string, unknown> | null } | null;
                  inboundActivityId = inserted?.id ?? null;
                  inboundActivityPayload = inserted?.payload ?? activityPayload;
                  freshInboundForLead = shouldDispatchEvolutionInbound({
                    fromMe: !!msg.key?.fromMe,
                    activityExists: false,
                    dispatchStatus: null,
                  });
                  await supabaseAdmin
                    .from("leads")
                    .update({
                      last_message_from: msg.key?.fromMe ? "us" : "lead",
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", resolvedLeadId)
                    .eq("workspace_id", sess.workspace_id);
                }
              }

              // Grupos reais @g.us: retoma bots de grupo e guarda quem falou.
              // Broadcast/status não entram nesse fluxo e o lead do grupo é
              // localizado pelo JID completo, sem fallback numérico.
              if (remoteJid.endsWith("@g.us") && !msg.key?.fromMe) {
                try {
                  const { data: groupLead } = await supabaseAdmin
                    .from("leads")
                    .select("id")
                    .eq("workspace_id", sess.workspace_id)
                    .eq("phone", remoteJid)
                    .eq("custom_data->>whatsapp_session_id", sess.session_id)
                    .eq("custom_data->>technical_group_context", "true")
                    .limit(1)
                    .maybeSingle();
                  const groupLeadId = (groupLead as { id?: string } | null)?.id ?? null;
                  const senderPhone = normalizeEvolutionParticipantPhone(msg.key?.participant);
                  const senderName = msg.pushName ?? "";
                  if (groupLeadId) {
                    const { resumeRunsOnInboundMessage } = await import("@/lib/salesbot-runtime.server");
                    await resumeRunsOnInboundMessage(supabaseAdmin as unknown as never, {
                      workspaceId: sess.workspace_id,
                      leadId: groupLeadId,
                      text: body ?? mediaInfo?.label ?? "",
                      senderPhone: senderPhone ?? undefined,
                      senderName,
                    });
                  }

                  // A configured trigger can create the group's first bot context.
                  const { dispatchGroupEvent } = await import("@/lib/whatsapp-group-rules.server");
                  await dispatchGroupEvent({
                    workspaceId: sess.workspace_id,
                    sessionId: sess.session_id,
                    groupJid: remoteJid,
                    type: "message",
                    text: body ?? mediaInfo?.label ?? "",
                    senderPhone: senderPhone ?? undefined,
                    senderName,
                  });
                } catch (e) {
                  console.warn("[salesbot grupo] resume fail:", (e as Error).message);
                }
              }

              // Dispatcher Salesbot, inbound do lead dispara/retoma bots.
              // NUNCA chamar para grupos (o fluxo de grupo já tratou acima).
              if (resolvedLeadId && !isGroup && !msg.key?.fromMe && freshInboundForLead) {
                try {
                  const mediaKindMap: Record<string, "audio" | "imagem" | "video" | "documento"> = {
                    audio: "audio",
                    image: "imagem",
                    video: "video",
                    document: "documento",
                  };
                  const mediaType = mediaInfo?.kind ? mediaKindMap[mediaInfo.kind] ?? null : null;
                  // primeira mensagem inbound: conta atividades anteriores do lead
                  const { count: prevInCount } = await supabaseAdmin
                    .from("lead_activities")
                    .select("id", { count: "exact", head: true })
                    .eq("workspace_id", sess.workspace_id)
                    .eq("lead_id", resolvedLeadId)
                    .eq("type", "message_in");
                  const isFirstMessage = (prevInCount ?? 0) <= 1;
                  const { dispatchInboundMessage } = await import("@/lib/salesbot-runtime.server");
                  await dispatchInboundMessage(supabaseAdmin as unknown as never, {
                    workspaceId: sess.workspace_id,
                    leadId: resolvedLeadId,
                    text: body ?? mediaInfo?.label ?? "",
                    canal: "whatsapp",
                    canalId: sess.session_id,
                    mediaType,
                    isFirstMessage,
                  });
                  if (inboundActivityId) {
                    const nextPayload = withEvolutionDispatchStatus(inboundActivityPayload ?? {}, "dispatched");
                    await supabaseAdmin.from("lead_activities")
                      .update({ payload: nextPayload as never })
                      .eq("id", inboundActivityId)
                      .eq("workspace_id", sess.workspace_id)
                      .eq("lead_id", resolvedLeadId);
                    inboundActivityPayload = nextPayload;
                  }
                } catch (e) {
                  processingErrors++;
                  const message = e instanceof Error ? e.message : String(e);
                  if (inboundActivityId) {
                    const nextPayload = withEvolutionDispatchStatus(inboundActivityPayload ?? {}, "error", message);
                    await supabaseAdmin.from("lead_activities")
                      .update({ payload: nextPayload as never })
                      .eq("id", inboundActivityId)
                      .eq("workspace_id", sess.workspace_id)
                      .eq("lead_id", resolvedLeadId);
                    inboundActivityPayload = nextPayload;
                  }
                  console.warn("[salesbot] dispatch fail:", message);
                }
              }
            } catch (e) {
              processingErrors++;
              console.warn("[evolution-webhook] lead processing failed:", e instanceof Error ? e.message : e);
            }
            processed++;
          }
          return Response.json(
            { ok: processingErrors === 0, processed, skipped, processingErrors },
            { status: processingErrors > 0 ? 500 : 200 },
          );
        }

        // Participantes de grupo (entrou / saiu / removido / promovido)
        if (event.startsWith("group-participants") || event.startsWith("group.participants")) {
          const g = dataObj as {
            id?: string; groupJid?: string; action?: string;
            participants?: unknown; participant?: unknown; author?: string;
          };
          const groupJid = String(g.id ?? g.groupJid ?? "");
          const rawAction = String(g.action ?? "").toLowerCase();
          const action =
            rawAction === "add" ? "add"
              : rawAction === "remove" ? "remove"
                : rawAction === "leave" ? "leave"
                  : rawAction === "promote" ? "promote"
                    : rawAction === "demote" ? "demote"
                      : null;
          const listRaw = Array.isArray(g.participants)
            ? g.participants
            : g.participant ? [g.participant] : [];
          if (groupJid && action && listRaw.length > 0) {
            const { dispatchGroupParticipantEvent } = await import("@/lib/salesbot-runtime.server");
            for (const p of listRaw) {
              const jid = typeof p === "string" ? p : String((asRecord(p) ?? {}).id ?? "");
              const phone = normalizeEvolutionParticipantPhone(jid);
              if (!phone) continue;
              // Saída voluntária: o autor da ação é o próprio participante.
              const effective = action === "remove" && g.author
                && normalizeEvolutionParticipantPhone(g.author) === phone ? "leave" : action;
              try {
                await dispatchGroupParticipantEvent(supabaseAdmin as unknown as never, {
                  workspaceId: sess.workspace_id,
                  groupJid,
                  participantPhone: phone,
                  action: effective as "add" | "leave" | "remove" | "promote" | "demote",
                });

                // Nova lógica de regras de grupo (join/leave)
                if (effective === "add" || effective === "leave") {
                  const { dispatchGroupEvent } = await import("@/lib/whatsapp-group-rules.server");
                  await dispatchGroupEvent({
                    workspaceId: sess.workspace_id,
                    sessionId: sess.session_id,
                    groupJid,
                    type: effective === "add" ? "member_join" : "member_leave",
                    senderPhone: phone,
                  });
                }
              } catch (e) {
                console.warn("[wa-group] dispatch fail:", (e as Error).message);
              }
            }
          }
          return Response.json({ ok: true, group: groupJid, action: rawAction });
        }

        // Ligações (Evolution "call" event)
        if (event === "call" || event === "call.offer" || event === "call.upsert") {
          const calls = Array.isArray(dataObj) ? dataObj : [dataObj];
          for (const c of calls as Array<Record<string, unknown>>) {
            const from = String(c.from ?? c.chatId ?? "");
            const phoneNorm = from.replace(/[^\d]/g, "").slice(-14);
            const status = String(c.status ?? c.state ?? "unknown");
            const external = String(c.id ?? `${from}-${c.date ?? Date.now()}`);
            const startedAt = c.date ? new Date(String(c.date)).toISOString() : new Date().toISOString();
            const duration = typeof c.duration === "number" ? c.duration : 0;
            try {
              const { data: inserted } = await supabaseAdmin
                .from("whatsapp_call_events")
                .upsert({
                  workspace_id: sess.workspace_id,
                  session_id: sess.session_id,
                  external_id: external,
                  direction: c.isVideo ? "video_in" : "voice_in",
                  from_number: from,
                  phone_normalized: phoneNorm,
                  status,
                  duration_seconds: duration,
                  started_at: startedAt,
                  raw: c as never,
                } as never, { onConflict: "workspace_id,external_id" })
                .select("id")
                .maybeSingle();

              const { processCallEvent } = await import("@/lib/whatsapp-calls.server");
              await processCallEvent(supabaseAdmin as never, {
                workspaceId: sess.workspace_id,
                sessionId: sess.session_id,
                instanceId: sess.instance_name,
                apiKey: sess.api_key,
                callId: (inserted as { id: string } | null)?.id ?? null,
                phoneNormalized: phoneNorm,
                fromNumber: from,
                status,
                durationSeconds: duration,
              });
            } catch (e) {
              console.warn("[wa-call] upsert fail:", (e as Error).message);
            }
          }
          return Response.json({ ok: true, calls: calls.length });
        }

        return Response.json({ ok: true, ignored: event });
      },
    },
  },
});

// SLIM_CONTACT_IDENTITY_V1

// SLIM_WHATSAPP_ORIGIN_V1
