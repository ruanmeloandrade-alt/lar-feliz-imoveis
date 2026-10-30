import { createFileRoute } from "@tanstack/react-router";
import {
  META_GRAPH,
  adminClient,
  persistWebhookEvent,
  verifyMetaHmac,
} from "@/lib/meta-server";

// Webhook público da Meta.
// GET  → verify challenge (hub.verify_token vs META_WEBHOOK_VERIFY_TOKEN)
// POST → X-Hub-Signature-256 HMAC obrigatório, todos os eventos persistidos em webhook_events

type SupaAdmin = ReturnType<typeof adminClient>;

// ---------------- helpers de negócio ----------------

async function resolveMessengerWorkspace(admin: SupaAdmin, pageId: string) {
  const { data } = await admin.from("meta_pages").select("workspace_id").eq("page_id", pageId).maybeSingle();
  return data?.workspace_id ?? null;
}

async function resolveInstagramWorkspace(admin: SupaAdmin, igId: string) {
  const { data } = await admin.from("meta_instagram_accounts").select("workspace_id,page_id").eq("instagram_id", igId).maybeSingle();
  return data ? { workspaceId: data.workspace_id, pageId: data.page_id ?? null } : null;
}

async function ensureChannelSource(
  admin: SupaAdmin,
  workspaceId: string,
  provider: "instagram_dm" | "messenger" | "instagram_comment" | "facebook_comment" | "instagram_mention" | "facebook_mention",
  displayName: string,
): Promise<string> {
  let { data: src } = await admin.from("crm_sources")
    .select("id").eq("workspace_id", workspaceId).eq("provider", provider).maybeSingle();
  if (!src) {
    const created = await admin.from("crm_sources").insert({
      workspace_id: workspaceId, provider, display_name: displayName, is_default: false,
    }).select("id").single();
    src = created.data;
  }
  return (src as { id: string }).id;
}

async function fetchPageToken(admin: SupaAdmin, workspaceId: string, pageId: string, encKey: string): Promise<string | null> {
  const { data } = await admin.rpc("get_meta_page_token", { _workspace_id: workspaceId, _page_id: pageId, _key: encKey });
  return (data as string | null) ?? null;
}

