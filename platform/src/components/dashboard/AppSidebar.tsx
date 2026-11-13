import { useEffect, useId, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useSessionHeartbeat } from "@/hooks/use-session-heartbeat";
import { VanessaIcons } from "./VanessaIcons";
import "@/styles/slim-shell.css";

const modules = [
  { label: "Home", icon: VanessaIcons.home, items: [
    { label: "Dashboard detalhada", to: "/painel" },
  ] },
  { label: "CRM", icon: VanessaIcons.crm, items: [
    { label: "Funil de vendas", to: "/crm/funis-de-venda" },
    { label: "Clientes", to: "/crm/leads" },
    { label: "Conversas", to: "/inbox/leads" },
    { label: "Automações", to: "/crm/automacoes" },
    { label: "Cérebro da IA", to: "/crm/agente-ia" },
    { label: "Públicos", to: "/crm/publicos" },
  ] },
  { label: "Gestão imobiliária", icon: VanessaIcons.estate, items: [
    { label: "Negociações", to: "/pedidos" },
    { label: "Parceiros", to: "/crm/empresas" },
    { label: "Imóveis", to: "/crm/produtos" },
  ] },
  { label: "Configurações", icon: VanessaIcons.settings, items: [
    { label: "Geral", to: "/configuracoes" },
    { label: "Integrações", to: "/integracoes" },
    { label: "Tutoriais", to: "/tutoriais" },
  ] },
  { label: "Origem dos leads", icon: VanessaIcons.tracking, items: [
    { label: "Fontes e eventos", to: "/modulos/tracking" },
  ] },
] as const;

type ModuleLabel = (typeof modules)[number]["label"];

function matches(path: string, destination: string) {
  if (destination === "/inbox/leads") return path === "/inbox" || path.startsWith("/inbox/");
  return path === destination || path.startsWith(`${destination}/`);
}

async function handleLogout() {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut();
  } catch { /* Continue to the login even when the session has already expired. */ }
  finally {
    try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* Storage may be unavailable. */ }
    window.location.assign("/admin");
  }
}

export function AppSidebar() {
  useSessionHeartbeat();
  const currentPath = useRouterState({ select: state => state.location.pathname });
  const [expanded, setExpanded] = useState<ModuleLabel | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const activeTrigger = useRef<HTMLButtonElement | null>(null);
  const navId = useId();

  useEffect(() => {
    const previous = document.body.dataset.appShell;
    document.body.dataset.appShell = "1";
    return () => {
      if (previous === undefined) delete document.body.dataset.appShell;
      else document.body.dataset.appShell = previous;
    };
  }, []);

  useEffect(() => { setExpanded(null); }, [currentPath]);

  useEffect(() => {
    if (!expanded) return;
    function onPointerDown(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) setExpanded(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !navRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      setExpanded(null);
      activeTrigger.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  return (
    <nav ref={navRef} data-vanessa-navigation aria-label="Navegação principal Vanessa Simoni">
      <div className="vanessa-navigation-modules">
        {modules.map(({ label, icon: Icon, items }, index) => {
          const open = expanded === label;
          const panelId = `${navId}-${index}`;
          const active = items.some(item => matches(currentPath, item.to));
          return (
            <div key={label}>
              <button
                type="button"
                id={`${panelId}-trigger`}
                className="vanessa-module-trigger"
                aria-expanded={open}
                aria-controls={panelId}
                data-active={active}
                onClick={event => {
                  activeTrigger.current = event.currentTarget;
                  setExpanded(current => current === label ? null : label);
                }}
              >
                <Icon size={21} aria-hidden="true" />
                <span>{label}</span>
              </button>
              <div id={panelId} aria-labelledby={`${panelId}-trigger`} className="vanessa-module-panel" hidden={!open}>
                {items.map(item => (
                  <Link key={item.to} to={item.to} className="vanessa-module-link" aria-current={matches(currentPath, item.to) ? "page" : undefined} onClick={() => setExpanded(null)}>
                    {item.label}
                  </Link>
                ))}
                {label === "Configurações" && (
                  <button type="button" onClick={handleLogout} className="vanessa-module-link vanessa-module-logout"><LogOut size={16} aria-hidden="true" /> Sair</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
