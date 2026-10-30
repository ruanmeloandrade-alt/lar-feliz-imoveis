// Runtime override for the Banco de Ideias generation contract.
// Other exports remain owned by the existing finalization module.
export {
  listSocialImageProviders,
  refineSocialBriefing,
  setSocialIdeaSlideImages,
} from "./social-finalization.functions";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type WorkspaceAiModule = typeof import("@/lib/workspace-ai-key.server");
type WorkspaceAiSupabase = Parameters<WorkspaceAiModule["resolveWorkspaceAiKey"]>[0];

const IdeaReferenceSchema = z.object({
  label: z.string().min(1).max(160),
  kind: z.enum(["link", "image", "pdf", "file", "brand_reference"]),
  value: z.string().min(1).max(1000),
  analysis: z.string().max(3000).optional().nullable(),
});

async function callWorkspaceTextAi(
  supabase: WorkspaceAiSupabase,
  workspaceId: string,
  prompt: string,
): Promise<Record<string, unknown>> {
  const { resolveWorkspaceAiKey } = await import("@/lib/workspace-ai-key.server");
  const resolved = await resolveWorkspaceAiKey(supabase, workspaceId);
  const res = await fetch(`${resolved.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${resolved.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolved.defaultModel,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.35,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha na IA de texto (${res.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error("A IA devolveu JSON inválido.");
  }
}

function referenceBlock(references: Array<z.infer<typeof IdeaReferenceSchema>>): string {
  if (!references.length) return "Nenhuma referência adicional fornecida.";
  return references.map((ref, index) => {
    const analysis = ref.analysis?.trim() ? ` — análise: ${ref.analysis.trim()}` : "";
    return `${index + 1}. [${ref.kind}] ${ref.label}: ${ref.value}${analysis}`;
  }).join("\n");
}

export const generateSocialIdeasWithWorkspaceAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    workspaceId: z.string().uuid(),
    count: z.number().int().min(1).max(8).default(4),
    // Único conteúdo obrigatório para gerar: o pedido do usuário.
    brief: z.string().trim().min(1, "Escreva o pedido para gerar ideias.").max(2000),
    network: z.enum(["instagram", "facebook", "both", "tiktok"]).default("both"),
    format: z.enum(["feed", "story", "carrossel", "qualquer"]).default("qualquer"),
    brandId: z.string().uuid().optional().nullable(),
    references: z.array(IdeaReferenceSchema).max(12).optional().default([]),
    carouselSlides: z.number().int().min(2).max(10).optional().default(6),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: ws }, { data: prof }] = await Promise.all([
      context.supabase.from("workspaces").select("name").eq("id", data.workspaceId).maybeSingle(),
      context.supabase.from("profiles").select("niche,company_name").eq("id", context.userId).maybeSingle(),
    ]);

    let brand: Record<string, string | null> | null = null;
    if (data.brandId) {
      const { data: selectedBrand, error: brandError } = await context.supabase
        .from("social_brand_context")
        .select("company_name,segment,tone_of_voice,target_audience,audience_pains,audience_desires,main_promise,differentials,positioning,products_services,visual_style,visual_memory,forbidden_themes,forbidden_words")
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.brandId)
        .maybeSingle();
      if (brandError) throw new Error(brandError.message);
      brand = (selectedBrand ?? null) as Record<string, string | null> | null;
    }

    const profileNiche = (prof as { niche?: string | null } | null)?.niche ?? "geral";
    const profileCompany = (prof as { company_name?: string | null } | null)?.company_name
      ?? (ws as { name?: string | null } | null)?.name
      ?? "a empresa";
    const niche = brand?.segment ?? profileNiche;
    const company = brand?.company_name ?? profileCompany;
    const brandBlock = brand ? [
      `Empresa: ${company}`,
      `Segmento: ${brand.segment ?? niche}`,
      brand.tone_of_voice && `Tom: ${brand.tone_of_voice}`,
      brand.target_audience && `Público: ${brand.target_audience}`,
      brand.audience_pains && `Dores: ${brand.audience_pains}`,
      brand.audience_desires && `Desejos: ${brand.audience_desires}`,
      brand.main_promise && `Promessa: ${brand.main_promise}`,
      brand.differentials && `Diferenciais: ${brand.differentials}`,
      brand.positioning && `Posicionamento: ${brand.positioning}`,
      brand.products_services && `Produtos/serviços: ${brand.products_services}`,
      brand.visual_style && `Estilo visual: ${brand.visual_style}`,
      brand.visual_memory && `Memória visual: ${brand.visual_memory}`,
      brand.forbidden_themes && `Temas proibidos: ${brand.forbidden_themes}`,
      brand.forbidden_words && `Palavras proibidas: ${brand.forbidden_words}`,
    ].filter(Boolean).join("\n") : "Nenhuma marca selecionada. Não invente identidade visual, tom, logo ou cores de uma marca não fornecida.";

    const slideCount = data.carouselSlides;
    const carouselRule = data.format === "carrossel"
      ? `Cada ideia deve ser um carrossel real com EXATAMENTE ${slideCount} slides. Cada slide: {"n":number,"title":string,"text":string,"image_prompt":string}.`
      : `slides deve ser [] salvo se a própria ideia for carrossel; nesse caso use ${slideCount} slides completos.`;

    const parsed = await callWorkspaceTextAi(
      context.supabase,
      data.workspaceId,
      [
        `Você é estrategista sênior de Social Media. Gere ${data.count} ideias específicas e utilizáveis.`,
        `Rede: ${data.network}. Formato: ${data.format}.`,
        `PEDIDO DO USUÁRIO — FONTE DE VERDADE: """${data.brief}"""`,
        "",
        `MARCA OPCIONAL:\n${brandBlock}`,
        "",
        `REFERÊNCIAS OPCIONAIS:\n${referenceBlock(data.references)}`,
        "",
        carouselRule,
        "",
        "Para cada ideia entregue título, gancho, legenda pronta, CTA, comentário fixado, hashtags e direção visual específica. Não deixe de criar a ideia por ausência de marca ou referência adicional.",
        "Quando houver texto visível na imagem, mantenha-o curto e informe a frase FINAL entre aspas. Para Ideogram, escreva a direção visual em inglês natural e mantenha somente o texto que precisa aparecer na arte no idioma original entre aspas.",
        "Retorne SOMENTE JSON válido no formato:",
        '{"ideas":[{"title":string,"hook":string,"caption":string,"primary_cta":string,"alt_ctas":string[],"pinned_comment":string,"hashtags":string[],"trending_theme":string,"format":"feed"|"story"|"carrossel","image_prompt":string,"accent_color":string,"slides":array}]}',
      ].join("\n"),
    );

    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas as Array<Record<string, unknown>> : [];
    const asStr = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
    const asArr = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    const rows = ideas.slice(0, data.count).map((idea) => {
      const rawSlides = Array.isArray(idea.slides) ? idea.slides as Array<Record<string, unknown>> : [];
      const format = ["feed", "story", "carrossel"].includes(String(idea.format))
        ? String(idea.format)
        : data.format === "qualquer" ? "feed" : data.format;
      const wantedSlides = format === "carrossel" ? slideCount : 0;
      const slides = rawSlides.slice(0, wantedSlides || 8).map((slide, index) => ({
        n: typeof slide.n === "number" ? slide.n : index + 1,
        title: asStr(slide.title, 100),
        text: asStr(slide.text, 500),
        image_prompt: asStr(slide.image_prompt, 1800),
      }));
      if (format === "carrossel" && slides.length < wantedSlides) {
        const master = asStr(idea.image_prompt, 1500);
        for (let index = slides.length; index < wantedSlides; index += 1) {
          slides.push({
            n: index + 1,
            title: `Slide ${index + 1}`,
            text: "",
            image_prompt: `${master}\nSlide ${index + 1} of ${wantedSlides}. Keep visual continuity and create a distinct composition for this slide.`,
          });
        }
      }
      return {
        workspace_id: data.workspaceId,
        title: asStr(idea.title, 200) || "Ideia",
        copy_suggestion: asStr(idea.caption, 2000) || null,
        niche,
        origin: "ai",
        metadata: {
          hook: asStr(idea.hook, 240),
          caption: asStr(idea.caption, 2000),
          primary_cta: asStr(idea.primary_cta, 200),
          alt_ctas: asArr(idea.alt_ctas).slice(0, 3),
          pinned_comment: asStr(idea.pinned_comment, 500),
          hashtags: asArr(idea.hashtags).slice(0, 10),
          trending_theme: asStr(idea.trending_theme, 180),
          format,
          image_prompt: asStr(idea.image_prompt, 1800),
          accent_color: asStr(idea.accent_color, 12) || "#6366f1",
          network: data.network,
          brief: data.brief,
          brand_id: data.brandId ?? null,
          references: data.references,
          slides,
          expanded: format === "carrossel" && slides.length > 0,
        },
      };
    });

    if (!rows.length) throw new Error("A IA não devolveu nenhuma ideia válida.");
    const { data: inserted, error } = await context.supabase
      .from("social_ideas")
      .insert(rows as never)
      .select("id");
    if (error) throw new Error(error.message);
    const ideaIds = ((inserted ?? []) as Array<{ id?: string }>).map((row) => row.id).filter((id): id is string => Boolean(id));
    if (ideaIds.length !== rows.length) {
      throw new Error(`Foram inseridas ${rows.length} ideias, mas o banco confirmou somente ${ideaIds.length} IDs.`);
    }
    return { created: rows.length, ideaIds };
  });
