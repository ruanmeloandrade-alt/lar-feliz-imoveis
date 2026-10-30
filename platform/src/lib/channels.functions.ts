import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { from: (t: string) => any };

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const wsId = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

export interface ChannelAccount {
  id: string;
  label: string;
  subtitle?: string;
  status?: string;
}

export interface WorkspaceChannels {
  whatsapp: ChannelAccount[];
  instagram: ChannelAccount[];
  facebook: ChannelAccount[];
  email: ChannelAccount[];
}

/** Lista contas conectadas por canal do workspace ativo. */
export const listWorkspaceChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceChannels> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const [wa, ig, fb] = await Promise.all([
      sb.from("whatsapp_web_sessions")
        .select("id, phone_number, status, updated_at, metadata")
        .eq("workspace_id", wsId),
      sb.from("meta_instagram_accounts")
        .select("id, username, instagram_id")
        .eq("workspace_id", wsId),
      sb.from("meta_pages")
        .select("id, page_name, page_id")
        .eq("workspace_id", wsId),
    ]);

    if (wa.error) throw new Error("Não foi possível consultar as sessões de WhatsApp. Atualize a lista para tentar novamente.");

    const statusRank = (s: string | null | undefined) =>
      s === "conectado" || s === "connected" ? 0 : s === "conectando" || s === "connecting" ? 1 : s === "desconectado" || s === "disconnected" ? 2 : 3;

    const waRows = ((wa.data ?? []) as Array<{
      id: string;
      phone_number: string | null;
      status: string | null;
      updated_at?: string | null;
      metadata?: { deleted?: boolean } | null;
    }>).filter((r) => {
      const status = (r.status ?? "").toLowerCase();
      const digits = (r.phone_number ?? "").replace(/\D/g, "");
      const connected = status === "conectado" || status === "connected" || status === "open";
      const usableWithoutPhone = connected;
      const usableWithPhone = digits.length >= 8 && status !== "desconectado" && status !== "disconnected";
      return r.metadata?.deleted !== true && (usableWithoutPhone || usableWithPhone);
    });

    const byIdentity = new Map<string, typeof waRows[number]>();
    for (const r of waRows) {
      const digits = (r.phone_number ?? "").replace(/\D/g, "");
      const key = digits.length >= 8 ? `phone:${digits}` : `session:${r.id}`;
      const existing = byIdentity.get(key);
      if (!existing) { byIdentity.set(key, r); continue; }
      const better =
        statusRank(r.status) < statusRank(existing.status) ||
        (statusRank(r.status) === statusRank(existing.status) &&
          (r.updated_at ?? "") > (existing.updated_at ?? ""));
      if (better) byIdentity.set(key, r);
    }

    const waList = Array.from(byIdentity.values()).map((r) => ({
      id: r.id,
      label: r.phone_number || "WhatsApp conectado",
      status: r.status ?? undefined,
    }));
    const igList = ((ig.data ?? []) as Array<{ id: string; username: string | null; instagram_id: string }>).map((r) => ({
      id: r.id,
      label: r.username ? `@${r.username}` : `Instagram ${r.instagram_id}`,
    }));
    const fbList = ((fb.data ?? []) as Array<{ id: string; page_name: string | null; page_id: string }>).map((r) => ({
      id: r.id,
      label: r.page_name || `Página ${r.page_id}`,
    }));

    return { whatsapp: waList, instagram: igList, facebook: fbList, email: [] };
  });
