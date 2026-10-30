// Contexto multicanal do Gestor de Tráfego.
// Preserva o contexto Meta existente e agrega Google Ads + TikTok Ads quando conectados.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildGestorContext as buildMetaGestorContext } from "./gestor-context.meta.server";
import { buildPaidMediaProviderContext } from "./gestor-paid-media-tools.server";

export async function buildGestorContext(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<string> {
  const [meta, crossNetwork] = await Promise.all([
    buildMetaGestorContext(supabase, workspaceId).catch(
      (e) => `## Meta Ads\nContexto indisponível: ${(e as Error).message}`,
    ),
    buildPaidMediaProviderContext(supabase, workspaceId).catch(
      (e) => `## Google Ads / TikTok Ads\nContexto indisponível: ${(e as Error).message}`,
    ),
  ]);

  return [meta, crossNetwork].filter(Boolean).join("\n\n");
}
