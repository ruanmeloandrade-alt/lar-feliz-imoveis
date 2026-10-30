import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WorkspaceOnly = z.object({ workspaceId: z.string().uuid() });

async function assertMember(supabase: unknown, workspaceId: string, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { data, error } = await s
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a este workspace");
}

type ConversionDefinition = {
  id: string;
  event_name: string;
  active: boolean;
};

type ConversionOccurrence = {
  event_row_id: number | null;
  value: number | null;
  currency: string | null;
};

type TrackingEvent = {
  id: number;
  event_name: string;
};

/**
 * Retorna ocorrências reais das conversões configuradas nos últimos 30 dias.
 * A agregação parte de tracking_conversion_events (fonte canônica de resultado)
 * e usa event_row_id apenas para identificar a definição/event_name responsável.
 */
export const getTrackingConversionStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = supabase as any;
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [definitionsResult, occurrencesResult] = await Promise.all([
      s
        .from("tracking_conversions")
        .select("id, event_name, active")
        .eq("workspace_id", data.workspaceId),
      s
        .from("tracking_conversion_events")
        .select("event_row_id, value, currency")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", since)
        .limit(20000),
    ]);

    if (definitionsResult.error) throw new Error(definitionsResult.error.message);
    if (occurrencesResult.error) throw new Error(occurrencesResult.error.message);

    const definitions = (definitionsResult.data ?? []) as ConversionDefinition[];
    const occurrences = (occurrencesResult.data ?? []) as ConversionOccurrence[];
    const eventIds = [...new Set(occurrences.map((row) => row.event_row_id).filter((id): id is number => id != null))];

    let events: TrackingEvent[] = [];
    if (eventIds.length > 0) {
      const { data: eventRows, error } = await s
        .from("tracking_events")
        .select("id, event_name")
        .eq("workspace_id", data.workspaceId)
        .in("id", eventIds);
      if (error) throw new Error(error.message);
      events = (eventRows ?? []) as TrackingEvent[];
    }

    const eventNameById = new Map(events.map((row) => [row.id, row.event_name]));
    const statsByEvent = new Map<string, { count: number; valueBRL: number }>();

    for (const occurrence of occurrences) {
      if (occurrence.event_row_id == null) continue;
      const eventName = eventNameById.get(occurrence.event_row_id);
      if (!eventName) continue;
      const current = statsByEvent.get(eventName) ?? { count: 0, valueBRL: 0 };
      current.count += 1;
      if (String(occurrence.currency ?? "BRL").toUpperCase() === "BRL") {
        current.valueBRL += Number(occurrence.value ?? 0);
      }
      statsByEvent.set(eventName, current);
    }

    return definitions.map((definition) => {
      const stats = statsByEvent.get(definition.event_name) ?? { count: 0, valueBRL: 0 };
      return {
        id: definition.id,
        eventName: definition.event_name,
        active: definition.active,
        count: stats.count,
        valueBRL: stats.valueBRL,
      };
    });
  });
