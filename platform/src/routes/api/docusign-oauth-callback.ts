import { createFileRoute } from "@tanstack/react-router";

function encKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return key;
}

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (!state) return new Response("state ausente", { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: pending, error: stateError } = await admin.from("docusign_oauth_states")
    .select("state,workspace_id,user_id,redirect_uri,environment,expires_at")
    .eq("state", state)
    .maybeSingle();
  if (stateError || !pending) return new Response("state inválido", { status: 400 });
  await admin.from("docusign_oauth_states").delete().eq("state", state);
  if (Date.parse(pending.expires_at) < Date.now()) return new Response("state expirado", { status: 400 });

  const returnUrl = new URL("/integracoes", new URL(pending.redirect_uri).origin);
  if (oauthError || !code) {
    returnUrl.searchParams.set("docusign", "error");
    return Response.redirect(returnUrl.toString(), 302);
  }

  try {
    const docusign = await import("@/lib/docusign.server");
    const secret = await docusign.exchangeCode({
      environment: pending.environment,
      code,
      redirectUri: pending.redirect_uri,
    });
    const { error } = await admin.rpc("set_integration_secret_service", {
      _workspace_id: pending.workspace_id,
      _provider: "docusign",
      _plaintext: secret,
      _key: encKey(),
      _metadata: { account_id: secret.account_id, base_uri: secret.base_uri, environment: secret.environment },
      _status: "connected",
    });
    if (error) throw new Error(error.message);
    returnUrl.searchParams.set("docusign", "ok");
  } catch (error) {
    console.error("DocuSign OAuth callback failed", error);
    returnUrl.searchParams.set("docusign", "error");
  }
  return Response.redirect(returnUrl.toString(), 302);
}

export const Route = createFileRoute("/api/docusign-oauth-callback")({
  server: { handlers: { GET: ({ request }) => handler(request) } },
});
