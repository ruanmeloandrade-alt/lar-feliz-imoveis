import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = {
  from: (t: string) => {
    select: (s: string) => {
      eq: (col: string, v: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
};

export const getActiveWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { data: prof } = await sb
      .from("profiles")
      .select("current_workspace_id")
      .eq("id", context.userId)
      .maybeSingle();
    const wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id;
    if (!wsId) return null;
    const { data: ws } = await sb
      .from("workspaces")
      .select("id, slug, name, logo_path")
      .eq("id", wsId)
      .maybeSingle();
    if (!ws) return null;
    const row = ws as { id: string; slug: string; name: string; logo_path?: string | null };
    let logoUrl: string | null = null;
    if (row.logo_path) {
      const { data: signed } = await (sb as any).storage
        .from("company-logos")
        .createSignedUrl(row.logo_path, 60 * 60 * 24 * 7);
      logoUrl = (signed as { signedUrl?: string } | null)?.signedUrl ?? null;
    }
    return { id: row.id, slug: row.slug, name: row.name, logo_url: logoUrl };
  });
