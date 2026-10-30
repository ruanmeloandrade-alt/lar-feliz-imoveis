import { describe, expect, it } from "vitest";
import { extractExactImageTexts, parseCarouselPrompts, prepareIdeogramPrompt } from "./social-image-prompt";

const USER_CAROUSEL = `Criar um carrossel impactante em formato de quadrinhos, utilizando cores vibrantes como vermelho, amarelo e azul.

**Slide 1:**
- **Assunto:** Capa do carrossel.
- **Texto:** "Você está deixando dinheiro na mesa?"

**Slide 2:**
- **Assunto:** Dinheiro sendo desperdiçado.
- **Texto:** "Você pode estar perdendo milhares!"

**Slide 3:**
- **Texto:** "A IA pode mudar seu jogo!"

**Slide 4:**
- **Texto:** "Não deixe a concorrência levar sua fatia!"

**Slide 5:**
- **Texto:** "A diferença é clara!"

**Slide 6:**
- **Texto:** "Invista em inovação!"

**Slide 7:**
- **Texto:** "Descubra o que você está perdendo!"

**Slide 8:**
- **Texto:** "Transforme sua estratégia agora!"`;

describe("social image prompt normalization", () => {
  it("separa o carrossel markdown real em oito prompts independentes", () => {
    const prompts = parseCarouselPrompts(USER_CAROUSEL);
    expect(prompts).toHaveLength(8);
    expect(prompts[0]).toContain('"Você está deixando dinheiro na mesa?"');
    expect(prompts[0]).not.toContain('"Você pode estar perdendo milhares!"');
    expect(prompts[7]).toContain('"Transforme sua estratégia agora!"');
  });

  it("extrai um único texto literal por slide com bullet + markdown", () => {
    const prompts = parseCarouselPrompts(USER_CAROUSEL);
    expect(prompts.map(extractExactImageTexts)).toEqual([
      ["Você está deixando dinheiro na mesa?"],
      ["Você pode estar perdendo milhares!"],
      ["A IA pode mudar seu jogo!"],
      ["Não deixe a concorrência levar sua fatia!"],
      ["A diferença é clara!"],
      ["Invista em inovação!"],
      ["Descubra o que você está perdendo!"],
      ["Transforme sua estratégia agora!"],
    ]);
  });

  it("desliga Magic Prompt e usa DESIGN quando há texto exato", () => {
    const [slide] = parseCarouselPrompts(USER_CAROUSEL);
    const plan = prepareIdeogramPrompt(slide);
    expect(plan.magicPrompt).toBe("OFF");
    expect(plan.styleType).toBe("DESIGN");
    expect(plan.exactTexts).toEqual(["Você está deixando dinheiro na mesa?"]);
    expect(plan.prompt.startsWith('O único texto visível na arte deve ser exatamente: "Você está deixando dinheiro na mesa?".')).toBe(true);
    expect(plan.negativePrompt).toContain("palavras inventadas");
    expect(plan.negativePrompt).toContain("pseudo-texto");
  });

  it("mantém AUTO quando a arte não pede texto literal", () => {
    const plan = prepareIdeogramPrompt("Fotografia de uma equipe em um escritório moderno.");
    expect(plan.magicPrompt).toBe("AUTO");
    expect(plan.styleType).toBe("AUTO");
    expect(plan.exactTexts).toEqual([]);
  });
});
