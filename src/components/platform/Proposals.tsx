import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Loader2, FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { currency, dateTime, pages, platformDb, type PlatformData, type Proposal } from '@/lib/platform-data';
import { toast } from 'sonner';

const statuses = { draft: 'Rascunho', sent: 'Enviada', accepted: 'Aceita', rejected: 'Recusada', contracted: 'Contrato firmado' };
export default function Proposals({ data }: { data: PlatformData }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [editor, setEditor] = useState<{ row?: Proposal } | null>(null);
  const [preview, setPreview] = useState<Proposal | null>(null);
  const query = useQuery({ queryKey: ['vanessa-proposals', user?.id], queryFn: async () => {
    return pages<Proposal>((start, end) => platformDb.from('vanessa_proposals').select('*').eq('workspace_id', data.workspace.id).order('created_at', { ascending: false }).order('id').range(start, end));
  } });
  const openDocument = async (path: string) => {
    const result = await platformDb.storage.from('vanessa-documents').createSignedUrl(path, 300);
    if (result.error || !result.data?.signedUrl) { toast.error('Documento indisponivel.'); return; }
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  };
  return <><div className="vp-toolbar"><span>Propostas e documentos</span><Button disabled={!data.contacts.length} onClick={() => setEditor({})}><Plus size={16} />Proposta</Button></div>{query.isError ? <div role="alert" className="vp-error">{query.error.message}<Button onClick={() => query.refetch()}>Tentar novamente</Button></div> : query.isPending ? <Loader2 className="animate-spin" /> : <div className="vp-table-wrap"><table><thead><tr><th>Proposta</th><th>Cliente</th><th>Valor</th><th>Situacao</th><th>Validade</th><th /></tr></thead><tbody>{query.data.map(p => <tr key={p.id}><td><strong>{p.title}</strong><small>{dateTime(p.created_at)}</small></td><td>{data.contacts.find(c => c.id === p.contact_id)?.name}</td><td>{currency(Number(p.amount))}</td><td>{statuses[p.status]}</td><td>{p.valid_until?.split('-').reverse().join('/') || '-'}</td><td><div className="vp-actions"><button className="vp-icon" title="Ver proposta" onClick={() => setPreview(p)}><FileText size={16} /></button>{p.document_path && <button className="vp-icon" title="Abrir documento anexado" onClick={() => openDocument(p.document_path!)}><FileText size={16} /></button>}<button className="vp-icon" title="Editar proposta" onClick={() => setEditor({ row: p })}><Pencil size={16} /></button></div></td></tr>)}</tbody></table>{!query.data.length && <div className="vp-empty">Nenhuma proposta cadastrada.{!data.contacts.length && ' Cadastre um cliente primeiro.'}</div>}</div>}
    <Dialog open={!!editor} onOpenChange={open => { if (!open) setEditor(null); }}><DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Proposta imobiliaria</DialogTitle></DialogHeader>{editor && <ProposalForm data={data} row={editor.row} onSaved={async () => { setEditor(null); await cache.invalidateQueries({ queryKey: ['vanessa-proposals'] }); }} />}</DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto vp-proposal-preview"><DialogHeader><DialogTitle>Proposta comercial</DialogTitle></DialogHeader>{preview && <article className="vp-proposal-document"><h2>Vanessa Simoni</h2><h3>{preview.title}</h3><p><strong>Cliente:</strong> {data.contacts.find(c => c.id === preview.contact_id)?.name}</p><p><strong>Imovel:</strong> {data.properties.find(p => p.id === preview.property_id)?.title || 'Nao vinculado'}</p><p><strong>Valor:</strong> {currency(Number(preview.amount))}</p><p><strong>Situacao:</strong> {statuses[preview.status]}</p>{preview.valid_until && <p><strong>Validade:</strong> {preview.valid_until.split('-').reverse().join('/')}</p>}<div className="vp-terms">{preview.terms}</div><Button className="vp-no-print" variant="outline" onClick={() => window.print()}><Printer size={16} />Imprimir</Button></article>}</DialogContent></Dialog>
  </>;
}
function ProposalForm({ data, row, onSaved }: { data: PlatformData; row?: Proposal; onSaved: () => Promise<void> }) {
  const { user } = useAuth();
  const id = useRef(row?.id ?? crypto.randomUUID());
  const [path, setPath] = useState(row?.document_path ?? null);
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file || !user) return;
    if (file.type !== 'application/pdf' || file.size > 20 * 1024 * 1024) { toast.error('Envie um PDF de ate 20 MB.'); return; }
    setBusy(true);
    try {
      const object = `${user.id}/${id.current}/${crypto.randomUUID()}.pdf`;
      const result = await platformDb.storage.from('vanessa-documents').upload(object, file, { upsert: false, contentType: 'application/pdf' });
      if (result.error) throw new Error(result.error.message);
      setPath(object); toast.success('Documento anexado.');
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) ?? '').trim();
    const amount = Number(get('amount'));
    if (!Number.isFinite(amount) || amount < 0) { toast.error('Valor invalido.'); return; }
    setBusy(true);
    try {
      const payload = { title: get('title'), contact_id: get('contact'), property_id: get('property') || null, amount, status: get('status') as Proposal['status'], valid_until: get('valid_until') || null, terms: get('terms'), document_path: path };
      const result = row ? await platformDb.from('vanessa_proposals').update(payload).eq('id', row.id).select('id').single() : await platformDb.from('vanessa_proposals').insert({ ...payload, id: id.current, workspace_id: data.workspace.id }).select('id').single();
      if (result.error) throw new Error(result.error.message);
      await onSaved(); toast.success('Proposta salva.');
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  };
  return <form className="vp-form" onSubmit={submit}><label className="vp-field">Titulo<Input name="title" required maxLength={200} defaultValue={row?.title} /></label><label className="vp-field">Cliente<select name="contact" required defaultValue={row?.contact_id ?? data.contacts[0]?.id}>{data.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="vp-field">Imovel<select name="property" defaultValue={row?.property_id ?? ''}><option value="">Sem imovel vinculado</option>{data.properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label className="vp-field">Valor (R$)<Input name="amount" type="number" min="0" step="0.01" required defaultValue={row?.amount ?? ''} /></label><label className="vp-field">Situacao<select name="status" defaultValue={row?.status ?? 'draft'}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="vp-field">Validade<Input name="valid_until" type="date" defaultValue={row?.valid_until ?? ''} /></label><label className="vp-field">Condicoes<Textarea name="terms" rows={5} maxLength={10000} defaultValue={row?.terms} /></label><label className="vp-field">Documento PDF<input disabled={busy} type="file" accept="application/pdf" onChange={e => upload(e.target.files?.[0])} /></label>{path && <small>Documento anexado</small>}<Button disabled={busy} type="submit">{busy && <Loader2 size={16} className="animate-spin" />}Salvar proposta</Button></form>;
}
