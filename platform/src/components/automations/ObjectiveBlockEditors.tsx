import { Plus, Trash2, Radar, Filter, Zap, ExternalLink, Loader2, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AgentOutcomeEditor, type AgentOutcomeStep } from "./AgentOutcomeEditor";
import type { ObjectiveConditionRow, ObjectiveNode, ObjectiveTracking } from "./ObjectiveTree";
import { listObjectiveTrackingOptions } from "@/lib/objective-tracking.functions";
import type { ObjectiveTrackingOption } from "@/lib/objective-tracking.server";
import { CustomFieldSelect, CustomFieldValueInput } from "./CustomFieldPicker";

const rid = () => Math.random().toString(36).slice(2, 9);

const CONDITION_FIELDS: Array<{ id: string; label: string }> = [
  { id: "mensagem", label: "Mensagem do cliente" },
  { id: "tag", label: "Tag do lead" },
  { id: "etapa", label: "Etapa do funil" },
  { id: "campo", label: "Campo personalizado" },
  { id: "interacoes", label: "Nº de interações" },
  { id: "minutos", label: "Minutos sem resposta" },
  { id: "tracking", label: "Evento de tracking" },
  { id: "objetivo", label: "Objetivo anterior cumprido" },
  { id: "trafego-investimento", label: "Tráfego: investimento no período" },
  { id: "trafego-leads", label: "Tráfego: leads no período" },
  { id: "trafego-cpl", label: "Tráfego: CPL" },
  { id: "trafego-roas", label: "Tráfego: ROAS" },
  { id: "social-agendados", label: "Social: posts agendados" },
  { id: "social-publicados", label: "Social: posts publicados" },
  { id: "workflow-tarefas-abertas", label: "Workflow: tarefas abertas" },
];


const CONDITION_OPS: Array<{ id: string; label: string }> = [
  { id: "contem", label: "contém" },
  { id: "igual", label: "é igual a" },
  { id: "diferente", label: "é diferente de" },
  { id: "maior", label: "é maior que" },
  { id: "menor", label: "é menor que" },
  { id: "existe", label: "existe" },
  { id: "existe", label: "existe" },
  { id: "vazio", label: "está vazio" },
];

function BlockHeader({
  icon,
  title,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone: "amber" | "violet" | "sky";
}) {
  const cls =
    tone === "amber"
      ? "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400"
      : tone === "violet"
        ? "border-violet-500/30 bg-violet-500/5 text-violet-600 dark:text-violet-400"
        : "border-sky-500/30 bg-sky-500/5 text-sky-600 dark:text-sky-400";
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
        {icon}
        {title}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{subtitle}</p>
    </div>
  );
}

/** Bloco de AÇÃO: só executa coisas no CRM, sem falar com o lead. */
export function ActionBlockEditor({
  node,
  onPatch,
  scope,
}: {
  node: ObjectiveNode;
  onPatch: (patch: Partial<ObjectiveNode>) => void;
  scope: "individual" | "grupo";
}) {
  return (
    <div className="space-y-3">
      <BlockHeader
        tone="amber"
        icon={<Zap className="w-3.5 h-3.5" />}
        title="Bloco de ação"
        subtitle="Executa ações no CRM automaticamente quando o fluxo passa por aqui (mover etapa, aplicar tag, criar tarefa, transferir…). O agente não fala nada neste bloco."
      />
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Nome do bloco
        </label>
        <button
          onClick={() => onPatch({ id: "REMOVED" })}
          className="p-1 hover:bg-destructive/10 text-destructive rounded-md transition-colors"
          title="Remover bloco"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        value={node.say}
        onChange={(e) => onPatch({ say: e.target.value })}
        placeholder="Ex: Marcar lead como cadastrado"
        className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-amber-500/30 outline-none"
      />

      <div className="h-px bg-border/50 my-2" />

      <AgentOutcomeEditor
        value={node.actions || []}
        onChange={(steps) => onPatch({ actions: steps })}
        scope={scope}
        title="Ações do Sistema"
        subtitle="O que o MKTOn faz ao processar este bloco (etapa, tag, bot, tarefa)."
      />
    </div>
  );
}

