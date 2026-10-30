import { useMemo, type ReactNode } from "react";
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Flag,
  FormInput,
  Gauge,
  Hash,
  Megaphone,
  MousePointerClick,
  Package,
  Radio,
  Route,
  Share2,
  ShoppingBag,
  Sparkles,
  Tags,
  Target,
  Trophy,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardMetricsResponse, DrilldownLead } from "@/lib/mock-dashboard";
import type { DashboardV4LiveResponse } from "@/lib/dashboard-v4-live.functions";
import { leadDrilldown, type DashboardDrilldownRequest } from "@/lib/dashboard-drilldown";
import { cn } from "@/lib/utils";

type RuleOption = { id: string; name: string };
type StageOption = { id: string; name: string; pipeline_id: string; pipeline_name: string };
type RuleOptions = { pipelines: RuleOption[]; originTags: RuleOption[]; stages?: StageOption[] };

type Props = {
  metrics: DashboardMetricsResponse;
  leads: DrilldownLead[];
  ruleOptions?: RuleOptions;
  liveData?: DashboardV4LiveResponse;
  onDrilldown?: (request: DashboardDrilldownRequest) => void;
};

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 215 70% 55%))",
  "hsl(var(--chart-3, 160 60% 45%))",
  "hsl(var(--chart-4, 35 85% 55%))",
  "hsl(var(--chart-5, 280 65% 58%))",
];

const forms = [
  { name: "Diagnóstico comercial", submissions: 384, qualified: 228, conversion: 59.4 },
  { name: "Solicitar demonstração", submissions: 292, qualified: 201, conversion: 68.8 },
  { name: "Cadastro trial", submissions: 241, qualified: 173, conversion: 71.8 },
  { name: "Orçamento tráfego", submissions: 167, qualified: 92, conversion: 55.1 },
  { name: "Contato site", submissions: 121, qualified: 58, conversion: 47.9 },
];

const tags = [
  { name: "Lead quente", leads: 238, won: 61, conversion: 25.6 },
  { name: "Indicação", leads: 192, won: 49, conversion: 25.5 },
  { name: "WhatsApp", leads: 417, won: 47, conversion: 11.3 },
  { name: "Remarketing", leads: 163, won: 21, conversion: 12.9 },
  { name: "Ticket alto", leads: 84, won: 19, conversion: 22.6 },
  { name: "Reativação", leads: 126, won: 16, conversion: 12.7 },
];

const customFields = [
  { field: "Segmento", top: "Saúde", value: "24% dos leads", insight: "maior taxa de fechamento" },
  { field: "Faixa de investimento", top: "R$ 2k–5k", value: "31% da base", insight: "ticket médio R$ 1.420" },
  { field: "Tamanho da equipe", top: "2–5 pessoas", value: "38% da base", insight: "melhor aderência Growth" },
  { field: "Urgência", top: "Até 7 dias", value: "27% dos leads", insight: "19,8% de conversão" },
  { field: "Canal preferido", top: "WhatsApp", value: "63% da base", insight: "resposta mais rápida" },
];

const channelAttribution = [
  { name: "Meta Ads", leads: 486, sales: 62, revenue: 78600 },
  { name: "Google Ads", leads: 238, sales: 31, revenue: 40700 },
  { name: "Orgânico", leads: 211, sales: 24, revenue: 29100 },
  { name: "Indicação", leads: 176, sales: 21, revenue: 24800 },
  { name: "Direto", leads: 93, sales: 8, revenue: 11000 },
  { name: "Outros", leads: 80, sales: 0, revenue: 0 },
];

const utmCampaigns = [
  { campaign: "crm-agosto-demo", source: "meta", leads: 182, sales: 29, revenue: "R$ 38,4 mil" },
  { campaign: "automacao-whatsapp", source: "google", leads: 137, sales: 21, revenue: "R$ 27,6 mil" },
  { campaign: "scale-performance", source: "meta", leads: 118, sales: 18, revenue: "R$ 23,9 mil" },
  { campaign: "remarketing-trial", source: "meta", leads: 94, sales: 14, revenue: "R$ 18,1 mil" },
  { campaign: "brand-search", source: "google", leads: 82, sales: 11, revenue: "R$ 14,4 mil" },
];

