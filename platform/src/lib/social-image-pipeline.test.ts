import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Social image pipeline regression", () => {
  it("uses the current Ideogram V3 contract in the server route", () => {
    const source = read("src/routes/api/social/generate-image.ts");
    expect(source).toContain("https://api.ideogram.ai/v1/ideogram-v3/generate");
    expect(source).toContain('"Api-Key"');
    expect(source).toContain("data?: Array<{ url?: string }>");
    expect(source).toContain("urlToB64");
  });

  it("keeps streamImage as transport only and never persists before delivering final frame", () => {
    const source = read("src/lib/social-stream.ts");
    const start = source.indexOf("export async function streamImage");
    const end = source.indexOf("function storageKind", start);
    const streamBody = source.slice(start, end);
    expect(streamBody).toContain("onFrame({ dataUrl: dataUrls[0], dataUrls, final: true })");
    expect(streamBody).not.toContain("uploadDataUrlToBucket");
    expect(streamBody).not.toContain("emitFinal");
  });

  it("persists generated Banco de Ideias images exactly in the owning flow", () => {
    const source = read("src/components/social/IdeasGridFinalization.tsx");
    expect(source).toContain("await streamImage");
    expect(source).toContain("uploadDataUrlToBucket({");
    expect(source).toContain("setSocialIdeaSlideImages");
  });

  it("persists generated Campaign images in campaign-posts after transport", () => {
    const source = read("src/components/social/CampaignsDialog.tsx");
    expect(source).toContain("await streamImage");
    expect(source).toContain('folder: "campaign-posts"');
    expect(source).toContain("await uploadDataUrlToBucket");
  });

  it("allows Chat Media to render provider output without requiring storage first", () => {
    const source = read("src/components/social/MediaArtStudio.tsx");
    expect(source).toContain("await streamImage");
    expect(source).toContain("setImages(generated)");
  });

  it("does not crash the whole Brand tab when a legacy logo signed URL is broken", () => {
    const source = read("src/lib/social-brand.functions.ts");
    expect(source).toContain("if (signError || !signed?.signedUrl)");
    expect(source).toContain("result.logo_url = null");
  });
});
