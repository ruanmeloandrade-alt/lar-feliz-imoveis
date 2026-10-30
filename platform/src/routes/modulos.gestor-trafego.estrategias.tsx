import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Target } from "lucide-react";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { MetaStrategyManager } from "@/components/meta/MetaStrategyManager";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/modulos/gestor-trafego/estrategias")({
  head: () => ({
    meta: [
      { title: "Estratégias, Gestor de Tráfego IA" },
      { name: "description", content: "Monte estratégias de anúncio reutilizáveis: objetivo, orçamento, público, copy e regras de automação executáveis." },
    ],
  }),
  component: EstrategiasPage,
});

function EstrategiasPage() {
  const [wsId, setWsId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles")
        .select("current_workspace_id").eq("id", u.user.id).maybeSingle();
      setWsId(prof?.current_workspace_id ?? null);
    })();
  }, []);

  return (
    <ModuleShell
      icon={Target}
      tag="MÍDIA"
      title="Estratégias"
      description="Cada estratégia é uma receita de anúncio reutilizável com regras de automação. O Gestor IA usa isso quando você pede pra montar campanha com uma estratégia."
      status="ativo"
    >
      <div className="flex items-center gap-2">
        <Link
          to="/modulos/gestor-trafego"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Gestor de Tráfego
        </Link>
      </div>
      {wsId
        ? <MetaStrategyManager workspaceId={wsId} />
        : <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando workspace…</div>}
    </ModuleShell>
  );
}
