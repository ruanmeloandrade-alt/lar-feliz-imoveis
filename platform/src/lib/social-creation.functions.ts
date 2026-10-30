import {resolveWorkspaceAiKey,type WorkspaceAiKey} from "./workspace-ai-key.server";
// Onda 2, Fluxo de criação em 3 camadas: Estratégia → Briefing → Prompt visual.
// Cada etapa usa o Contexto da Marca do workspace e valida antes de ir pra próxima.
// Client-safe: só server fns. Chama Lovable AI Gateway.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BRAND_FIELDS = [
  "company_name","segment","target_audience","products_services","differentials",
  "tone_of_voice","positioning","main_promise","audience_pains","audience_desires",
  "brand_colors","logo_url","visual_style","post_types","forbidden_words",
  "forbidden_themes","likes_examples","dislikes_examples","competitors_references",
  "instagram_goal","organic_traffic_goal",
] as const;

type BrandRow = Partial<Record<(typeof BRAND_FIELDS)[number], string | null>>;

function brandBlock(row: BrandRow | null): string {
  if (!row) {
    return "CONTEXTO DA MARCA: (vazio, peça ao usuário para preencher a aba 'Marca' para posts realmente personalizados).";
  }
  const lines: string[] = ["CONTEXTO DA MARCA:"];
  const labels: Record<(typeof BRAND_FIELDS)[number], string> = {
    company_name: "Empresa",
    segment: "Segmento",
    target_audience: "Público-alvo",
    products_services: "Produtos/Serviços",
    differentials: "Diferenciais",
    tone_of_voice: "Tom de voz",
    positioning: "Posicionamento",
    main_promise: "Promessa principal",
    audience_pains: "Dores do público",
    audience_desires: "Desejos do público",
    brand_colors: "Cores da marca",
    logo_url: "Logo (URL)",
    visual_style: "Estilo visual",
    post_types: "Tipos de post preferidos",
    forbidden_words: "Palavras proibidas",
    forbidden_themes: "Temas proibidos",
    likes_examples: "Referências que curte",
    dislikes_examples: "Referências que rejeita",
    competitors_references: "Concorrentes/referências",
    instagram_goal: "Objetivo Instagram",
    organic_traffic_goal: "Objetivo tráfego orgÃ¢nico",
  };
  for (const f of BRAND_FIELDS) {
    const v = row[f];
    if (v && String(v).trim()) lines.push(`- ${labels[f]}: ${String(v).trim()}`);
  }
  if (lines.length === 1) lines.push("(sem campos preenchidos)");
  return lines.join("\n");
}

async function loadBrand(supabase: unknown, workspaceId: string): Promise<BrandRow | null> {
  const client = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
  const { data } = await client
    .from("social_brand_context")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return (data ?? null) as BrandRow | null;
}

