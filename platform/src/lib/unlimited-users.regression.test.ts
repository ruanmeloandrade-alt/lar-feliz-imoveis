import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("workspace users are unlimited", () => {
  it("does not enforce plan seats when inviting or creating employees", () => {
    const settings = source("src/lib/settings.functions.ts");

    expect(settings).not.toContain("workspace_seat_limit");
    expect(settings).not.toContain("Limite de funcionários do plano atingido");
    expect(settings).not.toContain("Já existe um parceiro técnico ativo neste workspace");
    expect(settings).toContain("export const inviteMember");
    expect(settings).toContain("export const createEmployee");
  });

  it("advertises unlimited users while keeping WhatsApp quota separate", () => {
    const plans = source("src/components/settings/PlansGrid.tsx");
    const billingTypes = source("src/lib/billing/types.ts");

    expect(plans).toContain("Usuários ilimitados");
    expect(plans).toContain("max_whatsapp_instances");
    expect(plans).not.toContain("Até ${plan.max_employees_per_company} usuário");
    expect(billingTypes).toContain('extra_employee: "WhatsApp Extra"');
  });
});
