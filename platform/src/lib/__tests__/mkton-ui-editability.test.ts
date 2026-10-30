import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const fullOperation = readFileSync(resolve(root, "src/lib/mkton-full-operation.server.ts"), "utf8");
const manualPack = readFileSync(resolve(root, "src/lib/mkton-manual-pack.server.ts"), "utf8");
const fullProvision = readFileSync(
  resolve(root, "src/lib/mkton-full-provision.functions.ts"),
  "utf8",
);
const productsProvision = readFileSync(
  resolve(root, "src/lib/mkton-products-provision.server.ts"),
  "utf8",
);
const salesbotsFunctions = readFileSync(resolve(root, "src/lib/salesbots.functions.ts"), "utf8");
const automationsRoute = readFileSync(resolve(root, "src/routes/crm.automacoes.tsx"), "utf8");
const rootRoute = readFileSync(resolve(root, "src/routes/__root.tsx"), "utf8");
const agentFunctions = readFileSync(
  resolve(root, "src/lib/conversation-agents.functions.ts"),
  "utf8",
);
const agentsPanel = readFileSync(
  resolve(root, "src/components/automations/ConversationAgentsPanel.tsx"),
  "utf8",
);
const formsFunctions = readFileSync(resolve(root, "src/lib/forms.functions.ts"), "utf8");
const formsRoute = readFileSync(resolve(root, "src/routes/crm.formularios.tsx"), "utf8");
const productsFunctions = readFileSync(resolve(root, "src/lib/products.functions.ts"), "utf8");
const productsRoute = readFileSync(resolve(root, "src/routes/crm.produtos.tsx"), "utf8");

describe("Mkton · configurações permanecem editáveis pela UI", () => {
  it("persists SalesBots in the same database model loaded by the visual builder", () => {
    expect(manualPack).toContain('from("salesbots")');
    expect(manualPack).toContain('from("salesbot_blocks")');
    expect(salesbotsFunctions).toContain("listSalesbotsFull");
    expect(salesbotsFunctions).toContain('from("salesbots")');
    expect(salesbotsFunctions).toContain('from("salesbot_blocks")');
    expect(automationsRoute).toContain("listSalesbotsFull");
    expect(automationsRoute).toContain("SalesbotBuilder");
    expect(automationsRoute).toContain("setEditId");
  });

  it("persists Julia agents in the same table used by the normal agent editor", () => {
    expect(manualPack).toContain('from("conversation_ai_agents")');
    expect(agentFunctions).toContain('from("conversation_ai_agents")');
    expect(agentFunctions).toContain("upsertConversationAgent");
    expect(agentsPanel).toContain("listConversationAgents");
    expect(agentsPanel).toContain("setEditing(a)");
    expect(agentsPanel).toContain("AgentEditor");
  });

  it("keeps briefing forms in the normal Forms CRUD surface", () => {
    expect(fullOperation).toContain('from("crm_forms")');
    expect(formsFunctions).toContain('from("crm_forms")');
    expect(formsRoute).toContain("listForms");
    expect(formsRoute).toContain("upsertForm");
    expect(formsRoute).toContain("setEditing(f)");
    expect(formsRoute).toContain("FormEditor");
  });

  it("keeps Mkton plans in the normal CRM catalog/product CRUD", () => {
    expect(productsProvision).toContain('from("product_catalogs")');
    expect(productsProvision).toContain('from("products")');
    expect(productsFunctions).toContain('from("product_catalogs")');
    expect(productsFunctions).toContain('from("products")');
    expect(productsRoute).toContain("listProductCatalogs");
    expect(productsRoute).toContain("saveProductCatalog");
    expect(productsRoute).toContain("saveProductSrv");
  });

  it("keeps provisioned bots and agents editable instead of special-casing them in the UI", () => {
    expect(automationsRoute).not.toContain("mkton-manual-pack.server");
    expect(automationsRoute).not.toContain("mkton-new-cad");
    expect(automationsRoute).not.toContain("mkton-trial-20d");
    expect(agentsPanel).not.toContain("Júlia Braga · Ativação Mkton");
  });

  it("disables the legacy lead-entry bootstrap so no four extra bots are recreated", () => {
    expect(fullProvision).toContain("leadEntryReady: true");
    expect(fullProvision).not.toContain("LEAD_ENTRY_BOT_IDS");
    expect(fullProvision).not.toContain("LEAD_ENTRY_AGENT_NAMES");
    expect(rootRoute).toContain("bootstrap.allowed && !bootstrap.leadEntryReady");
  });

  it("tracks only the 24-bot and 3-agent manual pack", () => {
    expect(fullProvision).toContain("MKTON_MANUAL_BOT_IDS");
    expect(fullProvision).toContain("MKTON_MANUAL_AGENT_NAMES");
    expect(fullProvision).toContain("expectedBots: MKTON_MANUAL_BOT_IDS.length");
    expect(fullProvision).toContain("expectedAgents: MKTON_MANUAL_AGENT_NAMES.length");
    expect(fullProvision).toContain("missingBots");
    expect(fullProvision).toContain("missingAgents");
  });

  it("seeds once and then stops rewriting manual connections", () => {
    expect(fullProvision).toContain("MKTON_MANUAL_PACK_VERSION");
    expect(fullProvision).toContain("packSeeded");
    expect(fullProvision).toContain("manual_pack_already_seeded_preserve_manual_connections");
    expect(fullProvision).toContain("if (before.packSeeded)");
    expect(fullProvision).not.toContain("syncMktonSubscriptionsToCrm");
    expect(fullProvision).not.toContain("provisionMktonProducts");
  });
});
