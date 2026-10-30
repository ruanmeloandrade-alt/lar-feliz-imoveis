import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Context Engine - Identity
 * Retorna a identidade básica real do lead com isolamento de workspace.
 */
export async function getLeadIdentityInternal(data: {
  workspaceId: string;
  leadId: string;
}) {
  const { workspaceId, leadId } = data;
  
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select("id, name, phone, email, workspace_id")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar identidade do lead: ${JSON.stringify(error)}`);
  }
  
  if (!lead) {
    return null;
  }

  return {
    id: lead.id,
    nome: lead.name ?? null,
    telefone: lead.phone ?? null,
    email: lead.email ?? null,
  };
}

/**
 * Context Engine - CRM Position
 * Retorna a posição atual do lead no pipeline e etapa do CRM.
 */
export async function getLeadCrmPositionInternal(data: {
  workspaceId: string;
  leadId: string;
}) {
  const { workspaceId, leadId } = data;

  // Busca o lead com JOIN para pipeline e stage
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select(`
      id,
      workspace_id,
      pipeline_id,
      stage_id,
      pipelines!leads_pipeline_id_fkey (id, name),
      pipeline_stages!leads_stage_id_fkey (id, name)
    `)
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar posição do lead no CRM: ${error.message}`);
  }

  if (!lead || (!lead.pipeline_id && !lead.stage_id)) {
    return null;
  }

  return {
    pipeline: lead.pipelines ? {
      id: lead.pipelines.id,
      name: lead.pipelines.name
    } : null,
    stage: lead.pipeline_stages ? {
      id: lead.pipeline_stages.id,
      name: lead.pipeline_stages.name
    } : null,
  };
}

/**
 * Context Engine - Tags
 * Retorna as tags atuais do lead com isolamento de workspace.
 */
export async function getLeadTagsInternal(data: {
  workspaceId: string;
  leadId: string;
}) {
  const { workspaceId, leadId } = data;

  // Em MKTON, as tags de lead são armazenadas na coluna 'tags' da tabela leads.
  // Pelo código auditado em salesbot-runtime, ela é tratada como um array de strings ou objetos.
  
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select("id, workspace_id, tags")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar tags do lead: ${error.message}`);
  }

  if (!lead || !lead.tags) {
    return [];
  }

  const rawTags = lead.tags;
  
  // Normalização: se for array, processa. Se não, retorna vazio.
  if (!Array.isArray(rawTags)) {
    return [];
  }

  // O sistema suporta tags como strings ou objetos {name: string}.
  // O Objetivo Único pede id e nome.
  return rawTags.map((tag: any) => {
    const nome = typeof tag === 'string' ? tag : (tag?.name || tag?.nome || String(tag));
    return {
      id: nome,
      nome: nome
    };
  });
}

/**
 * Context Engine - Custom Fields
 * Retorna os campos personalizados preenchidos do lead com isolamento de workspace.
 */
export async function getLeadCustomFieldsInternal(data: {
  workspaceId: string;
  leadId: string;
}) {
  const { workspaceId, leadId } = data;

  // Busca valores dos campos personalizados com JOIN para o nome do campo
  const { data: values, error } = await supabaseAdmin
    .from("lead_custom_field_values")
    .select(`
      id,
      value,
      field_id,
      lead_custom_fields (
        id,
        name
      )
    `)
    .eq("lead_id", leadId)
    .eq("workspace_id", workspaceId)
    .not("value", "is", null);

  if (error) {
    throw new Error(`Erro ao buscar campos personalizados do lead: ${error.message}`);
  }

  if (!values || values.length === 0) {
    return [];
  }

  // Mapeia para o formato solicitado, filtrando campos sem nome (embora improvável)
  return values
    .filter((v: any) => v.lead_custom_fields && v.value !== undefined && v.value !== "")
    .map((v: any) => ({
      id: v.lead_custom_fields.id,
      nome: v.lead_custom_fields.name,
      valor: v.value
    }));
}

/**
 * Context Engine - Responsible
 * Retorna o responsável atual do lead (da tabela profiles) com isolamento de workspace.
 */
export async function getLeadResponsibleInternal(data: {
  workspaceId: string;
  leadId: string;
}) {
  const { workspaceId, leadId } = data;

  // Busca o lead
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select(`
      id,
      workspace_id,
      responsible_id
    `)
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar responsável do lead: ${error.message}`);
  }

  // Se o lead não existir ou não tiver responsável_id
  if (!lead || !lead.responsible_id) {
    return null;
  }

  // Busca o profile do responsável separadamente para evitar erro de schema cache no join
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, display_name")
    .eq("id", lead.responsible_id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Erro ao buscar profile do responsável: ${profileError.message}`);
  }

  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    nome: profile.full_name || profile.display_name || "Sem Nome"
  };
}

/**
 * Context Engine - Origin
 * Retorna a origem atual do lead (da tabela crm_sources) com isolamento de workspace.
 */
export async function getLeadOriginInternal(data: {
  workspaceId: string;
  leadId: string;
}) {
  const { workspaceId, leadId } = data;

  // Busca o lead com JOIN para a origem
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select(`
      id,
      workspace_id,
      crm_source_id,
      crm_sources!leads_crm_source_id_fkey (
        id,
        display_name,
        provider,
        workspace_id
      )
    `)
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar origem do lead: ${error.message}`);
  }

  // Se o lead não existir ou não tiver crm_source_id
  if (!lead || !lead.crm_source_id || !lead.crm_sources) {
    return null;
  }

  // Validação extra de segurança: a origem deve pertencer ao mesmo workspace do lead
  // Nota: O join acima já filtra pela FK, mas o crm_sources.workspace_id deve bater.
  if (lead.crm_sources.workspace_id !== workspaceId) {
    return null;
  }

  return {
    id: lead.crm_sources.id,
    nome: lead.crm_sources.display_name || null,
    provider: lead.crm_sources.provider || null
  };
}

