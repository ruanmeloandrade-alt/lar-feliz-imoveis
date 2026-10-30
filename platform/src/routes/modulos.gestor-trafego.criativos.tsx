import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, FolderOpen } from "lucide-react";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { MetaCreativeLibrary } from "@/components/meta/MetaCreativeLibrary";
import { MetaCreativeAttributionPanel } from "@/components/meta/MetaCreativeAttributionPanel";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/modulos/gestor-trafego/criativos")({
  head: () => ({
    meta: [
      { title: "Central de Criativos, Gestor de Tráfego IA" },
      { name: "description", content: "Suba, organize em pastas e nomeie criativos (imagens e vídeos) para o Gestor de Tráfego IA usar ao criar anúncios." },
    ],
  }),
  component: CriativosPage,
});

function CriativosPage() {
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
      icon={FolderOpen}
      tag="MÍDIA"
      title="Central de Criativos"
      description="Suba imagens e vídeos, organize em pastas e nomeie tudo. O Gestor IA vai encontrar por nome, pasta e tag."
      status="ativo"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/modulos/gestor-trafego"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Gestor de Tráfego
        </Link>
        <Link
          to="/modulos/gestor-trafego/copies"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <FileText className="w-3.5 h-3.5" /> Central de Copies
        </Link>
      </div>

      {wsId
        ? <>
            <MetaCreativeLibrary workspaceId={wsId} />
            <MetaCreativeAttributionPanel workspaceId={wsId} />
          </>
        : <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando workspace…</div>}
    </ModuleShell>
  );
}
