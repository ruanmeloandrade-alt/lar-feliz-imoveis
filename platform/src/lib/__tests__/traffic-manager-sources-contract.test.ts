import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "src/routes/modulos.gestor-trafego.index.tsx"), "utf8");

describe("Gestor de Tráfego source contract", () => {
  it("shows only providers with real implementation scope", () => {
    expect(page).toContain('{ v: "meta", l: "Meta Ads", ready: true, agentReady: true }');
    expect(page).toContain('{ v: "google", l: "Google Ads", ready: false, agentReady: true }');
    expect(page).toContain('{ v: "tiktok", l: "TikTok Ads", ready: false, agentReady: true }');
    expect(page).not.toContain('Pinterest Ads');
    expect(page).not.toContain('LinkedIn Ads');
  });

  it("does not let the Meta dashboard pretend to select a provider it does not render yet", () => {
    expect(page).toContain('disabled={!s.ready}');
    expect(page).toContain('IA/Chat ativo · dashboard em conexão');
    expect(page).toContain('visibleSources.filter((s) => s.ready)');
  });
});
