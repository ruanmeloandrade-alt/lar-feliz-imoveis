import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

const StartOAuthSchema = z.object({
  origin: z.string().url().max(2048),
  environment: z.enum(["production", "demo"]).default("production"),
});
const RequestSchema = z.object({
  storageFileId: z.string().uuid(),
  signerName: z.string().trim().min(2).max(180),
  signerEmail: z.string().trim().email().max(320),
  origin: z.string().url().max(2048),
});

type AnySb = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  storage: { from: (bucket: string) => any };
};

function encKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return key;
}

function httpsOrigin(raw: string): URL {
  const url = new URL(raw);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) throw new Error("DocuSign exige URL pública HTTPS.");
  return url;
}

async function persistSecret(sb: AnySb, workspaceId: string, secret: Record<string, unknown>) {
  const { error } = await sb.rpc("set_integration_secret", {
    _workspace_id: workspaceId,
    _provider: "docusign",
    _plaintext: secret,
    _key: encKey(),
    _metadata: { account_id: secret.account_id, environment: secret.environment },
    _status: "connected",
  });
  if (error) throw new Error(error.message || "Falha ao atualizar token DocuSign.");
}

export const startDocusignOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => StartOAuthSchema.parse(value))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await requireActiveWorkspace(sb, context.userId, { createIfMissing: false });
    const origin = httpsOrigin(data.origin);
    const redirectUri = new URL("/api/docusign-oauth-callback", origin).toString();
    const state = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("docusign_oauth_states").insert({
      state,
      workspace_id: workspaceId,
      user_id: context.userId,
      redirect_uri: redirectUri,
      environment: data.environment,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(error.message);
    const docusign = await import("@/lib/docusign.server");
    return { url: docusign.authorizationUrl({ environment: data.environment, redirectUri, state }) };
  });

export const requestDocusignSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => RequestSchema.parse(value))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await requireActiveWorkspace(sb, context.userId, { createIfMissing: false });
    const { data: file, error: fileError } = await sb.from("workspace_storage_files")
      .select("id,bucket,storage_path,file_name,mime,deleted_at")
      .eq("id", data.storageFileId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (fileError) throw new Error(fileError.message);
    if (!file) throw new Error("Arquivo não encontrado neste workspace.");

    const name = String(file.file_name || "documento.pdf");
    const mime = String(file.mime || "application/octet-stream");
    if (!/\.(pdf|doc|docx)$/i.test(name) && mime !== "application/pdf") {
      throw new Error("DocuSign aceita PDF, DOC ou DOCX neste fluxo da Vanessa Simoni.");
    }
    const { data: blob, error: downloadError } = await sb.storage.from(String(file.bucket)).download(String(file.storage_path));
    if (downloadError || !blob) throw new Error(downloadError?.message || "Não foi possível ler o documento armazenado.");

    const docusign = await import("@/lib/docusign.server");
    let secret = await docusign.readDocusignSecret(sb, workspaceId);
    const refreshed = await docusign.refreshSecret(secret);
    if (refreshed.access_token !== secret.access_token) {
      secret = refreshed;
      await persistSecret(sb, workspaceId, secret as unknown as Record<string, unknown>);
    }

    const requestId = crypto.randomUUID();
    const origin = httpsOrigin(data.origin);
    const webhookUrl = new URL("/api/docusign-webhook", origin);
    webhookUrl.searchParams.set("request_id", requestId);

    // Persiste o request antes de enviar o envelope. Se a chamada externa
    // falhar, o histórico local registra a falha; se apenas a atualização do
    // envelope_id falhar, o próprio webhook individual consegue reparar pelo
    // request_id presente na URL.
    const { data: draft, error: draftError } = await sb.from("docusign_signature_requests").insert({
      id: requestId,
      workspace_id: workspaceId,
      source_file_id: data.storageFileId,
      envelope_id: null,
      signer_name: data.signerName,
      signer_email: data.signerEmail,
      status: "creating",
      last_error: null,
      created_by: context.userId,
    }).select("id,status,envelope_id").single();
    if (draftError || !draft) throw new Error(draftError?.message || "Não foi possível iniciar a solicitação de assinatura.");

    let envelope;
    try {
      envelope = await docusign.createEnvelope(secret, {
        filename: name,
        mime,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        signerName: data.signerName,
        signerEmail: data.signerEmail,
        webhookUrl: webhookUrl.toString(),
      });
      if (!envelope.envelopeId) throw new Error("DocuSign não retornou o envelopeId.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao criar envelope na DocuSign.";
      await sb.from("docusign_signature_requests")
        .update({ status: "creation_failed", last_error: message, updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("workspace_id", workspaceId);
      throw error;
    }

    const remoteStatus = envelope.status || "sent";
    const { data: created, error: updateError } = await sb.from("docusign_signature_requests")
      .update({
        envelope_id: envelope.envelopeId,
        status: remoteStatus,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("workspace_id", workspaceId)
      .select("id,status,envelope_id")
      .maybeSingle();

    if (updateError || !created) {
      return {
        ok: true,
        request: { id: requestId, status: remoteStatus, envelope_id: envelope.envelopeId },
        recoveryPending: true,
      };
    }

    return { ok: true, request: created, recoveryPending: false };
  });
