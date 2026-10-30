import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executeSalesbotWebhook } from "@/lib/salesbot-webhook.server";

/**
 * Teste manual do bloco "Enviar webhook" do Salesbot.
 * Usa o mesmo executor que o runtime para evitar divergência entre teste e produção.
 */
export const testSalesbotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        url: z.string().trim().min(1).max(2000),
        method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
        secret: z.string().trim().max(500).optional(),
        timeoutMs: z.number().int().min(1000).max(30000).default(15000),
        retries: z.number().int().min(0).max(3).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const result = await executeSalesbotWebhook({
        url: data.url,
        method: data.method,
        secret: data.secret,
        body: {
          teste: true,
          lead_id: "00000000-0000-0000-0000-000000000000",
          workspace_id: "00000000-0000-0000-0000-000000000000",
          salesbot_id: "teste",
          run_id: "teste",
          block_id: "teste",
          variables: { nome: "Lead de teste", last_message: "Mensagem de exemplo" },
        },
        timeoutMs: data.timeoutMs,
        retries: data.retries,
      });

      const status = result.status ?? 0;
      const response = result.responseText.slice(0, 300);
      return {
        ok: result.ok,
        status,
        message: result.ok
          ? `HTTP ${status} — resposta: ${response || "(vazia)"}`
          : status > 0
            ? `HTTP ${status} — ${response || result.error || "sem corpo de resposta"}`
            : `Falha na conexão: ${result.error || "erro desconhecido"}`,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : "Falha ao validar webhook.",
      };
    }
  });
