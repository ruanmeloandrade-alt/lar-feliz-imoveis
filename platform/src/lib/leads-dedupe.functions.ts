import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadEffectivePermissions } from "@/lib/permissions-core.functions";
import { scopeOf, allowedPipelines } from "@/lib/permissions-core";

type AnySb = {
  from: (t: string) => any;
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function loadActiveWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const wsId = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

export type DuplicateReason = "phone" | "email" | "instagram" | "name";

export interface DuplicateLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stageName: string | null;
  pipelineName: string | null;
  value: number;
  createdAt: string;
  updatedAt: string;
  company: string | null;
  instagram: string | null;
  website: string | null;
  country: string | null;
  niche: string | null;
  tags: string[];
}

export interface DuplicateGroup {
  signature: string;
  reason: DuplicateReason;
  key: string;
  leads: DuplicateLead[];
}

type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phone_normalized: string | null;
  value: number | null;
  created_at: string;
  updated_at: string;
  custom_data: Record<string, unknown> | null;
  tags: unknown;
  pipelines: { name: string } | null;
  pipeline_stages: { name: string } | null;
};

function toLead(r: LeadRow): DuplicateLead {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    stageName: r.pipeline_stages?.name ?? null,
    pipelineName: r.pipelines?.name ?? null,
    value: Number(r.value ?? 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    company: strOrNull((r.custom_data ?? {}).company_name),
    instagram: strOrNull((r.custom_data ?? {}).instagram_handle),
    website: strOrNull((r.custom_data ?? {}).website_url),
    country: strOrNull((r.custom_data ?? {}).country),
    niche: strOrNull((r.custom_data ?? {}).niche),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
  };
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}


function signatureOf(reason: DuplicateReason, key: string, ids: string[]): string {
  const sorted = [...ids].sort();
  return `${reason}:${key}:${sorted.join("|")}`;
}

export const findDuplicateLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const eff = await loadEffectivePermissions(sb, context.userId, wsId);
    if (scopeOf(eff, "crm", "leads", "view") === "none") return { groups: [] as DuplicateGroup[] };

    const pipelines = allowedPipelines(eff, "crm");
    let q = sb
      .from("leads")
      .select("id, name, email, phone, phone_normalized, value, created_at, updated_at, custom_data, tags, pipelines(name), pipeline_stages(name)")
      .eq("workspace_id", wsId)
      .eq("status", "active")
      .limit(5000);
    if (pipelines) {
      if (pipelines.length === 0) return { groups: [] as DuplicateGroup[] };
      q = q.in("pipeline_id", pipelines);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as LeadRow[];

    const byPhone = new Map<string, LeadRow[]>();
    const byEmail = new Map<string, LeadRow[]>();
    const byInsta = new Map<string, LeadRow[]>();

    for (const r of rows) {
      const p = (r.phone_normalized ?? "").replace(/^0+/, "");
      if (p.length >= 8) {
        const key = p.slice(-11);
        (byPhone.get(key) ?? byPhone.set(key, []).get(key)!).push(r);
      }
      const e = (r.email ?? "").trim().toLowerCase();
      if (e) (byEmail.get(e) ?? byEmail.set(e, []).get(e)!).push(r);
      const insta = String((r.custom_data ?? {}).instagram_handle ?? "").trim().toLowerCase().replace(/^@/, "");
      if (insta) (byInsta.get(insta) ?? byInsta.set(insta, []).get(insta)!).push(r);
    }

    // dismissals
    const { data: dis } = await sb
      .from("lead_dedupe_dismissals")
      .select("signature")
      .eq("workspace_id", wsId);
    const dismissed = new Set(((dis ?? []) as { signature: string }[]).map((d) => d.signature));

    const groups: DuplicateGroup[] = [];
    const pushGroup = (reason: DuplicateReason, key: string, list: LeadRow[]) => {
      if (list.length < 2) return;
      const ids = list.map((l) => l.id);
      const sig = signatureOf(reason, key, ids);
      if (dismissed.has(sig)) return;
      groups.push({ signature: sig, reason, key, leads: list.map(toLead) });
    };
    for (const [k, list] of byPhone) pushGroup("phone", k, list);
    for (const [k, list] of byEmail) pushGroup("email", k, list);
    for (const [k, list] of byInsta) pushGroup("instagram", k, list);

    // dedupe overlapping groups (mesmo conjunto de ids) mantendo o de maior sinal
    const seen = new Set<string>();
    const unique = groups.filter((g) => {
      const key = g.leads.map((l) => l.id).sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => b.leads.length - a.leads.length);
    return { groups: unique.slice(0, 100) };
  });

