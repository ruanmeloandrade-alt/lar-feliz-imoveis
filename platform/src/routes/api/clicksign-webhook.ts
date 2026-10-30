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
  const normalized = received.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(normalized, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handler(request: Request): Promise<Response> {
  const raw = await request.text();
  if (!raw) return new Response("empty body", { status: 400 });

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("invalid json", { status: 400 }); }

  const envelopeId = digString(payload, ["envelope_id", "envelope_key"]);
  if (!envelopeId) return new Response("envelope not found", { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: signatureRequest, error: requestError } = await admin
    .from("clicksign_signature_requests")
    .select("id, workspace_id, source_file_id, signed_file_id, envelope_id, document_id")
    .eq("envelope_id", envelopeId)
    .maybeSingle();
  if (requestError) return new Response("lookup failed", { status: 500 });
  if (!signatureRequest) return new Response("unknown envelope", { status: 404 });

  const clicksign = await import("@/lib/clicksign.server");
  let secret;
  try { secret = await clicksign.readClicksignSecret(admin, signatureRequest.workspace_id); }
  catch { return new Response("integration unavailable", { status: 503 }); }

  const received = request.headers.get("x-clicksign-signature") || "";
  if (!received || !secret.webhook_secret || !validHmac(raw, received, secret.webhook_secret)) {
    return new Response("invalid signature", { status: 401 });
  }

  const eventName = digString(payload, ["event_name", "event", "name", "status"]) || "unknown";
  const externalEventId = digString(payload, ["event_id", "event_key"]);
  const eventKey = externalEventId
    ? `${envelopeId}:${eventName}:${externalEventId}`
    : `${envelopeId}:${eventName}:${createHash("sha256").update(raw).digest("hex")}`;

  try {
    const shouldProcess = await shouldProcessWebhookEvent(admin, "clicksign_webhook_events", eventKey, {
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
    const envelope = await clicksign.getEnvelope(secret, envelopeId);
    const document = await clicksign.getDocument(secret, envelopeId, signatureRequest.document_id);
    const status = String(
      (document.data.attributes as any)?.status ||
      (envelope.data.attributes as any)?.status ||
      eventName ||
      "running",
    ).toLowerCase();

    const terminal = ["closed", "completed", "finished", "signed"].some((token) => status.includes(token));
    if (!terminal) {
      const { error: statusError } = await admin
        .from("clicksign_signature_requests")
        .update({ status, updated_at: new Date().toISOString(), last_error: null })
        .eq("id", signatureRequest.id)
        .eq("workspace_id", signatureRequest.workspace_id);
      if (statusError) throw new Error(statusError.message);

      await markWebhookEventProcessed(admin, "clicksign_webhook_events", eventKey);
      return new Response("ok", { status: 200 });
    }

    if (!signatureRequest.signed_file_id) {
      const signedUrl = clicksign.findSignedFileUrl(document);
      if (!signedUrl) throw new Error("Clicksign ainda não disponibilizou a URL do arquivo assinado.");
      const signedResponse = await fetch(signedUrl);
      if (!signedResponse.ok) throw new Error(`Falha ao baixar assinado (${signedResponse.status}).`);
      const bytes = new Uint8Array(await signedResponse.arrayBuffer());

      const { data: source, error: sourceError } = await admin
        .from("workspace_storage_files")
        .select("file_name")
        .eq("id", signatureRequest.source_file_id)
        .eq("workspace_id", signatureRequest.workspace_id)
        .single();
      if (sourceError) throw new Error(sourceError.message);

      const originalName = String(source?.file_name || "documento.pdf");
      const baseName = originalName.replace(/\.pdf$/i, "");
      const signedName = `${baseName}-assinado-clicksign.pdf`;
      const path = `${signatureRequest.workspace_id}/clicksign/${signatureRequest.id}/${signedName}`;
      const signedFileId = await persistSignedPdf(admin, {
        workspaceId: signatureRequest.workspace_id,
        storagePath: path,
        fileName: signedName,
        source: "clicksign",
        bytes,
      });

      const { error: completionError } = await admin
        .from("clicksign_signature_requests")
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

    await markWebhookEventProcessed(admin, "clicksign_webhook_events", eventKey);
    return new Response("ok", { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar retorno Clicksign.";
    await admin
      .from("clicksign_signature_requests")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("id", signatureRequest.id)
      .eq("workspace_id", signatureRequest.workspace_id);
    return new Response("processing failed", { status: 503 });
  }
}

export const Route = createFileRoute("/api/clicksign-webhook")({
  server: { handlers: { POST: ({ request }) => handler(request) } },
});
