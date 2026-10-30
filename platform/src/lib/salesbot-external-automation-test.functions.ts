import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executeConnectedSalesbotAutomation } from "./salesbot-external-automation.server";

type AnySb = { from: (table: string) => any };

export const testSalesbotExternalAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ automationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { data: profile } = await sb
      .from("profiles")
      .select("current_workspace_id")
      .eq("id", context.userId)
      .maybeSingle();
    const workspaceId = (profile as { current_workspace_id?: string } | null)?.current_workspace_id;
    if (!workspaceId) throw new Error("Workspace ativo não encontrado.");

    const result = await executeConnectedSalesbotAutomation({
      supabaseAdmin: sb,
      workspaceId,
      automationId: data.automationId,
      event: "salesbot.connection_test",
      payload: {
        teste: true,
        lead_id: "00000000-0000-0000-0000-000000000000",
        workspace_id: workspaceId,
        salesbot_id: "teste",
        run_id: "teste",
        block_id: "teste",
        variables: { nome: "Lead de teste", last_message: "Mensagem de exemplo" },
      },
    });

    const response = result.responseJson ?? result.responseText;
    return {
      ok: result.ok,
      status: result.status ?? 0,
      message: result.ok
        ? `HTTP ${result.status ?? 0}${response ? ` — resposta recebida` : ""}`
        : result.error ?? `HTTP ${result.status ?? 0}`,
      response,
    };
  });