const trackingEvents = [
  { event: "page_view", total: "18.492", change: "+12%" },
  { event: "view_pricing", total: "4.218", change: "+16%" },
  { event: "form_start", total: "2.184", change: "+9%" },
  { event: "form_submit", total: "1.205", change: "+14%" },
  { event: "cadastro", total: "642", change: "+18%" },
  { event: "purchase", total: "146", change: "+11%" },
];

const conversionPaths = [
  { path: "Meta Ads → WhatsApp → CRM", sales: 44, revenue: "R$ 55,8 mil" },
  { path: "Google Ads → Formulário → CRM", sales: 27, revenue: "R$ 34,9 mil" },
  { path: "Orgânico → Site → WhatsApp", sales: 21, revenue: "R$ 26,5 mil" },
  { path: "Indicação → WhatsApp → CRM", sales: 18, revenue: "R$ 22,2 mil" },
];

const mediaEfficiency = [
  { label: "CPL", value: "R$ 24,76", note: "↓ 8,4%" },
  { label: "CTR", value: "2,91%", note: "↑ 0,32 p.p." },
  { label: "CPC", value: "R$ 1,84", note: "↓ 6,1%" },
  { label: "Conversas", value: "612", note: "↑ 19,5%" },
];

const socialPosts = [
  { name: "Reel · CRM sem planilha", network: "Instagram", reach: "38,4 mil", engagement: "8,9%", leads: 42 },
  { name: "Carrossel · 5 erros no funil", network: "Instagram", reach: "24,7 mil", engagement: "7,4%", leads: 31 },
  { name: "Case · Clínica Vida Mais", network: "LinkedIn", reach: "16,2 mil", engagement: "5,8%", leads: 18 },
  { name: "Vídeo · Tracking na prática", network: "Facebook", reach: "14,9 mil", engagement: "4,9%", leads: 15 },
];

const taskHealth = [
  { label: "Tarefas hoje", value: "84", note: "72 concluídas", icon: CheckCircle2 },
  { label: "Reuniões", value: "17", note: "5 comerciais", icon: CalendarDays },
  { label: "Leads sem próxima ação", value: "39", note: "precisam atenção", icon: Flag },
  { label: "Automações executadas", value: "3.842", note: "98,7% sucesso", icon: Workflow },
];

