import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, ArrowLeft } from "lucide-react";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { ModuleGate } from "@/components/billing/ModuleGate";
import { PostCreatorDialog } from "@/components/social/PostCreatorDialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/modulos/social-novo-post")({
  head: () => ({ meta: [{ title: "Novo post · Social Media · Vanessa Simoni" }] }),
  component: NovoPostPage,
});

function NovoPostPage() {
  const [wsId, setWsId] = useState<string | null>(null);
  const navigate = useNavigate();

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
    <ModuleGate module="social_media_ia">
      <ModuleShell
        icon={Plus}
        tag="CONTEÚDO"
        title="Novo post"
        description="Agende um post no Feed, Story ou Reels do Instagram e Facebook."
        status="ativo"
        actions={
          <button
            onClick={() => navigate({ to: "/modulos/social-media" })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </button>
        }
      >
        <PostCreatorDialog
          open
          variant="page"
          workspaceId={wsId}
          onClose={() => navigate({ to: "/modulos/social-media" })}
        />
      </ModuleShell>
    </ModuleGate>
  );
}
