import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Tracking bloco 1 — acesso e ingestão", () => {
  it("protege a rota completa de Tracking pelo entitlement tracking", () => {
    const route = source("../routes/modulos.tracking.tsx");
    expect(route).toContain('import { ModuleGate } from "@/components/billing/ModuleGate"');
    expect(route).toContain('<ModuleGate module="tracking">');
  });

  it("restringe identificadores Meta a Growth+ ou trial e ao workspace do lead", () => {
    const meta = source("../routes/api/public/track/meta.ts");
    expect(meta).toContain('META_EVENT_PLAN_CODES = new Set(["professional", "business", "enterprise"])');
    expect(meta).toContain('.from("subscriptions")');
    expect(meta).toContain('"meta_events não disponível neste plano"');
    expect(meta).toContain('.eq("workspace_id", lead.workspace_id)');
  });

  it("mantém o coletor isolado por site, deduplicado e recuperável em retry", () => {
    const collect = source("../routes/api/public/track/collect.ts");
    expect(collect).toContain('.from("tracking_sites")');
    expect(collect).toContain('.eq("workspace_id", w)');
    expect(collect).toContain('.eq("domain", domain)');
    expect(collect).toContain('ignored: "site-nao-cadastrado"');
    expect(collect).toContain('String((error as { code?: string }).code) !== "23505"');
    expect(collect).toContain('.eq("event_id", eventId)');
    expect(collect).toContain('dispatchTracking');
  });

  it("não expõe regras customizadas para domínio não cadastrado", () => {
    const config = source("../routes/api/public/track/config.ts");
    expect(config).toContain('if (!siteId) return Response.json({ rules: [] }, { headers: cors });');
    expect(config).toContain('(r) => !r.site_id || r.site_id === siteId');
    expect(config).not.toContain('!r.site_id || !siteId || r.site_id === siteId');
  });

  it("mantém pixel conservador por padrão e modo comportamental opt-in", () => {
    const pixel = source("../routes/api/public/track/px[.]js.ts");
    expect(pixel).toContain('var FULL = /[?&]full=1/.test(src);');
    expect(pixel).toContain('send("form_submit", ident);');
    expect(pixel).toContain('send("whatsapp_click"');
    expect(pixel).toContain('send("phone_click"');
  });
});
