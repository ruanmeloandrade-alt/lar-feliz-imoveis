// Fachada multicanal do Gestor de Tráfego.
// Mantém leitura real Meta/Google/TikTok e expõe mutações ao Chat somente pela camada segura compartilhada.
import { buildGestorTools as buildMetaGestorTools } from "./gestor-tools.meta.server";
import { buildPaidMediaProviderTools } from "./gestor-paid-media-tools.server";
import { buildGoogleGestorActionTools } from "./gestor-google-actions.server";
import { buildCreativePerformanceTools } from "./gestor-creative-performance-tools.server";
import { buildStrategicActionTools } from "./gestor-strategic-actions.server";
import { buildGuardedGestorActionTools } from "./gestor-guarded-actions.server";
import { applyGestorChatToolPolicy } from "./gestor-chat-tool-policy";

export function buildGestorTools(ctx: Parameters<typeof buildMetaGestorTools>[0]) {
  const legacyAndReadTools = {
    ...buildMetaGestorTools(ctx),
    ...buildPaidMediaProviderTools(ctx),
    // Mantém a implementação Google atual para leitura/uso fora das mutações bloqueadas pela policy.
    ...buildGoogleGestorActionTools(ctx),
    // Mantém o contrato de search_creatives, mas acrescenta vínculo e performance Meta reais.
    ...buildCreativePerformanceTools(ctx),
    // Ações compostas Meta com preservação de origem e guardrails compartilhados.
    ...buildStrategicActionTools(ctx),
  };

  return {
    ...applyGestorChatToolPolicy(legacyAndReadTools),
    // Status/orçamento somente por estas ações verificadas e auditadas.
    ...buildGuardedGestorActionTools(ctx),
  };
}
