import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeadTagsInternal } from "../ai-agent-context.server";

describe("AI Agent Context Engine - Tags", () => {
  const RUN_ID = crypto.randomUUID();

  let wsAId: string;
  let wsBId: string;
  let sourceId: string;
  let leadWithTagsId: string;
  let leadNoTagsId: string;

  beforeAll(async () => {
    // 1. Obter um perfil existente para o workspace
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1)
      .single();

    if (!profiles) throw new Error("Nenhum perfil encontrado para o teste.");
    const profileId = profiles.id;

    // 2. Criar Workspaces A e B (IDs reais gerados pelo banco)
    const { data: workspaces, error: wsError } = await supabaseAdmin
      .from("workspaces")
      .insert([
        { name: `WS Test Tags A ${RUN_ID}`, owner_id: profileId, slug: `ws-tags-a-${RUN_ID}` },
        { name: `WS Test Tags B ${RUN_ID}`, owner_id: profileId, slug: `ws-tags-b-${RUN_ID}` },
      ])
      .select("id, slug");
    if (wsError || !workspaces) throw new Error(`Falha ao criar workspaces: ${wsError?.message}`);

    wsAId = workspaces.find((w) => w.slug === `ws-tags-a-${RUN_ID}`)!.id;
    wsBId = workspaces.find((w) => w.slug === `ws-tags-b-${RUN_ID}`)!.id;

    // 3. Criar CRM Source no WS A
    const { data: source, error: sourceError } = await supabaseAdmin
      .from("crm_sources")
      .insert({ workspace_id: wsAId, display_name: `Source Tags ${RUN_ID}`, provider: "mkton" })
      .select("id")
      .single();
    if (sourceError || !source) throw new Error(`Falha ao criar CRM source: ${sourceError?.message}`);
    sourceId = source.id;

    // 4. Criar Leads no WS A
    const { data: leads, error: leadError } = await supabaseAdmin
      .from("leads")
      .insert([
        {
          workspace_id: wsAId,
          crm_source_id: sourceId,
          name: `Lead With Tags ${RUN_ID}`,
          tags: ["VIP", "Hot"],
          status: "active",
        },
        {
          workspace_id: wsAId,
          crm_source_id: sourceId,
          name: `Lead No Tags ${RUN_ID}`,
          tags: [],
          status: "active",
        },
      ])
      .select("id, name");
    if (leadError || !leads) throw new Error(`Falha ao criar leads: ${leadError?.message}`);

    leadWithTagsId = leads.find((l) => l.name === `Lead With Tags ${RUN_ID}`)!.id;
    leadNoTagsId = leads.find((l) => l.name === `Lead No Tags ${RUN_ID}`)!.id;
  });

  afterAll(async () => {
    // Cleanup: somente os registros criados por este arquivo
    await supabaseAdmin.from("leads").delete().in("id", [leadWithTagsId, leadNoTagsId]);
    await supabaseAdmin.from("crm_sources").delete().eq("id", sourceId);
    await supabaseAdmin.from("workspaces").delete().in("id", [wsAId, wsBId]);
  });

  it("TEST 14: Lead com duas tags -> retorna exatamente as duas", async () => {
    const result = await getLeadTagsInternal({
      workspaceId: wsAId,
      leadId: leadWithTagsId,
    });

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ id: "VIP", nome: "VIP" });
    expect(result).toContainEqual({ id: "Hot", nome: "Hot" });
  });

  it("TEST 15: Lead sem tags -> retorna []", async () => {
    const result = await getLeadTagsInternal({
      workspaceId: wsAId,
      leadId: leadNoTagsId,
    });

    expect(result).toEqual([]);
  });

  it("TEST 16: Outro workspace -> não pode acessar as tags do lead", async () => {
    const result = await getLeadTagsInternal({
      workspaceId: wsBId,
      leadId: leadWithTagsId,
    });

    expect(result).toEqual([]);
  });
});
