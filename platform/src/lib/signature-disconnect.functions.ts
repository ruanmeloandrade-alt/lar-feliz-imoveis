import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Schema = z.object({ provider: z.enum(["clicksign", "zapsign", "docusign"]) });
type AnySb = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> };

function encKey() {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return key;
}

async function activeWorkspace(sb: AnySb, userId: string) {
  const { data, error } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  const workspaceId = data?.current_workspace_id as string | undefined;
  if (!workspaceId) throw new Error("Workspace ativo não encontrado.");
  return workspaceId;
}

export const disconnectSignatureIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => Schema.parse(value))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);

    if (data.provider === "zapsign") {
      const { data: row } = await sb.from("integrations").select("metadata").eq("workspace_id", workspaceId).eq("provider", "zapsign").maybeSingle();
      try {
        const zapsign = await import("@/lib/zapsign.server");
        const secret = await zapsign.readZapSignSecret(sb, workspaceId);
        const webhookId = row?.metadata?.webhook_id as string | undefined;
        if (webhookId) {
          await fetch("https://api.zapsign.com.br/api/v1/user/company/webhook/delete/", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${secret.api_token.replace(/^Bearer\s+/i, "")}`, "Content-Type": "application/json" },
            body: JSON.stringify({ id: webhookId }),
          });
        }
      } catch { /* desconexão local não depende da disponibilidade do provedor */ }
    }

    const { error } = await sb.rpc("set_integration_secret", {
      _workspace_id: workspaceId,
      _provider: data.provider,
      _plaintext: {},
      _key: encKey(),
      _metadata: {},
      _status: "disconnected",
    });
    if (error) throw new Error(error.message || "Falha ao desconectar integração.");
    return { ok: true };
  });
