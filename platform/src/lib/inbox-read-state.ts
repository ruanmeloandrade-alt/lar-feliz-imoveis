export type InboxReadActivity = {
  lead_id: string;
  type: string;
  occurred_at: string;
};

/**
 * Recebe atividades em ordem decrescente e conta mensagens inbound ainda não
 * vistas. Uma resposta humana/bot (`message_out`) ou um marcador explícito
 * (`conversation_read`) encerra a janela de não lidas daquele lead.
 */
export function computeUnreadCountsFromActivities(rows: InboxReadActivity[]) {
  const unread = new Map<string, number>();
  const barrierSeen = new Set<string>();
  for (const row of rows) {
    if (row.type === "conversation_read" || row.type === "message_out") {
      barrierSeen.add(row.lead_id);
      continue;
    }
    if (row.type === "message_in" && !barrierSeen.has(row.lead_id)) {
      unread.set(row.lead_id, (unread.get(row.lead_id) ?? 0) + 1);
    }
  }
  return unread;
}
