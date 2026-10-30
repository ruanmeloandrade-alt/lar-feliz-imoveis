import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "mkton:kpi-rules";

export interface KpiRules {
 /** Fonte de dados do dashboard: 'mkton' (CRM nativo). */
 data_source?: "mkton";
 /** Pipeline para o card "Valor no Pipeline". Vazio = todos. */
 valor_pipeline_id?: string;
 /** Pipeline base (denominador) para "Taxa de Conversão". Vazio = todos os leads. */
 conversao_pipeline_id?: string;
 /** Funil inteiro considerado como pós-venda (numerador). */
 conversao_posvenda_pipeline_id?: string;
 /** Etapa específica considerada como pós-venda (numerador). */
 conversao_posvenda_stage_id?: string;
 /** Funil inteiro que conta como "Venda ganha" (override do detector automático). */
 venda_ganha_pipeline_id?: string;
 /** Etapa específica que conta como "Venda ganha" (override do detector automático). */
 venda_ganha_stage_id?: string;
 /** @deprecated mantido por compatibilidade - não usado no cálculo atual. */
 conversao_origem_tag?: string;
}

interface Ctx {
 rules: KpiRules;
 setRules: (next: KpiRules) => void;
}

const KpiRulesContext = createContext<Ctx | null>(null);

export function KpiRulesProvider({ children }: { children: ReactNode }) {
 const [rules, setRulesState] = useState<KpiRules>({});

 useEffect(() => {
 try {
 const raw = localStorage.getItem(STORAGE_KEY);
 if (raw) {
 const parsed = JSON.parse(raw);
 if (parsed && typeof parsed === "object") setRulesState(parsed as KpiRules);
 }
 } catch { /* ignore */ }
 }, []);

 const setRules = useCallback((next: KpiRules) => {
 setRulesState(next);
 try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
 }, []);

 return <KpiRulesContext.Provider value={{ rules, setRules }}>{children}</KpiRulesContext.Provider>;
}

export function useKpiRules() {
 const ctx = useContext(KpiRulesContext);
 if (!ctx) throw new Error("useKpiRules must be used inside KpiRulesProvider");
 return ctx;
}
