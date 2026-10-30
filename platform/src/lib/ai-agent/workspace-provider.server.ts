// Cria um provider AI SDK usando a chave OpenAI do próprio workspace.
// Regra de isolamento é herdada de resolveWorkspaceAiKey: nunca cai em
// LOVABLE_API_KEY para workspaces de cliente. Cada tenant paga a própria
// chamada.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { resolveWorkspaceAiKey } from "@/lib/workspace-ai-key.server";

export type WorkspaceProvider = {
  model: (id?: string) => ReturnType<ReturnType<typeof createOpenAICompatible>>;
  defaultModel: string;
  provider: "openai" | "gemini";
};

export async function createWorkspaceAiProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
  options?: { requireWorkspaceOpenAI?: boolean },
): Promise<WorkspaceProvider> {
  const key = await resolveWorkspaceAiKey(supabase, workspaceId);

  const isOpenai = key.provider === "openai";
  const isGemini = key.provider === "gemini";
  const provider = createOpenAICompatible({
    name: isOpenai ? "openai-ws" : "gemini-ws",
    baseURL: key.baseUrl,
    apiKey: key.apiKey,
  });
  return {
    model: (id?: string) => provider(id ?? key.defaultModel),
    defaultModel: key.defaultModel,
    provider: key.provider,
  };
}
