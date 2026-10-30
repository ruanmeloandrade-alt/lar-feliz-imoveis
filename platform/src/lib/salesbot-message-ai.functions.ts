import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveWorkspaceAiKey } from "@/lib/workspace-ai-key.server";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

const improveMessageSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
});

export function extractSalesbotVariables(text: string): string[] {
  return Array.from(new Set(text.match(/\{\{[^{}]+\}\}/g) ?? [])).sort();
}

export function assertSalesbotVariablesPreserved(original: string, improved: string) {
  const expected = extractSalesbotVariables(original);
  const actual = new Set(extractSalesbotVariables(improved));
  const missing = expected.filter((variable) => !actual.has(variable));
  if (missing.length > 0) {
    throw new Error(`A IA removeu variáveis da mensagem: ${missing.join(", ")}. O texto original foi mantido.`);
  }
}

export const improveSalesbotMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => improveMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const workspaceId = await requireActiveWorkspace(supabase, context.userId, { createIfMissing: false });
    const key = await resolveWorkspaceAiKey(supabase, workspaceId);

    const provider = createOpenAICompatible({
      name: key.provider,
      baseURL: key.baseUrl,
      apiKey: key.apiKey,
    });

    const originalVariables = extractSalesbotVariables(data.text);
    const { text } = await generateText({
      model: provider(key.defaultModel),
      system: [
        "Você é um editor de mensagens de automação comercial da MKTOn.",
        "Melhore clareza, naturalidade, persuasão e concisão sem mudar a intenção nem inventar fatos, promessas, preços, prazos ou condições.",
        "Preserve exatamente todas as variáveis no formato {{variavel}} e mantenha-as semanticamente no lugar adequado.",
        "Não acrescente explicações, títulos, aspas, markdown ou comentários. Responda somente com a mensagem final melhorada.",
      ].join(" "),
      prompt: [
        `Variáveis obrigatórias: ${originalVariables.length ? originalVariables.join(", ") : "nenhuma"}.`,
        "Mensagem original:",
        data.text,
      ].join("\n\n"),
      maxOutputTokens: 1200,
      temperature: 0.45,
    });

    const improved = text.trim();
    if (!improved) throw new Error("A IA não retornou uma mensagem válida.");
    assertSalesbotVariablesPreserved(data.text, improved);
    return { text: improved };
  });
