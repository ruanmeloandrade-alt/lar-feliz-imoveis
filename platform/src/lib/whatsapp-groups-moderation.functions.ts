// Moderação de grupos WhatsApp, server functions autenticadas.
// A UI (Central de Grupos) chama diretamente; o Salesbot runtime importa `runModeratorAction`.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMember(supabase: unknown, workspaceId: string, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { data, error } = await s.from("workspace_members")
    .select("workspace_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a este workspace");
}

/** Resolve credenciais Evolution ativas do workspace (ou da sessão específica). */
async function resolveCtx(workspaceId: string, sessionId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
  if (!encKey || !base) throw new Error("Ambiente Evolution não configurado");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabaseAdmin as any).from("whatsapp_web_sessions")
    .select("id").eq("workspace_id", workspaceId).eq("provider", "evolution").eq("status", "conectado");
  if (sessionId) q = q.eq("id", sessionId);
  const { data: sess } = await q.order("last_connected_at", { ascending: false }).limit(1).maybeSingle();
  const sid = (sess as { id?: string } | null)?.id;
  if (!sid) throw new Error("Nenhuma sessão Evolution conectada");

  const credsRes = await supabaseAdmin.rpc("get_evolution_credentials_service" as never, {
    _session_id: sid, _key: encKey,
  } as never);
  const c = credsRes.data as { instance_name?: string; api_key?: string } | null;
  if (!c?.instance_name || !c.api_key) throw new Error("Credenciais Evolution indisponíveis");
  return { baseUrl: base, apiKey: c.api_key, instance: c.instance_name, sessionId: sid };
}

/** Action executor reutilizável (Salesbot runtime / webhooks). */
export async function runModeratorAction(params: {
  workspaceId: string;
  groupJid: string;
  sessionId?: string;
  action: string;
  config: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveCtx(params.workspaceId, params.sessionId).catch((e) => e as Error);
  if (ctx instanceof Error) return { ok: false, error: ctx.message };

  const g = await import("./evolution-groups.server");
  const cfg = params.config ?? {};
  const gid = params.groupJid;
  try {
    switch (params.action) {
      case "moderar-apagar-msg": {
        return await g.deleteGroupMessage(ctx, {
          groupJid: gid,
          messageId: String(cfg.messageId ?? ""),
          participant: String(cfg.participant ?? ""),
          fromMe: Boolean(cfg.fromMe ?? false),
        });
      }
      case "moderar-remover-membro": {
        return await g.updateGroupParticipants(ctx, {
          groupJid: gid, action: "remove",
          participants: (cfg.participants as string[]) ?? [String(cfg.participant ?? "")],
        });
      }
      case "moderar-adicionar-membro": {
        return await g.updateGroupParticipants(ctx, {
          groupJid: gid, action: "add",
          participants: (cfg.participants as string[]) ?? [String(cfg.participant ?? "")],
        });
      }
      case "moderar-promover-admin": {
        return await g.updateGroupParticipants(ctx, {
          groupJid: gid, action: "promote",
          participants: (cfg.participants as string[]) ?? [String(cfg.participant ?? "")],
        });
      }
      case "moderar-rebaixar-admin": {
        return await g.updateGroupParticipants(ctx, {
          groupJid: gid, action: "demote",
          participants: (cfg.participants as string[]) ?? [String(cfg.participant ?? "")],
        });
      }
      case "moderar-alterar-nome":
        return await g.updateGroupSubject(ctx, { groupJid: gid, subject: String(cfg.subject ?? cfg.value ?? "") });
      case "moderar-alterar-descricao":
        return await g.updateGroupDescription(ctx, { groupJid: gid, description: String(cfg.description ?? cfg.value ?? "") });
      case "moderar-alterar-foto":
        return await g.updateGroupPicture(ctx, { groupJid: gid, image: String(cfg.image ?? cfg.url ?? "") });
      case "moderar-so-admins":
        return await g.updateGroupSetting(ctx, { groupJid: gid, action: "announcement" });
      case "moderar-liberar-todos":
        return await g.updateGroupSetting(ctx, { groupJid: gid, action: "not_announcement" });
      case "moderar-travar-edicao":
        return await g.updateGroupSetting(ctx, { groupJid: gid, action: "locked" });
      case "moderar-liberar-edicao":
        return await g.updateGroupSetting(ctx, { groupJid: gid, action: "unlocked" });
      case "moderar-mensagens-temporarias": {
        const exp = Number(cfg.expiration ?? 604800);
        const allowed = [0, 86400, 604800, 7776000] as const;
        const chosen = (allowed.includes(exp as never) ? exp : 604800) as 0 | 86400 | 604800 | 7776000;
        return await g.toggleEphemeral(ctx, { groupJid: gid, expiration: chosen });
      }
      case "moderar-sair":
        return await g.leaveGroup(ctx, { groupJid: gid });
      case "moderar-criar-enquete": {
        const raw = String(cfg.options ?? "").split(/[\n,;]/).map((o) => o.trim()).filter(Boolean);
        return await g.sendGroupPoll(ctx, {
          groupJid: gid, name: String(cfg.name ?? cfg.title ?? "Enquete"),
          options: raw, selectableCount: Number(cfg.selectableCount ?? 1),
        });
      }
      case "moderar-mencionar-todos":
        return await g.mentionEveryone(ctx, { groupJid: gid, text: String(cfg.text ?? cfg.message ?? "") });
      default:
        return { ok: false, error: `Ação de moderação desconhecida: ${params.action}` };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const ManualActionSchema = z.object({
  workspaceId: z.string().uuid(),
  groupJid: z.string().min(3),
  sessionId: z.string().uuid().optional(),
  action: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
});

/** Dispara uma ação de moderação manualmente (usado por botões na UI e teste). */
export const triggerGroupModeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ManualActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const r = await runModeratorAction({
      workspaceId: data.workspaceId,
      groupJid: data.groupJid,
      sessionId: data.sessionId,
      action: data.action,
      config: data.config,
    });
    return { ok: r.ok, error: r.error ?? null };
  });

/** Metadados do grupo direto da Evolution (útil para preencher participantes na UI). */
export const fetchGroupInfoLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), groupJid: z.string().min(3), sessionId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const ctx = await resolveCtx(data.workspaceId, data.sessionId);
    const g = await import("./evolution-groups.server");
    const r = await g.fetchGroupInfo(ctx, { groupJid: data.groupJid });
    return { ok: r.ok, status: r.status, error: r.error ?? null, dataJson: JSON.stringify(r.data ?? null) };
  });

