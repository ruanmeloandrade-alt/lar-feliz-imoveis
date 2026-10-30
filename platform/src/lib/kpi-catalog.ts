/**
 * Catálogo de KPIs disponíveis por integração.
 * Reflete os KPIs reais que o back-end (edge functions do Codex) vai expor
 * para cada fonte conectada. O cliente só seleciona o que quer ver - não
 * preenche nada manualmente.
 */
import type { KpiCardData, KpiSource } from "./mock-dashboard";

export interface CatalogKpi {
 id: string; // ex: "meta.cpl_7d"
 label: string;
 description: string;
 unit: KpiCardData["unit"];
 sample_value: number; // valor de pré-visualização
 sample_delta: number | null;
 sparkline: number[] | null;
}

export type KpiGroupKind = "integracao" | "operacional";

export interface IntegrationGroup {
 id: string; // KpiSource ou id operacional
 source: KpiSource; // fonte real usada nos cards
 kind: KpiGroupKind;
 label: string; // "Meta Ads" / "Pipeline"
 caption: string; // descrição curta
 connected: boolean; // simulado - vem de /integracoes no real
 kpis: CatalogKpi[];
}

export const KPI_CATALOG: IntegrationGroup[] = [
 {
 id: "crm",
 source: "mkton",
 kind: "integracao",
 label: "CRM Vanessa Simoni",
 caption: "Funis, leads, tarefas e responsáveis do CRM MKTOn.",
 connected: true,
 kpis: [
 { id: "crm.ticket_medio", label: "Ticket Médio", description: "Valor médio por venda ganha", unit: "currency_brl", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "crm.ciclo_medio", label: "Ciclo Médio de Venda", description: "Dias entre criação e ganho", unit: "duration_min", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "crm.leads_sem_resposta", label: "Leads Sem Resposta", description: "Aguardando 1ª interação", unit: "count", sample_value: 14, sample_delta: 0.08, sparkline: [8,9,10,11,12,13,14] },
 { id: "crm.tarefas_atrasadas", label: "Tarefas Atrasadas", description: "Vencidas e não concluídas", unit: "count", sample_value: 22, sample_delta: 0.21, sparkline: [10,12,15,17,19,20,22] },
 { id: "crm.leads_por_responsavel", label: "Leads por Responsável", description: "Distribuição por vendedor", unit: "count", sample_value: 12, sample_delta: 0.0, sparkline: [11,12,12,11,12,12,12] },
 { id: "crm.taxa_resposta_1h", label: "Resposta em até 1h", description: "% de leads atendidos rápido", unit: "percent", sample_value: 0.42, sample_delta: -0.05, sparkline: [0.5,0.48,0.46,0.45,0.44,0.43,0.42] },
 ],
 },
 {
 id: "meta",
 source: "meta",
 kind: "integracao",
 label: "Meta Ads",
 caption: "Campanhas Facebook e Instagram (Business Manager).",
 connected: false,
 kpis: [
 { id: "meta.investimento_7d", label: "Investimento (7d)", description: "Soma do gasto em mídia", unit: "currency_brl", sample_value: 4820, sample_delta: 0.12, sparkline: [600,640,680,700,720,740,740] },
 { id: "meta.cpl_7d", label: "CPL Meta", description: "Custo por lead nas campanhas", unit: "currency_brl", sample_value: 38, sample_delta: -0.08, sparkline: [44,43,42,41,40,39,38] },
 { id: "meta.ctr_7d", label: "CTR Médio", description: "Cliques sobre impressões", unit: "percent", sample_value: 0.024, sample_delta: 0.05, sparkline: [0.02,0.021,0.022,0.022,0.023,0.024,0.024] },
 { id: "meta.leads_7d", label: "Leads Meta (7d)", description: "Volume vindo de Meta", unit: "count", sample_value: 126, sample_delta: 0.18, sparkline: [12,14,16,18,20,22,24] },
 { id: "meta.frequencia", label: "Frequência", description: "Impressões por pessoa", unit: "count", sample_value: 2.4, sample_delta: 0.03, sparkline: [2.1,2.2,2.2,2.3,2.3,2.4,2.4] },
 ],
 },
 {
 id: "google_ads",
 source: "google_ads",
 kind: "integracao",
 label: "Google Ads",
 caption: "Search, Performance Max e YouTube.",
 connected: false,
 kpis: [
 { id: "gads.investimento_7d", label: "Investimento (7d)", description: "Gasto total em Google Ads", unit: "currency_brl", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "gads.cpl_7d", label: "CPL Google", description: "Custo por lead", unit: "currency_brl", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "gads.conv_rate", label: "Taxa de Conversão", description: "Cliques → conversão", unit: "percent", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "gads.impr_share", label: "Impression Share", description: "Participação de impressões", unit: "percent", sample_value: 0, sample_delta: null, sparkline: null },
 ],
 },
 {
 id: "ga4",
 source: "ga4",
 kind: "integracao",
 label: "GA4",
 caption: "Sessões e eventos do Google Analytics.",
 connected: false,
 kpis: [
 { id: "ga4.sessions_7d", label: "Sessões (7d)", description: "Tráfego total no período", unit: "count", sample_value: 8420, sample_delta: 0.06, sparkline: [1100,1150,1180,1200,1220,1240,1260] },
 { id: "ga4.engaged_rate", label: "Taxa de Engajamento", description: "Sessões engajadas / total", unit: "percent", sample_value: 0.61, sample_delta: 0.02, sparkline: [0.58,0.59,0.6,0.6,0.6,0.61,0.61] },
 { id: "ga4.avg_session_min", label: "Tempo Médio de Sessão", description: "Duração média", unit: "duration_min", sample_value: 3, sample_delta: 0.0, sparkline: null },
 { id: "ga4.conv_events", label: "Eventos de Conversão", description: "Conversões marcadas no GA4", unit: "count", sample_value: 142, sample_delta: 0.09, sparkline: [15,17,18,19,21,22,24] },
 ],
 },
 {
 id: "tiktok",
 source: "tiktok",
 kind: "integracao",
 label: "TikTok Ads",
 caption: "Campanhas pagas no TikTok.",
 connected: false,
 kpis: [
 { id: "tt.investimento_7d", label: "Investimento (7d)", description: "Gasto em TikTok Ads", unit: "currency_brl", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "tt.cpl_7d", label: "CPL TikTok", description: "Custo por lead", unit: "currency_brl", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "tt.ctr_7d", label: "CTR TikTok", description: "Cliques / impressões",unit: "percent", sample_value: 0, sample_delta: null, sparkline: null },
 ],
 },
 {
 id: "google_business",
 source: "google_business",
 kind: "integracao",
 label: "Google Meu Negócio",
 caption: "Avaliações e descobertas em buscas locais.",
 connected: false,
 kpis: [
 { id: "gmb.rating", label: "Avaliação Média", description: "Nota média no GMB", unit: "count", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "gmb.reviews_30d", label: "Novas Avaliações (30d)", description: "Reviews recebidas", unit: "count", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "gmb.discovery_views", label: "Descobertas", description: "Visualizações em buscas", unit: "count", sample_value: 0, sample_delta: null, sparkline: null },
 ],
 },
 {
 id: "op.planejamento",
 source: "mkton",
 kind: "operacional",
 label: "Planejamento Comercial",
 caption: "Metas, quotas e acompanhamento do plano comercial.",
 connected: false,
 kpis: [
 { id: "plan.meta_mes", label: "Meta do Mês", description: "Valor planejado de vendas", unit: "currency_brl", sample_value: 250000, sample_delta: null, sparkline: null },
 { id: "plan.realizado_mes", label: "Realizado no Mês", description: "Total ganho até agora", unit: "currency_brl", sample_value: 142000, sample_delta: 0.18, sparkline: [20,40,60,80,100,120,142] },
 { id: "plan.gap_meta", label: "Gap para a Meta", description: "Quanto falta para fechar", unit: "currency_brl", sample_value: 108000, sample_delta: null, sparkline: null },
 { id: "plan.previsao_fechamento", label: "Previsão de Fechamento", description: "Estimativa baseada no pipeline", unit: "currency_brl", sample_value: 218000, sample_delta: 0.05, sparkline: null },
 ],
 },
 {
 id: "op.pipeline",
 source: "mkton",
 kind: "operacional",
 label: "Pipeline",
 caption: "Funil de vendas, etapas e conversão entre estágios.",
 connected: false,
 kpis: [
 { id: "pipe.oportunidades_abertas", label: "Oportunidades Abertas", description: "Leads ativos no funil", unit: "count", sample_value: 84, sample_delta: 0.06, sparkline: [60,65,70,72,78,80,84] },
 { id: "pipe.valor_pipeline", label: "Valor do Pipeline", description: "Soma dos valores em aberto", unit: "currency_brl", sample_value: 412000, sample_delta: 0.12, sparkline: null },
 { id: "pipe.taxa_conversao", label: "Conversão Lead → Ganho", description: "% leads que viram vendas", unit: "percent", sample_value: 0.14, sample_delta: 0.02, sparkline: [0.1,0.11,0.12,0.13,0.13,0.14,0.14] },
 { id: "pipe.ciclo_dias", label: "Ciclo Médio (dias)", description: "Tempo médio até o ganho", unit: "count", sample_value: 22, sample_delta: -0.04, sparkline: [26,25,24,24,23,22,22] },
 ],
 },
 {
 id: "op.atendimento",
 source: "mkton",
 kind: "operacional",
 label: "Atendimento",
 caption: "Conversas ativas, SLA e fila por atendente.",
 connected: false,
 kpis: [
 { id: "at.conversas_ativas", label: "Conversas Ativas", description: "Em andamento agora", unit: "count", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "at.tempo_resposta", label: "Tempo de Resposta", description: "Tempo médio para responder", unit: "duration_min", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "at.fila_espera", label: "Fila de Espera", description: "Leads aguardando atendimento", unit: "count", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "at.sla_cumprido", label: "SLA Cumprido", description: "% atendimentos dentro do SLA", unit: "percent", sample_value: 0, sample_delta: null, sparkline: null },
 ],
 },
 {
 id: "op.email_sms",
 source: "mkton",
 kind: "operacional",
 label: "E-mail e SMS",
 caption: "Entregabilidade, abertura, cliques e respostas.",
 connected: false,
 kpis: [
 { id: "msg.envios_30d", label: "Envios (30d)", description: "Total enviado no período", unit: "count", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "msg.abertura", label: "Taxa de Abertura", description: "% que abriu a mensagem", unit: "percent", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "msg.cliques", label: "Taxa de Cliques", description: "% que clicou em algum link", unit: "percent", sample_value: 0, sample_delta: null, sparkline: null },
 { id: "msg.entregabilidade", label: "Entregabilidade", description: "% entregue com sucesso", unit: "percent", sample_value: 0, sample_delta: null, sparkline: null },
 ],
 },
];

