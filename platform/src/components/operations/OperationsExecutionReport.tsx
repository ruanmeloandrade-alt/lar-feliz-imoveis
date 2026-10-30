import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, Loader2, RefreshCw, Siren, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getOperationsExecutionReport } from "@/lib/operations-report.functions";

type PageSize = 10 | 20 | 50;
type Pagination = {
  page: number;
  pageSize: PageSize;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};
type Warning = { source: string; message: string };
type TriggerRow = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  active: boolean;
  triggerCount: number;
};
type ExecutionRow = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  botName: string;
  leadName: string;
  status: string;
  duplicate: boolean;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
type IncidentRow = {
  id: string;
  kind: "duplicidade" | "bug_execucao";
  title: string;
  description: string;
  workspaceName: string;
  customerName: string;
  source: string;
  createdAt: string;
};
type OperationsReport = {
  generatedAt: string;
  warnings: Warning[];
  summary: {
    bots: number | null;
    activeBots: number | null;
    inactiveBots: number | null;
    executions: number | null;
    executionErrors: number | null;
  };
  botPagination: Pagination;
  executionPagination: Pagination;
  triggers: TriggerRow[];
  executions: ExecutionRow[];
  incidents: IncidentRow[];
};

export function OperationsExecutionReport({ enabled }: { enabled: boolean }) {
  const loadReport = useServerFn(getOperationsExecutionReport);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [botPage, setBotPage] = useState(0);
  const [executionPage, setExecutionPage] = useState(0);

  const report = useQuery({
    queryKey: ["admin", "operations-report", pageSize, botPage, executionPage],
    queryFn: () => loadReport({ data: { pageSize, botPage, executionPage } }) as Promise<OperationsReport>,
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const data = report.data;
  const safeBotPage = data?.botPagination.page;
  const safeExecutionPage = data?.executionPagination.page;

  useEffect(() => {
    if (typeof safeBotPage === "number" && safeBotPage !== botPage) setBotPage(safeBotPage);
  }, [botPage, safeBotPage]);

  useEffect(() => {
    if (typeof safeExecutionPage === "number" && safeExecutionPage !== executionPage) setExecutionPage(safeExecutionPage);
  }, [executionPage, safeExecutionPage]);

  if (report.isError) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm">
        Não foi possível carregar a telemetria da plataforma. Tente atualizar em instantes.
      </div>
    );
  }
  if (report.isLoading || !data) {
    return <div className="grid min-h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  const changePageSize = (value: PageSize) => {
    setPageSize(value);
    setBotPage(0);
    setExecutionPage(0);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card/50 p-5">
        <div>
          <h2 className="text-lg font-bold">Telemetria global de execuções</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Visão administrativa da plataforma inteira, com SalesBots e execuções paginados na fonte. Dados sensíveis de erro são minimizados antes de chegar à tela.
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">Atualizado em {formatDate(data.generatedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Linhas
            <select
              value={pageSize}
              onChange={(event) => changePageSize(Number(event.target.value) as PageSize)}
              className="h-9 rounded-md border border-border bg-background px-2 text-foreground"
              aria-label="Quantidade de linhas por página"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
          <Button variant="outline" onClick={() => report.refetch()} disabled={report.isFetching}>
            {report.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
          </Button>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Telemetria parcialmente indisponível</div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {data.warnings.map((warning) => <div key={`${warning.source}:${warning.message}`}>{warning.message}</div>)}
          </div>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="SalesBots" value={data.summary.bots} icon={<Bot className="h-4 w-4" />} />
        <Metric label="Bots ativos" value={data.summary.activeBots} icon={<Workflow className="h-4 w-4" />} />
        <Metric label="Bots inativos" value={data.summary.inactiveBots} icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Execuções" value={data.summary.executions} icon={<RefreshCw className="h-4 w-4" />} />
        <Metric label="Execuções com erro" value={data.summary.executionErrors} icon={<Siren className="h-4 w-4" />} />
      </section>

      <Tabs defaultValue="salesbots" className="space-y-4">
        <TabsList>
          <TabsTrigger value="salesbots">SalesBots</TabsTrigger>
          <TabsTrigger value="execucoes">Execuções</TabsTrigger>
          <TabsTrigger value="bugs">Bugs da página</TabsTrigger>
        </TabsList>

        <TabsContent value="salesbots">
          <Panel title="SalesBots cadastrados" subtitle="Listagem global da plataforma, sem depender do workspace ativo do administrador.">
            <Table>
              <TableHeader><TableRow><TableHead>Workspace</TableHead><TableHead>SalesBot</TableHead><TableHead>Gatilhos</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.triggers.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum SalesBot encontrado nesta página.</TableCell></TableRow>
                ) : data.triggers.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell><div className="font-medium">{row.workspaceName}</div><div className="text-[11px] text-muted-foreground">{shortId(row.workspaceId)}</div></TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.triggerCount}</TableCell>
                    <TableCell><Badge variant={row.active ? "outline" : "secondary"}>{row.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls pagination={data.botPagination} onPageChange={setBotPage} />
          </Panel>
        </TabsContent>

        <TabsContent value="execucoes">
          <Panel title="Execuções recentes" subtitle="Ordenadas por início, com workspace explícito e mensagens de erro sanitizadas no servidor.">
            <Table>
              <TableHeader><TableRow><TableHead>Workspace</TableHead><TableHead>SalesBot</TableHead><TableHead>Lead</TableHead><TableHead>Status</TableHead><TableHead>Sinal</TableHead><TableHead>Erro</TableHead><TableHead>Início</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.executions.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhuma execução encontrada nesta página.</TableCell></TableRow>
                ) : data.executions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.workspaceName}</TableCell>
                    <TableCell>{row.botName}</TableCell>
                    <TableCell>{row.leadName}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell>{row.duplicate ? <Badge variant="destructive">Possível duplicidade</Badge> : "—"}</TableCell>
                    <TableCell className="max-w-sm truncate text-xs text-muted-foreground" title={row.error ?? ""}>{row.error ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls pagination={data.executionPagination} onPageChange={setExecutionPage} />
          </Panel>
        </TabsContent>

        <TabsContent value="bugs">
          <Panel title="Sinais detectados nesta página" subtitle="Falhas e possíveis duplicidades são derivadas apenas das execuções carregadas; não representam um contador global de incidentes.">
            <div className="space-y-3">
              {data.incidents.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum sinal de bug nas execuções desta página.</p>
              ) : data.incidents.map((row) => (
                <div key={row.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={row.kind === "duplicidade" ? "destructive" : "outline"}>{row.kind === "duplicidade" ? "Possível duplicidade" : "Falha de execução"}</Badge>
                    <strong>{row.title}</strong>
                    <span className="text-xs text-muted-foreground">Workspace: {row.workspaceName}</span>
                    {row.customerName && <span className="text-xs text-muted-foreground">Lead: {row.customerName}</span>}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{row.description}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{formatDate(row.createdAt)}</p>
                </div>
              ))}
            </div>
            <PaginationControls pagination={data.executionPagination} onPageChange={setExecutionPage} />
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | null; icon: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card/50 p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span>{icon}</div><div className="mt-2 text-2xl font-black tabular-nums">{value === null ? "—" : value}</div></div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="overflow-x-auto rounded-2xl border border-border bg-card/50 p-5"><h3 className="font-bold">{title}</h3><p className="mb-4 mt-1 text-xs text-muted-foreground">{subtitle}</p>{children}</section>;
}

function PaginationControls({ pagination, onPageChange }: { pagination: Pagination; onPageChange: (page: number) => void }) {
  const first = pagination.total === 0 ? 0 : pagination.page * pagination.pageSize + 1;
  const last = Math.min(pagination.total, (pagination.page + 1) * pagination.pageSize);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
      <span>{first}–{last} de {pagination.total}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={!pagination.hasPrevious} onClick={() => onPageChange(Math.max(0, pagination.page - 1))}>Anterior</Button>
        <span>Página {Math.min(pagination.page + 1, pagination.totalPages)} de {pagination.totalPages}</span>
        <Button size="sm" variant="outline" disabled={!pagination.hasNext} onClick={() => onPageChange(pagination.page + 1)}>Próxima</Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const error = ["error", "failed", "falha"].includes(normalized);
  const success = ["completed", "finished", "success", "sucesso"].includes(normalized);
  return <Badge variant={error ? "destructive" : success ? "outline" : "secondary"}>{status}</Badge>;
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "—";
}
