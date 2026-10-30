import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "../../integrations/supabase/client.server";
import { executeRun, startSalesbotRun } from "../salesbot-runtime.server";

// Helper para aguardar processamento se houver algo assíncrono
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Ação Vincular Produto - Workspace Isolation", () => {
  const wsA = "77777777-7777-7777-7777-777777777777";
  const wsB = "88888888-8888-8888-8888-888888888888";
  let leadA: any;
  let productA: any;
  let productB: any;
  let salesbot: any;
  let crmSource: any;

  beforeAll(async () => {
    // 1. Obter um owner_id real (Profile)
    const { data: users } = await supabaseAdmin.from("profiles").select("id").limit(1);
    const ownerId = users?.[0]?.id;
    if (!ownerId) throw new Error("No user found in profiles table for testing.");

    // 2. Criar Workspaces se necessário
    await supabaseAdmin.from("workspaces").upsert([
      { id: wsA, name: "Test WS A", owner_id: ownerId, slug: "ws-test-a-" + Date.now() },
      { id: wsB, name: "Test WS B", owner_id: ownerId, slug: "ws-test-b-" + Date.now() }
    ]);

    // Setup Workspace A
    const sourceRes = await (supabaseAdmin.from("crm_sources") as any).upsert({
      id: "99999999-9999-9999-9999-999999999999",
      workspace_id: wsA,
      provider: "mkton",
      display_name: "Test Source"
    }).select().single();
    if (sourceRes.error) throw new Error("Source error: " + sourceRes.error.message);
    crmSource = sourceRes.data;

    const leadRes = await (supabaseAdmin.from("leads") as any).upsert({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      workspace_id: wsA,
      phone: "5511999999999",
      crm_source_id: crmSource.id,
      name: "Test Lead"
    }).select().single();
    if (leadRes.error) throw new Error("Lead error: " + leadRes.error.message);
    leadA = leadRes.data;

    // Criar catálogo necessário para o produto com UUID real
    const catalogA = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    await (supabaseAdmin.from("product_catalogs") as any).upsert({
      id: catalogA,
      workspace_id: wsA,
      name: "Catalog A",
      description: "Desc A"
    });

    const prodARes = await (supabaseAdmin.from("products") as any).upsert({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      workspace_id: wsA,
      name: "Produto A",
      catalog_id: catalogA,
      description: "Desc A"
    }).select().single();
    if (prodARes.error) throw new Error("ProdA error: " + prodARes.error.message);
    productA = prodARes.data;

    // Setup Workspace B catalog com UUID real
    const catalogB = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22";
    await (supabaseAdmin.from("product_catalogs") as any).upsert({
      id: catalogB,
      workspace_id: wsB,
      name: "Catalog B",
      description: "Desc B"
    });

    const prodBRes = await (supabaseAdmin.from("products") as any).upsert({
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      workspace_id: wsB,
      name: "Produto B",
      catalog_id: catalogB,
      description: "Desc B"
    }).select().single();
    if (prodBRes.error) throw new Error("ProdB error: " + prodBRes.error.message);
    productB = prodBRes.data;

    const botRes = await (supabaseAdmin.from("salesbots") as any).upsert({
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      workspace_id: wsA,
      name: "Bot Teste"
    }).select().single();
    if (botRes.error) throw new Error("Bot error: " + botRes.error.message);
    salesbot = botRes.data;
  });

  afterAll(async () => {
    // Ordem inversa para evitar erros de FK
    await (supabaseAdmin.from("lead_products" as any) as any).delete().eq("lead_id", leadA?.id);
    if (leadA) await supabaseAdmin.from("leads").delete().eq("id", leadA.id);
    if (productA) await supabaseAdmin.from("products").delete().eq("id", productA.id);
    if (productB) await supabaseAdmin.from("products").delete().eq("id", productB.id);
    await supabaseAdmin.from("product_catalogs").delete().in("id", ["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22"]);
    if (salesbot) await supabaseAdmin.from("salesbots").delete().eq("id", salesbot.id);
    if (crmSource) await supabaseAdmin.from("crm_sources").delete().eq("id", crmSource.id);
    await supabaseAdmin.from("workspaces").delete().in("id", [wsA, wsB]);
  });

  it("vínculo normal: deve vincular produto do mesmo workspace", async () => {
    const blockId = "11111111-1111-1111-1111-111111111111";
    const res = await (supabaseAdmin.from("salesbot_blocks") as any).upsert({
      id: blockId,
      workspace_id: wsA,
      salesbot_id: salesbot.id,
      type: "acao",
      config: { 
        acaoTipo: "vincular-produto",
        productId: productA.id,
        productKind: "interesse",
        isStartBlock: true 
      },
      next_block_id: null
    });
    if (res.error) throw new Error("Upsert block error: " + res.error.message);

    const runId = await startSalesbotRun(supabaseAdmin as any, {
      workspaceId: wsA,
      salesbotId: salesbot.id,
      leadId: leadA.id
    });
    
    if (!runId) throw new Error("startSalesbotRun returned null");

    await sleep(400); // executeRun é chamado dentro de startSalesbotRun

    const { data: links } = await (supabaseAdmin
      .from("lead_products" as any) as any)
      .select()
      .eq("lead_id", leadA.id)
      .eq("product_id", productA.id);

    expect(links?.length).toBe(1);
    expect(links?.[0].kind).toBe("interesse");

    await supabaseAdmin.from("salesbot_blocks").delete().eq("id", blockId);
    await (supabaseAdmin.from("lead_products" as any) as any).delete().eq("lead_id", leadA.id);
  });

  it("idempotência: múltiplas execuções não duplicam vínculo", async () => {
    const blockId = "22222222-2222-2222-2222-222222222222";
    const res = await (supabaseAdmin.from("salesbot_blocks") as any).upsert({
      id: blockId,
      workspace_id: wsA,
      salesbot_id: salesbot.id,
      type: "acao",
      config: { 
        acaoTipo: "vincular-produto",
        productId: productA.id,
        productKind: "interesse",
        isStartBlock: true 
      },
      next_block_id: null
    });
    if (res.error) throw new Error("Upsert block error: " + res.error.message);

    const runId = await startSalesbotRun(supabaseAdmin as any, {
      workspaceId: wsA,
      salesbotId: salesbot.id,
      leadId: leadA.id
    });
    
    if (!runId) throw new Error("startSalesbotRun returned null");

    // Tentar executar novamente manualmente
    await executeRun(supabaseAdmin as any, runId);
    await sleep(400);

    const { data: links } = await (supabaseAdmin
      .from("lead_products" as any) as any)
      .select()
      .eq("lead_id", leadA.id)
      .eq("product_id", productA.id);

    expect(links?.length).toBe(1);

    await supabaseAdmin.from("salesbot_blocks").delete().eq("id", blockId);
    await (supabaseAdmin.from("lead_products" as any) as any).delete().eq("lead_id", leadA.id);
  });

  it("cross-workspace: deve bloquear produto de outro workspace", async () => {
    const blockId = "33333333-3333-3333-3333-333333333333";
    const res = await (supabaseAdmin.from("salesbot_blocks") as any).upsert({
      id: blockId,
      workspace_id: wsA,
      salesbot_id: salesbot.id,
      type: "acao",
      config: { 
        acaoTipo: "vincular-produto",
        productId: productB.id,
        productKind: "interesse",
        isStartBlock: true 
      },
      next_block_id: null
    });
    if (res.error) throw new Error("Upsert block error: " + res.error.message);

    const runId = await startSalesbotRun(supabaseAdmin as any, {
      workspaceId: wsA,
      salesbotId: salesbot.id,
      leadId: leadA.id
    });
    
    if (!runId) throw new Error("startSalesbotRun returned null");
    await sleep(400);

    const { data: links } = await (supabaseAdmin
      .from("lead_products" as any) as any)
      .select()
      .eq("lead_id", leadA.id)
      .eq("product_id", productB.id);

    expect(links?.length).toBe(0);

    const { data: logs, error: logErr } = await (supabaseAdmin
      .from("salesbot_run_logs" as any) as any)
      .select()
      .eq("salesbot_run_id", runId);
    
    if (logErr) console.error("Final log fetch error:", logErr);
    expect(logs?.some((l: any) => l.status === "error" && l.message?.toLowerCase().includes("workspace"))).toBe(true);

    await supabaseAdmin.from("salesbot_blocks").delete().eq("id", blockId);
  });
});