export function BusinessIntelligenceBoard({ metrics, leads, liveData, onDrilldown }: Props) {
  const wonLeads = useMemo(() => leads.filter((lead) => lead.status_key === "won"), [leads]);
  const lostLeads = useMemo(() => leads.filter((lead) => lead.status_key === "lost"), [leads]);
  const openLeads = useMemo(() => leads.filter((lead) => lead.status_key === "open"), [leads]);
  const revenue = useMemo(() => wonLeads.reduce((sum, lead) => sum + lead.value_brl, 0), [wonLeads]);
  const pipelineValue = useMemo(() => openLeads.reduce((sum, lead) => sum + lead.value_brl, 0), [openLeads]);
  const conversion = leads.length ? wonLeads.length / leads.length : 0;

  const executiveKpis = useMemo(() => [
    { label: "Receita", value: formatCurrency(revenue), delta: "CRM", note: "leads ganhos", icon: CircleDollarSign, featured: true },
    { label: "Investimento em mídia", value: "—", delta: "Bloco 10", note: "ligação de mídia", icon: BadgeDollarSign },
    { label: "ROAS conectado", value: "—", delta: "Bloco 10", note: "CRM × mídia", icon: Gauge },
    { label: "Leads", value: leads.length.toLocaleString("pt-BR"), delta: "CRM", note: metrics.period_label, icon: Users },
    { label: "Vendas", value: wonLeads.length.toLocaleString("pt-BR"), delta: "CRM", note: "ganhas no período", icon: Trophy },
    { label: "Conversão", value: formatPercent(conversion), delta: "CRM", note: "lead → venda", icon: Target },
  ], [conversion, leads.length, metrics.period_label, revenue, wonLeads.length]);

  const revenueTrend = useMemo(() => {
    const map = new Map<string, { day: string; receita: number; vendas: number; leads: number }>();
    for (const lead of leads) {
      const date = new Date(lead.created_at);
      if (!Number.isFinite(date.getTime())) continue;
      const day = date.toISOString().slice(0, 10);
      const item = map.get(day) ?? { day, receita: 0, vendas: 0, leads: 0 };
      item.leads += 1;
      if (lead.status_key === "won") {
        item.vendas += 1;
        item.receita += lead.value_brl;
      }
      map.set(day, item);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30);
  }, [leads]);

  const funnelData = useMemo(() => metrics.funnel.map((stage) => ({
    id: stage.stage_id,
    name: stage.stage_name,
    funnelName: stage.funnel_name,
    value: stage.count,
  })), [metrics.funnel]);

  const companies = liveData?.companies ?? [];
  const products = liveData?.products ?? [];
  const totalAttributedRevenue = useMemo(() => channelAttribution.reduce((sum, item) => sum + item.revenue, 0), []);

  return (
    <section className="space-y-5 pb-6">
      <Hero />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {executiveKpis.map((item) => <ExecutiveKpi key={item.label} {...item} />)}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-8" eyebrow="Visão executiva" title="Receita e fechamento" subtitle="Este bloco já usa os leads reais carregados no período; mídia entra no bloco de aquisição posterior.">
          {revenueTrend.length ? (
            <div className="h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrend} margin={{ top: 12, right: 12, left: -8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="v4Revenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v, name) => [name === "receita" ? formatCurrency(Number(v)) : Number(v).toLocaleString("pt-BR"), name === "receita" ? "Receita" : name === "vendas" ? "Vendas" : "Leads"]} />
                  <Area type="monotone" dataKey="receita" name="receita" stroke="hsl(var(--primary))" fill="url(#v4Revenue)" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="vendas" name="vendas" stroke="hsl(var(--chart-3, 160 60% 45%))" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="Sem histórico comercial no período" text="Assim que houver leads no período, a curva é preenchida com a base real do CRM." />}
        </Panel>

        <Panel className="xl:col-span-4" eyebrow="Saúde comercial" title="Base que compõe o resultado" subtitle="Sem score artificial: só os números que já têm fonte operacional comprovada.">
          <div className="space-y-2">
            <OperationalRow label="Em aberto" value={openLeads.length.toLocaleString("pt-BR")} note={formatCurrency(pipelineValue)} />
            <OperationalRow label="Ganhos" value={wonLeads.length.toLocaleString("pt-BR")} note={formatCurrency(revenue)} />
            <OperationalRow label="Perdidos" value={lostLeads.length.toLocaleString("pt-BR")} note="leads" />
            <OperationalRow label="Conversão" value={formatPercent(conversion)} note="ganhos ÷ base" />
          </div>
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.05] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary"><Zap className="h-4 w-4" /> Bloco B conectado</div>
            <p className="mt-2 text-sm font-semibold text-foreground">Comercial e empresas já saem da base real.</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Produto vendido e responsável comercial continuam bloqueados até existir vínculo canônico no CRM; nenhum número é inferido.</p>
          </div>
        </Panel>
      </div>

      <SectionHeading icon={BriefcaseBusiness} eyebrow="Comercial" title="Da entrada ao fechamento" description="Funil e fechamento agora usam o mesmo conjunto de leads que alimenta o drilldown." />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-7" eyebrow="Funil de vendas" title="Volume por etapa" subtitle="Cada barra representa a quantidade real de leads na etapa e pode abrir o drilldown correspondente.">
          {funnelData.length ? (
            <div className="h-[310px]" data-dashboard-drilldown-handled="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical" margin={{ top: 8, right: 20, left: 28, bottom: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    name="Leads"
                    fill="hsl(var(--primary))"
                    radius={[0, 10, 10, 0]}
                    cursor="pointer"
                    onClick={(row) => {
                      const stageId = String((row as { id?: string }).id ?? "");
                      const item = funnelData.find((entry) => entry.id === stageId);
                      if (!item || !onDrilldown) return;
                      onDrilldown(leadDrilldown(
                        `Etapa · ${item.name}`,
                        item.funnelName,
                        leads.filter((lead) => lead.stage_id === item.id),
                        "CRM Vanessa Simoni",
                      ));
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="Sem etapas para exibir" text="Crie um funil e mova leads entre as etapas para preencher esta visão." />}
        </Panel>

        <Panel className="xl:col-span-5" eyebrow="Equipe" title="Ranking de vendedores" subtitle="O ranking só será mostrado quando o CRM registrar o responsável de cada lead/negócio de forma canônica.">
          <EmptyState
            title="Responsável comercial ainda não está ligado ao lead"
            text="A camada atual da Dashboard recebe o lead sem owner/responsável. O ranking fictício foi removido para não atribuir venda a pessoas inexistentes."
          />
        </Panel>
      </div>

      <SectionHeading icon={ShoppingBag} eyebrow="Oferta" title="Catálogo conectado sem inventar venda" description="O catálogo já é real; receita por produto só entra quando existir a relação produto vendido ↔ negócio/lead ganho." />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-8" eyebrow="Produtos & serviços" title="Catálogo ativo" subtitle="Preço, estoque, categoria e catálogo vêm da fonte real de Produtos do CRM.">
          {products.length ? (
            <div className="space-y-2.5">
              {products.map((product, index) => (
                <div key={product.id} className="grid grid-cols-[32px_minmax(0,1.5fr)_100px_88px_72px] items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{product.name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{product.catalogName} · {product.category}</div>
                  </div>
                  <StatCell label="Preço" value={formatCurrency(product.promoPrice ?? product.price)} />
                  <StatCell label="Estoque" value={product.stock.toLocaleString("pt-BR")} />
                  <StatCell label="Status" value={product.active ? "Ativo" : "Inativo"} />
                </div>
              ))}
            </div>
          ) : <EmptyState title="Nenhum produto cadastrado" text="O bloco será preenchido a partir dos catálogos reais do workspace." />}
        </Panel>

        <Panel className="xl:col-span-4" eyebrow="Mix de receita" title="Vendas por produto" subtitle="Este gráfico permanece bloqueado até existir uma associação confiável entre venda e produto.">
          <EmptyState title="Vínculo produto ↔ venda não encontrado" text="Cadastro de produto não prova venda. O ranking e a participação de receita voltam quando a modelagem operacional fornecer esse vínculo." />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel eyebrow="Empresas" title="Clientes com maior peso na operação" subtitle="Empresas reais ordenadas pela receita de leads ganhos; clique em uma linha para abrir os leads relacionados.">
          <TableHeader cols="grid-cols-[1.4fr_72px_100px_82px]" labels={["Empresa", "Ganhos", "Receita", "Leads"]} />
          {companies.length ? (
            <div className="divide-y divide-border/60" data-dashboard-drilldown-handled="true">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  className="grid w-full grid-cols-[1.4fr_72px_100px_82px] items-center gap-3 py-3 text-left text-xs hover:bg-muted/20"
                  onClick={() => onDrilldown?.(leadDrilldown(
                    `Empresa · ${company.name}`,
                    `${company.leadCount} lead${company.leadCount === 1 ? "" : "s"} relacionado${company.leadCount === 1 ? "" : "s"}`,
                    leads.filter((lead) => company.leadIds.includes(lead.lead_id)),
                    "CRM Vanessa Simoni",
                  ))}
                >
                  <div className="flex min-w-0 items-center gap-2"><Building2 className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate font-semibold">{company.name}</span></div>
                  <span className="font-mono tabular-nums">{company.wonDeals}</span>
                  <span className="font-mono font-semibold tabular-nums">{formatCurrency(company.revenue)}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{company.leadCount}</span>
                </button>
              ))}
            </div>
          ) : <EmptyState title="Nenhuma empresa vinculada a leads" text="Associe leads às empresas para formar o ranking real." />}
        </Panel>

        <Panel eyebrow="Formulários" title="Quais formulários trazem oportunidades" subtitle="Este bloco ainda está na etapa visual; a ligação real entra no Bloco C.">
          <TableHeader cols="grid-cols-[1.3fr_82px_82px_86px]" labels={["Formulário", "Envios", "Qualificados", "Taxa"]} />
          <div className="divide-y divide-border/60 opacity-60">
            {forms.map((form) => (
              <div key={form.name} className="grid grid-cols-[1.3fr_82px_82px_86px] items-center gap-3 py-3 text-xs">
                <div className="flex min-w-0 items-center gap-2"><FormInput className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate font-semibold">{form.name}</span></div>
                <span className="font-mono tabular-nums">{form.submissions}</span>
                <span className="font-mono tabular-nums">{form.qualified}</span>
                <div><span className="font-mono font-semibold tabular-nums">{form.conversion.toFixed(1)}%</span><div className="mt-1 h-1 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${form.conversion}%` }} /></div></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <SectionHeading icon={Tags} eyebrow="Inteligência do CRM" title="Tags e campos personalizados viram análise" description="Bloco visual preservado; os dados reais de tags e campos entram na próxima etapa." />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 opacity-60">
        <Panel className="xl:col-span-7" eyebrow="Tags" title="Performance por marcador" subtitle="A ligação com tags reais entra no Bloco C.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tags.map((tag) => (
              <div key={tag.name} className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-xs font-semibold"><Hash className="h-3 w-3 text-primary" />{tag.name}</span><span className="font-mono text-xs font-bold">{tag.conversion}%</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground"><span>{tag.leads} leads</span><span>{tag.won} ganhos</span></div>
                <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, tag.conversion * 3)}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="xl:col-span-5" eyebrow="Campos personalizados" title="Padrões da base" subtitle="A ligação com campos reais entra no Bloco C.">
          <div className="space-y-2">
            {customFields.map((item) => (
              <div key={item.field} className="rounded-xl border border-border/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{item.field}</span><span className="text-[10px] text-primary">{item.insight}</span></div>
                <div className="mt-1 flex items-baseline justify-between gap-3"><span className="text-sm font-semibold">{item.top}</span><span className="font-mono text-xs text-muted-foreground">{item.value}</span></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <SectionHeading icon={Route} eyebrow="Tracking & atribuição" title="De onde veio, o que fez e o que virou venda" description="Bloco visual preservado; a ligação definitiva do Tracking entra no Bloco C." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 opacity-60">
        <MiniKpi icon={Radio} label="Sessões rastreadas" value="21.846" note="visual pendente de backend" />
        <MiniKpi icon={MousePointerClick} label="Conversões" value="1.205" note="visual pendente de backend" />
        <MiniKpi icon={Target} label="Vendas atribuídas" value="136" note="visual pendente de backend" />
        <MiniKpi icon={CircleDollarSign} label="Receita atribuída" value={formatCurrency(totalAttributedRevenue)} note="visual pendente de backend" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 opacity-60">
        <Panel className="xl:col-span-7" eyebrow="Canais" title="Receita atribuída por origem" subtitle="Ligação real entra no Bloco C.">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelAttribution} margin={{ top: 8, right: 8, left: -6, bottom: 26 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-12} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="leads" name="Leads" fill="hsl(var(--chart-2, 215 70% 55%))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="sales" name="Vendas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="xl:col-span-5" eyebrow="Eventos" title="Funil de comportamento" subtitle="Ligação real entra no Bloco C.">
          <div className="space-y-2">
            {trackingEvents.map((item, index) => (
              <div key={item.event} className="grid grid-cols-[32px_1fr_auto_auto] items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 font-mono text-[10px] font-bold text-primary">{index + 1}</div>
                <span className="font-mono text-xs font-semibold">{item.event}</span>
                <span className="font-mono text-xs tabular-nums">{item.total}</span>
                <span className="text-[10px] font-semibold text-success">{item.change}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 opacity-60">
        <Panel eyebrow="UTM" title="Campanhas que geram receita" subtitle="Ligação real entra no Bloco C.">
          <TableHeader cols="grid-cols-[1.4fr_62px_62px_92px]" labels={["Campanha", "Leads", "Vendas", "Receita"]} />
          <div className="divide-y divide-border/60">
            {utmCampaigns.map((item) => (
              <div key={item.campaign} className="grid grid-cols-[1.4fr_62px_62px_92px] items-center gap-3 py-3 text-xs">
                <div className="min-w-0"><div className="truncate font-mono font-semibold">{item.campaign}</div><div className="text-[10px] text-muted-foreground">utm_source={item.source}</div></div>
                <span className="font-mono tabular-nums">{item.leads}</span>
                <span className="font-mono tabular-nums">{item.sales}</span>
                <span className="font-mono font-semibold tabular-nums">{item.revenue}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Caminhos" title="Jornadas que terminam em venda" subtitle="Ligação real entra no Bloco C.">
          <div className="space-y-2.5">
            {conversionPaths.map((item, index) => (
              <div key={item.path} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-widest text-primary">Caminho #{index + 1}</div><div className="mt-1 text-xs font-semibold">{item.path}</div></div><div className="text-right"><div className="font-mono text-xs font-bold">{item.sales} vendas</div><div className="text-[10px] text-muted-foreground">{item.revenue}</div></div></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <SectionHeading icon={Megaphone} eyebrow="Aquisição" title="Mídia paga com contexto de negócio" description="Bloco visual preservado; ROI, contas e campanhas entram no Bloco D." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 opacity-60">
        {mediaEfficiency.map((item, index) => <MiniKpi key={item.label} icon={[Target, MousePointerClick, BadgeDollarSign, Users][index]} label={item.label} value={item.value} note="visual pendente de backend" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 opacity-60">
        <Panel className="xl:col-span-8" eyebrow="Eficiência" title="Custo × resultado ao longo do período" subtitle="Ligação real entra no Bloco D.">
          <EmptyState title="Aquisição ainda não ligada neste bloco" text="A estrutura visual foi preservada sem usar a curva demonstrativa como dado operacional." />
        </Panel>
        <Panel className="xl:col-span-4" eyebrow="Decisão" title="Leitura do gestor" subtitle="Insights reais entram depois da atribuição de mídia.">
          <Insight icon={CheckCircle2} title="Sem recomendação automática ainda" text="O painel só vai recomendar escala ou corte depois que campanha, gasto e venda estiverem ligados pela mesma atribuição." />
        </Panel>
      </div>

      <SectionHeading icon={Share2} eyebrow="Social Media" title="Conteúdo ligado a alcance e geração de demanda" description="Bloco visual preservado; métricas reais entram no Bloco D." />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 opacity-60">
        <Panel className="xl:col-span-8" eyebrow="Conteúdos" title="Top posts do período" subtitle="Ligação real entra no Bloco D.">
          <TableHeader cols="grid-cols-[1.5fr_92px_90px_70px]" labels={["Conteúdo", "Alcance", "Engaj.", "Leads"]} />
          <div className="divide-y divide-border/60">
            {socialPosts.map((post) => (
              <div key={post.name} className="grid grid-cols-[1.5fr_92px_90px_70px] items-center gap-3 py-3 text-xs">
                <div className="min-w-0"><div className="truncate font-semibold">{post.name}</div><div className="text-[10px] text-muted-foreground">{post.network}</div></div>
                <span className="font-mono tabular-nums">{post.reach}</span>
                <span className="font-mono tabular-nums">{post.engagement}</span>
                <span className="font-mono font-semibold tabular-nums">{post.leads}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="xl:col-span-4" eyebrow="Resumo social" title="Pulso de conteúdo" subtitle="Ligação real entra no Bloco D.">
          <EmptyState title="Métricas sociais ainda não conectadas" text="O layout permanece no lugar, mas não usamos números demonstrativos como se fossem reais." />
        </Panel>
      </div>

      <SectionHeading icon={Workflow} eyebrow="Execução" title="Operação, agenda e automações" description="Bloco visual preservado; tarefas, reuniões e automações entram no Bloco D." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 opacity-60">
        {taskHealth.map((item) => <MiniKpi key={item.label} icon={item.icon} label={item.label} value={item.value} note="visual pendente de backend" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 opacity-60">
        <Panel className="xl:col-span-7" eyebrow="Agenda" title="Próximos compromissos" subtitle="Ligação real entra no Bloco D.">
          <EmptyState title="Agenda ainda não conectada" text="A fonte real já existe no produto e será agregada no bloco de execução." />
        </Panel>
        <Panel className="xl:col-span-5" eyebrow="Automações" title="Saúde das rotinas" subtitle="Ligação real entra no Bloco D.">
          <EmptyState title="Execuções ainda não conectadas" text="O painel não exibe taxa de sucesso artificial enquanto os runs reais não estiverem agregados." />
        </Panel>
      </div>
    </section>
  );
}

function Hero() {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-border/70 bg-card px-5 py-5 shadow-sm sm:px-7 sm:py-6">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-primary/12 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-primary/5 blur-3xl" />
      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary"><Sparkles className="h-3.5 w-3.5" /> Dashboard V4 · backend em ligação</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">A operação inteira, da origem do lead até a receita.</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">Comercial, funil, receita e empresas já usam dados reais neste bloco. As áreas seguintes permanecem visualmente no lugar e são conectadas etapa por etapa, sem transformar demonstração em número operacional.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["CRM real", "Empresas reais", "Produtos reais", "Tracking próximo", "Tráfego próximo", "Operação próxima"].map((item) => <span key={item} className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{item}</span>)}
        </div>
      </div>
    </div>
  );
}

function ExecutiveKpi({ label, value, delta, note, icon: Icon, featured }: { label: string; value: string; delta: string; note: string; icon: typeof Activity; featured?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", featured ? "border-primary/25 bg-primary/[0.055]" : "border-border/70 bg-card")}>
      <div className="flex items-start justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div><Icon className="h-4 w-4 text-primary" /></div>
      <div className="mt-3 font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px]"><span className="font-semibold text-primary">{delta}</span><span className="text-muted-foreground">{note}</span></div>
    </div>
  );
}

function SectionHeading({ icon: Icon, eyebrow, title, description }: { icon: typeof Activity; eyebrow: string; title: string; description: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-t border-border/60 pt-5">
      <div className="flex gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><div><div className="text-[10px] font-bold uppercase tracking-widest text-primary">{eyebrow}</div><h3 className="mt-0.5 text-xl font-semibold tracking-tight">{title}</h3><p className="mt-1 max-w-3xl text-[11px] leading-5 text-muted-foreground">{description}</p></div></div>
    </div>
  );
}

function Panel({ children, className = "", eyebrow, title, subtitle }: { children: ReactNode; className?: string; eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className={cn("rounded-[24px] border border-border/70 bg-card p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-4"><div className="text-[10px] font-bold uppercase tracking-widest text-primary">{eyebrow}</div><h4 className="mt-1 text-base font-semibold tracking-tight text-foreground">{title}</h4><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{subtitle}</p></div>
      {children}
    </div>
  );
}

function MiniKpi({ icon: Icon, label, value, note }: { icon: typeof Activity; label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div>
      <div className="mt-3 font-mono text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{note}</div>
    </div>
  );
}

function OperationalRow({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/15 px-3 py-3"><span className="text-xs font-semibold">{label}</span><div className="text-right"><div className="font-mono text-sm font-semibold tabular-nums">{value}</div><div className="text-[10px] text-muted-foreground">{note}</div></div></div>;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums">{value}</div></div>;
}

function TableHeader({ cols, labels }: { cols: string; labels: string[] }) {
  return <div className={cn("grid gap-3 border-b border-border/60 pb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground", cols)}>{labels.map((label) => <span key={label}>{label}</span>)}</div>;
}

function Insight({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) {
  return <div className="mb-3 rounded-xl border border-border/60 p-3 last:mb-0"><div className="flex items-center gap-2 text-xs font-semibold"><Icon className="h-3.5 w-3.5 text-primary" />{title}</div><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{text}</p></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="flex min-h-[150px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/10 px-5 py-8 text-center"><Package className="h-5 w-5 text-primary" /><div className="mt-3 text-sm font-semibold">{title}</div><p className="mt-1 max-w-md text-[11px] leading-5 text-muted-foreground">{text}</p></div>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}
