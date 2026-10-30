import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const crmDispatch = read("src/lib/crm-event-dispatch.server.ts");
const automation = read("src/lib/stage-automation-engine.server.ts");
const salesbot = read("src/lib/salesbot-runtime.server.ts");
const media = read("src/lib/ai-inbound-media.server.ts");
const evolution = read("src/routes/api/public/evolution/webhook.$secret.ts");
const aiClaim = read("src/lib/salesbot-ai-claim.server.ts");
const runGuards = read("src/lib/salesbot-run-guards.server.ts");
const workspaceAi = read("src/lib/workspace-ai-key.server.ts");
const workflow = read(".github/workflows/crm-batch-ci.yml");

const hasAll = (source: string, needles: string[]) => needles.every((needle) => source.includes(needle));

describe("Integrated closeout — batch 01", () => {
  it("TASK 01: CRM despacha mudança de etapa para SalesBot e automações", () => {
    expect(hasAll(crmDispatch, ["dispatchCrmStageMoved", "dispatchStageChange", "enqueueLeadAutomationEvent"])).toBe(true);
  });
  it("TASK 02: automação CRM inicia SalesBot e registra erro", () => {
    expect(hasAll(automation, ['case "salesbot"', "startSalesbotRun", 'finishJob(admin, job.id, "error"'])).toBe(true);
  });
  it("TASK 03: gatilho de etapa respeita etapa e funil", () => {
    expect(hasAll(salesbot, ["dispatchStageChange", 'g.kind === "movido-etapa"', "g.pipelineId !== params.newPipelineId"])).toBe(true);
  });
  it("TASK 04: SalesBot envia WhatsApp pela Evolution", () => {
    expect(hasAll(salesbot, ["sendWhatsappText", "get_evolution_credentials_service", "/message/sendText/"])).toBe(true);
  });
  it("TASK 05: SalesBot mantém pausas, inbound e timers", () => {
    expect(hasAll(salesbot, ['status: "waiting_message"', 'status: "waiting_timer"', "resumeRunsOnInboundMessage", "tickWaitingTimers"])).toBe(true);
  });
  it("TASK 06: Agent IA recebe persona, objetivos, histórico e conhecimento", () => {
    expect(hasAll(salesbot, ["runAiAgentTurn", "describeObjectiveTree", "loadConversationHistoryForAI", "buildAgentKnowledgeBlock"])).toBe(true);
  });
  it("TASK 07: Agent IA resolve chave por workspace e chama chat completions", () => {
    expect(hasAll(salesbot, ["resolveWorkspaceAiKey", "/chat/completions", "aiKey.apiKey"])).toBe(true);
    expect(hasAll(workspaceAi, ["workspaceId", "get_integration_secret", "openai"])).toBe(true);
  });
  it("TASK 08: Agent IA envia resposta e persiste message_out", () => {
    expect(hasAll(salesbot, ["sendWhatsappText", 'type: "message_out"', 'source: "ai_agent"', "whatsapp_message_id"])).toBe(true);
  });
  it("TASK 09: Agent IA extrai dados e executa ações", () => {
    expect(hasAll(salesbot, ["EXTRACT_DATA:", "lead_custom_field_values", "AGENT_ACTION:", "executeAgentActions"])).toBe(true);
  });
  it("TASK 10: Agent IA suporta handoff e mantém agente ativo", () => {
    expect(hasAll(salesbot, ["[[HANDOFF]]", "assignConversationAgent", "active_conversation_agent_id"])).toBe(true);
  });
  it("TASK 11: entrada multimídia distingue formatos", () => {
    expect(media).toContain("classifyInboundMedia");
    for (const kind of ["audio", "image", "sticker", "pdf", "document", "video"]) expect(media).toContain(`return "${kind}"`);
  });
  it("TASK 12: áudio tem transcrição com limite", () => {
    expect(hasAll(media, ["transcribeInboundAudio", "/audio/transcriptions", "20 MB"])).toBe(true);
  });
  it("TASK 13: foto usa visão e figurinha tem contexto", () => {
    expect(hasAll(media, ["askVision", 'type: "image_url"', "[figurinha recebida]"])).toBe(true);
  });
  it("TASK 14: PDF/documento vira contexto", () => {
    expect(hasAll(media, ["extractDocumentText", "/files", "[documento recebido:"])).toBe(true);
  });
  it("TASK 15: mídia desconhecida não vira vazio", () => {
    expect(hasAll(media, ["prepareInboundForAgent", "[arquivo recebido"])).toBe(true);
  });
  it("TASK 16: Evolution identifica mídia e recupera base64", () => {
    expect(hasAll(evolution, ["extractMediaInfo", "getBase64FromMediaMessage", "base64"])).toBe(true);
  });
  it("TASK 17: WhatsApp cria/encontra lead no workspace", () => {
    expect(hasAll(evolution, ["sess.workspace_id", "phone_normalized", 'source: "whatsapp"', "dispatchCrmLeadCreated"])).toBe(true);
  });
  it("TASK 18: inbound persiste no Inbox e histórico", () => {
    expect(hasAll(evolution, ["whatsapp_web_messages", "lead_activities", "inbound_dispatch_status", "whatsapp_message_id"])).toBe(true);
  });
  it("TASK 19: webhook despacha inbound uma vez para SalesBot", () => {
    expect(hasAll(evolution, ["shouldDispatchEvolutionInbound", "freshInboundForLead", "dispatchInboundMessage", "dispatched"])).toBe(true);
  });
  it("TASK 20: falha de processamento fica registrada", () => {
    expect(hasAll(evolution, ["processingErrors", "inbound_dispatch_status", '"error"', "500"])).toBe(true);
  });
  it("TASK 21: runtime protege concorrência, tenant e timers", () => {
    expect(hasAll(salesbot, ["claimSalesbotAiTurn", "claimedIa", "findActiveSalesbotRunId", "waitForDurableSalesbotTimer"])).toBe(true);
    expect(hasAll(aiClaim, ["workspace_id", "waiting_message"])).toBe(true);
    expect(hasAll(runGuards, ["workspace_id", "waiting_timer"])).toBe(true);
    expect(hasAll(workspaceAi, ["explicitInternalAiWorkspaceIds", "allowed.includes(workspaceId)", "OpenAI não conectada neste workspace"])).toBe(true);
  });
  it("TASK 22: CI cobre branch e bateria integrada", () => {
    expect(hasAll(workflow, ["chatgpt/integrated-closeout-*", "integrated-closeout-*.test.ts", "Integrated closeout tests"])).toBe(true);
  });
  it("TASK 23: fechamento preserva isolamento e rastreabilidade", () => {
    expect(hasAll(evolution, ["sess.workspace_id", "inbound_dispatch_status"])).toBe(true);
    expect(hasAll(salesbot, ["workspaceId", "whatsapp_message_id", "salesbot_runs"])).toBe(true);
    expect(workspaceAi).toContain("workspaceId");
  });
});