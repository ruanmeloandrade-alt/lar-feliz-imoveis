import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WorkspaceSchema = z.object({ workspaceId: z.string().uuid() });
const SaveSchema = z.object({
  workspaceId: z.string().uuid(),
  postId: z.string().uuid(),
  enabled: z.boolean().default(true),
  matchMode: z.enum(["any", "contains", "equals"]).default("any"),
  keywords: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  commentReplyEnabled: z.boolean().default(false),
  commentReplyText: z.string().max(2000).optional().nullable(),
  dmReplyEnabled: z.boolean().default(false),
  dmReplyText: z.string().max(2000).optional().nullable(),
});

export const listSocialPostAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => WorkspaceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: posts, error: postsError }, { data: automations, error: automationError }] = await Promise.all([
      context.supabase
        .from("social_posts")
        .select("id,title,copy,status,scheduled_at,published_at")
        .eq("workspace_id", data.workspaceId)
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(120),
      context.supabase
        .from("social_post_automations" as never)
        .select("*")
        .eq("workspace_id", data.workspaceId),
    ]);
    if (postsError) throw new Error(postsError.message);
    if (automationError) {
      if (/does not exist|schema cache/i.test(automationError.message)) {
        return { posts: posts ?? [], automations: [], migrationRequired: true as const };
      }
      throw new Error(automationError.message);
    }
    return { posts: posts ?? [], automations: automations ?? [], migrationRequired: false as const };
  });

export const saveSocialPostAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.commentReplyEnabled && !data.dmReplyEnabled) {
      throw new Error("Ative resposta no comentário, mensagem privada ou ambas.");
    }
    if (data.matchMode !== "any" && data.keywords.length === 0) {
      throw new Error("Informe ao menos uma palavra-chave para este gatilho.");
    }
    if (data.commentReplyEnabled && !data.commentReplyText?.trim()) {
      throw new Error("Escreva a resposta pública do comentário.");
    }
    if (data.dmReplyEnabled && !data.dmReplyText?.trim()) {
      throw new Error("Escreva a mensagem privada.");
    }

    const { data: post, error: postError } = await context.supabase
      .from("social_posts")
      .select("id")
      .eq("id", data.postId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (postError) throw new Error(postError.message);
    if (!post) throw new Error("Post não encontrado neste workspace.");

    const row = {
      workspace_id: data.workspaceId,
      post_id: data.postId,
      enabled: data.enabled,
      match_mode: data.matchMode,
      keywords: data.keywords.map((item) => item.trim()).filter(Boolean),
      comment_reply_enabled: data.commentReplyEnabled,
      comment_reply_text: data.commentReplyText?.trim() || null,
      dm_reply_enabled: data.dmReplyEnabled,
      dm_reply_text: data.dmReplyText?.trim() || null,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await context.supabase
      .from("social_post_automations" as never)
      .upsert(row as never, { onConflict: "workspace_id,post_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { automation: saved };
  });

export const deleteSocialPostAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid(), postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("social_post_automations" as never)
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("post_id", data.postId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