/** Catálogo das ações, usado por Salesbot builder e Central de Grupos. */
export const MODERATOR_ACTIONS = [
  { id: "moderar-apagar-msg", label: "Apagar mensagem (para todos)", needs: ["messageId", "participant"] },
  { id: "moderar-remover-membro", label: "Remover membro do grupo", needs: ["participants"] },
  { id: "moderar-adicionar-membro", label: "Adicionar membro ao grupo", needs: ["participants"] },
  { id: "moderar-promover-admin", label: "Promover a administrador", needs: ["participants"] },
  { id: "moderar-rebaixar-admin", label: "Rebaixar administrador", needs: ["participants"] },
  { id: "moderar-alterar-nome", label: "Alterar nome do grupo", needs: ["subject"] },
  { id: "moderar-alterar-descricao", label: "Alterar descrição do grupo", needs: ["description"] },
  { id: "moderar-alterar-foto", label: "Alterar foto do grupo (URL)", needs: ["image"] },
  { id: "moderar-so-admins", label: "Restringir envio (só admins)", needs: [] },
  { id: "moderar-liberar-todos", label: "Liberar envio para todos", needs: [] },
  { id: "moderar-travar-edicao", label: "Travar edição de info (só admins)", needs: [] },
  { id: "moderar-liberar-edicao", label: "Liberar edição de info", needs: [] },
  { id: "moderar-mensagens-temporarias", label: "Ativar mensagens temporárias", needs: ["expiration"] },
  { id: "moderar-criar-enquete", label: "Criar enquete no grupo", needs: ["name", "options"] },
  { id: "moderar-mencionar-todos", label: "Mencionar todos (@all)", needs: ["text"] },
  { id: "moderar-sair", label: "Bot sair do grupo", needs: [] },
] as const;

export type ModeratorActionId = typeof MODERATOR_ACTIONS[number]["id"];
