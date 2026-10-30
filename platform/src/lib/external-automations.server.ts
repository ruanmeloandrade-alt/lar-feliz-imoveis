// Server-only helpers para automações externas (N8N / Make).
// Assinatura HMAC + dispatcher outbound. Use apenas em rotas/server fns.
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { normalizeOptions, type ExternalProvider } from "./external-automations-events";

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(secret: string, body: string, signature: string | null): boolean {
  if (!signature) return false;
  try {
    const expected = signPayload(secret, body);
    const a = Buffer.from(signature.replace(/^sha256=/, ""));
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function generateInboundToken(): string {
  return randomBytes(24).toString("hex");
}

export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

interface DispatchArgs {
  workspaceId: string;
  event: string;
  payload: Record<string, unknown>;
  provider?: ExternalProvider | "all";
  /** Ignora o filtro de eventos selecionados (usado nos testes manuais). */
  force?: boolean;
}

/**
 * Envia evento para as automações externas ativas do workspace.
 * Faz best-effort: falhas são logadas, nunca lançam.
 */
export async function dispatchExternalEvent(args: DispatchArgs): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const filter = supabaseAdmin
      .from("external_automations")
      .select("id, provider, outbound_url, inbound_secret, selected_events, status, metadata")
      .eq("workspace_id", args.workspaceId)
      .eq("status", "connected");
    const { data } = args.provider && args.provider !== "all"
      ? await filter.eq("provider", args.provider)
      : await filter;
    const rows = (data ?? []) as Array<{
      id: string;
      provider: string;
      outbound_url: string | null;
      inbound_secret: string;
      selected_events: unknown;
      metadata: Record<string, unknown> | null;
    }>;
    for (const row of rows) {
      const events = Array.isArray(row.selected_events) ? row.selected_events as string[] : [];
      if (!args.force && events.length > 0 && !events.includes(args.event)) continue;
      if (!row.outbound_url) continue;
      const options = normalizeOptions((row.metadata ?? {}).options, row.provider as ExternalProvider);
      const body = JSON.stringify({
        event: args.event,
        workspace_id: args.workspaceId,
        occurred_at: new Date().toISOString(),
        data: args.payload,
      });
      const signature = signPayload(row.inbound_secret, body);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-MKTOn-Event": args.event,
        "X-MKTOn-Workspace": args.workspaceId,
      };
      if (options.signOutbound) headers["X-MKTOn-Signature"] = `sha256=${signature}`;
      if (options.authHeaderName.trim() && options.authHeaderValue.trim()) {
        headers[options.authHeaderName.trim()] = options.authHeaderValue.trim();
      }
      for (const h of options.extraHeaders) {
        if (h.key?.trim() && typeof h.value === "string") headers[h.key.trim()] = h.value;
      }

      let httpStatus: number | null = null;
      let errorMsg: string | null = null;
      let responseText: string | null = null;
      let ok = false;
      const attempts = 1 + options.retries;
      for (let attempt = 0; attempt < attempts; attempt++) {
        httpStatus = null;
        errorMsg = null;
        try {
          const resp = await fetch(row.outbound_url, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(10_000),
          });
          httpStatus = resp.status;
          responseText = (await resp.text().catch(() => "")).slice(0, 2000);
        } catch (e) {
          errorMsg = e instanceof Error ? e.message : String(e);
        }
        ok = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
        if (ok) break;
        if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
      await supabaseAdmin.from("external_automation_logs").insert({
        workspace_id: args.workspaceId,
        automation_id: row.id,
        provider: row.provider,
        direction: "outbound",
        event: args.event,
        payload: args.payload as never,
        response: responseText ? { body: responseText } as never : null,
        http_status: httpStatus,
        status: ok ? "ok" : "failed",
        error: errorMsg,
      });
      if (ok) {
        await supabaseAdmin
          .from("external_automations")
          .update({ last_success_at: new Date().toISOString(), last_error: null })
          .eq("id", row.id);
      } else if (errorMsg || httpStatus) {
        await supabaseAdmin
          .from("external_automations")
          .update({ last_error: errorMsg ?? `HTTP ${httpStatus}` })
          .eq("id", row.id);
      }
    }
  } catch (e) {
    console.warn("[external-automations] dispatch falhou:", e);
  }
}
