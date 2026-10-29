import { useState, useRef, type FormEvent } from 'react';
import { Plus, Pencil, Loader2, X, FileText, Building2, Upload, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { platformDb, currency, type Property } from '@/lib/platform-data';
import { useAuth } from '@/hooks/useAuth';
import { isVideoUrl, fileNameFromUrl } from '@/lib/media';
import { toast } from 'sonner';

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return <label className="vp-field"><span>{title}</span>{children}</label>;
}
export default function Portfolio({ properties, refresh }: { properties: Property[]; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<{ row?: Property } | null>(null);
  return <><div className="vp-toolbar"><span>{properties.length} imoveis</span><Button onClick={() => setEditing({})}><Plus size={16} />Imovel</Button></div><div className="vp-property-grid">{properties.map(p => <article key={p.id} className="vp-property">{p.images?.[0] ? isVideoUrl(p.images[0]) ? <video src={p.images[0]} muted preload="metadata" /> : <img src={p.images[0]} alt={p.title} loading="lazy" /> : <div className="vp-property-placeholder"><Building2 size={32} /></div>}<div><span className={`vp-badge ${p.published ? 'vp-published' : ''}`}>{p.published ? 'Publicado' : 'Rascunho'}</span><h2>{p.title}</h2><p>{p.city}</p><strong>{p.price == null ? 'Valor nao informado' : currency(Number(p.price))}</strong><footer><span>{p.bedrooms ?? '-'} quartos · {p.area_m2 ?? '-'} m²</span><button className="vp-icon" title={`Editar ${p.title}`} onClick={() => setEditing({ row: p })}><Pencil size={16} /></button></footer></div></article>)}</div>{!properties.length && <div className="vp-empty">Nenhum imovel encontrado.</div>}<Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}><DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing?.row ? 'Editar imovel' : 'Novo imovel'}</DialogTitle></DialogHeader>{editing && <PropertyForm key={editing.row?.id ?? 'new'} row={editing.row} onSaved={async () => { setEditing(null); await refresh(); }} />}</DialogContent></Dialog></>;
}

