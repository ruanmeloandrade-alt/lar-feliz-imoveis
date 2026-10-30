const START = "<<<MKTON_CAROUSEL_SLIDE_";
const END = "<<<END_MKTON_CAROUSEL_SLIDE>>>";

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function explicitVisualStyleGuard(briefing: string): string {
  const text = normalized(briefing);
  if (/revista em quadrinhos|historia em quadrinhos|quadrinhos|comic book|hq\b/.test(text)) {
    return [
      "MEIO VISUAL INEGOCIÁVEL: REVISTA EM QUADRINHOS / HQ.",
      "Renderize como ilustração de história em quadrinhos: line art/tinta visível, contornos desenhados, cores gráficas, linguagem de painéis, enquadramentos narrativos e acabamento editorial de comic book.",
      "PROIBIDO transformar a cena em fotografia, foto publicitária, still cinematográfico fotorealista, pessoa fotografada ou render humano realista.",
      "Mesmo quando o cenário for real (cidade, escritório, bicicleta), tudo deve permanecer desenhado/ilustrado no mesmo universo de quadrinhos.",
    ].join("\n");
  }
  if (/aquarela|watercolor/.test(text)) return "MEIO VISUAL INEGOCIÁVEL: aquarela. Preserve textura de papel, pigmento e pinceladas; não converta para fotografia ou 3D.";
  if (/anime|manga/.test(text)) return "MEIO VISUAL INEGOCIÁVEL: ilustração anime/mangá. Preserve linguagem gráfica e desenho; não converta para fotografia.";
  if (/colagem|collage/.test(text)) return "MEIO VISUAL INEGOCIÁVEL: colagem editorial. Preserve recortes, sobreposições e linguagem gráfica; não converta para fotografia convencional.";
  if (/3d|tridimensional/.test(text)) return "MEIO VISUAL INEGOCIÁVEL: composição 3D conforme pedido. Não substitua por fotografia ou ilustração 2D genérica.";
  if (/ilustracao|illustration|desenho/.test(text)) return "MEIO VISUAL INEGOCIÁVEL: ilustração/desenho conforme pedido. Não converta para fotografia nem fotorealismo.";
  return "FIDELIDADE DE ESTILO: qualquer meio, técnica, estética ou formato visual explicitamente pedido no briefing é obrigatório e tem prioridade sobre defaults genéricos do gerador.";
}

export function inferCarouselCount(briefing: string, explicit?: number | null): number {
  if (Number.isFinite(explicit) && Number(explicit) >= 2) return Math.max(2, Math.min(20, Math.floor(Number(explicit))));
  const text = normalized(briefing);
  const patterns = [
    /(?:preciso de|crie|criar|quero)\s+(\d{1,2})\s+(?:criativos|slides|quadros|imagens|artes)/,
    /(\d{1,2})\s+(?:criativos|slides|quadros|imagens|artes)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = Number(match?.[1]);
    if (Number.isFinite(value) && value >= 2 && value <= 20) return value;
  }
  return 6;
}

export function hasFinalRevealIntent(briefing: string): boolean {
  const text = normalized(briefing);
  const finalCue = /no final|no ultimo|ultimo quadro|ultimo slide|final do carrossel/.test(text);
  const surpriseCue = /surpresa|revel|nem sabia|so no final|conclusao/.test(text);
  return finalCue && surpriseCue;
}

