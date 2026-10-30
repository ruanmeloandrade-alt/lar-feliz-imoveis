import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  markWebhookEventProcessed,
  persistSignedPdf,
  shouldProcessWebhookEvent,
} from "@/lib/signature-webhook-recovery.server";

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

async function handler(request: Request): Promise<Response> {
  const raw = await request.text();
  if (!raw) return new Response("empty body", { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const documentToken = typeof payload.token === "string" ? payload.token : "";
  const externalId = typeof payload.external_id === "string" ? payload.external_id : "";
  if (!documentToken) return new Response("document token not found", { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  let { data: signatureRequest, error: requestError } = await admin
    .from("zapsign_signature_requests")
    .select("id, workspace_id, source_file_id, signed_file_id, document_token")
    .eq("document_token", documentToken)
    .maybeSingle();
  if (requestError) return new Response("lookup failed", { status: 500 });

  let needsTokenRepair = false;

  // Recovery do caso: ZapSign criou/enviou o documento, mas a gravação do
  // token remoto falhou depois. O lookup pelo external_id é somente leitura
  // até o segredo do webhook do workspace ser validado abaixo.
  if (!signatureRequest && externalId) {
    const fallback = await admin
      .from("zapsign_signature_requests")
      .select("id, workspace_id, source_file_id, signed_file_id, document_token")
      .eq("id", externalId)
      .maybeSingle();
    if (fallback.error) return new Response("lookup failed", { status: 500 });
    if (fallback.data?.document_token && fallback.data.document_token !== documentToken) {
      return new Response("document mismatch", { status: 409 });
    }
    signatureRequest = fallback.data;
    needsTokenRepair = Boolean(signatureRequest && !signatureRequest.document_token);
  }

  if (!signatureRequest) return new Response("unknown document", { status: 404 });

  const zapsign = await import("@/lib/zapsign.server");
  let secret;
  try {
    secret = await zapsign.readZapSignSecret(admin, signatureRequest.workspace_id);
  } catch {
    return new Response("integration unavailable", { status: 503 });
  }

  const received = request.headers.get("x-mkton-zapsign-secret") || "";
  if (!received || !safeEqual(received, secret.webhook_secret)) {
    return new Response("invalid webhook secret", { status: 401 });
  }

  if (needsTokenRepair) {
    const { data: repaired, error: repairError } = await admin
      .from("zapsign_signature_requests")
      .update({
        document_token: documentToken,
        status: typeof payload.status === "string" ? payload.status : "pending",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", signatureRequest.id)
      .eq("workspace_id", signatureRequest.workspace_id)
      .is("document_token", null)
      .select("id")
      .maybeSingle();
    if (repairError) return new Response("recovery persistence failed", { status: 503 });
    if (!repaired) {
      const { data: latest, error: latestError } = await admin
        .from("zapsign_signature_requests")
        .select("document_token")
        .eq("id", signatureRequest.id)
        .eq("workspace_id", signatureRequest.workspace_id)
        .maybeSingle();
      if (latestError) return new Response("lookup failed", { status: 500 });
      if (latest?.document_token !== documentToken) return new Response("document mismatch", { status: 409 });
    }
    signatureRequest = { ...signatureRequest, document_token: documentToken };
  }

  const eventName = typeof payload.event_type === "string" ? payload.event_type : "unknown";
  const eventKey = `${documentToken}:${eventName}:${createHash("sha256").update(raw).digest("hex")}`;

  try {
    const shouldProcess = await shouldProcessWebhookEvent(admin, "zapsign_webhook_events", eventKey, {
      event_key: eventKey,
      document_token: documentToken,
      event_name: eventName,
      payload,
    });
    if (!shouldProcess) return new Response("ok", { status: 200 });
  } catch {
    return new Response("event persistence failed", { status: 500 });
  }

  try {
    // O webhook pode ser disparado por signatário. A fonte de verdade para
    // conclusão é o status do documento detalhado na API.
    const document = await zapsign.getZapSignDocument(secret, documentToken);
    const status = String(document.status || "pending").toLowerCase();
    if (status !== "signed") {
      const { error: statusError } = await admin
        .from("zapsign_signature_requests")
        .update({ status, updated_at: new Date().toISOString(), last_error: null })
        .eq("id", signatureRequest.id)
        .eq("workspace_id", signatureRequest.workspace_id);
      if (statusError) throw new Error(statusError.message);

      await markWebhookEventProcessed(admin, "zapsign_webhook_events", eventKey);
      return new Response("ok", { status: 200 });
    }

    if (!signatureRequest.signed_file_id) {
      if (!document.signed_file) throw new Error("ZapSign ainda não disponibilizou o PDF assinado.");
      const signedResponse = await fetch(document.signed_file);
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
      const signedName = `${baseName}-assinado-zapsign.pdf`;
      const path = `${signatureRequest.workspace_id}/zapsign/${signatureRequest.id}/${signedName}`;
      const signedFileId = await persistSignedPdf(admin, {
        workspaceId: signatureRequest.workspace_id,
        storagePath: path,
        fileName: signedName,
        source: "zapsign",
        bytes,
      });

      const { error: completionError } = await admin
        .from("zapsign_signature_requests")
        .update({
          signed_file_id: signedFileId,
          status: "signed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", signatureRequest.id)
        .eq("workspace_id", signatureRequest.workspace_id);
      if (completionError) throw new Error(completionError.message);
    }

    await markWebhookEventProcessed(admin, "zapsign_webhook_events", eventKey);
    return new Response("ok", { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar retorno ZapSign.";
    await admin
      .from("zapsign_signature_requests")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("id", signatureRequest.id)
      .eq("workspace_id", signatureRequest.workspace_id);
    return new Response("processing failed", { status: 503 });
  }
}

export const Route = createFileRoute("/api/zapsign-webhook")({
  server: { handlers: { POST: ({ request }) => handler(request) } },
});
