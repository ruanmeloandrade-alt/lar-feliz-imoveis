import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllPipelineStages } from "@/lib/crm.functions";

export interface FunnelOption {
 id: string;
 name: string;
 stages: { id: string; name: string }[];
}

/** Carrega somente nomes e etapas usados no menu, sem trazer todos os leads. */
export function useAllFunnels(enabled = true) {
  const listFn = useServerFn(listAllPipelineStages);

  const query = useQuery({
    queryKey: ["salesbot-funnels-lite"],
    queryFn: async (): Promise<FunnelOption[]> => {
      const { pipelines } = await listFn();
      return pipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        stages: pipeline.stages,
      }));
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  // Compatibilidade com consumidores antigos e com o AppSidebar:
  // React Query expõe os funis em `data`, enquanto o sidebar usa `funnels`.
  // Mantemos ambos os contratos e garantimos array vazio durante o carregamento.
  return {
    ...query,
    funnels: query.data ?? [],
  };
}
