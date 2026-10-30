import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function LeadWhatsappOrigin({
  leadId,
  workspaceId,
  actorId,
}: {
  leadId: string;
  workspaceId: string;
  actorId: string;
}) {
  const origin = useQuery({
    queryKey: ["lead-whatsapp-origin", actorId, workspaceId, leadId],
    staleTime: 15000,
    queryFn: async () => {
      const auth = await supabase.auth.getUser();
      if (auth.error || auth.data.user?.id !== actorId) throw new Error("Sessão alterada.");
      const lead = await supabase
        .from("leads")
        .select("custom_data")
        .eq("workspace_id", workspaceId)
        .eq("id", leadId)
        .maybeSingle();
      if (lead.error || !lead.data) throw new Error("Origem indisponível.");
      const custom = lead.data.custom_data as Record<string, unknown> | null;
      const id = custom?.whatsapp_session_id;
      if (typeof id !== "string" || !id) return null;
      const session = await supabase
        .from("whatsapp_web_sessions")
        .select("phone_number,status")
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .maybeSingle();
      if (session.error || !session.data) throw new Error("Origem indisponível.");
      return session.data;
    },
  });
  if (origin.isPending)
    return (
      <p className="text-[11px] text-muted-foreground" role="status">
        Conferindo WhatsApp de origem...
      </p>
    );
  if (origin.isError)
    return (
      <p className="text-[11px] text-amber-600" role="status">
        WhatsApp de origem indisponível
      </p>
    );
  if (!origin.data)
    return <p className="text-[11px] text-muted-foreground">WhatsApp de origem não vinculado</p>;
  const phone = origin.data.phone_number?.replace(/\D/g, "");
  return (
    <div
      className="min-w-0 rounded-lg border border-emerald-500/20 px-3 py-2 text-[11px]"
      aria-label="Conexão de origem do atendimento"
    >
      <p className="font-semibold">
        WhatsApp de origem: {phone ? `+${phone}` : "número não informado"}
      </p>
      <p className="text-muted-foreground">
        {origin.data.status === "conectado"
          ? "Respostas e automações usam este número."
          : "Desconectado. Reconecte este número; não será usado outro WhatsApp."}
      </p>
    </div>
  );
}
