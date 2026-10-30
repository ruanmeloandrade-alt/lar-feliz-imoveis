import { describe, expect, it } from "vitest";
import {
  directCarouselPrompt,
  encodeCarouselWithFidelity,
  explicitVisualStyleGuard,
  hasFinalRevealIntent,
  inferCarouselCount,
} from "./social-style-fidelity";

const BRIEFING = "Crie um carrossel em formato de revista em quadrinhos, apresentando um ciclista andando pela cidade em várias aventuras. No final do carrossel, mostra um quadrinho do escritório dele rodando o funil de vendas automático, dando a sensação de que nosso sistema vende automaticamente e dá liberdade para o empresário. Preciso de 4 criativos, todos com storytelling conversando entre si. O último chega nessa conclusão. O objetivo é quando rolar para o último quadro a pessoa ter uma surpresa pois nem sabia que o carrossel todo falava sobre automações e funis de venda.";

describe("social style fidelity", () => {
  it("transforma revista em quadrinhos em restrição explícita anti-fotografia", () => {
    const guard = explicitVisualStyleGuard(BRIEFING);
    expect(guard).toContain("REVISTA EM QUADRINHOS / HQ");
    expect(guard).toContain("PROIBIDO");
    expect(guard.toLowerCase()).toContain("fotografia");
  });

  it("infere os 4 criativos do briefing quando a UI não envia slides ao refinador", () => {
    expect(inferCarouselCount(BRIEFING, null)).toBe(4);
    expect(inferCarouselCount(BRIEFING, 7)).toBe(7);
  });

  it("detecta intenção de surpresa apenas no final", () => {
    expect(hasFinalRevealIntent(BRIEFING)).toBe(true);
  });

  it("cria prompts independentes também quando o usuário gera o carrossel diretamente", () => {
    const prompts = Array.from({ length: 4 }, (_, index) => directCarouselPrompt(BRIEFING, index, 4));
    expect(prompts).toHaveLength(4);
    prompts.forEach((prompt) => expect(prompt).toContain("REVISTA EM QUADRINHOS / HQ"));
    expect(prompts[0]).toContain("ESTE NÃO É O SLIDE FINAL");
    expect(prompts[2]).toContain("ESTE NÃO É O SLIDE FINAL");
    expect(prompts[3]).toContain("ESTE É O SLIDE FINAL");
    expect(prompts[3]).toContain("DESFECHO");
    expect(prompts[0]).toContain("Gere somente a cena correspondente a este slide da sequência");
  });

  it("injeta estilo, continuidade, marca e regra de revelação em todos os quatro slides refinados", () => {
    const encoded = encodeCarouselWithFidelity({
      briefing: BRIEFING,
      styleAnchor: "HQ urbana vibrante, line art preto, cores chapadas e retícula editorial.",
      continuityAnchor: "Mesmo ciclista, mesma bicicleta azul e mesma roupa ao longo dos 4 quadros.",
      revealRule: "Somente no slide 4 revelar que a liberdade existe porque o escritório roda automações e funil de vendas sozinho.",
      brandAnchor: "Preservar paleta e memória visual da marca selecionada sem trocar o meio de quadrinhos.",
      slides: [
        { n: 1, storyBeat: "Sai pedalando pela cidade", imagePrompt: "Ciclista iniciando a aventura." },
        { n: 2, storyBeat: "Explora a cidade", imagePrompt: "Ciclista atravessando uma praça." },
        { n: 3, storyBeat: "Aproveita a liberdade", imagePrompt: "Ciclista em um mirante urbano." },
        { n: 4, storyBeat: "Revelação", imagePrompt: "Escritório do ciclista com funil de vendas automático rodando." },
      ],
    });
    const slides = encoded.split("<<<END_MKTON_CAROUSEL_SLIDE>>>").filter(Boolean);
    expect(slides).toHaveLength(4);
    for (const slide of slides) {
      expect(slide).toContain("REVISTA EM QUADRINHOS / HQ");
      expect(slide).toContain("Mesmo ciclista, mesma bicicleta azul e mesma roupa");
      expect(slide).toContain("MARCA — OBRIGATÓRIO");
    }
    expect(slides[0]).toContain("ESTE NÃO É O SLIDE FINAL");
    expect(slides[1]).toContain("ESTE NÃO É O SLIDE FINAL");
    expect(slides[2]).toContain("ESTE NÃO É O SLIDE FINAL");
    expect(slides[3]).toContain("ESTE É O SLIDE FINAL");
    expect(slides[0]).not.toContain("Escritório do ciclista com funil de vendas automático rodando");
    expect(slides[3]).toContain("Escritório do ciclista com funil de vendas automático rodando");
  });
});
