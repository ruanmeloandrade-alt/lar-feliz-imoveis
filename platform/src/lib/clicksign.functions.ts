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

export const requestClicksignSignature = createServerFn({ method: "POST" })
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
    const name = String(file.file_name || "documento");
    const signable = mime === "application/pdf" || /\.(pdf|doc|docx)$/i.test(name);
    if (!signable) throw new Error("Somente PDF ou documento armazenado na Vanessa Simoni pode ser enviado para assinatura.");

    const { data: blob, error: downloadError } = await sb.storage
      .from(String(file.bucket))
      .download(String(file.storage_path));
    if (downloadError || !blob) throw new Error(downloadError?.message || "Não foi possível ler o arquivo armazenado.");

    const clicksign = await import("@/lib/clicksign.server");
    const secret = await clicksign.readClicksignSecret(sb, workspaceId);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const envelope = await clicksign.createEnvelope(secret, `MktOn · ${name}`);
    const envelopeId = envelope.data.id;
    const document = await clicksign.uploadDocument(secret, envelopeId, {
      filename: name,
      mime,
      bytes,
    });
    const documentId = document.data.id;
    const signer = await clicksign.createSigner(secret, envelopeId, {
      name: data.signerName,
      email: data.signerEmail,
    });
    const signerId = signer.data.id;

    await clicksign.createEmailSigningRequirements(secret, envelopeId, documentId, signerId);

    // Persiste o vínculo antes de tornar o envelope ativo. Assim, qualquer
    // falha posterior continua rastreável/reparável na MktOn e não cria um
    // envelope ativo e notificado sem registro local.
    const { data: created, error: insertError } = await sb
      .from("clicksign_signature_requests")
      .insert({
        workspace_id: workspaceId,
        source_file_id: data.storageFileId,
        envelope_id: envelopeId,
        document_id: documentId,
        signer_id: signerId,
        signer_name: data.signerName,
        signer_email: data.signerEmail,
        status: "pending_activation",
        created_by: context.userId,
      })
      .select("id, status, envelope_id")
      .single();
    if (insertError) throw new Error(insertError.message);

    try {
      await clicksign.activateEnvelope(secret, envelopeId);
      await clicksign.notifyEnvelope(secret, envelopeId);
      const { data: running, error: updateError } = await sb
        .from("clicksign_signature_requests")
        .update({ status: "running", last_error: null, updated_at: new Date().toISOString() })
        .eq("id", created.id)
        .eq("workspace_id", workspaceId)
        .select("id, status, envelope_id")
        .single();
      if (updateError) throw new Error(updateError.message);
      return { ok: true, request: running };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao ativar envelope Clicksign.";
      await sb
        .from("clicksign_signature_requests")
        .update({ status: "activation_failed", last_error: message, updated_at: new Date().toISOString() })
        .eq("id", created.id)
        .eq("workspace_id", workspaceId);
      throw error;
    }
  });
