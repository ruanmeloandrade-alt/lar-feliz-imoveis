import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_META_KPIS } from "@/lib/meta-dashboard-kpis";

const SCOPE = "meta_dashboard";

/**
 * Persistência da seleção de KPIs do dashboard do Gestor de Tráfego.
 * Usa a tabela `dashboard_kpi_selections` (source = 'meta_dashboard').
 * Ordem = coluna `position`.
 */
export function useMetaKpiSelection(workspaceId: string | null) {
  const [keys, setKeys] = useState<string[]>(DEFAULT_META_KPIS);
  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUserId(u.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("dashboard_kpi_selections")
        .select("kpi_key,position")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("source", SCOPE)
        .order("position", { ascending: true });
      if (cancel) return;
      if (data && data.length > 0) {
        setKeys(data.map((r) => r.kpi_key));
      } else {
        setKeys(DEFAULT_META_KPIS);
      }
      setLoaded(true);
    })();
    return () => { cancel = true; };
  }, [workspaceId, userId]);

  const save = useMemo(() => async (nextKeys: string[]) => {
    if (!workspaceId || !userId) return;
    // Remove tudo e regrava (simples e correto pra volumes pequenos)
    await supabase
      .from("dashboard_kpi_selections")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("source", SCOPE);
    if (nextKeys.length > 0) {
      const rows = nextKeys.map((k, i) => ({
        workspace_id: workspaceId,
        user_id: userId,
        kpi_key: k,
        source: SCOPE,
        position: i,
      }));
      await supabase.from("dashboard_kpi_selections").insert(rows);
    }
    setKeys(nextKeys);
  }, [workspaceId, userId]);

  return { keys, save, loaded };
}
