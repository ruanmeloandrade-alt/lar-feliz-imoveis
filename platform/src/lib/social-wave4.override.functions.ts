// Overrides focused on the Social Media campaign authoring flow.
// The remaining wave-4 exports continue to come from the legacy module.
export * from "./social-wave4.functions";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { integrationVaultFailure } from "@/lib/integration-vault";
import {
  encodeCarouselWithFidelity,
  explicitVisualStyleGuard,
  inferCarouselCount,
} from "@/lib/social-style-fidelity";

const RefinePostInput = z.object({
  workspaceId: z.string().uuid(),
  briefing: z.string().min(3).max(4000),
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
    (profile as { country?: string | null } | null)?.country ??
      (workspace as { address_country?: string | null } | null)?.address_country,
  );
  if (!country || ["br", "bra", "brasil", "brazil"].includes(country)) {
    return { label: "português do Brasil", locale: "pt-BR" };
  }
  if (["pt", "prt", "portugal"].includes(country)) {
    return { label: "português de Portugal", locale: "pt-PT" };
  }
  const spanishCountries = [
    "es", "esp", "espanha", "spain", "mexico", "argentina", "chile", "colombia",
    "peru", "uruguay", "paraguay", "bolivia", "ecuador", "venezuela", "costa rica", "panama",
    "guatemala", "honduras", "el salvador", "nicaragua", "republica dominicana", "cuba",
  ];
  if (spanishCountries.includes(country)) return { label: "espanhol", locale: "es" };
  return { label: "idioma principal da conta", locale: "auto" };
}

function imageProviderGuidelines(provider: string | null | undefined, language: string): string {
  const exactText =
    `TEXTO NA ARTE: qualquer palavra visível deve estar em ${language}. Escreva no prompt a frase FINAL e EXATA entre aspas duplas. ` +
    "O gerador não pode inventar palavras, traduzir, substituir, duplicar, sobrepor ou acrescentar texto que não esteja explicitamente entre aspas. " +
    "Use pouco texto por imagem, com área limpa, contraste forte, hierarquia clara e espaço suficiente para não haver palavras uma em cima da outra.";
  if (provider === "ideogram") {
    return [
      "DIRETRIZES IDEOGRAM V3:",
      exactText,
      "DIREÇÃO DE ARTE: descreva uma cena concreta e específica; sujeito principal, ação, cenário, primeiro e segundo plano, enquadramento, posição dos elementos, tipografia, materiais, iluminação e paleta.",
      "ANTI-GENÉRICO: não use apenas termos vazios como arte moderna, premium, profissional, 8k ou cinematic. Explique visualmente o que torna a composição distinta.",
      "FIDELIDADE: o prompt inteiro deve permanecer no idioma da conta. Não converta o prompt para inglês.",
    ].join("\n");
  }
  return [
    exactText,
    "DIREÇÃO DE ARTE: detalhe composição, cenário, sujeito, ação, hierarquia, paleta, luz, materiais, enquadramento e restrições; evite templates e instruções vagas.",
    `O prompt inteiro deve ser escrito em ${language}.`,
  ].join("\n");
}

