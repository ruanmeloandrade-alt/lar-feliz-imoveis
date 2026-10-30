import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { directWhatsappPhoneFromJid } from "@/lib/inbox-lead-actions.functions";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("regressões do Inbox", () => {
  it("não apresenta conversation_read como mensagem", () => {
    const enhancements = read("components/inbox/InboxLeadRouteEnhancements.tsx");
    expect(enhancements).toContain('activity?.type !== "conversation_read"');
    expect(enhancements).toContain('["inbox", "activities", leadId]');
  });

  it("mantém SalesBot e Agente IA ligados às ações reais de um lead", () => {
    const enhancements = read("components/inbox/InboxLeadRouteEnhancements.tsx");
    expect(enhancements).toContain("startSalesbotForLead");
    expect(enhancements).toContain("activateConversationAgentForLead");
    expect(enhancements).toContain("Enviar SalesBot");
    expect(enhancements).toContain("Enviar Agente IA");
  });

  it("expõe parada real de SalesBot e Agente IA na própria conversa", () => {
    const enhancements = read("components/inbox/InboxLeadRouteEnhancements.tsx");
    const actions = read("lib/inbox-lead-actions.functions.ts");
    expect(enhancements).toContain("Parar SalesBot");
    expect(enhancements).toContain("Parar Agente IA");
    expect(enhancements).toContain("getLeadAutomationControlState");
    expect(actions).toContain("stopLeadSalesbots");
    expect(actions).toContain("stopLeadConversationAgent");
    expect(actions).toContain('status: "finished"');
    expect(actions).toContain("pauseLeadAiAgentInternal");
  });

  it("resolve número direto de WhatsApp a partir do JID da Evolution", () => {
    expect(directWhatsappPhoneFromJid("5511999999999@s.whatsapp.net")).toBe("5511999999999");
    expect(directWhatsappPhoneFromJid("5511999999999:12@s.whatsapp.net")).toBe("5511999999999");
    expect(directWhatsappPhoneFromJid("120363012345678@g.us")).toBeNull();
    expect(directWhatsappPhoneFromJid("123456789@lid")).toBeNull();
  });

  it("deixa o link curto de formulário fora do AuthGate", () => {
    const root = read("routes/__root.tsx");
    expect(root).toContain('path.startsWith("/l/")');
  });

  it("mantém o Copiloto estreito e centralizado na lateral direita", () => {
    const robot = read("components/SupportRobot.tsx");
    expect(robot).toContain("right-0 top-1/2");
    expect(robot).toContain("-translate-y-1/2");
    expect(robot).toContain("h-12 w-8");
  });
});
