import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const chat = readFileSync(resolve(process.cwd(), "src/components/ai-agent/AiAgentChat.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/routes/api/ai-agent/chat.ts"), "utf8");
const strategy = readFileSync(resolve(process.cwd(), "src/components/meta/MetaStrategyManager.tsx"), "utf8");

describe("Gestor strategy real context", () => {
  it("sends the current strategy editor state to the strategist", () => {
    expect(chat).toContain("contextPayload?: Record<string, unknown>");
    expect(chat).toContain("messages, contextPayload");
    expect(strategy).toContain("contextPayload={{");
    expect(strategy).toContain("automationRules: form.automationRules");
  });

  it("grounds strategist in paid media and CRM data", () => {
    expect(api).toContain("buildGestorContext(ctx.supabase, workspaceId)");
    expect(api).toContain("buildCrmContext(ctx.supabase, workspaceId)");
    expect(api).toContain("Dados reais atuais de mídia paga");
    expect(api).toContain("Contexto do formulário de estratégia aberto agora");
    expect(api).toContain("Não invente benchmark, meta ou resultado");
  });
});
