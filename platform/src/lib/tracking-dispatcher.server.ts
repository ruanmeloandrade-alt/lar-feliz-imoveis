/**
 * Dispatcher central do Tracking.
 *
 * Todo evento identificado passa por aqui e é distribuído para os módulos:
 * CRM (timeline/atribuição), SalesBots + Agente IA, Conversões, Meta CAPI,
 * Fluxo de Trabalho e Social. Cada tentativa vira uma linha em
 * `tracking_dispatch_log` — nada de catch vazio.
 */

import { effectiveEntitledModules } from "@/lib/billing/entitlements";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = any;

export interface DispatchInput {
  workspaceId: string;
  eventRowId: number | null;
  eventName: string;
  leadId: string | null;
  siteId: string | null;
  value: number | null;
  currency: string | null;
  pageUrl: string | null;
  pagePath: string | null;
  anonId: string | null;
  sessionId: string | null;
  utm: Record<string, string | null>;
  isFirstVisit: boolean;
  isHotVisit: boolean;
  eventId: string | null;
}

export interface DispatchResult {
  errors: string[];
}

async function log(
  admin: AnySb,
  input: DispatchInput,
  module: string,
  status: "ok" | "skip" | "error",
  detail?: string,
) {
  try {
    await admin.from("tracking_dispatch_log").insert({
      workspace_id: input.workspaceId,
      event_row_id: input.eventRowId,
      event_name: input.eventName,
      module,
      status,
      detail: detail ? String(detail).slice(0, 500) : null,
    });
  } catch (e) {
    console.error("[tracking-dispatch] falha ao gravar log", module, e);
  }
}