/** Bloco de CONDIÇÃO: divide o fluxo em caminho "então" e caminho "senão". */
export function ConditionBlockEditor({
  node,
  onPatch,
}: {
  node: ObjectiveNode;
  onPatch: (patch: Partial<ObjectiveNode>) => void;
}) {
  const rows = node.conditions ?? [];
  const logic = node.conditionLogic ?? "e";
  const patchRow = (i: number, patch: Partial<ObjectiveConditionRow>) =>
    onPatch({ conditions: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-3">
      <BlockHeader
        tone="violet"
        icon={<Filter className="w-3.5 h-3.5" />}
        title="Bloco de condição"
        subtitle="Se as condições baterem, o fluxo segue pelo 1º cabo (então). Se não baterem, segue pelo 2º cabo (senão). Ligue os dois cabos nos blocos que quiser."
      />
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Nome do bloco
        </label>
        <button
          onClick={() => onPatch({ id: "REMOVED" })}
          className="p-1 hover:bg-destructive/10 text-destructive rounded-md transition-colors"
          title="Remover bloco"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        value={node.say}
        onChange={(e) => onPatch({ say: e.target.value })}
        placeholder="Ex: Já é cliente?"
        className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs"
      />


      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Combinar com</span>
        {(["e", "ou"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onPatch({ conditionLogic: l })}
            className={`text-[11px] px-2 py-1 rounded border transition ${
              logic === l ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {l === "e" ? "TODAS (E)" : "QUALQUER (OU)"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="border border-border rounded-md p-2 space-y-1.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <select
                value={r.field}
                onChange={(e) => patchRow(i, { field: e.target.value })}
                className="flex-1 min-w-0 bg-background border border-border rounded px-1.5 py-1 text-[11px]"
              >
                {CONDITION_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onPatch({ conditions: rows.filter((_, j) => j !== i) })}
                className="shrink-0 text-destructive hover:bg-destructive/10 rounded p-1"
                aria-label="Remover condição"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {r.field === "campo" && (
              <CustomFieldSelect
                value={r.fieldId}
                onChange={(id) => patchRow(i, { fieldId: id })}
              />
            )}
            <div className="flex items-center gap-1.5 min-w-0">
              <select
                value={r.op}
                onChange={(e) => patchRow(i, { op: e.target.value })}
                className="w-28 shrink-0 bg-background border border-border rounded px-1.5 py-1 text-[11px]"
              >
                {CONDITION_OPS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {r.field === "campo" ? (
                <div className="flex-1 min-w-0">
                  <CustomFieldValueInput
                    fieldId={r.fieldId}
                    value={r.value}
                    onChange={(v) => patchRow(i, { value: v })}
                  />
                </div>
              ) : (
                <input
                  value={r.value ?? ""}
                  onChange={(e) => patchRow(i, { value: e.target.value })}
                  placeholder="valor (use / para variações)"
                  className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-[11px]"
                />
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onPatch({ conditions: [...rows, { id: rid(), field: "mensagem", op: "contem", value: "" }] })
          }
          className="w-full text-[11px] inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded border border-dashed border-primary/40 text-primary hover:bg-primary/10"
        >
          <Plus className="w-3 h-3" /> Adicionar condição
        </button>
      </div>

      <div className="h-px bg-border/50 my-2" />

      <AgentOutcomeEditor
        value={node.actions || []}
        onChange={(steps) => onPatch({ actions: steps })}
        scope="individual"
        title="Ações se a condição bater"
        subtitle="O que o MKTOn faz se todas as condições acima forem atendidas (caminho Então)."
      />
    </div>
  );
}

/** Bloco de TRACKING: fica lendo o módulo de tracking até o evento acontecer. */
export function TrackingBlockEditor({
  node,
  onPatch,
  scope,
  workspaceId,
}: {
  node: ObjectiveNode;
  onPatch: (patch: Partial<ObjectiveNode>) => void;
  scope: "individual" | "grupo";
  workspaceId: string | null;
}) {
  const listOptions = useServerFn(listObjectiveTrackingOptions);
  const optionsQ = useQuery({
    queryKey: ["objective-tracking-options", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => listOptions({ data: { workspaceId: workspaceId as string } }) as Promise<ObjectiveTrackingOption[]>,
    staleTime: 30_000,
  });
  const sites = optionsQ.data ?? [];
  const t: ObjectiveTracking = node.tracking ?? { event: "" };
  const patchT = (patch: Partial<ObjectiveTracking>) => onPatch({ tracking: { ...t, ...patch } });
  const selectedSite = sites.find((site) => site.siteId === t.siteId);

  return (
    <div className="space-y-3">
      <BlockHeader
        tone="sky"
        icon={<Radar className="w-3.5 h-3.5" />}
        title="Bloco de Tracking (UTMs e Conversão)"
        subtitle="Consulta UTMS e eventos (Pixel, CRM, CAPI) para direcionar melhor o atendimento. Valida se o evento ocorreu para seguir o fluxo."
      />

      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Nome do bloco
        </label>
        <button
          onClick={() => onPatch({ id: "REMOVED" })}
          className="p-1 hover:bg-destructive/10 text-destructive rounded-md transition-colors"
          title="Remover bloco"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        value={node.say}
        onChange={(e) => onPatch({ say: e.target.value })}
        placeholder="Ex: Confirmar cadastro do lead"
        className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs"
      />


      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Origem do Tracking
        </label>
        {optionsQ.isLoading ? (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando opções do módulo…</div>
        ) : sites.length === 0 ? (
          <div className="mt-1 rounded border border-dashed border-border p-2 text-[11px] text-muted-foreground">
            Nenhum site ou conta conectada ao módulo de Tracking. Configure suas integrações primeiro.
          </div>

        ) : (
          <select
            value={t.siteId ?? ""}
            onChange={(e) => patchT({ siteId: e.target.value, event: "" })}
            className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs"
          >
            <option value="">Selecione o site</option>
            {sites.map((site) => (
              <option key={site.siteId} value={site.siteId}>
                {site.siteName} · {site.domain}{site.verified ? " · conectado" : " · aguardando validação"}
              </option>
            ))}
          </select>
        )}
        {selectedSite && (
          <p className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
            <ExternalLink className="h-3 w-3" /> Origem: {selectedSite.domain} · último sinal {selectedSite.lastEventAt ? new Date(selectedSite.lastEventAt).toLocaleString("pt-BR") : "ainda não recebido"}
          </p>
        )}
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Evento real a confirmar
        </label>
        <div className="space-y-2">
          <select
            value={t.event}
            onChange={(e) => patchT({ event: e.target.value })}
            disabled={!selectedSite}
            className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs"
          >
            <option value="">Selecione um evento recebido</option>
            <optgroup label="Sugestões comuns">
              <option value="Lead">Lead (Cadastro)</option>
              <option value="Purchase">Purchase (Compra)</option>
              <option value="PageView">PageView (Visualização)</option>
            </optgroup>
            {selectedSite && selectedSite.events.length > 0 && (
              <optgroup label="Eventos detectados no site">
                {selectedSite.events.map((event) => (
                  <option key={event.name} value={event.name}>
                    {event.label} · {event.name}{event.source === "received" ? " · recebido" : " · regra configurada"}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {!t.event && (
            <input
              value={t.event}
              onChange={(e) => patchT({ event: e.target.value })}
              placeholder="Ou digite o nome do evento manualmente"
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
            />
          )}
        </div>
        {selectedSite && selectedSite.events.length === 0 && (
          <p className="mt-1 text-[9px] text-muted-foreground">Este site ainda não enviou eventos automáticos, mas você pode usar as sugestões acima ou digitar manualmente.</p>
        )}
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filtrar por página (opcional)
        </label>
        <input
          value={t.match ?? ""}
          onChange={(e) => patchT({ match: e.target.value })}
          placeholder="Ex: /obrigado — só vale se a URL contiver isso"
          className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pausa Inicial (min)
          </label>
          <input
            type="number"
            min={0}
            value={t.initialDelayMinutes ?? 0}
            onChange={(e) => patchT({ initialDelayMinutes: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
            placeholder="Opcional"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3" /> Frequência
          </label>
          <select
            value={t.everyMinutes ?? 5}
            onChange={(e) => patchT({ everyMinutes: Number(e.target.value) })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
          >
            <option value={1}>A cada 1 min</option>
            <option value={5}>A cada 5 min</option>
            <option value={15}>A cada 15 min</option>
            <option value={30}>A cada 30 min</option>
            <option value={60}>A cada 1 hora</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Radar className="w-3 h-3" /> Tentativas
          </label>
          <input
            type="number"
            min={0}
            max={20}
            value={t.retryAttempts ?? 3}
            onChange={(e) => patchT({ retryAttempts: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Filter className="w-3 h-3" /> Prazo (min)
          </label>
          <input
            type="number"
            min={0}
            value={t.forMinutes ?? 1440}
            onChange={(e) => patchT({ forMinutes: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
          />
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground leading-tight italic">
        {t.initialDelayMinutes ? `Aguardará ${t.initialDelayMinutes} min antes de começar. ` : ""}
        O sistema lerá os dados a cada {t.everyMinutes} min. Se não encontrar, tentará mais {t.retryAttempts ?? 3} vezes.
      </p>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mensagem ao confirmar (opcional)
        </label>
        <textarea
          value={t.onFoundMessage ?? ""}
          onChange={(e) => patchT({ onFoundMessage: e.target.value })}
          rows={2}
          placeholder="Ex: Vi aqui que seu cadastro foi concluído, perfeito! Vamos pro próximo passo…"
          className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs"
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Se o prazo estourar sem o evento
        </label>
        <p className="text-[9px] text-muted-foreground mb-1.5 leading-tight">
          O 1º cabo de saída é o caminho de <b>sucesso</b>. Puxe um 2º cabo para o caminho de <b>falha/timeout</b>.
        </p>
        <select
          value={t.onTimeout ?? "ficar"}
          onChange={(e) => patchT({ onTimeout: e.target.value as ObjectiveTracking["onTimeout"] })}
          className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-sky-500/30"
        >
          <option value="ficar">Continuar conversando (aguardar)</option>
          <option value="proximo">Seguir pelo cabo de sucesso mesmo assim</option>
          <option value="encerrar">Encerrar o agente</option>
        </select>
      </div>

      <AgentOutcomeEditor
        value={(node.actions ?? []) as AgentOutcomeStep[]}
        onChange={(steps) => onPatch({ actions: steps })}
        scope={scope}
        title="Ações quando a leitura confirmar"
        subtitle="Ex: mover pra etapa 'Cadastrado', aplicar tag, criar tarefa pro vendedor."
      />
    </div>
  );
}
