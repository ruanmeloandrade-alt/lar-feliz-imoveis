import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { integrationVaultFailure } from "@/lib/integration-vault";

const SaveOpenAISchema = z.object({
  workspaceId: z.string().uuid(),
  apiKey: z.string().min(20),
});

const SaveGeminiSchema = z.object({
  workspaceId: z.string().uuid(),
  apiKey: z.string().min(10),
});

const SaveDesignAISchema = z.object({
  workspaceId: z.string().uuid(),
  provider: z.enum(["ideogram", "recraft", "freepik"]),
  apiKey: z.string().min(10),
});

const GetSchema = z.object({
  workspaceId: z.string().uuid(),
  provider: z.enum(["openai", "gemini", "ideogram", "recraft", "freepik"]),
});

function encKey() {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k) throw integrationVaultFailure("encryption-key-missing");
  return k;
}

type SbRpc = { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = SbRpc & { from: (t: string) => any };

async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const id = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!id) throw new Error("Workspace ativo não encontrado.");
  return id;
}

async function setSecret(
  supabase: SbRpc,
  args: {
    workspaceId: string;
    provider: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
    status: string;
  },
) {
  const { error } = await supabase.rpc("set_integration_secret", {
    _workspace_id: args.workspaceId,
    _provider: args.provider,
    _plaintext: args.payload,
    _key: encKey(),
    _metadata: args.metadata,
    _status: args.status,
  });
  if (error) throw integrationVaultFailure("set_integration_secret", error.message);
}

async function validateIdeogramKey(apiKey: string): Promise<Response> {
  const form = new FormData();
  form.set("prompt", "A simple black circle centered on a white background");
  form.set("aspect_ratio", "1x1");
  form.set("rendering_speed", "TURBO");
  form.set("magic_prompt", "OFF");
  form.set("num_images", "1");
  return fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", {
    method: "POST",
    headers: { "Api-Key": apiKey },
    body: form,
  });
}

function toCatalogStatus(status?: string | null): "conectado" | "desconectado" | "em_preparacao" {
  if (status === "connected" || status === "conectado") return "conectado";
  if (status === "needs_reconnect" || status === "pending" || status === "em_preparacao") return "em_preparacao";
  return "desconectado";
}

function toStatusLabel(status?: string | null): string {
  const catalogStatus = toCatalogStatus(status);
  if (catalogStatus === "conectado") return "Conectado";
  if (catalogStatus === "em_preparacao") return "Requer atenção";
  return "Desconectado";
}

export const saveOpenAIIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveOpenAISchema.parse(d))
  .handler(async ({ data, context }) => {
    // Test the key first
    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${data.apiKey}` },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`OpenAI rejeitou a chave (${resp.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json()) as { data?: Array<{ id: string }> };
    const modelCount = json.data?.length ?? 0;
    await setSecret(context.supabase as unknown as SbRpc, {
      workspaceId: data.workspaceId,
      provider: "openai",
      payload: { api_key: data.apiKey },
      metadata: { model_count: modelCount, masked: maskKey(data.apiKey) },
      status: "connected",
    });
    return { ok: true, modelCount };
  });

export const saveGeminiIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveGeminiSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = data.apiKey.trim();
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    );
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Gemini rejeitou a chave (${resp.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json().catch(() => null)) as { models?: Array<{ name?: string }> } | null;
    await setSecret(context.supabase as unknown as SbRpc, {
      workspaceId: data.workspaceId,
      provider: "gemini",
      payload: { api_key: key },
      metadata: { model_count: json?.models?.length ?? 0, masked: maskKey(key) },
      status: "connected",
    });
    return { ok: true, modelCount: json?.models?.length ?? 0 };
  });