/**
 * Context Engine - Recent History
 * Retorna as mensagens recentes da conversa individual do lead com isolamento de workspace.
 * Tabelas: channel_messages (Meta DMs) e whatsapp_web_messages (WhatsApp Web/Evolution).
 */
export async function getLeadRecentHistoryInternal(data: {
  workspaceId: string;
  leadId: string;
  limit?: number;
}) {
  const { workspaceId, leadId } = data;
  
  // O limit já vem validado pelo Zod no handler da function.
  // Aqui apenas aplicamos o default caso venha undefined internamente.
  const limit = data.limit ?? 20;

  // 1. Validar lead e workspace
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("id, workspace_id, phone, messenger_psid, instagram_igsid")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (leadError) {
    throw new Error(`Erro ao validar lead para histórico: ${leadError.message}`);
  }

  if (!lead) {
    return [];
  }

  // 2. Buscar mensagens de ambos os canais (Meta e WhatsApp)
  // Nota: Em MKTON, as mensagens individuais são unificadas pelo lead_id (Meta) e remote_jid (WhatsApp).
  // Em MKTON, as mensagens individuais são unificadas pelo lead_id (Meta) e telefone (WhatsApp).
  const phoneDigits = (lead.phone ?? "").replace(/\D/g, "");
  const jid = phoneDigits ? `${phoneDigits}@s.whatsapp.net` : null;

  const [metaRes, waRes] = await Promise.all([
    supabaseAdmin
      .from("channel_messages")
      .select("id, direction, text, received_at")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", leadId)
      .order("received_at", { ascending: false })
      .limit(limit),
    jid ? supabaseAdmin
      .from("whatsapp_web_messages")
      .select("id, from_me, body, received_at, remote_jid")
      .eq("workspace_id", workspaceId)
      .eq("remote_jid", jid) // Vínculo canônico exato (JID)
      .order("received_at", { ascending: false })
      .limit(limit)
    : Promise.resolve({ data: [], error: null })
  ]);

  // 3. Normalizar e Unificar
  const metaMsgs = (metaRes.data || []).map(m => ({
    id: m.id,
    direcao: m.direction === "in" ? "cliente" : "time",
    conteudo: m.text || "",
    data: m.received_at
  }));

  const waMsgs = (waRes.data || []).map(m => ({
    id: m.id,
    direcao: m.from_me ? "time" : "cliente",
    conteudo: m.body || "",
    data: m.received_at
  }));

  // 4. Ordenar cronologicamente e aplicar limite final
  const allMsgs = [...metaMsgs, ...waMsgs]
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  
  return allMsgs.slice(-limit);
}

/**
 * ETAPA 01.3H - Contexto Canônico Consolidado do Lead
 * Consolida todas as fontes de dados do Context Engine em um único objeto.
 */
