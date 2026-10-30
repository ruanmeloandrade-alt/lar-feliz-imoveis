// Agendamento público a partir da tela de agradecimento do formulário.
// GET  /api/public/agenda/{slug}?workspace={wsSlug}   -> horários livres
// POST /api/public/agenda/{slug}                      -> reserva o horário

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

async function loadForm(slug: string, workspaceSlug: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let wsId: string | null = null;
  if (workspaceSlug) {
    const { data: ws } = await supabaseAdmin
      .from("workspaces").select("id").eq("slug", workspaceSlug).maybeSingle();
    if (!ws) return { admin: supabaseAdmin, form: null };
    wsId = (ws as { id: string }).id;
  }
  let q = supabaseAdmin
    .from("crm_forms")
    .select("id, nome, workspace_id, branding")
    .eq("slug", slug);
  if (wsId) q = q.eq("workspace_id", wsId);
  const { data } = await q.maybeSingle();
  return {
    admin: supabaseAdmin,
    form: (data ?? null) as null | {
      id: string; nome: string; workspace_id: string; branding: Record<string, unknown> | null;
    },
  };
}

const BookSchema = z.object({
  workspaceSlug: z.string().max(120).optional().nullable(),
  startsAt: z.string().min(10).max(40),
  leadId: z.string().uuid().nullable().optional(),
  name: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const Route = createFileRoute("/api/public/agenda/$slug")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ params, request }) => {
        const slug = (params.slug ?? "").trim();
        if (!slug) return json({ ok: false, error: "Formulário inválido." }, 400);
        const wsSlug = new URL(request.url).searchParams.get("workspace");
        const { admin, form } = await loadForm(slug, wsSlug);
        if (!form) return json({ ok: false, error: "Formulário não encontrado." }, 404);

        const branding = (form.branding ?? {}) as { thanksButtonMode?: string; scheduling?: unknown };
        if (branding.thanksButtonMode !== "agendamento") {
          return json({ ok: false, error: "Agendamento não habilitado." }, 400);
        }

        const { normalizeScheduling, buildSlots } = await import("@/lib/form-scheduling.server");
        const cfg = normalizeScheduling(branding.scheduling as never);
        const days = await buildSlots(admin as never, form.workspace_id, cfg);
        return json({ ok: true, durationMin: cfg.durationMin, days });
      },

      POST: async ({ params, request }) => {
        const slug = (params.slug ?? "").trim();
        if (!slug) return json({ ok: false, error: "Formulário inválido." }, 400);

        let parsed: z.infer<typeof BookSchema>;
        try {
          parsed = BookSchema.parse(await request.json());
        } catch {
          return json({ ok: false, error: "Dados inválidos." }, 400);
        }

        const { admin, form } = await loadForm(slug, parsed.workspaceSlug ?? null);
        if (!form) return json({ ok: false, error: "Formulário não encontrado." }, 404);

        const branding = (form.branding ?? {}) as { thanksButtonMode?: string; scheduling?: unknown };
        if (branding.thanksButtonMode !== "agendamento") {
          return json({ ok: false, error: "Agendamento não habilitado." }, 400);
        }

        const { normalizeScheduling, bookFormMeeting } = await import("@/lib/form-scheduling.server");
        const cfg = normalizeScheduling(branding.scheduling as never);

        // O lead precisa pertencer ao mesmo workspace do formulário
        let leadId: string | null = null;
        if (parsed.leadId) {
          const { data: lead } = await admin
            .from("leads").select("id")
            .eq("id", parsed.leadId).eq("workspace_id", form.workspace_id).maybeSingle();
          if (lead) leadId = (lead as { id: string }).id;
        }

        try {
          const result = await bookFormMeeting(admin as never, cfg, {
            workspaceId: form.workspace_id,
            formId: form.id,
            formName: form.nome,
            leadId,
            startsAt: parsed.startsAt,
            name: parsed.name ?? null,
            email: parsed.email || null,
            phone: parsed.phone ?? null,
            note: parsed.note ?? null,
          });
          return json(result);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Não foi possível agendar.";
          console.error("[agenda pública]", e);
          return json({ ok: false, error: msg }, 400);
        }
      },
    },
  },
});
