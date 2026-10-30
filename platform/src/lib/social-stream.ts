// SSE parser mínimo para /api/social/generate-image.
// Responsabilidade deste arquivo no streaming: transportar o resultado do provider.
// A persistência durável acontece uma única vez no fluxo que possui o conteúdo
// (Banco de Ideias, Campanha ou Novo Post), evitando upload/metering duplicado.

import { supabase } from "@/integrations/supabase/client";
import { BYTES_PER_GB, includedStorageBytes } from "@/lib/billing/storage-catalog";

export type ImageFrame = {
  dataUrl: string;
  dataUrls?: string[];
  final: boolean;
};

type MeteredKind = "image" | "audio" | "video" | "pdf" | "document" | "attachment" | "other_binary";
type MeteredSource = "social_media" | "gestor_trafego" | "upload";

/** Headers autenticados para chamar as rotas /api/social/* (exigem bearer). */
export async function socialApiHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function streamImage(
  url: string,
  body: {
    workspaceId: string;
    prompt: string;
    provider?: "gemini" | "ideogram" | "recraft" | "freepik";
    size?: string;
    aspectRatio?: string;
    brandId?: string | null;
    carousel?: boolean;
  },
  onFrame: (f: ImageFrame) => void,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const handle = (raw: string) => {
    const lines = raw.split("\n");
    let event = "message";
    let dataStr = "";
    for (const l of lines) {
      if (l.startsWith("event:")) event = l.slice(6).trim();
      else if (l.startsWith("data:")) dataStr += l.slice(5).trim();
    }
    if (!dataStr) return;

    let p: { type?: string; b64_json?: string; images?: string[] };
    try {
      p = JSON.parse(dataStr) as { type?: string; b64_json?: string; images?: string[] };
    } catch {
      return;
    }

    if (Array.isArray(p.images) && p.images.length) {
      const dataUrls = p.images.map((b64) => `data:image/png;base64,${b64}`);
      onFrame({ dataUrl: dataUrls[0], dataUrls, final: true });
      return;
    }

    const b64 = p.b64_json;
    if (!b64) return;
    const dataUrl = `data:image/png;base64,${b64}`;
    const final = event === "image_generation.completed" || p.type === "image_generation.completed";
    onFrame({ dataUrl, dataUrls: [dataUrl], final });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      handle(raw);
    }
  }
  if (buf.trim()) handle(buf);
}

function storageKind(mime: string, fileName: string): MeteredKind {
  const m = mime.toLowerCase();
  const n = fileName.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (/\.(docx?|xlsx?|pptx?|txt|csv|rtf|odt)$/.test(n)) return "document";
  return "attachment";
}

async function assertStorageCapacity(workspaceId: string, incomingBytes: number) {
  // As tabelas de metering são versionadas por migration; os tipos gerados
  // ainda não as conhecem, então este cast fica isolado nesta fronteira.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: moduleRow, error: moduleError } = await sb
    .from("workspace_modules")
    .select("plan_code")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (moduleError) throw new Error(moduleError.message);

  const { data: files, error: filesError } = await sb
    .from("workspace_storage_files")
    .select("size_bytes")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  if (filesError) throw new Error(filesError.message);

  const { data: addons, error: addonsError } = await sb
    .from("workspace_storage_addons")
    .select("extra_gb")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  if (addonsError) throw new Error(addonsError.message);

  const planCode = moduleRow?.plan_code ?? "starter";
  const usedBytes = (files ?? []).reduce((sum: number, row: { size_bytes?: number | string }) => sum + Number(row.size_bytes || 0), 0);
  const addonGb = (addons ?? []).reduce((sum: number, row: { extra_gb?: number }) => sum + Number(row.extra_gb || 0), 0);
  const limitBytes = includedStorageBytes(planCode) + addonGb * BYTES_PER_GB;
  if (usedBytes + incomingBytes > limitBytes) {
    const missingGb = Math.max(1, Math.ceil((usedBytes + incomingBytes - limitBytes) / BYTES_PER_GB));
    throw new Error(`Armazenamento insuficiente. Libere espaço ou adicione pelo menos ${missingGb} GB ao plano.`);
  }
}

