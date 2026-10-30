import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ImageProvider = "ideogram" | "recraft" | "freepik" | "gemini";
type WorkspaceAiModule = typeof import("@/lib/workspace-ai-key.server");
type WorkspaceAiSupabase = Parameters<WorkspaceAiModule["resolveWorkspaceAiKey"]>[0];

const WorkspaceOnly = z.object({ workspaceId: z.string().uuid() });
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
  if (!references.length) return "Nenhuma referência específica foi anexada para esta geração.";
  return references
    .map((ref, index) => {
      const details = ref.analysis?.trim() ? `\n   Análise disponível: ${ref.analysis.trim()}` : "";
      return `${index + 1}. [${ref.kind}] ${ref.label}: ${ref.value}${details}`;
    })
    .join("\n");
}

export const listSocialImageProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const order = ["ideogram", "recraft", "freepik", "gemini"] as const;
    const { data: rows, error } = await context.supabase
      .from("integrations")
      .select("provider,status")
      .eq("workspace_id", data.workspaceId)
      .in("provider", order as unknown as string[]);
    if (error) throw new Error(error.message);
    const connected = new Set(
      ((rows ?? []) as Array<{ provider: string; status: string }>)
        .filter((row) => row.status === "connected")
        .map((row) => row.provider),
    );
    const providers = order.filter((provider) => connected.has(provider));
    return { providers, primary: providers[0] ?? null };
  });

export const refineSocialBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        briefing: z.string().min(2).max(2000),
        imageProvider: z.enum(["ideogram", "recraft", "freepik", "gemini"]).optional().default("ideogram"),
        brandId: z.string().uuid().optional().nullable(),
        references: z.array(IdeaReferenceSchema).max(12).optional().default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let brandBlock = "Sem referência de marca: não invente identidade visual, cores, tom ou elementos de marca.";
    if (data.brandId) {
      const { data: brand } = await context.supabase
        .from("social_brand_context")
        .select("company_name,segment,tone_of_voice,target_audience,main_promise,differentials,positioning,visual_style,visual_memory,forbidden_themes,forbidden_words")
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.brandId)
        .maybeSingle();
      const b = (brand ?? {}) as Record<string, string | null>;
      brandBlock = [
        b.company_name && `Empresa: ${b.company_name}`,
        b.segment && `Segmento: ${b.segment}`,
        b.tone_of_voice && `Tom: ${b.tone_of_voice}`,
        b.target_audience && `Público: ${b.target_audience}`,
        b.main_promise && `Promessa: ${b.main_promise}`,
        b.differentials && `Diferenciais: ${b.differentials}`,
        b.positioning && `Posicionamento: ${b.positioning}`,
        b.visual_style && `Estilo visual: ${b.visual_style}`,
        b.visual_memory && `Memória visual: ${b.visual_memory}`,
        b.forbidden_themes && `Temas proibidos: ${b.forbidden_themes}`,
        b.forbidden_words && `Palavras proibidas: ${b.forbidden_words}`,
      ]
        .filter(Boolean)
        .join("\n") || "Marca selecionada, mas sem contexto preenchido.";
    }

    const visualRule =
      data.imageProvider === "ideogram"
        ? "Para direção visual, detalhe assunto, composição, cenário, hierarquia, iluminação, estilo, paleta, enquadramento, tipografia, texto exato em português entre aspas e elementos a evitar. Fuja de arte genérica, banco de imagens óbvio, fundo abstrato sem função e adjetivos vazios."
        : "Para direção visual, detalhe assunto, composição, cenário, hierarquia, iluminação, estilo, paleta, enquadramento e restrições. Fuja de instruções vagas.";
    const parsed = await callWorkspaceTextAi(
      context.supabase,
      data.workspaceId,
      `Você transforma pedidos simples de clientes em briefings claros de Social Media.\n\nPedido original:\n"${data.briefing.trim()}"\n\nMARCA:\n${brandBlock}\n\nREFERÊNCIAS ESPECÍFICAS DESTA GERAÇÃO:\n${referenceBlock(data.references)}\n\n${visualRule}\n\nO briefing final deve ser específico e executável: objetivo, mensagem central, público, promessa, gancho, direção visual, elementos obrigatórios, texto que deve aparecer na arte e restrições. Tudo em português do Brasil. Não gere o post nem ideias ainda. Preserve a intenção do cliente. Retorne JSON estrito: {"refinedBriefing":"string"}.`,
    );
    const refined = typeof parsed.refinedBriefing === "string" ? parsed.refinedBriefing.trim() : "";
    if (!refined) throw new Error("A IA não devolveu um briefing aprimorado.");
    return { refinedBriefing: refined };
  });

export const generateSocialIdeasWithWorkspaceAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        count: z.number().int().min(1).max(8).default(4),
        brief: z.string().max(2000).optional().default(""),
        network: z.enum(["instagram", "facebook", "both", "tiktok"]).default("both"),
        format: z.enum(["feed", "story", "carrossel", "qualquer"]).default("qualquer"),
        brandId: z.string().uuid().optional().nullable(),
        references: z.array(IdeaReferenceSchema).max(12).optional().default([]),
        carouselSlides: z.number().int().min(2).max(10).optional().default(6),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ data: ws }, { data: prof }] = await Promise.all([
      context.supabase.from("workspaces").select("name").eq("id", data.workspaceId).maybeSingle(),
      context.supabase.from("profiles").select("niche,company_name").eq("id", context.userId).maybeSingle(),
    ]);

    let brand: Record<string, string | null> | null = null;
    if (data.brandId) {
      const { data: selectedBrand } = await context.supabase
        .from("social_brand_context")
        .select("company_name,segment,tone_of_voice,target_audience,audience_pains,audience_desires,main_promise,differentials,positioning,products_services,visual_style,visual_memory,instagram_goal,facebook_goal,post_types,forbidden_themes,forbidden_words")
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.brandId)
        .maybeSingle();
      brand = (selectedBrand ?? null) as Record<string, string | null> | null;
    }

    const profileNiche = (prof as { niche?: string } | null)?.niche ?? "geral";
    const profileCompany =
      (prof as { company_name?: string } | null)?.company_name ??
      (ws as { name?: string } | null)?.name ??
      "a empresa";
    const niche = brand?.segment ?? profileNiche;
    const company = brand?.company_name ?? profileCompany;
    const brandBlock = brand
      ? [
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
        ]
          .filter(Boolean)
          .join("\n")
      : "SEM REFERÊNCIA DE MARCA. Não use automaticamente identidade visual, cores, memória visual, tom ou elementos salvos no workspace. Trabalhe somente com o pedido e as referências específicas anexadas.";

    const slideCount = data.carouselSlides;
    const carouselRule =
      data.format === "carrossel"
        ? `Cada ideia DEVE ser um carrossel real com EXATAMENTE ${slideCount} slides. Cada slide deve conter {"n":number,"title":string,"text":string,"image_prompt":string}. O slide 1 abre com atenção, os intermediários desenvolvem interesse/desejo/prova e o último fecha com ação/CTA. Cada image_prompt deve ser autossuficiente e visualmente distinto, mantendo a mesma linguagem de marca.`
        : `slides deve ser [] a menos que o formato retornado seja carrossel; se retornar carrossel, use ${slideCount} slides completos com image_prompt próprio por slide.`;

    const parsed = await callWorkspaceTextAi(
      context.supabase,
      data.workspaceId,
      `Você é estrategista e diretor de arte sênior de Social Media. Gere ${data.count} ideias específicas, não genéricas.\nRede: ${data.network}. Formato: ${data.format}.\nPedido obrigatório: ${data.brief.trim() || "crie ideias fortes e úteis"}.\n\nMARCA:\n${brandBlock}\n\nREFERÊNCIAS ESPECÍFICAS DESTA GERAÇÃO:\n${referenceBlock(data.references)}\n\n${carouselRule}\n\nREGRAS VISUAIS OBRIGATÓRIAS:\n- TODOS os prompts visuais devem estar integralmente em português do Brasil.\n- Para cada arte detalhe assunto principal, ação/cena, composição, posição dos elementos, primeiro/segundo plano, hierarquia, cenário, iluminação, paleta, materiais/texturas, enquadramento, estilo, tipografia e texto exato entre aspas quando houver.\n- Não use frases genéricas como 'arte moderna', 'design profissional', '8k', 'cinematic' ou 'premium' sem explicar como isso aparece visualmente.\n- Evite aparência de template pronto, banco de imagens óbvio, excesso de elementos e fundo abstrato sem função.\n- Quando houver pessoa/produto, descreva contexto real, expressão/ação, figurino/objeto, ângulo e relação com a mensagem.\n- Quando houver texto na imagem, escreva o texto final em português entre aspas e preserve legibilidade/hierarquia.\n- As referências anexadas são direção criativa; não copie marcas de terceiros, apenas absorva composição, clima, ritmo, tipografia e linguagem visual quando descritos.\n\nRetorne JSON estrito {"ideas":[{"title":string,"hook":string,"caption":string,"primary_cta":string,"alt_ctas":string[],"pinned_comment":string,"hashtags":string[],"trending_theme":string,"format":"feed"|"story"|"carrossel","image_prompt":string,"accent_color":string,"slides":array}]}.`,
    );

    const ideas = Array.isArray(parsed.ideas) ? (parsed.ideas as Array<Record<string, unknown>>) : [];
    const asStr = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    const asArr = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const rows = ideas.slice(0, data.count).map((idea) => {
      const rawSlides = Array.isArray(idea.slides) ? (idea.slides as Array<Record<string, unknown>>) : [];
      const format = ["feed", "story", "carrossel"].includes(String(idea.format))
        ? String(idea.format)
        : data.format === "qualquer"
          ? "feed"
          : data.format;
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
            image_prompt: `${master}\nSlide ${index + 1} de ${wantedSlides}. Crie uma composição própria para este slide, mantendo consistência visual com o conjunto e texto em português do Brasil.`,
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
          brief: data.brief.trim() || null,
          brand_id: data.brandId ?? null,
          references: data.references,
          slides,
          expanded: format === "carrossel" && slides.length > 0,
        },
      };
    });
    if (rows.length) {
      const { error } = await context.supabase.from("social_ideas").insert(rows as never);
      if (error) throw new Error(error.message);
    }
    return { created: rows.length };
  });

