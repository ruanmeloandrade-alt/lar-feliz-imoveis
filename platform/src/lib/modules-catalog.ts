// Catálogo de módulos vendáveis na MKTOn.
// Quando o cliente compra um módulo, ele aparece na seção "MÓDULOS" do menu lateral.
// Por ora trabalhamos com mock - back virá das edge functions de billing/entitlements.

import type { LucideIcon } from "lucide-react";
import {
 Network,
 BarChart3,
 Share2,
 Megaphone,
 KanbanSquare,
} from "lucide-react";

export type ModuleStatus = "ativo" | "configurar" | "preparo";

export interface ModuleEntry {
 id: string;
 name: string;
 tag: string; // ex.: COMERCIAL, TRACKING…
 description: string;
 icon: LucideIcon;
 status: ModuleStatus;
 /** Se o cliente já comprou este módulo (aparece no menu lateral) */
 acquired: boolean;
 /** Rota interna do módulo, se já houver tela */
 to?: string;
 /** Bullets descritivos */
 features: string[];
 /** Nota operacional (linha em destaque) */
 note?: string;
}

export const MODULES_CATALOG: ModuleEntry[] = [
 {
 id: "crm",
 name: "CRM",
 tag: "COMERCIAL",
 description:
 "Gestão de CRM com funis, leads, tarefas, contatos e rotina comercial.",
 icon: Network,
 status: "ativo",
 acquired: true,
 to: "/crm/funis-de-venda",
 features: ["CRM genérico", "Funis e etapas", "Leads e tarefas", "Agente CRM futuro"],
    note: "Centraliza funis, leads, tarefas e rotina comercial do CRM MKTOn.",
  },
 {
 id: "tracking",
 name: "Tracking & Analytics",
 tag: "TRACKING",
 description:
 "Eventos, UTMs, plataformas de mídia e KPIs para leitura no dashboard.",
 icon: BarChart3,
 status: "ativo",
 acquired: true,

 to: "/modulos/tracking",
 features: ["Eventos do site", "UTMs", "Plataformas de mídia", "KPIs para o dashboard"],
 note: "Mede eventos, UTMs e plataformas para alimentar KPIs da operação.",
 },
 {
 id: "gestor-trafego",
  name: "Gestor de Tráfego IA",
 tag: "MÍDIA",
 description: "Acompanhamento de Meta Ads e Google Ads em um só lugar.",
 icon: Megaphone,
 status: "ativo",
 acquired: true,
 to: "/modulos/gestor-trafego",
 features: ["Meta Ads", "Google Ads", "Otimizações", "Relatórios"],
 note: "Módulo liberado, conecte suas contas em Integrações para começar.",
 },
 {
 id: "social-media",
 name: "Social Media",
 tag: "CONTEÚDO",
 description: "Calendário editorial, ideias, legendas e aprovação.",
 icon: Share2,
 status: "ativo",
 acquired: true,

 to: "/modulos/social-media",
 features: ["Calendário editorial", "Ideias", "Legendas", "Aprovação"],
 note: "Área em preparo para calendário, briefings e aprovação.",
 },
  {
    id: "fluxo-trabalho",
    name: "Fluxo de Trabalho",
    tag: "OPERAÇÃO",
    description:
      "Kanban de tarefas da equipe, prazos, setores e gamificação do time.",
    icon: KanbanSquare,
    status: "ativo",
    acquired: true,
    to: "/fluxo-trabalho",
    features: ["Kanban por etapas", "Prazos e alertas", "Setores e responsáveis", "Funcionário do mês"],
    note: "Organize as tarefas do time com etapas, gatilhos e ranking mensal.",
  },
];


export const STATUS_LABEL: Record<ModuleStatus, string> = {
 ativo: "Ativo",
 configurar: "Precisa configurar",
 preparo: "Em breve",
};
