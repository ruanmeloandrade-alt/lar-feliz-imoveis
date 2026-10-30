// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const DAY_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const AUTONOMY_RULES: Record<string, string> = {
  leitura:
    "MODO SOMENTE LEITURA: você apenas lê e explica o que está acontecendo. NÃO proponha executar nada automaticamente e deixe claro que qualquer ação é manual, feita pelo usuário.",
  relatorio:
    "MODO LEITURA + RELATÓRIO: você lê a operação e entrega relatórios/diagnósticos estruturados (o que melhorou, o que piorou, gargalos, previsão). Não executa ações.",
  sugestao:
    "MODO SUGESTÃO DE AÇÃO: além do diagnóstico, você propõe ações concretas (mover etapa, criar tarefa, follow-up, nota) sempre pedindo aprovação explícita antes. Nunca assuma que foi aprovado.",
  automatico:
    "MODO AUTOMÁTICO (piloto do CRM): você toma conta do CRM dentro das regras e limites definidos, agindo por conta própria dentro do horário de operação. Ações fora das regras, fora do horário ou acima do limite exigem aprovação do usuário.",
};

const TASK_LABEL: Record<string, string> = {
  leads_parados: "identificar leads parados na mesma etapa",
  follow_up: "cobrar follow-up de leads sem contato",
  sem_resposta: "detectar conversas sem resposta do time",
  higienizacao: "higienizar base (dados faltando, leads frios)",
  qualificacao: "qualificar leads novos",
  mover_etapa: "mover leads de etapa quando o critério for atendido",
  criar_tarefa: "criar tarefas para os responsáveis",
  registrar_nota: "registrar notas de contexto no lead",
  previsao_receita: "projetar receita do funil",
  alerta_sla: "alertar quebras de SLA de atendimento",
  resumo_diario: "entregar resumo diário da operação",
  detectar_duplicados: "detectar leads duplicados",
};

