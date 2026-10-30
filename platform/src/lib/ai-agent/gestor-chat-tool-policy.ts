// Política de capabilities do cockpit do Gestor.
// A segurança é aplicada no código, não depende do prompt/modelo.
export const BLOCKED_GESTOR_CHAT_TOOLS = new Set([
  // Meta legadas: mutam provider sem os guardrails compartilhados.
  "set_object_status",
  "update_campaign_budget",
  // Criação legada aceita activateNow=true e pode pular revisão.
  "create_full_ad_from_image",
  // Materializa regras diretamente a partir da estratégia, inclusive enabled=true.
  "apply_strategy_to_campaign",
  // Google/TikTok ainda não usam o mesmo motor de guardrails das automações.
  "set_google_campaign_status",
  "set_tiktok_campaign_status",
]);

export function applyGestorChatToolPolicy<T extends Record<string, unknown>>(tools: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => !BLOCKED_GESTOR_CHAT_TOOLS.has(name)),
  ) as Partial<T>;
}
