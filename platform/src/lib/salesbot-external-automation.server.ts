import { normalizeOptions, type ExternalProvider } from "./external-automations-events";
import { executeSalesbotWebhook, type SalesbotWebhookResult } from "./salesbot-webhook.server";

type AnySb = { from: (table: string) => any };

export interface ExecuteConnectedAutomationArgs {
  supabaseAdmin: AnySb;
  workspaceId: string;
  automationId: string;
  provider?: ExternalProvider;
  event?: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ConnectedAutomationExecution extends SalesbotWebhookResult {
  automationId: string;
  provider: ExternalProvider;
}

/**
 * Executa uma conexão Make/n8n/Zapier/Webhook já cadastrada no workspace.
 * Secrets e headers permanecem exclusivamente no backend.
 */
export async function executeConnectedSalesbotAutomation(
  args: ExecuteConnectedAutomationArgs,
): Promise<ConnectedAutomationExecution> {
  const { data: row, error: loadError } = await args.supabaseAdmin
    .from("external_automations")
    .select("id, provider, outbound_url, inbound_secret, metadata, status")
    .eq("id", args.automationId)
    .eq("workspace_id", args.workspaceId)
    .eq("status", "connected")
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!row) throw new Error("Integração externa não encontrada neste workspace ou está desconectada.");

  const provider = row.provider as ExternalProvider;
  if (args.provider && provider !== args.provider) {
    throw new Error("A integração selecionada não corresponde ao provedor configurado no bloco.");
  }
  if (!row.outbound_url) throw new Error("A integração selecionada não possui URL de saída configurada.");

  const options = normalizeOptions(
    ((row.metadata as Record<string, unknown> | null) ?? {}).options,
    provider,
  );

  const headers: Record<string, string> = {
    "X-MktOn-Event": args.event?.trim() || "salesbot.external_action",
    "X-MktOn-Workspace": args.workspaceId,
  };
  if (options.authHeaderName.trim() && options.authHeaderValue.trim()) {
    headers[options.authHeaderName.trim()] = options.authHeaderValue.trim();
  }
  for (const header of options.extraHeaders) {
    if (header.key.trim() && header.value.trim()) headers[header.key.trim()] = header.value.trim();
  }

  let result: SalesbotWebhookResult;
  try {
    result = await executeSalesbotWebhook({
      url: row.outbound_url as string,
      method: "POST",
      secret: options.signOutbound ? (row.inbound_secret as string) : null,
      headers,
      body: args.payload,
      timeoutMs: args.timeoutMs ?? 15_000,
      retries: options.retries,
    });
  } catch (caught) {
    result = {
      ok: false,
      status: null,
      responseText: "",
      responseJson: null,
      error: caught instanceof Error ? caught.message : String(caught),
      attempts: 0,
    };
  }

  await args.supabaseAdmin.from("external_automation_logs").insert({
    workspace_id: args.workspaceId,
    automation_id: row.id,
    provider,
    direction: "outbound",
    event: args.event?.trim() || "salesbot.external_action",
    payload: args.payload,
    response: result.responseJson ?? (result.responseText ? { body: result.responseText } : null),
    http_status: result.status,
    status: result.ok ? "ok" : "failed",
    error: result.error,
  });

  if (result.ok) {
    await args.supabaseAdmin
      .from("external_automations")
      .update({ last_success_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id)
      .eq("workspace_id", args.workspaceId);
  } else {
    await args.supabaseAdmin
      .from("external_automations")
      .update({ last_error: result.error ?? (result.status ? `HTTP ${result.status}` : "Falha na execução") })
      .eq("id", row.id)
      .eq("workspace_id", args.workspaceId);
  }

  return {
    ...result,
    automationId: row.id as string,
    provider,
  };
}
