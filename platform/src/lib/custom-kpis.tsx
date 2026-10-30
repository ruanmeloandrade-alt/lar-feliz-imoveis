import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "mkton:custom-kpi-ids";
const SIZES_KEY = "mkton:custom-kpi-sizes";
const VIZ_KEY = "mkton:custom-kpi-viz";

export type KpiSize = "1x1" | "2x1" | "2x2";
export type KpiViz = "number" | "sparkline" | "area" | "progress" | "bars";

function normalizeSize(s: unknown): KpiSize {
  return s === "1x1" || s === "2x1" || s === "2x2" ? s : "2x2";
}

function normalizeViz(v: unknown): KpiViz {
  return v === "number" || v === "sparkline" || v === "area" || v === "progress" || v === "bars" ? v : "number";
}

interface Ctx {
  selectedIds: string[];
  sizes: Record<string, KpiSize>;
  viz: Record<string, KpiViz>;
  setSelected: (ids: string[]) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  setSize: (id: string, size: KpiSize) => void;
  setViz: (id: string, viz: KpiViz) => void;
}

const CustomKpisContext = createContext<Ctx | null>(null);

export function CustomKpisProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedState] = useState<string[]>([]);
  const [sizes, setSizesState] = useState<Record<string, KpiSize>>({});
  const [viz, setVizState] = useState<Record<string, KpiViz>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSelectedState(parsed.filter((x) => typeof x === "string"));
      }
      const sz = localStorage.getItem(SIZES_KEY);
      if (sz) {
        const parsed = JSON.parse(sz);
        if (parsed && typeof parsed === "object") {
          const normalized: Record<string, KpiSize> = {};
          for (const [k, v] of Object.entries(parsed)) normalized[k] = normalizeSize(v);
          setSizesState(normalized);
        }
      }
      const vz = localStorage.getItem(VIZ_KEY);
      if (vz) {
        const parsed = JSON.parse(vz);
        if (parsed && typeof parsed === "object") {
          const normalized: Record<string, KpiViz> = {};
          for (const [k, v] of Object.entries(parsed)) normalized[k] = normalizeViz(v);
          setVizState(normalized);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((next: string[]) => {
    setSelectedState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const persistSizes = useCallback((next: Record<string, KpiSize>) => {
    setSizesState(next);
    try { localStorage.setItem(SIZES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const persistViz = useCallback((next: Record<string, KpiViz>) => {
    setVizState(next);
    try { localStorage.setItem(VIZ_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const setSelected = useCallback((ids: string[]) => persist(Array.from(new Set(ids))), [persist]);
  const toggle = useCallback(
    (id: string) => persist(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]),
    [selectedIds, persist],
  );
  const remove = useCallback((id: string) => persist(selectedIds.filter((x) => x !== id)), [selectedIds, persist]);
  const setSize = useCallback((id: string, size: KpiSize) => persistSizes({ ...sizes, [id]: size }), [sizes, persistSizes]);
  const setViz = useCallback((id: string, nextViz: KpiViz) => persistViz({ ...viz, [id]: nextViz }), [viz, persistViz]);

  return (
    <CustomKpisContext.Provider value={{ selectedIds, sizes, viz, setSelected, toggle, remove, setSize, setViz }}>
      {children}
    </CustomKpisContext.Provider>
  );
}

export function useCustomKpis() {
  const ctx = useContext(CustomKpisContext);
  if (!ctx) throw new Error("useCustomKpis must be used inside CustomKpisProvider");
  return ctx;
}
