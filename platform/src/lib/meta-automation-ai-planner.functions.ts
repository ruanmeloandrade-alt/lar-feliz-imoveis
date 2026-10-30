import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createWorkspaceAiProvider } from "@/lib/ai-agent/workspace-provider.server";
import { buildGestorContext } from "@/lib/ai-agent/gestor-context.server";

const ALLOWED_METRICS = [
  "cpl", "cost_per_purchase", "cost_per_result", "roas", "ctr", "ctr_link", "cpc", "cpm",
  "spend", "frequency", "purchases", "results", "clicks", "link_clicks", "reach", "impressions",
] as const;

const ALLOWED_ACTIONS = [
  "pause_campaign", "activate_campaign", "pause_adset", "activate_adset", "pause_ad", "activate_ad",
  "increase_budget", "decrease_budget", "duplicate_campaign", "duplicate_adset", "duplicate_ad",
  "notify_only", "create_workflow_task", "create_calendar_task",
] as const;

const Condition = z.object({
  metric: z.enum(ALLOWED_METRICS),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq"]),
  value: z.number().finite(),
});

const Action = z.object({
  type: z.enum(ALLOWED_ACTIONS),
  value: z.number().finite().nullable().default(null),
  valueMode: z.enum(["percent", "absolute"]).default("percent"),
  reason: z.string().min(3).max(500),
});

export const AiAutomationPlanSchema = z.object({
  name: z.string().min(2).max(120),
  summary: z.string().min(5).max(1200),
  triggerWindow: z.enum(["last_1d", "last_3d", "last_7d", "last_14d", "last_30d"]),
  conditionLogic: z.enum(["and", "or"]).default("and"),
  conditions: z.array(Condition).min(1).max(5),
  actions: z.array(Action).min(1).max(4),
  cooldownMinutes: z.number().int().min(30).max(10080),
  scanIntervalMinutes: z.number().int().min(15).max(1440),
  safeguards: z.array(z.string().min(3).max(300)).min(1).max(8),
  evidence: z.array(z.string().min(3).max(500)).min(1).max(8),
});

export type AiAutomationPlan = z.infer<typeof AiAutomationPlanSchema>;

const Input = z.object({
  workspaceId: z.string().uuid(),
  briefing: z.string().min(10).max(4000),
  target: z.object({
    scopeType: z.enum(["campaign", "adset", "ad"]),
    scopeId: z.string().min(1).max(120),
    name: z.string().min(1).max(300),
    campaignId: z.string().max(120).nullable().optional(),
    campaignName: z.string().max(300).nullable().optional(),
    adsetId: z.string().max(120).nullable().optional(),
    adsetName: z.string().max(300).nullable().optional(),
  }),
});

async function assertMember(supabase: any, workspaceId: string, userId: string) {
  const { data, error } = await supabase.from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso ao workspace.");
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A IA não devolveu um plano estruturado válido.");
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch { throw new Error("A IA devolveu JSON inválido. Gere o plano novamente."); }
}

function enforceGuardrails(plan: AiAutomationPlan): AiAutomationPlan {
  const actions = plan.actions.map((action) => {
    if ((action.type === "increase_budget" || action.type === "decrease_budget") && action.valueMode === "percent") {
      return { ...action, value: Math.min(Math.max(Math.abs(action.value ?? 0), 1), 20) };
    }
    return action;
  });
  return {
    ...plan,
    actions,
    cooldownMinutes: Math.max(plan.cooldownMinutes, 60),
    scanIntervalMinutes: Math.max(plan.scanIntervalMinutes, 15),
    safeguards: Array.from(new Set([
      "Plano criado como rascunho desativado; revisão humana obrigatória antes da ativação.",
      ...plan.safeguards,
    ])),
  };
}

export const planAutomationWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);

    let gestorContext = "Contexto de mídia indisponível.";
    try { gestorContext = await buildGestorContext(context.supabase, data.workspaceId); }
    catch (error) { gestorContext = `Contexto parcial: ${(error as Error).message}`; }

    const provider = await createWorkspaceAiProvider(context.supabase, data.workspaceId);
    const prompt = `Você é o planejador seguro de Automações Executáveis da Vanessa Simoni.\n\nSua função é SOMENTE propor um plano revisável. Você NÃO executa nenhuma ação e NÃO ativa regra.\nUse apenas métricas e ações permitidas abaixo. Não invente dado, benchmark ou performance que não esteja no contexto.\nPara aumento/redução percentual de orçamento, nunca recomende mais de 20% por execução. Prefira cooldown >= 60 minutos.\nSe o briefing pedir algo arriscado, converta em uma automação conservadora ou notify_only e explique nos safeguards.\n\nALVO REAL SELECIONADO:\n${JSON.stringify(data.target)}\n\nBRIEFING DO USUÁRIO:\n${data.briefing}\n\nCONTEXTO REAL DO GESTOR:\n${gestorContext.slice(0, 14000)}\n\nMÉTRICAS PERMITIDAS: ${ALLOWED_METRICS.join(", ")}\nAÇÕES PERMITIDAS: ${ALLOWED_ACTIONS.join(", ")}\n\nResponda SOMENTE JSON válido neste formato:\n{\n  "name":"...",\n  "summary":"...",\n  "triggerWindow":"last_3d",\n  "conditionLogic":"and",\n  "conditions":[{"metric":"cpl","operator":"gt","value":50}],\n  "actions":[{"type":"pause_campaign","value":null,"valueMode":"percent","reason":"..."}],\n  "cooldownMinutes":720,\n  "scanIntervalMinutes":60,\n  "safeguards":["..."],\n  "evidence":["dado/contexto usado na decisão"]\n}`;

    const result = await generateText({
      model: provider.model(),
      prompt,
      temperature: 0.2,
    });

    const parsed = AiAutomationPlanSchema.parse(parseJsonObject(result.text));
    return { plan: enforceGuardrails(parsed), target: data.target, provider: provider.provider };
  });
