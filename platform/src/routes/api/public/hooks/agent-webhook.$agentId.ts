import { createFileRoute } from "@tanstack/react-router";

type WebhookTriggerCfg = {
  enabled?: boolean;
  secret?: string;
  target?: string;
  template?: string;
};

function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const parts = key.split(".");
    let cur: unknown = vars;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return "";
      }
    }
    return cur == null ? "" : String(cur);
  });
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sendViaEvolution(
  supabaseAdmin: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          eq: (c: string, v: unknown) => {
            eq: (c: string, v: unknown) => {
              order: (c: string, o: { ascending: boolean }) => {
                limit: (n: number) => { maybeSingle: () => Promise<{ data: { id?: string } | null }> };
              };
            };
          };
        };
      };
    };
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  },
  workspaceId: string,
  numberOrJid: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) return { ok: false, error: "INTEGRATION_ENCRYPTION_KEY ausente" };
  const target = (numberOrJid ?? "").trim();
  if (!target) return { ok: false, error: "target vazio" };

  const sess = await supabaseAdmin
    .from("whatsapp_web_sessions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "evolution")
    .eq("status", "conectado")
    .order("last_connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sessId = sess.data?.id;
  if (!sessId) return { ok: false, error: "Nenhuma sessão Evolution conectada" };

  const credsRes = await supabaseAdmin.rpc("get_evolution_credentials_service", {
    _session_id: sessId,
    _key: encKey,
  });
  if (credsRes.error) return { ok: false, error: credsRes.error.message ?? "erro nas credenciais" };
  const c = credsRes.data as { instance_name?: string; api_key?: string } | null;
  if (!c?.instance_name || !c.api_key) return { ok: false, error: "Credenciais Evolution indisponíveis" };

  const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return { ok: false, error: "EVOLUTION_BASE_URL não configurado" };

  // Grupo → JID (@g.us). Individual → dígitos.
  const number = target.includes("@g.us") ? target : target.replace(/\D/g, "");

  try {
    const resp = await fetch(`${base}/message/sendText/${encodeURIComponent(c.instance_name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.api_key },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      const b = await resp.text().catch(() => "");
      return { ok: false, error: `Evolution ${resp.status}: ${b.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const Route = createFileRoute("/api/public/hooks/agent-webhook/$agentId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const agentId = params.agentId;
        const url = new URL(request.url);
        const scope = url.searchParams.get("scope") === "grupo" ? "grupo" : "1a1";

        const headerSecret =
          request.headers.get("x-webhook-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          url.searchParams.get("secret") ??
          "";

        let payload: Record<string, unknown> = {};
        try {
          const raw = await request.text();
          payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Busca agente na tabela correta.
        const table = scope === "grupo" ? "group_ai_agents" : "conversation_ai_agents";
        const sb = supabaseAdmin as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }> };
            };
          };
        };
        const agentRes = await sb.from(table).select("id,workspace_id,enabled,metadata,triggers").eq("id", agentId).maybeSingle();
        if (agentRes.error || !agentRes.data) {
          return new Response(JSON.stringify({ ok: false, error: "Agente não encontrado" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        const agent = agentRes.data as {
          id: string;
          workspace_id: string;
          enabled: boolean;
          metadata: { settings?: { webhook_trigger?: WebhookTriggerCfg } } | null;
          triggers?: Array<{ type: string; enabled: boolean; config?: WebhookTriggerCfg }> | null;
        };

        // Config do gatilho, group agent usa triggers[type=webhook]; 1a1 usa metadata.settings.webhook_trigger.
        let cfg: WebhookTriggerCfg = {};
        if (scope === "grupo") {
          const t = (agent.triggers ?? []).find((x) => x.type === "webhook" && x.enabled);
          cfg = t?.config ?? {};
        } else {
          cfg = agent.metadata?.settings?.webhook_trigger ?? {};
        }

        if (!agent.enabled) {
          return new Response(JSON.stringify({ ok: false, error: "Agente desabilitado" }), {
            status: 403, headers: { "Content-Type": "application/json" },
          });
        }
        if (!cfg.enabled) {
          return new Response(JSON.stringify({ ok: false, error: "Gatilho webhook desabilitado" }), {
            status: 403, headers: { "Content-Type": "application/json" },
          });
        }
        if (!cfg.secret || !timingSafeEq(cfg.secret, headerSecret)) {
          return new Response(JSON.stringify({ ok: false, error: "Segredo inválido" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        // Resolve destino e texto.
        const target = String((payload.target as string) ?? cfg.target ?? "").trim();
        const explicitMessage = typeof payload.message === "string" ? (payload.message as string) : "";
        const template = cfg.template ?? "";
        const text = explicitMessage || renderTemplate(template, payload);

        if (!target) {
          return new Response(JSON.stringify({ ok: false, error: "Destino não informado (target)" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        if (!text.trim()) {
          return new Response(JSON.stringify({ ok: false, error: "Mensagem vazia (envie 'message' ou configure template)" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        const sent = await sendViaEvolution(
          supabaseAdmin as unknown as Parameters<typeof sendViaEvolution>[0],
          agent.workspace_id,
          target,
          text,
        );
        if (!sent.ok) {
          return new Response(JSON.stringify({ ok: false, error: sent.error }), {
            status: 502, headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
