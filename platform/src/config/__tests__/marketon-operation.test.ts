import { describe, expect, it } from "vitest";
import {
  MKTON_AUTOMATION_RULES,
  MKTON_DEFERRED_SCOPE,
  MKTON_EXISTING_FUNNELS_OUT_OF_SCOPE,
  MKTON_FUNNELS,
  MKTON_REQUIRED_TAG_PREFIXES,
  MKTON_TRACKING_FIELDS,
} from "../marketon-operation";

describe("Mkton operating blueprint", () => {
  it("reuses the existing CRM funnels instead of inventing replacements", () => {
    expect(MKTON_FUNNELS.map((f) => f.name)).toEqual([
      "Leads de Entrada",
      "Cadastro",
      "Pós-venda",
      "Reativação",
      "Rede Social",
      "Afiliado",
    ]);
    expect(MKTON_EXISTING_FUNNELS_OUT_OF_SCOPE).toEqual([
      "Grupo",
      "Prospecção",
      "Software RB Media",
    ]);
  });

  it("keeps Grupo, Prospecção and Software RB Media untouched in this block", () => {
    expect(MKTON_DEFERRED_SCOPE.groups).toMatch(/já existe/i);
    expect(MKTON_DEFERRED_SCOPE.rbMedia).toMatch(/já existe/i);
    for (const name of MKTON_EXISTING_FUNNELS_OUT_OF_SCOPE) {
      expect(MKTON_FUNNELS.some((f) => f.name === name)).toBe(false);
    }
  });

  it("keeps unique internal keys and stage keys", () => {
    const funnelKeys = MKTON_FUNNELS.map((f) => f.key);
    expect(new Set(funnelKeys).size).toBe(funnelKeys.length);
    for (const funnel of MKTON_FUNNELS) {
      expect(funnel.stages.length).toBeGreaterThan(0);
      const stageKeys = funnel.stages.map((s) => s.key);
      expect(new Set(stageKeys).size).toBe(stageKeys.length);
    }
  });

  it("preserves the agreed timing rules", () => {
    expect(MKTON_AUTOMATION_RULES.noResponseToFollowMinutes).toBe(40);
    expect(MKTON_AUTOMATION_RULES.freeTrialDays).toBe(20);
    expect(MKTON_AUTOMATION_RULES.activationWindowDays).toBe(7);
    expect(MKTON_AUTOMATION_RULES.conversionStartsDay).toBe(15);
    expect(MKTON_AUTOMATION_RULES.postTrialOfferWindowDays).toBe(15);
    expect(MKTON_AUTOMATION_RULES.onboardingIntensiveDays).toBe(3);
    expect(MKTON_AUTOMATION_RULES.renewalLeadDays).toBe(15);
    expect(MKTON_AUTOMATION_RULES.reactivationMaxMonths).toBe(18);
    expect(MKTON_AUTOMATION_RULES.followMaxMessages).toBe(10);
  });

  it("requires the tracking fields and tag namespaces needed by the journey", () => {
    expect(MKTON_TRACKING_FIELDS).toEqual(
      expect.arrayContaining([
        "origem_canal",
        "origem_plataforma",
        "utm_source",
        "utm_campaign",
        "utm_content",
        "youtube_video",
        "origem_conversao",
        "link_tracking_cadastro",
        "nicho",
        "status_trial",
        "status_assinatura",
        "status_renovacao",
        "origem_reativacao",
      ]),
    );
    expect(MKTON_REQUIRED_TAG_PREFIXES).toEqual(
      expect.arrayContaining([
        "origem:",
        "canal:",
        "nicho:",
        "jornada:",
        "trial:",
        "cliente:",
        "reativacao:",
      ]),
    );
  });

  it("keeps Afiliado free of conversion bots", () => {
    const affiliate = MKTON_FUNNELS.find((f) => f.name === "Afiliado");
    expect(affiliate).toBeDefined();
    expect(affiliate!.stages.every((s) => s.botMode === "task-only")).toBe(true);
  });
});
