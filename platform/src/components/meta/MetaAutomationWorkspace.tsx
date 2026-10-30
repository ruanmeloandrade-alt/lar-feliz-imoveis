import { useState } from "react";
import { Bot, SlidersHorizontal } from "lucide-react";
import { MetaAutomationsPanel } from "./MetaAutomationsPanel";
import { MetaAutomationAiPlanner } from "./MetaAutomationAiPlanner";

export function MetaAutomationWorkspace({ workspaceId }: { workspaceId: string }) {
  const [mode, setMode] = useState<"manual" | "ai">("manual");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-xl border p-4 text-left transition ${mode === "manual" ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
        >
          <div className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4" /> Automação manual</div>
          <div className="mt-1 text-sm text-muted-foreground">Você define alvo, condições, ações, intervalo e cooldown diretamente.</div>
        </button>
        <button
          type="button"
          onClick={() => setMode("ai")}
          className={`rounded-xl border p-4 text-left transition ${mode === "ai" ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
        >
          <div className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4" /> Automação com IA</div>
          <div className="mt-1 text-sm text-muted-foreground">Escolha campanha/conjunto/anúncio, passe o briefing e revise o plano antes de ativar.</div>
        </button>
      </div>

      {mode === "manual" ? (
        <MetaAutomationsPanel workspaceId={workspaceId} />
      ) : (
        <MetaAutomationAiPlanner workspaceId={workspaceId} />
      )}
    </div>
  );
}
