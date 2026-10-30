import { describe, expect, it } from "vitest";
import {
  ACTIONABLE_TRIGGER_IDS,
  TRIGGER_CATALOG,
  configKindFor,
  normalizeTrigger,
  triggerHasConfigUI,
  triggerIsImplemented,
  webhookPreviewPayload,
} from "@/lib/crm-mock";

/**
 * CRM completion batch 01
 *
 * These tests are intentionally pure: they validate the contracts used by the
 * funnel/automation UI without touching the production database.
 */
describe("CRM core completion — batch 01", () => {
  it("TESTE 01: automações exibidas como executáveis têm contrato de configuração real", () => {
    const executable = TRIGGER_CATALOG.filter((trigger) => triggerIsImplemented(trigger.id));

    expect(executable.length).toBeGreaterThan(0);
    for (const trigger of executable) {
      expect(ACTIONABLE_TRIGGER_IDS.has(trigger.id)).toBe(true);
      expect(triggerHasConfigUI(trigger.id)).toBe(true);
      expect(configKindFor(trigger.id)).not.toBe("none");
    }

    // Webhook inbound possui UI, mas não pode ser vendido como executor pronto.
    expect(triggerHasConfigUI("webhook-entrada")).toBe(true);
    expect(triggerIsImplemented("webhook-entrada")).toBe(false);
    expect(configKindFor("webhook-entrada")).toBe("webhook-inbound");
  });

  it("TESTE 02: gatilhos de entrada/movimentação do funil preservam retrocompatibilidade", () => {
    expect(normalizeTrigger()).toEqual({ kind: "created-or-moved" });
    expect(normalizeTrigger("created-only")).toEqual({ kind: "created-only" });
    expect(normalizeTrigger("moved-only")).toEqual({ kind: "moved-only" });
    expect(normalizeTrigger({ kind: "tag-added", tags: ["quente"] })).toEqual({
      kind: "tag-added",
      tags: ["quente"],
    });
  });

  it("TESTE 03: webhook de automação gera payload rastreável para o CRM", () => {
    const payload = webhookPreviewPayload({
      kind: "webhook",
      preset: "sale-won",
      url: "https://example.test/hook",
      method: "POST",
    });

    expect(payload).toMatchObject({
      event: "sale.won",
      event_id: expect.any(String),
      workspace_id: expect.any(String),
      sent_at: expect.any(String),
      lead: {
        id: expect.any(String),
        name: expect.any(String),
        pipeline: expect.any(String),
        stage_from: expect.any(String),
        stage_to: expect.any(String),
      },
      sale: {
        valor: expect.any(Number),
        vendedor_id: expect.any(String),
        data_fechamento: expect.any(String),
      },
    });
  });
});
