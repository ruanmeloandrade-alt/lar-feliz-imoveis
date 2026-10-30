type AnySb = { from: (table: string) => any };

type StageLike = { id: string; name: string; pipeline_id: string; position?: number | null };
type PipelineLike = { id: string; name: string; position?: number | null };
type StageSpecLike = { name: string; key?: string };

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// O workspace administrativo da Mkton já possui os funis prontos.
// O provisionamento apenas aponta para esses registros; nunca cria ou renomeia pipelines.
const MKTON_EXISTING_FUNNELS: Record<string, string> = {
  "leads de entrada": "ADS Entrada | MKTOn",
  cadastro: "Cadastros | MKTOn",
  "pos venda": "Pós Vendas | MKTOn",
  reativacao: "Reativação | MKTOn",
  "rede social": "Redes Sociais | MKTOn",
  afiliado: "Afiliados | MKTOn",
};

const STAGE_ALIASES: Record<string, string[]> = {
  "recepcao de lead": ["recepcao", "novo lead", "entrada", "lead recebido"],
  "em atendimento": ["atendimento", "qualificacao", "qualificando"],
  follow: ["follow up", "follow-up", "reaquecimento"],
  "cadastro realizado": ["cadastrado", "cadastro concluido"],
  "cad lost": ["lost", "perdido", "nao cadastrado"],
};

function stageMatches(existingName: string, expected: StageSpecLike) {
  const current = normalize(existingName);
  const wanted = normalize(expected.name);
  if (current === wanted) return true;
  return (STAGE_ALIASES[wanted] ?? []).some((alias) => current === normalize(alias));
}

export async function resolveExistingMktonFunnel(
  sb: AnySb,
  workspaceId: string,
  desiredName: string,
  stageSpecs: StageSpecLike[] = [],
) {
  const { data: pipelines, error: pipelineError } = await sb
    .from("pipelines")
    .select("id,name,position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  if (pipelineError) throw new Error(pipelineError.message);

  const allPipelines = (pipelines ?? []) as PipelineLike[];
  if (!allPipelines.length) {
    throw new Error(`Nenhum funil existente foi encontrado no workspace ${workspaceId}.`);
  }

  const pipelineIds = allPipelines.map((pipeline) => pipeline.id);
  const { data: stageRows, error: stageError } = await sb
    .from("pipeline_stages")
    .select("id,name,pipeline_id,position")
    .in("pipeline_id", pipelineIds)
    .order("position", { ascending: true });
  if (stageError) throw new Error(stageError.message);
  const stages = (stageRows ?? []) as StageLike[];

  const desired = normalize(desiredName);
  const configuredName = MKTON_EXISTING_FUNNELS[desired];
  if (configuredName) {
    const exact = allPipelines.find(
      (pipeline) => normalize(pipeline.name) === normalize(configuredName),
    );
    if (exact) {
      return {
        id: exact.id,
        name: exact.name,
        stages: stages.filter((stage) => stage.pipeline_id === exact.id),
        matchedByExistingData: true,
        score: 1000,
      };
    }
  }

  // Fallback somente por etapas para não escolher outro funil por semelhança de nome.
  const candidates = allPipelines
    .map((pipeline) => {
      const ownStages = stages.filter((stage) => stage.pipeline_id === pipeline.id);
      const stageMatchesCount = stageSpecs.filter((spec) =>
        ownStages.some((stage) => stageMatches(stage.name, spec)),
      ).length;
      return { pipeline, ownStages, stageMatchesCount };
    })
    .filter((candidate) => candidate.stageMatchesCount > 0)
    .sort((a, b) => b.stageMatchesCount - a.stageMatchesCount);

  const top = candidates[0];
  const tied = top
    ? candidates.filter((candidate) => candidate.stageMatchesCount === top.stageMatchesCount)
    : [];

  if (!top) {
    throw new Error(
      `O funil existente esperado para "${desiredName}" não foi encontrado. Esperado: "${configuredName ?? desiredName}". Funis disponíveis: ${allPipelines
        .map((pipeline) => `"${pipeline.name}"`)
        .join(", ")}. Nenhum funil novo foi criado.`,
    );
  }

  if (tied.length > 1) {
    throw new Error(
      `Não foi possível selecionar com segurança o funil de "${desiredName}" pelas etapas. Candidatos: ${tied
        .map((candidate) => `"${candidate.pipeline.name}"`)
        .join(", ")}. Nenhum funil novo foi criado.`,
    );
  }

  return {
    id: top.pipeline.id,
    name: top.pipeline.name,
    stages: top.ownStages,
    matchedByExistingData: true,
    score: top.stageMatchesCount * 12,
  };
}