const SlideImageSchema = z.object({
  index: z.number().int().min(0).max(19),
  imagePath: z.string().min(1).max(500),
  provider: z.enum(["ideogram", "recraft", "freepik", "gemini"]),
});

export const setSocialIdeaSlideImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        ideaId: z.string().uuid(),
        images: z.array(SlideImageSchema).min(1).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("social_ideas")
      .select("metadata")
      .eq("id", data.ideaId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Ideia não encontrada.");
    const metadata = (((row as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>);
    const currentSlides = Array.isArray(metadata.slides)
      ? (metadata.slides as Array<Record<string, unknown>>)
      : [];
    if (!currentSlides.length) throw new Error("O carrossel ainda não possui slides detalhados.");
    const byIndex = new Map(data.images.map((item) => [item.index, item]));
    const now = new Date().toISOString();
    const nextSlides = currentSlides.map((slide, index) => {
      const image = byIndex.get(index);
      return image
        ? {
            ...slide,
            image_path: image.imagePath,
            image_provider: image.provider,
            image_generated_at: now,
          }
        : slide;
    });
    const first = data.images.slice().sort((a, b) => a.index - b.index)[0];
    const nextMetadata = {
      ...metadata,
      slides: nextSlides,
      image_path: first?.imagePath ?? metadata.image_path ?? null,
      image_provider: first?.provider ?? metadata.image_provider ?? null,
      image_generated_at: first ? now : metadata.image_generated_at ?? null,
    };
    const { error: updateError } = await context.supabase
      .from("social_ideas")
      .update({ metadata: nextMetadata } as never)
      .eq("id", data.ideaId)
      .eq("workspace_id", data.workspaceId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true as const, slidesUpdated: data.images.length };
  });
