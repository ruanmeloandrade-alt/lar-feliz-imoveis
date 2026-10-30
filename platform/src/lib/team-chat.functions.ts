import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Chat da equipe: setores (um chat por setor) + conversas diretas 1:1.
 * Não existem "canais" livres — só setor e pessoa.
 * O dono/administrador do workspace enxerga todos os setores e todas as pessoas.
 */

type Ctx = { supabase: any; userId: string };

async function resolveWorkspace({ supabase, userId }: Ctx) {
  const { data: prof } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  let wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id ?? null;
  if (!wsId) {
    const { data: wm } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    wsId = (wm as { workspace_id?: string } | null)?.workspace_id ?? null;
  }
  if (!wsId) throw new Error("Sem workspace ativo");
  return wsId as string;
}

async function isAdmin(supabase: any, userId: string, workspaceId: string) {
  const { data } = await supabase.rpc("can_admin_workspace", {
    _user_id: userId,
    _workspace_id: workspaceId,
  });
  return Boolean(data);
}

export interface TeamConversationDTO {
  /** chave da conversa: `sector:<id>` ou `dm:<userId>` */
  key: string;
  kind: "sector" | "dm";
  id: string;
  name: string;
  color?: string | null;
  /** setor: quantidade de membros | dm: e-mail do colega */
  subtitle?: string | null;
  lastMessage?: string | null;
  lastAt?: string | null;
  unread: number;
  system?: boolean;
}

export const listTeamConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const workspaceId = await resolveWorkspace({ supabase, userId });
    const admin = await isAdmin(supabase, userId, workspaceId);

    const [{ data: sectors }, { data: members }, { data: users }, { data: reads }] =
      await Promise.all([
        supabase
          .from("workflow_sectors")
          .select("id, name, color, position")
          .eq("workspace_id", workspaceId)
          .order("position", { ascending: true }),
        supabase
          .from("workflow_sector_members")
          .select("sector_id, user_id")
          .eq("workspace_id", workspaceId),
        supabase.rpc("list_workspace_users", { _workspace_id: workspaceId }),
        supabase
          .from("team_chat_reads")
          .select("conversation_key, last_read_at")
          .eq("workspace_id", workspaceId)
          .eq("user_id", userId),
      ]);

    const memberRows = (members ?? []) as Array<{ sector_id: string; user_id: string }>;
    const mySectorIds = new Set(
      memberRows.filter((m) => m.user_id === userId).map((m) => m.sector_id),
    );
    const visibleSectors = ((sectors ?? []) as Array<{
      id: string;
      name: string;
      color: string | null;
    }>).filter((s) => admin || mySectorIds.has(s.id));

    const userRows = ((users ?? []) as Array<{ id: string; name: string; email: string }>).filter(
      (u) => u.id !== userId,
    );

    const readMap = new Map(
      ((reads ?? []) as Array<{ conversation_key: string; last_read_at: string }>).map((r) => [
        r.conversation_key,
        r.last_read_at,
      ]),
    );

    // Últimas mensagens visíveis (RLS já filtra)
    const { data: recent } = await supabase
      .from("team_messages")
      .select("id, sector_id, from_user_id, to_user_id, body, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(500);

    const stats = new Map<string, { last: string; lastAt: string; unread: number }>();
    for (const m of (recent ?? []) as Array<{
      sector_id: string | null;
      from_user_id: string | null;
      to_user_id: string | null;
      body: string;
      created_at: string;
    }>) {
      const key = m.sector_id
        ? `sector:${m.sector_id}`
        : `dm:${m.from_user_id === null ? userId : m.from_user_id === userId ? m.to_user_id : m.from_user_id}`;
      const cur = stats.get(key) ?? { last: m.body, lastAt: m.created_at, unread: 0 };
      const lastRead = readMap.get(key);
      const isMine = m.from_user_id === userId;
      if (!isMine && (!lastRead || m.created_at > lastRead)) cur.unread += 1;
      stats.set(key, cur);
    }

    const sectorConversations: TeamConversationDTO[] = visibleSectors.map((s) => {
      const key = `sector:${s.id}`;
      const st = stats.get(key);
      const count = memberRows.filter((m) => m.sector_id === s.id).length;
      return {
        key,
        kind: "sector",
        id: s.id,
        name: s.name,
        color: s.color,
        subtitle: `${count} ${count === 1 ? "integrante" : "integrantes"}`,
        lastMessage: st?.last ?? null,
        lastAt: st?.lastAt ?? null,
        unread: st?.unread ?? 0,
      };
    });

    const dmConversations: TeamConversationDTO[] = userRows.map((u) => {
      const key = `dm:${u.id}`;
      const st = stats.get(key);
      return {
        key,
        kind: "dm",
        id: u.id,
        name: u.name,
        subtitle: u.email,
        lastMessage: st?.last ?? null,
        lastAt: st?.lastAt ?? null,
        unread: st?.unread ?? 0,
      };
    });

    const systemStats = stats.get(`dm:${userId}`);
    if (systemStats) dmConversations.unshift({
      key: `dm:${userId}`, kind: "dm", id: userId, name: "Alertas do sistema",
      subtitle: "Mensagens internas dos SalesBots", system: true,
      lastMessage: systemStats.last, lastAt: systemStats.lastAt, unread: systemStats.unread,
    });
    return {
      workspaceId,
      isAdmin: admin,
      sectors: sectorConversations,
      directs: dmConversations,
    };
  });

