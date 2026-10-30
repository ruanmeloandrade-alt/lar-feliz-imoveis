import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./sidebar-scroll.css";
import "./sales-responsive.css";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPreload: "intent",
    defaultPreloadDelay: 20,
    // Mostra o estado de carregamento quase imediatamente para o clique
    // nunca parecer "travado".
    defaultPendingMs: 120,
    defaultPendingMinMs: 0,
  });

  return router;
};
