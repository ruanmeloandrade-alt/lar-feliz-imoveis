import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { MetaAudiencesPanel } from "@/components/meta/MetaAudiencesPanel";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/modulos/gestor-trafego/publicos")({
  head: () => ({
    meta: [
      { title: "Públicos, Gestor de Tráfego" },
      { name: "description", content: "Crie e gerencie públicos personalizados e lookalikes do Meta Ads." },
    ],
  }),
  component: PublicosPage,
});

function PublicosPage() {
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
      title="Públicos"
      description="Custom audiences, lookalikes e engajamento, reaproveitáveis em campanhas e regras de automação."
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
        ? <MetaAudiencesPanel workspaceId={wsId} />
        : <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando workspace…</div>}
    </ModuleShell>
  );
}
