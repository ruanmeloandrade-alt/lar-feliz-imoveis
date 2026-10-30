/**
 * Resolve as "Fontes de conhecimento" configuradas no Agente IA em um bloco de
 * texto que é injetado no system prompt. Sem isso, a ação "Responder usando a
 * fonte da base de conhecimento" instruía o modelo a usar uma fonte que nunca
 * era enviada — e ele respondia com conhecimento genérico.
 */

export type AgentKnowledgeSource = {
  id?: string;
  type?: string;
  kind?: string;
  label?: string;
  title?: string;
  content?: string;
  url?: string;
  storagePath?: string;
  fileName?: string;
  mime?: string;
};

const MAX_PER_SOURCE = 6000;
const MAX_TOTAL = 24000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai texto legível de um buffer (txt/md/csv/json direto; PDF por heurística). */
function extractText(bytes: Uint8Array, mime: string, fileName: string): string {
  const name = (fileName || "").toLowerCase();
  const isPdf = mime.includes("pdf") || name.endsWith(".pdf");
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!isPdf) {
    const printable = decoded.replace(/[^\P{C}\n\t]/gu, "");
    // documentos binários (doc/docx) viram lixo: só aceita se a maior parte for texto
    const ratio = printable.length / Math.max(1, decoded.length);
    if (ratio > 0.85) return printable.trim();
    // docx é um zip; tenta capturar os trechos de texto do XML embutido
    const xml = decoded.match(/<w:t[^>]*>([^<]{2,})<\/w:t>/g);
    if (xml?.length) return stripHtml(xml.join(" "));
    return "";
  }
  // PDF: extrai strings dos operadores de texto
  const chunks = Array.from(decoded.matchAll(/\((?:\\.|[^\\()])*\)/g))
    .map((m) => m[0].slice(1, -1).replace(/\\([()\\])/g, "$1"))
    .filter((s) => /[A-Za-zÀ-ÿ0-9]/.test(s));
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

async function resolveOne(
  source: AgentKnowledgeSource,
  download: ((path: string) => Promise<Uint8Array | null>) | null,
): Promise<{ title: string; text: string } | null> {
  const kind = String(source.type ?? source.kind ?? "text").toLowerCase();
  const title = source.title || source.label || source.fileName || source.url || "fonte";

  if (source.content?.trim()) return { title, text: source.content.trim() };

  if (kind === "url" && source.url) {
    try {
      const res = await fetch(source.url, {
        headers: { "User-Agent": "MKTOn-Agent/1.0", Accept: "text/html,text/plain,*/*" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return { title, text: `(não foi possível ler ${source.url}: HTTP ${res.status})` };
      const body = await res.text();
      const text = body.trimStart().startsWith("<") ? stripHtml(body) : body.trim();
      return text ? { title: `${title} (${source.url})`, text } : null;
    } catch {
      return { title, text: `(não foi possível acessar ${source.url})` };
    }
  }

  if (kind === "document" && source.storagePath && download) {
    try {
      const bytes = await download(source.storagePath);
      if (!bytes) return null;
      const text = extractText(bytes, source.mime ?? "", source.fileName ?? "");
      return text ? { title, text } : null;
    } catch {
      return null;
    }
  }

  return null;
}

type StorageLike = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: unknown }>;
    };
  };
};

/**
 * Monta o bloco "FONTES DE CONHECIMENTO" a partir das fontes salvas no agente.
 * Retorna string vazia quando não há nenhuma fonte utilizável.
 */
export async function buildAgentKnowledgeBlock(
  sources: AgentKnowledgeSource[] | null | undefined,
  supabase?: StorageLike | null,
  bucket = "salesbot-media",
): Promise<string> {
  const list = (sources ?? []).filter(Boolean);
  if (!list.length) return "";

  const download = supabase
    ? async (path: string) => {
        const { data } = await supabase.storage.from(bucket).download(path);
        if (!data) return null;
        return new Uint8Array(await data.arrayBuffer());
      }
    : null;

  const resolved = (await Promise.all(list.map((s) => resolveOne(s, download)))).filter(
    (r): r is { title: string; text: string } => Boolean(r?.text?.trim()),
  );
  if (!resolved.length) return "";

  const parts: string[] = [
    "=== FONTES DE CONHECIMENTO (use SOMENTE estas informações para responder dúvidas factuais sobre a empresa, produtos, preços e políticas; se a resposta não estiver aqui, diga que vai verificar) ===",
  ];
  let total = 0;
  for (const r of resolved) {
    const text = r.text.slice(0, MAX_PER_SOURCE);
    if (total + text.length > MAX_TOTAL) break;
    total += text.length;
    parts.push(`--- ${r.title} ---\n${text}`);
  }
  return parts.join("\n\n");
}
