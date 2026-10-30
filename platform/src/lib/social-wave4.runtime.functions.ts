// Runtime refinement for campaign authoring. The legacy wave-4 surface remains available,
// but refinePostBriefing follows the current Ideogram prompting contract.
export * from "./social-wave4.override.functions";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { integrationVaultFailure } from "@/lib/integration-vault";
import { encodeCarouselWithFidelity, inferCarouselCount } from "@/lib/social-style-fidelity";

const RefinePostInput = z.object({
  workspaceId: z.string().uuid(),
  briefing: z.string().trim().min(3).max(4000),
  format: z.enum(["feed", "reels", "carrossel", "story"]).default("feed"),
  slides: z.number().int().min(2).max(20).optional().nullable(),
  tone: z.string().max(300).optional().nullable(),
  audience: z.string().max(300).optional().nullable(),
  campaignName: z.string().max(200).optional().nullable(),
  campaignObjective: z.string().max(400).optional().nullable(),
  targetImageProvider: z.enum(["ideogram", "recraft", "freepik", "gemini"]).optional().nullable(),
  targetTextProvider: z.enum(["openai", "gemini"]).optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
});

function normalizeCountry(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : "";
}

async function resolveAccountLanguage(
  supabase: { from: (table: string) => any },
  workspaceId: string,
  userId: string,
): Promise<{ label: string; locale: string }> {
  const [{ data: profile }, { data: workspace }] = await Promise.all([
    supabase.from("profiles").select("country").eq("id", userId).maybeSingle(),
    supabase.from("workspaces").select("address_country").eq("id", workspaceId).maybeSingle(),
  ]);
  const country = normalizeCountry(
    (profile as { country?: string | null } | null)?.country
      ?? (workspace as { address_country?: string | null } | null)?.address_country,
  );
  if (!country || ["br", "bra", "brasil", "brazil"].includes(country)) return { label: "português do Brasil", locale: "pt-BR" };
  if (["pt", "prt", "portugal"].includes(country)) return { label: "português de Portugal", locale: "pt-PT" };
  if (["es", "esp", "espanha", "spain", "mexico", "argentina", "chile", "colombia", "peru", "uruguay", "paraguay", "bolivia", "ecuador", "venezuela"].includes(country)) {
    return { label: "espanhol", locale: "es" };
  }
  return { label: "idioma principal da conta", locale: "auto" };
}

function ideogramRules(language: string): string {
  return [
    "IDEOGRAM V3 PROMPT CONTRACT:",
    "- Write the visual direction as clear, natural-language sentences. Keep it visually grounded and specific.",
    `- Any words that must actually appear inside the image stay in ${language}; never translate that visible copy.`,
    "- Put exact visible copy near the beginning as: Exact text to render: \"...\".",
    "- Describe where the text appears and how it should look: placement, hierarchy, typography, contrast and text area.",
    "- Keep visible copy short whenever the user did not explicitly provide a longer phrase. Prefer one short headline or split longer copy into clearly placed chunks.",
    "- Never invent filler text, labels, logos or secondary words just to decorate the design.",
    "- Describe concrete subject, action, setting, foreground/background, composition, lighting, materials, palette and framing.",
    "- Put the most important subject and exact text early. Reduce unnecessary visual complexity around typography.",
    "- If no visible copy is requested, state: No text.",
  ].join("\n");
}

function otherProviderRules(language: string): string {
  return [
    `Escreva o prompt visual em ${language}.`,
    "Detalhe sujeito, ação, cenário, composição, hierarquia, luz, materiais, paleta, enquadramento e tipografia.",
    "Quando houver texto visível, informe a frase final exata entre aspas e não invente palavras adicionais.",
  ].join("\n");
}

