// Ingestão de respostas de formulário (MKTOn, site externo ou Meta).
// Server-only: usado por submitPublicForm, pela rota pública de ingestão e
// pelo webhook de Lead Ads da Meta.

import type { FormField } from "@/lib/forms.functions";

type AnySb = { from: (t: string) => any };

export interface IngestFormRow {
  id: string;
  workspace_id: string;
  nome: string;
  campos: FormField[];
  auto_criar_lead?: boolean | null;
}

export type FormValues = Record<string, string | number | boolean | null>;

export interface IngestResult {
  ok: true;
  submissionId: string | null;
  leadId: string | null;
  leadCreated: boolean;
}

function normKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Aceita valores vindos por id do campo, pelo label ou por aliases comuns
 * (nome/name, email, telefone/phone) e devolve um mapa por id do campo.
 */
export function mapValuesToFields(campos: FormField[], raw: Record<string, unknown>): FormValues {
  const byKey = new Map<string, unknown>();
  for (const [k, v] of Object.entries(raw ?? {})) byKey.set(normKey(k), v);

  const aliases: Record<string, string[]> = {
    text: ["nome", "name", "full_name", "nome_completo"],
    email: ["email", "e_mail", "mail"],
    phone: ["telefone", "phone", "whatsapp", "celular", "phone_number"],
    value: ["valor", "value", "orcamento", "budget"],
  };

  const out: FormValues = {};
  for (const campo of campos) {
    let v: unknown = raw?.[campo.id];
    if (v === undefined) v = byKey.get(normKey(campo.label));
    if (v === undefined) {
      for (const a of aliases[campo.kind] ?? []) {
        if (byKey.has(a)) { v = byKey.get(a); break; }
      }
    }
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[campo.id] = v;
    else out[campo.id] = String(v);
  }
  return out;
}

export function validateRequired(campos: FormField[], values: FormValues): void {
  for (const campo of campos) {
    if (!campo.required) continue;
    const v = values[campo.id];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      throw new Error(`Preencha o campo "${campo.label}".`);
    }
  }
}

function digits(s: string): string {
  return s.replace(/\D+/g, "");
}

function pickBasics(campos: FormField[], values: FormValues) {
  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let value: number | null = null;
  for (const campo of campos) {
    const raw = values[campo.id];
    if (raw === undefined || raw === null) continue;
    const str = typeof raw === "string" ? raw : String(raw);
    if (!str.trim()) continue;
    if (campo.kind === "text" && !name) name = str.trim();
    else if (campo.kind === "email" && !email) email = str.trim();
    else if (campo.kind === "phone" && !phone) phone = str.trim();
    else if (campo.kind === "value" && value === null) {
      const num = Number(str.replace(/[^0-9.,-]/g, "").replace(",", "."));
      if (Number.isFinite(num)) value = num;
    }
  }
  return { name, email, phone, value };
}

