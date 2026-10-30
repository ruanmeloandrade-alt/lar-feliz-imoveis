import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Inbound webhook: N8N / Make → MKTOn.
// URL: /api/public/webhook-in/<n8n|make>/<inbound_token>
// Assinatura: header X-MKTOn-Signature: sha256=<hmac_hex(body, inbound_secret)>

const ActionSchema = z.object({
  action: z.enum([
    "create_lead",
    "update_lead",
    "move_stage",
    "add_tag",
    "add_note",
    "send_whatsapp_message",
    "create_task",
    "register_conversion",
  ]),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const Route = createFileRoute("/api/public/webhook-in/$provider/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { provider, token } = params as { provider: string; token: string };
        if (!["n8n", "make", "zapier", "custom"].includes(provider)) {
          return json({ error: "Provider inválido." }, 400);
        }

        const body = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row } = await supabaseAdmin
          .from("external_automations")
          .select("id, workspace_id, provider, inbound_secret, status, metadata")
          .eq("inbound_token", token)
          .maybeSingle();

        if (!row || row.provider !== provider) {
          return json({ error: "Token inválido." }, 401);
        }
        if (row.status !== "connected") {
          return json({ error: "Automação desativada." }, 403);
        }

        const signature = request.headers.get("x-mkton-signature");
        const { verifySignature } = await import("@/lib/external-automations.server");
        const { normalizeOptions } = await import("@/lib/external-automations-events");
        const options = normalizeOptions(
          ((row.metadata ?? {}) as Record<string, unknown>).options,
          provider as "n8n" | "make" | "zapier" | "custom",
        );
        // Quando a assinatura não é exigida, o token secreto da URL já autentica a chamada.
        if (options.requireInboundSignature && !verifySignature(row.inbound_secret, body, signature)) {
          await logInbound(supabaseAdmin, row, "auth.fail", body, "assinatura inválida", 401);
          return json({ error: "Assinatura inválida." }, 401);
        }

        let parsed: z.infer<typeof ActionSchema>;
        try {
          parsed = ActionSchema.parse(JSON.parse(body));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "payload inválido";
          await logInbound(supabaseAdmin, row, "parse.fail", body, msg, 400);
          return json({ error: msg }, 400);
        }

        try {
          const result = await runAction(supabaseAdmin, row.workspace_id, parsed);
          await logInbound(supabaseAdmin, row, parsed.action, body, null, 200);
          return json({ ok: true, ...result }, 200);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "erro ao executar ação";
          await logInbound(supabaseAdmin, row, parsed.action, body, msg, 500);
          return json({ error: msg }, 500);
        }
      },
    },
  },
});

type AdminSb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function logInbound(
  sb: AdminSb,
  row: { id: string; workspace_id: string; provider: string },
  event: string,
  body: string,
  errorMsg: string | null,
  httpStatus: number,
) {
  await sb.from("external_automation_logs").insert({
    workspace_id: row.workspace_id,
    automation_id: row.id,
    provider: row.provider,
    direction: "inbound",
    event,
    payload: safeJson(body) as never,
    http_status: httpStatus,
    status: httpStatus >= 200 && httpStatus < 300 ? "ok" : "failed",
    error: errorMsg,
  });
}

function safeJson(body: string): Record<string, unknown> | null {
  try { return JSON.parse(body); } catch { return { raw: body.slice(0, 500) }; }
}

/**
 * Executa uma ação inbound. Mantém-se enxuto e conservador, cada ação
 * insere/atualiza dados escopados ao workspace da automação.
 */
