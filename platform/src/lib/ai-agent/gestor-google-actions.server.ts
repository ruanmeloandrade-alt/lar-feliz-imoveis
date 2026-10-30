import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { supabase: SupabaseClient; workspaceId: string };

export function buildGoogleGestorActionTools(ctx: Ctx) {
  return {
    set_google_campaign_status: tool({
      description:
        "Pausa ou ativa uma campanha Google Ads real. Use somente quando o usuário pedir explicitamente a ação.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        campaignId: z.string().min(1),
        status: z.enum(["ENABLED", "PAUSED"]),
      }),
      execute: async ({ customerId, campaignId, status }) => {
        const m = await import("../google.server");
        const { token, secret } = await m.getGoogleAccessToken(
          ctx.supabase as never,
          ctx.workspaceId,
        );
        const developerToken = m.adsDeveloperToken(secret);
        const id = m.cleanCustomerId(customerId || secret.ads_customer_id);
        if (!id) throw new Error("Selecione uma conta Google Ads.");

        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        };
        const login = m.cleanCustomerId(secret.ads_login_customer_id);
        if (login) headers["login-customer-id"] = login;

        const resourceName = `customers/${id}/campaigns/${campaignId.replace(/\D/g, "")}`;
        const r = await fetch(`${m.GOOGLE_ADS_API}/customers/${id}/campaigns:mutate`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            operations: [{ update: { resourceName, status }, updateMask: "status" }],
            partialFailure: false,
            validateOnly: false,
          }),
        });
        const txt = await r.text();
        if (!r.ok) throw new Error(`Google Ads ${r.status}: ${txt.slice(0, 500)}`);
        return { ok: true, customerId: id, campaignId, status, result: txt ? JSON.parse(txt) : {} };
      },
    }),
  };
}