export const refinePostBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RefinePostInput.parse(input))
  .handler(async ({ data, context }) => {
    const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!encKey) throw integrationVaultFailure("encryption-key-missing:refine-post-runtime");

    const { data: integrations } = await context.supabase
      .from("integrations")
      .select("provider,status")
      .eq("workspace_id", data.workspaceId)
      .in("provider", ["openai", "gemini"]);
    const connected = new Set(
      ((integrations ?? []) as Array<{ provider: string; status: string }>)
        .filter((row) => row.status === "connected")
        .map((row) => row.provider),
    );
    const requested = data.targetTextProvider;
    const textProvider = requested && connected.has(requested)
      ? requested
      : connected.has("openai") ? "openai" : connected.has("gemini") ? "gemini" : null;
    if (!textProvider) throw new Error("Conecte sua API Key da OpenAI ou Gemini em Integrações para aprimorar o post.");

    const { data: secret, error: secretError } = await context.supabase.rpc("get_integration_secret", {
      _workspace_id: data.workspaceId,
      _provider: textProvider,
      _key: encKey,
    });
    if (secretError) throw integrationVaultFailure("get_integration_secret:refine-post-runtime", secretError.message);
    const key = (secret as { api_key?: string; apiKey?: string } | null)?.api_key
      ?? (secret as { api_key?: string; apiKey?: string } | null)?.apiKey;
    if (!key) throw new Error(`API Key de ${textProvider} não encontrada.`);

    const accountLanguage = await resolveAccountLanguage(
      context.supabase as unknown as { from: (table: string) => any },
      data.workspaceId,
      context.userId,
    );

    let brandContext = "Nenhuma marca selecionada. Não invente logo, identidade visual, cores ou memória visual de marca.";
    if (data.brandId) {
      const { data: brand, error: brandError } = await context.supabase
        .from("social_brand_context")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.brandId)
        .maybeSingle();
      if (brandError) throw new Error(brandError.message);
      if (brand) {
        const b = brand as Record<string, unknown>;
        brandContext = [
          `Nome: ${String(b.company_name ?? "N/A")}`,
          `Segmento: ${String(b.segment ?? "N/A")}`,
          `Estilo visual: ${String(b.visual_style ?? b.estilo_visual_desejado ?? "N/A")}`,
          `Cores: ${String(b.brand_colors ?? "N/A")}`,
          `Promessa: ${String(b.main_promise ?? b.promessa_principal ?? "N/A")}`,
          `Público: ${String(b.target_audience ?? "N/A")}`,
          `Memória visual: ${String(b.visual_memory ?? "N/A")}`,
          `Palavras proibidas: ${String(b.forbidden_words ?? "N/A")}`,
        ].join("\n");
      }
    }

    const slideCount = data.format === "carrossel" ? inferCarouselCount(data.briefing, data.slides) : 0;
    const isIdeogram = data.targetImageProvider === "ideogram";
    const providerRules = isIdeogram ? ideogramRules(accountLanguage.label) : otherProviderRules(accountLanguage.label);
    const carouselSchema = data.format === "carrossel"
      ? `,\n  "styleAnchor": "visual style anchor${isIdeogram ? " in English" : ""}",\n  "continuityAnchor": "continuity anchor${isIdeogram ? " in English" : ""}",\n  "revealRule": "reveal constraint or empty string",\n  "carouselSlides": [{"n":1,"storyBeat":"função narrativa no idioma da conta","text":"texto visível exato ou string vazia","imagePrompt":"prompt exclusivo do slide${isIdeogram ? " em inglês, mantendo texto visível original entre aspas" : ""}"}]`
      : "";
    const carouselRules = data.format === "carrossel" ? [
      `CARROSSEL: devolva EXATAMENTE ${slideCount} slides.`,
      "Cada slide tem um papel narrativo e um imagePrompt próprio; não gere N variações da mesma imagem.",
      "Preserve personagem, objetos, meio visual, paleta e continuidade entre os slides quando o briefing exigir.",
      "Não antecipe uma revelação reservada para o último slide.",
      `O campo text é a frase FINAL visível em ${accountLanguage.label}; se não houver texto, use string vazia.`,
      isIdeogram
        ? "Em cada imagePrompt, comece com Exact text to render: \"...\" quando text não estiver vazio; depois descreva em inglês natural a composição visual."
        : "Quando houver texto, repita a frase final exata entre aspas no imagePrompt.",
    ].join("\n") : "";

    const prompt = [
      "Você é diretor de arte e copywriter sênior de Social Media.",
      `A legenda, título, hashtags, comentário e toda copy destinada ao público devem ficar em ${accountLanguage.label} (${accountLanguage.locale}).`,
      "O pedido explícito do usuário é a fonte de verdade. Não troque o meio visual solicitado por fotografia ou por um estilo padrão.",
      `Campanha: ${data.campaignName ?? "(sem nome)"}. Objetivo: ${data.campaignObjective ?? "(não informado)"}.`,
      `MARCA OPCIONAL:\n${brandContext}`,
      data.audience ? `Público: ${data.audience}` : "",
      data.tone ? `Tom: ${data.tone}` : "",
      `Formato: ${data.format}`,
      `BRIEFING — FONTE DE VERDADE:\n"""${data.briefing}"""`,
      providerRules,
      carouselRules,
      "Retorne SOMENTE JSON válido:",
      `{\n  "refinedBriefing":"briefing executável no idioma da conta",\n  "imagePrompt":"${isIdeogram ? "direção visual em inglês natural; exact visible copy preservada no idioma original" : "prompt visual no idioma da conta"}",\n  "suggestedTitle":"máximo 60 caracteres",\n  "suggestedCaption":"legenda pronta",\n  "suggestedHashtags":["#tag1","#tag2","#tag3"],\n  "suggestedFirstComment":"comentário fixado"${carouselSchema}\n}`,
    ].filter(Boolean).join("\n\n");

    let raw = "{}";
    if (textProvider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.15,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      raw = json.choices?.[0]?.message?.content ?? "{}";
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.15 },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    }

    let aiResult: Record<string, unknown>;
    try {
      aiResult = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error("A IA de texto devolveu JSON inválido ao aprimorar o post.");
    }

    if (data.format === "carrossel") {
      const slides = Array.isArray(aiResult.carouselSlides)
        ? (aiResult.carouselSlides as Array<Record<string, unknown>>).slice(0, slideCount)
        : [];
      if (slides.length !== slideCount) throw new Error(`A IA devolveu ${slides.length} slides; o carrossel exige ${slideCount}.`);
      const emptyPromptIndex = slides.findIndex((slide) => typeof slide.imagePrompt !== "string" || !slide.imagePrompt.trim());
      if (emptyPromptIndex >= 0) throw new Error(`O slide ${emptyPromptIndex + 1} veio sem prompt visual.`);
      aiResult.imagePrompt = encodeCarouselWithFidelity({
        slides,
        briefing: data.briefing,
        styleAnchor: typeof aiResult.styleAnchor === "string" ? aiResult.styleAnchor : "",
        continuityAnchor: typeof aiResult.continuityAnchor === "string" ? aiResult.continuityAnchor : "",
        revealRule: typeof aiResult.revealRule === "string" ? aiResult.revealRule : "",
        // A IA já incorporou a marca no prompt visual. Evita despejar o bloco pt-BR antes do prompt Ideogram.
        brandAnchor: isIdeogram ? null : (data.brandId ? brandContext : null),
      });
    }

    return { ...aiResult, accountLanguage, carouselImages: [] as string[] };
  });
