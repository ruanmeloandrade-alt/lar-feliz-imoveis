import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const auth = readFileSync(resolve(root, "src/routes/auth.tsx"), "utf8");
const signupApi = readFileSync(resolve(root, "src/routes/api/mkton-signup-attribution.ts"), "utf8");

describe("Mkton · cadastro público integrado ao CRM", () => {
  it("collects the commercial identity needed by the signup journey", () => {
    expect(auth).toContain("Nome do responsável");
    expect(auth).toContain("WhatsApp");
    expect(auth).toContain("Instagram");
    expect(auth).toContain('signup_source: "mkton_public_signup"');
    expect(auth).toContain("responsible_name: cleanName");
    expect(auth).toContain("whatsapp: cleanWhatsapp");
    expect(auth).toContain("instagram: cleanInstagram");
  });

  it("never sends the password to the CRM synchronization endpoint", () => {
    const syncBodyStart = auth.indexOf("body: JSON.stringify({");
    const syncBodyEnd = auth.indexOf("}),", syncBodyStart);
    const syncBody = auth.slice(syncBodyStart, syncBodyEnd);
    expect(syncBody).not.toContain("password");
  });

  it("resolves the real existing Mkton funnels instead of creating replacements", () => {
    expect(signupApi).toContain("resolveExistingMktonFunnel");
    expect(signupApi).toContain('resolveOperationalFunnel(sb, workspaceId, "lead_entry")');
    expect(signupApi).toContain('resolveOperationalFunnel(sb, workspaceId, "registration")');
    expect(signupApi).not.toContain('from("pipelines").insert');
  });

  it("creates or reuses a lead in Cadastro > New Cad and pre-fills contact data", () => {
    expect(signupApi).toContain('stageByName(registration.stages, "New Cad")');
    expect(signupApi).toContain('from("leads")');
    expect(signupApi).toContain("phone_normalized: profile.whatsapp");
    expect(signupApi).toContain('source: "site_signup"');
    expect(signupApi).toContain('name: "Instagram"');
    expect(signupApi).toContain('from("lead_custom_field_values")');
  });

  it("dispatches the real CRM lifecycle so New Cad automations can run", () => {
    expect(signupApi).toContain("dispatchCrmLeadCreated");
    expect(signupApi).toContain("dispatchCrmStageMoved");
    expect(signupApi).toContain("dispatchCrmFieldUpdated");
  });

  it("keeps tracked signup attribution when the lead came from a tracked link", () => {
    expect(signupApi).toContain('.eq("event_name", "link_click")');
    expect(signupApi).toContain('event_name: "signup_completed"');
    expect(signupApi).toContain("attribution_token: attributionToken");
  });
});
