import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Link as LinkIcon, Type, Plus, Trash2, Loader2, Upload } from "lucide-react";
import { uploadSalesbotMedia } from "@/lib/salesbots.functions";
import { supabase } from "@/integrations/supabase/client";

export type AgentSource = (
  | { id: string; type: "text"; label: string; content: string }
  | { id: string; type: "url"; label: string; url: string }
  | { id: string; type: "document"; label: string; storagePath: string; fileName: string; mime: string }) & { brainSourceId?: string };

const ACCEPT_DOCS =
  ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

function uid() {
  return `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function AgentSourcesEditor({
  value,
  onChange,
  workspaceId,
}: {
  value: AgentSource[];
  onChange: (next: AgentSource[]) => void;
  workspaceId?: string | null;
}) {
  const upload = useServerFn(uploadSalesbotMedia);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [brainList, setBrainList] = useState<{ workspaceId: string; rows: Array<{ id: string; title: string; enabled: boolean }> } | null>(null);
  const [loadingBrain, setLoadingBrain] = useState(false);
  const currentWorkspace = useRef(workspaceId); currentWorkspace.current = workspaceId;
  async function loadBrain() {
    if (!workspaceId || loadingBrain) return;
    setLoadingBrain(true); setErr(null);
    try {
      const { data, error } = await supabase.from('ai_brain_sources').select('id,title,enabled')
        .eq('workspace_id', workspaceId).order('title').abortSignal(AbortSignal.timeout(20000));
      if (currentWorkspace.current !== workspaceId) return;
      if (error) throw new Error('Não foi possível carregar as fontes do Cérebro.');
      setBrainList({workspaceId, rows: data ?? []});
    } catch (e) { if (currentWorkspace.current === workspaceId) setErr((e as Error).message); }
    finally { setLoadingBrain(false); }
  }

  const add = (s: AgentSource) => onChange([...(value ?? []), s]);
  const update = (id: string, patch: Partial<AgentSource>) =>
    onChange((value ?? []).map((s) => (s.id === id ? ({ ...s, ...patch } as AgentSource) : s)));
  const remove = (id: string) => onChange((value ?? []).filter((s) => s.id !== id));

  const handleFile = async (file: File) => {
    setErr(null);
    if (file.size > 20 * 1024 * 1024) {
      setErr("Arquivo maior que 20 MB.");
      return;
    }
    try {
      setUploading(true);
      const base64 = await fileToBase64(file);
      const res = await upload({
        data: {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          kind: "document",
          base64,
        },
      });
      add({
        id: uid(),
        type: "document",
        label: file.name,
        storagePath: res.path,
        fileName: res.fileName,
        mime: res.mime,
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fontes de conhecimento
          </label>
          <p className="text-[10px] text-muted-foreground">
            Complementa o prompt sem inchá-lo. Adicione trechos de texto, documentos (PDF, DOC, DOCX, TXT) ou URLs
            que o agente deve consultar.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => add({ id: uid(), type: "text", label: "Novo trecho", content: "" })}
            className="text-[11px] px-2 py-1 rounded border border-border hover:bg-muted inline-flex items-center gap-1"
          >
            <Type className="w-3 h-3" /> Texto
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-[11px] px-2 py-1 rounded border border-border hover:bg-muted inline-flex items-center gap-1 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Documento
          </button>
          <button
            type="button"
            onClick={() => add({ id: uid(), type: "url", label: "", url: "" })}
            className="text-[11px] px-2 py-1 rounded border border-border hover:bg-muted inline-flex items-center gap-1"
          >
            <LinkIcon className="w-3 h-3" /> URL
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_DOCS}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {workspaceId && <button type="button" className="mb-2 rounded border px-2 py-1 text-xs" disabled={loadingBrain} onClick={() => void loadBrain()}>{loadingBrain ? 'Carregando fontes...' : 'Vincular fonte do Cérebro'}</button>}
      {brainList && brainList.workspaceId === workspaceId && <div role="group" aria-label="Fontes do Cérebro" className="mb-3 space-y-2 rounded border p-3">
        {brainList.rows.length === 0 && <p className="text-xs">Nenhuma fonte cadastrada no Cérebro desta empresa.</p>}
        {brainList.rows.map(source => {
          const selected = value.some(s => s.brainSourceId === source.id);
          return <div key={source.id} className="flex items-center justify-between gap-2 text-xs"><span>{source.title}{!source.enabled && ' (pausada)'}</span><button type="button" className="rounded border px-2 py-1" disabled={selected || !source.enabled} onClick={() => add({id:source.id,type:'text',label:source.title,content:'',brainSourceId:source.id})}>{selected ? 'Vinculada' : 'Vincular'}</button></div>;
        })}
        <button type="button" className="text-xs underline" onClick={() => setBrainList(null)}>Fechar lista</button>
      </div>}

      {err && <div className="text-[11px] text-destructive mb-2">{err}</div>}

      {(!value || value.length === 0) ? (
        <div className="text-[11px] text-muted-foreground text-center border border-dashed border-border rounded py-4">
          Nenhuma fonte. Use os botões acima para adicionar texto, documento ou URL.
        </div>
      ) : (
        <ul className="space-y-2">
          {value.map((s) => (
            <li key={s.id} className="border border-border rounded p-2 bg-background/50">
              <div className="flex items-center gap-2 mb-1.5">
                {s.type === "text" && <Type className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                {s.type === "url" && <LinkIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                {s.type === "document" && <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <input
                  value={s.label}
                  readOnly={Boolean(s.brainSourceId)}
                  onChange={(e) => update(s.id, { label: e.target.value } as Partial<AgentSource>)}
                  placeholder={
                    s.type === "url"
                      ? "Nome da fonte (ex: Política de troca)"
                      : s.type === "document"
                        ? "Nome (padrão: nome do arquivo)"
                        : "Título do trecho"
                  }
                  className="flex-1 bg-transparent text-xs font-medium outline-none border-b border-transparent focus:border-border"
                />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.type === "text" ? "texto" : s.type === "url" ? "url" : "doc"}
                </span>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Remover"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {s.brainSourceId && <p className="text-xs text-muted-foreground">Fonte vinculada ao Cérebro. O agente consulta o conteúdo atual e respeita fontes pausadas. <a href="/crm/agente-ia" target="_blank" rel="noopener noreferrer" className="underline">Ver e editar no Cérebro</a></p>}
              {s.type === "text" && !s.brainSourceId && (
                <textarea
                  value={s.content}
                  onChange={(e) => update(s.id, { content: e.target.value } as Partial<AgentSource>)}
                  rows={3}
                  placeholder="Cole aqui o conteúdo (ex: script de vendas, FAQ, política...)"
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                />
              )}
              {s.type === "url" && !s.brainSourceId && (
                <input
                  value={s.url}
                  onChange={(e) => update(s.id, { url: e.target.value } as Partial<AgentSource>)}
                  placeholder="https://..."
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                />
              )}
              {s.type === "document" && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {s.fileName}{" "}
                  <span className="text-muted-foreground/60">· {s.mime || "arquivo"}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
