import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { assertSlimOperator } from './slim-workspace-operator.server';
import {
  bulkMoveSlimFunnelLeads, createSlimFunnelLead,
  slimBulkFunnelMoveSchema, slimCreateFunnelLeadSchema,
} from './slim-funnel-mutations.core';

async function activeOperatorWorkspace(db: any, userId: string): Promise<string> {
  const result = await db.from('profiles').select('current_workspace_id')
    .eq('id', userId).maybeSingle().abortSignal(AbortSignal.timeout(8_000));
  const workspaceId = result.data?.current_workspace_id;
  if (result.error || !workspaceId) throw new Error('Não foi possível identificar a empresa ativa.');
  await assertSlimOperator(db, workspaceId, userId);
  return workspaceId;
}

export const createSlimLeadWithAutomations = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => slimCreateFunnelLeadSchema.parse(value))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const workspaceId = await activeOperatorWorkspace(db, context.userId);
    return createSlimFunnelLead(db, workspaceId, data);
  });

export const bulkMoveSlimLeadsWithAutomations = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => slimBulkFunnelMoveSchema.parse(value))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const workspaceId = await activeOperatorWorkspace(db, context.userId);
    return bulkMoveSlimFunnelLeads(db, workspaceId, data);
  });
