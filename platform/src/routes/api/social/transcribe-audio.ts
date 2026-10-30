// Transcreve áudio do chat usando a chave OpenAI DO PRÓPRIO workspace.
// Isolamento multi-tenant: nunca cai em LOVABLE_API_KEY (créditos da conta mãe).
import { createFileRoute } from "@tanstack/react-router";
import { verifyBearer, assertWorkspaceMember } from "@/lib/ai-agent/auth-bearer.server";
import { resolveWorkspaceAiKey } from "@/lib/workspace-ai-key.server";

export const Route = createFileRoute("/api/social/transcribe-audio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let ctx;
        try { ctx = await verifyBearer(request); }
        catch (e) { return new Response((e as Error).message, { status: 401 }); }

        const url = new URL(request.url);
        const workspaceId = url.searchParams.get("workspaceId");
        if (!workspaceId) return new Response("workspaceId obrigatório", { status: 400 });
        try { await assertWorkspaceMember(ctx.supabase, workspaceId, ctx.userId); }
        catch (e) { return new Response((e as Error).message, { status: 403 }); }

        let key;
        try { key = await resolveWorkspaceAiKey(ctx.supabase as unknown as Parameters<typeof resolveWorkspaceAiKey>[0], workspaceId); }
        catch (e) { return new Response((e as Error).message, { status: 400 }); }

        if (key.provider !== "openai") {
          return new Response(
            "Transcrição exige uma chave OpenAI conectada neste workspace. Vá em Integrações → OpenAI.",
            { status: 400 },
          );
        }

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return new Response("Áudio ausente ou vazio.", { status: 400 });
        }
        if (file.size > 24 * 1024 * 1024) {
          return new Response("Áudio maior que 24MB. Grave um trecho menor.", { status: 400 });
        }

        const upstream = new FormData();
        upstream.append("file", file, file.name || "recording.webm");
        upstream.append("model", "gpt-4o-mini-transcribe");
        upstream.append("response_format", "json");

        const res = await fetch(`${key.baseUrl}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key.apiKey}` },
          body: upstream,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return new Response(
            `Falha ao transcrever (${res.status}): ${errText.slice(0, 400) || res.statusText}`,
            { status: res.status },
          );
        }

        const json = await res.json().catch(() => ({} as { text?: string }));
        const text = (json as { text?: string }).text?.trim() ?? "";
        return Response.json({ text });
      },
    },
  },
});