/** Um módulo concluído com status ok para o mesmo event_row_id não roda de novo. */
async function alreadyCompleted(admin: AnySb, input: DispatchInput, module: string): Promise<boolean> {
  if (!input.eventRowId) return false;
  const { data, error } = await admin
    .from("tracking_dispatch_log")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("event_row_id", input.eventRowId)
    .eq("module", module)
    .eq("status", "ok")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Tracking dispatch idempotency lookup failed (${module}): ${error.message}`);
  return Boolean(data);
}

async function step(
  admin: AnySb,
  input: DispatchInput,
  module: string,
  fn: () => Promise<string | null>,
): Promise<boolean> {
  try {
    if (await alreadyCompleted(admin, input, module)) return true;
    const detail = await fn();
    if (detail === null) return true;
    await log(admin, input, module, "ok", detail);
    return true;
  } catch (e) {
    await log(admin, input, module, "error", e instanceof Error ? e.message : String(e));
    return false;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** CRM: registra a navegação na timeline do lead e atualiza a atribuição. */
async function toCrm(admin: AnySb, input: DispatchInput): Promise<string | null> {
  if (!input.leadId) return null;
  const relevant = [
    "form_submit", "cadastro", "purchase", "checkout", "begin_checkout",
    "lead", "link_click", "whatsapp_click", "phone_click",
  ];
  const hasUtm = Boolean(input.utm.utm_source || input.utm.utm_medium || input.utm.utm_campaign);
  if (hasUtm) {
    const { data: currentLead, error: currentLeadError } = await admin
      .from("leads")
      .select("utm_source, utm_medium, utm_campaign")
      .eq("id", input.leadId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    if (currentLeadError) throw new Error(`Tracking CRM attribution lookup failed: ${currentLeadError.message}`);
    if (!currentLead) throw new Error("Tracking CRM attribution lead not found");

    const current = currentLead as Record<string, string | null>;
    const desired: Record<string, string | null> = {
      utm_source: input.utm.utm_source,
      utm_medium: input.utm.utm_medium,
      utm_campaign: input.utm.utm_campaign,
    };
    const patch: Record<string, string> = {};
    for (const [fieldName, nextValue] of Object.entries(desired)) {
      if (nextValue && current[fieldName] !== nextValue) patch[fieldName] = nextValue;
    }

    const changedFields = Object.keys(patch);
    if (changedFields.length) {
      const { error: updateError } = await admin
        .from("leads")
        .update(patch)
        .eq("id", input.leadId)
        .eq("workspace_id", input.workspaceId);
      if (updateError) throw new Error(`Tracking CRM attribution update failed: ${updateError.message}`);

      const { dispatchCrmFieldUpdated } = await import("@/lib/crm-event-dispatch.server");
      for (const fieldName of changedFields) {
        await dispatchCrmFieldUpdated(admin as never, {
          workspaceId: input.workspaceId,
          leadId: input.leadId,
          fieldName,
        });
      }
    }
  }

  if (!relevant.includes(input.eventName)) return null;
  const { error: activityError } = await admin.from("lead_activities").insert({
    workspace_id: input.workspaceId,
    lead_id: input.leadId,
    type: "tracking",
    payload: {
      event: input.eventName,
      url: input.pageUrl,
      path: input.pagePath,
      value: input.value,
      ...input.utm,
    },
  });
  if (activityError) throw new Error(`Tracking CRM timeline insert failed: ${activityError.message}`);
  return `timeline: ${input.eventName}`;
}

/** SalesBots e Agentes IA. */
async function toBots(admin: AnySb, input: DispatchInput): Promise<string | null> {
  if (!input.leadId) return null;
  const { dispatchTrackingEvent } = await import("@/lib/salesbot-runtime.server");
  await dispatchTrackingEvent(admin, {
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    eventName: input.eventName,
    siteId: input.siteId,
    value: input.value,
    pageUrl: input.pageUrl,
    pagePath: input.pagePath,
    isFirstVisit: input.isFirstVisit,
    isHotVisit: input.isHotVisit,
  });
  return "gatilhos de tracking avaliados";
}

/** Conversões: transforma todas as definições compatíveis em ocorrências reais e deduplicadas. */
async function toConversions(admin: AnySb, input: DispatchInput): Promise<string | null> {
  const { data: defs, error: defsError } = await admin
    .from("tracking_conversions")
    .select("id, name, event_name, default_value, currency, active")
    .eq("workspace_id", input.workspaceId)
    .eq("active", true);
  if (defsError) throw new Error(`Tracking conversion definitions lookup failed: ${defsError.message}`);

  const rows = (defs ?? []) as Array<{
    id: string;
    name: string;
    event_name: string;
    default_value: number | null;
    currency: string | null;
  }>;
  const matches = rows.filter((d) => d.event_name.toLowerCase() === input.eventName.toLowerCase());
  if (!matches.length) return null;

  const stableEventRef = input.eventId ?? (input.eventRowId != null ? `row:${input.eventRowId}` : null);
  if (!stableEventRef) throw new Error("Conversão sem event_id/event_row_id estável para deduplicação");

  let inserted = 0;
  for (const match of matches) {
    const dedupe = `${match.id}:${stableEventRef}`;
    const { error } = await admin.from("tracking_conversion_events").insert({
      workspace_id: input.workspaceId,
      conversion_id: match.id,
      event_row_id: input.eventRowId,
      lead_id: input.leadId,
      dedupe_key: dedupe,
      value: input.value ?? match.default_value ?? null,
      currency: (input.currency ?? match.currency ?? "BRL").toUpperCase(),
      utm_source: input.utm.utm_source,
      utm_campaign: input.utm.utm_campaign,
    });
    if (error) {
      if (String(error.code) === "23505") continue;
      throw new Error(`Tracking conversion insert failed (${match.name}): ${error.message}`);
    }
    inserted += 1;
  }

  return inserted > 0
    ? `${inserted} conversão(ões) registrada(s): ${matches.map((m) => m.name).join(", ")}`
    : null;
}

/** Meta CAPI: envia automaticamente a conversão para o pixel do workspace. */
async function toMeta(admin: AnySb, input: DispatchInput): Promise<string | null> {
  const MAP: Record<string, string> = {
    purchase: "Purchase",
    checkout: "InitiateCheckout",
    begin_checkout: "InitiateCheckout",
    add_to_cart: "AddToCart",
    view_item: "ViewContent",
    form_submit: "Lead",
    cadastro: "Lead",
    lead: "Lead",
  };
  const metaEvent = MAP[input.eventName.toLowerCase()];
  if (!metaEvent) return null;

  const {data: connectedMeta,error: connectionError}=await admin.from('integrations').select('status').eq('workspace_id',input.workspaceId).in('provider',['meta','meta_capi']).in('status',['connected','conectado','active']).limit(1);
  if(connectionError)throw new Error('Meta connection status unavailable.');
  if(!connectedMeta?.length)return null;
  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("status, trial_ends_at, plan:plans(code)")
    .eq("workspace_id", input.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) throw new Error(`Meta CAPI entitlement lookup failed: ${subscriptionError.message}`);

  const planCode = (subscription?.plan as { code?: string } | null)?.code ?? null;
  const entitledModules = effectiveEntitledModules({
    status: subscription?.status,
    trialEndsAt: subscription?.trial_ends_at,
    planCode,
  });
  if (!entitledModules.includes("meta_events")) return null;

  const { data: pixelRow, error: pixelError } = await admin
    .from("meta_pixels")
    .select("pixel_id")
    .eq("workspace_id", input.workspaceId)
    .limit(1)
    .maybeSingle();
  if (pixelError) throw new Error(`Meta CAPI pixel lookup failed: ${pixelError.message}`);
  const pixelId = (pixelRow as { pixel_id?: string } | null)?.pixel_id;
  if (!pixelId) return null;

  const encKey = process.env["INTEGRATION_ENCRYPTION_KEY"];
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente");
  const { data: secret, error: secretError } = await admin.rpc("get_integration_secret", {
    _workspace_id: input.workspaceId,
    _provider: "meta_capi",
    _key: encKey,
  });
  if (secretError) throw new Error(`Meta CAPI secret lookup failed: ${secretError.message}`);
  const token = (secret as { access_token?: string } | null)?.access_token ?? null;
  if (!token) return null;

  const user_data: Record<string, unknown> = {};
  let browserEventId: string | null = null;
  if (input.leadId) {
    const { data: leadRow, error: leadError } = await admin
      .from("leads")
      .select("email, phone, fb_fbc, fb_fbp, fb_event_id, fb_external_id, fb_client_ip, fb_client_ua")
      .eq("id", input.leadId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    if (leadError) throw new Error(`Meta CAPI lead lookup failed: ${leadError.message}`);
    const l = (leadRow ?? {}) as Record<string, string | null>;
    if (l.email) user_data.em = [await sha256Hex(l.email.trim().toLowerCase())];
    if (l.phone) {
      const normalizedPhone = l.phone.replace(/\D/g, "");
      if (normalizedPhone) user_data.ph = [await sha256Hex(normalizedPhone)];
    }
    if (l.fb_fbc) user_data.fbc = l.fb_fbc;
    if (l.fb_fbp) user_data.fbp = l.fb_fbp;
    if (l.fb_client_ip) user_data.client_ip_address = l.fb_client_ip;
    if (l.fb_client_ua) user_data.client_user_agent = l.fb_client_ua;
    const externalId = l.fb_external_id ?? input.leadId;
    user_data.external_id = [await sha256Hex(externalId)];
    browserEventId = l.fb_event_id ?? null;
  } else if (input.anonId) {
    user_data.external_id = [await sha256Hex(input.anonId)];
  }

  const stableEventId = input.eventId
    ?? browserEventId
    ?? (input.eventRowId != null ? `evt:${input.eventRowId}` : null);
  if (!stableEventId) throw new Error("Meta CAPI sem event_id/event_row_id estável para deduplicação");

  const custom_data: Record<string, unknown> = {};
  if (input.value && input.value > 0) {
    custom_data.value = input.value;
    custom_data.currency = (input.currency ?? "BRL").toUpperCase();
  }

  const r = await fetch(`https://graph.facebook.com/v23.0/${pixelId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        {
          event_name: metaEvent,
          event_time: Math.floor(Date.now() / 1000),
          event_id: stableEventId,
          event_source_url: input.pageUrl ?? undefined,
          action_source: "website",
          user_data,
          custom_data,
        },
      ],
      access_token: token,
    }),
  });
  if (!r.ok) throw new Error(`Meta CAPI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return `${metaEvent} enviado ao pixel ${pixelId}`;
}

/** Fluxo de Trabalho: eventos de negócio entram deterministicamente no pipeline padrão do workspace. */
async function toWorkflow(admin: AnySb, input: DispatchInput): Promise<string | null> {
  const BUSINESS = ["purchase", "checkout", "begin_checkout", "form_submit", "cadastro", "lead"];
  if (!BUSINESS.includes(input.eventName.toLowerCase())) return null;

  const { data: pipeline, error: pipelineError } = await admin
    .from("workflow_pipelines")
    .select("id, name")
    .eq("workspace_id", input.workspaceId)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pipelineError) throw new Error(`Tracking workflow pipeline lookup failed: ${pipelineError.message}`);
  if (!pipeline) return null;

  const pipelineRow = pipeline as { id: string; name: string };
  const { data: stage, error: stageError } = await admin
    .from("workflow_stages")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("pipeline_id", pipelineRow.id)
    .eq("is_done_stage", false)
    .eq("is_incomplete_stage", false)
    .order("position", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (stageError) throw new Error(`Tracking workflow stage lookup failed: ${stageError.message}`);
  if (!stage) return null;

  const stageId = (stage as { id: string }).id;
  const { data: maxTask, error: positionError } = await admin
    .from("workflow_tasks")
    .select("position")
    .eq("workspace_id", input.workspaceId)
    .eq("stage_id", stageId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (positionError) throw new Error(`Tracking workflow position lookup failed: ${positionError.message}`);

  const { error: insertError } = await admin.from("workflow_tasks").insert({
    workspace_id: input.workspaceId,
    pipeline_id: pipelineRow.id,
    stage_id: stageId,
    title: `Tracking: ${input.eventName}`,
    description: `Evento recebido em ${input.pagePath ?? input.pageUrl ?? "site"}.${input.leadId ? `\n\n[Lead: ${input.leadId}]` : ""}`,
    priority: "media",
    tags: ["tracking", input.eventName.toLowerCase()],
    position: Number((maxTask as { position?: number } | null)?.position ?? -1) + 1,
  });
  if (insertError) throw new Error(`Tracking workflow task insert failed: ${insertError.message}`);
  return `tarefa criada em "${pipelineRow.name}"`;
}

/** Social: persiste a atribuição ao post identificado por utm_content/utm_campaign. */
async function toSocial(admin: AnySb, input: DispatchInput): Promise<string | null> {
  const tag = input.utm.utm_content ?? input.utm.utm_campaign;
  if (!tag) return null;
  const m = /post[_-]?([0-9a-f]{8}-[0-9a-f-]{27})/i.exec(tag);
  if (!m) return null;
  const postId = m[1];

  const { data: post, error: postError } = await admin
    .from("social_posts")
    .select("id")
    .eq("id", postId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (postError) throw new Error(`Tracking social post lookup failed: ${postError.message}`);
  if (!post) return null;

  const stableEventRef = input.eventId ?? (input.eventRowId != null ? `row:${input.eventRowId}` : null);
  if (!stableEventRef) throw new Error("Tracking Social sem event_id/event_row_id estável para deduplicação");

  const { error: attributionError } = await admin.from("social_post_attributions").insert({
    workspace_id: input.workspaceId,
    post_id: postId,
    event_row_id: input.eventRowId,
    lead_id: input.leadId,
    event_name: input.eventName,
    dedupe_key: `${postId}:${stableEventRef}`,
    value: input.value,
    currency: input.currency?.toUpperCase() ?? null,
    page_url: input.pageUrl,
    page_path: input.pagePath,
    utm_source: input.utm.utm_source,
    utm_medium: input.utm.utm_medium,
    utm_campaign: input.utm.utm_campaign,
    utm_content: input.utm.utm_content,
  });
  if (attributionError) {
    if (String(attributionError.code) === "23505") return `atribuição do post ${postId} já registrada`;
    throw new Error(`Tracking social attribution insert failed: ${attributionError.message}`);
  }
  return `atribuição persistida para o post ${postId}`;
}

export async function dispatchTracking(admin: AnySb, input: DispatchInput): Promise<DispatchResult> {
  const errors: string[] = [];
  if (!(await step(admin, input, "crm", () => toCrm(admin, input)))) errors.push("crm");
  if (!(await step(admin, input, "conversoes", () => toConversions(admin, input)))) errors.push("conversoes");
  if (!(await step(admin, input, "salesbots", () => toBots(admin, input)))) errors.push("salesbots");
  if (!(await step(admin, input, "meta", () => toMeta(admin, input)))) errors.push("meta");
  if (!(await step(admin, input, "workflow", () => toWorkflow(admin, input)))) errors.push("workflow");
  if (!(await step(admin, input, "social", () => toSocial(admin, input)))) errors.push("social");
  return { errors };
}
