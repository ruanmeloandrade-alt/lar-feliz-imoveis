import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList } from "lucide-react";
import { AiAgentChat } from "@/components/ai-agent/AiAgentChat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getActiveWorkspace } from "@/lib/workspace.functions";

export function CrmManagerButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <ClipboardList aria-hidden="true" /> Gestor de CRM
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="flex h-[min(44rem,calc(100dvh-2rem))] max-w-3xl flex-col gap-0 overflow-hidden rounded-xl p-0">
        <DialogTitle className="border-b border-border px-5 py-4">Gestor de CRM</DialogTitle>
        <CrmManagerChat />
      </DialogContent>
    </Dialog>
  );
}

function CrmManagerChat() {
  const loadWorkspace = useServerFn(getActiveWorkspace);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["active-workspace", "crm-manager"],
    queryFn: () => loadWorkspace(),
  });

  if (isPending) return <p className="p-5 text-sm" role="status">Carregando a operação imobiliária…</p>;
  if (isError || !data) {
    return <div className="space-y-3 p-5 text-sm" role="alert">
      <p>Não foi possível identificar a operação imobiliária.</p>
      <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button>
    </div>;
  }
  return <div className="min-h-0 flex-1"><AiAgentChat key={data.id} workspaceId={data.id} module="kommo_manager" fullscreen /></div>;
}
