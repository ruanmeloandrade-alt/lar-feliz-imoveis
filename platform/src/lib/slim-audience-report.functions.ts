import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { AUDIENCE_KINDS, CAMPAIGN_STATES, DELIVERY_STATES, audienceReportDate, audienceReportTimestamp } from './slim-audience-report.core';
import { loadAudienceReportDetail, loadAudienceReportPage, readAudienceReportScope, withAudienceReportRead } from './slim-audience-report.server';
const uuid = z.string().uuid();
const scope = { workspaceId: uuid, actorId: uuid };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { try { audienceReportDate(value); return true; } catch { return false; } }, 'Data inválida.');
const filters = z.object({ audienceId: uuid.optional(), deletedAudience: z.boolean().optional(), kind: z.enum(AUDIENCE_KINDS).optional(), status: z.enum(CAMPAIGN_STATES).optional(), from: day.optional(), to: day.optional() }).strict().refine(f => !f.from || !f.to || f.from <= f.to, 'O fim do período deve ser igual ou posterior ao início.');
const page = z.object({ ...scope, filters, cursor: z.object({ createdAt: z.string().datetime({ offset: true }).refine(value => { try { audienceReportTimestamp(value); return true; } catch { return false; } }), id: uuid }).strict().optional() }).strict();
const detail = z.object({ ...scope, campaignId: uuid, page: z.number().int().min(0).max(1000).default(0), status: z.enum(DELIVERY_STATES).optional(), query: z.string().max(120).optional() }).strict();
export const getSlimAudienceReportScope = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => withAudienceReportRead(signal => readAudienceReportScope(context.supabase as any, context.userId, signal)));
export const listSlimAudienceReport = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => page.parse(value)).handler(async ({ data, context }) => withAudienceReportRead(async signal => {
  const db = context.supabase as any, identity = await readAudienceReportScope(db, context.userId, signal, data);
  return loadAudienceReportPage(db, identity, data.filters, data.cursor, signal);
}));
export const getSlimAudienceCampaignReport = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => detail.parse(value)).handler(async ({ data, context }) => withAudienceReportRead(async signal => {
  const db = context.supabase as any, identity = await readAudienceReportScope(db, context.userId, signal, data);
  return loadAudienceReportDetail(db, identity, data, signal);
}));
