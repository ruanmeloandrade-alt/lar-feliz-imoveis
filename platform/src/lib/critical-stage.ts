import { useEffect, useState } from "react";
import type { FunnelStage } from "@/lib/mock-dashboard";

/**
 * Configuração da "Etapa crítica" do dashboard.
 * O usuário escolhe manualmente, dentro de "Editar dashboard",
 * se a etapa crítica é um funil inteiro ou uma etapa específica.
 */
export type CriticalStageSelection =
  | { kind: "stage"; stageId: string; label: string; pipelineName?: string }
  | { kind: "pipeline"; pipelineId: string; pipelineName: string }
  | null;

const STORAGE_KEY = "mkton:dashboard-critical-stage";
// Legado: chave antiga que guardava só o stage_id
const LEGACY_STAGE_KEY = "mkton:dashboard-bottleneck-stage";

function read(): CriticalStageSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CriticalStageSelection;
      if (parsed && (parsed.kind === "stage" || parsed.kind === "pipeline")) return parsed;
    }
    const legacy = localStorage.getItem(LEGACY_STAGE_KEY);
    if (legacy) return { kind: "stage", stageId: legacy, label: "" };
  } catch { /* ignore */ }
  return null;
}

function write(sel: CriticalStageSelection) {
  try {
    if (!sel) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
    localStorage.removeItem(LEGACY_STAGE_KEY);
    window.dispatchEvent(new CustomEvent("mkton:critical-stage-changed"));
  } catch { /* ignore */ }
}

export function useCriticalStage() {
  const [selection, setSelectionState] = useState<CriticalStageSelection>(null);
  useEffect(() => {
    setSelectionState(read());
    const handler = () => setSelectionState(read());
    window.addEventListener("mkton:critical-stage-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("mkton:critical-stage-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  function setSelection(sel: CriticalStageSelection) {
    write(sel);
    setSelectionState(sel);
  }
  return { selection, setSelection };
}

export interface ResolvedCritical {
  title: string;
  subtitle: string;
  count: number;
  pctOfTop: number;
  /** Etapa alvo para drilldown. Quando a seleção é um pipeline, aponta para a etapa com mais leads dentro dele. */
  targetStage: FunnelStage | null;
  /** Lista de etapas agregadas (quando pipeline). Vazio quando é uma única etapa. */
  aggregatedStages: FunnelStage[];
  isConfigured: boolean;
}

export function resolveCriticalStage(
  funnel: FunnelStage[],
  selection: CriticalStageSelection,
): ResolvedCritical {
  if (!funnel.length) {
    return { title: "Sem etapa", subtitle: "", count: 0, pctOfTop: 0, targetStage: null, aggregatedStages: [], isConfigured: false };
  }

  if (selection?.kind === "stage") {
    const found = funnel.find((s) => s.stage_id === selection.stageId);
    if (found) {
      return {
        title: found.stage_name,
        subtitle: found.funnel_name,
        count: found.count,
        pctOfTop: found.pct_of_top,
        targetStage: found,
        aggregatedStages: [],
        isConfigured: true,
      };
    }
  }

  if (selection?.kind === "pipeline") {
    const stages = funnel.filter((s) => s.funnel_name === selection.pipelineName);
    if (stages.length > 0) {
      const total = stages.reduce((acc, s) => acc + s.count, 0);
      const max = Math.max(...funnel.map((s) => s.count), 1);
      const target = [...stages].sort((a, b) => b.count - a.count)[0];
      return {
        title: selection.pipelineName,
        subtitle: `${stages.length} etapa${stages.length > 1 ? "s" : ""} · funil inteiro`,
        count: total,
        pctOfTop: Math.min(total / max, 1),
        targetStage: target ?? null,
        aggregatedStages: stages,
        isConfigured: true,
      };
    }
  }

  // Fallback: primeira etapa do funil
  const first = funnel[0];
  return {
    title: first.stage_name,
    subtitle: first.funnel_name,
    count: first.count,
    pctOfTop: first.pct_of_top,
    targetStage: first,
    aggregatedStages: [],
    isConfigured: false,
  };
}
