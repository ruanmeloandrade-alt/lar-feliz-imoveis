/* eslint-disable @typescript-eslint/no-explicit-any */

export type InboundMediaKind = "text" | "audio" | "image" | "sticker" | "pdf" | "document" | "video" | "unknown";

export type InboundMedia = {
  kind: InboundMediaKind;
  url?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  caption?: string | null;
};

type AiKey = { apiKey: string; baseUrl: string; model: string; provider?: string };

function safeName(value?: string | null) {
  return (value ?? "arquivo").replace(/[\r\n]/g, " ").slice(0, 180);
}

export function classifyInboundMedia(input: { messageType?: string | null; mimeType?: string | null; fileName?: string | null }): InboundMediaKind {
  const t = String(input.messageType ?? "").toLowerCase();
  const mime = String(input.mimeType ?? "").toLowerCase();
  const name = String(input.fileName ?? "").toLowerCase();
  if (t.includes("sticker")) return "sticker";
  if (t.includes("audio") || mime.startsWith("audio/")) return "audio";
  if (t.includes("image") || mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (t.includes("document") || mime.startsWith("application/") || mime.startsWith("text/")) return "document";
  if (t.includes("video") || mime.startsWith("video/")) return "video";
  if (t.includes("conversation") || t.includes("text")) return "text";
  return "unknown";
}

async function downloadMedia(media: InboundMedia): Promise<{ bytes: Uint8Array; blob: Blob }> {
  if (!media.url) throw new Error("Mídia recebida sem URL disponível.");
  const res = await fetch(media.url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Falha ao baixar mídia (${res.status}).`);
  const max = 20 * 1024 * 1024;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > max) throw new Error("Mídia excede o limite de 20 MB para leitura pela IA.");
  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > max) throw new Error("Mídia excede o limite de 20 MB para leitura pela IA.");
  return { bytes: buffer, blob: new Blob([buffer], { type: media.mimeType || "application/octet-stream" }) };
}

export async function transcribeInboundAudio(media: InboundMedia, ai: AiKey): Promise<string> {
  const { blob } = await downloadMedia(media);
  const form = new FormData();
  form.append("file", blob, safeName(media.fileName || "audio.ogg"));
  form.append("model", "whisper-1");
  const res = await fetch(`${ai.baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ai.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Falha ao transcrever áudio (${res.status}).`);
  const json = await res.json() as { text?: string };
  const text = String(json.text ?? "").trim();
  if (!text) throw new Error("A transcrição do áudio retornou vazia.");
  return text;
}

async function askVision(media: InboundMedia, ai: AiKey, instruction: string): Promise<string> {
  if (!media.url) return instruction;
  const res = await fetch(`${ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.apiKey}` },
    body: JSON.stringify({
      model: ai.model,
      temperature: 0.1,
      messages: [{ role: "user", content: [
        { type: "text", text: instruction },
        { type: "image_url", image_url: { url: media.url } },
      ] }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Falha ao interpretar imagem (${res.status}).`);
  const json = await res.json() as any;
  return String(json?.choices?.[0]?.message?.content ?? "").trim() || instruction;
}

async function extractDocumentText(media: InboundMedia, ai: AiKey): Promise<string> {
  const { bytes } = await downloadMedia(media);
  const mime = String(media.mimeType ?? "").toLowerCase();
  if (mime.startsWith("text/") || /\.(txt|csv|md|json|xml|html?)$/i.test(media.fileName ?? "")) {
    return new TextDecoder("utf-8").decode(bytes).slice(0, 120_000).trim();
  }

  // PDFs e documentos binários são enviados ao endpoint de arquivos quando o
  // provedor OpenAI-compatible oferece essa capacidade. O file_id é então
  // apresentado ao modelo como contexto do documento.
  const form = new FormData();
  form.append("purpose", "assistants");
  form.append("file", new Blob([bytes], { type: media.mimeType || "application/octet-stream" }), safeName(media.fileName));
  const upload = await fetch(`${ai.baseUrl.replace(/\/$/, "")}/files`, {
    method: "POST", headers: { Authorization: `Bearer ${ai.apiKey}` }, body: form, signal: AbortSignal.timeout(45_000),
  });
  if (!upload.ok) throw new Error(`Provedor não conseguiu receber o documento (${upload.status}).`);
  const uploaded = await upload.json() as { id?: string };
  if (!uploaded.id) throw new Error("Upload do documento não retornou file_id.");
  return `[documento enviado: ${safeName(media.fileName)}; file_id=${uploaded.id}]`;
}

/** Converte qualquer entrada de mídia em contexto textual seguro para o Agent IA. */
export async function prepareInboundForAgent(media: InboundMedia, ai: AiKey): Promise<string> {
  switch (media.kind) {
    case "audio": {
      const text = await transcribeInboundAudio(media, ai);
      return `[áudio transcrito] ${text}`;
    }
    case "image": {
      const description = await askVision(media, ai, "Descreva objetivamente esta imagem para um atendente responder ao cliente. Não invente detalhes.");
      return `[imagem recebida] ${description}${media.caption ? `\nLegenda: ${media.caption}` : ""}`;
    }
    case "sticker":
      return `[figurinha recebida]${media.caption ? ` ${media.caption}` : ""}`;
    case "pdf":
    case "document": {
      const content = await extractDocumentText(media, ai);
      return `[documento recebido: ${safeName(media.fileName)}]\n${content}`;
    }
    case "video":
      return `[vídeo recebido${media.fileName ? `: ${safeName(media.fileName)}` : ""}]${media.caption ? ` ${media.caption}` : ""}`;
    case "text":
      return media.caption?.trim() || "";
    default:
      return `[arquivo recebido${media.fileName ? `: ${safeName(media.fileName)}` : ""}]`;
  }
}
