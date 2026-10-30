import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

type AnySb = { from: (table: string) => any };

export type DashboardV4SocialOps = {
  posts: number;
  published: number;
  scheduled: number;
  drafts: number;
  failed: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  interactions: number;
  engagementRate: number | null;
  topPosts: Array<{ id: string; title: string; reach: number; interactions: number; channel: string }>;
};

export type DashboardV4WorkOps = {
  calendar: {
    total: number;
    pending: number;
    completed: number;
    meetings: number;
    overdue: number;
    next: Array<{ id: string; title: string; kind: string; start: string; status: string }>;
  };
  workflow: {
    total: number;
    completed: number;
    incomplete: number;
    review: number;
    overdue: number;
    trackedSeconds: number;
    byUser: Array<{ userId: string; name: string; total: number; done: number; incomplete: number; trackedSeconds: number }>;
  };
};

export type DashboardV4OperationsResponse = {
  social: DashboardV4SocialOps;
  work: DashboardV4WorkOps;
};

const inputSchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
}).partial();

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const getDashboardV4Operations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<DashboardV4OperationsResponse> => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await requireActiveWorkspace(sb, context.userId);
    const fromIso = data.date_from ? new Date(data.date_from).toISOString() : new Date(Date.now() - 30 * 86400000).toISOString();
    const toIso = data.date_to ? new Date(`${data.date_to}T23:59:59.999Z`).toISOString() : new Date().toISOString();

    const [postsRes, channelsRes, metricsRes, tasksRes, workflowTasksRes, sessionsRes, membersRes] = await Promise.all([
      sb.from("social_posts").select("id,title,status,created_at,scheduled_at,published_at").eq("workspace_id", workspaceId).gte("created_at", fromIso).lte("created_at", toIso).limit(2000),
      sb.from("social_post_channels").select("post_id,channel,status,published_at").eq("workspace_id", workspaceId).limit(5000),
      sb.from("social_post_metrics").select("post_id,channel,likes,comments,shares,saves,reach,impressions,engagement_rate").eq("workspace_id", workspaceId).limit(10000),
      sb.from("tasks").select("id,title,kind,status,start_at,end_at").eq("workspace_id", workspaceId).gte("start_at", fromIso).lte("start_at", toIso).order("start_at").limit(5000),
      sb.from("workflow_tasks").select("id,assignee_id,status,due_at,completed_at,created_at").eq("workspace_id", workspaceId).gte("created_at", fromIso).lte("created_at", toIso).limit(5000),
      sb.from("workflow_time_sessions").select("user_id,duration_seconds,started_at,ended_at").eq("workspace_id", workspaceId).gte("started_at", fromIso).lte("started_at", toIso).limit(10000),
      sb.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).limit(1000),
    ]);

    const safe = (result: { data?: unknown[] | null; error?: { message?: string } | null }) => result.error ? [] : (result.data ?? []);
    const posts = safe(postsRes) as Array<{ id: string; title: string | null; status: string; created_at: string }>;
    const postIds = new Set(posts.map((post) => post.id));
    const channels = (safe(channelsRes) as Array<{ post_id: string; channel: string; status: string }>).filter((row) => postIds.has(row.post_id));
    const metrics = (safe(metricsRes) as Array<{ post_id: string; channel: string; likes: unknown; comments: unknown; shares: unknown; saves: unknown; reach: unknown; impressions: unknown; engagement_rate: unknown }>).filter((row) => postIds.has(row.post_id));

    const metricByPost = new Map<string, { reach: number; impressions: number; interactions: number; engagementSum: number; engagementCount: number; channel: string }>();
    let likes = 0; let comments = 0; let shares = 0; let saves = 0; let reach = 0; let impressions = 0; let engagementSum = 0; let engagementCount = 0;
    for (const row of metrics) {
      const l = toNumber(row.likes); const c = toNumber(row.comments); const sh = toNumber(row.shares); const sv = toNumber(row.saves); const r = toNumber(row.reach); const im = toNumber(row.impressions); const er = toNumber(row.engagement_rate);
      likes += l; comments += c; shares += sh; saves += sv; reach += r; impressions += im;
      if (er > 0) { engagementSum += er <= 1 ? er * 100 : er; engagementCount += 1; }
      const current = metricByPost.get(row.post_id) ?? { reach: 0, impressions: 0, interactions: 0, engagementSum: 0, engagementCount: 0, channel: row.channel };
      current.reach += r; current.impressions += im; current.interactions += l + c + sh + sv;
      if (er > 0) { current.engagementSum += er <= 1 ? er * 100 : er; current.engagementCount += 1; }
      metricByPost.set(row.post_id, current);
    }
    const postTitle = new Map(posts.map((post) => [post.id, post.title?.trim() || "Post sem título"]));
    const topPosts = [...metricByPost.entries()].map(([id, row]) => ({ id, title: postTitle.get(id) ?? "Post", reach: row.reach, interactions: row.interactions, channel: row.channel })).sort((a, b) => b.reach - a.reach || b.interactions - a.interactions).slice(0, 5);

    const calendarRows = safe(tasksRes) as Array<{ id: string; title: string; kind: string; status: string; start_at: string; end_at: string }>;
    const now = Date.now();
    const calendar = {
      total: calendarRows.length,
      pending: calendarRows.filter((row) => row.status === "pendente").length,
      completed: calendarRows.filter((row) => row.status === "concluida").length,
      meetings: calendarRows.filter((row) => row.kind === "reuniao").length,
      overdue: calendarRows.filter((row) => row.status === "pendente" && new Date(row.end_at ?? row.start_at).getTime() < now).length,
      next: calendarRows.filter((row) => row.status === "pendente" && new Date(row.start_at).getTime() >= now).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()).slice(0, 5).map((row) => ({ id: row.id, title: row.title, kind: row.kind, start: row.start_at, status: row.status })),
    };

    const workflowRows = safe(workflowTasksRes) as Array<{ assignee_id: string | null; status: string; due_at: string | null }>;
    const sessionRows = safe(sessionsRes) as Array<{ user_id: string | null; duration_seconds: unknown; ended_at: string | null }>;
    const memberIds = (safe(membersRes) as Array<{ user_id: string }>).map((row) => row.user_id);
    const profilesRes = memberIds.length ? await sb.from("profiles").select("id,display_name,full_name").in("id", memberIds) : { data: [], error: null };
    const profiles = safe(profilesRes as { data?: unknown[] | null; error?: { message?: string } | null }) as Array<{ id: string; display_name: string | null; full_name: string | null }>;
    const names = new Map(profiles.map((profile) => [profile.id, profile.display_name || profile.full_name || "Membro"]));
    const byUser = new Map<string, { userId: string; name: string; total: number; done: number; incomplete: number; trackedSeconds: number }>();
    const ensure = (userId: string) => {
      const existing = byUser.get(userId);
      if (existing) return existing;
      const created = { userId, name: names.get(userId) ?? "Membro", total: 0, done: 0, incomplete: 0, trackedSeconds: 0 };
      byUser.set(userId, created);
      return created;
    };
    for (const row of workflowRows) {
      if (!row.assignee_id) continue;
      const user = ensure(row.assignee_id); user.total += 1;
      if (row.status === "concluida") user.done += 1;
      if (row.status === "incompleta") user.incomplete += 1;
    }
    for (const row of sessionRows) {
      if (!row.user_id || !row.ended_at) continue;
      ensure(row.user_id).trackedSeconds += toNumber(row.duration_seconds);
    }
    const trackedSeconds = sessionRows.filter((row) => row.ended_at).reduce((sum, row) => sum + toNumber(row.duration_seconds), 0);
    const workflow = {
      total: workflowRows.length,
      completed: workflowRows.filter((row) => row.status === "concluida").length,
      incomplete: workflowRows.filter((row) => row.status === "incompleta").length,
      review: workflowRows.filter((row) => row.status === "em_revisao").length,
      overdue: workflowRows.filter((row) => row.status !== "concluida" && row.status !== "incompleta" && row.due_at && new Date(row.due_at).getTime() < now).length,
      trackedSeconds,
      byUser: [...byUser.values()].sort((a, b) => b.done - a.done || b.trackedSeconds - a.trackedSeconds).slice(0, 8),
    };

    return {
      social: {
        posts: posts.length,
        published: posts.filter((post) => post.status === "published").length,
        scheduled: posts.filter((post) => post.status === "scheduled").length,
        drafts: posts.filter((post) => post.status === "draft").length,
        failed: new Set(channels.filter((row) => row.status === "failed").map((row) => row.post_id)).size,
        reach,
        impressions,
        likes,
        comments,
        shares,
        saves,
        interactions: likes + comments + shares + saves,
        engagementRate: engagementCount ? engagementSum / engagementCount : null,
        topPosts,
      },
      work: { calendar, workflow },
    };
  });
