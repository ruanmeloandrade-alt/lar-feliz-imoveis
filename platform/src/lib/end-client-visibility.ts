// Restrições visuais para o cliente final (usuário não super_admin).
// O super_admin continua enxergando também superfícies internas, mas integrações
// tecnicamente concluídas não devem carregar a marca "só admin".

export const END_CLIENT_MODULE_IDS: ReadonlySet<string> = new Set([
  "crm",
  "tracking",
  "gestor-trafego",
  "social-media",
  "fluxo-trabalho",
  "faculdade",
]);

export const END_CLIENT_INTEGRATION_CATEGORIES: ReadonlySet<string> = new Set([
  "ads",
  "social",
  "ia",
  "automacao",
  "email",
  "arquivos",
  "catalogos",
  "assinatura",
]);

/**
 * Integrações com fluxo de conexão/uso exposto ao workspace do cliente final.
 * Motores dedicados à geração visual ficam deliberadamente fora desta lista:
 * Ideogram, Recraft e Freepik são ferramentas internas do super_admin.
 * Gemini permanece porque também é motor textual do produto.
 */
export const FUNCTIONAL_INTEGRATION_IDS: ReadonlySet<string> = new Set([
  "meta",
  "tiktok",
  "whatsapp-web",
  "whatsapp-cloud",
  "conta-google",
  "microsoft-office",

  // IA textual/operacional exposta ao cliente.
  "openai",
  "gemini",

  // Agentes de código via MCP.
  "codex",
  "claude-code",
  "openclaw",

  // Automação externa.
  "n8n",
  "make",
  "zapier",
  "webhooks",

  // E-mail e catálogo.
  "email",
  "shopify",

  // Assinatura digital.
  "clicksign",
  "zapsign",
  "docusign",
]);

export function isIntegrationAdminOnly(i: { id: string; category: string }): boolean {
  if (!END_CLIENT_INTEGRATION_CATEGORIES.has(i.category)) return true;
  return !FUNCTIONAL_INTEGRATION_IDS.has(i.id);
}

export const END_CLIENT_HIDDEN_SIDEBAR_LABELS: ReadonlySet<string> = new Set([
  "Campanhas",
]);