/** Resolve fonte, funil e etapa reais para leads criados por formulário. */
async function ensureFormTarget(admin: AnySb, wsId: string): Promise<{ sourceId: string | null; pipelineId: string | null; stageId: string | null }> {
  let sourceId: string | null = null;
  const { data: existing } = await admin
    .from("crm_sources")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("provider", "mkton")
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  sourceId = (existing as { id?: string } | null)?.id ?? null;
  if (!sourceId) {
    const { data: created } = await admin
      .from("crm_sources")
      .insert({ workspace_id: wsId, provider: "mkton", display_name: "CRM MKTOn", is_default: true })
      .select("id")
      .maybeSingle();
    sourceId = (created as { id?: string } | null)?.id ?? null;
  }

  let pipelineId: string | null = null;
  if (sourceId) {
    const { data: preferred } = await admin
      .from("pipelines")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("crm_source_id", sourceId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    pipelineId = (preferred as { id?: string } | null)?.id ?? null;
  }
  if (!pipelineId) {
    const { data: fallback } = await admin
      .from("pipelines")
      .select("id")
      .eq("workspace_id", wsId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    pipelineId = (fallback as { id?: string } | null)?.id ?? null;
  }

  let stageId: string | null = null;
  if (pipelineId) {
    const { data: stage } = await admin
      .from("pipeline_stages")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("pipeline_id", pipelineId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    stageId = (stage as { id?: string } | null)?.id ?? null;
  }
  return { sourceId, pipelineId, stageId };
}

/**
 * Grava a submissão, identifica (ou cria) o lead e dispara o gatilho
 * "Formulário enviado" das automações.
 */
export async function ingestFormSubmission(
  admin: AnySb,
  args: {
    form: IngestFormRow;
    values: FormValues;
    leadId?: string | null;
    /** origem da resposta, só para log/histórico */
    source?: "mkton" | "externo" | "meta";
  },
): Promise<IngestResult> {
  const f = args.form;
  const values = args.values;
  const source = args.source ?? "mkton";

  validateRequired(f.campos, values);

  const basics = pickBasics(f.campos, values);
  let leadId: string | null = null;
  let leadCreated = false;

  if (args.leadId) {
    const { data: lead } = await admin
      .from("leads")
      .select("id")
      .eq("id", args.leadId)
      .eq("workspace_id", f.workspace_id)
      .maybeSingle();
    if (lead) leadId = (lead as { id: string }).id;
  }

  // Identificação por e-mail / telefone
  if (!leadId && basics.email) {
    const { data: byEmail } = await admin
      .from("leads")
      .select("id")
      .eq("workspace_id", f.workspace_id)
      .ilike("email", basics.email)
      .limit(1)
      .maybeSingle();
    if (byEmail) leadId = (byEmail as { id: string }).id;
  }
  if (!leadId && basics.phone) {
    const d = digits(basics.phone);
    if (d.length >= 8) {
      const { data: byPhone } = await admin
        .from("leads")
        .select("id, phone")
        .eq("workspace_id", f.workspace_id)
        .ilike("phone", `%${d.slice(-8)}%`)
        .limit(1)
        .maybeSingle();
      if (byPhone) leadId = (byPhone as { id: string }).id;
    }
  }

  // Criação automática
  if (!leadId && f.auto_criar_lead !== false && (basics.email || basics.phone || basics.name)) {
    const target = await ensureFormTarget(admin, f.workspace_id);
    const { data: created, error: createErr } = await admin
      .from("leads")
      .insert({
        workspace_id: f.workspace_id,
        crm_source_id: target.sourceId,
        pipeline_id: target.pipelineId,
        stage_id: target.stageId,
        name: basics.name || basics.email || basics.phone || "Lead do formulário",
        email: basics.email,
        phone: basics.phone,
        value: basics.value ?? 0,
        source: source === "meta" ? "meta-form" : source === "externo" ? "formulario-externo" : "formulario",
        tags: ["formulario", f.nome],
      })
      .select("id")
      .maybeSingle();
    if (createErr) throw new Error(createErr.message);
    leadId = (created as { id: string } | null)?.id ?? null;
    leadCreated = !!leadId;
  }

  // Submissão
  const { data: sub, error: subErr } = await admin
    .from("crm_form_submissions")
    .insert({
      workspace_id: f.workspace_id,
      form_id: f.id,
      lead_id: leadId,
      values,
    })
    .select("id")
    .maybeSingle();
  if (subErr) throw new Error(subErr.message);

  if (leadId) {
    const changedFields: Array<{ fieldId?: string; fieldName?: string }> = [];
    const patch: Record<string, unknown> = {};
    if (!leadCreated) {
      if (basics.email) { patch.email = basics.email; changedFields.push({ fieldName: "email" }); }
      if (basics.phone) { patch.phone = basics.phone; changedFields.push({ fieldName: "phone" }); }
      if (basics.value !== null) { patch.value = basics.value; changedFields.push({ fieldName: "value" }); }
    }
    for (const campo of f.campos) {
      const raw = values[campo.id];
      if (raw === undefined || raw === null) continue;
      const str = typeof raw === "string" ? raw : String(raw);
      if (!str.trim()) continue;
      if (campo.customFieldId) {
        await admin.from("lead_custom_field_values").upsert({
          workspace_id: f.workspace_id,
          lead_id: leadId,
          field_id: campo.customFieldId,
          value: { display: str, raw: [str], source: "form", form_id: f.id },
          updated_at: new Date().toISOString(),
        }, { onConflict: "lead_id,field_id" });
        changedFields.push({ fieldId: campo.customFieldId, fieldName: campo.label });
      }
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      await admin.from("leads").update(patch).eq("id", leadId).eq("workspace_id", f.workspace_id);
    }

    const preview = f.campos
      .slice(0, 8)
      .map((c) => `${c.label}: ${values[c.id] ?? "-"}`)
      .join("\n");
    await admin.from("lead_activities").insert({
      workspace_id: f.workspace_id,
      lead_id: leadId,
      type: "note",
      payload: {
        text: `📝 Formulário "${f.nome}" respondido:\n${preview}`,
        source: "form_submission",
        origem: source,
        form_id: f.id,
      },
      occurred_at: new Date().toISOString(),
    });

    try {
      const { dispatchCrmLeadCreated, dispatchCrmFieldUpdated } = await import("@/lib/crm-event-dispatch.server");
      if (leadCreated) {
        const { data: leadTarget } = await admin.from("leads")
          .select("pipeline_id, stage_id")
          .eq("workspace_id", f.workspace_id)
          .eq("id", leadId)
          .maybeSingle();
        await dispatchCrmLeadCreated(admin as never, {
          workspaceId: f.workspace_id,
          leadId,
          pipelineId: (leadTarget as { pipeline_id?: string | null } | null)?.pipeline_id ?? null,
          stageId: (leadTarget as { stage_id?: string | null } | null)?.stage_id ?? null,
        });
      } else {
        for (const field of changedFields) {
          await dispatchCrmFieldUpdated(admin as never, { workspaceId: f.workspace_id, leadId, ...field });
        }
      }
    } catch (err) {
      console.error("[forms-ingest] crm automation dispatch:", err);
    }

    try {
      const { resumeRunsOnFormSubmission } = await import("@/lib/salesbot-runtime.server");
      await resumeRunsOnFormSubmission(admin as never, {
        workspaceId: f.workspace_id,
        leadId,
        formId: f.id,
      });
    } catch (err) {
      console.error("[forms-ingest] resumeRunsOnFormSubmission:", err);
    }
  }

  return {
    ok: true,
    submissionId: (sub as { id: string } | null)?.id ?? null,
    leadId,
    leadCreated,
  };
}
