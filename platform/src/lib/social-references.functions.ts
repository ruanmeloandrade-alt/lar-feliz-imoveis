// Referências visuais + memória visual da marca.
// Regra: análise textual/visual usa a IA resolvida do próprio workspace.
// Não usar LOVABLE_API_KEY diretamente para workspaces de clientes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_REFS_PER_SENTIMENT = 20;

// O client autenticado do middleware é compatível com o subset usado aqui.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbClient = any;
type Json = string | number | boolean | null | { [k: string]: Json } | Json[];
type ChatMessage = {
  role: "system" | "user";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
};

async function callWorkspaceJson<T>(
  sb: SbClient,
  workspaceId: string,
  messages: ChatMessage[],
): Promise<T> {
  const { resolveWorkspaceAiKey } = await import("@/lib/workspace-ai-key.server");
  const resolved = await resolveWorkspaceAiKey(sb, workspaceId);
  const res = await fetch(`${resolved.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolved.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolved.defaultModel,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.25,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Análise da marca falhou (${res.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error("A IA devolveu a análise da marca em formato inválido.");
  }
}

async function callVisionJson<T>(sb: SbClient, workspaceId: string, imageUrl: string, prompt: string): Promise<T> {
  return callWorkspaceJson<T>(sb, workspaceId, [
    {
      role: "system",
      content: "Você é diretor de arte. Analise a imagem e devolva sempre JSON estrito, sem texto fora do JSON, em português do Brasil.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ]);
}

async function callTextJson<T>(sb: SbClient, workspaceId: string, system: string, prompt: string): Promise<T> {
  return callWorkspaceJson<T>(sb, workspaceId, [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ]);
}

export const listBrandReferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const { data: rows, error } = await sb
      .from("social_brand_references")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error((error as { message?: string }).message ?? "Erro ao listar referências.");

    const list = (rows ?? []) as Array<{ id: string; storage_path: string | null; source_url?: string | null }>;
    const withUrls = await Promise.all(list.map(async (row) => {
      let signedUrl: string | null = null;
      if (row.storage_path) {
        const signed = await sb.storage.from("social-media").createSignedUrl(row.storage_path, 3600);
        signedUrl = signed.data?.signedUrl ?? null;
      }
      return { ...(row as Record<string, unknown>), signed_url: signedUrl };
    }));
    return { references: withUrls };
  });

export const saveBrandReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    storagePath: z.string().min(3).optional().nullable(),
    sourceUrl: z.string().url().max(2000).optional().nullable(),
    sentiment: z.enum(["like", "dislike"]).default("like"),
    label: z.string().max(200).optional().nullable(),
  }).refine((value) => Boolean(value.storagePath || value.sourceUrl), {
    message: "Envie uma imagem ou informe uma URL de referência.",
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const { data: existing, error: countError } = await sb.from("social_brand_references")
      .select("id,sentiment")
      .eq("workspace_id", data.workspaceId);
    if (countError) throw new Error(countError.message ?? "Erro ao conferir referências.");
    const same = ((existing ?? []) as Array<{ sentiment: string | null }>)
      .filter((row) => (row.sentiment ?? "like") === data.sentiment).length;
    if (same >= MAX_REFS_PER_SENTIMENT) {
      throw new Error(`Limite de ${MAX_REFS_PER_SENTIMENT} referências de "${data.sentiment === "like" ? "gosto" : "não gosto"}" atingido.`);
    }

    const { data: row, error } = await sb.from("social_brand_references").insert({
      workspace_id: data.workspaceId,
      storage_path: data.storagePath ?? null,
      source_url: data.sourceUrl ?? null,
      sentiment: data.sentiment,
      label: data.label ?? null,
      status: data.storagePath ? "pending" : "ready",
      is_active: true,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error((error as { message?: string }).message ?? "Erro ao salvar referência.");
    return { reference: row };
  });

export const toggleBrandReferenceActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    isActive: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const { error } = await sb.from("social_brand_references")
      .update({ is_active: data.isActive })
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error((error as { message?: string }).message ?? "Erro ao atualizar referência.");
    return { ok: true };
  });

export const deleteBrandReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const { data: rows } = await sb.from("social_brand_references")
      .select("storage_path")
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    const path = ((rows ?? []) as Array<{ storage_path: string | null }>)[0]?.storage_path ?? null;
    const { error } = await sb.from("social_brand_references")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error((error as { message?: string }).message ?? "Erro ao remover referência.");
    if (path) {
      const { error: storageError } = await sb.storage.from("social-media").remove([path]);
      if (storageError) console.warn("Referência removida do banco, mas o arquivo não pôde ser removido do storage.");
    }
    return { ok: true };
  });

export const analyzeBrandReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const { data: rows, error } = await sb.from("social_brand_references")
      .select("id,storage_path")
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message ?? "Erro ao ler referência.");
    const row = ((rows ?? []) as Array<{ id: string; storage_path: string | null }>)[0];
    if (!row?.storage_path) throw new Error("Referência visual não encontrada.");

    const signed = await sb.storage.from("social-media").createSignedUrl(row.storage_path, 600);
    if (!signed.data?.signedUrl) throw new Error("Não consegui ler a imagem da referência.");

    const analysis = await callVisionJson<Record<string, Json>>(
      sb,
      data.workspaceId,
      signed.data.signedUrl,
      [
        "Analise esta referência visual da marca e retorne JSON com o schema:",
        "{",
        '  "style": string,',
        '  "palette": string[],',
        '  "typography": string,',
        '  "composition": string,',
        '  "mood": string,',
        '  "textures_effects": string,',
        '  "subjects": string[],',
        '  "photo_or_illustration": string,',
        '  "notes": string',
        "}",
      ].join("\n"),
    );

    const { error: updateError } = await sb.from("social_brand_references")
      .update({ analysis, status: "ready" })
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (updateError) throw new Error(updateError.message ?? "Erro ao salvar análise da referência.");
    return { analysis };
  });

export const rebuildVisualMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const { data: rows, error } = await sb.from("social_brand_references")
      .select("label,analysis,is_active,status,sentiment")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message ?? "Erro ao carregar memória visual.");

    const active = ((rows ?? []) as Array<{
      label: string | null;
      analysis: unknown;
      is_active: boolean;
      status: string;
      sentiment: string | null;
    }>).filter((row) => row.is_active && row.status === "ready" && row.analysis);

    if (active.length === 0) {
      const { error: clearError } = await sb.from("social_brand_context")
        .upsert({ workspace_id: data.workspaceId, visual_memory: null }, { onConflict: "workspace_id" });
      if (clearError) throw new Error(clearError.message ?? "Erro ao limpar memória visual.");
      return { visual_memory: null };
    }

    const aggregate = await callTextJson<{ summary?: string }>(
      sb,
      data.workspaceId,
      "Você é diretor de arte. Consolide referências visuais em uma memória curta e operacional da marca. Respeite referências marcadas como não gosto como coisas a evitar. Retorne JSON estrito.",
      [
        "Referências ativas da marca:",
        JSON.stringify(active.map((row) => ({ label: row.label, sentiment: row.sentiment, analysis: row.analysis })), null, 2),
        "",
        'Retorne {"summary":"string"} com no máximo 1600 caracteres.',
        "Inclua estilo, paleta, tipografia, composição, mood e o que evitar. Escreva pronto para ser injetado em prompts visuais.",
      ].join("\n"),
    );
    const summary = (aggregate.summary ?? "").trim().slice(0, 1600);
    if (!summary) throw new Error("A IA não devolveu memória visual utilizável.");

    const { error: saveError } = await sb.from("social_brand_context")
      .upsert({ workspace_id: data.workspaceId, visual_memory: summary }, { onConflict: "workspace_id" });
    if (saveError) throw new Error(saveError.message ?? "Erro ao salvar memória visual.");
    return { visual_memory: summary };
  });
