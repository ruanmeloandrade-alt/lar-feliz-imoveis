/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySb = { from: (table: string) => any };

type GroupContextInput = {
  workspaceId: string;
  groupJid: string;
  groupId?: string | null;
  groupName?: string | null;
  sessionId?: string | null;
};

async function resolveWhatsappCrmSourceId(
  admin: AnySb,
  workspaceId: string,
  sessionId?: string | null,
): Promise<string> {
  if (sessionId) {
    const { data: bySession } = await admin
      .from("crm_sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("provider", "whatsapp")
      .eq("external_account_id", sessionId)
      .limit(1)
      .maybeSingle();
    if (bySession?.id) return String(bySession.id);
  }

  const { data: anyWhatsapp } = await admin
    .from("crm_sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "whatsapp")
    .limit(1)
    .maybeSingle();
  if (anyWhatsapp?.id) return String(anyWhatsapp.id);

  // Alguns ambientes ainda não aceitam `provider = whatsapp` na constraint
  // de crm_sources. O contexto técnico do grupo não depende de uma origem
  // exclusiva: reutilize a origem padrão (ou qualquer origem válida) do
  // workspace antes de tentar criar uma nova.
  const { data: defaultSource } = await admin
    .from("crm_sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  if (defaultSource?.id) return String(defaultSource.id);

  const { data: anySource } = await admin
    .from("crm_sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();
  if (anySource?.id) return String(anySource.id);

  // `mkton` é aceito pela constraint atual e funciona como origem técnica
  // neutra caso o workspace ainda não possua nenhuma origem cadastrada.
  const { data: created, error } = await admin
    .from("crm_sources")
    .insert({
      workspace_id: workspaceId,
      provider: "mkton",
      display_name: "MktOn - Grupos",
      external_account_id: sessionId ?? null,
      is_default: false,
    })
    .select("id")
    .single();
  if (error || !created?.id) {
    throw new Error(error?.message ?? "Não foi possível criar a origem técnica do grupo.");
  }
  return String(created.id);
}

/**
 * O runtime do SalesBot usa `lead_id` como contexto de execução. Para grupos,
 * este registro é puramente técnico: `phone` contém o JID `@g.us` do grupo e
 * nenhuma pessoa/membro é escolhida como lead do disparo.
 */
export async function resolveOrCreateGroupTechnicalLead(
  admin: AnySb,
  input: GroupContextInput,
): Promise<string> {
  const { workspaceId, groupJid } = input;
  const originSessionId = input.sessionId;
  if (!originSessionId) throw new Error("A sessão de origem do grupo não foi identificada.");
  const exact = await admin
    .from("leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("phone", groupJid)
    .eq("custom_data->>whatsapp_session_id", originSessionId)
    .eq("custom_data->>technical_group_context", "true")
    .limit(1)
    .maybeSingle();
  if (exact.error) throw new Error("Não foi possível conferir o contexto do grupo nesta sessão.");
  if (exact.data?.id) return String(exact.data.id);

  let groupId = input.groupId ?? null;
  let groupName = input.groupName ?? null;
  const sessionId = originSessionId;
  if (!groupId || !groupName) {
    const { data: group, error: groupError } = await admin
      .from("whatsapp_groups")
      .select("id, name, subject, session_id")
      .eq("workspace_id", workspaceId)
      .eq("group_jid", groupJid)
      .eq("session_id", sessionId)
      .limit(1)
      .maybeSingle();
    if (groupError) throw new Error("Não foi possível conferir os dados do grupo nesta sessão.");
    groupId = groupId ?? group?.id ?? null;
    groupName = groupName ?? group?.name ?? group?.subject ?? null;
  }

  const crmSourceId = await resolveWhatsappCrmSourceId(admin, workspaceId, sessionId);
  const now = new Date().toISOString();
  const { data: created, error } = await admin
    .from("leads")
    .insert({
      workspace_id: workspaceId,
      crm_source_id: crmSourceId,
      name: `[Grupo] ${groupName || groupJid}`,
      phone: groupJid,
      // JID de grupo não é telefone. Mantemos a normalização vazia para não
      // colidir com constraints/índices usados por leads 1-a-1.
      phone_normalized: null,
      source: "whatsapp_group",
      status: "active",
      custom_data: {
        technical_group_context: true,
        whatsapp_group_id: groupId,
        whatsapp_group_jid: groupJid,
        whatsapp_remote_jid: groupJid,
        whatsapp_session_id: sessionId,
      },
      tags: [],
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (!error && created?.id) return String(created.id);

  // Corrida entre duas requisições: se outra criou o contexto primeiro,
  // reaproveita o registro em vez de transformar isso em erro para o usuário.
  const retry = await admin
    .from("leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("phone", groupJid)
    .eq("custom_data->>whatsapp_session_id", originSessionId)
    .eq("custom_data->>technical_group_context", "true")
    .limit(1)
    .maybeSingle();
  if (retry.data?.id) return String(retry.data.id);

  throw new Error(error?.message ?? "Não foi possível criar o contexto técnico do grupo.");
}
