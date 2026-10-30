import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3, Loader2, PauseCircle, Target, XCircle, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAutomationOperationalReport } from "@/lib/meta-automation-operational-report.functions";

type Rule = {
  id: string;
  name: string;
  scan_interval_minutes: number | null;
  cooldown_minutes: number;
  last_run_at: string | null;
  enabled: boolean;
};

function dt(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Não registrado";
}

function opLabel(op: string) {
  return ({ gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" } as Record<string, string>)[op] ?? op;
}

function outcomeLabel(outcome: string) {
  if (outcome === "executed") return "Executada";
  if (outcome === "ignored") return "Ignorada";
  if (outcome === "failed") return "Falhou";
  if (outcome === "unverified") return "Entrega não comprovada";
  return "Não alcançada";
}

export function MetaRuleStatsDialog({
  open, onOpenChange, workspaceId, rule,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  rule: Rule | null;
}) {
  const reportFn = useServerFn(getAutomationOperationalReport);
  const q = useQuery({
    queryKey: ["automation-operational-report", workspaceId, rule?.id],
    queryFn: () => reportFn({ data: { workspaceId, ruleId: rule!.id, days: 30 } }),
    enabled: open && !!rule,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Relatório operacional {rule ? `- ${rule.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        {!rule ? null : q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando relatório…
          </div>
        ) : q.error ? (
          <div className="py-6 text-center text-sm text-destructive">Falha ao carregar: {(q.error as Error).message}</div>
        ) : q.data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Kpi icon={Activity} label="Leituras" value={q.data.summary.reads} />
              <Kpi icon={CheckCircle2} label="Gatilhos" value={q.data.summary.matched} tone="success" />
              <Kpi icon={Zap} label="Executadas" value={q.data.summary.executed} tone="primary" />
              <Kpi icon={PauseCircle} label="Ignoradas" value={q.data.summary.ignoredActions} />
              <Kpi icon={AlertTriangle} label="Falhas" value={q.data.summary.failures} tone="destructive" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <TimeCard icon={Clock3} label="Última leitura" value={dt(q.data.summary.lastReadAt)} />
              <TimeCard icon={Zap} label="Última ação executada" value={dt(q.data.summary.lastExecutedAt)} />
              <TimeCard icon={XCircle} label="Última falha" value={dt(q.data.summary.lastFailureAt)} />
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Configuração observada</div>
                  <div className="text-xs text-muted-foreground">
                    {q.data.rule.enabled ? "Automação ativa" : "Automação pausada"} · leitura a cada {q.data.rule.scanIntervalMinutes} min · cooldown {q.data.rule.cooldownMinutes} min
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground text-right">
                  Último ciclo do scheduler: {dt(q.data.rule.lastSchedulerRunAt)}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="text-xs font-semibold mb-2">Condições configuradas ({q.data.configured.conditionLogic === "or" ? "OU" : "E"})</div>
                  <div className="space-y-1.5">
                    {q.data.configured.conditions.map((condition, index) => (
                      <div key={`${condition.metric}-${index}`} className="text-xs">
                        <span className="font-medium">{condition.metric}</span> {opLabel(condition.operator)} {condition.value}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="text-xs font-semibold mb-2">Ações configuradas</div>
                  <div className="space-y-1.5">
                    {q.data.configured.actions.map((action, index) => (
                      <div key={`${action.type}-${index}`} className="text-xs">
                        <span className="font-medium">{action.type}</span>
                        {action.conditions?.length ? <span className="text-muted-foreground"> · possui condição própria</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Última ativação:</span> {q.data.rule.activationTimestamp ? dt(q.data.rule.activationTimestamp) : "não disponível"}. {q.data.rule.activationTimestampNote}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold mb-3">Leitura → decisão → execução</div>
              {q.data.recent.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">Nenhuma leitura registrada nos últimos 30 dias.</div>
              ) : (
                <div className="space-y-3">
                  {q.data.recent.map((run) => (
                    <div key={run.id} className="rounded-lg border border-border p-3 space-y-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {run.decision.semantic.failed ? <XCircle className="w-4 h-4 text-destructive" />
                            : run.decision.semantic.executed ? <CheckCircle2 className="w-4 h-4 text-success" />
                            : <PauseCircle className="w-4 h-4 text-muted-foreground" />}
                          <div>
                            <div className="text-xs font-semibold">{run.decision.semantic.label}</div>
                            <div className="text-[11px] text-muted-foreground">{dt(run.readAt)}</div>
                          </div>
                        </div>
                        <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Target className="w-3 h-3" /> {run.target.level}: {run.target.id ?? "não identificado"}
                        </div>
                      </div>

                      <div className="grid md:grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded-md bg-muted/30 p-2">
                          <div className="font-semibold mb-1">Leitura</div>
                          <div>Janela: {run.trigger.window}</div>
                          {run.trigger.conditions.map((condition, index) => (
                            <div key={`${condition.metric}-${index}`} className="mt-1">
                              {condition.metric} {opLabel(condition.operator)} {condition.value} · atual: {condition.actualRecorded ? Number(condition.actual).toFixed(2) : "não registrado"}
                              {condition.note ? <div className="text-muted-foreground">{condition.note}</div> : null}
                            </div>
                          ))}
                        </div>

                        <div className="rounded-md bg-muted/30 p-2">
                          <div className="font-semibold mb-1">Decisão</div>
                          <div>{run.decision.matched ? "Condição geral atingida" : "Condição geral não atingida"}</div>
                          <div className="text-muted-foreground mt-1">{run.decision.reason}</div>
                        </div>

                        <div className="rounded-md bg-muted/30 p-2">
                          <div className="font-semibold mb-1">Ações</div>
                          {run.actions.length ? run.actions.map((action, index) => (
                            <div key={`${action.type}-${index}`} className="mt-1">
                              {action.type}: <span className="font-medium">{outcomeLabel(action.outcome)}</span>
                              {action.evidence ? <div className="text-muted-foreground break-words">{action.evidence}</div> : null}
                            </div>
                          )) : <div>Nenhuma ação configurada.</div>}
                        </div>
                      </div>

                      {run.structuredError ? (
                        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[11px]">
                          <span className="font-semibold">Erro estruturado:</span> {run.structuredError.code} · {run.structuredError.message}
                        </div>
                      ) : null}

                      {run.legacyEvidence ? (
                        <div className="text-[10px] text-muted-foreground">
                          Histórico legado: o relatório mostra apenas evidências realmente persistidas; valores ausentes não são inferidos.
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ icon: Icon, label, value, tone = "default" }: {
  icon: typeof Activity;
  label: string;
  value: number;
  tone?: "default" | "primary" | "success" | "destructive";
}) {
  const toneCls = tone === "primary" ? "text-primary"
    : tone === "success" ? "text-success"
    : tone === "destructive" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function TimeCard({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="mt-1 text-xs font-medium">{value}</div>
    </div>
  );
}
