import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {copilotDeadline, decideSlimCopilotProposalCore, listSlimCopilotProposalsCore} from './slim-copilot-approval.core';

const id = z.string().uuid().transform(value => value.toLowerCase());
const Identity = z.object({workspaceId: id, actorId: id}).strict();
const Decision = Identity.extend({proposalId: id, expectedVersion: id, decision: z.enum(['approve', 'reject'])}).strict();

export const listSlimCopilotProposals = createServerFn({method: 'POST'})
  .middleware([requireSupabaseAuth]).inputValidator((value: unknown) => Identity.parse(value))
  .handler(async ({data, context}) => listSlimCopilotProposalsCore(context.supabase as any, context.userId, data));

export const decideSlimCopilotProposal = createServerFn({method: 'POST'})
  .middleware([requireSupabaseAuth]).inputValidator((value: unknown) => Decision.parse(value))
  .handler(async ({data, context}) => decideSlimCopilotProposalCore(context.supabase as any, context.userId, data, {
    executeText: async claim => {
      const {executeSlimCopilotTextClaim} = await import('./slim-copilot-text.server');
      return executeSlimCopilotTextClaim(context, claim);
    },
    finishText: async (claim, outcome) => {
      // Service role is used only to store the receipt of this authenticated, already claimed action.
      // It cannot approve a proposal, replace its payload, or execute a business action through this RPC.
      const {supabaseAdmin} = await import('@/integrations/supabase/client.server');
      const result: any = await copilotDeadline((supabaseAdmin as any).rpc('slim_copilot_finish_text', {
        p_workspace_id: claim.workspaceId, p_proposal_id: claim.proposalId,
        p_claim_token: claim.claimToken, p_outcome: outcome,
      }).abortSignal(AbortSignal.timeout(15000)), 15000, 'O recibo final não pôde ser confirmado.');
      if (result.error || !result.data) throw new Error('O recibo final não pôde ser confirmado.');
      return result.data;
    },
  }));