async function fetchSenderProfile(kind: "messenger" | "instagram", senderId: string, pageToken: string) {
  try {
    const fields = kind === "instagram" ? "name,username,profile_pic" : "name,profile_pic";
    const url = new URL(`https://graph.facebook.com/${META_GRAPH}/${senderId}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", pageToken);
    const r = await fetch(url.toString());
    if (!r.ok) return {};
    const j = await r.json() as { name?: string; username?: string; profile_pic?: string };
    return { name: j.name, username: j.username, profilePic: j.profile_pic };
  } catch { return {}; }
}

async function ensureLead(admin: SupaAdmin, args: {
  workspaceId: string; channel: "instagram" | "messenger"; senderId: string; pageId: string | null; pageToken: string | null;
}): Promise<string | null> {
  const { workspaceId, channel, senderId, pageToken } = args;
  const idColumn = channel === "messenger" ? "messenger_psid" : "instagram_igsid";
  const { data: existing } = await admin.from("leads")
    .select("id").eq("workspace_id", workspaceId).eq(idColumn, senderId).maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const provider = channel === "messenger" ? "messenger" : "instagram_dm";
  const displayName = channel === "messenger" ? "Facebook Messenger" : "Instagram Direct";
  const sourceId = await ensureChannelSource(admin, workspaceId, provider, displayName);

  let name = channel === "messenger" ? "Contato Messenger" : "Contato Instagram";
  const profile = pageToken ? await fetchSenderProfile(channel, senderId, pageToken) : {};
  if (profile.name) name = profile.name;
  else if (profile.username) name = `@${profile.username}`;

  const externalId = `${channel}:${senderId}`;
  const { data: created, error } = await admin.from("leads").insert({
    workspace_id: workspaceId,
    crm_source_id: sourceId,
    name,
    external_id: externalId,
    source: channel === "messenger" ? "messenger" : "instagram-dm",
    custom_data: {
      channel, psid_or_igsid: senderId, page_id: args.pageId,
      profile_pic: profile.profilePic ?? null, username: profile.username ?? null,
    },
    tags: [{ name: channel === "messenger" ? "messenger" : "instagram-dm" }],
    [idColumn]: senderId,
  } as never).select("id").single();
  if (error) { console.warn("[meta webhook] insert lead:", error.message); return null; }
  return (created as { id: string }).id;
}

// ---------------- tipos ----------------

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string; payload?: { url?: string; sticker_id?: string } }> };
  postback?: { mid?: string; title?: string; payload?: string };
  delivery?: { mids?: string[]; watermark?: number };
  read?: { watermark?: number };
  reaction?: { mid?: string; action?: string; emoji?: string };
};

type Change = {
  field?: string;
  value?: Record<string, unknown> & {
    leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; campaign_id?: string; created_time?: number;
    media_id?: string; comment_id?: string; from?: { id?: string; name?: string }; text?: string; permalink?: string;
  };
};
type Entry = { id?: string; time?: number; changes?: Change[]; messaging?: MessagingEvent[] };

// ---------------- handlers específicos por evento ----------------

async function handleMessagingEvent(
  admin: SupaAdmin, encKey: string, channel: "instagram" | "messenger", workspaceId: string,
  ownerPageOrIgId: string, attachedPageId: string | null, msg: MessagingEvent,
) {
  const senderId = msg.sender?.id;
  const recipientId = msg.recipient?.id;
  if (!senderId || !recipientId) return;

  const isOutgoing = senderId === ownerPageOrIgId;
  const threadContactId = isOutgoing ? recipientId : senderId;
  const pageIdForToken = channel === "messenger" ? ownerPageOrIgId : attachedPageId;
  const pageToken = pageIdForToken ? await fetchPageToken(admin, workspaceId, pageIdForToken, encKey) : null;

  if (msg.delivery || msg.read || msg.reaction) {
    if (msg.delivery?.mids?.length) {
      for (const mid of msg.delivery.mids) {
        await admin.from("channel_messages").update({ status: "delivered" })
          .eq("workspace_id", workspaceId).eq("channel", channel).eq("external_message_id", mid);
      }
    }
    if (msg.read?.watermark) {
      await admin.from("channel_messages").update({ status: "read" })
        .eq("workspace_id", workspaceId).eq("channel", channel).eq("thread_id", threadContactId)
        .eq("direction", "out")
        .lte("received_at", new Date(msg.read.watermark).toISOString());
    }
    return;
  }

  const leadId = await ensureLead(admin, {
    workspaceId, channel, senderId: threadContactId,
    pageId: attachedPageId ?? (channel === "messenger" ? ownerPageOrIgId : null), pageToken,
  });

  const text = msg.message?.text ?? msg.postback?.title ?? null;
  const attachments = msg.message?.attachments ?? [];
  const mid = msg.message?.mid ?? msg.postback?.mid ?? null;

  const row = {
    workspace_id: workspaceId, lead_id: leadId, channel, page_id: ownerPageOrIgId, thread_id: threadContactId,
    external_message_id: mid, direction: isOutgoing ? "out" : "in", text, attachments: attachments as never,
    status: isOutgoing ? "sent" : "received", raw: msg as never,
    received_at: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
    sent_at: isOutgoing && msg.timestamp ? new Date(msg.timestamp).toISOString() : null,
  } as never;

  if (mid) await admin.from("channel_messages").upsert(row, { onConflict: "workspace_id,channel,external_message_id" });
  else await admin.from("channel_messages").insert(row);

  if (leadId && !isOutgoing) {
    const firstAttachment = Array.isArray(attachments) && attachments.length ? attachments[0] as { type?: string; payload?: { url?: string } } : null;
    let alreadyLogged = false;
    if (mid) {
      const { data: existing } = await admin.from("lead_activities")
        .select("id").eq("workspace_id", workspaceId).eq("lead_id", leadId).eq("type", "message_in")
        .contains("payload", { external_message_id: mid }).limit(1).maybeSingle();
      alreadyLogged = !!existing;
    }
    if (!alreadyLogged) {
      const nowIso = msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString();
      await admin.from("lead_activities").insert({
        workspace_id: workspaceId, lead_id: leadId, type: "message_in", occurred_at: nowIso,
        payload: {
          text, channel, external_message_id: mid,
          media_url: firstAttachment?.payload?.url ?? null, media_type: firstAttachment?.type ?? null,
          thread_id: threadContactId, page_id: ownerPageOrIgId,
        } as never,
      });
    }
  }

  if (leadId) {
    await admin.from("leads").update({
      last_message_from: isOutgoing ? "us" : "them", updated_at: new Date().toISOString(),
    }).eq("id", leadId).eq("workspace_id", workspaceId);
  }

  // Dispara salesbots com gatilhos de conversa / social-dm
  if (leadId && !isOutgoing) {
    try {
      const { dispatchInboundMessage } = await import("@/lib/salesbot-runtime.server");
      await dispatchInboundMessage(admin as unknown as never, {
        workspaceId,
        leadId,
        text: text ?? "",
        canal: channel, // "messenger" | "instagram"
        canalId: ownerPageOrIgId,
        mediaType: null,
        isFirstMessage: false,
      });
    } catch (err) {
      console.error("[meta webhook] dispatchInboundMessage:", err);
    }
  }
}

async function handleLeadgen(admin: SupaAdmin, encKey: string, workspaceId: string, v: Change["value"]) {
  if (!v) return;
  await admin.from("meta_lead_events").upsert({
    workspace_id: workspaceId,
    page_id: v.page_id ?? null, form_id: v.form_id ?? null,
    leadgen_id: v.leadgen_id ?? null, ad_id: v.ad_id ?? null, campaign_id: v.campaign_id ?? null,
    payload: JSON.parse(JSON.stringify(v)),
  }, { onConflict: "leadgen_id" });

  if (!v.leadgen_id || !v.page_id || !encKey) return;
  const { data: pageToken } = await admin.rpc("get_meta_page_token", {
    _workspace_id: workspaceId, _page_id: v.page_id, _key: encKey,
  });
  if (!pageToken) return;

  const url = new URL(`https://graph.facebook.com/${META_GRAPH}/${v.leadgen_id}`);
  url.searchParams.set("access_token", String(pageToken));
  url.searchParams.set("fields", "field_data,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id");
  const r = await fetch(url.toString());
  if (!r.ok) return;
  const lead = await r.json() as {
    field_data?: Array<{ name: string; values: string[] }>;
    ad_id?: string; ad_name?: string; campaign_id?: string; campaign_name?: string;
    adset_id?: string; adset_name?: string; form_id?: string; created_time?: string;
  };

  const fields = new Map<string, string>();
  for (const f of lead.field_data ?? []) fields.set(f.name.toLowerCase(), (f.values ?? [])[0] ?? "");
  const g = (...keys: string[]) => { for (const k of keys) { const val = fields.get(k); if (val) return val; } return null; };
  const name = g("full_name", "full name", "name", "nome", "nome_completo", "first_name") ?? "Lead Meta Ads";
  const email = g("email", "e-mail");
  const phone = g("phone_number", "phone", "telefone", "whatsapp", "celular");

  let { data: leadAdsSrc } = await admin.from("crm_sources")
    .select("id").eq("workspace_id", workspaceId).eq("provider", "meta_ads").maybeSingle();
  if (!leadAdsSrc) {
    const created = await admin.from("crm_sources").insert({
      workspace_id: workspaceId, provider: "meta_ads", display_name: "Meta Lead Ads", is_default: false,
    }).select("id").single();
    leadAdsSrc = created.data;
  }
  const finalSourceId = (leadAdsSrc as { id: string }).id;
  const externalId = `meta_leadgen:${v.leadgen_id}`;

  const { data: existing } = await admin.from("leads")
    .select("id").eq("workspace_id", workspaceId).eq("external_id", externalId).maybeSingle();

  const customData = {
    ad_id: lead.ad_id ?? v.ad_id ?? null, ad_name: lead.ad_name ?? null,
    adset_id: lead.adset_id ?? null, adset_name: lead.adset_name ?? null,
    campaign_id: lead.campaign_id ?? v.campaign_id ?? null, campaign_name: lead.campaign_name ?? null,
    form_id: lead.form_id ?? v.form_id ?? null, page_id: v.page_id, leadgen_id: v.leadgen_id,
    created_time: lead.created_time ?? null, fields: Object.fromEntries(fields),
  };

  let leadRowId: string | null = null;
  if (!existing) {
    const { data: created } = await admin.from("leads").insert({
      workspace_id: workspaceId, crm_source_id: finalSourceId,
      name, email, phone, external_id: externalId, source: "meta-lead-ads",
      custom_data: JSON.parse(JSON.stringify(customData)),
      tags: [{ name: "meta-lead-ads" }, ...(lead.campaign_name ? [{ name: lead.campaign_name }] : [])],
      external_updated_at: new Date().toISOString(),
    } as never).select("id").single();
    leadRowId = (created as { id: string } | null)?.id ?? null;
  } else {
    await admin.from("leads").update({
      name, email, phone,
      custom_data: JSON.parse(JSON.stringify(customData)),
      external_updated_at: new Date().toISOString(),
    }).eq("id", (existing as { id: string }).id);
    leadRowId = (existing as { id: string }).id;
  }

  // Dispara gatilho "Novo lead vindo de anúncio"
  if (leadRowId && !existing) {
    try {
      const { dispatchMetaLeadAd } = await import("@/lib/salesbot-runtime.server");
      await dispatchMetaLeadAd(admin as any, {
        workspaceId,
        leadId: leadRowId,
        campaignId: (lead.campaign_id ?? v.campaign_id) ?? null,
        adId: (lead.ad_id ?? v.ad_id) ?? null,
      });
    } catch (err) {
      console.error("[meta leadgen] dispatchMetaLeadAd:", err);
    }
  }

  // Se existe um formulário do CRM vinculado a este Instant Form da Meta,
  // registra a resposta e dispara o gatilho "Formulário enviado".
  const metaFormId = lead.form_id ?? v.form_id ?? null;
  if (leadRowId && metaFormId) {
    try {
      const { data: crmForm } = await admin
        .from("crm_forms")
        .select("id, workspace_id, nome, campos, auto_criar_lead")
        .eq("workspace_id", workspaceId)
        .eq("meta_form_id", String(metaFormId))
        .maybeSingle();
      if (crmForm) {
        const { ingestFormSubmission, mapValuesToFields } = await import("@/lib/forms-ingest.server");
        const f = crmForm as unknown as {
          id: string; workspace_id: string; nome: string; campos: any[]; auto_criar_lead?: boolean | null;
        };
        await ingestFormSubmission(admin as never, {
          form: f as never,
          values: mapValuesToFields(f.campos ?? [], Object.fromEntries(fields)),
          leadId: leadRowId,
          source: "meta",
        });
      }
    } catch (err) {
      console.error("[meta leadgen] ingestFormSubmission:", err);
    }
  }
}


async function handleFeedOrComment(admin: SupaAdmin, workspaceId: string, source: "facebook_feed" | "facebook_comment" | "instagram_comment" | "instagram_mention" | "facebook_mention", v: Change["value"]) {
  if (!v) return;
  const fromId = v.from?.id ?? null;
  const fromName = v.from?.name ?? null;
  if (!fromId) return;

  const provider =
    source === "facebook_comment" ? "facebook_comment" :
    source === "instagram_comment" ? "instagram_comment" :
    source === "facebook_mention" ? "facebook_mention" :
    source === "instagram_mention" ? "instagram_mention" :
    "facebook_comment";
  const label =
    provider === "facebook_comment" ? "Facebook Comments" :
    provider === "instagram_comment" ? "Instagram Comments" :
    provider === "facebook_mention" ? "Facebook Menções" :
    "Instagram Menções";
  const sourceId = await ensureChannelSource(admin, workspaceId, provider, label);

  const externalId = `${source}:${fromId}`;
  const { data: existing } = await admin.from("leads")
    .select("id").eq("workspace_id", workspaceId).eq("external_id", externalId).maybeSingle();

  let leadId: string;
  if (existing) {
    leadId = (existing as { id: string }).id;
  } else {
    const { data: created, error } = await admin.from("leads").insert({
      workspace_id: workspaceId, crm_source_id: sourceId,
      name: fromName ?? "Interação Meta", external_id: externalId, source,
      custom_data: { source, from_id: fromId }, tags: [{ name: source }],
    } as never).select("id").single();
    if (error || !created) { console.warn("[meta feed/comment] insert lead:", error?.message); return; }
    leadId = (created as { id: string }).id;
  }

  await admin.from("lead_activities").insert({
    workspace_id: workspaceId, lead_id: leadId,
    type: source.includes("comment") ? "comment" : source.includes("mention") ? "mention" : "feed_event",
    occurred_at: new Date().toISOString(),
    payload: JSON.parse(JSON.stringify(v)) as never,
  });

  // Dispara salesbots com gatilhos de comentário / menção
  if (source === "facebook_feed") return; // feed puro: sem gatilho por enquanto
  const network: "facebook" | "instagram" = source.startsWith("facebook") ? "facebook" : "instagram";
  const kind: "comentario" | "mencao" = source.includes("mention") ? "mencao" : "comentario";
  try {
    const { dispatchSocialInteraction } = await import("@/lib/salesbot-runtime.server");
    await dispatchSocialInteraction(admin as unknown as never, {
      workspaceId,
      leadId,
      network,
      kind,
      text: (v.text as string | undefined) ?? null,
      commentId: (v.comment_id as string | undefined) ?? null,
      mediaId: (v.media_id as string | undefined) ?? null,
      pageId: (v.page_id as string | undefined) ?? null,
      fromId,
      fromName,
      permalink: (v.permalink as string | undefined) ?? null,
    });
  } catch (err) {
    console.error("[meta webhook] dispatchSocialInteraction:", err);
  }
}

// ---------------- route ----------------

// ---------------- WhatsApp Cloud API ----------------

type WaValue = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: Array<{
    from?: string; id?: string; timestamp?: string; type?: string;
    text?: { body?: string };
    button?: { text?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
    image?: { id?: string; mime_type?: string };
    audio?: { id?: string; mime_type?: string };
    video?: { id?: string; mime_type?: string };
    document?: { id?: string; filename?: string };
  }>;
  statuses?: Array<{ id?: string; status?: string; recipient_id?: string }>;
};

async function resolveWabaWorkspace(admin: SupaAdmin, wabaId: string) {
  const { data } = await admin
    .from("integrations")
    .select("workspace_id,metadata")
    .eq("provider", "whatsapp_cloud")
    .eq("status", "connected");
  const row = (data ?? []).find((r) => {
    const m = (r as { metadata?: { waba_id?: string } }).metadata;
    return m?.waba_id === wabaId;
  }) as { workspace_id?: string } | undefined;
  return row?.workspace_id ?? null;
}

async function ensureWhatsappLead(
  admin: SupaAdmin, workspaceId: string, waId: string, profileName: string | null,
): Promise<string | null> {
  const externalId = `whatsapp_cloud:${waId}`;
  const { data: existing } = await admin.from("leads")
    .select("id").eq("workspace_id", workspaceId).eq("external_id", externalId).maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const sourceId = await ensureChannelSource(
    admin, workspaceId, "whatsapp_cloud" as never, "WhatsApp Cloud API",
  );
  const { data: created, error } = await admin.from("leads").insert({
    workspace_id: workspaceId,
    crm_source_id: sourceId,
    name: profileName || `+${waId}`,
    phone: `+${waId}`,
    external_id: externalId,
    source: "whatsapp-cloud",
    custom_data: { channel: "whatsapp_cloud", wa_id: waId },
    tags: [{ name: "whatsapp" }],
  } as never).select("id").single();
  if (error) { console.warn("[wa cloud webhook] insert lead:", error.message); return null; }
  return (created as { id: string }).id;
}

async function handleWhatsappValue(admin: SupaAdmin, workspaceId: string, v: WaValue) {
  const phoneNumberId = v.metadata?.phone_number_id ?? null;

  for (const st of v.statuses ?? []) {
    if (!st.id || !st.status) continue;
    const { data: trackedMessage } = await admin.from("channel_messages")
      .select("lead_id")
      .eq("workspace_id", workspaceId).eq("channel", "whatsapp_cloud")
      .eq("external_message_id", st.id).maybeSingle();
    await admin.from("channel_messages").update({ status: st.status })
      .eq("workspace_id", workspaceId).eq("channel", "whatsapp_cloud")
      .eq("external_message_id", st.id);
    const trackedLeadId = (trackedMessage as { lead_id?: string | null } | null)?.lead_id;
    if (trackedLeadId && (st.status === "read" || st.status === "played")) {
      try {
        const { resumeRunsOnMediaEvent } = await import("@/lib/salesbot-runtime.server");
        await resumeRunsOnMediaEvent(admin as unknown as never, {
          workspaceId, leadId: trackedLeadId, messageId: st.id, status: st.status,
        });
      } catch (err) {
        console.error("[wa cloud webhook] resumeRunsOnMediaEvent:", err);
      }
    }
  }

  for (const m of v.messages ?? []) {
    const waId = m.from;
    if (!waId) continue;
    const profileName = v.contacts?.find((c) => c.wa_id === waId)?.profile?.name ?? null;
    const leadId = await ensureWhatsappLead(admin, workspaceId, waId, profileName);

    const text =
      m.text?.body
      ?? m.button?.text
      ?? m.interactive?.button_reply?.title
      ?? m.interactive?.list_reply?.title
      ?? null;
    const mediaType = m.image ? "imagem" : m.audio ? "audio" : m.video ? "video" : m.document ? "documento" : null;
    const receivedAt = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString();

    const row = {
      workspace_id: workspaceId, lead_id: leadId, channel: "whatsapp_cloud",
      page_id: phoneNumberId, thread_id: waId, external_message_id: m.id ?? null,
      direction: "in", text, attachments: [] as never, status: "received",
      raw: m as never, received_at: receivedAt,
    } as never;
    if (m.id) await admin.from("channel_messages").upsert(row, { onConflict: "workspace_id,channel,external_message_id" });
    else await admin.from("channel_messages").insert(row);

    if (leadId) {
      await admin.from("lead_activities").insert({
        workspace_id: workspaceId, lead_id: leadId, type: "message_in", occurred_at: receivedAt,
        payload: { text, channel: "whatsapp_cloud", external_message_id: m.id ?? null, media_type: mediaType, thread_id: waId } as never,
      });
      await admin.from("leads").update({ last_message_from: "them", updated_at: new Date().toISOString() })
        .eq("id", leadId).eq("workspace_id", workspaceId);

      try {
        const { dispatchInboundMessage } = await import("@/lib/salesbot-runtime.server");
        await dispatchInboundMessage(admin as unknown as never, {
          workspaceId, leadId, text: text ?? "", canal: "whatsapp" as never,
          canalId: phoneNumberId ?? "", mediaType, isFirstMessage: false,
        });
      } catch (err) {
        console.error("[wa cloud webhook] dispatchInboundMessage:", err);
      }
    }
  }
}


export const Route = createFileRoute("/api/public/webhooks/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
        if (mode === "subscribe" && token && expected && token === expected) {
          return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const bodyText = await request.text();
        const sigHeader = request.headers.get("x-hub-signature-256");
        const signatureValid = verifyMetaHmac(bodyText, sigHeader);

        // Rejeita qualquer POST sem assinatura válida (App Review + segurança)
        if (!signatureValid) {
          await persistWebhookEvent({
            provider: "meta", eventType: "invalid_signature",
            payload: { raw_preview: bodyText.slice(0, 500), header: sigHeader ?? null },
            signatureValid: false, processingError: "assinatura HMAC inválida ou ausente",
          });
          console.error("[meta webhook] assinatura HMAC inválida, rejeitado");
          return new Response("invalid signature", { status: 401 });
        }

        let payload: unknown;
        try { payload = JSON.parse(bodyText); } catch {
          await persistWebhookEvent({
            provider: "meta", eventType: "bad_json",
            payload: { raw_preview: bodyText.slice(0, 500) },
            signatureValid: true, processingError: "JSON inválido",
          });
          return new Response("bad json", { status: 400 });
        }

        const encKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
        const admin = adminClient();

        const evt = payload as { object?: string; entry?: Entry[] };
        const object = evt.object ?? "unknown";

        for (const entry of evt.entry ?? []) {
          const ownerId = entry.id ?? "";
          // resolve workspace uma vez por entry (best-effort)
          let workspaceId: string | null = null;
          let attachedPageId: string | null = null;
          if (object === "page") {
            workspaceId = await resolveMessengerWorkspace(admin, ownerId);
            attachedPageId = ownerId;
          } else if (object === "instagram") {
            const res = await resolveInstagramWorkspace(admin, ownerId);
            workspaceId = res?.workspaceId ?? null;
            attachedPageId = res?.pageId ?? null;
          } else if (object === "whatsapp_business_account") {
            workspaceId = await resolveWabaWorkspace(admin, ownerId);
          }

          // 0) WhatsApp Cloud API
          if (object === "whatsapp_business_account") {
            for (const change of entry.changes ?? []) {
              const field = change.field ?? "unknown";
              let procErr: string | null = null;
              if (field === "messages" && workspaceId) {
                try {
                  await handleWhatsappValue(admin, workspaceId, change.value as WaValue);
                } catch (e) {
                  procErr = e instanceof Error ? e.message : String(e);
                  console.error("[wa cloud webhook]", procErr);
                }
              } else if (!workspaceId) {
                procErr = "workspace não resolvido pela WABA";
              }
              await persistWebhookEvent({
                provider: "meta", eventType: `whatsapp.${field}`,
                workspaceId, payload: { object, entry_id: ownerId, change },
                signatureValid: true, processingError: procErr, processedAt: new Date(),
              });
            }
            continue;
          }



          // 1) messaging: Messenger + IG DM
          if (Array.isArray(entry.messaging) && entry.messaging.length) {
            const channel: "messenger" | "instagram" = object === "instagram" ? "instagram" : "messenger";
            for (const msg of entry.messaging) {
              const eventType =
                msg.delivery ? `${channel}.delivery` :
                msg.read ? `${channel}.read` :
                msg.reaction ? `${channel}.reaction` :
                msg.postback ? `${channel}.postback` :
                `${channel}.message`;
              const mid = msg.message?.mid ?? msg.postback?.mid ?? null;
              let procErr: string | null = null;
              if (workspaceId) {
                try {
                  await handleMessagingEvent(admin, encKey, channel, workspaceId, ownerId, attachedPageId, msg);
                } catch (e) {
                  procErr = e instanceof Error ? e.message : String(e);
                  console.error("[meta webhook] msg:", procErr);
                }
              } else {
                procErr = "workspace não resolvido";
              }
              await persistWebhookEvent({
                provider: "meta", eventType, eventId: mid ? `msg:${mid}` : null,
                workspaceId, payload: { object, entry_id: ownerId, event: msg },
                signatureValid: true, processingError: procErr, processedAt: new Date(),
              });
            }
            continue;
          }

          // 2) changes: leadgen, feed, comments, mention, permissions, story_insights, etc
          for (const change of entry.changes ?? []) {
            const field = change.field ?? "unknown";
            const v = change.value ?? {};
            const eventType = `${object}.${field}`;
            let procErr: string | null = null;
            let extId: string | null = null;

            try {
              if (object === "page" && field === "leadgen") {
                extId = v.leadgen_id ? `leadgen:${v.leadgen_id}` : null;
                if (workspaceId) await handleLeadgen(admin, encKey, workspaceId, v);
                else if (v.page_id) {
                  const { data: pg } = await admin.from("meta_pages").select("workspace_id").eq("page_id", v.page_id).maybeSingle();
                  if (pg?.workspace_id) await handleLeadgen(admin, encKey, pg.workspace_id, v);
                }
              } else if (object === "page" && (field === "feed" || field === "mention")) {
                if (workspaceId) {
                  await handleFeedOrComment(admin, workspaceId, field === "mention" ? "facebook_mention" : "facebook_feed" as never, v);
                }
              } else if (object === "instagram" && (field === "comments" || field === "mentions")) {
                if (workspaceId) {
                  await handleFeedOrComment(admin, workspaceId, field === "mentions" ? "instagram_mention" : "instagram_comment", v);
                }
              } else if (object === "instagram" && field === "story_insights") {
                // grava métrica agregada se tiver media_id
                if (workspaceId && v.media_id) {
                  await admin.from("social_post_metrics").upsert({
                    workspace_id: workspaceId,
                    external_id: String(v.media_id),
                    provider: "instagram",
                    raw: JSON.parse(JSON.stringify(v)) as never,
                    collected_at: new Date().toISOString(),
                  } as never, { onConflict: "workspace_id,provider,external_id" }).then(() => {}, (err: unknown) => { procErr = err instanceof Error ? err.message : "erro social_post_metrics"; });
                }
              } else if (object === "permissions") {
                // usuário revogou permissões, marca reconnect se lista vazia
                const perms = (v as { permissions?: unknown[] }).permissions;
                if (Array.isArray(perms) && perms.length === 0 && workspaceId) {
                  await admin.rpc("mark_integration_needs_reconnect", {
                    _workspace_id: workspaceId, _provider: "meta",
                    _error: "permissions webhook: todas as permissões revogadas",
                  });
                }
              }
              // Qualquer outro field cai só na persistência do webhook_events, nada quebra
            } catch (e) {
              procErr = e instanceof Error ? e.message : String(e);
              console.error(`[meta webhook] ${eventType}:`, procErr);
            }

            await persistWebhookEvent({
              provider: "meta", eventType, eventId: extId,
              workspaceId, payload: { object, entry_id: ownerId, change },
              signatureValid: true, processingError: procErr, processedAt: new Date(),
            });
          }

          // Entry sem messaging nem changes, persiste bruto
          if (!(entry.messaging?.length) && !(entry.changes?.length)) {
            await persistWebhookEvent({
              provider: "meta", eventType: `${object}.raw`,
              workspaceId, payload: { object, entry }, signatureValid: true, processedAt: new Date(),
            });
          }
        }

        // Meta espera 200 sempre que o payload foi aceito
        return new Response("ok", { status: 200 });
      },
    },
  },
});
