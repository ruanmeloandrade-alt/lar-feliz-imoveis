import { describe, expect, it } from "vitest";
import { effectiveEntitledModules } from "./entitlements";
import { PLAN_ENTITLEMENTS, PLAN_PRESENTATION } from "./plan-catalog";
import { PLAN_PRICES_CENTS, proportionalPlanPriceCents } from "./price-catalog";
import { BYTES_PER_GB, STORAGE_ADDONS, includedStorageBytes } from "./storage-catalog";
import { periodBonusValueCents, periodSavingsCents, type Period, type PlanCode } from "./types";

describe("MKTOn plan matrix", () => {
  it("keeps AI and group automation out of Start", () => {
    expect(PLAN_ENTITLEMENTS.starter).toContain("crm_mkton");
    expect(PLAN_ENTITLEMENTS.starter).toContain("calendario");
    expect(PLAN_ENTITLEMENTS.starter).not.toContain("agentes_ia");
    expect(PLAN_ENTITLEMENTS.starter).not.toContain("automacoes_grupo");
    expect(PLAN_PRESENTATION.starter.name).toBe("Start");
  });

  it("presents Start features at the same commercial level", () => {
    const items = PLAN_PRESENTATION.starter.groups.flatMap((group) => group.items);
    expect(items).toEqual(expect.arrayContaining([
      "Gestor de CRM",
      "Funil",
      "Leads",
      "Inbox",
      "Automações",
      "Sales Bot",
      "Relatórios",
      "Formulários",
      "Empresas",
      "Produtos",
      "Arquivos",
      "Dashboard",
      "Calendário",
      "Suporte via chat",
    ]));
    expect(PLAN_PRESENTATION.starter.groups.some((group) => group.title === "Gestor de CRM")).toBe(false);
    expect(PLAN_PRESENTATION.professional.groups.flatMap((group) => group.items)).toEqual(expect.arrayContaining([
      "Agente IA",
      "Agente IA de grupo",
    ]));
  });

  it("adds workflow, AI and read-only data surfaces from Growth", () => {
    expect(PLAN_ENTITLEMENTS.professional).toEqual(expect.arrayContaining([
      "fluxo_trabalho",
      "notas",
      "agentes_ia",
      "automacoes_grupo",
      "tracking_crm",
      "meta_events",
      "trafego_kpis_read",
      "social_kpis_read",
    ]));
    expect(PLAN_ENTITLEMENTS.professional).not.toContain("tracking");
    expect(PLAN_ENTITLEMENTS.professional).not.toContain("trafego_automacoes");
    expect(PLAN_ENTITLEMENTS.professional).not.toContain("social_calendar");
    expect(PLAN_ENTITLEMENTS.professional).not.toContain("social_media_ia");
    expect(PLAN_PRESENTATION.professional.groups.flatMap((group) => group.items)).toEqual(expect.arrayContaining([
      "Tracking",
      "Envio e recebimento de eventos do Meta Ads (CAPI)",
      "KPIs do Gestor de Tráfego em modo leitura",
      "KPIs do Social Media em modo leitura",
    ]));
    expect(PLAN_PRESENTATION.professional.name).toBe("Growth");
  });

  it("gives full tracking and executable traffic automation from Performance", () => {
    expect(PLAN_ENTITLEMENTS.business).toEqual(expect.arrayContaining([
      "tracking_crm",
      "meta_events",
      "trafego_kpis_read",
      "social_kpis_read",
      "tracking",
      "suporte_prioritario",
      "trafego_automacoes",
      "social_calendar",
    ]));
    expect(PLAN_ENTITLEMENTS.business).not.toContain("trafego_ia");
    expect(PLAN_ENTITLEMENTS.business).not.toContain("social_media_ia");
    expect(PLAN_PRESENTATION.business.name).toBe("Performance");
  });

  it("reserves and values full Traffic AI and Social Media AI for Scale", () => {
    expect(PLAN_ENTITLEMENTS.enterprise).toEqual(expect.arrayContaining([
      "trafego_automacoes",
      "social_calendar",
      "trafego_ia",
      "social_media_ia",
    ]));
    const scaleItems = PLAN_PRESENTATION.enterprise.groups.flatMap((group) => group.items);
    expect(scaleItems).toEqual(expect.arrayContaining([
      "IA para análise de campanhas e oportunidades",
      "Automação inteligente de ações de tráfego",
      "IA para planejamento e criação de conteúdo",
      "Geração assistida de legendas, hashtags e criativos",
    ]));
    expect(PLAN_PRESENTATION.enterprise.name).toBe("Scale");
  });

  it("uses canonical plan entitlements for active subscriptions", () => {
    expect(effectiveEntitledModules({
      status: "active",
      planCode: "business",
      workspaceModules: ["trafego_ia", "social_media_ia"],
    })).toEqual([...PLAN_ENTITLEMENTS.business]);
  });

  it("starts every plan with exactly 5 GB included", () => {
    for (const plan of ["starter", "professional", "business", "enterprise"] as const) {
      expect(PLAN_PRESENTATION[plan].storageGb).toBe(5);
      expect(includedStorageBytes(plan)).toBe(5 * BYTES_PER_GB);
    }
  });

  it("keeps the approved recurring storage add-ons", () => {
    expect(STORAGE_ADDONS).toEqual([
      { code: "storage_10gb", label: "+10 GB", extraGb: 10, monthlyPriceCents: 1900 },
      { code: "storage_25gb", label: "+25 GB", extraGb: 25, monthlyPriceCents: 3900 },
      { code: "storage_50gb", label: "+50 GB", extraGb: 50, monthlyPriceCents: 6900 },
      { code: "storage_100gb", label: "+100 GB", extraGb: 100, monthlyPriceCents: 11900 },
    ]);
  });
});

describe("commercial plan prices", () => {
  const plans: PlanCode[] = ["starter", "professional", "business", "enterprise"];
  const periods: Period[] = ["1m", "3m", "6m", "1y"];

  it("uses the approved final monthly prices", () => {
    expect(PLAN_PRICES_CENTS.starter["1m"]).toBe(19_700);
    expect(PLAN_PRICES_CENTS.professional["1m"]).toBe(39_800);
    expect(PLAN_PRICES_CENTS.business["1m"]).toBe(78_200);
    expect(PLAN_PRICES_CENTS.enterprise["1m"]).toBe(129_300);
  });

  it("preserves the historical price ratio for every billing period", () => {
    for (const plan of plans) {
      for (const period of periods) {
        expect(PLAN_PRICES_CENTS[plan][period]).toBe(proportionalPlanPriceCents(plan, period));
      }
    }
  });
});

describe("period savings", () => {
  it("compares the full usage period against staying monthly", () => {
    expect(periodSavingsCents(10_000, 100_000, "1y")).toBe(40_000);
    expect(periodBonusValueCents(10_000, "1y")).toBe(20_000);
  });

  it("returns zero savings for an equal monthly cycle", () => {
    expect(periodSavingsCents(10_000, 10_000, "1m")).toBe(0);
    expect(periodBonusValueCents(10_000, "1m")).toBe(0);
  });
});
