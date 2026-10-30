import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest, cronUnauthorized } from "@/lib/cron-auth";

/**
 * Cron: importa histórico de ligações da Evolution para whatsapp_call_events.
 * Chamado por pg_cron a cada 15 min. Autentica com Supabase anon key (apikey header)
 *, /api/public/* já bypassa auth no site publicado.
 */
export const Route = createFileRoute("/api/public/hooks/evolution-calls-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        const base = process.env.EVOLUTION_BASE_URL;
        const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
        if (!base || !encKey) return Response.json({ ok: false, error: "missing env" }, { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: sessions } = await supabaseAdmin
          .from("whatsapp_web_sessions")
          .select("id, workspace_id, instance_id")
          .eq("provider", "evolution")
          .eq("status", "conectado");

        let imported = 0;
        let scanned = 0;
        for (const s of (sessions ?? []) as Array<{ id: string; workspace_id: string; instance_id: string }>) {
          scanned++;
          // Recupera api_key descriptografada
          const { data: creds } = await supabaseAdmin.rpc("get_evolution_credentials_service", {
            _session_id: s.id,
            _key: encKey,
          });
          const apiKey = (creds as { api_key?: string } | null)?.api_key;
          if (!apiKey) continue;

          // Evolution: busca mensagens recentes e filtra callLog. Endpoint varia por versão;
          // tentamos findMessages -> se falhar, seguimos.
          try {
            const res = await fetch(`${base.replace(/\/$/, "")}/chat/findMessages/${encodeURIComponent(s.instance_id)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: apiKey },
              body: JSON.stringify({ where: {}, limit: 200 }),
            });
            if (!res.ok) continue;
            const payload = (await res.json().catch(() => null)) as unknown;
            const list = Array.isArray(payload)
              ? payload
              : Array.isArray((payload as { messages?: { records?: unknown[] } })?.messages?.records)
                ? (payload as { messages: { records: unknown[] } }).messages.records
                : [];
            for (const m of list as Array<Record<string, unknown>>) {
              const msgType = String((m.messageType ?? m.type ?? "") as string).toLowerCase();
              const message = (m.message ?? {}) as Record<string, unknown>;
              const isCall = msgType.includes("call") || "call" in message || "callLog" in message;
              if (!isCall) continue;
              const key_ = (m.key ?? {}) as Record<string, unknown>;
              const remote = String(key_.remoteJid ?? m.remoteJid ?? "");
              const external = String(key_.id ?? m.id ?? `${remote}-${m.messageTimestamp ?? Date.now()}`);
              const ts = m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : Date.now();
              const call = (message.call ?? message.callLog ?? {}) as Record<string, unknown>;
              const duration = Number(call.duration ?? 0);
              const status = String(call.status ?? call.outcome ?? "unknown");
              const isVideo = Boolean(call.isVideo);
              const phoneNorm = remote.replace(/[^\d]/g, "").slice(-14);

              const { error } = await supabaseAdmin
                .from("whatsapp_call_events")
                .upsert(
                  {
                    workspace_id: s.workspace_id,
                    session_id: s.id,
                    external_id: external,
                    direction: (key_.fromMe ? (isVideo ? "video_out" : "voice_out") : (isVideo ? "video_in" : "voice_in")),
                    from_number: remote,
                    phone_normalized: phoneNorm,
                    status,
                    duration_seconds: duration,
                    started_at: new Date(ts).toISOString(),
                    raw: m as never,
                  } as never,
                  { onConflict: "workspace_id,external_id" },
                );
              if (!error) imported++;
            }
          } catch {
            /* ignore per-session errors */
          }
        }

        return Response.json({ ok: true, scanned, imported });
      },
    },
  },
});
