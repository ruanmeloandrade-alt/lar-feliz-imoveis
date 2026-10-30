import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listSlimCopilotProposals,
  decideSlimCopilotProposal,
} from "@/lib/slim-copilot-approval.functions";
import type { SlimCopilotProposal } from "@/lib/slim-copilot-contract.core";
import {
  createSlimCopilotUi,
  slimCopilotCanDecide,
  slimCopilotNeedsAttention,
  slimCopilotStatusLabels,
  type SlimCopilotUiState,
} from "@/lib/slim-copilot-ui.core";

type CardProps = {
  proposal: SlimCopilotProposal;
  state: SlimCopilotUiState;
  onDecision: (id: string, version: string, decision: "approve" | "reject") => void;
  onCheck: () => void;
};

export function SlimCopilotProposalCard({ proposal, state, onDecision, onCheck }: CardProps) {
  const { preview } = proposal;
  const unconfirmed = Boolean(state.unconfirmed[proposal.id]);
  const busy = state.busy[proposal.id];
  const expired = proposal.status === "pending" && Date.parse(proposal.expiresAt) <= Date.now();
  const canDecide = slimCopilotCanDecide(proposal, state);
  const status = busy
    ? (busy === "reject" ? "🟡 Registrando sua rejeição" : "🟡 Confirmando a execução")
    : unconfirmed ? "🟡 Decisão ainda não confirmada"
      : expired ? slimCopilotStatusLabels.expired : slimCopilotStatusLabels[proposal.status];

  return (
    <article className="rounded-lg border border-border bg-card p-3 text-xs" aria-label={preview.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground">{preview.title}</h4>
        <span className="text-[10px] font-medium text-muted-foreground" role="status">{status}</span>
      </div>
      <p className="mt-2 break-words text-foreground"><span className="font-medium">Alvo: </span>{preview.targetLabel}</p>
      {preview.changes.length > 0 && (
        <dl className="mt-2 space-y-2">
          {preview.changes.map((change, index) => (
            <div key={index} className="rounded-md bg-muted/40 px-2 py-1.5">
              <dt className="font-medium">{change.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
                {change.before !== undefined && <span className="block">Atual: {change.before || "(vazio)"}</span>}
                <span className="block text-foreground">Proposto: {change.after || "(vazio)"}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {preview.channel && <p className="mt-2 break-words"><span className="font-medium">Canal: </span>{preview.channel}</p>}
      {preview.content !== undefined && (
        <div className="mt-2">
          <p className="font-medium">Conteúdo que será enviado</p>
          <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2">{preview.content}</p>
        </div>
      )}
      {preview.effects.length > 0 && (
        <div className="mt-2">
          <p className="font-medium">Efeitos desta ação</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
            {preview.effects.map((effect, index) => <li className="whitespace-pre-wrap break-words" key={index}>{effect}</li>)}
          </ul>
        </div>
      )}
      {preview.cost && <p className="mt-2 whitespace-pre-wrap break-words"><span className="font-medium">Custos: </span>{preview.cost}</p>}
      {proposal.result && (
        <div className="mt-3 rounded-md bg-muted/40 p-2">
          <p className="whitespace-pre-wrap break-words">{proposal.result.summary}</p>
          {proposal.result.receiptId && <p className="mt-1 break-all text-[10px] text-muted-foreground">Protocolo: {proposal.result.receiptId}</p>}
          {proposal.result.historyPending && <p className="mt-2 font-medium text-amber-700 dark:text-amber-300">O histórico ainda está pendente. Confira a conversa antes de solicitar outro envio.</p>}
        </div>
      )}
      {unconfirmed && (
        <p className="mt-3 font-medium text-amber-700 dark:text-amber-300" role="alert">
          A resposta da sua decisão não foi confirmada. Confira o resultado da mesma proposta antes de decidir novamente.
        </p>
      )}
      {proposal.status === "uncertain" && !unconfirmed && (
        <p className="mt-3 text-amber-700 dark:text-amber-300">A proposta não será executada novamente. Confira o resultado e a conversa para saber o que foi confirmado.</p>
      )}
      {(proposal.status === "stale" || proposal.status === "expired" || expired) && (
        <p className="mt-3 text-muted-foreground">Peça ao Copiloto uma nova proposta e confira os dados atualizados antes de aprovar.</p>
      )}
      {proposal.status === "pending" && !expired && !unconfirmed && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!canDecide}
            onClick={() => onDecision(proposal.id, proposal.version, "approve")}
            className="min-h-9 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            Aprovar e executar
          </button>
          <button type="button" disabled={!canDecide}
            onClick={() => onDecision(proposal.id, proposal.version, "reject")}
            className="min-h-9 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
            Rejeitar
          </button>
        </div>
      )}
      {(unconfirmed || proposal.status === "executing" || proposal.status === "uncertain") && (
        <button type="button" onClick={onCheck} disabled={state.reading || Object.keys(state.busy).length > 0}
          className="mt-3 min-h-9 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50">
          {state.reading ? "Conferindo..." : "Conferir resultado"}
        </button>
      )}
    </article>
  );
}

/** Durable proposals are loaded independently of the model's text or tool parts. */
export function SlimCopilotProposals({ workspaceId, actorId, chatStatus }: {
  workspaceId: string; actorId: string; chatStatus: string;
}) {
  const listFn = useServerFn(listSlimCopilotProposals);
  const decideFn = useServerFn(decideSlimCopilotProposal);
  const functionsRef = useRef({ listFn, decideFn });
  functionsRef.current = { listFn, decideFn };
  const [controller] = useState(() => createSlimCopilotUi({ workspaceId, actorId }, {
    list: data => functionsRef.current.listFn({ data }),
    decide: data => functionsRef.current.decideFn({ data }),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");

  useEffect(() => {
    controller.activate();
    void controller.refresh();
    return () => controller.deactivate();
  }, [controller]);

  useEffect(() => {
    const onVisibility = () => {
      const next = document.visibilityState === "visible";
      setVisible(next);
      if (next) void controller.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [controller]);

  useEffect(() => {
    if (visible && chatStatus !== "submitted" && chatStatus !== "streaming") {
      void controller.refresh();
    }
  }, [chatStatus, visible, controller]);

  const executing = state.proposals.some(proposal => proposal.status === "executing");
  useEffect(() => {
    if (!visible || !executing) return;
    const timer = window.setInterval(() => { void controller.refresh(); }, 3000);
    return () => window.clearInterval(timer);
  }, [controller, executing, visible]);

  const attention = state.proposals.filter(proposal => slimCopilotNeedsAttention(proposal, state));
  const history = state.proposals.filter(proposal => !slimCopilotNeedsAttention(proposal, state));
  const check = () => { void controller.refresh(); };
  const decide = (id: string, version: string, decision: "approve" | "reject") => {
    void controller.decide(id, version, decision);
  };
  const card = (proposal: SlimCopilotProposal) => (
    <SlimCopilotProposalCard key={proposal.id} proposal={proposal} state={state} onDecision={decide} onCheck={check} />
  );

  return (
    <section aria-label="Ações propostas pelo Copiloto" className="my-3 space-y-3 rounded-xl border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">Ações do Copiloto</h3>
        <button type="button" onClick={check} disabled={state.reading || Object.keys(state.busy).length > 0}
          className="min-h-8 rounded-md border border-border px-2 py-1 text-[10px] font-medium hover:bg-muted disabled:opacity-50">
          {state.reading ? "Conferindo..." : "Conferir resultados"}
        </button>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">Confira cada proposta. Uma ação só é executada depois de você aprovar o cartão.</p>
      {state.readError && <p className="text-xs text-destructive" role="alert">{state.readError}</p>}
      {!state.loaded && !state.readError && <p className="text-xs text-muted-foreground" role="status">Carregando propostas e resultados...</p>}
      {state.loaded && state.proposals.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma proposta registrada para você nesta empresa.</p>}
      {attention.map(card)}
      {history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer py-1 font-medium">Histórico de ações ({history.length})</summary>
          <div className="mt-2 space-y-3">{history.map(card)}</div>
        </details>
      )}
    </section>
  );
}