export const dismissDuplicateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ signature: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb
      .from("lead_dedupe_dismissals")
      .insert({ workspace_id: wsId, signature: data.signature, dismissed_by: context.userId });
    if (error && !/duplicate key/i.test(error.message ?? "")) throw new Error(error.message);
    return { ok: true };
  });

export const mergeLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      primaryId: z.string().uuid(),
      mergedIds: z.array(z.string().uuid()).min(1).max(10),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const eff = await loadEffectivePermissions(sb, context.userId, wsId);
    if (scopeOf(eff, "crm", "leads", "edit") === "none") {
      throw new Error("Sem permissão para mesclar leads.");
    }
    if (data.mergedIds.includes(data.primaryId)) {
      throw new Error("O lead principal não pode estar na lista de mesclados.");
    }

    const allIds = [data.primaryId, ...data.mergedIds];
    const { data: rows, error } = await sb
      .from("leads")
      .select("id, workspace_id, name, email, phone, value, tags, custom_data, status")
      .in("id", allIds);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      id: string; workspace_id: string; name: string; email: string | null; phone: string | null;
      value: number | null; tags: unknown; custom_data: Record<string, unknown> | null; status: string;
    }>;
    if (list.length !== allIds.length) throw new Error("Lead(s) não encontrado(s).");
    if (list.some((l) => l.workspace_id !== wsId)) throw new Error("Leads de workspaces diferentes.");
    if (list.some((l) => l.status !== "active")) throw new Error("Algum lead já não está ativo.");

    const primary = list.find((l) => l.id === data.primaryId)!;
    const merged = list.filter((l) => l.id !== data.primaryId);

    // Merge campos: primário mantém name/stage/responsible; email/phone preenche do primeiro que tiver
    const email = primary.email ?? merged.find((m) => m.email)?.email ?? null;
    const phone = primary.phone ?? merged.find((m) => m.phone)?.phone ?? null;
    const value = Math.max(Number(primary.value ?? 0), ...merged.map((m) => Number(m.value ?? 0)));
    const tagsAll = new Set<string>();
    (Array.isArray(primary.tags) ? (primary.tags as string[]) : []).forEach((t) => tagsAll.add(t));
    for (const m of merged) (Array.isArray(m.tags) ? (m.tags as string[]) : []).forEach((t) => tagsAll.add(t));

    const mergedCustom: Record<string, unknown> = { ...(primary.custom_data ?? {}) };
    const historic: Array<Record<string, unknown>> = [];
    for (const m of merged) {
      historic.push({
        id: m.id, name: m.name, email: m.email, phone: m.phone, value: m.value,
        custom_data: m.custom_data ?? {},
      });
    }
    mergedCustom.merged_history = [
      ...((mergedCustom.merged_history as unknown[] | undefined) ?? []),
      ...historic,
    ];

    const { error: upErr } = await sb
      .from("leads")
      .update({
        email, phone, value,
        tags: Array.from(tagsAll),
        custom_data: mergedCustom,
      })
      .eq("id", primary.id);
    if (upErr) throw new Error(upErr.message);

    const mergedIds = merged.map((m) => m.id);

    // Reatribui filhos ao primário
    for (const table of ["lead_activities", "tasks", "lead_products", "lead_custom_field_values", "inbox_label_assignments"]) {
      const { error: e2 } = await sb.from(table).update({ lead_id: primary.id }).in("lead_id", mergedIds);
      if (e2 && !/column .* does not exist/i.test(e2.message ?? "")) {
        // continua; algumas tabelas podem não ter lead_id em variantes futuras
        console.warn(`merge move ${table}: ${e2.message}`);
      }
    }

    // Marca leads como mesclados
    const { error: e3 } = await sb
      .from("leads")
      .update({ status: "merged", merged_into_id: primary.id })
      .in("id", mergedIds);
    if (e3) throw new Error(e3.message);

    // Atividade no primário
    await sb.from("lead_activities").insert({
      workspace_id: wsId,
      lead_id: primary.id,
      type: "merge",
      payload: { merged_ids: mergedIds, at: new Date().toISOString(), by: context.userId },
    });

    return { ok: true, primaryId: primary.id, mergedCount: mergedIds.length };
  });
