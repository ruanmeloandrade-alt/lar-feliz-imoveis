import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listActivatedModules, setActivatedModule } from "@/lib/activated-modules.functions";
import { toast } from "sonner";

export function useActivatedModules() {
  const queryClient = useQueryClient();
  const fetchModules = useServerFn(listActivatedModules);
  const saveModule = useServerFn(setActivatedModule);
  const { data = [] } = useQuery({
    queryKey: ["activated-modules"],
    queryFn: () => fetchModules(),
  });
  const ids = useMemo(() => new Set(data), [data]);
  const mutation = useMutation({
    mutationFn: ({ moduleId, active }: { moduleId: string; active: boolean }) =>
      saveModule({ data: { moduleId, active } }),
    onSuccess: (next) => queryClient.setQueryData(["activated-modules"], next),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível salvar os módulos da conta."),
  });

  const activate = useCallback((id: string) => {
    mutation.mutate({ moduleId: id, active: true });
  }, [mutation]);

  const deactivate = useCallback((id: string) => {
    mutation.mutate({ moduleId: id, active: false });
  }, [mutation]);

  const isActivated = useCallback((id: string) => ids.has(id), [ids]);

  return { ids, activate, deactivate, isActivated };
}
