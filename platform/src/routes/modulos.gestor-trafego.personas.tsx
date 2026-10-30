import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { MetaPersonaManager } from "@/components/meta/MetaPersonaManager";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/modulos/gestor-trafego/personas")({
  head: () => ({
    meta: [
      { title: "Personas, Gestor de Tráfego IA" },
      { name: "description", content: "Configure personas de anúncio: contexto, canais vinculados, direcionamento, localizações e modelos de copy para o Gestor de Tráfego IA." },
    ],
  }),
  component: PersonasPage,
});

function PersonasPage() {
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
      icon={Users}
      tag="MÍDIA"
      title="Personas"
      description="Cadastre personas por conta de anúncio. O Gestor de Tráfego IA usa esses dados ao gerar campanhas."
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
        ? <MetaPersonaManager workspaceId={wsId} />
        : <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando workspace…</div>}
    </ModuleShell>
  );
}
