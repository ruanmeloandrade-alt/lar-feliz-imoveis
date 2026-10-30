import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const agentSource = readFileSync("src/lib/crm-agent.functions.ts", "utf8");
const agentRoute = readFileSync("src/routes/crm.agente-ia.tsx", "utf8");
const sidebarSource = readFileSync("src/components/dashboard/AppSidebar.tsx", "utf8");
const filesSource = readFileSync("src/lib/crm-arquivos.functions.ts", "utf8");
const filesRoute = readFileSync("src/routes/crm.arquivos.tsx", "utf8");

describe("CRM completion — batch 06", () => {
  it("TESTE 16: Gestor de CRM usa somente o workspace ativo e valida os funis administrados", () => {
    expect(agentSource).toContain("requireActiveWorkspace");
    expect(agentSource).toContain("Workspace inválido para esta sessão.");
    expect(agentSource).toContain('.from("pipelines")');
    expect(agentSource).toContain("Um ou mais funis não pertencem ao workspace ativo.");

    for (const fn of ["listCrmAgents", "getCrmAgentConfig", "saveCrmAgentConfig", "deleteCrmAgent"]) {
      const start = agentSource.indexOf(`export const ${fn}`);
      expect(start).toBeGreaterThan(-1);
      const block = agentSource.slice(start, start + 2600);
      expect(block).toContain("requireSupabaseAuth");
      expect(block).toContain("requireActiveWorkspace");
    }
  });

  it("TESTE 17: Gestor de CRM mantém autonomia, tarefas, limites e proteção contra gestores conflitantes", () => {
    for (const task of [
      "leads_parados", "follow_up", "sem_resposta", "higienizacao", "qualificacao",
      "mover_etapa", "criar_tarefa", "registrar_nota", "alerta_sla", "detectar_duplicados",
    ]) {
      expect(agentSource).toContain(`\"${task}\"`);
    }
    expect(agentSource).toContain("maxActionsPerDay");
    expect(agentSource).toContain("requireApprovalAbove");
    expect(agentSource).toContain("Conflito: o agente");
    expect(agentSource).toContain("Gestor de CRM não encontrado no workspace ativo.");
    expect(agentRoute).toContain("AUTONOMY_OPTIONS");
    expect(agentRoute).toContain("TASKS");
    expect(sidebarSource).toContain('{ label: "Gestor de CRM", to: "/crm/agente-ia", adminOnly: true }');
    expect(sidebarSource).not.toContain('{ label: "Agente IA", to: "/crm/agente-ia", adminOnly: true }');
  });

  it("TESTE 18: Arquivos não promete descarte automático sem executor e exclusão continua persistente e isolada", () => {
    expect(filesSource).toContain("deleteLeadFiles");
    expect(filesSource).toContain("DeleteLeadFilesSchema");
    expect(filesSource).toMatch(/from\("whatsapp_web_messages"\)[\s\S]*update\(\{ media_url: null \}\)[\s\S]*eq\("workspace_id", wsId\)/);
    expect(filesSource).toMatch(/from\("channel_messages"\)[\s\S]*update\(\{ attachments: keep \}\)[\s\S]*eq\("workspace_id", wsId\)/);
    // Enquanto não houver cron/worker de retenção, a UI não pode afirmar que a limpeza em 15 dias já acontece automaticamente.
    expect(filesRoute).not.toContain("excluídos automaticamente após <b>15 dias</b>");
  });
});