export const listTeamMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["sector", "dm"]),
        targetId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const workspaceId = await resolveWorkspace({ supabase, userId });

    let q = supabase
      .from("team_messages")
      .select("id, sector_id, from_user_id, to_user_id, body, origin, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (data.kind === "sector") {
      q = q.eq("sector_id", data.targetId);
    } else if (data.targetId === userId) {
      q = q.is("sector_id", null).is("from_user_id", null).eq("to_user_id", userId);
    } else {
      q = q
        .is("sector_id", null)
        .or(
          `and(from_user_id.eq.${userId},to_user_id.eq.${data.targetId}),and(from_user_id.eq.${data.targetId},to_user_id.eq.${userId})`,
        );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const list = ((rows ?? []) as Array<{
      id: string;
      sector_id: string | null;
      from_user_id: string | null;
      to_user_id: string | null;
      body: string;
      origin: string;
      created_at: string;
    }>).reverse();

    // nomes dos autores
    const { data: users } = await supabase.rpc("list_workspace_users", {
      _workspace_id: workspaceId,
    });
    const nameMap = new Map(
      ((users ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]),
    );

    return list.map((m) => ({
      ...m,
      mine: m.from_user_id === userId,
      authorName: m.from_user_id ? (nameMap.get(m.from_user_id) ?? "Usuário") : "Sistema",
      isSystem: m.origin !== "user",
    }));
  });

export const sendTeamMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["sector", "dm"]),
        targetId: z.string().uuid(),
        body: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const workspaceId = await resolveWorkspace({ supabase, userId });

    if (data.kind === "dm" && data.targetId === userId) throw new Error("Alertas do sistema são somente para leitura.");
    const { error } = await supabase.from("team_messages").insert({
      workspace_id: workspaceId,
      sector_id: data.kind === "sector" ? data.targetId : null,
      to_user_id: data.kind === "dm" ? data.targetId : null,
      from_user_id: userId,
      body: data.body,
      origin: "user",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markTeamConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const workspaceId = await resolveWorkspace({ supabase, userId });
    const { error } = await supabase.from("team_chat_reads").upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        conversation_key: data.key,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "user_id,workspace_id,conversation_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Opções de destinatário para o bloco "Mensagem interna" do Salesbot. */
export const listInternalMessageTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const workspaceId = await resolveWorkspace({ supabase, userId });
    const [{ data: users }, { data: sectors }] = await Promise.all([
      supabase.rpc("list_workspace_users", { _workspace_id: workspaceId }),
      supabase
        .from("workflow_sectors")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .order("position", { ascending: true }),
    ]);
    return {
      users: ((users ?? []) as Array<{ id: string; name: string; email: string }>).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
      })),
      sectors: ((sectors ?? []) as Array<{ id: string; name: string }>).map((s) => ({
        id: s.id,
        name: s.name,
      })),
    };
  });
