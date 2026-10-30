import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSaudeSlimPermissions } from "@/lib/saude-slim-permissions-client";
import {
  can as canCore,
  scopeOf as scopeCore,
  moduleEnabled as moduleEnabledCore,
  allowedPipelines as allowedPipelinesCore,
  allowedStages as allowedStagesCore,
  hasExtra as hasExtraCore,
  isFullAccess,
  listVisibleModuleIds,
  type EffectivePermissions,
} from "@/lib/permissions-core";
import type { CrudAction } from "@/lib/permissions-catalog";

const EMPTY: EffectivePermissions = { role: "member", full: false, permissions: null };

export function usePermissions() {
  const q = useQuery({
    queryKey: ["my-permissions"],
    queryFn: getSaudeSlimPermissions,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const eff = (q.data as any)?.effective as EffectivePermissions | undefined;

  return useMemo(() => {
    const e = eff ?? EMPTY;
    return {
      loading: q.isLoading,
      role: e.role,
      isFull: isFullAccess(e),
      can: (moduleId: string, entityId: string, action: CrudAction) => canCore(e, moduleId, entityId, action),
      scope: (moduleId: string, entityId: string, action: CrudAction) => scopeCore(e, moduleId, entityId, action),
      moduleEnabled: (moduleId: string) => moduleEnabledCore(e, moduleId),
      allowedPipelines: (moduleId: string) => allowedPipelinesCore(e, moduleId),
      allowedStages: (moduleId: string) => allowedStagesCore(e, moduleId),
      hasExtra: (moduleId: string, extraId: string) => hasExtraCore(e, moduleId, extraId),
      visibleModules: listVisibleModuleIds(e),
      refetch: q.refetch,
    };
  }, [eff, q.isLoading, q.refetch]);
}
