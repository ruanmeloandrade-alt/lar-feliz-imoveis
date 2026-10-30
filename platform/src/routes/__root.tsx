import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { THEME_BOOTSTRAP_SCRIPT, ThemeProvider } from "../lib/theme";
import { CustomKpisProvider } from "../lib/custom-kpis";
import { ComparisonWidgetsProvider } from "../lib/comparison-widgets";
import { KpiRulesProvider } from "../lib/kpi-rules";
import { IdleLogoutGuard } from "../components/IdleLogoutGuard";
import { DeviceApprovalGate } from "../components/DeviceApprovalGate";
import { SupportRobot } from "../components/SupportRobot";
import { WorkflowSalesbotBillingEnhancer } from "../components/system/WorkflowSalesbotBillingEnhancer";
import { syncWorkspaceRegionalCache } from "../lib/workspace-currency-cache";

import { SlimSessionGate } from "../components/auth/SlimSessionGate";
import { isSlimRecoveryLocation } from "../lib/slim-auth-gate.core";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">A página que você procura não existe ou foi movida.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Ir para o início</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Não foi possível carregar esta página</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ocorreu um erro ao carregar este conteúdo. Tente novamente ou volte para o início.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Tentar novamente</button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">Ir para o início</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vanessa Simoni | Sistema interno" },
      { name: "description", content: "Sistema interno da Vanessa Simoni para vendas, pedidos, estoque, atendimento e automações." },
      { name: "author", content: "Vanessa Simoni" },
      { name: "theme-color", content: "#050814" },
      { property: "og:title", content: "Vanessa Simoni | Sistema interno" },
      { property: "og:description", content: "Sistema interno da Vanessa Simoni para vendas, pedidos, estoque, atendimento e automações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Vanessa Simoni | Sistema interno" },
      { name: "twitter:description", content: "Sistema interno da Vanessa Simoni para vendas, pedidos, estoque, atendimento e automações." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/brand/vanessa.css?v=20261030" },
      { rel: "icon", type: "image/jpeg", href: "/brand/vanessa.jpg?v=20261030" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" translate="no" className="notranslate">
      <head>
        <meta name="google" content="notranslate" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <HeadContent />
      </head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

const PUBLIC_ROUTES = new Set(["/", "/admin", "/privacidade", "/termos", "/data-deletion", "/documentacao", "/afiliados", "/sobre"]);

function isPublicPath(path: string) {
  return PUBLIC_ROUTES.has(path) || path === "/blog" || path.startsWith("/blog/") || path.startsWith("/l/") || path.startsWith('/convite/');
}

const COPILOT_EXCLUDED_PATHS = new Set(["/contas", "/auth", "/checkout", "/checkout-retorno", "/completa", "/recuperar-acesso", "/sem-acesso"]);
const COPILOT_EXCLUDED_PREFIXES = ["/partners", "/afiliado/", "/auth/", "/convite/", "/f/", "/r/"];

export function isCopilotAllowedPath(path: string) {
  if (isPublicPath(path) || COPILOT_EXCLUDED_PATHS.has(path)) return false;
  return !COPILOT_EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function ConditionalSupportRobot() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (!isCopilotAllowedPath(path)) return null;
  return <SupportRobot />;
}

function HomepageResourceLinks() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (path !== "/") return null;
  return (
    <div className="border-t border-slate-200 bg-white px-4 py-4 text-[11px] text-slate-500 sm:px-5 md:px-8">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-semibold text-slate-700">Recursos</span>
        <Link to="/documentacao" className="font-medium hover:text-slate-900">Documentação</Link>
        <Link to="/afiliados" className="font-medium hover:text-slate-900">Afiliados</Link>
      </div>
    </div>
  );
}

function CheckoutCompatibilityGuard({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const redirectTarget = useMemo(() => {
    if (typeof window === "undefined" || path !== "/checkout") return null;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id")?.trim();
    if (sessionId) {
      const target = new URL("/checkout-retorno", window.location.origin);
      target.searchParams.set("session_id", sessionId);
      return `${target.pathname}${target.search}`;
    }
    if (params.get("plan") === "teste") return "/configuracoes";
    return null;
  }, [path]);

  useEffect(() => {
    if (redirectTarget) window.location.replace(redirectTarget);
  }, [redirectTarget]);

  if (redirectTarget) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}

const SAUDE_SLIM_MIGRATED_PATHS = new Set([
  "/auth", "/saude-slim", "/pedidos", "/crm/estoque", "/crm/produtos", "/crm/leads", "/tutoriais",
]);
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const migratedRoute = SAUDE_SLIM_MIGRATED_PATHS.has(path);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><CustomKpisProvider><ComparisonWidgetsProvider><KpiRulesProvider>
        <IdleLogoutGuard />
        <CheckoutCompatibilityGuard><AuthGate><ConditionalSupportRobot /><Outlet /><HomepageResourceLinks /></AuthGate></CheckoutCompatibilityGuard>
      </KpiRulesProvider></ComparisonWidgetsProvider></CustomKpisProvider></ThemeProvider>
    </QueryClientProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const href = useRouterState({ select: (state) => state.location.href });
  const isPublicRoute = isPublicPath(path) || path === '/auth' || path.startsWith('/auth/');
  const invitationRoute = path.startsWith('/convite/');
  const [recoveryEvent, setRecoveryEvent] = useState(false);
  const loginPending = useRef(false);
  const recoveryRoute = path === '/auth' && (recoveryEvent || isSlimRecoveryLocation(path, href.includes('?') ? href.slice(href.indexOf('?')).split('#')[0] : '', typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    let active = true; let unsubscribe: (() => void) | undefined;
    void import("@/integrations/supabase/client").then(({ supabase }) => {
      if (!active) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (!active) return;
        if (event === 'PASSWORD_RECOVERY') {
          setRecoveryEvent(true);
          // Persist intent across the challenge remount after GoTrue consumes the hash.
          void router.navigate({ to: '/auth', search: previous => ({ ...previous, mode: 'recovery' }), replace: true });
        }
        if (event === 'SIGNED_IN') loginPending.current = true;
        if (event === 'SIGNED_OUT') loginPending.current = false;
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => { active = false; unsubscribe?.(); };
  }, [router]);
  useEffect(() => { if (path !== '/auth' || new URLSearchParams(href.split('?')[1]?.split('#')[0] ?? '').get('mode') === 'login') setRecoveryEvent(false); }, [path, href]);
  const ready = useCallback(() => {
    void router.invalidate();
    void syncWorkspaceRegionalCache().catch(() => {});
    if (loginPending.current) {
      loginPending.current = false;
      void (async () => {
        try {
          const [{ recordSecurityEvent }, { getDeviceKey }] = await Promise.all([import("@/lib/security-settings.functions"), import("@/hooks/use-session-heartbeat")]);
          await recordSecurityEvent({ data: { type: "login", device_key: getDeviceKey() } });
        } catch { /* Audit availability never substitutes session authorization. */ }
      })();
    }
  }, [router]);
  // Public login stays usable during an unavailable token refresh; recovery has its own gate.
  if (isPublicRoute && !recoveryRoute && !invitationRoute) return <>{children}</>;
  return <SlimSessionGate allowSignedOut={recoveryRoute || invitationRoute} onReady={recoveryRoute ? undefined : ready}>
    {!isPublicRoute && !SAUDE_SLIM_MIGRATED_PATHS.has(path) && <><DeviceApprovalGate /><WorkflowSalesbotBillingEnhancer /></>}
    {children}
  </SlimSessionGate>;
}

// SLIM_GLOBAL_HISTORY_V1
