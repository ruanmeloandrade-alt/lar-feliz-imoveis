import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "mkton:comparison-widgets";

export type ComparisonChartType = "bar" | "pie" | "ranking";
export type ComparisonSize = "1x1" | "2x1" | "2x2";

export interface ComparisonWidget {
  id: string;
  title: string;
  chartType: ComparisonChartType;
  kpiKeys: string[];
  size: ComparisonSize;
}

interface Ctx {
  widgets: ComparisonWidget[];
  upsert: (w: ComparisonWidget) => void;
  remove: (id: string) => void;
  setSize: (id: string, size: ComparisonSize) => void;
}

const ComparisonWidgetsContext = createContext<Ctx | null>(null);

function isSize(s: unknown): s is ComparisonSize {
  return s === "1x1" || s === "2x1" || s === "2x2";
}
function isChart(t: unknown): t is ComparisonChartType {
  return t === "bar" || t === "pie" || t === "ranking";
}

function normalize(raw: unknown): ComparisonWidget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w: any) => {
      if (!w || typeof w !== "object") return null;
      const id = typeof w.id === "string" ? w.id : null;
      const title = typeof w.title === "string" ? w.title : "Comparativo";
      const chartType = isChart(w.chartType) ? w.chartType : "bar";
      const kpiKeys = Array.isArray(w.kpiKeys) ? w.kpiKeys.filter((x: unknown) => typeof x === "string") : [];
      const size = isSize(w.size) ? w.size : "2x2";
      if (!id || kpiKeys.length === 0) return null;
      return { id, title, chartType, kpiKeys, size } as ComparisonWidget;
    })
    .filter((x): x is ComparisonWidget => x !== null);
}

export function ComparisonWidgetsProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<ComparisonWidget[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setWidgets(normalize(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((next: ComparisonWidget[]) => {
    setWidgets(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const upsert = useCallback((w: ComparisonWidget) => {
    setWidgets((cur) => {
      const idx = cur.findIndex((x) => x.id === w.id);
      const next = idx >= 0 ? cur.map((x, i) => (i === idx ? w : x)) : [...cur, w];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setWidgets((cur) => {
      const next = cur.filter((x) => x.id !== id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const setSize = useCallback((id: string, size: ComparisonSize) => {
    setWidgets((cur) => {
      const next = cur.map((x) => (x.id === id ? { ...x, size } : x));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <ComparisonWidgetsContext.Provider value={{ widgets, upsert, remove, setSize }}>
      {children}
    </ComparisonWidgetsContext.Provider>
  );
}

export function useComparisonWidgets() {
  const ctx = useContext(ComparisonWidgetsContext);
  if (!ctx) throw new Error("useComparisonWidgets must be used inside ComparisonWidgetsProvider");
  return ctx;
}

export function newComparisonId() {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