export function findCatalogKpi(id: string): { kpi: CatalogKpi; group: IntegrationGroup } | null {
 for (const g of KPI_CATALOG) {
 const k = g.kpis.find((x) => x.id === id);
 if (k) return { kpi: k, group: g };
 }
 return null;
}

export function catalogKpiToCard(id: string): KpiCardData | null {
 const found = findCatalogKpi(id);
 if (found) {
 const { kpi, group } = found;
 return {
 kpi_key: kpi.id,
 label: kpi.label,
 value: group.connected? kpi.sample_value: null,
 unit: kpi.unit,
 delta_pct: group.connected? kpi.sample_delta: null,
 status: group.connected? "ok": "no_data",
 source: group.source,
 source_label: group.label,
 description: kpi.description,
 sparkline: group.connected? kpi.sparkline: null,
 drilldown_available: group.connected,
 size_key: "sm",
 };
 }
 // ID dinâmico vindo do catálogo real - placeholder enquanto não há server fn de valores.
 const [source] = id.split(".");
 const sourceLabel = source === "meta_ads"? "Meta Ads": source === "google_ads"? "Google Ads": source === "tiktok_ads"? "TikTok Ads": "MKTOn";
 return {
 kpi_key: id,
 label: humanizeId(id),
 value: null,
 unit: "count",
 delta_pct: null,
 status: "no_data",
 source: source === "meta_ads"? "meta": source === "google_ads"? "google_ads": source === "tiktok_ads"? "tiktok": "mkton",
 source_label: sourceLabel,
 description: "Aguardando cálculo no servidor.",
 sparkline: null,
 drilldown_available: false,
 size_key: "sm",
 };
}

function humanizeId(id: string): string {
 const parts = id.split(".");
 return parts.slice(1).join(" · ").replace(/_/g, " ");
}
