import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

const RequestSignatureSchema = z.object({
  storageFileId: z.string().uuid(),
  signerName: z.string().trim().min(2).max(180),
  signerEmail: z.string().trim().email().max(320),
});

type AnySb = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  storage: { from: (bucket: string) => any };
};

export const requestZapSignSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => RequestSignatureSchema.parse(value))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await requireActiveWorkspace(sb, context.userId, { createIfMissing: false });

    const { data: file, error: fileError } = await sb
      .from("workspace_storage_files")
      .select("id, bucket, storage_path, file_name, mime, deleted_at")
      .eq("id", data.storageFileId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (fileError) throw new Error(fileError.message);
    if (!file) throw new Error("Arquivo não encontrado neste workspace.");

    const mime = String(file.mime || "application/octet-stream");
    const name = String(file.file_name || "documento.pdf");
    const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name);
    if (!isPdf) throw new Error("A ZapSign aceita somente PDF neste fluxo da Vanessa Simoni.");

    const { data: blob, error: downloadError } = await sb.storage
      .from(String(file.bucket))
      .download(String(file.storage_path));
    if (downloadError || !blob) throw new Error(downloadError?.message || "Não foi possível ler o PDF armazenado.");
    if (blob.size > 10 * 1024 * 1024) throw new Error("A ZapSign aceita PDFs de até 10 MB neste endpoint.");

    const zapsign = await import("@/lib/zapsign.server");
    const secret = await zapsign.readZapSignSecret(sb, workspaceId);
    const requestId = crypto.randomUUID();

    // O request local nasce antes da operação externa. O mesmo id é enviado
    // à ZapSign como external_id, permitindo que o webhook repare o vínculo
    // caso a criação remota funcione e a atualização local falhe depois.
    const { data: draft, error: draftError } = await sb
      .from("zapsign_signature_requests")
      .insert({
        id: requestId,
        workspace_id: workspaceId,
        source_file_id: data.storageFileId,
        document_token: null,
        signer_token: null,
        signer_name: data.signerName,
        signer_email: data.signerEmail,
        status: "creating",
        last_error: null,
        created_by: context.userId,
      })
      .select("id, status, document_token")
      .single();
    if (draftError || !draft) throw new Error(draftError?.message || "Não foi possível iniciar a solicitação de assinatura.");

    let document;
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      document = await zapsign.createZapSignDocument(secret, {
        name,
        pdfBytes: bytes,
        signerName: data.signerName,
        signerEmail: data.signerEmail,
        externalId: requestId,
      });
      if (!document?.token) throw new Error("ZapSign não retornou o token do documento.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao criar documento na ZapSign.";
      await sb
        .from("zapsign_signature_requests")
        .update({ status: "creation_failed", last_error: message, updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("workspace_id", workspaceId);
      throw error;
    }

    const signer = document.signers?.[0];
    const remoteStatus = document.status || "pending";
    const { data: created, error: updateError } = await sb
      .from("zapsign_signature_requests")
      .update({
        document_token: document.token,
        signer_token: signer?.token ?? null,
        status: remoteStatus,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("workspace_id", workspaceId)
      .select("id, status, document_token")
      .maybeSingle();

    // A operação externa já foi aceita e pode inclusive ter disparado e-mail.
    // Não induzimos o usuário a reenviar e criar duplicata se só a persistência
    // pós-criação falhou: o webhook reconcilia pelo external_id=requestId.
    if (updateError || !created) {
      return {
        ok: true,
        request: { id: requestId, status: remoteStatus, document_token: document.token },
        signUrl: signer?.sign_url ?? null,
        recoveryPending: true,
      };
    }

    return { ok: true, request: created, signUrl: signer?.sign_url ?? null, recoveryPending: false };
  });
