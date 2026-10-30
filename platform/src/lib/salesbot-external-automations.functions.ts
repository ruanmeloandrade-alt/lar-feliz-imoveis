import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROVIDER_META, type ExternalProvider } from "./external-automations-events";

type AnySb = { from: (table: string) => any };

export interface SalesbotExternalAutomationOption {
  id: string;
  provider: ExternalProvider;
  label: string;
  outboundUrl: string;
  lastSuccessAt: string | null;
  lastError: string | null;
}

/**
 * Lista apenas conexões externas que o Salesbot pode executar.
 * Não devolve secrets, tokens nem headers de autenticação para o navegador.
 */
export const listSalesbotExternalAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { data: profile } = await sb
      .from("profiles")
      .select("current_workspace_id")
      .eq("id", context.userId)
      .maybeSingle();

    const workspaceId = (profile as { current_workspace_id?: string } | null)?.current_workspace_id;
    if (!workspaceId) throw new Error("Workspace ativo não encontrado.");

    const { data: rows, error } = await sb
      .from("external_automations")
      .select("id, provider, outbound_url, last_success_at, last_error")
      .eq("workspace_id", workspaceId)
      .eq("status", "connected");

    if (error) throw new Error(error.message);

    return ((rows ?? []) as Array<{
      id: string;
      provider: ExternalProvider;
      outbound_url: string | null;
      last_success_at: string | null;
      last_error: string | null;
    }>)
      .filter((row) => Boolean(row.outbound_url))
      .map((row) => ({
        id: row.id,
        provider: row.provider,
        label: PROVIDER_META[row.provider]?.label ?? row.provider,
        outboundUrl: row.outbound_url as string,
        lastSuccessAt: row.last_success_at,
        lastError: row.last_error,
      } satisfies SalesbotExternalAutomationOption));
  });
