import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Leads e Públicos", () => {
  it("abre ficha do lead antes de qualquer conversa", () => {
    const source = read("routes/crm.leads.tsx");
    expect(source).toContain("getLeadDetail");
    expect(source).toContain("setDetailLeadId(lead.id)");
    expect(source).toContain("Ficha do lead");
    expect(source).toContain("Abrir conversa");
    expect(source).not.toContain('const openLead = (id: string) => navigate({ to: "/inbox/leads/$leadId"');
  });

  it("mantém Públicos ligados a Meta Lookalike e transmissão", () => {
    const route = read("routes/crm.publicos.tsx");
    const server = read("lib/crm-audiences.functions.ts");
    expect(route).toContain("createCrmAudienceLookalike");
    expect(route).toContain("broadcastCrmAudience");
    expect(server).toContain("createCrmAudienceLookalike");
    expect(server).toContain("broadcastCrmAudience");
    expect(server).toContain("exportCrmAudienceToMeta");
  });
});
