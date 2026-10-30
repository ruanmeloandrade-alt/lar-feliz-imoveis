import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { provisionMktonLeadEntryAutomation } from "@/lib/mkton-lead-entry-automation.server";
import { resolveExistingMktonFunnel } from "@/lib/mkton-existing-funnel-resolver.server";
import { MKTON_FUNNELS, MKTON_TRACKING_FIELDS } from "@/config/marketon-operation";

type AnySb = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type StageRow = {
  id: string;
  name: string;
  position: number | null;
  description: string | null;
  pipeline_id?: string;
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const LEAD_ENTRY_ALIASES: Record<string, string[]> = {
  reception: ["recepcao de lead", "recepcao", "novo lead", "entrada", "lead recebido"],
  in_service: ["em atendimento", "atendimento", "qualificacao", "qualificando"],
  follow: ["follow", "follow up", "follow-up", "reaquecimento"],
  registered: ["cadastro realizado", "cadastrado", "cadastro concluido"],
  cad_lost: ["cad lost", "lost", "perdido", "nao cadastrado", "não cadastrado"],
};

const STAGE_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#6b7280"] as const;

const FIELD_LABELS: Record<(typeof MKTON_TRACKING_FIELDS)[number], string> = {
  origem_canal: "Origem · Canal",
  origem_plataforma: "Origem · Plataforma",
  utm_source: "UTM · Source",
  utm_medium: "UTM · Medium",
  utm_campaign: "UTM · Campaign",
  utm_content: "UTM · Content",
  utm_term: "UTM · Term",
  youtube_video: "Origem · Vídeo YouTube",
  origem_conversao: "Conversão · Origem",
  link_tracking_cadastro: "Conversão · Link de cadastro",
  nicho: "Perfil · Nicho",
  status_jornada: "Jornada · Status",
  status_trial: "Trial · Status",
  inicio_trial: "Trial · Início",
  fim_trial: "Trial · Fim",
  status_assinatura: "Assinatura · Status",
  plano: "Assinatura · Plano",
  inicio_plano: "Assinatura · Início do plano",
  fim_plano: "Assinatura · Fim do plano",
  status_onboarding: "Onboarding · Status",
  status_renovacao: "Renovação · Status",
  origem_reativacao: "Reativação · Origem",
};

const DATE_FIELDS = new Set(["inicio_trial", "fim_trial", "inicio_plano", "fim_plano"]);

async function resolveWorkspace(sb: AnySb, userId: string) {
  const workspaceId = await requireActiveWorkspace(sb as never, userId);
  const { data: workspace, error } = await sb
    .from("workspaces")
    .select("id,name,slug")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!workspace) throw new Error("Workspace ativo não encontrado.");
  const identity = normalize(`${workspace.name ?? ""} ${workspace.slug ?? ""}`);
  return {
    workspaceId,
    workspace,
    isMkton: identity.includes("mkton") || identity.includes("marketon"),
  };
}

async function requireMktonSuperAdmin(sb: AnySb, userId: string) {
  const { data, error } = await sb.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  return data === true;
}

async function ensureTrackingFields(sb: AnySb, workspaceId: string) {
  const { data: existing, error } = await sb
    .from("lead_custom_fields")
    .select("id,name,field_type")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  const byName = new Map<string, { id: string; name: string; field_type: string }>();
  for (const row of existing ?? []) byName.set(normalize(row.name), row);

  const created: string[] = [];
  const reused: string[] = [];
  for (const key of MKTON_TRACKING_FIELDS) {
    const label = FIELD_LABELS[key];
    const hit = byName.get(normalize(label));
    if (hit) {
      reused.push(label);
      continue;
    }

    const { error: insertError } = await sb.from("lead_custom_fields").insert({
      workspace_id: workspaceId,
      name: label,
      field_type: DATE_FIELDS.has(key) ? "date" : "text",
      options: [],
    });
    if (insertError) throw new Error(`Campo ${label}: ${insertError.message}`);
    created.push(label);
  }
  return { created, reused };
}

