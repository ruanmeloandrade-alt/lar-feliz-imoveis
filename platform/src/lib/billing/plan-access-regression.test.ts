import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Plan access regression", () => {
  it("keeps Performance traffic access restricted to executable automations", () => {
    const parent = source("../../routes/modulos.gestor-trafego.tsx");
    expect(parent).toContain('pathname === "/modulos/gestor-trafego/automacoes"');
    expect(parent).toContain('"trafego_automacoes" : "trafego_ia"');
  });

  it("keeps full Tracking behind the Performance+ entitlement", () => {
    const tracking = source("../../routes/modulos.tracking.tsx");
    expect(tracking).toContain('component: TrackingAccessPage');
    expect(tracking).toContain('<ModuleGate module="tracking">');
  });

  it("keeps Meta browser identifiers restricted to Growth+ or a live trial", () => {
    const meta = source("../../routes/api/public/track/meta.ts");
    expect(meta).toContain('new Set(["professional", "business", "enterprise"])');
    expect(meta).toContain('.select("workspace_id")');
    expect(meta).toContain('"meta_events não disponível neste plano"');
    expect(meta).toContain('{ status: 403');
    expect(meta).toContain('.eq("workspace_id", lead.workspace_id)');
  });

  it("renders Social Media in calendar-only mode without Scale entitlement", () => {
    const social = source("../../routes/modulos.social-media.tsx");
    expect(social).toContain('useHasModule("social_calendar")');
    expect(social).toContain('useHasModule("social_media_ia")');
    expect(social).toContain('Agendamento e legendas continuam disponíveis sem depender de configuração de IA.');
    expect(social).toContain('{fullAccess && <SocialKpiDashboard');
    expect(social).toContain('{fullAccess && (');
  });

  it("blocks direct access to advanced Social Media pages below Scale", () => {
    const campaigns = source("../../routes/modulos.social-campanhas.tsx");
    const newPost = source("../../routes/modulos.social-novo-post.tsx");
    expect(campaigns).toContain('<ModuleGate module="social_media_ia">');
    expect(newPost).toContain('<ModuleGate module="social_media_ia">');
  });

  it("keeps the plans UI plural and removes the bonus em dash", () => {
    const plansGrid = source("../../components/settings/PlansGrid.tsx");
    expect(plansGrid).toContain("Planos e assinaturas");
    expect(plansGrid).not.toContain(" — ");
    expect(plansGrid).toContain("Economia de");
  });
});
