import { describe, expect, it } from "vitest";

const RE = /<<<MKTON_CAROUSEL_SLIDE_(\d+)>>>\s*([\s\S]*?)\s*<<<END_MKTON_CAROUSEL_SLIDE>>>/g;

function parse(prompt: string) {
  return Array.from(prompt.matchAll(RE))
    .map((m) => ({ n: Number(m[1]), prompt: m[2]?.trim() ?? "" }))
    .filter((item) => item.prompt)
    .sort((a, b) => a.n - b.n);
}

describe("carousel prompt contract", () => {
  it("keeps one independent prompt per encoded slide", () => {
    const prompt = [
      "<<<MKTON_CAROUSEL_SLIDE_1>>>",
      'Cena A com texto "Primeiro"',
      "<<<END_MKTON_CAROUSEL_SLIDE>>>",
      "<<<MKTON_CAROUSEL_SLIDE_2>>>",
      'Cena B com texto "Segundo"',
      "<<<END_MKTON_CAROUSEL_SLIDE>>>",
    ].join("\n");
    expect(parse(prompt)).toEqual([
      { n: 1, prompt: 'Cena A com texto "Primeiro"' },
      { n: 2, prompt: 'Cena B com texto "Segundo"' },
    ]);
  });
});
