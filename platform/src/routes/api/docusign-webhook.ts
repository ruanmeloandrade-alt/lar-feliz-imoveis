import { createFileRoute } from "@tanstack/react-router";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  markWebhookEventProcessed,
  persistSignedPdf,
  shouldProcessWebhookEvent,
} from "@/lib/signature-webhook-recovery.server";

function digString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const wanted = new Set(keys);
  const stack: unknown[] = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (wanted.has(key) && typeof child === "string" && child) return child;
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return null;
}

function validHmac(raw: string, received: string, secret: string): boolean {
  const normalized = received.trim();
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  const a = Buffer.from(normalized, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function encKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return key;
}

async function handler(request: Request): Promise<Response> {
  const raw = await request.text();
  if (!raw) return new Response("empty body", { status: 400 });
  const docusign = await import("@/lib/docusign.server");
  let hmacSecret: string;
  try {
    hmacSecret = docusign.connectHmacSecret();
  } catch {
    return new Response("webhook HMAC not configured", { status: 503 });
  }

  const received = request.headers.get("x-docusign-signature-1") || "";
  if (!received || !validHmac(raw, received, hmacSecret)) return new Response("invalid signature", { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const envelopeId = digString(payload, ["envelopeId", "envelope_id"]);
  if (!envelopeId) return new Response("envelope not found", { status: 400 });

  const callbackRequestId = new URL(request.url).searchParams.get("request_id") || "";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  let { data: signatureRequest, error: requestError } = await admin.from("docusign_signature_requests")
    .select("id,workspace_id,source_file_id,signed_file_id,envelope_id")
    .eq("envelope_id", envelopeId)
    .maybeSingle();
  if (requestError) return new Response("lookup failed", { status: 500 });

  // Recovery do caso em que a DocuSign aceitou o envelope, mas a persistência
  // local do envelope_id falhou. Cada envelope novo recebe uma callback URL
  // com request_id apontando para o draft local criado antes do envio.
  if (!signatureRequest && callbackRequestId) {
    const fallback = await admin.from("docusign_signature_requests")
      .select("id,workspace_id,source_file_id,signed_file_id,envelope_id")
      .eq("id", callbackRequestId)
      .maybeSingle();
    if (fallback.error) return new Response("lookup failed", { status: 500 });
    if (fallback.data?.envelope_id && fallback.data.envelope_id !== envelopeId) {
      return new Response("envelope mismatch", { status: 409 });
    }
    signatureRequest = fallback.data;

    if (signatureRequest && !signatureRequest.envelope_id) {
      const { data: repaired, error: repairError } = await admin.from("docusign_signature_requests")
        .update({
          envelope_id: envelopeId,
          status: digString(payload, ["status", "envelopeStatus"]) || "sent",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", signatureRequest.id)
        .eq("workspace_id", signatureRequest.workspace_id)
        .is("envelope_id", null)
        .select("id")
        .maybeSingle();
      if (repairError) return new Response("recovery persistence failed", { status: 503 });
      if (!repaired) {
        const { data: latest, error: latestError } = await admin
          .from("docusign_signature_requests")
          .select("envelope_id")
          .eq("id", signatureRequest.id)
          .eq("workspace_id", signatureRequest.workspace_id)
          .maybeSingle();
        if (latestError) return new Response("lookup failed", { status: 500 });
        if (latest?.envelope_id !== envelopeId) return new Response("envelope mismatch", { status: 409 });
      }
      signatureRequest = { ...signatureRequest, envelope_id: envelopeId };
    }
  }

  if (!signatureRequest) return new Response("unknown envelope", { status: 404 });

  const eventName = digString(payload, ["event", "status", "envelopeStatus"]) || "unknown";
  const eventKey = `${envelopeId}:${eventName}:${createHash("sha256").update(raw).digest("hex")}`;

  try {
    const shouldProcess = await shouldProcessWebhookEvent(admin, "docusign_webhook_events", eventKey, {
      event_key: eventKey,
      envelope_id: envelopeId,
      event_name: eventName,
      payload,
    });
    if (!shouldProcess) return new Response("ok", { status: 200 });
  } catch {
    return new Response("event persistence failed", { status: 500 });
  }

  try {
    let secret = await docusign.readDocusignSecret(admin, signatureRequest.workspace_id);
    const refreshed = await docusign.refreshSecret(secret);
    if (refreshed.access_token !== secret.access_token) {
      secret = refreshed;
      const { error } = await admin.rpc("set_integration_secret_service", {
        _workspace_id: signatureRequest.workspace_id,
        _provider: "docusign",
        _plaintext: secret,
        _key: encKey(),
        _metadata: { account_id: secret.account_id, base_uri: secret.base_uri, environment: secret.environment },
        _status: "connected",
      });
      if (error) throw new Error(error.message);
    }

    const envelope = await docusign.getEnvelope(secret, envelopeId);
    const status = String(envelope.status || eventName || "sent").toLowerCase();
    if (status !== "completed") {
      const { error: statusError } = await admin
        .from("docusign_signature_requests")
        .update({ status, updated_at: new Date().toISOString(), last_error: null })
        .eq("id", signatureRequest.id)
        .eq("workspace_id", signatureRequest.workspace_id);
      if (statusError) throw new Error(statusError.message);

      await markWebhookEventProcessed(admin, "docusign_webhook_events", eventKey);
      return new Response("ok", { status: 200 });
    }

    if (!signatureRequest.signed_file_id) {
      const bytes = await docusign.downloadCombinedDocument(secret, envelopeId);
      const { data: source, error: sourceError } = await admin
        .from("workspace_storage_files")
        .select("file_name")
        .eq("id", signatureRequest.source_file_id)
        .eq("workspace_id", signatureRequest.workspace_id)
        .single();
      if (sourceError) throw new Error(sourceError.message);

      const originalName = String(source?.file_name || "documento.pdf");
      const baseName = originalName.replace(/\.(pdf|docx?|rtf)$/i, "");
      const signedName = `${baseName}-assinado-docusign.pdf`;
      const path = `${signatureRequest.workspace_id}/docusign/${signatureRequest.id}/${signedName}`;
      const signedFileId = await persistSignedPdf(admin, {
        workspaceId: signatureRequest.workspace_id,
        storagePath: path,
        fileName: signedName,
        source: "docusign",
        bytes,
      });

      const { error: completionError } = await admin
        .from("docusign_signature_requests")
        .update({
          signed_file_id: signedFileId,
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", signatureRequest.id)
        .eq("workspace_id", signatureRequest.workspace_id);
      if (completionError) throw new Error(completionError.message);
    }

    await markWebhookEventProcessed(admin, "docusign_webhook_events", eventKey);
    return new Response("ok", { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar retorno DocuSign.";
    await admin
      .from("docusign_signature_requests")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("id", signatureRequest.id)
      .eq("workspace_id", signatureRequest.workspace_id);
    return new Response("processing failed", { status: 503 });
  }
}

export const Route = createFileRoute("/api/docusign-webhook")({
  server: { handlers: { POST: ({ request }) => handler(request) } },
});
