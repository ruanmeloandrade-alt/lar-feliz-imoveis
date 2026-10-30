import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type AnySb = { from: (t: string) => any; rpc?: (...a: unknown[]) => any };

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const wsId = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

export type SnapshotJson = string | number | boolean | null | SnapshotJson[] | { [k: string]: SnapshotJson };

export type MetricScope = "meta" | "social" | "tracking" | "crm" | "whatsapp";

export interface MetricSnapshotDTO {
  id: string;
  scope: MetricScope;
  metricKey: string;
  period: string;
  data: Record<string, SnapshotJson>;
  capturedAt: string;
}

const scopeSchema = z.enum(["meta", "social", "tracking", "crm", "whatsapp"]);

function toDTO(row: Record<string, any>): MetricSnapshotDTO {
  return {
    id: row.id as string,
    scope: row.scope as MetricScope,
    metricKey: row.metric_key as string,
    period: row.period as string,
    data: (row.data ?? {}) as Record<string, SnapshotJson>,
    capturedAt: row.captured_at as string,
  };
}

/** Salva (ou atualiza) o "print" de uma métrica, evitando manter dados brutos vivos no sistema. */
export const saveMetricSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: scopeSchema,
        metricKey: z.string().min(1).max(120),
        period: z.string().min(1).max(60).optional().default("current"),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const { data: row, error } = await sb
      .from("metric_snapshots")
      .upsert(
        {
          workspace_id: wsId,
          scope: data.scope,
          metric_key: data.metricKey,
          period: data.period,
          data: data.data,
          captured_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,scope,metric_key,period" },
      )
      .select("id, scope, metric_key, period, data, captured_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? toDTO(row) : null;
  });

/** Salva vários prints de uma vez (usado ao sincronizar Meta/Social/Tracking). */
export const saveMetricSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: scopeSchema,
        period: z.string().min(1).max(60).optional().default("current"),
        items: z
          .array(z.object({ metricKey: z.string().min(1).max(120), data: z.record(z.string(), z.unknown()) }))
          .min(1)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const now = new Date().toISOString();

    const { error } = await sb.from("metric_snapshots").upsert(
      data.items.map((i) => ({
        workspace_id: wsId,
        scope: data.scope,
        metric_key: i.metricKey,
        period: data.period,
        data: i.data,
        captured_at: now,
      })),
      { onConflict: "workspace_id,scope,metric_key,period" },
    );
    if (error) throw new Error(error.message);
    return { saved: data.items.length, capturedAt: now };
  });

/** Lê os prints já salvos, sem precisar bater nas APIs externas. */
export const listMetricSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: scopeSchema.optional(),
        period: z.string().min(1).max(60).optional(),
        limit: z.number().int().min(1).max(500).optional().default(200),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    let q = sb
      .from("metric_snapshots")
      .select("id, scope, metric_key, period, data, captured_at")
      .eq("workspace_id", wsId);
    if (data.scope) q = q.eq("scope", data.scope);
    if (data.period) q = q.eq("period", data.period);

    const { data: rows, error } = await q.order("captured_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    const snapshots = ((rows ?? []) as Array<Record<string, any>>).map(toDTO);
    const lastCapturedAt = snapshots.length > 0 ? snapshots[0].capturedAt : null;
    return { snapshots, lastCapturedAt };
  });

/** Limpa dados brutos antigos (mensagens com 15+ dias e logs com 30+ dias). */
export const purgeOldRawPayloads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb.rpc!("purge_old_raw_payloads");
    if (error) throw new Error(error.message);
    return { ok: true, ranAt: new Date().toISOString() };
  });