function PropertyForm({ row, onSaved }: { row?: Property; onSaved: () => Promise<void> }) {
  const { user } = useAuth();
  const id = useRef(row?.id ?? crypto.randomUUID());
  const [images, setImages] = useState<string[]>(row?.images ?? []);
  const [pdfs, setPdfs] = useState<string[]>(row?.pdfs ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const upload = async (files: FileList | null, pdf: boolean) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (pdf ? file.type !== 'application/pdf' : !/^(image|video)\//.test(file.type)) throw new Error('Formato de arquivo invalido.');
        if (file.size > 150 * 1024 * 1024) throw new Error('O arquivo ultrapassa 150 MB.');
        const bucket = pdf ? 'property-pdfs' : 'property-images';
        const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const result = await platformDb.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
        if (result.error) throw new Error(result.error.message);
        const signed = await platformDb.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (signed.error || !signed.data?.signedUrl) throw new Error('Arquivo enviado, mas acesso nao confirmado.');
        if (pdf) setPdfs(old => [...old, signed.data.signedUrl]);
        else setImages(old => [...old, signed.data.signedUrl]);
      }
    } catch (error) { toast.error((error as Error).message); }
    finally { setUploading(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || saving || uploading) return;
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    const number = (key: string) => text(key) === '' ? null : Number(text(key));
    const payload = {
      title: text('title'), city: text('city'), address: text('address') || null, description: text('description') || null,
      price: number('price'), monthly_parcel: number('monthly_parcel'), subsidy_estimate: number('subsidy_estimate'), down_payment: number('down_payment'),
      area_m2: number('area_m2'), bedrooms: number('bedrooms'), bathrooms: number('bathrooms'), tag: text('tag') || null,
      images, pdfs, published: form.has('published'), show_parcel: form.has('show_parcel'), show_down_payment: form.has('show_down_payment'),
      construction_status: text('construction_status') === 'na_planta' ? 'na_planta' as const : 'pronto' as const, launch_date: text('launch_date') || null,
    };
    if (Object.values(payload).some(v => typeof v === 'number' && (!Number.isFinite(v) || v < 0))) { toast.error('Valor numerico invalido.'); return; }
    setSaving(true);
    try {
      const result = row ? await platformDb.from('properties').update(payload).eq('id', row.id).select('id').single() : await platformDb.from('properties').insert({ ...payload, id: id.current, created_by: user.id }).select('id').single();
      if (result.error) throw new Error(result.error.message);
      toast.success('Imovel salvo.'); await onSaved();
    } catch (error) { toast.error('Salvamento nao confirmado. Confira a carteira antes de repetir. ' + (error as Error).message); }
    finally { setSaving(false); }
  };
  return <form className="vp-form" onSubmit={submit}>
    <div className="vp-form-grid"><Field title="Titulo"><Input name="title" required maxLength={150} defaultValue={row?.title} /></Field><Field title="Cidade"><Input name="city" required maxLength={120} defaultValue={row?.city} /></Field><Field title="Endereco"><Input name="address" maxLength={200} defaultValue={row?.address ?? ''} /></Field><Field title="Etiqueta"><Input name="tag" maxLength={40} defaultValue={row?.tag ?? ''} /></Field></div>
    <Field title="Descricao"><Textarea name="description" maxLength={3000} rows={4} defaultValue={row?.description ?? ''} /></Field>
    <div className="vp-form-grid">{([['price', 'Valor do imovel (R$)'], ['monthly_parcel', 'Parcela mensal (R$)'], ['subsidy_estimate', 'Subsidio estimado (R$)'], ['down_payment', 'Renda minima (R$)'], ['bedrooms', 'Quartos'], ['bathrooms', 'Banheiros'], ['area_m2', 'Area (m²)']] as const).map(([key, label]) => <Field key={key} title={label}><Input name={key} type="number" min="0" step={['bedrooms', 'bathrooms'].includes(key) ? '1' : '0.01'} defaultValue={row?.[key] ?? ''} /></Field>)}<Field title="Situacao"><select name="construction_status" defaultValue={row?.construction_status ?? 'pronto'}><option value="pronto">Pronto para morar</option><option value="na_planta">Na planta</option></select></Field><Field title="Lancamento / entrega"><Input name="launch_date" type="date" defaultValue={row?.launch_date ?? ''} /></Field></div>
    <div className="vp-checks"><label><input name="published" type="checkbox" defaultChecked={row?.published ?? false} />Publicado no site</label><label><input name="show_parcel" type="checkbox" defaultChecked={row?.show_parcel ?? true} />Exibir parcela</label><label><input name="show_down_payment" type="checkbox" defaultChecked={row?.show_down_payment ?? false} />Exibir renda minima</label></div>
    <h3>Fotos e videos</h3><div className="vp-media-grid">{images.map((url, i) => <div key={url}>{isVideoUrl(url) ? <video src={url} muted preload="metadata" /> : <img src={url} alt={`Foto ${i + 1}`} />}<button type="button" title="Remover da galeria" onClick={() => setImages(old => old.filter((_, index) => index !== i))}><X size={14} /></button></div>)}</div>
    <label className="vp-upload"><Upload size={17} />Fotos ou videos<input disabled={uploading || saving} type="file" accept="image/*,video/*" multiple onChange={e => upload(e.target.files, false)} /></label>
    <h3>Documentos do imovel</h3>{pdfs.map((url, i) => <div className="vp-file" key={url}><FileText size={17} /><a href={url} target="_blank" rel="noreferrer">{fileNameFromUrl(url)} <ExternalLink size={12} /></a><button type="button" title="Remover da lista" onClick={() => setPdfs(old => old.filter((_, index) => index !== i))}><X size={15} /></button></div>)}<label className="vp-upload"><Upload size={17} />PDF<input disabled={uploading || saving} type="file" accept="application/pdf" multiple onChange={e => upload(e.target.files, true)} /></label>
    <Button type="submit" disabled={saving || uploading}>{(saving || uploading) && <Loader2 className="animate-spin" size={16} />}{uploading ? 'Enviando arquivos' : 'Salvar imovel'}</Button>
  </form>;
}