async function runAction(
  sb: AdminSb,
  workspaceId: string,
  { action, data }: z.infer<typeof ActionSchema>,
): Promise<Record<string, unknown>> {
  const d = data as Record<string, unknown>;
  switch (action) {
    case "create_lead": {
      const name = String(d.name ?? "").trim() || "Lead externo";
      const email = d.email ? String(d.email).toLowerCase() : null;
      const phone = d.phone ? String(d.phone) : null;
      const phoneDigits = phone ? phone.replace(/\D/g, "") : null;
      const { data: source } = await (sb.from("crm_sources") as unknown as {
        select: (c: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string } | null }> } } };
      }).select("id").eq("workspace_id", workspaceId).eq("provider", "mkton").maybeSingle();
      const { data: pipeline } = await (sb.from("pipelines") as unknown as {
        select: (c: string) => { eq: (k: string, v: string) => { order: (c: string, o: unknown) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: { id: string } | null }> } } } };
      }).select("id").eq("workspace_id", workspaceId).order("created_at", { ascending: true }).limit(1).maybeSingle();
      let stageId: string | null = null;
      if (pipeline?.id) {
        const { data: firstStage } = await sb.from("pipeline_stages")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("pipeline_id", pipeline.id)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();
        stageId = (firstStage as { id?: string } | null)?.id ?? null;
      }
      const insertRow: Record<string, unknown> = {
        workspace_id: workspaceId,
        crm_source_id: source?.id ?? null,
        pipeline_id: pipeline?.id ?? null,
        stage_id: stageId,
        name,
        email,
        phone,
        phone_normalized: phoneDigits,
        source: `inbound-${action}`,
        custom_data: d.custom ?? {},
      };
      const { data: inserted } = await (sb.from("leads") as unknown as {
        insert: (v: unknown) => { select: (c: string) => { maybeSingle: () => Promise<{ data: { id: string } | null }> } };
      }).insert(insertRow).select("id").maybeSingle();
      if (inserted?.id) {
        const { dispatchCrmLeadCreated } = await import("@/lib/crm-event-dispatch.server");
        await dispatchCrmLeadCreated(sb as never, {
          workspaceId,
          leadId: inserted.id,
          pipelineId: pipeline?.id ?? null,
          stageId,
        });
      }
      return { lead_id: inserted?.id ?? null };
    }
    case "update_lead": {
      const id = String(d.lead_id ?? "");
      if (!id) throw new Error("lead_id obrigatório");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["name", "email", "phone", "value", "notes"]) {
        if (d[k] !== undefined) patch[k] = d[k];
      }
      await (sb.from("leads") as unknown as { update: (v: unknown) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => Promise<unknown> } } })
        .update(patch).eq("id", id).eq("workspace_id", workspaceId);
      const { dispatchCrmFieldUpdated } = await import("@/lib/crm-event-dispatch.server");
      for (const fieldName of ["name", "email", "phone", "value"] as const) {
        if (d[fieldName] !== undefined) await dispatchCrmFieldUpdated(sb as never, { workspaceId, leadId: id, fieldName });
      }
      return { lead_id: id };
    }
    case "move_stage": {
      const id = String(d.lead_id ?? "");
      const stageId = String(d.stage_id ?? "");
      if (!id || !stageId) throw new Error("lead_id e stage_id obrigatórios");
      const { data: stage } = await sb.from("pipeline_stages").select("pipeline_id")
        .eq("id", stageId).eq("workspace_id", workspaceId).maybeSingle();
      if (!stage) throw new Error("Etapa não pertence a este workspace.");
      const pipelineId = (stage as { pipeline_id: string }).pipeline_id;
      const { data: lead } = await sb.from("leads").select("stage_id").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      if (!lead) throw new Error("Lead não pertence a este workspace.");
      await sb.from("leads").update({ stage_id: stageId, pipeline_id: pipelineId, updated_at: new Date().toISOString() })
        .eq("id", id).eq("workspace_id", workspaceId);
      const { dispatchCrmStageMoved } = await import("@/lib/crm-event-dispatch.server");
      await dispatchCrmStageMoved(sb as never, {
        workspaceId, leadId: id, newStageId: stageId, newPipelineId: pipelineId,
        fromStageId: (lead as { stage_id?: string | null }).stage_id ?? null,
      });
      return { lead_id: id, stage_id: stageId, pipeline_id: pipelineId };
    }
    case "add_note": {
      const id = String(d.lead_id ?? "");
      const text = String(d.text ?? "").trim();
      if (!id || !text) throw new Error("lead_id e text obrigatórios");
      await (sb.from("lead_activities") as unknown as { insert: (v: unknown) => Promise<unknown> }).insert({
        workspace_id: workspaceId,
        lead_id: id,
        type: "note",
        payload: { text, source: "external-automation" } as never,
      });
      return { lead_id: id };
    }
    case "add_tag": {
      const id = String(d.lead_id ?? "");
      const tag = String(d.tag ?? "").trim();
      if (!id || !tag) throw new Error("lead_id e tag obrigatórios");
      const { data: lead } = await sb.from("leads").select("tags").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      if (!lead) throw new Error("Lead não pertence a este workspace.");
      const tags = Array.isArray((lead as { tags?: unknown }).tags) ? ((lead as { tags: unknown[] }).tags.map(String)) : [];
      const exists = tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase());
      if (!exists) {
        tags.push(tag);
        await sb.from("leads").update({ tags, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
        const { dispatchCrmTagAdded } = await import("@/lib/crm-event-dispatch.server");
        await dispatchCrmTagAdded(sb as never, { workspaceId, leadId: id, tags: [tag] });
      }
      return { lead_id: id, tag };
    }
    case "create_task": {
      const title = String(d.title ?? "").trim();
      if (!title) throw new Error("title obrigatório");
      await (sb.from("tasks") as unknown as { insert: (v: unknown) => Promise<unknown> }).insert({
        workspace_id: workspaceId,
        title,
        description: d.description ? String(d.description) : null,
        due_at: d.due_at ? String(d.due_at) : null,
        lead_id: d.lead_id ? String(d.lead_id) : null,
        status: "pending",
      });
      return { ok: true };
    }
    case "register_conversion": {
      await (sb.from("tracking_conversions") as unknown as { insert: (v: unknown) => Promise<unknown> }).insert({
        workspace_id: workspaceId,
        event_name: String(d.event_name ?? "conversion"),
        value: typeof d.value === "number" ? d.value : null,
        currency: d.currency ? String(d.currency) : "BRL",
        payload: (d.payload ?? d) as never,
      });
      return { ok: true };
    }
    case "send_whatsapp_message": {
      throw new Error("Ação send_whatsapp_message ainda não disponível via inbound.");
    }
  }
}