export async function getLeadCanonicalContextInternal(data: {
  workspaceId: string;
  leadId: string;
  historyLimit?: number;
}) {
  const { workspaceId, leadId } = data;
  const historyLimit = data.historyLimit ?? 20;

  // 1. Verificar existência do lead e isolamento de workspace imediatamente
  const identity = await getLeadIdentityInternal({ workspaceId, leadId });
  
  // Se o lead não existir no workspace, retornar null (Regra de Negócio)
  if (!identity) {
    return null;
  }

  // 2. Coletar todas as informações em paralelo usando as funções já aprovadas
  const [crm, tags, customFields, responsible, origin, recentHistory] = await Promise.all([
    getLeadCrmPositionInternal({ workspaceId, leadId }),
    getLeadTagsInternal({ workspaceId, leadId }),
    getLeadCustomFieldsInternal({ workspaceId, leadId }),
    getLeadResponsibleInternal({ workspaceId, leadId }),
    getLeadOriginInternal({ workspaceId, leadId }),
    getLeadRecentHistoryInternal({ workspaceId, leadId, limit: historyLimit })
  ]);

  // 3. Estruturar o objeto consolidado conforme o contrato
  return {
    identity,
    crm,
    tags,
    customFields,
    responsible,
    origin,
    recentHistory
  };
}

/**
 * ETAPA 01.3I-C - Contrato estável do Contexto Operacional do Lead.
 * Representa exatamente o retorno de buildLeadOperationalContextInternal.
 * Reutilizável por Agente IA, Sales Bot e Automações.
 */
export type LeadOperationalContextMessage = Awaited<
  ReturnType<typeof getLeadRecentHistoryInternal>
>[number];

export type LeadOperationalContext = {
  lead: {
    id: string;
    nome: string | null;
    telefone: string | null;
    email: string | null;
  };
  crm: {
    pipeline: { id: string; name: string } | null;
    etapa: { id: string; name: string } | null;
  };
  responsavel: Awaited<ReturnType<typeof getLeadResponsibleInternal>>;
  origem: Awaited<ReturnType<typeof getLeadOriginInternal>>;
  tags: Awaited<ReturnType<typeof getLeadTagsInternal>>;
  camposPersonalizados: Awaited<ReturnType<typeof getLeadCustomFieldsInternal>>;
  conversa: {
    mensagensRecentes: LeadOperationalContextMessage[];
    ultimaMensagem: LeadOperationalContextMessage | null;
    ultimaMensagemDoLead: LeadOperationalContextMessage | null;
    ultimaMensagemDaEmpresa: LeadOperationalContextMessage | null;
  };
};

/**
 * ETAPA 01.3I-A - Contexto Operacional do Agente
 * SOMENTE LEITURA. Reorganiza o contexto canônico em uma visão operacional.
 * Não realiza nenhuma consulta adicional ao banco.
 */
export async function buildLeadOperationalContextInternal(data: {
  workspaceId: string;
  leadId: string;
  historyLimit?: number;
}): Promise<LeadOperationalContext | null> {
  const canonical = await getLeadCanonicalContextInternal(data);

  if (!canonical) {
    return null;
  }

  // Estado da conversa derivado SOMENTE do histórico já carregado (ordem cronológica crescente)
  const historico = canonical.recentHistory;
  const ultimaMensagem = historico.length > 0 ? historico[historico.length - 1] : null;
  const ultimaMensagemDoLead =
    [...historico].reverse().find((m) => m.direcao === "cliente") ?? null;
  const ultimaMensagemDaEmpresa =
    [...historico].reverse().find((m) => m.direcao === "time") ?? null;

  return {
    lead: {
      id: canonical.identity.id,
      nome: canonical.identity.nome,
      telefone: canonical.identity.telefone,
      email: canonical.identity.email,
    },
    crm: {
      pipeline: canonical.crm?.pipeline ?? null,
      etapa: canonical.crm?.stage ?? null,
    },
    responsavel: canonical.responsible,
    origem: canonical.origin,
    tags: canonical.tags,
    camposPersonalizados: canonical.customFields,
    conversa: {
      mensagensRecentes: historico,
      ultimaMensagem,
      ultimaMensagemDoLead,
      ultimaMensagemDaEmpresa,
    },
  };

}