function briefingWithoutFinalReveal(briefing: string): string {
  if (!hasFinalRevealIntent(briefing)) return briefing.trim();
  const pieces = briefing
    .split(/(?<=[.!?])\s+|\n+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const kept = pieces.filter((piece) => {
    const text = normalized(piece);
    return !/(no final|no ultimo|ultimo quadro|ultimo slide|final do carrossel|surpresa|nem sabia|revel|conclusao)/.test(text);
  });
  return kept.join(" ").trim() || "Preserve a premissa, o protagonista e a aventura descritos no briefing, sem antecipar a revelação final.";
}

export function revealGuardForSlide(briefing: string, index: number, total: number, revealRule?: string | null): string {
  if (!hasFinalRevealIntent(briefing) && !revealRule?.trim()) return "";
  if (index < total - 1) {
    return [
      "REGRA DE STORYTELLING: ESTE NÃO É O SLIDE FINAL.",
      "Não antecipe, não explique e não mostre visualmente a revelação reservada para o último slide.",
      revealRule?.trim() ? `Segredo narrativo a preservar: ${revealRule.trim()}` : "Preserve o segredo narrativo descrito no briefing.",
    ].join("\n");
  }
  return [
    "REGRA DE STORYTELLING: ESTE É O SLIDE FINAL.",
    "Execute agora a revelação/conclusão pedida no briefing de forma clara e surpreendente, conectando retrospectivamente os slides anteriores.",
    revealRule?.trim() ? `Revelação a concluir: ${revealRule.trim()}` : "Conclua exatamente a surpresa descrita no briefing.",
  ].join("\n");
}

export function directCarouselPrompt(briefing: string, index: number, total: number): string {
  const isFinal = index === total - 1;
  const roles = index === 0
    ? "ABERTURA: apresente protagonista e situação com força visual, sem explicar a conclusão da história."
    : isFinal
      ? "DESFECHO: conclua a história e execute a revelação final pedida no briefing."
      : index === total - 2
        ? "DESENVOLVIMENTO/CLÍMAX: avance a aventura e aumente a curiosidade, mas preserve a revelação final."
        : "DESENVOLVIMENTO: crie um novo acontecimento conectado ao anterior e mantenha a curiosidade.";
  const visibleBriefing = isFinal ? briefing.trim() : briefingWithoutFinalReveal(briefing);
  return [
    "CARROSSEL NARRATIVO — GERAÇÃO DE UM ÚNICO SLIDE.",
    explicitVisualStyleGuard(briefing),
    "CONTINUIDADE OBRIGATÓRIA: mantenha o mesmo protagonista, identidade, roupa, objetos recorrentes e universo visual descritos no briefing em todos os slides.",
    revealGuardForSlide(briefing, index, total),
    `SLIDE ${index + 1} DE ${total}. ${roles}`,
    isFinal ? "BRIEFING COMPLETO — AGORA EXECUTE A REVELAÇÃO:" : "BRIEFING VISÍVEL NESTA ETAPA — SEM A REVELAÇÃO FINAL:",
    visibleBriefing,
    "Não tente representar os outros slides dentro desta imagem. Gere somente a cena correspondente a este slide da sequência.",
  ].filter(Boolean).join("\n\n");
}

export function encodeCarouselWithFidelity(args: {
  slides: Array<Record<string, unknown>>;
  briefing: string;
  styleAnchor?: string | null;
  continuityAnchor?: string | null;
  revealRule?: string | null;
  brandAnchor?: string | null;
}): string {
  const styleGuard = explicitVisualStyleGuard(args.briefing);
  const total = args.slides.length;
  return args.slides
    .map((slide, index) => {
      const n = typeof slide.n === "number" ? slide.n : index + 1;
      const localPrompt = typeof slide.imagePrompt === "string" ? slide.imagePrompt.trim() : "";
      const storyBeat = typeof slide.storyBeat === "string" ? slide.storyBeat.trim() : "";
      const blocks = [
        "CONTRATO GLOBAL DO CARROSSEL — OBRIGATÓRIO:",
        styleGuard,
        args.styleAnchor?.trim() ? `ÂNCORA DE ESTILO: ${args.styleAnchor.trim()}` : "",
        args.continuityAnchor?.trim()
          ? `CONTINUIDADE VISUAL: ${args.continuityAnchor.trim()}`
          : "CONTINUIDADE VISUAL: mantenha o mesmo protagonista, características, roupa, objetos recorrentes e universo visual ao longo do carrossel, salvo mudança explicitamente pedida.",
        args.brandAnchor?.trim() ? `MARCA — OBRIGATÓRIO: ${args.brandAnchor.trim()}` : "",
        revealGuardForSlide(args.briefing, index, total, args.revealRule),
        `SLIDE ${index + 1} DE ${total}:`,
        storyBeat ? `PAPEL NA HISTÓRIA: ${storyBeat}` : "",
        localPrompt,
      ].filter(Boolean);
      return `${START}${n}>>>\n${blocks.join("\n\n")}\n${END}`;
    })
    .join("\n\n");
}
