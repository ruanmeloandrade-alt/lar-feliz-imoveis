import { integrationVaultFailure } from "./integration-vault";

// Vanessa Simoni is independent: only credentials belonging to this workspace
// may be used. Never borrow an original MKTOn/Lovable account's API key.
type AnySb = {
  from: (table: string) => any;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};

// Only direct providers connected to this workspace are accepted.
export type WorkspaceAiKey =
  | { provider: "openai"; apiKey: string; baseUrl: "https://api.openai.com/v1"; defaultModel: string }
  | { provider: "gemini"; apiKey: string; baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai"; defaultModel: string };

async function readWorkspaceKey(
  sb: AnySb,
  workspaceId: string,
  provider: "openai" | "gemini",
  encryptionKey: string,
): Promise<string | null> {
  let response: Awaited<ReturnType<AnySb["rpc"]>>;
  try {
    response = await sb.rpc("get_integration_secret", {
      _workspace_id: workspaceId,
      _provider: provider,
      _key: encryptionKey,
    });
  } catch (error) {
    throw integrationVaultFailure(`get_integration_secret:${provider}`, error);
  }
  if (response.error) {
    throw integrationVaultFailure(`get_integration_secret:${provider}`, response.error);
  }
  // Only a successful null result means no integration is configured.
  if (response.data === null || response.data === undefined) return null;
  const payload = response.data as { api_key?: unknown };
  const key = typeof payload.api_key === "string" ? payload.api_key.trim() : "";
  if (!key) {
    throw new Error(`A credencial ${provider === "openai" ? "OpenAI" : "Gemini"} salva está incompleta. Reconecte essa integração na Vanessa Simoni.`);
  }
  return key;
}

export async function resolveWorkspaceAiKey(sb: AnySb, workspaceId: string): Promise<WorkspaceAiKey> {
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encryptionKey?.trim()) throw integrationVaultFailure("encryption-key-missing");

  const openaiKey = await readWorkspaceKey(sb, workspaceId, "openai", encryptionKey);
  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4o-mini",
    };
  }

  const geminiKey = await readWorkspaceKey(sb, workspaceId, "gemini", encryptionKey);
  if (geminiKey) {
    return {
      provider: "gemini",
      apiKey: geminiKey,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-2.5-flash",
    };
  }

  throw new Error(
    "IA não conectada neste workspace. Vá em Integrações e conecte OpenAI ou Gemini deste workspace para habilitar os agentes IA. Cada workspace usa a própria chave, a Vanessa Simoni não empresta chave de outra conta.",
  );
}
