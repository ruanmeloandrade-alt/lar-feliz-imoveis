import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import {
  getLeadIdentityInternal,
  getLeadCrmPositionInternal,
  getLeadTagsInternal,
  getLeadCustomFieldsInternal,
  getLeadResponsibleInternal,
  getLeadOriginInternal,
  getLeadRecentHistoryInternal,
  getLeadCanonicalContextInternal,
  buildLeadOperationalContextInternal,
} from "./ai-agent-context.server";

const LeadContextSchema = z.object({
  workspaceId: z.string().uuid(),
  leadId: z.string().uuid(),
});

const LeadHistoryContextSchema = LeadContextSchema.extend({
  limit: z.number().int().min(1).max(50).optional(),
});

const LeadCanonicalContextSchema = LeadContextSchema.extend({
  historyLimit: z.number().int().min(1).max(50).optional(),
});

type AuthContext = {
  supabase: Parameters<typeof requireActiveWorkspace>[0];
  userId: string;
};

async function assertActiveWorkspace(context: AuthContext, requestedWorkspaceId: string) {
  const activeWorkspaceId = await requireActiveWorkspace(context.supabase, context.userId);
  if (activeWorkspaceId !== requestedWorkspaceId) {
    throw new Error("Workspace inválido para esta sessão.");
  }
}

export const getLeadIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LeadContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveWorkspace(context as AuthContext, data.workspaceId);
    return getLeadIdentityInternal(data);
  });

export const getLeadCrmPosition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LeadContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveWorkspace(context as AuthContext, data.workspaceId);
    return getLeadCrmPositionInternal(data);
  });

export const getLeadTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LeadContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveWorkspace(context as AuthContext, data.workspaceId);
    return getLeadTagsInternal(data);
  });

export const getLeadCustomFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LeadContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveWorkspace(context as AuthContext, data.workspaceId);
    return getLeadCustomFieldsInternal(data);
  });

export const getLeadResponsible = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LeadContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveWorkspace(context as AuthContext, data.workspaceId);
    return getLeadResponsibleInternal(data);
  });

export const getLeadOrigin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LeadContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveWorkspace(context as AuthContext, data.workspaceId);
    return getLeadOriginInternal(data);
  });

export const getLeadRecentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LeadHistoryContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveWorkspace(context as AuthContext, data.workspaceId);
    return getLeadRecentHistoryInternal(data);
  });

export const getLeadCanonicalContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LeadCanonicalContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveWorkspace(context as AuthContext, data.workspaceId);
    return getLeadCanonicalContextInternal(data);
  });

export const getLeadOperationalContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LeadCanonicalContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveWorkspace(context as AuthContext, data.workspaceId);
    return buildLeadOperationalContextInternal(data);
  });
