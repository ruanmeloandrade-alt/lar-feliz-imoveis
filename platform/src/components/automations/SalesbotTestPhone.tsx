// Simulador interativo do Salesbot ("Testar bot").
// Executa o grafo de blocos do bot ativo direto no browser, imitando o
// comportamento do runtime real (evalCondition / runValidation, avanço
// via nextBlockId / falseNextBlockId / roleta[].nextBlockId). Não faz
// chamadas de servidor, o objetivo é permitir ao usuário validar o
// fluxo que ele acabou de montar. Erros de programação (bloco sem
// próximo, tipo não implementado, config faltando) aparecem como
// mensagens de erro dentro do próprio chat de teste.

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, X, Send, MessageCircle } from "lucide-react";
import type { Block, Condicao, Salesbot, ValidacaoTipo } from "@/lib/salesbot-types";
import { matchPlainSalesbotRule } from "@/lib/salesbot-text-rules";

type ChatMsg = {
  id: string;
  from: "bot" | "user" | "system" | "error";
  text: string;
  buttons?: { id: string; label: string; optionId?: string }[];
  media?: { kind: string; filename: string }[];
};

type Awaiting = null | { kind: "text" } | { kind: "buttons"; blockId: string } | { kind: "timer" };

type PendingTimer = { untilMs: number; totalMs: number; next: string | null; label: string };

const CRONO_UNIT_MS: Record<string, number> = {
  seg: 1000,
  min: 60_000,
  horas: 3_600_000,
  dias: 86_400_000,
  semanas: 7 * 86_400_000,
  meses: 30 * 86_400_000,
  anos: 365 * 86_400_000,
};

/** Mesma conta do runtime real (mês=30d, ano=365d). */
function cronometroMs(p: Record<string, unknown>): number {
  let total = 0;
  for (const [k, mult] of Object.entries(CRONO_UNIT_MS)) {
    const v = Number(p[k] ?? 0);
    if (Number.isFinite(v) && v > 0) total += v * mult;
  }
  return total;
}

function formatDuracao(ms: number): string {
  if (ms <= 0) return "0s";
  const parts: string[] = [];
  let rest = ms;
  const units: Array<[string, number]> = [
    ["a", CRONO_UNIT_MS.anos], ["mês", CRONO_UNIT_MS.meses], ["sem", CRONO_UNIT_MS.semanas],
    ["d", CRONO_UNIT_MS.dias], ["h", CRONO_UNIT_MS.horas], ["min", CRONO_UNIT_MS.min], ["s", CRONO_UNIT_MS.seg],
  ];
  for (const [label, mult] of units) {
    const q = Math.floor(rest / mult);
    if (q > 0) { parts.push(`${q}${label}`); rest -= q * mult; }
    if (parts.length === 2) break;
  }
  return parts.join(" ") || "0s";
}

interface Props {
  open: boolean;
  onClose: () => void;
  bot: Salesbot | null;
}

const MAX_STEPS = 200; // fusível anti-loop dentro de um mesmo tick

