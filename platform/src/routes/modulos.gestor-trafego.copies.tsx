import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, FolderOpen } from "lucide-react";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { MetaCopyLibrary } from "@/components/meta/MetaCopyLibrary";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/modulos/gestor-trafego/copies")({
  head: () => ({
    meta: [
      { title: "Central de Copies, Gestor de Tráfego IA" },
      { name: "description", content: "Salve, organize em pastas e reutilize as copies de anúncio que mais convertem no seu Gestor de Tráfego IA." },
      { property: "og:title", content: "Central de Copies, Gestor de Tráfego IA" },
      { property: "og:description", content: "Salve, organize em pastas e reutilize as copies de anúncio que mais convertem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CopiesPage,
});

function CopiesPage() {
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
      icon={FileText}
      tag="MÍDIA"
      title="Central de Copies"
      description="Guarde os textos que já convertem, organize em pastas e reutilize quando quiser, sem depender de gerar copy nova toda vez."
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
          to="/modulos/gestor-trafego/criativos"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <FolderOpen className="w-3.5 h-3.5" /> Central de Criativos
        </Link>
      </div>
      {wsId
        ? <MetaCopyLibrary workspaceId={wsId} />
        : <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando workspace…</div>}
    </ModuleShell>
  );
}
