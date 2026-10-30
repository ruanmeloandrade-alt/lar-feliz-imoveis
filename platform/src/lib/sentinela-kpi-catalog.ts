import type { LucideIcon } from "lucide-react";
import {
  Trophy, TrendingDown, Percent, DollarSign, Wallet, Hourglass, Timer, Clock,
  Calendar, Users, UserX, Tag, Tags, ListTodo, Layers, AlertOctagon, AlertTriangle,
} from "lucide-react";

export type KpiFormat = "number" | "percent" | "currency" | "days" | "list";
export type KpiListItem = { label: string; value: number | string };
export type KpiValue = number | string | KpiListItem[] | null;

export type KpiDef = {
  id: string;
  label: string;
  description: string;
  category: "Resultado" | "Tempo" | "Volume" | "Engajamento" | "Equipe";
  format: KpiFormat;
  icon: LucideIcon;
  accessor: (s: Record<string, unknown>) => KpiValue;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const list = (v: unknown): KpiListItem[] => (Array.isArray(v) ? (v as KpiListItem[]) : []);

export const GESTOR_KPIS: KpiDef[] = [
  { id: "leads_ganhos", label: "Leads ganhos (30d)", description: "Leads fechados como ganho nos últimos 30 dias.", category: "Resultado", format: "number", icon: Trophy, accessor: (s) => num(s.leads_ganhos) },
  { id: "leads_perdidos", label: "Leads perdidos (30d)", description: "Leads fechados como perda nos últimos 30 dias.", category: "Resultado", format: "number", icon: TrendingDown, accessor: (s) => num(s.leads_perdidos) },
  { id: "taxa_conversao", label: "Taxa de conversão", description: "Ganhos sobre (ganhos + perdidos) nos últimos 30 dias.", category: "Resultado", format: "percent", icon: Percent, accessor: (s) => num(s.taxa_conversao) },
  { id: "valor_ganho", label: "Receita ganha (30d)", description: "Soma do valor dos leads ganhos nos últimos 30 dias.", category: "Resultado", format: "currency", icon: DollarSign, accessor: (s) => num(s.valor_ganho) },
  { id: "valor_perdido", label: "Receita perdida (30d)", description: "Soma do valor dos leads perdidos nos últimos 30 dias.", category: "Resultado", format: "currency", icon: DollarSign, accessor: (s) => num(s.valor_perdido) },
  { id: "ticket_medio", label: "Ticket médio", description: "Valor médio dos leads ganhos.", category: "Resultado", format: "currency", icon: Wallet, accessor: (s) => num(s.ticket_medio_ganho) },
  { id: "motivos_perda", label: "Motivos de perda (top 5)", description: "Razões mais frequentes nos leads perdidos.", category: "Resultado", format: "list", icon: AlertTriangle, accessor: (s) => list(s.motivos_perda_top) },

  { id: "ciclo_dias", label: "Ciclo de venda médio", description: "Tempo médio entre criação e fechamento (ganhos).", category: "Tempo", format: "days", icon: Hourglass, accessor: (s) => num(s.tempo_medio_ciclo_dias) },
  { id: "idade_media", label: "Idade média do lead aberto", description: "Tempo médio que os leads ativos estão no funil.", category: "Tempo", format: "days", icon: Timer, accessor: (s) => num(s.idade_media_lead_aberto) },
  { id: "tempo_parado_geral", label: "Tempo médio parado", description: "Média de dias sem interação nos leads ativos.", category: "Tempo", format: "days", icon: Clock, accessor: (s) => num(s.tempo_medio_parado_geral) },
  { id: "etapas_mais_lentas", label: "Etapas mais lentas", description: "Etapas onde o lead fica parado mais tempo (média de dias).", category: "Tempo", format: "list", icon: Hourglass, accessor: (s) => list(s.tempo_medio_parado_por_etapa).map((x) => ({ label: x.label, value: `${x.value} d` })) },
  { id: "lead_mais_parado", label: "Lead mais parado", description: "O lead aberto com mais dias sem movimentação.", category: "Tempo", format: "list", icon: AlertOctagon, accessor: (s) => {
    const l = s.lead_mais_parado as { name?: string; days?: number; stage?: string } | null;
    return l && l.name ? [{ label: `${l.name} · ${l.stage ?? "-"}`, value: `${l.days ?? 0} d` }] : [];
  } },

  { id: "novos_7d", label: "Novos leads (7d)", description: "Leads criados nos últimos 7 dias.", category: "Volume", format: "number", icon: Calendar, accessor: (s) => num(s.novos_leads_7d) },
  { id: "novos_30d", label: "Novos leads (30d)", description: "Leads criados nos últimos 30 dias.", category: "Volume", format: "number", icon: Calendar, accessor: (s) => num(s.novos_leads_30d) },
  { id: "leads_por_etapa", label: "Leads por etapa (top 5)", description: "Etapas com mais leads ativos.", category: "Volume", format: "list", icon: Layers, accessor: (s) => list(s.leads_por_etapa) },

  { id: "leads_por_responsavel", label: "Leads por responsável", description: "Top vendedores por volume de leads ativos.", category: "Equipe", format: "list", icon: Users, accessor: (s) => list(s.leads_por_responsavel) },
  { id: "sem_responsavel", label: "Leads sem responsável", description: "Leads ativos sem vendedor atribuído.", category: "Equipe", format: "number", icon: UserX, accessor: (s) => num(s.responsavel_sem_atribuicao) },

  { id: "tags_top", label: "Tags mais usadas", description: "Top 8 tags nos leads ativos.", category: "Engajamento", format: "list", icon: Tag, accessor: (s) => list(s.tags_mais_usadas) },
  { id: "sem_tag", label: "Leads sem tag", description: "Leads ativos sem nenhuma tag.", category: "Engajamento", format: "number", icon: Tags, accessor: (s) => num(s.leads_sem_tag) },
  { id: "sem_tarefa_futura", label: "Sem tarefa futura", description: "Leads ativos sem tarefa programada no futuro.", category: "Engajamento", format: "number", icon: ListTodo, accessor: (s) => num(s.leads_sem_tarefa_futura) },
];

export const DEFAULT_KPI_IDS = ["leads_ganhos", "taxa_conversao", "ticket_medio", "ciclo_dias"];

export function formatKpiValue(v: KpiValue, format: KpiFormat): string {
  if (v == null) return "-";
  if (Array.isArray(v)) return v.length === 0 ? "-" : "";
  if (format === "percent") return `${v}%`;
  if (format === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v) || 0);
  if (format === "days") return `${v} d`;
  return String(v);
}