export function SalesbotTestPhone({ open, onClose, bot }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState<Awaiting>(null);
  const [ended, setEnded] = useState(false);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const lastUserMsg = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const rrCounters = useRef<Map<string, number>>(new Map());
  const [pendingTimer, setPendingTimer] = useState<PendingTimer | null>(null);
  const [, setTick] = useState(0);

  const blocksById = useMemo(() => {
    const m = new Map<string, Block>();
    if (bot) for (const b of bot.blocks) m.set(b.id, b);
    return m;
  }, [bot]);

  // Relógio do cronômetro: conta o tempo real e libera o fluxo ao vencer.
  useEffect(() => {
    if (!pendingTimer) return;
    const id = window.setInterval(() => {
      if (Date.now() >= pendingTimer.untilMs) {
        window.clearInterval(id);
        finishTimer(pendingTimer, "concluído");
      } else {
        setTick((t) => t + 1);
      }
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTimer]);

  function finishTimer(t: PendingTimer, motivo: "concluído" | "pulado") {
    setPendingTimer(null);
    setAwaiting(null);
    pushMsg({
      from: "system",
      text: motivo === "pulado"
        ? `Espera de ${formatDuracao(t.totalMs)} pulada no teste — na conversa real o bot espera o tempo todo.`
        : `Cronômetro de ${formatDuracao(t.totalMs)} concluído. Seguindo o fluxo.`,
    });
    if (t.next) runFrom(t.next);
    else { setEnded(true); setCurrentBlockId(null); }
  }

  useEffect(() => {
    if (!open) {
      // reset ao fechar
      setStarted(false);
      setMessages([]);
      setCurrentBlockId(null);
      setAwaiting(null);
      setPendingTimer(null);
      setEnded(false);
      setInput("");
      lastUserMsg.current = "";
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [messages]);

  function pushMsg(m: Omit<ChatMsg, "id">) {
    setMessages((prev) => [...prev, { ...m, id: `m-${prev.length}-${Math.random().toString(36).slice(2, 6)}` }]);
  }

  function fail(text: string) {
    pushMsg({ from: "error", text });
    setEnded(true);
    setAwaiting(null);
    setCurrentBlockId(null);
  }

  function start() {
    setStarted(true);
    setMessages([]);
    setEnded(false);
    setAwaiting(null);
    lastUserMsg.current = "";
    if (!bot) {
      fail("Nenhum bot selecionado.");
      return;
    }
    if (!bot.startBlockId) {
      fail("Este bot não tem um bloco inicial conectado ao Start.");
      return;
    }
    if (!blocksById.get(bot.startBlockId)) {
      fail(`Bloco inicial (${bot.startBlockId}) não existe mais no fluxo.`);
      return;
    }
    runFrom(bot.startBlockId);
  }

  function reset() {
    setStarted(false);
    setMessages([]);
    setEnded(false);
    setAwaiting(null);
    setPendingTimer(null);
    setCurrentBlockId(null);
    lastUserMsg.current = "";
  }

  /** Loop de execução, avança de bloco em bloco até parar em input do
   * usuário, encerrar, ou dar erro. */
  function runFrom(startId: string) {
    let steps = 0;
    let cursor: string | null = startId;
    while (cursor && steps < MAX_STEPS) {
      steps++;
      const b = blocksById.get(cursor);
      if (!b) {
        fail(`Bloco "${cursor}" não encontrado (fluxo quebrado).`);
        return;
      }
      const outcome = handleBlock(b);
      if (outcome.kind === "wait") {
        setCurrentBlockId(b.id);
        setAwaiting(outcome.awaiting);
        return;
      }
      if (outcome.kind === "delay") {
        setCurrentBlockId(b.id);
        setAwaiting({ kind: "timer" });
        setPendingTimer({
          untilMs: Date.now() + outcome.ms,
          totalMs: outcome.ms,
          next: outcome.next,
          label: outcome.label,
        });
        return;
      }
      if (outcome.kind === "end") {
        setCurrentBlockId(null);
        setAwaiting(null);
        setEnded(true);
        return;
      }
      if (outcome.kind === "error") {
        fail(outcome.message);
        return;
      }
      cursor = outcome.next;
    }
    if (steps >= MAX_STEPS) {
      fail("Loop detectado: mais de " + MAX_STEPS + " blocos em sequência sem parar.");
    }
  }

  type Outcome =
    | { kind: "advance"; next: string | null }
    | { kind: "wait"; awaiting: Awaiting }
    | { kind: "delay"; ms: number; next: string | null; label: string }
    | { kind: "end" }
    | { kind: "error"; message: string };

  function handleBlock(b: Block): Outcome {
    const nextId = b.nextBlockId ?? null;
    switch (b.kind) {
      case "enviar-mensagem": {
        const texto = (b.texto ?? "").trim();
        const media = (b.mediaItems ?? []).map((m) => ({ kind: m.kind, filename: m.filename }));
        const useBtn = b.useBotoes && (b.botoes?.length ?? 0) > 0;
        const buttons = useBtn ? b.botoes!.map((btn) => ({ id: btn.id, label: btn.label })) : undefined;
        if (!texto && media.length === 0 && !useBtn) {
          return { kind: "error", message: "Bloco 'Enviar mensagem' sem texto, mídia nem botões." };
        }
        pushMsg({ from: "bot", text: texto || "(sem texto)", buttons, media: media.length ? media : undefined });
        // Botões aqui são quick-replies: não têm rota própria, apenas
        // aguardam clique do usuário; o fluxo segue por nextBlockId.
        if (useBtn) {
          return { kind: "wait", awaiting: { kind: "buttons", blockId: b.id } };
        }
        // Sem botões, se existe nextBlockId, avança; senão espera texto
        // (comportamento do runtime: o bot fica aguardando resposta).
        if (nextId) return { kind: "advance", next: nextId };
        return { kind: "wait", awaiting: { kind: "text" } };
      }

      case "reacao": {
        const emoji = String(b.texto ?? "").trim();
        pushMsg({ from: "system", text: emoji
          ? `Bot reagiria com ${emoji} na última mensagem do lead (só WhatsApp Web).`
          : "Bloco de reação sem emoji definido — escolha um emoji no bloco." });
        return { kind: "advance", next: nextId };
      }


      case "comentario": {
        const opts = b.comentarios ?? [];
        const label = opts.length
          ? `Bot responderia o comentário: "${opts[0]}"${opts.length > 1 ? ` (+${opts.length - 1} variações em round-robin)` : ""}`
          : "Bot responderia um comentário (sem texto configurado).";
        pushMsg({ from: "system", text: label });
        return { kind: "advance", next: nextId };
      }

      case "msg-interna": {
        pushMsg({ from: "system", text: `Nota interna para a equipe: "${b.texto ?? ""}"` });
        return { kind: "advance", next: nextId };
      }

      case "pausar": {
        const list = b.pausas ?? [];
        if (list.length > 1) {
          const buttons = list.map((p) => ({ id: p.id, optionId: p.id, label: describePausa(p) }));
          pushMsg({
            from: "system",
            text: "Pausa com OU: escolha qual gatilho resolveu primeiro.",
            buttons,
          });
          return { kind: "wait", awaiting: { kind: "buttons", blockId: b.id } };
        }
        const pausaUnica = list.length
          ? (list[0] as unknown as Record<string, unknown>)
          : ({
              tipo: b.pausaTipo ?? "cronometro",
              anos: b.pausaAnos, meses: b.pausaMeses, semanas: b.pausaSemanas,
              dias: b.pausaDias, horas: b.pausaHoras, min: b.pausaMin, seg: b.pausaSeg,
            } as Record<string, unknown>);
        const desc = describePausa(pausaUnica as { tipo: string });
        if (String(pausaUnica.tipo ?? "cronometro") === "cronometro") {
          const ms = cronometroMs(pausaUnica);
          if (ms <= 0) {
            pushMsg({ from: "system", text: "Cronômetro sem tempo configurado (0s) — seguindo direto." });
            return { kind: "advance", next: nextId };
          }
          return { kind: "delay", ms, next: nextId, label: formatDuracao(ms) };
        }
        pushMsg({ from: "system", text: `Pausa (${desc}). Simulada como instantânea no teste.` });
        return { kind: "advance", next: nextId };
      }

      case "acao": {
        const simuladaApenas = b.acaoTipo === "mudar-status-lead" || b.acaoTipo === "mudar-responsavel";
        pushMsg({
          from: "system",
          text: simuladaApenas
            ? `Ação simulada: ${describeAcao(b)} — no teste o lead real não é movido. Rode o bot em uma conversa real para ver a mudança no funil.`
            : `Ação executada: ${describeAcao(b)}`,
        });
        return { kind: "advance", next: nextId };
      }


      case "condicao": {
        const conds = b.condicoes ?? [];
        const modo = b.condicaoModo ?? "e";
        if (conds.length === 0) {
          pushMsg({ from: "system", text: "Condição vazia. Considerada verdadeira." });
          return { kind: "advance", next: nextId };
        }
        const results = conds.map((c) => evalCondicao(c, lastUserMsg.current));
        if (modo === "ou" && conds.length > 1) {
          const hitIdx = results.findIndex(Boolean);
          if (hitIdx >= 0) {
            const hit = conds[hitIdx];
            const target = hit.nextBlockId ?? nextId;
            pushMsg({ from: "system", text: `Condição ${hitIdx + 1} bateu ✓ — seguindo pelo caminho dela.` });
            if (!target) return { kind: "error", message: `Condição ${hitIdx + 1} bateu, mas o caminho dela não está conectado.` };
            return { kind: "advance", next: target };
          }
          pushMsg({ from: "system", text: "Nenhuma condição bateu ✗ — saída 'senão'." });
          if (!b.falseNextBlockId) {
            return { kind: "error", message: "Nenhuma condição bateu e o ramo 'senão' não está conectado." };
          }
          return { kind: "advance", next: b.falseNextBlockId };
        }
        const passed = modo === "ou" ? results.some(Boolean) : results.every(Boolean);
        pushMsg({
          from: "system",
          text: `Condição (${modo === "ou" ? "OU" : "E"}) → ${passed ? "verdadeira ✓" : "falsa ✗"}. Última resposta: "${lastUserMsg.current || "(vazia)"}"`,
        });
        if (passed) {
          if (!nextId) return { kind: "error", message: "Condição verdadeira, mas o ramo verdadeiro não está conectado." };
          return { kind: "advance", next: nextId };
        }
        if (!b.falseNextBlockId) {
          return { kind: "error", message: "Condição falsa, mas o ramo falso não está conectado. O bot pararia aqui." };
        }
        return { kind: "advance", next: b.falseNextBlockId };
      }

      case "validacao": {
        const regras = b.roleta ?? [];
        if (regras.length > 0) {
          // No teste só dá para avaliar de verdade o alvo "resposta do cliente".
          // Regras sobre dados do lead (nome, e-mail, campo, tag) dependem de um
          // lead real, então são informadas e não bloqueiam o teste.
          const avaliaveis = regras.filter((r) => (r.alvo ?? "mensagem") === "mensagem");
          const soLead = regras.length - avaliaveis.length;
          if (soLead > 0) {
            pushMsg({
              from: "system",
              text: `${soLead} regra(s) validam dados do lead (nome, e-mail, campo ou tag) e só são avaliadas em uma conversa real.`,
            });
          }
          const matched = avaliaveis.find((r) =>
            r.tipo && runValidation(r.tipo as ValidacaoTipo, r.valor ?? "", lastUserMsg.current),
          );
          if (matched) {
            pushMsg({
              from: "system",
              text: `Validação: bateu na regra "${matched.label}" sobre "${lastUserMsg.current || "(vazia)"}" ✓`,
            });
            if (!matched.nextBlockId) {
              return { kind: "error", message: `Regra "${matched.label}" bateu, mas a saída dela não está conectada.` };
            }
            return { kind: "advance", next: matched.nextBlockId };
          }
          pushMsg({
            from: "system",
            text: `Validação: nenhuma regra bateu para "${lastUserMsg.current || "(vazia)"}". Saída "senão".`,
          });
          if (!nextId) {
            return { kind: "error", message: "Nenhuma regra bateu e a saída 'senão' não está conectada. O bot pararia aqui." };
          }
          return { kind: "advance", next: nextId };
        }

        // Legado: um único tipo/valor
        const tipo = b.validacaoTipo as ValidacaoTipo | undefined;
        if (!tipo) return { kind: "error", message: "Bloco de validação sem regras configuradas." };
        const passed = runValidation(tipo, b.validacaoValor ?? "", lastUserMsg.current);
        pushMsg({
          from: "system",
          text: `Validação (${tipo}) sobre "${lastUserMsg.current || "(vazia)"}" → ${passed ? "válido ✓" : "inválido ✗"}`,
        });
        if (passed) {
          if (!nextId) return { kind: "error", message: "Validação passou, mas não há próximo bloco conectado." };
          return { kind: "advance", next: nextId };
        }
        if (!b.falseNextBlockId) {
          return { kind: "error", message: "Validação falhou e o ramo 'inválido' não está conectado. O bot pararia aqui." };
        }
        return { kind: "advance", next: b.falseNextBlockId };
      }

      case "ir-etapa": {
        const destino = b.nextBlockId ? blocksById.get(b.nextBlockId) : undefined;
        const serial = destino?.serial;
        pushMsg({
          from: "system",
          text: serial
            ? `→ Salto para o bloco #${serial}.`
            : `→ Ir para outra etapa: destino não configurado.`,
        });
        return { kind: "advance", next: nextId };
      }

      case "iniciar-salesbot": {
        pushMsg({
          from: "system",
          text: `→ Iniciaria o Salesbot "${b.destinoBotNome ?? b.destinoBot ?? "?"}". Teste encerrado neste ponto (fluxo passa para outro bot).`,
        });
        return { kind: "end" };
      }

      case "encerrar-bot": {
        pushMsg({ from: "system", text: "Bot encerrado." });
        return { kind: "end" };
      }

      case "round-robin": {
        const opts = (b.roleta ?? []).filter((o) => !!o.nextBlockId);
        if (opts.length === 0) return { kind: "error", message: "Distribuição sem opções conectadas." };
        // Rotação simples: usa contador local em ref, entre renders.
        const idx = (rrCounters.current.get(b.id) ?? 0) % opts.length;
        rrCounters.current.set(b.id, idx + 1);
        const chosen = opts[idx];
        pushMsg({
          from: "system",
          text: `Distribuição → "${chosen.label ?? `opção ${idx + 1}`}" (rotação #${idx + 1})`,
        });
        return { kind: "advance", next: chosen.nextBlockId ?? null };
      }


      default:
        return { kind: "error", message: `Tipo de bloco "${b.kind}" não implementado no teste.` };
    }
  }

  function submitText() {
    const txt = input.trim();
    if (!txt || ended) return;
    setInput("");
    lastUserMsg.current = txt;
    pushMsg({ from: "user", text: txt });
    if (!currentBlockId) return;
    // Se o bloco atual é enviar-mensagem esperando texto, avança pelo nextBlockId.
    const b = blocksById.get(currentBlockId);
    if (!b) {
      fail("Bloco atual desapareceu do fluxo.");
      return;
    }
    setAwaiting(null);
    const nextId = b.nextBlockId ?? null;
    if (!nextId) {
      fail("Você respondeu, mas este bloco não tem próximo passo conectado.");
      return;
    }
    runFrom(nextId);
  }

  function clickButton(btnId: string, label: string, optionId?: string) {
    if (ended) return;
    lastUserMsg.current = label;
    pushMsg({ from: "user", text: label });
    const b = currentBlockId ? blocksById.get(currentBlockId) : null;
    if (!b) return;
    setAwaiting(null);
    // Round-robin: rotear pela optionId
    if (b.kind === "round-robin") {
      const opt = (b.roleta ?? []).find((o) => o.id === optionId);
      if (!opt?.nextBlockId) {
        fail(`Opção "${label}" da Distribuição não está conectada a nenhum próximo bloco.`);
        return;
      }
      runFrom(opt.nextBlockId);
      return;
    }
    if (b.kind === "pausar") {
      const pausa = (b.pausas ?? []).find((p) => p.id === optionId);
      if (!pausa?.nextBlockId) {
        fail(`A pausa "${label}" não está conectada a nenhum próximo bloco.`);
        return;
      }
      runFrom(pausa.nextBlockId);
      return;
    }
    // enviar-mensagem com botões: quick-reply, segue pelo nextBlockId único
    const nextId = b.nextBlockId ?? null;
    if (!nextId) {
      fail("Você escolheu uma opção, mas este bloco não tem próximo passo conectado.");
      return;
    }
    runFrom(nextId);
    // btnId ficou sem uso lógico, mantido por interface.
    void btnId;
  }

  if (!open) return null;

  return (
    <div className="absolute right-3 top-14 bottom-3 z-40 w-[340px] max-w-[85vw] flex flex-col rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden">
      {/* Header do "celular" */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 grid place-items-center text-emerald-400">
          <MessageCircle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-200 truncate">
            {bot?.nome ?? "Salesbot"}
          </div>
          <div className="text-[10px] text-slate-500">
            {started ? (ended ? "Encerrado" : pendingTimer ? "Em pausa (cronômetro)..." : awaiting ? "Aguardando você..." : "Executando...") : "Pronto para testar"}
          </div>
        </div>
        {started && (
          <button
            onClick={reset}
            title="Reiniciar teste"
            className="w-7 h-7 grid place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onClose}
          title="Fechar"
          className="w-7 h-7 grid place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-slate-900/40 px-2 py-3 space-y-2">
        {!started && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 grid place-items-center text-emerald-400">
              <Play className="w-6 h-6" />
            </div>
            <div className="text-xs text-slate-300">
              Simule uma conversa real com o bot que você acabou de programar.
              Cada resposta sua percorre o fluxo de verdade. Se algum bloco
              não estiver conectado, o erro aparece aqui.
            </div>
            <button
              onClick={start}
              className="mt-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              Iniciar teste
            </button>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} onClickButton={clickButton} disabled={ended} />
        ))}

        {pendingTimer && (
          <div className="mx-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <div className="text-[11px] text-amber-200 font-semibold">
              ⏱ Cronômetro rodando — {formatDuracao(pendingTimer.totalMs)}
            </div>
            <div className="text-[10px] text-amber-100/80 mt-0.5">
              Faltam {formatDuracao(Math.max(0, pendingTimer.untilMs - Date.now()))} para o bot seguir o fluxo.
            </div>
            <button
              type="button"
              onClick={() => finishTimer(pendingTimer, "pulado")}
              className="mt-1.5 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-[10px] font-semibold"
            >
              Pular espera e avançar
            </button>
          </div>
        )}

        {ended && started && (
          <div className="text-center pt-2">
            <button
              onClick={start}
              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
            >
              <RotateCcw className="w-3 h-3" /> Rodar novamente
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-800 bg-slate-900 px-2 py-2">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitText();
            }}
            disabled={!started || ended || awaiting?.kind !== "text"}
            placeholder={
              !started
                ? "Clique em Iniciar teste"
                : ended
                  ? "Teste encerrado"
                  : awaiting?.kind === "buttons"
                    ? "Escolha uma opção acima"
                    : awaiting?.kind === "text"
                      ? "Digite sua resposta..."
                      : "..."
            }
            className="flex-1 bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
          />
          <button
            onClick={submitText}
            disabled={!started || ended || awaiting?.kind !== "text" || !input.trim()}
            className="w-8 h-8 grid place-items-center rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  m,
  onClickButton,
  disabled,
}: {
  m: ChatMsg;
  onClickButton: (id: string, label: string, optionId?: string) => void;
  disabled: boolean;
}) {
  if (m.from === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-600 text-white px-3 py-1.5 text-xs whitespace-pre-wrap">
          {m.text}
        </div>
      </div>
    );
  }
  if (m.from === "system") {
    return (
      <div className="flex flex-col items-center">
        <div className="max-w-[92%] rounded-md bg-slate-800/60 border border-slate-700 text-slate-300 px-2 py-1 text-[10px] italic whitespace-pre-wrap">
          {m.text}
        </div>
        {m.buttons && (
          <div className="w-full flex flex-wrap gap-1 justify-center mt-1">
            {m.buttons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => onClickButton(btn.id, btn.label, btn.optionId)}
                disabled={disabled}
                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-100 disabled:opacity-40"
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (m.from === "error") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[92%] rounded-md bg-rose-900/40 border border-rose-700/60 text-rose-200 px-2 py-1.5 text-[11px] whitespace-pre-wrap">
          ⚠ {m.text}
        </div>
      </div>
    );
  }
  // bot
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-800 text-slate-100 px-3 py-1.5 text-xs whitespace-pre-wrap">
        {m.text}
      </div>
      {m.media && m.media.length > 0 && (
        <div className="max-w-[85%] flex flex-col gap-1">
          {m.media.map((mm, i) => (
            <div key={i} className="text-[10px] text-slate-400 italic bg-slate-800/60 border border-slate-700 rounded px-2 py-1">
              📎 {mm.kind}: {mm.filename}
            </div>
          ))}
        </div>
      )}
      {m.buttons && m.buttons.length > 0 && (
        <div className="max-w-[85%] flex flex-wrap gap-1">
          {m.buttons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => onClickButton(btn.id, btn.label, btn.optionId)}
              disabled={disabled}
              className="px-2 py-1 rounded-full bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-100 disabled:opacity-40"
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============== Helpers ============== */

function evalCondicao(c: Condicao, lastMsg: string): boolean {
  const valor = c.valor ?? "";
  let atual = "";
  if (c.sujeito === "cliente" || c.sujeito === "comentario") atual = lastMsg;
  // tag/etapa/fonte-leads/campo-personalizado no teste não têm valor real;
  // consideramos vazio, o usuário vê o resultado e ajusta.
  if (c.sujeito === "tag") {
    // Sem tags no teste, matching sempre "não encontrado".
    return c.operador === "desigual";
  }
  const op = c.operador;
  if (op === "igual") return atual === valor;
  if (op === "desigual") return atual !== valor;
  if (op === "contem") return atual.toLowerCase().includes(valor.toLowerCase());
  return false;
}

function runValidation(tipo: ValidacaoTipo, ref: string, val: string): boolean {
  const plain = matchPlainSalesbotRule(tipo, ref, val);
  if (plain !== undefined) return plain;
  const raw = val.trim();
  const wanted = ref.trim();
  switch (tipo) {
    case "contem": return !!wanted && val.toLowerCase().includes(ref.toLowerCase());
    case "nao-contem": return !!wanted && !val.toLowerCase().includes(ref.toLowerCase());
    case "desigual": return !!wanted && val !== ref;
    case "comprimento": return !!wanted && val.length === Number(ref || 0);
    case "regex": { if (!wanted) return false; try { return new RegExp(ref).test(val); } catch { return false; } }
    case "numero": return !!wanted && /^-?\d+(\.\d+)?$/.test(raw) && Number(raw) === Number(wanted);
    case "letra": return !!wanted && /^[\p{L}\s]+$/u.test(raw) && raw.toLowerCase() === wanted.toLowerCase();
    case "palavra": return !!wanted && /^\p{L}+$/u.test(raw) && raw.toLowerCase() === wanted.toLowerCase();
    case "telefone": {
      const digits = val.replace(/\D/g, "");
      const refDigits = ref.replace(/\D/g, "");
      return !!refDigits && digits.length >= 8 && digits.includes(refDigits);
    }
    case "email": return !!wanted && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && raw.toLowerCase().includes(wanted.toLowerCase());
    case "gama": {
      const [a, b] = ref.split("-").map((n) => Number(n.trim()));
      const n = Number(val);
      return Number.isFinite(n) && n >= a && n <= b;
    }
    default: return false;
  }
}

function describePausa(p: { tipo: string; min?: number; seg?: number; horas?: number; dias?: number }): string {
  const map: Record<string, string> = {
    cronometro: "cronômetro",
    "msg-recebida": "aguardar mensagem",
    "exceto-expediente": "exceto expediente",
    "exceto-fora-expediente": "exceto fora do expediente",
    "ate-expediente": "até o expediente",
    "ate-fora-expediente": "até fora do expediente",
    "video-aberto": "abrir vídeo",
    "video-fechado": "fechar vídeo",
    "audio-aberto": "abrir áudio",
    "audio-fechado": "fechar áudio",
  };
  const base = map[p.tipo] ?? p.tipo;
  if (p.tipo === "cronometro") {
    const ms = cronometroMs(p as unknown as Record<string, unknown>);
    if (ms > 0) return `${base} (${formatDuracao(ms)})`;
  }
  return base;
}

function describeAcao(b: Block): string {
  const t = b.acaoTipo ?? "?";
  switch (t) {
    case "nota": return `nota interna "${b.acaoConfig ?? b.texto ?? ""}"`;
    case "tarefa": return `criar tarefa "${b.tarefaTitulo ?? "?"}"`;
    case "completar-tarefa": return "completar tarefa aberta";
    case "status-conversa": return `alterar status da conversa para ${b.acaoConfig ?? "?"}`;
    case "definir-campo": return `definir campo "${b.campoNome ?? "?"}" = "${b.campoValor ?? ""}"`;
    case "enviar-email": return "enviar e-mail";
    case "webhook": return `chamar webhook ${b.webhookMethod ?? "POST"} ${b.webhookUrl ?? "?"}`;
    case "formulario": return `enviar formulário "${b.formularioNome ?? "?"}"`;
    case "tags": return `atualizar tags (${b.acaoConfig ?? ""})`;
    case "mudar-status-lead": return `mudar status do lead para "${b.destinoStageNome ?? "?"}"`;
    case "mudar-responsavel": return `atribuir a "${b.destinoResponsavelNome ?? "?"}"`;
    default: return t;
  }
}