export function buildCrmAgentRulesBlock(
  config: Record<string, unknown> | null,
  pipelineNames?: Map<string, string>,
): string {
  if (!config) {
    return "Configuração operacional: ainda não definida. Opere em modo consultivo (somente leitura) e sugira que o usuário configure dias, horário, autonomia e regras na aba Agente IA do CRM.";
  }
  const autonomy = String(config.autonomy ?? "relatorio");
  const days = (Array.isArray(config.active_days) ? (config.active_days as number[]) : [])
    .map((d) => DAY_LABEL[d] ?? String(d))
    .join(", ");
  const tasks = (Array.isArray(config.tasks) ? (config.tasks as string[]) : [])
    .map((t) => TASK_LABEL[t] ?? t)
    .join("; ");
  const scopeIds = Array.isArray(config.pipeline_ids) ? (config.pipeline_ids as string[]) : [];
  const scope = scopeIds.length
    ? scopeIds.map((id) => pipelineNames?.get(id) ?? id).join(", ")
    : "todos os funis do workspace";
  return [
    `AGENTE "${String(config.name ?? "Gestor de CRM")}", REGRAS OPERACIONAIS (definidas pelo dono do workspace):`,
    `- Funis sob responsabilidade deste agente: ${scope}. Não opere fora desses funis.`,
    `- Agente ligado: ${config.enabled ? "sim" : "não"}.`,
    `- ${AUTONOMY_RULES[autonomy] ?? AUTONOMY_RULES.relatorio}`,
    `- Dias de operação: ${days || "nenhum definido"}.`,
    `- Horário de operação: ${String(config.start_time ?? "").slice(0, 5)} às ${String(config.end_time ?? "").slice(0, 5)} (${config.timezone ?? "America/Sao_Paulo"}).`,
    `- Frequência de verificação: a cada ${config.check_interval_minutes ?? 60} minutos.`,
    `- Responsabilidades habilitadas: ${tasks || "nenhuma marcada"}.`,
    `- Limite de ações automáticas por dia: ${config.max_actions_per_day ?? 0}.`,
    `- Aprovação obrigatória para leads com valor acima de R$ ${config.require_approval_above ?? 0} (0 = sem limite de valor).`,
    `- Canal de relatório: ${config.report_channel ?? "painel"}${config.report_time ? ` às ${String(config.report_time).slice(0, 5)}` : ""}.`,
    config.rules ? `\nREGRAS ESCRITAS PELO USUÁRIO (prioridade máxima):\n${String(config.rules)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Monta o retrato real da operação de CRM do workspace para o agente. */
export async function buildCrmContext(supabase: AnySupabase, workspaceId: string): Promise<string> {
  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => any;
    };
  };

  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [cfgRes, pipelinesRes, stagesRes, leadsRes, activitiesRes, messagesRes, tasksRes, fieldsRes, fieldValuesRes] =
    await Promise.all([
      sb.from("crm_agent_config").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
      sb.from("pipelines").select("id,name,position").eq("workspace_id", workspaceId).order("position"),
      sb
        .from("pipeline_stages")
        .select("id,name,pipeline_id,position")
        .eq("workspace_id", workspaceId)
        .order("position"),
      sb
        .from("leads")
        .select(
          "id,name,status,value,stage_id,pipeline_id,source,conversation_status,last_message_from,responsible_id,created_at,updated_at",
        )
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(400),
      sb
        .from("lead_activities")
        .select("lead_id,type,occurred_at")
        .eq("workspace_id", workspaceId)
        .gte("occurred_at", since30)
        .order("occurred_at", { ascending: false })
        .limit(300),
      sb
        .from("channel_messages")
        .select("lead_id,channel,direction,text,received_at")
        .eq("workspace_id", workspaceId)
        .order("received_at", { ascending: false })
        .limit(120),
      sb
        .from("tasks")
        .select("id,title,status,due_at,lead_id")
        .eq("workspace_id", workspaceId)
        .order("due_at", { ascending: true })
        .limit(80),
      sb.from("lead_custom_fields").select("id,name,field_type").eq("workspace_id", workspaceId).order("name"),
      sb.from("lead_custom_field_values").select("lead_id,field_id,value").eq("workspace_id", workspaceId),
    ]);

  const pipelines = (pipelinesRes.data ?? []) as Array<{ id: string; name: string }>;
  const stages = (stagesRes.data ?? []) as Array<{ id: string; name: string; pipeline_id: string; position: number }>;
  const leads = (leadsRes.data ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    value: number | null;
    stage_id: string | null;
    pipeline_id: string | null;
    source: string | null;
    conversation_status: string | null;
    last_message_from: string | null;
    created_at: string;
    updated_at: string;
  }>;
  const activities = (activitiesRes.data ?? []) as Array<{ lead_id: string; type: string; occurred_at: string }>;
  const messages = (messagesRes.data ?? []) as Array<{
    lead_id: string | null;
    channel: string;
    direction: string;
    text: string | null;
    received_at: string;
  }>;
  const tasks = (tasksRes.data ?? []) as Array<{ title: string; status: string; due_at: string | null }>;
  const customFields = (fieldsRes.data ?? []) as Array<{ id: string; name: string; field_type: string }>;
  const customValues = (fieldValuesRes.data ?? []) as Array<{ lead_id: string; field_id: string; value: unknown }>;

  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const pipeName = new Map(pipelines.map((p) => [p.id, p.name]));
  const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);

  const lines: string[] = [];
  const agentRows = (cfgRes.data ?? []) as Array<Record<string, unknown>>;
  if (agentRows.length === 0) {
    lines.push(buildCrmAgentRulesBlock(null));
  } else {
    lines.push(
      `Este workspace tem ${agentRows.length} agente(s) gestor(es) de CRM. Cada um responde por funis específicos e nunca deve agir sobre funil de outro agente.`,
    );
    agentRows.forEach((row) => {
      lines.push("");
      lines.push(buildCrmAgentRulesBlock(row, pipeName));
    });
  }
  lines.push("");
  lines.push("=== RETRATO ATUAL DO CRM ===");
  lines.push(`Funis: ${pipelines.map((p) => p.name).join(", ") || "nenhum"}.`);
  lines.push(`Campos personalizados disponíveis: ${customFields.map((f) => `${f.name} [id ${f.id}, tipo ${f.field_type}]`).join("; ") || "nenhum"}.`);

  for (const p of pipelines) {
    const pipeLeads = leads.filter((l) => l.pipeline_id === p.id);
    const pipeStages = stages.filter((s) => s.pipeline_id === p.id);
    const total = pipeLeads.reduce((acc, l) => acc + (l.value ?? 0), 0);
    lines.push(`\nFunil "${p.name}", ${pipeLeads.length} leads, valor em aberto ${brl(total)}:`);
    for (const s of pipeStages) {
      const inStage = pipeLeads.filter((l) => l.stage_id === s.id);
      if (inStage.length === 0) {
        lines.push(`- ${s.name}: 0 lead`);
        continue;
      }
      const media = Math.round(inStage.reduce((a, l) => a + daysAgo(l.updated_at), 0) / inStage.length);
      lines.push(
        `- ${s.name}: ${inStage.length} leads, ${brl(inStage.reduce((a, l) => a + (l.value ?? 0), 0))}, tempo médio parado ${media} dia(s)`,
      );
    }
  }

  const parados = leads
    .filter((l) => daysAgo(l.updated_at) >= 7 && l.status !== "won" && l.status !== "lost")
    .slice(0, 25);
  lines.push("\nLeads parados há 7+ dias (prioridade de follow-up):");
  if (parados.length === 0) lines.push("- nenhum");
  for (const l of parados) {
    const values = customValues
      .filter((v) => v.lead_id === l.id)
      .map((v) => {
        const field = customFields.find((f) => f.id === v.field_id);
        const raw = v.value as { display?: unknown; raw?: unknown } | null;
        const value = raw && typeof raw === "object" && raw.display !== undefined ? raw.display : v.value;
        return field ? `${field.name}=${String(value ?? "")}` : "";
      })
      .filter(Boolean)
      .join("; ");
    lines.push(
      `- ${l.name} (id ${l.id}) · ${pipeName.get(l.pipeline_id ?? "") ?? "sem funil"} / ${stageName.get(l.stage_id ?? "") ?? "sem etapa"} · ${daysAgo(l.updated_at)} dias parado · valor ${brl(l.value ?? 0)} · origem ${l.source ?? "não informada"} · última mensagem de ${l.last_message_from ?? "?"}${values ? ` · campos: ${values}` : ""}`,
    );
  }

  const semResposta = leads.filter((l) => l.last_message_from === "lead").slice(0, 20);
  lines.push("\nLeads cuja última mensagem foi do cliente (time não respondeu):");
  lines.push(semResposta.length ? semResposta.map((l) => `- ${l.name} (id ${l.id})`).join("\n") : "- nenhum");

  const byStatus = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});
  lines.push(
    `\nDistribuição por status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(", ") || "sem leads"}.`,
  );

  const bySource = leads.reduce<Record<string, number>>((acc, l) => {
    const k = l.source ?? "não informada";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  lines.push(`Origens: ${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join(", ") || "sem dados"}.`);

  lines.push("\nÚltimas interações registradas (histórico de movimentação):");
  lines.push(
    activities.slice(0, 40).map((a) => {
      const lead = leads.find((l) => l.id === a.lead_id);
      return `- ${new Date(a.occurred_at).toLocaleString("pt-BR")} · ${lead?.name ?? a.lead_id} · ${a.type}`;
    }).join("\n") || "- nenhuma",
  );

  lines.push("\nÚltimas mensagens trocadas (para entender o porquê de cada lead ter ido pra um lado):");
  lines.push(
    messages.slice(0, 40).map((m) => {
      const lead = leads.find((l) => l.id === m.lead_id);
      const txt = (m.text ?? "").replace(/\s+/g, " ").slice(0, 180);
      return `- ${new Date(m.received_at).toLocaleString("pt-BR")} · ${lead?.name ?? m.lead_id ?? "?"} · ${m.channel} · ${m.direction === "in" ? "cliente" : "time"}: ${txt}`;
    }).join("\n") || "- nenhuma",
  );

  const abertas = tasks.filter((t) => t.status !== "done");
  lines.push(
    `\nTarefas de CRM em aberto: ${abertas.length}. Próximas: ${abertas.slice(0, 8).map((t) => `${t.title}${t.due_at ? ` (vence ${new Date(t.due_at).toLocaleDateString("pt-BR")})` : ""}`).join("; ") || "nenhuma"}.`,
  );

  return lines.join("\n");
}
