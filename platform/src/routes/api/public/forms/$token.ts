// Endpoint público de ingestão de formulários externos:
// POST https://saudeslim.com.br/api/public/forms/{ingestToken}
// Body: { "email": "...", "nome": "...", "telefone": "...", ... }
// A chave no corpo pode ser o id do campo, o label ou um alias comum.

import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, idempotency-key",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(",")}}`;
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/forms/$token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      // Definição pública do formulário (usada pelo script de incorporação
      // que monta o formulário direto na página do cliente).
      GET: async ({ params }) => {
        const token = (params.token ?? "").trim();
        if (!/^[a-f0-9]{16,128}$/i.test(token)) {
          return json({ ok: false, error: "Chave inválida." }, 401);
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form } = await supabaseAdmin
          .from("crm_forms")
          .select("nome, descricao, campos, branding")
          .eq("ingest_token", token)
          .maybeSingle();
        if (!form) return json({ ok: false, error: "Formulário não encontrado." }, 404);
        const f = form as unknown as {
          nome: string; descricao: string | null; campos: unknown[]; branding: Record<string, unknown> | null;
        };
        return json({
          ok: true,
          nome: f.nome,
          descricao: f.descricao,
          campos: f.campos ?? [],
          branding: f.branding ?? {},
        });
      },
      POST: async ({ request, params }) => {
        const token = (params.token ?? "").trim();
        if (!/^[a-f0-9]{16,128}$/i.test(token)) {
          return json({ ok: false, error: "Chave inválida." }, 401);
        }

        const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
        if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 240)) {
          return json({ ok: false, error: "Idempotency-Key inválida." }, 400);
        }

        let payload: unknown;
        try {
          const ct = request.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            payload = await request.json();
          } else {
            const fd = await request.formData();
            payload = Object.fromEntries(Array.from(fd.entries()).map(([k, v]) => [k, String(v)]));
          }
        } catch {
          return json({ ok: false, error: "Corpo inválido." }, 400);
        }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          return json({ ok: false, error: "Corpo inválido." }, 400);
        }
        const raw = payload as Record<string, unknown>;
        if (Object.keys(raw).length > 80) {
          return json({ ok: false, error: "Muitos campos enviados." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form } = await supabaseAdmin
          .from("crm_forms")
          .select("id, workspace_id, nome, campos, auto_criar_lead")
          .eq("ingest_token", token)
          .maybeSingle();
        if (!form) return json({ ok: false, error: "Formulário não encontrado." }, 404);

        const { ingestFormSubmission, mapValuesToFields } = await import("@/lib/forms-ingest.server");
        const f = form as unknown as {
          id: string; workspace_id: string; nome: string; campos: any[]; auto_criar_lead?: boolean | null;
        };

        let idempotencyRequestId: string | null = null;
        if (idempotencyKey) {
          const requestHash = await sha256Hex(raw);
          const { data: claimData, error: claimError } = await supabaseAdmin.rpc(
            "claim_crm_form_ingest_idempotency_v1",
            {
              p_form_id: f.id,
              p_idempotency_key: idempotencyKey,
              p_request_hash: requestHash,
            },
          );
          if (claimError) {
            console.error("[forms ingest] idempotency claim", claimError);
            return json({ ok: false, error: "Falha ao proteger a requisição contra duplicidade." }, 500);
          }

          const claim = (Array.isArray(claimData) ? claimData[0] : claimData) as {
            disposition?: string;
            request_id?: string;
            cached_status?: number | null;
            cached_response?: Record<string, unknown> | null;
          } | null;

          if (!claim?.request_id || !claim.disposition) {
            return json({ ok: false, error: "Resposta inválida do controle de idempotência." }, 500);
          }

          if (claim.disposition === "conflict") {
            return json({ ok: false, error: "Idempotency-Key já foi usada com outro conteúdo.", idempotency: "conflict" }, 409);
          }
          if (claim.disposition === "in_progress") {
            return json({ ok: false, error: "Requisição com esta Idempotency-Key ainda está em processamento.", idempotency: "in_progress" }, 409);
          }
          if (claim.disposition === "replay") {
            const cached = claim.cached_response && typeof claim.cached_response === "object"
              ? claim.cached_response
              : { ok: false, error: "Resposta idempotente indisponível." };
            return json({ ...cached, deduplicated: true, idempotency: "strong" }, claim.cached_status ?? 200);
          }
          if (claim.disposition !== "claimed") {
            return json({ ok: false, error: "Estado inválido do controle de idempotência." }, 500);
          }
          idempotencyRequestId = claim.request_id;
        }

        try {
          const values = mapValuesToFields(f.campos ?? [], raw);
          const result = await ingestFormSubmission(supabaseAdmin as never, {
            form: f as never,
            values,
            leadId: typeof raw.leadId === "string" ? raw.leadId : null,
            source: "externo",
          });
          const responseBody = {
            ok: true,
            submissionId: result.submissionId,
            leadId: result.leadId,
            leadCreated: result.leadCreated,
            deduplicated: false,
            idempotency: idempotencyKey ? "strong" : "none",
          };

          if (idempotencyRequestId) {
            const { error: completeError } = await supabaseAdmin.rpc(
              "complete_crm_form_ingest_idempotency_v1",
              {
                p_request_id: idempotencyRequestId,
                p_status: 200,
                p_response: responseBody,
              },
            );
            if (completeError) {
              console.error("[forms ingest] idempotency complete", completeError);
              return json({ ok: false, error: "Resposta registrada, mas a confirmação idempotente falhou." }, 500);
            }
          }

          return json(responseBody);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Falha ao registrar resposta.";
          const responseBody = {
            ok: false,
            error: msg,
            deduplicated: false,
            idempotency: idempotencyKey ? "strong" : "none",
          };

          if (idempotencyRequestId) {
            const { error: failError } = await supabaseAdmin.rpc(
              "fail_crm_form_ingest_idempotency_v1",
              {
                p_request_id: idempotencyRequestId,
                p_status: 400,
                p_response: responseBody,
                p_error: msg,
              },
            );
            if (failError) console.error("[forms ingest] idempotency fail", failError);
          }

          console.error("[forms ingest]", e);
          return json(responseBody, 400);
        }
      },
    },
  },
});
