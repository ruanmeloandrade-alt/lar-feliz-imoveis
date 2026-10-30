type SupabaseAdminLike = any;

const WEBHOOK_LEASE_MS = 5 * 60 * 1000;

export async function shouldProcessWebhookEvent(
  admin: SupabaseAdminLike,
  table: string,
  eventKey: string,
  event: Record<string, unknown>,
): Promise<boolean> {
  const claimedAt = new Date().toISOString();
  const { error: insertError } = await admin.from(table).insert({
    ...event,
    processing_started_at: claimedAt,
  });
  if (!insertError) return true;

  if (String(insertError.code) !== "23505") {
    throw new Error(`Falha ao persistir evento de assinatura: ${insertError.message || "erro desconhecido"}`);
  }

  const { data: existing, error: lookupError } = await admin
    .from(table)
    .select("processed_at,processing_started_at")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Falha ao reconciliar evento de assinatura: ${lookupError.message || "erro desconhecido"}`);
  }
  if (!existing || existing.processed_at) return false;

  const leaseStartedAt = existing.processing_started_at
    ? new Date(existing.processing_started_at).getTime()
    : 0;
  const staleBefore = new Date(Date.now() - WEBHOOK_LEASE_MS).toISOString();
  const leaseExpired = !Number.isFinite(leaseStartedAt)
    || leaseStartedAt <= Date.now() - WEBHOOK_LEASE_MS;
  if (!leaseExpired) return false;

  // Compare-and-set do lease: somente uma entrega atrasada pode recuperar um
  // evento que ficou sem processed_at após interrupção da tentativa anterior.
  const { data: recovered, error: claimError } = await admin
    .from(table)
    .update({ processing_started_at: claimedAt })
    .eq("event_key", eventKey)
    .is("processed_at", null)
    .or(`processing_started_at.is.null,processing_started_at.lt.${staleBefore}`)
    .select("event_key")
    .maybeSingle();

  if (claimError) {
    throw new Error(`Falha ao recuperar lease do evento de assinatura: ${claimError.message || "erro desconhecido"}`);
  }
  return Boolean(recovered?.event_key);
}

export async function releaseWebhookEventClaim(
  admin: SupabaseAdminLike,
  table: string,
  eventKey: string,
): Promise<void> {
  const { error } = await admin
    .from(table)
    .update({ processing_started_at: null })
    .eq("event_key", eventKey)
    .is("processed_at", null);

  if (error) {
    throw new Error(`Falha ao liberar lease do evento de assinatura: ${error.message || "erro desconhecido"}`);
  }
}

export async function markWebhookEventProcessed(
  admin: SupabaseAdminLike,
  table: string,
  eventKey: string,
): Promise<void> {
  const { error } = await admin
    .from(table)
    .update({ processed_at: new Date().toISOString(), processing_started_at: null })
    .eq("event_key", eventKey);

  if (error) {
    throw new Error(`Falha ao concluir evento de assinatura: ${error.message || "erro desconhecido"}`);
  }
}

type PersistSignedPdfInput = {
  workspaceId: string;
  storagePath: string;
  fileName: string;
  source: string;
  bytes: Uint8Array;
};

export async function persistSignedPdf(
  admin: SupabaseAdminLike,
  input: PersistSignedPdfInput,
): Promise<string> {
  const bucket = "workspace-files";

  const { data: existing, error: existingError } = await admin
    .from("workspace_storage_files")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("bucket", bucket)
    .eq("storage_path", input.storagePath)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return String(existing.id);

  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(input.storagePath, input.bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: stored, error: storeError } = await admin
    .from("workspace_storage_files")
    .insert({
      workspace_id: input.workspaceId,
      bucket,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime: "application/pdf",
      kind: "pdf",
      source: input.source,
      size_bytes: input.bytes.byteLength,
    })
    .select("id")
    .single();

  if (!storeError && stored?.id) return String(stored.id);

  const { data: recovered, error: recoveryError } = await admin
    .from("workspace_storage_files")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("bucket", bucket)
    .eq("storage_path", input.storagePath)
    .maybeSingle();

  if (recoveryError) throw new Error(recoveryError.message);
  if (recovered?.id) return String(recovered.id);

  throw new Error(storeError?.message || "Falha ao registrar o PDF assinado.");
}