async function organizeLeadEntryStages(sb: AnySb, workspaceId: string) {
  const spec = MKTON_FUNNELS.find((f) => f.name === "Leads de Entrada");
  if (!spec) throw new Error("Configuração de Leads de Entrada não encontrada.");

  const pipeline = await resolveExistingMktonFunnel(
    sb,
    workspaceId,
    spec.name,
    spec.stages,
  );

  const { data: rawStages, error: stageError } = await sb
    .from("pipeline_stages")
    .select("id,name,position,description,pipeline_id")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true });
  if (stageError) throw new Error(stageError.message);

  const stages = (rawStages ?? []) as StageRow[];
  const claimed = new Set<string>();
  const created: string[] = [];
  const normalized: string[] = [];

  for (let index = 0; index < spec.stages.length; index += 1) {
    const stageSpec = spec.stages[index];
    const candidates = [stageSpec.name, ...(LEAD_ENTRY_ALIASES[stageSpec.key] ?? [])].map(
      normalize,
    );
    const existing = stages.find(
      (stage) => !claimed.has(stage.id) && candidates.includes(normalize(stage.name)),
    );
    const position = index + 1;

    if (existing) {
      claimed.add(existing.id);
      const patch: Record<string, unknown> = {};
      if (existing.name !== stageSpec.name) patch.name = stageSpec.name;
      if (existing.position !== position) patch.position = position;
      if ((existing.description ?? "") !== stageSpec.purpose) patch.description = stageSpec.purpose;
      if (Object.keys(patch).length) {
        const { error } = await sb
          .from("pipeline_stages")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .eq("workspace_id", workspaceId);
        if (error) throw new Error(error.message);
        normalized.push(stageSpec.name);
      }
      continue;
    }

    const { error } = await sb.from("pipeline_stages").insert({
      workspace_id: workspaceId,
      pipeline_id: pipeline.id,
      name: stageSpec.name,
      position,
      color: STAGE_COLORS[index] ?? "#3b82f6",
      description: stageSpec.purpose,
    });
    if (error) throw new Error(error.message);
    created.push(stageSpec.name);
  }

  // Preserva qualquer etapa antiga/desconhecida para evitar perda de trabalho.
  // Ela fica depois da sequência oficial e será removida somente após auditoria.
  const extras = stages.filter((stage) => !claimed.has(stage.id));
  for (let i = 0; i < extras.length; i += 1) {
    const extra = extras[i];
    const position = spec.stages.length + i + 1;
    if (extra.position !== position) {
      const { error } = await sb
        .from("pipeline_stages")
        .update({ position, updated_at: new Date().toISOString() })
        .eq("id", extra.id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
    }
  }

  const { data: finalStages, error: finalError } = await sb
    .from("pipeline_stages")
    .select("id,name,position,description,pipeline_id")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true });
  if (finalError) throw new Error(finalError.message);

  const official = (finalStages ?? []).slice(0, spec.stages.length).map((s: StageRow) => s.name);
  const expected = spec.stages.map((s) => s.name);
  if (JSON.stringify(official) !== JSON.stringify(expected)) {
    throw new Error(
      `Auditoria de etapas falhou. Esperado: ${expected.join(" > ")}. Atual: ${official.join(" > ")}.`,
    );
  }

  return {
    pipelineId: pipeline.id as string,
    created,
    normalized,
    preservedExtraStages: extras.map((s) => s.name),
    stages: (finalStages ?? []) as StageRow[],
  };
}

