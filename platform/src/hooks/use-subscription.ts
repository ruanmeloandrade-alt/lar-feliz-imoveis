import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMySubscription } from "@/lib/billing/plans.functions";

export function useMySubscription() {
  const fn = useServerFn(getMySubscription);
  return useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => fn({}),
    staleTime: 60_000,
    retry: false,
  });
}

export function useHasModule(code: string) {
  const q = useMySubscription();
  const modules: string[] = (q.data?.modules as string[]) ?? [];
  return { hasAccess: modules.includes(code), loading: q.isLoading };
}
