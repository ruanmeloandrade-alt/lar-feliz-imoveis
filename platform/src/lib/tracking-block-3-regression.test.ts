import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Tracking bloco 3 — Meta CAPI", () => {
  it("aplica entitlement canônico meta_events no sender server-side", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain('import { effectiveEntitledModules } from "@/lib/billing/entitlements"');
    expect(dispatcher).toContain("Meta CAPI entitlement lookup failed");
    expect(dispatcher).toContain('entitledModules.includes("meta_events")');
  });

  it("propaga falhas de pixel, segredo e lead em vez de mascarar envio", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain("Meta CAPI pixel lookup failed");
    expect(dispatcher).toContain("Meta CAPI secret lookup failed");
    expect(dispatcher).toContain("Meta CAPI lead lookup failed");
    expect(dispatcher).toContain('.eq("workspace_id", input.workspaceId)');
  });

  it("preserva fbc/fbp sem hash e aplica SHA-256 à PII", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain("user_data.fbc = l.fb_fbc");
    expect(dispatcher).toContain("user_data.fbp = l.fb_fbp");
    expect(dispatcher).toContain("await sha256Hex(l.email.trim().toLowerCase())");
    expect(dispatcher).toContain('const normalizedPhone = l.phone.replace(/\\D/g, "")');
    expect(dispatcher).toContain("await sha256Hex(normalizedPhone)");
    expect(dispatcher).toContain("await sha256Hex(externalId)");
  });

  it("reutiliza contexto Browser/CAPI e exige event_id estável", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain("fb_event_id, fb_external_id, fb_client_ip, fb_client_ua");
    expect(dispatcher).toContain("user_data.client_ip_address = l.fb_client_ip");
    expect(dispatcher).toContain("user_data.client_user_agent = l.fb_client_ua");
    expect(dispatcher).toContain("input.eventId");
    expect(dispatcher).toContain("browserEventId");
    expect(dispatcher).toContain("evt:${input.eventRowId}");
    expect(dispatcher).toContain("Meta CAPI sem event_id/event_row_id estável para deduplicação");
    expect(dispatcher).not.toContain("input.eventRowId ?? Date.now()");
    expect(dispatcher).toContain("event_id: stableEventId");
  });

  it("mantém o envio CAPI centralizado no dispatcher de Tracking", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain("https://graph.facebook.com/v23.0/${pixelId}/events");
    expect(dispatcher).toContain('step(admin, input, "meta", () => toMeta(admin, input))');
  });
});

describe("Tracking bloco 3 — Google Ads e WhatsApp", () => {
  it("captura gclid e sinais de contato no pixel e persiste gclid no coletor", () => {
    const pixel = source("../routes/api/public/track/px[.]js.ts");
    const collect = source("../routes/api/public/track/collect.ts");

    expect(pixel).toContain('var gclid = qs("gclid") || cookie("_mkton_gclid")');
    expect(pixel).toContain('setCookie("_mkton_gclid",  gclid, 30)');
    expect(pixel).toContain('window.dataLayer.push({ event: "mkton_lead", mkton_event: name })');
    expect(pixel).toContain('new CustomEvent("mkton:lead"');
    expect(pixel).toContain('send("whatsapp_click"');
    expect(pixel).toContain('send("phone_click"');
    expect(collect).toContain('gclid: str(body.gclid, 200)');
  });

  it("não chama gclid de integração Google Ads concluída sem confirmação externa", () => {
    const statuses = source("./tracking-sources.functions.ts");

    expect(statuses).toContain('status: "partial"');
    expect(statuses).toContain("Clique Google Ads (gclid) identificado");
    expect(statuses).toContain("confirme no Google Ads se o gtag/GTM recebeu a conversão");
    expect(statuses).not.toContain('status: "ok", detail: "Cliques de anúncio do Google identificados e chegando."');
  });

  it("mantém Google Ads como ponte real de navegador via gtag/GTM", () => {
    const guide = source("../components/tracking/GoogleAdsTrackingGuide.tsx");

    expect(guide).toContain("window.addEventListener('mkton:lead'");
    expect(guide).toContain("gtag('event', 'conversion'");
    expect(guide).toContain('value="mkton_lead"');
  });

  it("mantém ligações WhatsApp ligadas à Evolution, CRM e resposta automática", () => {
    const callsFns = source("./whatsapp-calls.functions.ts");
    const callsServer = source("./whatsapp-calls.server.ts");

    expect(callsFns).toContain('events: ["QRCODE_UPDATED", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE", "CALL"]');
    expect(callsFns).toContain('from("whatsapp_call_events")');
    expect(callsFns).toContain("processCallEvent");
    expect(callsServer).toContain('source: "ligacao-whatsapp"');
    expect(callsServer).toContain('type: "ligacao_whatsapp"');
    expect(callsServer).toContain("sendEvolutionMessage");
  });
});

describe("Tracking bloco 3 — Social Media e Workflow", () => {
  it("roteia Workflow pelo pipeline padrão do workspace, sem convenção de nome", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain('const BUSINESS = ["purchase", "checkout", "begin_checkout", "form_submit", "cadastro", "lead"]');
    expect(dispatcher).toContain('.from("workflow_pipelines")');
    expect(dispatcher).toContain('.order("is_default", { ascending: false })');
    expect(dispatcher).toContain('.order("position", { ascending: true })');
    expect(dispatcher).toContain("Tracking workflow pipeline lookup failed");
    expect(dispatcher).not.toContain('.ilike("name", "%tracking%")');
  });

  it("seleciona etapa ativa deterministicamente e propaga falhas do Workflow", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain('.from("workflow_stages")');
    expect(dispatcher).toContain('.eq("is_done_stage", false)');
    expect(dispatcher).toContain('.eq("is_incomplete_stage", false)');
    expect(dispatcher).toContain("Tracking workflow stage lookup failed");
    expect(dispatcher).toContain("Tracking workflow position lookup failed");
    expect(dispatcher).toContain("Tracking workflow task insert failed");
    expect(dispatcher).toContain('tags: ["tracking", input.eventName.toLowerCase()]');
  });

  it("persiste atribuição Social real e deduplicada em vez de apenas registrar sucesso", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain('.from("social_post_attributions")');
    expect(dispatcher).toContain('dedupe_key: `${postId}:${stableEventRef}`');
    expect(dispatcher).toContain("Tracking social post lookup failed");
    expect(dispatcher).toContain("Tracking social attribution insert failed");
    expect(dispatcher).toContain("Tracking Social sem event_id/event_row_id estável para deduplicação");
    expect(dispatcher).toContain("atribuição persistida para o post");
    expect(dispatcher).not.toContain("evento atribuído ao post ${postId}");
  });

  it("versiona schema isolado por workspace para atribuição de posts", () => {
    const migration = source("../../supabase/migrations/20260811170500_tracking_social_attribution.sql");

    expect(migration).toContain("create table if not exists public.social_post_attributions");
    expect(migration).toContain("post_id uuid not null references public.social_posts(id)");
    expect(migration).toContain("unique (workspace_id, dedupe_key)");
    expect(migration).toContain("alter table public.social_post_attributions enable row level security");
  });
});
