import { useQuery } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { DashboardV4ConfigurableBoard } from "@/components/dashboard/DashboardV4ConfigurableBoard";
import { supabase } from "@/integrations/supabase/client";

type Props = Omit<ComponentProps<typeof DashboardV4ConfigurableBoard>, "workspaceId">;

/**
 * Active Dashboard V4 composition.
 *
 * Keeps the historical export used by /painel while restoring the configurable
 * widget layer. Workspace identity is resolved here so preferences stay scoped
 * correctly without making the route duplicate workspace plumbing.
 */
export function DashboardV4ConnectedBoard(props: Props) {
  const workspaceQuery = useQuery({
    queryKey: ["saude-slim", "active-workspace", "dashboard-v4-widget-settings"],
    queryFn: async () => {
      const { data: auth, error } = await supabase.auth.getUser();
      if (error || !auth.user) return null;
      const { data: profile, error: profileError } = await supabase
        .from("profiles").select("current_workspace_id").eq("id", auth.user.id).maybeSingle();
      if (profileError || !profile?.current_workspace_id) return null;
      const { data: member, error: membershipError } = await supabase
        .from("workspace_members").select("id")
        .eq("user_id", auth.user.id)
        .eq("workspace_id", profile.current_workspace_id)
        .maybeSingle();
      if (membershipError || !member) return null;
      return { id: profile.current_workspace_id };
    },
    staleTime: 5 * 60_000,
  });

  return <DashboardV4ConfigurableBoard {...props} workspaceId={workspaceQuery.data?.id} />;
}
