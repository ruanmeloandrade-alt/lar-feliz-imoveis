import {VanessaIcons,type VanessaIconProps} from "./VanessaIcons";
import type {ComponentType} from "react";
import {
  BarChart3, Bot, ChevronDown, ClipboardList, History, Inbox,
  LogOut, Mail, Megaphone, Menu, MessageSquareText, Package, PanelLeftClose,
  PanelLeftOpen, Plug, RotateCcw, Settings, Share2, ShoppingCart, Tags,
  Target, Truck, Users, X, PlayCircle, type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useSessionHeartbeat } from "@/hooks/use-session-heartbeat";
import { readSidebarPreference, writeSidebarPreference, parseSidebarStorageEvent } from "@/lib/slim-sidebar-state";
import "@/styles/slim-shell.css";

interface NavItem { label: string; icon: ComponentType<VanessaIconProps>; to?: string; href?: string; disabled?: boolean; activeWhen?: (path: string) => boolean; }
interface NavGroup { label: string; icon: ComponentType<VanessaIconProps>; to?: string; defaultOpen?: boolean; children: NavItem[]; }
const OPERATION_GROUPS: NavGroup[] = [
  { label: "Home", icon: VanessaIcons.home, defaultOpen: true, children: [
    { label: "Histórico de Vendas", icon: VanessaIcons.history, to: "/saude-slim", activeWhen: p => p === "/saude-slim" },
    { label: "Dashboard detalhada", icon: VanessaIcons.dashboard, to: "/painel" },
  ] },
  { label: "CRM", icon: VanessaIcons.crm, defaultOpen: false, children: [
    { label: "Funil de vendas", icon: VanessaIcons.funnel, to: "/crm/funis-de-venda" },
    { label: "Clientes", icon: VanessaIcons.clients, to: "/crm/leads" },
    { label: "Inbox", icon: VanessaIcons.inbox, to: "/inbox/leads", activeWhen: p => p === "/inbox" || p.startsWith("/inbox/") },
    { label: "Automações", icon: VanessaIcons.automation, to: "/crm/automacoes" },
    { label: "Cérebro IA", icon: VanessaIcons.brain, to: "/crm/agente-ia" },
    { label: "Públicos", icon: VanessaIcons.audience, to: "/crm/publicos" },
  ] },
  { label: "Gestão imobiliária", icon: VanessaIcons.estate, to: "/pedidos", defaultOpen: true, children: [
    { label: "Negociações", icon: VanessaIcons.orders, to: "/pedidos" },
    { label: "Parceiros", icon: VanessaIcons.suppliers, to: "/crm/empresas" },
    { label: "Produtos", icon: VanessaIcons.products, to: "/crm/produtos" },
  ] },
  { label: "Configurações", icon: VanessaIcons.settings, defaultOpen: false, children: [
    { label: "Geral", icon: VanessaIcons.general, to: "/configuracoes" },
    { label: "Integrações", icon: VanessaIcons.integrations, to: "/integracoes" },
    { label: "Tutoriais", icon: VanessaIcons.tutorial, to: "/tutoriais" },
  ] },
  { label: "Tracking", icon: VanessaIcons.tracking, defaultOpen: false, children: [
    { label: "Fontes e eventos", icon: VanessaIcons.origins, to: "/modulos/tracking" },
  ] },
];
function matches(item: NavItem, path: string): boolean {
  if (item.disabled) return false;
  if (item.activeWhen) return item.activeWhen(path);
  return Boolean(item.to) && (path === item.to || path.startsWith(`${item.to}/`));
}
async function handleLogout() {
  try { const { supabase } = await import("@/integrations/supabase/client"); await supabase.auth.signOut(); }
  catch { /* Preserve existing signout behavior. */ }
  finally {
    try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* no-op */ }
    window.location.assign("/admin");
  }
}
export function AppSidebar() {
  useSessionHeartbeat();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const currentPath = useRouterState({ select: state => state.location.pathname });
  const navId = useId();
  const asideRef = useRef<HTMLElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousShell = document.body.dataset.appShell;
    document.body.dataset.appShell = "1";
    try { setCollapsed(readSidebarPreference(window.localStorage)); } catch { /* no-op */ }
    const sync = (event: StorageEvent) => { const next = parseSidebarStorageEvent(event.key, event.newValue); if (next !== null) setCollapsed(next); };
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
      if (previousShell === undefined) delete document.body.dataset.appShell; else document.body.dataset.appShell = previousShell;
    };
  }, []);
  useEffect(() => { setMobileOpen(false); }, [currentPath]);
  useEffect(() => {
    if (!mobileOpen) return;
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (media.matches) setMobileOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(asideRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); }
      if (event.key !== "Tab") return;
      const items = focusable(); const first = items[0]; const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !asideRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !asideRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => {
      window.cancelAnimationFrame(frame); media.removeEventListener("change", closeOnDesktop); document.removeEventListener("keydown", key);
      document.body.style.overflow = previousOverflow; mobileTrigger.current?.focus();
    };
  }, [mobileOpen]);
  function toggleCollapsed() { const next = !collapsed; setCollapsed(next); try { writeSidebarPreference(window.localStorage, next); } catch { /* no-op */ } }
  return <>
    <button ref={mobileTrigger} type="button" onClick={() => setMobileOpen(true)} className="slim-mobile-menu-trigger" aria-label="Abrir menu" aria-controls={navId} aria-expanded={mobileOpen}><Menu size={18} aria-hidden="true" /></button>
    {mobileOpen && <button type="button" className="slim-mobile-menu-scrim" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" tabIndex={-1} />}
    <aside ref={asideRef} id={navId} data-slim-sidebar data-collapsed={collapsed} data-mobile-open={mobileOpen} aria-label="Navegação principal Vanessa Simoni" role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined}>
      <div className="slim-sidebar-brand">
        <span className="slim-sidebar-logo"><img src="/brand/vanessa.jpg" alt="" width="64" height="64" /></span>
        <div className="slim-sidebar-label"><strong>Vanessa Simoni</strong><small>Sistema interno</small></div>
        <button type="button" className="slim-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="slim-sidebar-operation"><div className="slim-sidebar-operation-card">
        <div className="slim-sidebar-operation-heading">
          <strong className="slim-sidebar-label">Operação Vanessa Simoni</strong>
          <button type="button" className="slim-sidebar-collapse" onClick={toggleCollapsed} aria-label={collapsed ? "Expandir menu lateral" : "Minimizar menu lateral"} title={collapsed ? "Expandir menu lateral" : "Minimizar menu lateral"} aria-expanded={!collapsed} aria-controls={`${navId}-sections`}>
            {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        </div><p className="slim-sidebar-label">Imóveis, negociações e relacionamento.</p>
      </div></div>
      <nav id={`${navId}-sections`} className="slim-sidebar-nav" aria-label="Módulos">
        <span className="slim-sidebar-section-label slim-sidebar-label">Módulos</span>
        {OPERATION_GROUPS.map((group,index) => {
          const active = group.children.some(item => matches(item,currentPath));
          const open = openGroups[group.label] ?? (active || group.defaultOpen === true);
          const GroupIcon = group.icon; const groupId = `${navId}-group-${index}`;
          return <div key={group.label} className="slim-sidebar-group">
            <div className="slim-sidebar-group-heading">
              {group.to ? <Link to={group.to as never} onClick={() => setMobileOpen(false)} className={cn("slim-sidebar-group-link",active && "slim-sidebar-active")}><GroupIcon size={17} aria-hidden="true" /><span>{group.label}</span></Link>
                : <button type="button" onClick={() => setOpenGroups(s=>({...s,[group.label]:!open}))} aria-expanded={open} aria-controls={groupId} className={cn("slim-sidebar-group-link",active && "slim-sidebar-active")}><GroupIcon size={17} aria-hidden="true" /><span>{group.label}</span></button>}
              <button type="button" className="slim-sidebar-chevron" onClick={() => setOpenGroups(s=>({...s,[group.label]:!open}))} aria-label={`${open ? "Recolher" : "Expandir"} ${group.label}`} aria-expanded={open} aria-controls={groupId}><ChevronDown size={16} style={{transform:open ? "rotate(180deg)" : undefined}} aria-hidden="true" /></button>
            </div>
            <div id={groupId} className="slim-sidebar-items" data-expanded={open}>
              {group.children.map(item=>{
                const ItemIcon=item.icon; const itemActive=matches(item,currentPath);
                const child=<><ItemIcon size={16} aria-hidden="true" /><span className="slim-sidebar-link-label">{item.label}</span></>;
                const className=cn("slim-sidebar-link",itemActive && "slim-sidebar-active");
                if(item.disabled||(!item.to&&!item.href))return <button key={item.label} type="button" disabled className={className} title={`${item.label}: disponível na Fase 2`}>{child}</button>;
                if(item.href)return <a key={item.label} href={item.href} title={item.label} className={className} onClick={()=>setMobileOpen(false)} aria-current={itemActive?"page":undefined}>{child}</a>;
                return <Link key={item.label} to={item.to as never} title={item.label} className={className} onClick={()=>setMobileOpen(false)} aria-current={itemActive?"page":undefined}>{child}</Link>;
              })}
            </div>
          </div>;
        })}
      </nav>
      <div className="slim-sidebar-footer"><button type="button" onClick={handleLogout} className="slim-sidebar-link" title="Sair"><LogOut size={17} aria-hidden="true" /><span className="slim-sidebar-link-label">Sair</span></button></div>
    </aside>
    <div data-slim-sidebar-spacer data-collapsed={collapsed} aria-hidden="true" />
  </>;
}