async function loadLearningSummary(supabase: unknown, workspaceId: string): Promise<string> {
  const client = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => {
          order: (c: string, o: { ascending: boolean; nullsFirst?: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };
  const { data } = await client.from("social_post_metrics")
    .select("post_id,channel,engagement_rate,reach,likes")
    .eq("workspace_id", workspaceId)
    .order("engagement_rate", { ascending: false, nullsFirst: false })
    .limit(10);
  const rows = (data ?? []) as Array<{ channel: string; engagement_rate: number | null; reach: number; likes: number }>;
  if (!rows.length) return "";
  const top = rows.slice(0, 3).map(r => `- canal ${r.channel} · eng ${r.engagement_rate ?? "?"}% · ${r.reach} alcance · ${r.likes} curt.`).join("\n");
  return `\nAPRENDIZADO DE POSTS ANTERIORES (top 3 por engajamento):\n${top}\nUse esse padrão como referência do que funciona para este workspace.`;
}



async function callGateway<T>(prompt: string, systemPrompt: string, provider: WorkspaceAiKey): Promise<T> {
  const key = provider.apiKey;
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha na IA (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content) as T; }
  catch { throw new Error("Resposta da IA não veio em JSON válido."); }
}

// ---------- 1) Estratégia ----------
export const generatePostStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    userRequest: z.string().min(3).max(2000),
    channel: z.enum(["ig_feed","ig_story","ig_reels","fb_feed"]).default("ig_feed"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const brand = await loadBrand(context.supabase, data.workspaceId);
    const learning = await loadLearningSummary(context.supabase, data.workspaceId);
    const system = [
      "Você é um estrategista sênior de social media e tráfego orgÃ¢nico.",
      "Você NÃO cria arte, NÃO escreve legenda ainda. Você define a estratégia do post.",
      "Nunca invente informação sobre a marca, use apenas o que estiver no CONTEXTO DA MARCA. Se faltar dado crítico, aponte no campo missing_info.",
      "Se houver APRENDIZADO DE POSTS ANTERIORES, dê preferência a formatos/-ngulos que já performaram bem.",
      "Responda SEMPRE em português do Brasil, JSON estrito, sem texto fora do JSON.",
    ].join("\n");
    const prompt = [
      brandBlock(brand),
      learning,
      "",
      `PEDIDO DO USUÁRIO: ${data.userRequest}`,
      `CANAL ALVO: ${data.channel}`,
      "",
      "Retorne JSON com o schema:",
      "{",
      '  "objective": string,           // ex: gerar autoridade, vender X, engajar, educar, lançar',
      '  "audience": string,            // segmento e recorte específico deste post',
      '  "format": string,              // single, carrossel, reels, story',
      '  "angle": string,               // -ngulo/gancho estratégico',
      '  "pillars": string[],           // 1 a 3 pilares de conteúdo tocados',
      '  "hook_ideas": string[],        // 3 ganchos possíveis (frase curta, forte)',
      '  "why_it_works": string,        // 1-2 frases justificando estratégia',
      '  "missing_info": string[]       // dados da marca que faltaram e ajudariam',
      "}",
    ].join("\n");
    const strategy = await callGateway<{
      objective: string; audience: string; format: string; angle: string;
      pillars: string[]; hook_ideas: string[]; why_it_works: string; missing_info: string[];
    }>(prompt, system, await resolveWorkspaceAiKey(context.supabase, data.workspaceId));
    return { strategy };
  });

// ---------- 2) Briefing / Legenda ----------
export const generatePostBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    userRequest: z.string().max(2000).optional().default(""),
    strategy: z.object({
      objective: z.string(),
      audience: z.string(),
      format: z.string(),
      angle: z.string(),
      pillars: z.array(z.string()).default([]),
      hook_ideas: z.array(z.string()).default([]),
      why_it_works: z.string().optional().default(""),
    }),
    channel: z.enum(["ig_feed","ig_story","ig_reels","fb_feed"]).default("ig_feed"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const brand = await loadBrand(context.supabase, data.workspaceId);
    const system = [
      "Você é copywriter sênior de social media focado em conversão e retenção.",
      "Respeite RIGOROSAMENTE o tom de voz, palavras/temas proibidos e posicionamento do CONTEXTO DA MARCA.",
      "Nunca invente números, promessas ou funcionalidades que não estão no contexto.",
      "Responda SEMPRE em português do Brasil, JSON estrito, sem texto fora do JSON.",
    ].join("\n");
    const prompt = [
      brandBlock(brand),
      "",
      `PEDIDO ORIGINAL: ${data.userRequest || "(não informado)"}`,
      `ESTRATÉGIA APROVADA: ${JSON.stringify(data.strategy)}`,
      `CANAL ALVO: ${data.channel}`,
      "",
      "Retorne JSON com o schema:",
      "{",
      '  "hook": string,           // 1ª linha, máximo 90 caracteres, para o feed',
      '  "body": string,           // corpo da legenda, parágrafos curtos, quebra de linha \\n\\n',
      '  "cta": string,            // call to action único e claro',
      '  "caption": string,        // legenda final montada (hook + body + cta)',
      '  "hashtags": string[],     // 6 a 12 hashtags relevantes, sem #',
      '  "first_comment": string   // texto sugerido de primeiro comentário',
      "}",
      "REGRAS: legenda total ≤ 2000 caracteres. Não use emoji em excesso. Não prometa nada que não esteja no contexto.",
    ].join("\n");
    const briefing = await callGateway<{
      hook: string; body: string; cta: string; caption: string;
      hashtags: string[]; first_comment: string;
    }>(prompt, system, await resolveWorkspaceAiKey(context.supabase, data.workspaceId));
    // normaliza hashtags com #
    briefing.hashtags = (briefing.hashtags ?? []).map((h) => {
      const t = String(h).trim().replace(/^#+/, "");
      return t ? `#${t}` : "";
    }).filter(Boolean).slice(0, 15);
    return { briefing };
  });

