import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { verifyBearer } from "@/lib/ai-agent/auth-bearer.server";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { resolveWorkspaceAiKey } from "@/lib/workspace-ai-key.server";

export const Route = createFileRoute("/api/dashboard-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          messages?: unknown;
          kpiContext?: unknown;
        };
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }
        let key;
        try {
          const ctx=await verifyBearer(request);
          const workspaceId=await requireActiveWorkspace(ctx.supabase,ctx.userId,{createIfMissing:false});
          key=await resolveWorkspaceAiKey(ctx.supabase,workspaceId);
        } catch { return new Response("Entre na conta e configure a IA em Integrações.",{status:403}); }

        const kpiContext =
          typeof body.kpiContext === "string" && body.kpiContext.trim().length > 0
            ? body.kpiContext.slice(0, 8000)
            : "Nenhum dado de KPI disponível no momento.";

        const system = `Você é um analista de dados dentro do painel MKTOn. Ajuda o usuário a entender as KPIs, métricas e o que está acontecendo com os dados do dashboard dele.

REGRAS:
- Responda em português do Brasil, tom próximo e claro.
- Seja BEM CURTO: 1 a 4 linhas por resposta. Nunca textão.
- Se o usuário perguntar "o que é essa KPI", explique o significado do indicador de forma simples e prática.
- Quando fizer sentido, use os dados abaixo para responder com números reais. Se o dado não estiver no contexto, diga que não vê aquela métrica no painel dele agora.
- Não invente números. Não invente KPIs que não existem.
- Sem listas longas com marcadores. Sem emojis.

DADOS ATUAIS DO DASHBOARD DO USUÁRIO:
${kpiContext}`;

        const gateway = createOpenAICompatible({name:key.provider,baseURL:key.baseUrl,apiKey:key.apiKey});
        const result = streamText({
          model: gateway(key.defaultModel),
          system,
          messages: await convertToModelMessages(body.messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
        });
      },
    },
  },
});
