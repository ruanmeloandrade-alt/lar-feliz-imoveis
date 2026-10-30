import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { AiAgentChat } from "@/components/ai-agent/AiAgentChat";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/modulos/gestor-trafego/chat")({
  head: () => ({
    meta: [
      { title: "Chat Marketing" },
      { name: "description", content: "Chat Marketing da Vanessa Simoni. Consultor de marketing ou executor real de campanhas Meta Ads." },
    ],
  }),
  component: GestorChatPage,
});

function GestorChatPage() {
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
    <div className="flex min-h-[100dvh] w-full bg-background text-foreground md:h-screen md:overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 md:px-4 pt-3 md:pt-4">
          <Link
            to="/modulos/gestor-trafego"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Gestor de Tráfego
          </Link>
        </div>
        <div className="flex-1 min-h-0 p-3 md:p-4">
          <div className="h-full rounded-xl border border-border overflow-hidden">
            {wsId ? (
              <AiAgentChat workspaceId={wsId} module="gestor_trafego" fullscreen />
            ) : (
              <div className="p-10 text-sm text-muted-foreground">Carregando workspace…</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
