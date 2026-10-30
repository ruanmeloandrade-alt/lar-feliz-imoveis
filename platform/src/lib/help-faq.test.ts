import { describe, expect, it } from "vitest";
import { HELP_FAQ_CATEGORIES, HELP_FAQS, filterHelpFaqs } from "./help-faq";

describe("MktOn help FAQ contract", () => {
  it("covers all planned categories", () => {
    expect(HELP_FAQ_CATEGORIES).toEqual(
      expect.arrayContaining([
        "Primeiros passos",
        "Conta e equipe",
        "Planos e faturamento",
        "CRM",
        "Inbox",
        "Automações e IA",
        "Produtividade",
        "Tracking e dados",
        "Marketing",
        "Integrações",
        "Segurança",
        "Suporte",
      ]),
    );
  });

  it("keeps a substantial FAQ instead of the old short list", () => {
    expect(HELP_FAQS.length).toBeGreaterThanOrEqual(35);
  });

  it("does not claim WhatsApp always uses QR code", () => {
    const whatsapp = HELP_FAQS.find((faq) => faq.question.includes("QR Code"));
    expect(whatsapp?.answer).toContain("Não");
    expect(whatsapp?.answer).toContain("WhatsApp Cloud");
  });

  it("documents SalesBot, AI and external automation separately", () => {
    const serialized = JSON.stringify(HELP_FAQS);
    expect(serialized).toContain("SalesBot");
    expect(serialized).toContain("Agente de IA");
    expect(serialized).toContain("Make");
    expect(serialized).toContain("n8n");
    expect(serialized).toContain("Zapier");
    expect(serialized).toContain("Webhook");
  });

  it("documents the core commercial and marketing modules", () => {
    const serialized = JSON.stringify(HELP_FAQS);
    for (const term of ["CRM", "Inbox", "Tracking", "Gestor de Tráfego", "Social Media", "Fluxo de Trabalho"]) {
      expect(serialized).toContain(term);
    }
  });

  it("searches question, answer, category and keywords", () => {
    expect(filterHelpFaqs("onboarding").length).toBeGreaterThan(0);
    expect(filterHelpFaqs("whatsapp cloud").length).toBeGreaterThan(0);
    expect(filterHelpFaqs("tracking", "Tracking e dados").length).toBeGreaterThan(0);
    expect(filterHelpFaqs("tracking", "CRM")).toHaveLength(0);
  });

  it("does not present fake revenue metrics", () => {
    const serialized = JSON.stringify(HELP_FAQS);
    expect(serialized).not.toMatch(/R\$\s?\d/);
    expect(serialized).not.toContain("clientes ativos");
  });
});