export const getIntegrationCatalogStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);

    const [{ data: integrations }, { data: automations }, { data: pages }, { data: instagram }] = await Promise.all([
      sb.from("integrations")
        .select("provider,status,metadata")
        .eq("workspace_id", workspaceId)
        .in("provider", ["meta", "google", "tiktok", "openai", "gemini", "ideogram", "recraft", "freepik"]),
      sb.from("external_automations")
        .select("provider,status,outbound_url,selected_events,last_success_at,last_error")
        .eq("workspace_id", workspaceId)
        .in("provider", ["n8n", "make"]),
      sb.from("meta_pages")
        .select("page_id,messaging_subscribed_at,messaging_error")
        .eq("workspace_id", workspaceId),
      sb.from("meta_instagram_accounts")
        .select("instagram_id,messaging_subscribed_at,messaging_error")
        .eq("workspace_id", workspaceId),
    ]);

    const out: Record<string, { status: "conectado" | "desconectado" | "em_preparacao"; technicalStatus?: { label: string; value: string }[] }> = {};
    const integrationRows = (integrations ?? []) as Array<{ provider: string; status: string; metadata?: Record<string, unknown> | null }>;
    for (const provider of ["meta", "google", "tiktok", "openai", "gemini", "ideogram", "recraft", "freepik"] as const) {
      const row = integrationRows.find((r) => r.provider === provider);
      out[provider] = {
        status: toCatalogStatus(row?.status),
        technicalStatus: [
          { label: "Status", value: toStatusLabel(row?.status) },
          ...(row?.metadata?.masked ? [{ label: "Chave", value: String(row.metadata.masked) }] : []),
        ],
      };
    }

    // A central Google aparece no catálogo com o id conta-google.
    out["conta-google"] = out["google"];

    const pageRows = (pages ?? []) as Array<{ page_id: string; messaging_subscribed_at: string | null }>;
    const igRows = (instagram ?? []) as Array<{ instagram_id: string; messaging_subscribed_at: string | null }>;
    const subscribedPages = pageRows.filter((p) => p.messaging_subscribed_at).length;
    const subscribedIg = igRows.filter((i) => i.messaging_subscribed_at).length;
    out["messenger"] = {
      status: subscribedPages > 0 ? "conectado" : pageRows.length > 0 ? "em_preparacao" : "desconectado",
      technicalStatus: [
        { label: "Páginas", value: `${subscribedPages}/${pageRows.length} assinadas` },
      ],
    };
    out["instagram-dm"] = {
      status: subscribedIg > 0 ? "conectado" : igRows.length > 0 ? "em_preparacao" : "desconectado",
      technicalStatus: [
        { label: "Instagram", value: `${subscribedIg}/${igRows.length} assinados` },
      ],
    };

    const automationRows = (automations ?? []) as Array<{ provider: string; status: string; outbound_url?: string | null; selected_events?: string[] | null; last_success_at?: string | null; last_error?: string | null }>;
    for (const provider of ["n8n", "make"] as const) {
      const row = automationRows.find((r) => r.provider === provider);
      out[provider] = {
        status: toCatalogStatus(row?.status),
        technicalStatus: [
          { label: "Status", value: toStatusLabel(row?.status) },
          { label: "Eventos", value: `${row?.selected_events?.length ?? 0} selecionados` },
          ...(row?.last_success_at ? [{ label: "Último OK", value: new Date(row.last_success_at).toLocaleDateString("pt-BR") }] : []),
        ],
      };
    }

    return out;
  });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const { data: secret, error } = await sb.rpc("get_integration_secret", {
      _workspace_id: data.workspaceId,
      _provider: data.provider,
      _key: encKey(),
    });
    if (error) throw integrationVaultFailure("get_integration_secret:test", error.message);
    if (!secret) throw new Error("Integração não configurada.");
    const s = secret as Record<string, string>;
    if (data.provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${s.api_key}` },
      });
      if (!r.ok) throw new Error(`Teste falhou (${r.status})`);
      return { ok: true };
    }
    if (data.provider === "gemini") {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(s.api_key)}`,
      );
      if (!r.ok) throw new Error(`Teste falhou (${r.status})`);
      return { ok: true };
    }
    if (data.provider === "ideogram") {
      const r = await validateIdeogramKey(s.api_key);
      if (!r.ok && r.status !== 402) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Teste Ideogram falhou (${r.status}): ${txt.slice(0, 200)}`);
      }
      return { ok: true };
    }
    if (data.provider === "recraft") {
      const r = await fetch("https://external.api.recraft.ai/v1/users/me", {
        headers: { Authorization: `Bearer ${s.api_key}` },
      });
      if (!r.ok) throw new Error(`Teste Recraft falhou (${r.status})`);
      return { ok: true };
    }
    if (data.provider === "freepik") {
      const r = await fetch("https://api.freepik.com/v1/ai/text-to-image/flux-dev", {
        method: "POST",
        headers: { "x-freepik-api-key": s.api_key, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "test", aspect_ratio: "square_1_1", num_images: 1 }),
      });
      if (!r.ok && r.status !== 402) throw new Error(`Teste Freepik falhou (${r.status})`);
      return { ok: true };
    }
    return { ok: false };
  });

// ============================================================
// Providers de imagem de design (Ideogram / Recraft / Freepik)
// Todos aceitam só uma API key simples e são validados chamando
// um endpoint leve do próprio provider antes de salvar.
// ============================================================
export const saveDesignAIIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveDesignAISchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = data.apiKey.trim();
    let testResp: Response;
    if (data.provider === "ideogram") {
      testResp = await validateIdeogramKey(key);
    } else if (data.provider === "recraft") {
      testResp = await fetch("https://external.api.recraft.ai/v1/users/me", {
        headers: { Authorization: `Bearer ${key}` },
      });
    } else {
      testResp = await fetch("https://api.freepik.com/v1/ai/text-to-image/flux-dev", {
        method: "POST",
        headers: { "x-freepik-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "test", aspect_ratio: "square_1_1", num_images: 1 }),
      });
    }
    // 402 (sem créditos) ainda significa chave válida
    if (!testResp.ok && testResp.status !== 402) {
      const txt = await testResp.text().catch(() => "");
      throw new Error(`${data.provider} rejeitou a chave (${testResp.status}): ${txt.slice(0, 200)}`);
    }
    await setSecret(context.supabase as unknown as SbRpc, {
      workspaceId: data.workspaceId,
      provider: data.provider,
      payload: { api_key: key },
      metadata: { masked: maskKey(key) },
      status: "connected",
    });
    return { ok: true, provider: data.provider };
  });

export const getWorkspaceAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);

    try {
      const { resolveWorkspaceAiKey } = await import("@/lib/workspace-ai-key.server");
      const ai = await resolveWorkspaceAiKey(sb, workspaceId);
      return {
        ok: true,
        provider: ai.provider,
        message: ai.provider === "openai"
          ? "OpenAI conectada neste workspace."
          : "IA interna liberada apenas para a conta mãe.",
      };
    } catch (err) {
      return {
        ok: false,
        provider: null,
        message: err instanceof Error ? err.message : "OpenAI não conectada neste workspace.",
      };
    }
  });

function maskKey(k: string) {
  if (k.length <= 8) return "***";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