async function ensureJuliaRegistrationAgent(sb: AnySb, workspaceId: string) {
  const agentName = "Júlia Braga · Cadastro Mkton";
  const persona =
    "Júlia Braga, consultora comercial da Mkton. Próxima, objetiva, consultiva e segura. Nunca se apresenta como robô ou assistente virtual.";
  const systemPrompt = `Você é Júlia Braga, responsável pelo atendimento comercial da Vanessa Simoni no funil Leads de Entrada.\n\nOBJETIVO ÚNICO DE NEGÓCIO: conduzir o lead a concluir o cadastro para testar a Vanessa Simoni por 20 dias gratuitamente. A Vanessa Simoni também oferece implementação gratuita para acelerar a ativação.\n\nREGRAS:\n- Não transforme a conversa em discussão de preço. Se perguntarem preço, responda de forma breve e volte para diagnóstico + cadastro.\n- Descubra rapidamente o negócio, o principal gargalo comercial/operacional e como a pessoa atende/vende hoje.\n- Reutilize o que o lead já informou; não repita perguntas sem necessidade.\n- Venda resultado e velocidade de implementação, não uma lista interminável de funcionalidades.\n- Mensagens curtas, naturais, em português do Brasil, sem texto engessado e sem excesso de emojis.\n- Use o nome Vanessa Simoni exatamente assim.\n- A oferta central é: 20 dias gratuitos + implementação gratuita para o lead começar a testar com a operação organizada.\n- Use o link de cadastro de Atendimento quando o lead estiver em Em Atendimento e o link de Follow quando o lead estiver na etapa Follow; não misture os dois, pois a origem da conversão precisa ficar mensurável.\n- Após confirmação de cadastro/evento de conversão, considere o objetivo concluído e não continue pressionando comercialmente.\n- Se houver pedido explícito de humano, situação sensível ou dúvida que dependa de decisão administrativa, faça handoff.\n\nESTRUTURA DE CONVERSA: abertura contextual -> diagnóstico curto -> conexão do problema com a Vanessa Simoni -> benefício concreto -> cadastro. Não use roteiro rígido; adapte às respostas.`;

  const metadata = {
    settings: {
      mode: "objetivos",
      language: "pt-BR",
      max_interactions: 20,
      allowed_actions: ["mover_etapa", "definir_campo", "adicionar_tag", "criar_tarefa", "handoff"],
      links: [],
      outcome: [
        { id: "registration-complete", action: "objetivo-concluido", target: "Cadastro Realizado" },
      ],
    },
    objective_tree: {
      context:
        "A Mkton oferece 20 dias gratuitos e implementação gratuita. O objetivo comercial deste agente é levar o lead ao cadastro sem transformar a conversa em negociação por preço.",
      pitch: {
        minTurns: 2,
        maxTurns: 6,
        what: "enviar o link rastreado de cadastro da Mkton",
      },
      root: {
        id: "mkton-registration",
        block: "objetivo",
        say: "Conduzir o lead até o cadastro gratuito da Mkton.",
        expected:
          "O lead concluiu o cadastro ou existe confirmação objetiva suficiente para encerrar a etapa comercial de aquisição.",
        mode: "free",
        minTurns: 1,
        maxTurns: 8,
        keepOnTrack: true,
        children: [
          {
            id: "mkton-diagnostico",
            block: "objetivo",
            say: "Entender rapidamente o negócio, o nicho, o principal gargalo comercial e como o lead atende e acompanha oportunidades hoje.",
            expected:
              "Há contexto suficiente para conectar o problema do lead à proposta da Mkton sem repetir perguntas já respondidas.",
            mode: "free",
            maxTurns: 4,
            keepOnTrack: true,
          },
          {
            id: "mkton-valor",
            block: "objetivo",
            say: "Mostrar de forma curta como a Mkton pode organizar a operação e destacar 20 dias gratuitos mais implementação gratuita.",
            expected: "O lead entendeu por que vale testar a Mkton na própria operação.",
            mode: "free",
            maxTurns: 3,
            keepOnTrack: true,
          },
          {
            id: "mkton-cadastro-link",
            block: "objetivo",
            say: "Conduzir para o cadastro usando o link rastreado correto conforme Atendimento ou Follow.",
            expected: "O lead abriu o caminho de cadastro ou informou que concluiu o cadastro.",
            mode: "free",
            maxTurns: 4,
            keepOnTrack: true,
          },
        ],
      },
      outcome: [],
    },
  };

  const { data: existing, error: findError } = await sb
    .from("conversation_ai_agents")
    .select("id,name")
    .eq("workspace_id", workspaceId)
    .ilike("name", agentName)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  const payload = {
    workspace_id: workspaceId,
    name: agentName,
    persona,
    system_prompt: systemPrompt,
    model: "google/gemini-2.5-flash",
    temperature: 0.55,
    max_tokens: 1200,
    cooldown_seconds: 8,
    enabled: true,
    metadata,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await sb
      .from("conversation_ai_agents")
      .update(payload)
      .eq("id", existing.id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { id: existing.id as string, created: false, name: agentName };
  }

  const { data: inserted, error } = await sb
    .from("conversation_ai_agents")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: inserted.id as string, created: true, name: agentName };
}

/**
 * Configura SOMENTE o primeiro bloco real da operação Mkton.
 * - reutiliza o funil existente Leads de Entrada;
 * - organiza as etapas sem apagar etapas desconhecidas;
 * - garante campos de tracking reutilizáveis;
 * - cria/atualiza a Júlia Braga de cadastro;
 * - cria links rastreados, SalesBots e tarefa do Fluxo de trabalho;
 * - não cria funis e não toca Grupo, Prospecção ou Software RB Media.
 */
export const provisionMktonLeadEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { workspaceId, workspace, isMkton } = await resolveWorkspace(sb, context.userId);
    const isSuperAdmin = await requireMktonSuperAdmin(sb, context.userId);

    if (!isSuperAdmin) {
      return {
        ok: true,
        skipped: true,
        reason: "not_super_admin",
        workspace: { id: workspaceId, name: workspace.name, slug: workspace.slug },
      };
    }

    if (!isMkton) {
      return {
        ok: true,
        skipped: true,
        reason: "workspace_not_mkton",
        workspace: { id: workspaceId, name: workspace.name, slug: workspace.slug },
      };
    }

    // Campos precisam existir antes dos blocos de SalesBot que os referenciam.
    const fields = await ensureTrackingFields(sb, workspaceId);
    const stages = await organizeLeadEntryStages(sb, workspaceId);
    const julia = await ensureJuliaRegistrationAgent(sb, workspaceId);
    const automation = await provisionMktonLeadEntryAutomation({
      sb,
      workspaceId,
      userId: context.userId,
      juliaAgentId: julia.id,
      stages: stages.stages,
    });

    return {
      ok: true,
      skipped: false,
      workspace: { id: workspaceId, name: workspace.name, slug: workspace.slug },
      fields,
      stages,
      julia,
      automation,
    };
  });