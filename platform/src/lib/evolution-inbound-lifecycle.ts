export type EvolutionInboundDispatchStatus = "pending" | "dispatched" | "error";

export function shouldDispatchEvolutionInbound(input: {
  fromMe: boolean;
  activityExists: boolean;
  dispatchStatus: unknown;
}): boolean {
  if (input.fromMe) return false;
  if (!input.activityExists) return true;
  return input.dispatchStatus !== "dispatched";
}

export function withEvolutionDispatchStatus(
  payload: Record<string, unknown>,
  status: EvolutionInboundDispatchStatus,
  error?: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...payload,
    inbound_dispatch_status: status,
    inbound_dispatch_updated_at: new Date().toISOString(),
  };
  if (status === "error") next.inbound_dispatch_error = error ?? "dispatch_error";
  else delete next.inbound_dispatch_error;
  if (status === "dispatched") next.inbound_dispatched_at = new Date().toISOString();
  return next;
}
