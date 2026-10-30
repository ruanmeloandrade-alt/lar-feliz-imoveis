import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function assertSuperAdmin(sb: AnySb, userId: string) {
  const { data, error } = await sb.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Acesso restrito ao administrador geral da Vanessa Simoni.");
}

export const getAdminCouponUsageDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    couponId: z.string().uuid(),
    page: z.number().int().min(1).max(10000).optional(),
    pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]).optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertSuperAdmin(sb, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const requestedPage = data.page ?? 1;
    const pageSize = data.pageSize ?? 20;

    const fetchUsagePage = (page: number) => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      return admin
        .from("coupon_usages")
        .select("coupon_id,workspace_id,payment_id,used_at", { count: "exact" })
        .eq("coupon_id", data.couponId)
        .order("used_at", { ascending: false })
        .range(from, to);
    };

    let usageQuery = await fetchUsagePage(requestedPage);
    if (usageQuery.error) throw new Error("Não foi possível carregar os usos do cupom.");

    const total = usageQuery.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    if (page !== requestedPage) {
      usageQuery = await fetchUsagePage(page);
      if (usageQuery.error) throw new Error("Não foi possível carregar os usos do cupom.");
    }

    const usages = (usageQuery.data ?? []) as Array<{
      coupon_id: string;
      workspace_id: string | null;
      payment_id: string | null;
      used_at: string | null;
    }>;
    const workspaceIds = [...new Set(usages.map((row) => row.workspace_id).filter(Boolean))] as string[];

    const [workspacesQ, membersQ] = workspaceIds.length
      ? await Promise.all([
          admin.from("workspaces").select("id,name,slug,owner_id").in("id", workspaceIds),
          admin.from("workspace_members").select("workspace_id,user_id,role").in("workspace_id", workspaceIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (workspacesQ.error || membersQ.error) throw new Error("Não foi possível relacionar os workspaces aos usos do cupom.");

    const workspaces = (workspacesQ.data ?? []) as Array<{
      id: string;
      name?: string | null;
      slug?: string | null;
      owner_id?: string | null;
    }>;
    const members = (membersQ.data ?? []) as Array<{ workspace_id: string; user_id: string; role?: string | null }>;
    const ownerByWorkspace = new Map<string, string>();
    for (const workspace of workspaces) {
      if (workspace.owner_id) ownerByWorkspace.set(workspace.id, workspace.owner_id);
    }
    for (const member of members) {
      if (member.role === "owner") ownerByWorkspace.set(member.workspace_id, member.user_id);
    }

    const userIds = [...new Set(ownerByWorkspace.values())];
    const { data: profiles, error: profilesError } = userIds.length
      ? await admin.from("profiles").select("id,full_name,display_name,whatsapp_primary").in("id", userIds)
      : { data: [], error: null };
    if (profilesError) throw new Error("Não foi possível relacionar os responsáveis aos usos do cupom.");

    const authByUser = new Map<string, { email: string | null }>();
    for (let start = 0; start < userIds.length; start += 10) {
      const chunk = userIds.slice(start, start + 10);
      const settled = await Promise.allSettled(chunk.map((userId) => admin.auth.admin.getUserById(userId)));
      settled.forEach((result, index) => {
        if (result.status !== "fulfilled" || result.value?.error) return;
        const user = result.value?.data?.user;
        if (user) authByUser.set(chunk[index], { email: user.email ?? null });
      });
    }

    const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
    const profileById = new Map(((profiles ?? []) as Array<any>).map((profile) => [profile.id, profile]));

    const rows = usages.map((usage) => {
      const workspaceId = usage.workspace_id ?? "";
      const workspace = workspaceById.get(workspaceId);
      const userId = ownerByWorkspace.get(workspaceId) ?? null;
      const profile = userId ? profileById.get(userId) : null;
      const auth = userId ? authByUser.get(userId) : null;
      return {
        workspaceId: usage.workspace_id,
        workspaceName: workspace?.name ?? workspace?.slug ?? "Workspace sem nome",
        customerName: profile?.full_name ?? profile?.display_name ?? "Cliente",
        email: auth?.email ?? null,
        phone: profile?.whatsapp_primary ?? null,
        paymentId: usage.payment_id,
        usedAt: usage.used_at,
      };
    });

    return {
      rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  });
