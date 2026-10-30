import { createFileRoute } from "@tanstack/react-router";
import { verifyBearer, assertWorkspaceMember } from "@/lib/ai-agent/auth-bearer.server";
import { integrationVaultFailure } from "@/lib/integration-vault";

type TextProvider = "openai" | "gemini";
type Mode = "image_prompt" | "post_content";

async function readKey(
  ctx: Awaited<ReturnType<typeof verifyBearer>>,
  workspaceId: string,
  provider: TextProvider,
) {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) throw integrationVaultFailure("encryption-key-missing:refine-content");
  const { data, error } = await ctx.supabase.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: provider,
    _key: encKey,
  });
  if (error) throw integrationVaultFailure("get_integration_secret:refine-content", error.message);
  return (
    (data as { api_key?: string; apiKey?: string } | null)?.api_key ??
    (data as { api_key?: string; apiKey?: string } | null)?.apiKey ??
    null
  );
}

export const Route = createFileRoute("/api/social/refine-content")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let ctx;
        try {
          ctx = await verifyBearer(request);
        } catch (e) {
          return new Response((e as Error).message, { status: 401 });
        }
        const body = (await request.json().catch(() => null)) as {
          workspaceId?: string;
          text?: string;
          mode?: Mode;
          imageProvider?: string;
          aspectRatio?: string;
          tone?: string;
        } | null;
        if (!body?.workspaceId || !body.text?.trim())
          return new Response("workspaceId e texto são obrigatórios.", { status: 400 });
        try {
          await assertWorkspaceMember(ctx.supabase, body.workspaceId, ctx.userId);
        } catch (e) {
          return new Response((e as Error).message, { status: 403 });
        }

        const { data: rows } = await ctx.supabase
          .from("integrations")
          .select("provider,status")
          .eq("workspace_id", body.workspaceId)
          .in("provider", ["openai", "gemini"]);
        const connected = new Set(
          ((rows ?? []) as Array<{ provider: string; status: string }>)
            .filter((r) => r.status === "connected")
            .map((r) => r.provider),
        );
        const provider: TextProvider | null = connected.has("openai")
          ? "openai"
          : connected.has("gemini")
            ? "gemini"
            : null;
        if (!provider)
          return new Response(
            "Conecte sua API Key da OpenAI ou Gemini em Integrações para gerar textos e aprimorar prompts.",
            { status: 409 },
          );
        let apiKey: string | null;
        try {
          apiKey = await readKey(ctx, body.workspaceId, provider);
        } catch (e) {
          return new Response((e as Error).message, { status: 503 });
        }
        if (!apiKey) return new Response(`API Key de ${provider} não encontrada.`, { status: 409 });

        const mode = body.mode ?? "post_content";
        const system =
          mode === "image_prompt"
            ? `Você é um diretor de arte especialista em prompts para ${body.imageProvider ?? "Ideogram"}. Preserve integralmente a intenção do usuário. Para Ideogram, priorize composição, tipografia literal entre aspas, hierarquia visual, iluminação, paleta e posição dos elementos. Não invente marcas nem textos que o usuário não pediu. Responda em JSON: {"prompt":"..."}.`
            : `Você é um social media sênior. Crie conteúdo em pt-BR natural, comercial e sem clichês. Responda somente JSON: {"caption":"...","hashtags":["#..."],"cta":"...","title":"..."}.`;
        const user =
          mode === "image_prompt"
            ? `Formato ${body.aspectRatio ?? "1:1"}. Prompt do usuário: ${body.text}`
            : `Tom: ${body.tone ?? "profissional e natural"}. Briefing: ${body.text}`;

        try {
          let raw = "";
          if (provider === "openai") {
            const r = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "gpt-4.1-mini",
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: user },
                ],
                response_format: { type: "json_object" },
              }),
            });
            if (!r.ok)
              return new Response(`OpenAI ${r.status}: ${(await r.text()).slice(0, 400)}`, {
                status: r.status,
              });
            const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
            raw = j.choices?.[0]?.message?.content ?? "{}";
          } else {
            const r = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
                  generationConfig: { responseMimeType: "application/json" },
                }),
              },
            );
            if (!r.ok)
              return new Response(`Gemini ${r.status}: ${(await r.text()).slice(0, 400)}`, {
                status: r.status,
              });
            const j = (await r.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            raw = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
          }
          return Response.json({ provider, ...JSON.parse(raw) });
        } catch (e) {
          return new Response(`Falha na IA de texto: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});
