import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWorkspaceChannels, type WorkspaceChannels } from "@/lib/channels.functions";

export function useWorkspaceChannels() {
  const fn = useServerFn(listWorkspaceChannels);
  return useQuery<WorkspaceChannels>({
    queryKey: ["workspace-channels"],
    queryFn: async () => fn(),
    staleTime: 60_000,
  });
}
