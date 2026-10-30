import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Social Media style/reference fidelity wiring", () => {
  it("envia brandId e referências visuais reais ao Ideogram V3", () => {
    const route = readFileSync("src/routes/api/social/generate-image.ts", "utf8");
    expect(route).toContain("brandId?: string | null");
    expect(route).toContain('from("social_brand_references")');
    expect(route).toContain('.eq("sentiment", "like")');
    expect(route).toContain(".limit(3)");
    expect(route).toContain('storage.from("social-media").download');
    expect(route).toContain('form.append("style_reference_images"');
  });

  it("mantém o brandId no payload de geração da Campanha", () => {
    const campaign = readFileSync("src/components/social/CampaignsDialog.tsx", "utf8");
    expect(campaign).toContain("brandId: set.brandId");
  });

  it("refinador exige estilo, continuidade, contagem e revelação narrativa", () => {
    const refine = readFileSync("src/lib/social-wave4.override.functions.ts", "utf8");
    expect(refine).toContain("inferCarouselCount(data.briefing, data.slides)");
    expect(refine).toContain("styleAnchor");
    expect(refine).toContain("continuityAnchor");
    expect(refine).toContain("revealRule");
    expect(refine).toContain("NENHUM pode virar fotografia/fotorealismo");
    expect(refine).toContain("slides anteriores NÃO podem citar, explicar ou mostrar visualmente");
  });
});