// ---------- 3) Prompt visual ----------
export const generateVisualPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    userRequest: z.string().max(2000).optional().default(""),
    strategy: z.object({
      objective: z.string(),
      audience: z.string(),
      format: z.string(),
      angle: z.string(),
    }).passthrough(),
    briefing: z.object({
      hook: z.string(),
      caption: z.string().optional().default(""),
    }).passthrough(),
    userNotes: z.string().max(1000).optional().default(""),
    channel: z.enum(["ig_feed","ig_story","ig_reels","fb_feed"]).default("ig_feed"),
    provider: z.enum(["gemini","ideogram","recraft","freepik"]).default("freepik"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const brand = await loadBrand(context.supabase, data.workspaceId);
    // Onda 3, memória visual + até 6 análises de referências ativas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: refRows } = await sb.from("social_brand_references")
      .select("label,analysis,is_active,status")
      .eq("workspace_id", data.workspaceId)
      .eq("is_active", true)
      .eq("status", "ready")
      .limit(6);
    const refs = (refRows ?? []) as Array<{ label: string | null; analysis: unknown }>;
    const visualMemory = (brand as { visual_memory?: string | null } | null)?.visual_memory ?? null;
    const aspectByChannel: Record<string, string> = {
      ig_feed: "4:5 vertical", ig_story: "9:16 vertical",
      ig_reels: "9:16 vertical", fb_feed: "1:1 square",
    };
    const system = [
      "Você é diretor de arte de social media. Sua única saída é um prompt visual detalhado em INGLÊS para um gerador de imagem.",
      "Respeite paleta, estilo visual, tom e restrições do CONTEXTO DA MARCA.",
      "Nunca peça texto complexo dentro da imagem se não vier explicitamente no pedido, modelos erram texto longo.",
      "Responda SEMPRE em JSON estrito, sem texto fora do JSON.",
    ].join("\n");
    const prompt = [
      brandBlock(brand),
      "",
      visualMemory ? `MEMÓRIA VISUAL DA MARCA (consolidado das referências ativas):\n${visualMemory}` : "MEMÓRIA VISUAL DA MARCA: (vazia)",
      refs.length ? `\nREFERÊNCIAS VISUAIS ATIVAS (${refs.length}):\n${JSON.stringify(refs.map(r => ({ label: r.label, analysis: r.analysis })))}` : "",
      "",
      `PEDIDO ORIGINAL: ${data.userRequest || "(não informado)"}`,
      `ESTRATÉGIA: ${JSON.stringify(data.strategy)}`,
      `HOOK/LEGENDA (referência de tema): ${data.briefing.hook}, ${data.briefing.caption.slice(0, 300)}`,
      `NOTAS EXTRAS DO USUÁRIO: ${data.userNotes || "(nenhuma)"}`,
      `FORMATO ALVO: ${aspectByChannel[data.channel]}, canal ${data.channel}`,
      `MODELO DE IMAGEM: ${({
        gemini: "Gemini Nano Banana (evitar texto longo)",
        ideogram: "Ideogram v2 (excelente com texto/tipografia e anúncios)",
        recraft: "Recraft v3 (foco em design gráfico, ilustração e branding consistente)",
        freepik: "Freepik Flux (fotorrealismo publicitário e cenas naturais)",
      } as Record<string,string>)[data.provider] ?? "Freepik Flux"}`,
      "",
      "IMPORTANTE: o final_prompt deve refletir estilo, paleta, tipografia, composição e mood presentes na MEMÓRIA VISUAL e nas REFERÊNCIAS ATIVAS quando existirem, mantendo consistência de marca entre posts.",
      "",
      "Retorne JSON com o schema:",
      "{",
      '  "creative_direction": string,   // 2-3 frases descrevendo direção criativa em pt-BR',
      '  "composition": string,          // enquadramento/composição em pt-BR',
      '  "palette": string,              // paleta baseada nas cores da marca em pt-BR',
      '  "mood": string,                 // mood/atmosfera em pt-BR',
      '  "on_image_text": string,        // texto que deve aparecer na imagem (curto) ou "" se nenhum',
      '  "final_prompt": string,         // PROMPT FINAL em INGLÊS, denso, pronto pra enviar ao modelo de imagem, incluindo aspect ratio',
      '  "negative": string              // o que evitar (opcional)',
      "}",
    ].join("\n");
    const visual = await callGateway<{
      creative_direction: string; composition: string; palette: string;
      mood: string; on_image_text: string; final_prompt: string; negative: string;
    }>(prompt, system, await resolveWorkspaceAiKey(context.supabase, data.workspaceId));
    return { visual };
  });
