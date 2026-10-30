import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tool = readFileSync(resolve(process.cwd(), "src/lib/ai-agent/gestor-creative-performance-tools.server.ts"), "utf8");
const facade = readFileSync(resolve(process.cwd(), "src/lib/ai-agent/gestor-tools.server.ts"), "utf8");
const chat = readFileSync(resolve(process.cwd(), "src/routes/api/ai-agent/chat.ts"), "utf8");

describe("Gestor creative performance recommendations", () => {
  it("enriches the existing strategist creative search instead of creating a parallel execution path", () => {
    expect(facade).toContain("...buildCreativePerformanceTools(ctx)");
    expect(tool).toContain("search_creatives: tool({");
    expect(chat).toContain('"search_creatives"');
  });

  it("uses deterministic Meta ids and never fuzzy attribution for performance", () => {
    expect(tool).toContain("meta_ad_id");
    expect(tool).toContain("meta_campaign_id");
    expect(tool).toContain("loadAdPerformance(adId, token)");
    expect(tool).not.toContain("meta_ad_id.ilike");
    expect(tool).not.toContain("display_name.eq");
    expect(tool).not.toContain("original_filename.eq");
  });

  it("prevents winner claims when comparable delivery data is insufficient", () => {
    expect(tool).toContain("recommendationEligible: false");
    expect(tool).toContain("canRankByPerformance: measuredCount >= 2");
    expect(tool).toContain("Dados insuficientes para declarar vencedor");
    expect(tool).toContain("performance comprovada");
  });
});
