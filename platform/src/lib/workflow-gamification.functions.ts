/**
 * Fluxo de Trabalho, Gamificação "Funcionário do Mês".
 *
 * Regras de pontuação:
 *  - points_by_priority: base por prioridade da tarefa concluída.
 *  - on_time_bonus:      concluiu antes/na hora do prazo.
 *  - early_bonus:        concluiu com folga (mais de 25% do intervalo restante).
 *  - per_hour_under_estimate: pontos por hora abaixo do tempo estimado.
 *  - incomplete_penalty: subtraído quando a tarefa é marcada incompleta.
 *  - review_approved_bonus / review_returned_penalty: no fluxo de revisão.
 *
 * Escopos:
 *  - company: placar único do workspace (sector_id = NULL nos scores)
 *  - sector: um placar por setor (do pipeline da tarefa)
 *  - both:   grava linhas em ambos (empresa + setor)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Sem tipos duros, usamos any interno; tipos são checados na UI.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = any;

const DEFAULT_RULES = {
  // XP, define o Funcionário do Mês
  points_by_priority: { baixa: 5, media: 10, alta: 20, urgente: 40 },
  on_time_bonus: 10,
  early_bonus: 15,
  incomplete_penalty: -15,
  review_approved_bonus: 5,
  review_returned_penalty: -10,
  review_submitted_bonus: 0,
  rework_penalty_per_round: -5,
  per_hour_under_estimate: 2,
  // Coins, moeda acumulável (o patrão decide como resgatar depois)
  coins_by_priority: { baixa: 1, media: 2, alta: 4, urgente: 8 },
  coins_on_time_bonus: 2,
  coins_early_bonus: 3,
  coins_review_approved_bonus: 1,
};


export interface GamificationConfig {
  enabled: boolean;
  scope: "company" | "sector" | "both";
  rules: typeof DEFAULT_RULES;
  prizeTitle: string | null;
  prizeDescription: string | null;
  prizeImageUrl: string | null;
  currentRewardId: string | null;
}

export interface EmployeeOfMonth {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  sectorId: string | null;
  month: string;
  points: number;
  coins: number;
  tasksCompleted: number;
  tasksOnTime: number;
  tasksLate: number;
  reviewsApproved: number;
  rewardId: string | null;
  rewardTitle: string | null;
  rewardDelivered: boolean;
  deliveredAt: string | null;
  shareCardUrl: string | null;
  kpiSnapshot: Record<string, string | number | boolean | null>;
}

async function loadActiveWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data: p } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  if (!p?.current_workspace_id) throw new Error("Workspace ativo não definido.");
  return p.current_workspace_id as string;
}

async function canManage(sb: AnySb, wsId: string, userId: string): Promise<boolean> {
  const { data } = await sb.rpc("can_manage_workflow", { _workspace_id: wsId, _user_id: userId });
  return Boolean(data);
}

function monthStart(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// ==================== CONFIG ====================
export const getGamificationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data } = await sb
      .from("workflow_gamification_config")
      .select("*")
      .eq("workspace_id", wsId)
      .maybeSingle();
    const cfg: GamificationConfig = {
      enabled: !!data?.enabled,
      scope: (data?.scope as GamificationConfig["scope"]) ?? "company",
      rules: { ...DEFAULT_RULES, ...(data?.rules ?? {}) },
      prizeTitle: data?.prize_title ?? null,
      prizeDescription: data?.prize_description ?? null,
      prizeImageUrl: data?.prize_image_url ?? null,
      currentRewardId: data?.current_reward_id ?? null,
    };
    return { config: cfg, canManage: await canManage(sb, wsId, context.userId) };
  });

export const saveGamificationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        scope: z.enum(["company", "sector", "both"]),
        rules: z.record(z.string(), z.any()),
        prizeTitle: z.string().max(200).nullable().optional(),
        prizeDescription: z.string().max(2000).nullable().optional(),
        prizeImageUrl: z.string().max(1000).nullable().optional(),
        currentRewardId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const merged = { ...DEFAULT_RULES, ...data.rules };
    const { error } = await sb.from("workflow_gamification_config").upsert(
      {
        workspace_id: wsId,
        enabled: data.enabled,
        scope: data.scope,
        rules: merged,
        prize_title: data.prizeTitle ?? null,
        prize_description: data.prizeDescription ?? null,
        prize_image_url: data.prizeImageUrl ?? null,
        current_reward_id: data.currentRewardId ?? null,
      },
      { onConflict: "workspace_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== LEADERBOARD ====================
export interface LeaderRow {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  points: number; // XP do mês (define o Funcionário do Mês)
  xp: number; // alias legível de `points`
  coins: number; // moedas ganhas no mês
  coinsBalance: number; // saldo total (lifetime menos gastos)
  coinsLifetime: number; // total acumulado desde sempre
  tasksCompleted: number;
  tasksOnTime: number;
  tasksLate: number;
  tasksIncomplete: number;
  reviewsApproved: number;
  reviewsReturned: number;
}


export const getMonthlyLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: z.string().optional(), // yyyy-mm-01
        sectorId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const month = data.month ?? monthStart();

    const query = sb
      .from("workflow_gamification_scores")
      .select("*")
      .eq("workspace_id", wsId)
      .eq("month", month)
      .order("points", { ascending: false });

    if (data.sectorId === null || data.sectorId === undefined) {
      // company view: agregar em memória entre sectores (soma total por usuário)
    } else {
      query.eq("sector_id", data.sectorId);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const agg = new Map<string, LeaderRow>();
    for (const r of ((rows as any[]) ?? [])) {
      if (data.sectorId === undefined || data.sectorId === null) {
        // company: agregar todas as linhas (mesmo com sector_id != null) somando
      }
      const key = r.user_id as string;
      const cur: LeaderRow = agg.get(key) ?? {
        userId: key,
        userName: "",
        avatarUrl: null,
        points: 0,
        xp: 0,
        coins: 0,
        coinsBalance: 0,
        coinsLifetime: 0,
        tasksCompleted: 0,
        tasksOnTime: 0,
        tasksLate: 0,
        tasksIncomplete: 0,
        reviewsApproved: 0,
        reviewsReturned: 0,
      };
      cur.points += Number(r.points ?? 0);
      cur.xp = cur.points;
      cur.coins += Number(r.coins ?? 0);
      cur.tasksCompleted += Number(r.tasks_completed ?? 0);
      cur.tasksOnTime += Number(r.tasks_on_time ?? 0);
      cur.tasksLate += Number(r.tasks_late ?? 0);
      cur.tasksIncomplete += Number(r.tasks_incomplete ?? 0);
      cur.reviewsApproved += Number(r.reviews_approved ?? 0);
      cur.reviewsReturned += Number(r.reviews_returned ?? 0);
      agg.set(key, cur);
    }

    // Enriquecer com nome/avatar/carteira
    const userIds = [...agg.keys()];
    if (userIds.length > 0) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, display_name, full_name, avatar_url")
        .in("id", userIds);
      for (const p of ((profs as any[]) ?? [])) {
        const row = agg.get(p.id);
        if (row) {
          row.userName = p.display_name || p.full_name || "Usuário";
          row.avatarUrl = p.avatar_url ?? null;
        }
      }
      const { data: wallets } = await sb
        .from("workflow_gamification_wallets")
        .select("user_id, coins_balance, coins_lifetime")
        .eq("workspace_id", wsId)
        .in("user_id", userIds);
      for (const w of ((wallets as any[]) ?? [])) {
        const row = agg.get(w.user_id);
        if (row) {
          row.coinsBalance = Number(w.coins_balance ?? 0);
          row.coinsLifetime = Number(w.coins_lifetime ?? 0);
        }
      }

    }

    // Sectores para o seletor
    const { data: sectors } = await sb
      .from("workflow_sectors")
      .select("id,name")
      .eq("workspace_id", wsId)
      .order("name", { ascending: true });

    const leaderboard = [...agg.values()].sort((a, b) => b.points - a.points);
    return {
      month,
      leaderboard,
      sectors: ((sectors as any[]) ?? []).map((s) => ({ id: s.id, name: s.name })),
    };
  });

// ==================== AWARD POINTS (called from other server fns) ====================
export async function awardTaskPoints(
  sbAdminOrCtx: AnySb,
  workspaceId: string,
  userId: string,
  taskId: string,
  event:
    | "task_completed"
    | "task_marked_incomplete"
    | "review_approved"
    | "review_returned"
    | "review_submitted",
  meta?: { round?: number },
) {
  try {
    const { data: cfg } = await sbAdminOrCtx
      .from("workflow_gamification_config")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!cfg?.enabled) return;

    const rules = { ...DEFAULT_RULES, ...(cfg.rules ?? {}) };
    const { data: task } = await sbAdminOrCtx
      .from("workflow_tasks")
      .select("id, priority, due_at, completed_at, estimated_seconds, time_spent_seconds, pipeline_id, created_at")
      .eq("id", taskId)
      .maybeSingle();
    if (!task) return;

    const { data: pipe } = await sbAdminOrCtx
      .from("workflow_pipelines")
      .select("sector_id")
      .eq("id", task.pipeline_id)
      .maybeSingle();
    const sectorIdFromPipe: string | null = (pipe as any)?.sector_id ?? null;

    // Calcula pontos (XP) e coins por evento
    let totalPoints = 0;
    let totalCoins = 0;
    const reasons: { reason: string; points: number; coins?: number; metadata?: Record<string, unknown> }[] = [];

    if (event === "task_completed") {
      const base =
        Number(rules.points_by_priority?.[task.priority ?? "media"] ?? rules.points_by_priority?.media ?? 10) || 10;
      totalPoints += base;
      const coinBase =
        Number(rules.coins_by_priority?.[task.priority ?? "media"] ?? rules.coins_by_priority?.media ?? 0) || 0;
      totalCoins += coinBase;
      reasons.push({ reason: "task_completed", points: base, coins: coinBase, metadata: { priority: task.priority } });

      // On-time / early bonus
      if (task.due_at && task.completed_at) {
        const due = new Date(task.due_at).getTime();
        const done = new Date(task.completed_at).getTime();
        if (done <= due) {
          const onTime = Number(rules.on_time_bonus ?? 0);
          const onTimeCoins = Number(rules.coins_on_time_bonus ?? 0);
          totalPoints += onTime;
          totalCoins += onTimeCoins;
          reasons.push({ reason: "on_time_bonus", points: onTime, coins: onTimeCoins });
          const created = task.created_at ? new Date(task.created_at).getTime() : done;
          const window = due - created;
          const remaining = due - done;
          if (window > 0 && remaining / window > 0.25) {
            const early = Number(rules.early_bonus ?? 0);
            const earlyCoins = Number(rules.coins_early_bonus ?? 0);
            totalPoints += early;
            totalCoins += earlyCoins;
            reasons.push({ reason: "early_bonus", points: early, coins: earlyCoins });
          }
        }
      }
      // Under-estimate bonus (XP only)
      if (task.estimated_seconds && task.time_spent_seconds < task.estimated_seconds) {
        const hoursSaved = (task.estimated_seconds - task.time_spent_seconds) / 3600;
        const pts = Math.round(hoursSaved * Number(rules.per_hour_under_estimate ?? 0));
        if (pts > 0) {
          totalPoints += pts;
          reasons.push({ reason: "under_estimate_bonus", points: pts, metadata: { hoursSaved } });
        }
      }
    } else if (event === "task_marked_incomplete") {
      const pen = Number(rules.incomplete_penalty ?? 0);
      totalPoints += pen;
      reasons.push({ reason: "incomplete_penalty", points: pen });
    } else if (event === "review_approved") {
      const b = Number(rules.review_approved_bonus ?? 0);
      const c = Number(rules.coins_review_approved_bonus ?? 0);
      totalPoints += b;
      totalCoins += c;
      reasons.push({ reason: "review_approved_bonus", points: b, coins: c });
      // Retrabalho: cada rodada extra de revisão desconta.
      const extra = Math.max(0, Number(meta?.round ?? 1) - 1);
      if (extra > 0) {
        const pen = extra * Number(rules.rework_penalty_per_round ?? 0);
        if (pen !== 0) {
          totalPoints += pen;
          reasons.push({ reason: "rework_penalty", points: pen, metadata: { rounds: extra } });
        }
      }
    } else if (event === "review_returned") {
      const pen = Number(rules.review_returned_penalty ?? 0);
      totalPoints += pen;
      reasons.push({ reason: "review_returned_penalty", points: pen });
    } else if (event === "review_submitted") {
      const b = Number(rules.review_submitted_bonus ?? 0);
      if (b !== 0) {
        totalPoints += b;
        reasons.push({ reason: "review_submitted_bonus", points: b, metadata: { round: meta?.round ?? 1 } });
      }
    }

    if (totalPoints === 0 && totalCoins === 0 && reasons.length === 0) return;



    const month = monthStart();
    const scope = (cfg.scope as string) ?? "company";

    // Determina quais linhas de placar afetar
    const targets: (string | null)[] = [];
    if (scope === "company") targets.push(null);
    else if (scope === "sector") targets.push(sectorIdFromPipe);
    else if (scope === "both") {
      targets.push(null);
      if (sectorIdFromPipe) targets.push(sectorIdFromPipe);
    }

    const isOnTime =
      event === "task_completed" && task.due_at && task.completed_at
        ? new Date(task.completed_at).getTime() <= new Date(task.due_at).getTime()
        : false;

    for (const secId of targets) {
      // upsert score
      const { data: existing } = await sbAdminOrCtx
        .from("workflow_gamification_scores")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("month", month)
        .is("sector_id", secId === null ? true : (undefined as any))
        .maybeSingle();

      // fallback lookup when secId != null
      let row = existing as any;
      if (!row && secId !== null) {
        const { data: existing2 } = await sbAdminOrCtx
          .from("workflow_gamification_scores")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("user_id", userId)
          .eq("month", month)
          .eq("sector_id", secId)
          .maybeSingle();
        row = existing2 as any;
      }

      const patch: Record<string, number | string | null> = {
        workspace_id: workspaceId,
        user_id: userId,
        sector_id: secId,
        month,
        points: (row?.points ?? 0) + totalPoints,
        coins: (row?.coins ?? 0) + totalCoins,
        tasks_completed: (row?.tasks_completed ?? 0) + (event === "task_completed" ? 1 : 0),
        tasks_on_time: (row?.tasks_on_time ?? 0) + (isOnTime ? 1 : 0),
        tasks_late:
          (row?.tasks_late ?? 0) + (event === "task_completed" && !isOnTime && task.due_at ? 1 : 0),
        tasks_incomplete: (row?.tasks_incomplete ?? 0) + (event === "task_marked_incomplete" ? 1 : 0),
        reviews_approved: (row?.reviews_approved ?? 0) + (event === "review_approved" ? 1 : 0),
        reviews_returned: (row?.reviews_returned ?? 0) + (event === "review_returned" ? 1 : 0),
      };

      if (row) {
        await sbAdminOrCtx
          .from("workflow_gamification_scores")
          .update(patch)
          .eq("id", row.id);
      } else {
        await sbAdminOrCtx.from("workflow_gamification_scores").insert(patch);
      }

      // eventos de auditoria
      for (const r of reasons) {
        await sbAdminOrCtx.from("workflow_gamification_events").insert({
          workspace_id: workspaceId,
          user_id: userId,
          sector_id: secId,
          task_id: taskId,
          month,
          reason: r.reason,
          points: r.points,
          metadata: { ...(r.metadata ?? {}), coins: r.coins ?? 0 },
        });
      }
    }

    // Atualiza carteira lifetime (uma única vez, independente do escopo)
    if (totalCoins !== 0 || totalPoints !== 0) {
      const { data: wallet } = await sbAdminOrCtx
        .from("workflow_gamification_wallets")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();
      const w = wallet as any;
      const newBalance = Math.max(0, (w?.coins_balance ?? 0) + totalCoins);
      const newLifetime = Math.max(0, (w?.coins_lifetime ?? 0) + Math.max(0, totalCoins));
      const newXp = Math.max(0, (w?.xp_lifetime ?? 0) + Math.max(0, totalPoints));
      if (w) {
        await sbAdminOrCtx
          .from("workflow_gamification_wallets")
          .update({ coins_balance: newBalance, coins_lifetime: newLifetime, xp_lifetime: newXp, updated_at: new Date().toISOString() })
          .eq("id", w.id);
      } else {
        await sbAdminOrCtx.from("workflow_gamification_wallets").insert({
          workspace_id: workspaceId,
          user_id: userId,
          coins_balance: newBalance,
          coins_lifetime: newLifetime,
          xp_lifetime: newXp,
        });
      }
    }

  } catch (e) {
    console.warn("awardTaskPoints failed", e);
  }
}

// ==================== EMPLOYEE OF THE MONTH ====================
export const computeEmployeeOfMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: z.string().optional(), // yyyy-mm-01
        sectorId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const month = data.month ?? monthStart();
    const sectorId = data.sectorId ?? null;

    const { data: cfg } = await sb
      .from("workflow_gamification_config")
      .select("current_reward_id")
      .eq("workspace_id", wsId)
      .maybeSingle();

    const query = sb
      .from("workflow_gamification_scores")
      .select("*")
      .eq("workspace_id", wsId)
      .eq("month", month)
      .order("points", { ascending: false });

    if (sectorId) query.eq("sector_id", sectorId);
    else query.is("sector_id", null);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const winner = ((rows as any[]) ?? [])[0];
    if (!winner) return { winner: null, month, sectorId };

    const { data: prof } = await sb
      .from("profiles")
      .select("id, display_name, full_name, avatar_url")
      .eq("id", winner.user_id)
      .maybeSingle();

    const kpiSnapshot = {
      points: winner.points ?? 0,
      coins: winner.coins ?? 0,
      tasks_completed: winner.tasks_completed ?? 0,
      tasks_on_time: winner.tasks_on_time ?? 0,
      tasks_late: winner.tasks_late ?? 0,
      tasks_incomplete: winner.tasks_incomplete ?? 0,
      reviews_approved: winner.reviews_approved ?? 0,
      reviews_returned: winner.reviews_returned ?? 0,
    };

    const { data: inserted, error: upsertError } = await sb
      .from("workflow_employee_of_month")
      .upsert(
        {
          workspace_id: wsId,
          user_id: winner.user_id,
          sector_id: sectorId,
          month,
          points: winner.points ?? 0,
          coins: winner.coins ?? 0,
          tasks_completed: winner.tasks_completed ?? 0,
          tasks_on_time: winner.tasks_on_time ?? 0,
          tasks_late: winner.tasks_late ?? 0,
          reviews_approved: winner.reviews_approved ?? 0,
          kpi_snapshot: kpiSnapshot,
          reward_id: cfg?.current_reward_id ?? null,
        },
        { onConflict: "workspace_id, sector_id, month" },
      )
      .select("*")
      .single();
    if (upsertError) throw new Error(upsertError.message);

    const r = inserted as any;
    return {
      winner: {
        id: r.id,
        workspaceId: r.workspace_id,
        userId: r.user_id,
        userName: (prof as any)?.display_name || (prof as any)?.full_name || "Funcionário",
        avatarUrl: (prof as any)?.avatar_url ?? null,
        sectorId: r.sector_id ?? null,
        month: r.month,
        points: r.points,
        coins: r.coins,
        tasksCompleted: r.tasks_completed,
        tasksOnTime: r.tasks_on_time,
        tasksLate: r.tasks_late,
        reviewsApproved: r.reviews_approved,
        rewardId: r.reward_id ?? null,
        rewardTitle: null,
        rewardDelivered: r.reward_delivered,
        deliveredAt: r.delivered_at ?? null,
        shareCardUrl: r.share_card_url ?? null,
        kpiSnapshot: (r.kpi_snapshot ?? {}) as Record<string, string | number | boolean | null>,
      } as EmployeeOfMonth,
      month,
      sectorId,
    };
  });

export const getHallOfFame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sectorId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(24),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const sectorId = data.sectorId ?? null;

    const query = sb
      .from("workflow_employee_of_month")
      .select("*, workflow_gamification_rewards(title)")
      .eq("workspace_id", wsId)
      .order("month", { ascending: false })
      .limit(data.limit);

    if (sectorId) query.eq("sector_id", sectorId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const userIds = ((rows as any[]) ?? []).map((r) => r.user_id);
    let profMap = new Map<string, any>();
    if (userIds.length) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, display_name, full_name, avatar_url")
        .in("id", userIds);
      profMap = new Map(((profs as any[]) ?? []).map((p) => [p.id, p]));
    }

    return ((rows as any[]) ?? []).map((r) => {
      const prof = profMap.get(r.user_id);
      const rewardTitle = Array.isArray(r.workflow_gamification_rewards)
        ? r.workflow_gamification_rewards[0]?.title ?? null
        : r.workflow_gamification_rewards?.title ?? null;
      return {
        id: r.id,
        workspaceId: r.workspace_id,
        userId: r.user_id,
        userName: prof?.display_name || prof?.full_name || "Funcionário",
        avatarUrl: prof?.avatar_url ?? null,
        sectorId: r.sector_id ?? null,
        month: r.month,
        points: r.points,
        coins: r.coins,
        tasksCompleted: r.tasks_completed,
        tasksOnTime: r.tasks_on_time,
        tasksLate: r.tasks_late,
        reviewsApproved: r.reviews_approved,
        rewardId: r.reward_id ?? null,
        rewardTitle,
        rewardDelivered: r.reward_delivered,
        deliveredAt: r.delivered_at ?? null,
        shareCardUrl: r.share_card_url ?? null,
        kpiSnapshot: (r.kpi_snapshot ?? {}) as Record<string, string | number | boolean | null>,
      } as EmployeeOfMonth;
    });
  });

export const markRewardDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), delivered: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { error } = await sb
      .from("workflow_employee_of_month")
      .update({
        reward_delivered: data.delivered,
        delivered_at: data.delivered ? new Date().toISOString() : null,
      })
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveShareCardUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), shareCardUrl: z.string().max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { error } = await sb
      .from("workflow_employee_of_month")
      .update({ share_card_url: data.shareCardUrl })
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
