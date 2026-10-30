// Rota de teste ao vivo dos Agentes IA (1-a-1 e grupo).
// Não persiste nada, só serve para o operador conversar com o agente
// dentro do próprio painel de configuração e ver como ele responde.
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { verifyBearer, assertWorkspaceMember } from "@/lib/ai-agent/auth-bearer.server";
import { createWorkspaceAiProvider } from "@/lib/ai-agent/workspace-provider.server";
import { describePromptAgentActions, type PromptAgentActionRule } from "@/lib/agent-action-rules";
import { describeConversationFacts, evaluateTrigger } from "@/lib/agent-trigger-eval";
import {promptReadinessError} from "@/lib/slim-prompt-only.core";

type ObjectiveNode = {
  id: string;
  say?: string;
  expected?: string;
  mode?: "strict" | "free";
  questions?: string[];
  children?: ObjectiveNode[];
};

type AgentSource = {
  brainSourceId?: string;
  kind?: string;
  type?: string;
  title?: string;
  label?: string;
  content?: string;
  url?: string;
  storagePath?: string;
  fileName?: string;
  mime?: string;
};

type ProductRef = {
  catalogName?: string;
  productName?: string;
  price?: number;
  description?: string;
};

type TestConfig = {
  scope: "1a1" | "grupo";
  mode: "prompt" | "objetivos";
  model?: string;
  name?: string;
  persona?: string;
  systemPrompt?: string;
  language?: string;
  actions?: PromptAgentActionRule[];
  tree?: {
    root: ObjectiveNode;
    context?: string;
    sources?: AgentSource[];
    products?: ProductRef[];
  } | null;
  sources?: AgentSource[];
};

function renderTree(node: ObjectiveNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  const modeTag = node.mode === "strict" ? " [ESTRITO]" : "";
  lines.push(`${pad}- Objetivo ID=${node.id}${modeTag}: ${node.say?.trim() || "(sem descrição)"}`);
  if (node.expected?.trim()) lines.push(`${pad}  Sucesso quando: ${node.expected.trim()}`);
  if (node.mode === "strict" && (node.questions?.length ?? 0) > 0) {
    lines.push(`${pad}  Perguntas obrigatórias (nesta ordem):`);
    node.questions!.forEach((question, index) => {
      if (question.trim()) lines.push(`${pad}    ${index + 1}. ${question.trim()}`);
    });
  }
  for (const child of node.children ?? []) lines.push(renderTree(child, depth + 1));
  return lines.join("\n");
}

async function resolveSources(workspaceId: string, sources?: AgentSource[] | null): Promise<string> {
  if (!sources?.length) return "";
  const { buildWorkspaceAgentKnowledgeBlock } = await import("@/lib/agent-brain-sources.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return buildWorkspaceAgentKnowledgeBlock(supabaseAdmin as never, workspaceId, sources);
}

async function buildSystem(
  config: TestConfig,
  workspaceId: string,
  chat: { lastUserMessage: string; history: Array<{ role: "user" | "assistant"; content: string }> },
): Promise<string> {
  const parts: string[] = [];
  parts.push(`Você é ${config.name || "um agente de conversação"}${config.persona ? `, ${config.persona}` : ""}.`);
  parts.push(
    config.scope === "grupo"
      ? "Você atua em um GRUPO de WhatsApp com várias pessoas. Responda como moderador amigável, sem tags de sistema, sem prefixo tipo 'IA:'."
      : "Você atua em uma conversa 1-a-1 no WhatsApp. Responda naturalmente, como uma pessoa da equipe.",
  );
  parts.push(`Idioma: ${config.language || "pt-BR"}. Estilo: mensagens curtas, tom de WhatsApp, sem listas com marcadores a não ser que faça sentido.`);

  if (config.mode === "prompt" && config.systemPrompt?.trim()) {
    parts.push("\n=== INSTRUÇÕES DO AGENTE ===\n" + config.systemPrompt.trim());
  }

  const actions = config.actions ?? [];
  if (actions.length) {
    const triggerContext = {
      message: chat.lastUserMessage,
      messageFormat: "texto" as const,
      history: chat.history,
      minutesSinceCustomerMessage: 0,
      now: new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })),
    };
    const verdicts: Record<string, { status: "ativo" | "inativo" | "ia"; detail: string }> = {};
    for (const action of actions) if (action?.id) verdicts[action.id] = evaluateTrigger(action.when, triggerContext);
    parts.push("\n" + describeConversationFacts(triggerContext));
    parts.push("\n" + describePromptAgentActions(actions, verdicts));
  }

  if (config.mode === "objetivos" && config.tree?.root) {
    if (config.tree.context?.trim()) {
      parts.push("\n=== CONTEXTO GERAL (RAIZ DO BOT) ===\n" + config.tree.context.trim());
    }
    parts.push(
      "\n=== FLUXO DE OBJETIVOS ===\nSiga a árvore abaixo. Comece pelo objetivo principal e avance somente quando o critério de sucesso do objetivo atual for satisfeito. Objetivos [ESTRITO] exigem as perguntas na ordem. Se o lead sair do fluxo, recupere o foco naturalmente. IMPORTANTE PARA O TESTER: ao FINAL de cada resposta, acrescente exatamente um marcador interno no formato [[MKTON_OBJECTIVE:<ID>]], usando o ID do objetivo em que você ficará após responder. Quando o fluxo tiver terminado, use [[MKTON_OBJECTIVE:END]]. Nunca explique esse marcador ao cliente e nunca use outro ID.",
    );
    parts.push(renderTree(config.tree.root));

    const treeKnowledge = await resolveSources(config.tree.sources);
    if (treeKnowledge) parts.push("\n" + treeKnowledge.replace("FONTES DE CONHECIMENTO", "FONTES DO FLUXO"));

    const products = config.tree.products ?? [];
    if (products.length) {
      parts.push("\n=== PRODUTOS DISPONÍVEIS PARA OFERECER ===");
      for (const product of products) {
        const price = typeof product.price === "number" ? `, R$ ${product.price.toFixed(2)}` : "";
        parts.push(
          `- ${product.productName || "(catálogo inteiro)"}${product.catalogName ? ` [${product.catalogName}]` : ""}${price}${product.description ? ` :: ${product.description.slice(0, 200)}` : ""}`,
        );
      }
    }
  }

  const knowledge = await resolveSources(workspaceId, [...(config.sources ?? []), ...(config.tree?.sources ?? [])]);
  if (knowledge) parts.push("\n" + knowledge);

  parts.push(
    "\n=== MODO DE TESTE ===\nEsta é uma simulação para o operador testar o agente. NÃO cite que é um teste ou uma IA; responda como responderia no WhatsApp real.",
  );
  return parts.join("\n");
}