export const refinePostBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RefinePostInput.parse(input))
  .handler(async ({ data, context }) => {
    const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!encKey) throw integrationVaultFailure("encryption-key-missing:refine-post");

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
      : connected.has("openai")
        ? "openai"
        : connected.has("gemini")
          ? "gemini"
          : null;
    if (!textProvider) {
      throw new Error("Conecte sua API Key da OpenAI ou Gemini em Integrações para gerar legendas, tags e prompts.");
    }

    const { data: secret, error: secretError } = await context.supabase.rpc(
      "get_integration_secret",
      { _workspace_id: data.workspaceId, _provider: textProvider, _key: encKey },
    );
    if (secretError) throw integrationVaultFailure("get_integration_secret:refine-post", secretError.message);
    const key =
      (secret as { api_key?: string; apiKey?: string } | null)?.api_key ??
      (secret as { api_key?: string; apiKey?: string } | null)?.apiKey;
    if (!key) throw new Error(`API Key de ${textProvider} não encontrada.`);

    const accountLanguage = await resolveAccountLanguage(
      context.supabase as unknown as { from: (table: string) => any },
      data.workspaceId,
      context.userId,
    );

    let brandContext = "SEM REFERÊNCIA DE MARCA. Não use automaticamente identidade, logo, cores ou memória visual salvos no workspace.";
    if (data.brandId) {
      const { data: brand } = await context.supabase
        .from("social_brand_context")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.brandId)
        .maybeSingle();
      if (brand) {
        const b = brand as Record<string, unknown>;
        brandContext = [
          "REFERÊNCIA DA MARCA SELECIONADA — OBRIGATÓRIA:",
          `- Nome: ${String(b.company_name ?? "N/A")}`,
          `- Segmento: ${String(b.segment ?? "N/A")}`,
          `- Estilo visual: ${String(b.visual_style ?? b.estilo_visual_desejado ?? "N/A")}`,
          `- Cores: ${String(b.brand_colors ?? "N/A")}`,
          `- Promessa: ${String(b.main_promise ?? b.promessa_principal ?? "N/A")}`,
          `- Público: ${String(b.target_audience ?? "N/A")}`,
          `- Memória visual: ${String(b.visual_memory ?? "N/A")}`,
          `- Palavras proibidas: ${Array.isArray(b.palavras_proibidas) ? b.palavras_proibidas.join(", ") : String(b.forbidden_words ?? "N/A")}`,
        ].join("\n");

        const { data: refs } = await context.supabase
          .from("social_brand_references")
          .select("label,analysis,sentiment")
          .eq("workspace_id", data.workspaceId)
          .eq("is_active", true)
          .eq("status", "ready");
        if (refs?.length) {
          const referenceSummary = (refs as Array<{ label?: string | null; analysis?: unknown; sentiment?: string | null }>)
            .slice(0, 12)
            .map((ref, index) => `${index + 1}. ${ref.sentiment === "dislike" ? "EVITAR" : "REFERÊNCIA"}: ${ref.label ?? "sem nome"}${ref.analysis ? ` — ${JSON.stringify(ref.analysis).slice(0, 700)}` : ""}`)
            .join("\n");
          brandContext += `\nREFERÊNCIAS VISUAIS ATIVAS:\n${referenceSummary}`;
        }
      }
    }

    const slideCount = data.format === "carrossel" ? inferCarouselCount(data.briefing, data.slides) : 0;
    const imageRules = imageProviderGuidelines(data.targetImageProvider, accountLanguage.label);
    const deterministicStyleGuard = explicitVisualStyleGuard(data.briefing);
    const carouselSchema = data.format === "carrossel"
      ? `,\n  "styleAnchor": "contrato visual global obrigatório extraído do briefing",\n  "continuityAnchor": "descrição concreta do que deve permanecer igual entre os slides",\n  "revealRule": "se houver surpresa final, descreva o que deve ficar oculto antes do último slide e o que o último revela; senão string vazia",\n  "carouselSlides": [{"n":1,"storyBeat":"papel deste slide na história","text":"texto exato do slide ou string vazia","imagePrompt":"prompt visual completo e exclusivo deste slide"}]`
      : "";
    const carouselRules = data.format === "carrossel"
      ? [
          `CARROSSEL OBRIGATÓRIO: devolva EXATAMENTE ${slideCount} itens em carouselSlides.`,
          "O briefing do usuário é fonte de verdade. Meio visual, técnica, estética, personagens, objetos recorrentes, sequência narrativa e surpresa final são REQUISITOS, não sugestões.",
          deterministicStyleGuard,
          "styleAnchor deve preservar literalmente o meio visual pedido. Exemplo: se o usuário disser revista em quadrinhos/HQ, TODOS os slides são ilustração de quadrinhos e NENHUM pode virar fotografia/fotorealismo.",
          "continuityAnchor deve fixar identidade do protagonista, aparência, roupa, objetos recorrentes e linguagem visual para que pareça a mesma história, não quatro imagens aleatórias.",
          "Cada slide precisa ter imagePrompt próprio. Não repita o mesmo prompt base, mas repita dentro dele as restrições globais indispensáveis de estilo e continuidade.",
          "Se o briefing pedir surpresa/revelação no último slide, preserve o segredo: slides anteriores NÃO podem citar, explicar ou mostrar visualmente o elemento reservado para o final. O último slide executa a revelação e faz os anteriores ganharem novo sentido.",
          "A estrutura genérica capa/desenvolvimento/CTA NÃO pode substituir a narrativa específica pedida pelo usuário.",
          "O campo storyBeat descreve a função narrativa exata daquele slide.",
          "O campo text é a frase FINAL que deve aparecer na imagem; se o briefing não pedir texto, use string vazia. Nunca invente texto apenas para preencher a arte.",
          "Quando houver texto, o imagePrompt deve repetir a frase final entre aspas e proibir qualquer outro texto visível.",
          "Mantenha unidade visual entre slides, variando cena, ação, composição e enquadramento dentro do mesmo universo visual.",
        ].join("\n")
      : deterministicStyleGuard;

    const prompt = [
      "Você é diretor de arte, roteirista visual e copywriter sênior de Social Media.",
      `IDIOMA OBRIGATÓRIO DA CONTA: ${accountLanguage.label} (${accountLanguage.locale}).`,
      "Toda a resposta, legenda, títulos, textos visíveis e prompts de imagem devem permanecer nesse idioma. Não traduza prompts visuais para inglês.",
      "PRIORIDADE DE FIDELIDADE: siga primeiro o pedido explícito do usuário; depois preserve marca/referências; só então complemente detalhes que não foram definidos. Nunca troque o meio visual pedido por um default do gerador.",
      `Campanha: ${data.campaignName ?? "(sem nome)"}. Objetivo: ${data.campaignObjective ?? "(não informado)"}.`,
      brandContext,
      data.audience ? `Público-alvo: ${data.audience}.` : "",
      data.tone ? `Tom de voz: ${data.tone}.` : "",
      `Formato do post: ${data.format}.`,
      `Briefing bruto — FONTE DE VERDADE:\n"""${data.briefing}"""`,
      imageRules,
      carouselRules,
      "",
      "Devolva SOMENTE JSON válido no formato:",
      `{`,
      `  "refinedBriefing": "briefing específico, executável, fiel ao meio visual e à narrativa pedidos",`,
      `  "imagePrompt": "prompt visual completo no idioma da conta; preserve literalmente o estilo pedido; se houver texto visível, informe SOMENTE o texto final exato entre aspas",`,
      `  "suggestedTitle": "título curto para calendário, máximo 60 caracteres",`,
      `  "suggestedCaption": "legenda pronta no idioma da conta com gancho, desenvolvimento e CTA",`,
      `  "suggestedHashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],`,
      `  "suggestedFirstComment": "primeiro comentário fixado com reforço do CTA"${carouselSchema}`,
      `}`,
      "",
      "NÃO invente palavras para a arte. NÃO misture idiomas. NÃO peça ao gerador para decidir o texto. NÃO transforme ilustração/quadrinhos/anime/aquarela/colagem em fotografia quando o usuário pediu aquele meio visual.",
    ].filter(Boolean).join("\n");

    let raw = "{}";
    if (textProvider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      raw = json.choices?.[0]?.message?.content ?? "{}";
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    }

    const aiResult = JSON.parse(raw) as Record<string, unknown>;
    if (data.format === "carrossel") {
      const slides = Array.isArray(aiResult.carouselSlides)
        ? (aiResult.carouselSlides as Array<Record<string, unknown>>).slice(0, slideCount)
        : [];
      if (slides.length !== slideCount) {
        throw new Error(`A IA devolveu ${slides.length} slides, mas este carrossel exige ${slideCount}. Tente aprimorar novamente.`);
      }
      const emptyPromptIndex = slides.findIndex((slide) => typeof slide.imagePrompt !== "string" || !slide.imagePrompt.trim());
      if (emptyPromptIndex >= 0) throw new Error(`O slide ${emptyPromptIndex + 1} veio sem prompt visual. Tente aprimorar novamente.`);

      const styleAnchor = typeof aiResult.styleAnchor === "string" ? aiResult.styleAnchor : "";
      const continuityAnchor = typeof aiResult.continuityAnchor === "string" ? aiResult.continuityAnchor : "";
      const revealRule = typeof aiResult.revealRule === "string" ? aiResult.revealRule : "";
      aiResult.imagePrompt = encodeCarouselWithFidelity({
        slides,
        briefing: data.briefing,
        styleAnchor,
        continuityAnchor,
        revealRule,
        brandAnchor: data.brandId ? brandContext : null,
      });
    } else {
      aiResult.imagePrompt = [
        deterministicStyleGuard,
        data.brandId ? brandContext : "",
        typeof aiResult.imagePrompt === "string" ? aiResult.imagePrompt : "",
      ].filter(Boolean).join("\n\n");
    }
    return { ...aiResult, accountLanguage, carouselImages: [] as string[] };
  });