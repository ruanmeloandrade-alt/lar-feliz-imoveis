import { useState } from 'react';
import { Eye, Pencil, FileDown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { normalizeBrainTerm, validateBrainTitle, validateBrainUrl, validateBrainFile, isWorkspaceBrainPath, requireEditedRow } from '@/lib/brain-editor.core';

export type EditableBrainSource = {
  id: string; title: string; source_type: 'text' | 'url' | 'document' | 'promotion';
  content: string; url: string | null; file_name: string | null;
  storage_path: string | null; enabled: boolean; updated_at?: string;
};
const fields = 'id,title,source_type,content,url,file_name,storage_path,enabled,updated_at';
const inputClass = 'mt-1 w-full rounded-md border bg-background p-3 text-sm text-foreground';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50';
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir. Confira o registro antes de repetir.';

async function requireCurrentWorkspace(workspaceId: string) {
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) throw new Error('Entre novamente para editar. Seu rascunho permanece nesta janela.');
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('current_workspace_id').eq('id', auth.user.id).single();
  if (profileError || profile?.current_workspace_id !== workspaceId) {
    throw new Error('A empresa ativa mudou. Feche a janela e abra a fonte na empresa correta.');
  }
  return auth.user.id;
}

/** Source content is shown as text, never as executable HTML. */
export function BrainSourceActions({ source, workspaceId, onSaved }: {
  source: EditableBrainSource; workspaceId: string | null; onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState(source);
  const [title, setTitle] = useState(source.title);
  const [content, setContent] = useState(source.content || '');
  const [url, setUrl] = useState(source.url || '');
  const [replacement, setReplacement] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const dirty = editing && (title !== snapshot.title || content !== (snapshot.content || '') || url !== (snapshot.url || '') || replacement !== null);

  function begin(edit: boolean) {
    setSnapshot(source); setTitle(source.title); setContent(source.content || ''); setUrl(source.url || '');
    setReplacement(null); setDocumentUrl(''); setError(''); setNotice(''); setEditing(edit); setOpen(true);
  }
  function close(next: boolean) {
    if (busy) return;
    if (!next && dirty && !window.confirm('Descartar as alterações ainda não salvas desta fonte?')) return;
    setOpen(next);
    if (!next) { setReplacement(null); setDocumentUrl(''); }
  }
  async function documentLink() {
    if (!workspaceId || !snapshot.storage_path || busy) return;
    setBusy(true); setError(''); setDocumentUrl('');
    try {
      await requireCurrentWorkspace(workspaceId);
      if (!isWorkspaceBrainPath(snapshot.storage_path, workspaceId)) throw new Error('O arquivo não pertence à empresa desta fonte.');
      const { data, error: signedError } = await supabase.storage.from('saude-slim-brain').createSignedUrl(snapshot.storage_path, 300);
      if (signedError || !data?.signedUrl) throw new Error('Arquivo indisponível. Confira o cadastro ou substitua o documento.');
      setDocumentUrl(data.signedUrl);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function save() {
    if (!workspaceId || busy) return;
    setBusy(true); setError(''); setNotice('');
    let newPath: string | null = null;
    let committed = false;
    try {
      await requireCurrentWorkspace(workspaceId);
      const validTitle = validateBrainTitle(title);
      const validUrl = snapshot.source_type === 'url' ? validateBrainUrl(url) : snapshot.url;
      if (content.length > 200000) throw new Error('O conteúdo deve ter no máximo 200.000 caracteres.');
      const patch: Record<string, unknown> = { title: validTitle, content, url: validUrl, updated_at: new Date().toISOString() };
      if (replacement && snapshot.source_type === 'document') {
        const extension = validateBrainFile(replacement);
        newPath = `${workspaceId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('saude-slim-brain').upload(newPath, replacement, { upsert: false });
        if (uploadError) throw new Error('O novo arquivo não foi confirmado. A fonte anterior foi preservada.');
        patch.storage_path = newPath; patch.file_name = replacement.name;
      }
      // Preserve the source identity, type, enabled state, author and other metadata.
      let query = supabase.from('ai_brain_sources').update(patch)
        .eq('id', snapshot.id).eq('workspace_id', workspaceId);
      if (snapshot.updated_at) query = query.eq('updated_at', snapshot.updated_at);
      else query = query.eq('title', snapshot.title).eq('content', snapshot.content || '');
      const result = await query.select(fields).abortSignal(AbortSignal.timeout(20000));
      if (result.error) {
        // Read only after an uncertain response: never resubmit the mutation automatically.
        const check = await supabase.from('ai_brain_sources').select(fields)
          .eq('workspace_id', workspaceId).eq('id', snapshot.id).maybeSingle();
        const current = check.data as EditableBrainSource | null;
        const persisted = current && new Date(current.updated_at || '').getTime() === new Date(String(patch.updated_at)).getTime() && current.title === validTitle
          && current.content === content && current.url === validUrl && (!newPath || current.storage_path === newPath);
        if (!persisted) throw new Error('Salvamento não confirmado. O rascunho foi mantido. Confira a fonte antes de tentar novamente.');
        setSnapshot(current); committed = true;
      } else {
        const row = requireEditedRow(result.data) as EditableBrainSource;
        setSnapshot(row); committed = true;
      }
      setReplacement(null); setEditing(false); setNotice('Fonte atualizada.'); setDocumentUrl('');
      // The old file is removed only after the new pointer is definitely persisted.
      if (newPath && source.storage_path && isWorkspaceBrainPath(source.storage_path, workspaceId)) {
        const cleanup = await supabase.storage.from('saude-slim-brain').remove([source.storage_path]);
        if (cleanup.error) setNotice('Fonte atualizada. O arquivo antigo permanece no armazenamento para conferência.');
      }
      try { await onSaved(); } catch { setNotice('Fonte salva. Atualize a lista para carregar o resultado.'); }
    } catch (e) {
      // Do not remove an uploaded file after an uncertain database response: it may be referenced.
      if (!committed) setError(errorText(e));
    } finally { setBusy(false); }
  }
  return <>
    <button type="button" className={buttonClass} disabled={!workspaceId} aria-label={`Ver conteúdo de ${source.title}`} onClick={() => begin(false)}><Eye size={15} />Ver conteúdo</button>
    <button type="button" className={buttonClass} disabled={!workspaceId} aria-label={`Editar fonte ${source.title}`} onClick={() => begin(true)}><Pencil size={15} />Editar</button>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-background text-foreground sm:max-w-3xl" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy || dirty) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>{editing ? 'Editar fonte' : 'Conteúdo da fonte'}</DialogTitle><DialogDescription>{snapshot.source_type === 'document' ? 'Confira o arquivo. Na edição, você pode alterar o título, as observações e substituir o documento.' : 'Leia o conteúdo cadastrado ou edite as informações. As mudanças só são aplicadas ao salvar.'}</DialogDescription></DialogHeader>
        {editing ? <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-4">
          <label className="block text-sm font-medium">Título<input className={inputClass} value={title} maxLength={300} onChange={e => setTitle(e.target.value)} disabled={busy} required /></label>
          {snapshot.source_type === 'url' && <label className="block text-sm font-medium">Endereço da página<input className={inputClass} type="url" value={url} onChange={e => setUrl(e.target.value)} disabled={busy} required /></label>}
          <label className="block text-sm font-medium">{snapshot.source_type === 'document' ? 'Observações do documento' : 'Conteúdo'}<textarea className={`${inputClass} min-h-60 leading-relaxed`} value={content} onChange={e => setContent(e.target.value)} disabled={busy} maxLength={200000} /></label>
          {snapshot.source_type === 'document' && <div className="space-y-2 rounded-md border p-3 text-sm"><p>Arquivo atual: <strong>{snapshot.file_name || 'Não informado'}</strong></p><label className="block">Substituir documento (opcional)<input type="file" className="mt-2 block w-full" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={e => { setReplacement(e.target.files?.[0] || null); setError(''); }} /></label><p className="text-xs text-muted-foreground">PDF, DOCX, TXT ou Markdown, até 20 MB. Sem selecionar outro arquivo, o documento atual é mantido.</p></div>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => close(false)}>Cancelar</button><button type="submit" className={`${buttonClass} bg-primary text-primary-foreground`} disabled={busy || !dirty}>{busy && <Loader2 size={15} className="animate-spin" />}{busy ? 'Salvando...' : 'Salvar alterações'}</button></div>
        </form> : <div className="space-y-4"><h3 className="break-words text-lg font-semibold">{snapshot.title}</h3><p className="text-sm text-muted-foreground">{snapshot.enabled ? 'Fonte ativa' : 'Fonte pausada'}</p>{snapshot.url && <p className="break-all rounded-md border p-3 text-sm">{snapshot.url}</p>}<div className="max-h-[48dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-4 text-sm leading-relaxed">{snapshot.content || (snapshot.source_type === 'document' ? 'O conteúdo está no arquivo anexado. Use Abrir arquivo para consultá-lo.' : 'Nenhum texto complementar cadastrado.')}</div>{snapshot.source_type === 'document' && <div className="space-y-3"><p className="break-words text-sm">{snapshot.file_name || 'Documento cadastrado'}</p><button type="button" className={buttonClass} disabled={busy || !snapshot.storage_path} onClick={() => void documentLink()}><FileDown size={15} />{busy ? 'Preparando arquivo...' : 'Abrir arquivo'}</button>{documentUrl && <a className="ml-3 text-sm underline" href={documentUrl} target="_blank" rel="noopener noreferrer">Visualizar ou baixar documento</a>}</div>}<button type="button" className={buttonClass} disabled={busy} onClick={() => { setTitle(snapshot.title); setContent(snapshot.content || ''); setUrl(snapshot.url || ''); setEditing(true); setNotice(''); }}><Pencil size={15} />Editar esta fonte</button></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      </DialogContent>
    </Dialog>
  </>;
}

export function BrainBlockedTermEditor({ item, workspaceId, onSaved }: {
  item: {id: string; term: string}; workspaceId: string | null; onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false); const [term, setTerm] = useState(item.term);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  function close(next: boolean) {
    if (busy) return;
    if (!next && term !== item.term && !window.confirm('Descartar a alteração desta palavra proibida?')) return;
    setOpen(next);
  }
  async function save() {
    if (!workspaceId || busy) return;
    setBusy(true); setError('');
    try {
      await requireCurrentWorkspace(workspaceId);
      const normalized = normalizeBrainTerm(term);
      const result = await supabase.from('ai_brain_blocked_terms').update({term: normalized})
        .eq('workspace_id', workspaceId).eq('id', item.id).eq('term', item.term)
        .select('id,term').abortSignal(AbortSignal.timeout(20000));
      if (result.error) {
        if (result.error.code === '23505') throw new Error('Essa palavra ou expressão já está cadastrada.');
        const check = await supabase.from('ai_brain_blocked_terms').select('id,term')
          .eq('workspace_id', workspaceId).eq('id', item.id).maybeSingle();
        if (check.error || check.data?.term !== normalized) throw new Error('Alteração não confirmada. Seu texto foi mantido; confira a lista antes de repetir.');
      } else requireEditedRow(result.data);
      try { await onSaved(); setOpen(false); } catch { setError('Palavra salva. Feche a janela e atualize a lista para conferir.'); }
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <>
    <button type="button" className={buttonClass} disabled={!workspaceId} aria-label={`Editar palavra ${item.term}`} onClick={() => { setTerm(item.term); setError(''); setOpen(true); }}><Pencil size={14} />Editar</button>
    <Dialog open={open} onOpenChange={close}><DialogContent className="bg-background text-foreground" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy || term !== item.term) e.preventDefault(); }}><DialogHeader><DialogTitle>Editar palavra proibida</DialogTitle><DialogDescription>Altere a palavra ou expressão sem excluir o cadastro. O estado atual do bloqueio será mantido.</DialogDescription></DialogHeader><form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-4"><label className="block text-sm font-medium">Palavra ou expressão<input className={inputClass} value={term} onChange={e => setTerm(e.target.value)} maxLength={120} disabled={busy} required autoFocus /></label><div className="flex justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => close(false)}>Cancelar</button><button type="submit" className={`${buttonClass} bg-primary text-primary-foreground`} disabled={busy || !term.trim() || term === item.term}>{busy ? 'Salvando...' : 'Salvar alteração'}</button></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</form></DialogContent></Dialog>
  </>;
}
