import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Tracking bloco 2 — identidade, CRM e conversões", () => {
  it("mantém uma identidade anônima única por workspace e recupera corrida de insert", () => {
    const identity = source("./tracking-identity.server.ts");
    const migration = source("../../supabase/migrations/20260811143000_tracking_identity_uniqueness.sql");

    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS tracking_identities_workspace_anon_uidx");
    expect(migration).toContain("ON public.tracking_identities (workspace_id, anon_id)");
    expect(identity).toContain('String((identityInsertError as { code?: string } | null)?.code) === "23505"');
    expect(identity).toContain("Tracking identity race recovery failed");
  });

  it("usa compare-and-set para impedir dois leads persistentes no mesmo anon_id", () => {
    const identity = source("./tracking-identity.server.ts");

    expect(identity).toContain('.is("lead_id", null)');
    expect(identity).toContain("Tracking identity claim failed");
    expect(identity).toContain("Tracking duplicate lead cleanup failed");
    expect(identity).toContain("Tracking identity winner lookup failed");
  });

  it("não aceita falhas silenciosas na atualização da identidade e no backfill", () => {
    const identity = source("./tracking-identity.server.ts");

    expect(identity).toContain("Tracking identity update failed");
    expect(identity).toContain("Tracking event backfill failed");
    expect(identity).toContain("tracking_crm_created_dispatched: false");
    expect(identity).toContain("tracking_crm_created_dispatched: true");
  });

  it("atualiza UTM do CRM somente quando o valor realmente mudou", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain('.select("utm_source, utm_medium, utm_campaign")');
    expect(dispatcher).toContain("current[fieldName] !== nextValue");
    expect(dispatcher).toContain("const changedFields = Object.keys(patch)");
    expect(dispatcher).toContain("Tracking CRM attribution update failed");
    expect(dispatcher).toContain("Tracking CRM timeline insert failed");
  });

  it("mantém retry idempotente por módulo antes de repetir efeitos colaterais", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain('.eq("event_row_id", input.eventRowId)');
    expect(dispatcher).toContain('.eq("status", "ok")');
    expect(dispatcher).toContain("Tracking dispatch idempotency lookup failed");
    expect(dispatcher).toContain("if (await alreadyCompleted(admin, input, module)) return true");
  });

  it("liga Tracking a SalesBots e a objetivos reais de Agentes IA", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");
    const runtime = source("./salesbot-runtime.server.ts");

    expect(dispatcher).toContain("dispatchTrackingEvent");
    expect(runtime).toContain('g.kind !== "tracking-conversao"');
    expect(runtime).toContain('g.kind !== "tracking-visita-quente"');
    expect(runtime).toContain("export async function tickAiAgentTracking");
    expect(runtime).toContain('.from("tracking_events")');
    expect(runtime).toContain('.eq("workspace_id", lead.workspace_id)');
    expect(runtime).toContain('.eq("lead_id", lead.id)');
    expect(runtime).toContain('.eq("site_id", tracking.siteId)');
  });

  it("registra todas as definições de conversão compatíveis sem escolher só a primeira", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain("const matches = rows.filter");
    expect(dispatcher).toContain("for (const match of matches)");
    expect(dispatcher).not.toContain("const match = rows.find");
    expect(dispatcher).toContain('.from("tracking_conversion_events")');
  });

  it("usa uma referência estável por definição para deduplicar conversões", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain("const stableEventRef = input.eventId");
    expect(dispatcher).toContain("row:${input.eventRowId}");
    expect(dispatcher).toContain("Conversão sem event_id/event_row_id estável para deduplicação");
    expect(dispatcher).toContain("const dedupe = `${match.id}:${stableEventRef}`");
    expect(dispatcher).toContain('String(error.code) === "23505"');
    expect(dispatcher).not.toContain("Date.now()}`}`");
  });

  it("preserva valor do evento, fallback da definição e moeda normalizada", () => {
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(dispatcher).toContain("value: input.value ?? match.default_value ?? null");
    expect(dispatcher).toContain('(input.currency ?? match.currency ?? "BRL").toUpperCase()');
    expect(dispatcher).toContain("utm_source: input.utm.utm_source");
    expect(dispatcher).toContain("utm_campaign: input.utm.utm_campaign");
    expect(dispatcher).not.toContain("utm_medium: input.utm.utm_medium");
  });

  it("usa ocorrências reais de conversão na visão geral e não o contador legado do RPC", () => {
    const live = source("./tracking-live.functions.ts");

    expect(live).toContain('.from("tracking_conversion_events")');
    expect(live).toContain("conversions: conversionRows.length");
    expect(live).toContain("revenue7d: Number(revenueByCurrency.BRL ?? 0)");
    expect(live).toContain("revenueByCurrency");
    expect(live).not.toContain("conversions: Number(a7.conversions ?? 0)");
    expect(live).not.toContain("revenue7d: Number(a7.revenue ?? 0)");
  });

  it("atribui conversões no ranking de UTMs pela ocorrência real e soma receita apenas em BRL", () => {
    const live = source("./tracking-live.functions.ts");

    expect(live).toContain("const [eventResult, conversionResult] = await Promise.all");
    expect(live).toContain("eventKeyById.set(r.id, key)");
    expect(live).toContain("row.conversions += 1");
    expect(live).toContain('String(conversion.currency ?? "BRL").toUpperCase() === "BRL"');
    expect(live).not.toContain('["purchase","conversion","checkout"].includes(r.event_name)');
  });
});
