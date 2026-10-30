import { GitBranch, Sparkles, X } from "lucide-react";

export type AgentMode = "prompt" | "objetivos";

/**
 * Primeiro passo da criação de um agente IA: escolher o TIPO.
 * A escolha é definitiva — depois de criado, o agente é de prompt OU de fluxo de
 * objetivos, nunca os dois (evita configuração duplicada e conflito no runtime).
 */
export function AgentTypeDialog({
  onPick,
  onClose,
}: {
  onPick: (mode: AgentMode) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Que tipo de agente você quer criar?</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Essa escolha é definitiva. Um agente é <strong>de prompt</strong> ou <strong>de fluxo de objetivos</strong>,
              nunca os dois ao mesmo tempo.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid sm:grid-cols-2 gap-3">
          <TypeCard
            icon={<Sparkles className="w-5 h-5" />}
            title="Agente de Prompt"
            desc="Você escreve o manual de atendimento e as regras. A IA conduz a conversa livremente dentro dessas instruções."
            bullets={["Mais rápido de montar", "Bom para dúvidas e suporte", "Ações e regras condicionais"]}
            onClick={() => onPick("prompt")}
          />
          <TypeCard
            icon={<GitBranch className="w-5 h-5" />}
            title="Fluxo de Objetivos"
            desc="Você monta uma árvore de objetivos. A IA persegue um objetivo por vez, com contingências e ápice controlado."
            bullets={["Conversa previsível", "Bom para venda e qualificação", "Contingências por objetivo"]}
            onClick={() => onPick("objetivos")}
          />
        </div>
      </div>
    </div>
  );
}

function TypeCard({
  icon,
  title,
  desc,
  bullets,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  bullets: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition p-4 space-y-2"
    >
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
      <ul className="space-y-0.5">
        {bullets.map((b) => (
          <li key={b} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <span className="text-primary mt-[3px]">•</span>
            {b}
          </li>
        ))}
      </ul>
    </button>
  );
}

/** Selo fixo do tipo do agente (substitui os botões de alternar modo). */
export function AgentModeBadge({ mode }: { mode: AgentMode }) {
  const objetivos = mode === "objetivos";
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-primary/40 bg-primary/10 text-primary">
      {objetivos ? <GitBranch className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
      <span className="text-xs font-semibold uppercase tracking-wider">
        {objetivos ? "Fluxo de Objetivos" : "Agente de Prompt"}
      </span>
    </div>
  );
}
