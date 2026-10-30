// Transcrição de áudios recebidos (WhatsApp) para o Agente IA.
// Isolamento multi-tenant: usa SEMPRE a chave OpenAI do próprio workspace.
// O resultado fica em cache no campo raw.transcription da mensagem, para não
// pagar transcrição duas vezes pelo mesmo áudio.

type AnySb = {
  from: (t: string) => any;
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const MAX_BYTES = 24 * 1024 * 1024;

function extFromType(mime: string): string {
  const m = mime.split(";")[0].trim().toLowerCase();
  return (
    ({
      "audio/ogg": "ogg",
      "audio/opus": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/mp4": "m4a",
      "audio/m4a": "m4a",
      "audio/x-m4a": "m4a",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/webm": "webm",
    } as Record<string, string>)[m] ?? "ogg"
  );
}

/**
 * Baixa o áudio e transcreve com o modelo de transcrição da OpenAI do workspace.
 * Retorna null quando não é possível transcrever (sem chave, download falhou etc.).
 */
export async function transcribeAudioUrl(
  sb: AnySb,
  workspaceId: string,
  audioUrl: string,
): Promise<string | null> {
  if (!audioUrl) return null;
  try {
    const { resolveWorkspaceAiKey } = await import("@/lib/workspace-ai-key.server");
    const key = await resolveWorkspaceAiKey(sb as never, workspaceId);
    if (key.provider !== "openai") return null;

    const dl = await fetch(audioUrl);
    if (!dl.ok) return null;
    const blob = await dl.blob();
    if (!blob.size || blob.size > MAX_BYTES) return null;

    const form = new FormData();
    form.append("file", blob, `audio.${extFromType(blob.type || "audio/ogg")}`);
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("response_format", "json");

    const res = await fetch(`${key.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key.apiKey}` },
      body: form,
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { text?: string };
    const text = (json.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}

/** Transcreve o áudio de uma mensagem, usando/gravando cache em raw.transcription. */
export async function transcribeWhatsappAudioMessage(
  sb: AnySb,
  workspaceId: string,
  row: { id?: string; media_url?: string | null; raw?: Record<string, unknown> | null },
): Promise<string | null> {
  const cached = (row.raw as { transcription?: string } | null)?.transcription;
  if (typeof cached === "string" && cached.trim()) return cached.trim();
  if (!row.media_url) return null;

  const text = await transcribeAudioUrl(sb, workspaceId, row.media_url);
  if (!text) return null;

  if (row.id) {
    try {
      await sb
        .from("whatsapp_web_messages")
        .update({ raw: { ...(row.raw ?? {}), transcription: text } })
        .eq("id", row.id)
        .eq("workspace_id", workspaceId);
    } catch {
      // cache é otimização; falha aqui não impede o uso da transcrição
    }
  }
  return text;
}
