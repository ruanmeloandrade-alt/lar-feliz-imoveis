// Adapted from saude-slim@b4b3df96 src/lib/slim-funnel-mutations.core.ts.
// Atomic receipts, stable request IDs and validation retained; only Vanessa RPCs are used.
import { z } from 'zod';

const uuid = z.string().uuid();
export const SLIM_FUNNEL_WRITE_TIMEOUT_MS = 15_000;
export const SLIM_EXISTING_CONTACT_MESSAGE = 'Este telefone ja possui um contato. Use o cadastro existente; a etapa e os dados dele foram preservados.';
export const slimCreateFunnelLeadSchema = z.object({
  crmSourceId: uuid,
  pipelineId: uuid,
  stageId: uuid,
  name: z.string().trim().min(1, 'Informe o nome do cliente.').max(200),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(64).optional(),
  value: z.number().finite().nonnegative().optional(),
  requestId: uuid,
});
export const slimBulkFunnelMoveSchema = z.object({
  leadIds: z.array(uuid).min(1).max(100),
  toStageId: uuid,
  requestId: uuid,
}).refine(input => new Set(input.leadIds).size === input.leadIds.length, {
  message: 'A seleção contém clientes repetidos.', path: ['leadIds'],
});

type Result = { data: unknown; error: unknown };
type MutationDb = {
  rpc(name: string, args: Record<string, unknown>): {
    abortSignal(signal: AbortSignal): PromiseLike<Result>;
  };
};
export type SlimCreateFunnelLeadInput = z.infer<typeof slimCreateFunnelLeadSchema>;
export type SlimBulkFunnelMoveInput = z.infer<typeof slimBulkFunnelMoveSchema>;

const createReceipt = z.object({ ok: z.literal(true), id: uuid, leadId: uuid, eventId: uuid });
const bulkReceipt = z.object({
  ok: z.literal(true), count: z.number().int().min(1).max(100),
  movedCount: z.number().int().min(0).max(100),
  unchangedCount: z.number().int().min(0).max(100),
  eventIds: z.array(uuid).max(100),
});

export async function createSlimFunnelLead(
  db: MutationDb, workspaceId: string, input: SlimCreateFunnelLeadInput,
) {
  const data = slimCreateFunnelLeadSchema.parse(input);
  uuid.parse(workspaceId);
  const message = 'O cadastro não foi confirmado. Confira o Funil antes de repetir; esta tentativa será preservada.';
  let response: Result;
  try {
    response = await db.rpc('vanessa_create_lead_and_emit', {
      _workspace_id: workspaceId, _crm_source_id: data.crmSourceId,
      _pipeline_id: data.pipelineId, _stage_id: data.stageId, _name: data.name,
      _email: data.email || null, _phone: data.phone || null, _value: data.value ?? 0,
      _request_id: data.requestId,
    }).abortSignal(AbortSignal.timeout(SLIM_FUNNEL_WRITE_TIMEOUT_MS));
  } catch { throw new Error(message); }
  const problem = response.error as { code?: string; message?: string } | null;
  if (problem?.code === '23505' && problem.message === SLIM_EXISTING_CONTACT_MESSAGE) {
    throw new Error(SLIM_EXISTING_CONTACT_MESSAGE);
  }
  const receipt = createReceipt.safeParse(response.data);
  if (response.error || !receipt.success || receipt.data.id !== receipt.data.leadId) throw new Error(message);
  return { id: receipt.data.id, leadId: receipt.data.leadId, eventId: receipt.data.eventId, automationEvaluated: true };
}

export async function bulkMoveSlimFunnelLeads(
  db: MutationDb, workspaceId: string, input: SlimBulkFunnelMoveInput,
) {
  const data = slimBulkFunnelMoveSchema.parse(input);
  uuid.parse(workspaceId);
  const message = 'A movimentação da seleção não foi confirmada. Confira o Funil antes de repetir; esta tentativa será preservada.';
  let response: Result;
  try {
    // The database validates the whole selection and commits it with its events.
    // Never expand this selection by company, phone, or another contact relation.
    response = await db.rpc('vanessa_bulk_move_leads_and_emit', {
      _workspace_id: workspaceId, _lead_ids: [...data.leadIds].sort(),
      _stage_id: data.toStageId, _request_id: data.requestId,
    }).abortSignal(AbortSignal.timeout(SLIM_FUNNEL_WRITE_TIMEOUT_MS));
  } catch { throw new Error(message); }
  const receipt = bulkReceipt.safeParse(response.data);
  if (response.error || !receipt.success) throw new Error(message);
  const result = receipt.data;
  if (result.count !== data.leadIds.length || result.movedCount + result.unchangedCount !== result.count
    || result.eventIds.length !== result.movedCount || new Set(result.eventIds).size !== result.eventIds.length) throw new Error(message);
  return result;
}

