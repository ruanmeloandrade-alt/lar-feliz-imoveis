/**
 * Exportação/importação de SalesBots entre workspaces.
 *
 * Um bot guarda IDs que só existem no workspace onde foi criado
 * (funil, etapa, campo personalizado, formulário, responsável, agente IA...).
 * Ao exportar, esses IDs são removidos e apenas os *nomes* viajam no arquivo.
 * Ao importar, os nomes são remapeados para os IDs do workspace de destino;
 * o que não existir lá fica sem ID (o usuário reconfigura na tela do bot).
 */

export const MKTON_BOT_EXPORT_VERSION = 2;

type Dict = Record<string, unknown>;

/** Campos de bloco que são IDs presos ao workspace de origem. */
const BLOCK_ID_FIELDS = [
  "destinoPipelineId",
  "destinoStageId",
  "campoId",
  "destinoResponsavelId",
  "formularioId",
  "tarefaWorkflowPipelineId",
  "tarefaWorkflowStageId",
  "tarefaWorkflowAssigneeId",
  "iaAgentId",
  "destinoBotId",
  "webhookSecret",
] as const;

/** Campos de gatilho que são IDs presos ao workspace de origem. */
const GATILHO_ID_FIELDS = [
  "pipelineId",
  "stageId",
  "canalId",
  "campoId",
  "adAccountId",
  "campanhaId",
  "socialCampaignId",
  "trackingSiteId",
  "formularioId",
] as const;

function stripIds(obj: Dict, fields: readonly string[]): Dict {
  const out: Dict = { ...obj };
  for (const f of fields) delete out[f];
  return out;
}

/** Remove dados de runtime e IDs específicos do workspace de origem. */
export function toPortableBot(bot: Dict): Dict {
  const {
    totalLancado: _t,
    sessoesAtivas: _s,
    conversao: _c,
    workspaceId: _w,
    ...rest
  } = bot as Dict & { totalLancado?: unknown };

  const blocks = Array.isArray(rest.blocks)
    ? (rest.blocks as unknown[])
        .filter((b): b is Dict => !!b && typeof b === "object")
        .map((b) => stripIds(b, BLOCK_ID_FIELDS))
    : [];

  const gatilhos = Array.isArray(rest.gatilhos)
    ? (rest.gatilhos as unknown[])
        .filter((g): g is Dict => !!g && typeof g === "object")
        .map((g) => ({ ...stripIds(g, GATILHO_ID_FIELDS), ativo: false }))
    : [];

  return {
    ...rest,
    blocks,
    gatilhos,
    _mktonExport: {
      version: MKTON_BOT_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
    },
  };
}

export interface PortableTargets {
  funnels?: { id: string; name: string; stages: { id: string; name: string }[] }[];
  customFields?: { id: string; name: string }[];
  forms?: { id: string; nome?: string | null; name?: string | null }[];
  agents?: { id: string; nome?: string | null; name?: string | null }[];
}

const norm = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

function findFunnel(targets: PortableTargets, name: unknown) {
  const n = norm(name);
  if (!n) return undefined;
  return (targets.funnels ?? []).find((f) => norm(f.name) === n);
}

function findStage(targets: PortableTargets, funnelName: unknown, stageName: unknown) {
  const sn = norm(stageName);
  if (!sn) return undefined;
  const funnel = findFunnel(targets, funnelName);
  const pools = funnel ? [funnel] : (targets.funnels ?? []);
  for (const f of pools) {
    const stage = f.stages.find((s) => norm(s.name) === sn);
    if (stage) return { funnel: f, stage };
  }
  return undefined;
}

function findByName<T extends { id: string }>(
  list: T[] | undefined,
  name: unknown,
  pick: (item: T) => unknown,
) {
  const n = norm(name);
  if (!n) return undefined;
  return (list ?? []).find((item) => norm(pick(item)) === n);
}

/**
 * Reconecta os nomes do arquivo aos IDs do workspace de destino.
 * Devolve o objeto remapeado e a lista de itens que não puderam ser resolvidos.
 */
export function remapPortableRefs(
  bot: Dict,
  targets: PortableTargets,
  botIdByName?: Map<string, string>,
): { bot: Dict; unresolved: string[] } {
  const unresolved: string[] = [];

  const blocks = (Array.isArray(bot.blocks) ? (bot.blocks as unknown[]) : [])
    .filter((b): b is Dict => !!b && typeof b === "object")
    .map((b) => {
      const next: Dict = { ...b };

      if (next.destinoStageNome || next.destinoPipelineNome) {
        const hit = findStage(targets, next.destinoPipelineNome, next.destinoStageNome);
        if (hit) {
          next.destinoPipelineId = hit.funnel.id;
          next.destinoPipelineNome = hit.funnel.name;
          next.destinoStageId = hit.stage.id;
          next.destinoStageNome = hit.stage.name;
        } else if (next.destinoStageNome) {
          unresolved.push(`Etapa "${String(next.destinoStageNome)}"`);
        }
      }

      if (next.campoNome) {
        const field = findByName(targets.customFields, next.campoNome, (f) => f.name);
        if (field) next.campoId = field.id;
        else unresolved.push(`Campo personalizado "${String(next.campoNome)}"`);
      }

      if (next.formularioNome) {
        const form = findByName(targets.forms, next.formularioNome, (f) => f.nome ?? f.name);
        if (form) next.formularioId = form.id;
        else unresolved.push(`Formulário "${String(next.formularioNome)}"`);
      }

      if (next.iaAgentNome) {
        const agent = findByName(targets.agents, next.iaAgentNome, (a) => a.nome ?? a.name);
        if (agent) next.iaAgentId = agent.id;
        else unresolved.push(`Agente IA "${String(next.iaAgentNome)}"`);
      }

      if (next.tarefaWorkflowPipelineNome) {
        unresolved.push(`Fluxo de trabalho "${String(next.tarefaWorkflowPipelineNome)}"`);
      }
      if (next.destinoResponsavelNome) {
        unresolved.push(`Responsável "${String(next.destinoResponsavelNome)}"`);
      }

      if (next.destinoBotNome && botIdByName) {
        const id = botIdByName.get(norm(next.destinoBotNome));
        if (id) next.destinoBotId = id;
      }

      return next;
    });

  const gatilhos = (Array.isArray(bot.gatilhos) ? (bot.gatilhos as unknown[]) : [])
    .filter((g): g is Dict => !!g && typeof g === "object")
    .map((g) => {
      const next: Dict = { ...g, ativo: false };
      if (next.stageNome || next.pipelineNome) {
        const hit = findStage(targets, next.pipelineNome, next.stageNome);
        if (hit) {
          next.pipelineId = hit.funnel.id;
          next.pipelineNome = hit.funnel.name;
          next.stageId = hit.stage.id;
          next.stageNome = hit.stage.name;
        }
      }
      if (next.campoNome) {
        const field = findByName(targets.customFields, next.campoNome, (f) => f.name);
        if (field) next.campoId = field.id;
      }
      if (next.formularioNome) {
        const form = findByName(targets.forms, next.formularioNome, (f) => f.nome ?? f.name);
        if (form) next.formularioId = form.id;
      }
      return next;
    });

  return { bot: { ...bot, blocks, gatilhos }, unresolved: [...new Set(unresolved)] };
}