export const Route = createFileRoute("/api/agent-test-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let auth;
        try {
          auth = await verifyBearer(request);
        } catch (error) {
          return new Response((error as Error).message, { status: 401 });
        }

        const body = (await request.json().catch(() => null)) as
          | { workspaceId?: string; config?: TestConfig; messages?: unknown }
          | null;
        if (!body?.workspaceId || !body?.config || !Array.isArray(body.messages)) {
          return new Response("workspaceId, config e messages são obrigatórios.", { status: 400 });
        }

        try {
          await assertWorkspaceMember(auth.supabase, body.workspaceId, auth.userId);
        } catch (error) {
          return new Response((error as Error).message, { status: 403 });
        }

        // Individual-agent test uses the same prompt-only contract as the live loader.
        // Group-agent configuration is a separate legacy module and is not changed here.
        if(body.config.scope==='1a1'){
          if(body.config.mode!=='prompt')return new Response('O fluxo de objetivos foi retirado. Reabra o editor e use o prompt.',{status:409});
          const invalid=promptReadinessError(body.config.systemPrompt);
          if(invalid)return new Response(invalid,{status:400});
          body.config={...body.config,mode:'prompt',tree:null};
        }
        // Group simulation has the same prompt-only boundary; no archived tree reaches buildSystem.
        if(body.config.scope!=='1a1'&&body.config.scope!=='grupo')return new Response('Escopo de teste inválido.',{status:400});
        if(body.config.scope==='grupo'){
          if(body.config.mode!=='prompt')return new Response('Use o prompt do agente de grupo. O fluxo de objetivos foi retirado.',{status:409});
          const invalid=promptReadinessError(body.config.systemPrompt);if(invalid)return new Response(invalid,{status:400});
          body.config={...body.config,mode:'prompt',tree:null};
        }
        let provider;
        try {
          provider = await createWorkspaceAiProvider(auth.supabase, body.workspaceId);
        } catch (error) {
          return new Response(`IA não configurada: ${(error as Error).message}`, {
            status: 400,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        const uiMessages = body.messages as UIMessage[];
        const textOf = (message: UIMessage) =>
          (message.parts ?? []).map((part) => ("text" in part ? String(part.text ?? "") : "")).join(" ").trim();
        const lastUserIndex = uiMessages.map((message) => message.role).lastIndexOf("user");
        const system = await buildSystem(body.config, body.workspaceId, {
          lastUserMessage: lastUserIndex >= 0 ? textOf(uiMessages[lastUserIndex]) : "",
          history: uiMessages.slice(0, Math.max(0, lastUserIndex)).map((message) => ({
            role: message.role === "assistant" ? "assistant" as const : "user" as const,
            content: textOf(message),
          })),
        });
        const modelId = body.config.model?.startsWith("openai/")
          ? body.config.model.replace(/^openai\//, "")
          : undefined;

        const result = streamText({
          model: provider.model(modelId),
          system,
          messages: await convertToModelMessages(uiMessages),
        });
        return result.toUIMessageStreamResponse({ originalMessages: uiMessages });
      },
    },
  },
});

// SLIM_PROMPT_ONLY_V1

// SLIM_GROUP_PROMPT_V1