async function registerMeteredObject(params: {
  workspaceId: string;
  bucket: string;
  storagePath: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  source: MeteredSource;
}) {
  const { data: userData } = await supabase.auth.getUser();
  // Fronteira temporária até regenerar types.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { error } = await sb.from("workspace_storage_files").insert({
    workspace_id: params.workspaceId,
    bucket: params.bucket,
    storage_path: params.storagePath,
    file_name: params.fileName,
    mime: params.mime || null,
    kind: storageKind(params.mime, params.fileName),
    source: params.source,
    size_bytes: params.sizeBytes,
    created_by: userData.user?.id ?? null,
  });
  if (error) throw new Error(error.message);
}

function isMissingStorageMeteringContract(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /workspace_storage_(files|addons)|schema cache|relation .* does not exist/i.test(message);
}

async function uploadAndMeter(params: {
  workspaceId: string;
  bucket: string;
  path: string;
  body: Blob | ArrayBuffer | ArrayBufferView;
  fileName: string;
  mime: string;
  sizeBytes: number;
  source: MeteredSource;
}) {
  let meteringAvailable = true;
  try {
    await assertStorageCapacity(params.workspaceId, params.sizeBytes);
  } catch (capacityError) {
    if (!isMissingStorageMeteringContract(capacityError)) throw capacityError;
    meteringAvailable = false;
    console.warn(
      "[social-storage] Metering ainda não disponível; preservando o arquivo gerado e aguardando a migration do ambiente.",
      capacityError,
    );
  }

  const { error } = await supabase.storage
    .from(params.bucket)
    .upload(params.path, params.body, { contentType: params.mime || "application/octet-stream", upsert: false });
  if (error) throw new Error(`Falha ao salvar arquivo no storage: ${error.message}`);

  if (!meteringAvailable) return;

  try {
    await registerMeteredObject({
      workspaceId: params.workspaceId,
      bucket: params.bucket,
      storagePath: params.path,
      fileName: params.fileName,
      mime: params.mime,
      sizeBytes: params.sizeBytes,
      source: params.source,
    });
  } catch (registerError) {
    if (isMissingStorageMeteringContract(registerError)) {
      console.warn(
        "[social-storage] Arquivo salvo; registro de metering indisponível neste ambiente.",
        registerError,
      );
      return;
    }
    await supabase.storage.from(params.bucket).remove([params.path]);
    throw registerError;
  }
}

export async function uploadDataUrlToBucket(params: {
  workspaceId: string;
  dataUrl: string;
  folder?: string;
  ext?: string;
  source?: MeteredSource;
}): Promise<string> {
  const { workspaceId, dataUrl, folder = "posts", ext = "png", source = "social_media" } = params;
  const base64 = dataUrl.split(",")[1] ?? "";
  if (!base64) throw new Error("A imagem gerada não contém dados válidos.");
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const path = `${workspaceId}/${folder}/${fileName}`;
  await uploadAndMeter({
    workspaceId,
    bucket: "social-media",
    path,
    body: arr,
    fileName,
    mime: `image/${ext}`,
    sizeBytes: arr.byteLength,
    source,
  });
  return path;
}

export async function uploadFileToBucket(params: {
  workspaceId: string;
  file: File;
  folder?: string;
  source?: MeteredSource;
}): Promise<string> {
  const { workspaceId, file, folder = "refs", source = "social_media" } = params;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storedName = `${crypto.randomUUID()}.${ext}`;
  const path = `${workspaceId}/${folder}/${storedName}`;
  await uploadAndMeter({
    workspaceId,
    bucket: "social-media",
    path,
    body: file,
    fileName: file.name || storedName,
    mime: file.type || "application/octet-stream",
    sizeBytes: file.size,
    source,
  });
  return path;
}

export async function removeFileFromBucket(path: string): Promise<void> {
  const { error } = await supabase.storage.from("social-media").remove([path]);
  if (error) throw new Error(`Falha ao remover arquivo do storage: ${error.message}`);
}

export async function signedUrlFor(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from("social-media").createSignedUrl(path, expiresIn);
  if (error) throw new Error(`Falha ao abrir arquivo do storage: ${error.message}`);
  return data?.signedUrl ?? null;
}
