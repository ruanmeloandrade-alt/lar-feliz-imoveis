import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("custom fields save + trigger regression contract", () => {
  it("Inbox não engole erro e confirma persistência antes do sucesso", () => {
    const panel = read("src/components/inbox/LeadProfilePanel.tsx");
    const server = read("src/lib/leads.functions.legacy.ts");

    expect(panel).not.toContain("saveFieldValue({ data: { leadId, fieldId, value } }).catch(() => null)");
    expect(panel).toContain("Não foi possível salvar");
    expect(panel).toContain("await detailQ.refetch()");
    expect(panel).toContain('toast.success(customChanged > 0 ? "Campos personalizados salvos." : "Lead salvo.")');
    expect(panel).toContain('savingProfile ? "Salvando..." : "Salvar"');

    expect(server).toContain("previousValue === data.value");
    expect(server).toContain("changed: false");
    expect(server).toContain('.select("field_id, value, updated_at")');
    expect(server).toContain("O campo foi enviado, mas o banco não confirmou o valor salvo.");
  });

  it("Funil carrega os campos reais do lead e respeita datetime", () => {
    const funnel = read("src/legacy/crm.funis-de-venda.legacy.tsx");

    expect(funnel).toContain("getLeadDetailFn");
    expect(funnel).toContain("listCustomFieldsFn");
    expect(funnel).toContain('case "datetime": return "datetime-local"');
    expect(funnel).toContain("loadingCustomFields");
    expect(funnel).toContain("customFieldError");
  });

  it("gatilho preserva campo específico e o save geral relê o banco", () => {
    const popover = read("src/components/crm/StageTriggerConfigPopover.tsx");
    const funnel = read("src/legacy/crm.funis-de-venda.legacy.tsx");

    expect(popover).toContain("canonicalFieldByIdOrName");
    expect(popover).toContain("fieldId: field.id");
    expect(popover).toContain("fieldName: field.name");
    expect(popover).toContain("await onSave(next)");
    expect(popover).toContain("saveError");

    expect(funnel).toContain("assertAutomationPersistence");
    expect(funnel).toContain("O campo personalizado do gatilho");
    expect(funnel).toContain("listStageAutomationsServer");
  });

  it("expõe agendamento horas antes do campo e usa fuso do workspace", () => {
    const popover = read("src/components/crm/StageTriggerConfigPopover.tsx");
    const engine = read("src/lib/stage-automation-engine.server.ts");

    expect(popover).toContain('"hours-before-field"');
    expect(popover).toContain("respeitando o fuso horário da conta");
    expect(engine).toContain("fromZonedTime");
    expect(engine).toContain("parseAutomationDateTime");
    expect(engine).toContain("business_hours");
    expect(engine).toContain("scheduleDelayMinutes(input.action.execution, lead)");
  });
});
