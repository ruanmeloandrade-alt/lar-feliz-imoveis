export type LeadActivityMessageRow = {
  type?: string | null;
  payload?: Record<string, unknown> | null;
  occurred_at?: string | null;
};

export function leadActivitiesToAiHistory(
  rows: LeadActivityMessageRow[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return rows
    .slice()
    .reverse()
    .filter((row) => row.type === "message_in" || row.type === "message_out")
    .map((row) => ({
      role: row.type === "message_in" ? ("user" as const) : ("assistant" as const),
      content: typeof row.payload?.text === "string" ? row.payload.text.trim() : "",
    }))
    .filter((row) => row.content.length > 0);
}

export function isFreshInboundLeadMessage(params: {
  fromMe: boolean;
  alreadyLogged: boolean;
}): boolean {
  return !params.fromMe && !params.alreadyLogged;
}
