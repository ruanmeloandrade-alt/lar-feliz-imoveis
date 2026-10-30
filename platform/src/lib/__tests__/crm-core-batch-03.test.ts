import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildFormPublicUrl,
  buildFormShareUrl,
  isValidSlug,
  normalizeSlug,
  renderFormMessage,
} from "@/lib/forms.functions";
import { mapValuesToFields, validateRequired } from "@/lib/forms-ingest.server";

const managerFns = readFileSync("src/lib/ai-agent-context.functions.ts", "utf8");
const managerServer = readFileSync("src/lib/ai-agent-context.server.ts", "utf8");
const formsIngest = readFileSync("src/lib/forms-ingest.server.ts", "utf8");
const publicFormsEndpoint = readFileSync("src/routes/api/public/forms/$token.ts", "utf8");

describe("CRM core completion — batch 03", () => {
  it("TESTE 07: Gestor de CRM exige autenticação e workspace ativo em todos os contextos", () => {
    const exportedFns = managerFns.match(/export const getLead[A-Za-z]+ = createServerFn/g) ?? [];
    const authMiddlewares = managerFns.match(/\.middleware\(\[requireSupabaseAuth\]\)/g) ?? [];
    const workspaceChecks = managerFns.match(/await assertActiveWorkspace\(/g) ?? [];

    expect(exportedFns).toHaveLength(9);
    expect(authMiddlewares).toHaveLength(9);
    expect(workspaceChecks).toHaveLength(9);
    expect(managerFns).toContain("activeWorkspaceId !== requestedWorkspaceId");
    expect(managerFns).toContain('throw new Error("Workspace inválido para esta sessão.")');
  });

  it("TESTE 08: Gestor de CRM monta contexto real sempre filtrado pelo workspace do lead", () => {
    expect(managerServer).toContain('.from("leads")');
    expect(managerServer).toContain('.from("lead_custom_field_values")');
    expect(managerServer).toContain('.eq("workspace_id", workspaceId)');
    expect(managerServer).toContain("getLeadCanonicalContextInternal");
    expect(managerServer).toContain("buildLeadOperationalContextInternal");

    const workspaceFilters = managerServer.match(/\.eq\("workspace_id", workspaceId\)/g) ?? [];
    expect(workspaceFilters.length).toBeGreaterThanOrEqual(6);
  });

  it("TESTE 09: Formulários validam dados, geram link e alimentam o CRM sem criar fluxo paralelo", () => {
    expect(normalizeSlug("Briefing Ágil 2026")).toBe("briefing-agil-2026");
    expect(isValidSlug("briefing-agil-2026")).toBe(true);
    expect(isValidSlug("api")).toBe(false);
    expect(buildFormPublicUrl("https://mkton.io/", "briefing-agil", "lead-123")).toBe(
      "https://mkton.io/l/briefing-agil?leadId=lead-123",
    );
    expect(buildFormShareUrl("briefing-agil")).toBe("https://mkton.io/l/briefing-agil");

    expect(
      renderFormMessage("Olá {{nome}}, acesse {{link}} — {{empresa}}", {
        link: "https://mkton.io/l/briefing-agil",
        nomeCompleto: "Ruan Medeiros",
        empresa: "MKTOn",
      }),
    ).toBe("Olá Ruan, acesse https://mkton.io/l/briefing-agil — MKTOn");

    const fields = [
      { id: "name", label: "Nome completo", kind: "text" as const, required: true },
      { id: "email", label: "E-mail", kind: "email" as const, required: true },
      { id: "phone", label: "WhatsApp", kind: "phone" as const },
    ];
    const mapped = mapValuesToFields(fields, {
      nome: "Maria Silva",
      email: "maria@example.com",
      whatsapp: "+55 22 99999-0000",
    });
    expect(mapped).toEqual({
      name: "Maria Silva",
      email: "maria@example.com",
      phone: "+55 22 99999-0000",
    });
    expect(() => validateRequired(fields, mapped)).not.toThrow();
    expect(() => validateRequired(fields, { name: "Maria Silva" })).toThrow('Preencha o campo "E-mail".');

    expect(publicFormsEndpoint).toContain("ingestFormSubmission");
    expect(publicFormsEndpoint).toContain("mapValuesToFields");
    expect(formsIngest).toContain('.from("crm_form_submissions")');
    expect(formsIngest).toContain('.from("leads")');
    expect(formsIngest).toContain("dispatchCrmLeadCreated");
    expect(formsIngest).toContain("dispatchCrmFieldUpdated");
    expect(formsIngest).toContain('.eq("workspace_id", f.workspace_id)');
  });
});
