import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = {
  from: (t: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type AccountItem = {
  id: string;
  name: string;
  slug: string;
  role: string;
  role_type: string | null;
  is_partner: boolean;
  is_owner: boolean;
  status: "ativo" | "teste" | "expirado" | "sem_plano";
  plan_name: string | null;
};

export type ProgramDestination = {
  role: "affiliate" | "partner";
  status: "pending" | "approved" | "blocked" | "rejected" | "admin_preview";
  href: "/partners/afiliado" | "/partners/parceiro";
};

function computeStatus(sub: { status?: string | null; trial_ends_at?: string | null; current_period_end?: string | null } | null): AccountItem["status"] {
  if (!sub) return "sem_plano";
  const now = Date.now();
  const s = (sub.status ?? "").toLowerCase();
  if (s === "trialing" || s === "trial") {
    const end = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    return end && end < now ? "expirado" : "teste";
  }
  if (s === "active" || s === "ativo") {
    const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
    return end && end < now ? "expirado" : "ativo";
  }
  if (s === "canceled" || s === "cancelado" || s === "past_due" || s === "expired") return "expirado";
  return "sem_plano";
}

export const listMyAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId as string;

    const [{ data: members }, { data: profile }, { data: programRoles }, adminResult] = await Promise.all([
      sb.from("workspace_members").select("workspace_id, role, role_type, is_partner").eq("user_id", userId),
      sb.from("profiles").select("display_name, full_name, avatar_url, current_workspace_id").eq("id", userId).maybeSingle(),
      sb.from("partner_program_roles").select("role, status").eq("user_id", userId),
      sb.rpc("partner_program_is_admin", { _user_id: userId }),
    ]);

    const isProgramAdmin = adminResult.error ? false : adminResult.data === true;
    const destinations = new Map<"affiliate" | "partner", ProgramDestination>();

    for (const item of (programRoles ?? []) as Array<{ role: string; status: ProgramDestination["status"] }>) {
      if (item.role !== "affiliate" && item.role !== "partner") continue;
      // Cadastro pendente já entra no portal. Aprovação libera divulgação; bloqueado/rejeitado perde o atalho.
      if (item.status !== "pending" && item.status !== "approved") continue;
      destinations.set(item.role, {
        role: item.role,
        status: item.status,
        href: item.role === "affiliate" ? "/partners/afiliado" : "/partners/parceiro",
      });
    }

    // Super admin enxerga as duas experiências para homologação, mas um papel comercial real sempre vence o preview.
    if (isProgramAdmin) {
      if (!destinations.has("affiliate")) destinations.set("affiliate", { role: "affiliate", status: "admin_preview", href: "/partners/afiliado" });
      if (!destinations.has("partner")) destinations.set("partner", { role: "partner", status: "admin_preview", href: "/partners/parceiro" });
    }

    const ids = ((members ?? []) as Array<{ workspace_id: string }>).map((m) => m.workspace_id);
    let accounts: AccountItem[] = [];

    if (ids.length > 0) {
      const [{ data: workspaces }, { data: subs }] = await Promise.all([
        sb.from("workspaces").select("id, name, slug, owner_id").in("id", ids),
        sb.from("subscriptions").select("workspace_id, status, trial_ends_at, current_period_end, plans(name)").in("workspace_id", ids),
      ]);

      const subByWs = new Map<string, any>();
      for (const s of (subs ?? []) as any[]) subByWs.set(s.workspace_id, s);
      const memberByWs = new Map<string, any>();
      for (const m of (members ?? []) as any[]) memberByWs.set(m.workspace_id, m);

      accounts = ((workspaces ?? []) as any[])
        .map((w) => {
          const sub = subByWs.get(w.id) ?? null;
          const member = memberByWs.get(w.id) ?? {};
          return {
            id: w.id as string,
            name: (w.name as string) ?? "Conta",
            slug: (w.slug as string) ?? "",
            role: (member.role as string) ?? "member",
            role_type: (member.role_type as string | null) ?? null,
            is_partner: member.is_partner === true,
            is_owner: w.owner_id === userId,
            status: computeStatus(sub),
            plan_name: sub?.plans?.name ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }

    return {
      accounts,
      profile: profile ?? null,
      email: (context as any).claims?.email ?? null,
      current_workspace_id: (profile as any)?.current_workspace_id ?? null,
      is_program_admin: isProgramAdmin,
      program_destinations: Array.from(destinations.values()).sort((a, b) => a.role.localeCompare(b.role)),
    };
  });

export const switchAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId as string;

    const { data: member } = await sb
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!member) throw new Error("Você não tem acesso a esta conta.");

    const { error } = await sb
      .from("profiles")
      .upsert({ id: userId, current_workspace_id: data.workspaceId }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });