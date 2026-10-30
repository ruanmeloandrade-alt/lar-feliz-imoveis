/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySb = { from: (table: string) => any };

/**
 * Conquista atomicamente o direito de processar um turno do Agent IA.
 * Só uma execução consegue trocar waiting_message -> running para a mesma run.
 */
export async function claimSalesbotAiTurn(
  supabaseAdmin: AnySb,
  params: { runId: string; workspaceId: string },
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("salesbot_runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", params.runId)
    .eq("workspace_id", params.workspaceId)
    .eq("status", "waiting_message")
    .select("id");

  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}
