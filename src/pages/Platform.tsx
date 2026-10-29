import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Building2, Users, LayoutDashboard, KanbanSquare, CalendarCheck, Workflow, ExternalLink, LogOut, Plus, Pencil, RefreshCw, MessageCircle, Check, ArrowRight, Loader2, History, Search, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import Login from '@/pages/Login';
import { toast } from 'sonner';
import { loadPlatform, platformDb, summarize, currency, dateTime, whatsappUrl, type Contact, type Deal, type Task, type Automation, type PlatformData } from '@/lib/platform-data';
import { createSlimFunnelLead, bulkMoveSlimFunnelLeads } from '@/lib/funnel-mutations.core';
import Portfolio from '@/components/platform/Portfolio';
import Proposals from '@/components/platform/Proposals';
import vanessaPhoto from '@/assets/vanessa.jpg';
import './platform.css';

const tabs = [
  ['inicio', 'Visao geral', LayoutDashboard], ['negociacoes', 'Negociacoes', KanbanSquare],
  ['clientes', 'Clientes', Users], ['imoveis', 'Imoveis', Building2],
  ['agenda', 'Agenda', CalendarCheck], ['automacoes', 'Automacoes', Workflow],
  ['propostas', 'Propostas e contratos', FileText],
] as const;
type Editor = { kind: 'contact'; row?: Contact } | { kind: 'deal'; row?: Deal } | { kind: 'task'; row?: Task } | { kind: 'automation'; row?: Automation };
export function Field({ title, children }: { title: string; children: ReactNode }) {
  return <label className="vp-field"><span>{title}</span>{children}</label>;
}
function Empty({ children }: { children: ReactNode }) { return <div className="vp-empty">{children}</div>; }

export default function Platform() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const tab = location.pathname.split('/')[2] || 'inicio';
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const moveAttempt = useRef<{ key: string; id: string } | null>(null);
  const query = useQuery({ queryKey: ['vanessa-platform', user?.id], queryFn: loadPlatform, enabled: !!user && isAdmin, refetchInterval: 30000, retry: 1 });
  const history = useQuery({ queryKey: ['vanessa-history', user?.id, historyId], enabled: !!user && isAdmin && !!historyId, queryFn: async () => {
    const r = await platformDb.from('vanessa_events').select('*').eq('deal_id', historyId!).order('created_at', { ascending: false }).limit(100);
    if (r.error) throw new Error(r.error.message);
    return r.data;
  } });
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ['vanessa-platform'] }); };
  const save = useMutation({ mutationFn: async (action: () => Promise<void>) => action(), onSuccess: async () => { setEditor(null); await refresh(); toast.success('Salvo.'); }, onError: error => toast.error(error.message) });

  if (loading) return <div className="vp-loading" role="status"><Loader2 className="animate-spin" /> Carregando acesso</div>;
  if (!user) return <Login />;
  if (!isAdmin) return <div className="vp-loading"><p>Seu usuario nao possui acesso a esta plataforma.</p><Button onClick={() => signOut()}>Sair</Button></div>;
  const data = query.data;
  const current = tabs.find(t => t[0] === tab);
  const matches = (text: string) => text.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
  const changeTab = (key: string) => { setSearch(''); navigate(`/plataforma/${key}`); };
  const move = async (deal: Deal, stage: string) => {
    if (!data || moving || deal.stage_id === stage) return;
    const key = `${deal.id}:${stage}`;
    if (moveAttempt.current?.key !== key) moveAttempt.current = { key, id: crypto.randomUUID() };
    setMoving(true);
    try {
      await bulkMoveSlimFunnelLeads(platformDb as unknown as Parameters<typeof bulkMoveSlimFunnelLeads>[0], data.workspace.id, { leadIds: [deal.id], toStageId: stage, requestId: moveAttempt.current.id });
      moveAttempt.current = null;
      await refresh();
    } catch (error) { toast.error((error as Error).message); }
    finally { setMoving(false); }
  };

  return <div className="vp-shell">
    <aside className="vp-sidebar">
      <Link className="vp-brand" to="/plataforma"><img src={vanessaPhoto} alt="Vanessa Simoni" /><span><strong>Vanessa Simoni</strong><small>Gestao imobiliaria</small></span></Link>
      <nav aria-label="Plataforma">{tabs.map(([key, label, Icon]) => <button key={key} onClick={() => changeTab(key)} aria-current={tab === key ? 'page' : undefined}><Icon size={18} />{label}</button>)}</nav>
      <div className="vp-sidebar-bottom"><Link to="/" target="_blank"><ExternalLink size={17} /> Site publico</Link><button onClick={async () => { await signOut(); cache.clear(); }}><LogOut size={17} /> Sair</button></div>
    </aside>
    <main className="vp-main">
      <header className="vp-top"><div><small>Vanessa Simoni <ChevronRight size={12} /> Plataforma</small><h1>{current?.[1] ?? 'Pagina nao encontrada'}</h1></div><div className="vp-actions"><button className="vp-icon" title="Atualizar" aria-label="Atualizar" disabled={query.isFetching} onClick={() => refresh()}><RefreshCw size={18} className={query.isFetching ? 'animate-spin' : ''} /></button><span className="vp-user">{user.email}</span></div></header>
      {query.isError ? <div className="vp-error" role="alert"><strong>Nao foi possivel carregar os dados.</strong><p>{query.error.message}</p><Button variant="outline" onClick={() => refresh()}>Tentar novamente</Button></div> : !data ? <div className="vp-loading" role="status"><Loader2 className="animate-spin" /> Carregando plataforma</div> : <>
        {['clientes', 'negociacoes', 'imoveis'].includes(tab) && <div className="vp-toolbar"><label className="vp-search"><Search size={17} /><Input aria-label="Buscar" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar" /></label>{tab !== 'imoveis' && <Button onClick={() => setEditor({ kind: tab === 'clientes' ? 'contact' : 'deal' })}><Plus size={16} />{tab === 'clientes' ? 'Cliente' : 'Negociacao'}</Button>}</div>}
        {tab === 'inicio' && <Overview data={data} onAgenda={() => changeTab('agenda')} onDeal={() => setEditor({ kind: 'deal' })} />}
        {tab === 'clientes' && <div className="vp-table-wrap"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Cidade</th><th>Negociacoes</th><th><span className="sr-only">Acoes</span></th></tr></thead><tbody>{data.contacts.filter(c => matches(`${c.name} ${c.phone ?? ''} ${c.email ?? ''}`)).map(c => <tr key={c.id}><td><strong>{c.name}</strong><small>{c.email || 'Sem e-mail'}</small></td><td>{c.phone || '-'}</td><td>{c.city || '-'}</td><td>{data.deals.filter(d => d.contact_id === c.id).length}</td><td><div className="vp-actions">{whatsappUrl(c.phone) && <a className="vp-icon" href={whatsappUrl(c.phone)!} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={17} /></a>}<button className="vp-icon" title="Editar cliente" onClick={() => setEditor({ kind: 'contact', row: c })}><Pencil size={16} /></button></div></td></tr>)}</tbody></table>{!data.contacts.length && <Empty>Nenhum cliente cadastrado.</Empty>}</div>}
        {tab === 'negociacoes' && <div className="vp-board">{data.stages.map(stage => { const deals = data.deals.filter(d => d.stage_id === stage.id && matches(`${d.name} ${data.contacts.find(c => c.id === d.contact_id)?.name ?? ''}`)); return <section key={stage.id} className={`vp-stage vp-${stage.outcome}`}><header><strong>{stage.name}</strong><span>{deals.length}</span></header><div className="vp-stage-total">{currency(deals.reduce((sum, d) => sum + Number(d.value), 0))}</div>{deals.map(deal => <article key={deal.id} className="vp-deal"><button className="vp-deal-title" onClick={() => setEditor({ kind: 'deal', row: deal })}>{deal.name}</button><p>{data.contacts.find(c => c.id === deal.contact_id)?.name}</p><strong>{currency(Number(deal.value))}</strong>{deal.property_id && <small><Building2 size={12} />{data.properties.find(p => p.id === deal.property_id)?.title}</small>}<footer><select aria-label={`Etapa de ${deal.name}`} value={deal.stage_id} disabled={moving} onChange={e => move(deal, e.target.value)}>{data.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button title="Historico da negociacao" className="vp-icon" onClick={() => setHistoryId(deal.id)}><History size={15} /></button></footer></article>)}{!deals.length && <p className="vp-column-empty">Nenhuma negociacao</p>}</section>; })}</div>}
        {tab === 'imoveis' && <Portfolio properties={data.properties.filter(p => matches(`${p.title} ${p.city}`))} refresh={refresh} />}
        {tab === 'propostas' && <Proposals data={data} />}
        {tab === 'agenda' && <><div className="vp-toolbar"><span>{data.tasks.filter(t => !t.done).length} tarefas em aberto</span><Button onClick={() => setEditor({ kind: 'task' })}><Plus size={16} />Tarefa</Button></div><div className="vp-table-wrap"><table><thead><tr><th>Situacao</th><th>Tarefa</th><th>Prazo</th><th>Cliente</th><th /></tr></thead><tbody>{[...data.tasks].sort((a, b) => Number(a.done) - Number(b.done)).map(t => <tr key={t.id}><td><input type="checkbox" aria-label={`Concluir ${t.title}`} checked={t.done} disabled={save.isPending} onChange={e => { const done = e.target.checked; save.mutate(async () => { const r = await platformDb.from('vanessa_tasks').update({ done }).eq('id', t.id).select('id').single(); if (r.error) throw new Error(r.error.message); }); }} /></td><td><strong className={t.done ? 'vp-done' : ''}>{t.title}</strong>{t.automation_id && <small>Automacao</small>}</td><td className={!t.done && new Date(t.due_at).getTime() < Date.now() ? 'vp-overdue' : ''}>{dateTime(t.due_at)}</td><td>{data.contacts.find(c => c.id === t.contact_id)?.name || '-'}</td><td><button className="vp-icon" title="Editar tarefa" onClick={() => setEditor({ kind: 'task', row: t })}><Pencil size={16} /></button></td></tr>)}</tbody></table>{!data.tasks.length && <Empty>Nenhuma tarefa agendada.</Empty>}</div></>}
        {tab === 'automacoes' && <><div className="vp-toolbar"><span>{data.automations.length} regras de tarefas</span><Button onClick={() => setEditor({ kind: 'automation' })}><Plus size={16} />Regra</Button></div><div className="vp-table-wrap"><table><thead><tr><th>Regra</th><th>Evento</th><th>Tarefa</th><th>Prazo</th><th>Ativa</th><th /></tr></thead><tbody>{data.automations.map(a => <tr key={a.id}><td><strong>{a.name}</strong><small>{data.stages.find(s => s.id === a.stage_id)?.name || 'Todas as etapas'}</small></td><td>{a.event_kind === 'lead.created' ? 'Nova negociacao' : 'Mudanca de etapa'}</td><td>{a.task_title}</td><td>{a.delay_hours} h</td><td><input type="checkbox" aria-label={`Ativar ${a.name}`} checked={a.enabled} disabled={save.isPending} onChange={e => { const enabled = e.target.checked; save.mutate(async () => { const r = await platformDb.from('vanessa_automations').update({ enabled }).eq('id', a.id).select('id').single(); if (r.error) throw new Error(r.error.message); }); }} /></td><td><button className="vp-icon" title="Editar regra" onClick={() => setEditor({ kind: 'automation', row: a })}><Pencil size={16} /></button></td></tr>)}</tbody></table>{!data.automations.length && <Empty>Nenhuma regra cadastrada.</Empty>}</div></>}
        {!current && <Empty>Pagina nao encontrada. <Link to="/plataforma">Voltar</Link></Empty>}
        <Dialog open={!!editor} onOpenChange={open => { if (!open && !save.isPending) setEditor(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editor?.kind === 'contact' ? 'Cliente' : editor?.kind === 'deal' ? 'Negociacao' : editor?.kind === 'task' ? 'Tarefa' : 'Regra de tarefa'}</DialogTitle></DialogHeader>{editor && <EditorForm key={`${editor.kind}:${editor.row?.id ?? 'new'}`} editor={editor} data={data} pending={save.isPending} submit={action => save.mutate(action)} />}</DialogContent></Dialog>
        <Dialog open={!!historyId} onOpenChange={open => { if (!open) setHistoryId(null); }}><DialogContent><DialogHeader><DialogTitle>Historico da negociacao</DialogTitle></DialogHeader>{history.isError ? <p role="alert">{history.error.message}</p> : history.isLoading ? <Loader2 className="animate-spin" /> : <ol className="vp-history">{history.data?.map(e => <li key={e.id}><strong>{e.kind === 'lead.created' ? 'Negociacao criada' : 'Etapa alterada'}</strong><span>{data.stages.find(s => s.id === e.payload.stageId)?.name}</span><small>{dateTime(e.created_at)}</small></li>)}</ol>}</DialogContent></Dialog>
      </>}
    </main>
  </div>;
}

function Overview({ data, onAgenda, onDeal }: { data: PlatformData; onAgenda: () => void; onDeal: () => void }) {
  const stats = summarize(data);
  return <><div className="vp-stats">{[['Clientes', data.contacts.length], ['Negociacoes abertas', stats.open], ['Valor em negociacao', currency(stats.openValue)], ['Contratos fechados', stats.won]].map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}</div><div className="vp-section-heading"><h2>Agenda de atendimento</h2><Button variant="outline" onClick={onAgenda}>Agenda <ArrowRight size={15} /></Button></div>{stats.overdue > 0 && <p className="vp-overdue">{stats.overdue} tarefa(s) com prazo vencido</p>}<div className="vp-agenda-preview">{data.tasks.filter(t => !t.done).slice(0, 5).map(t => <div key={t.id}><CalendarCheck size={18} /><span><strong>{t.title}</strong><small>{dateTime(t.due_at)}</small></span></div>)}{!data.tasks.some(t => !t.done) && <Empty>Nenhuma tarefa em aberto.</Empty>}</div><div className="vp-section-heading"><h2>Funil imobiliario</h2><Button onClick={onDeal}><Plus size={16} />Negociacao</Button></div><div className="vp-pipeline-summary">{data.stages.map(s => <div key={s.id}><span>{s.name}</span><strong>{data.deals.filter(d => d.stage_id === s.id).length}</strong></div>)}</div></>;
}

function EditorForm({ editor, data, pending, submit }: { editor: Editor; data: PlatformData; pending: boolean; submit: (action: () => Promise<void>) => void }) {
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const [newContact, setNewContact] = useState(editor.kind === 'deal' && !data.contacts.length);
  const r = editor.row;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) ?? '').trim();
    const fingerprint = JSON.stringify([...form.entries()]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    const id = request.current.id;
    submit(async () => {
      if (editor.kind === 'contact') {
        const payload = { name: get('name'), phone: get('phone').replace(/\D/g, '') || null, email: get('email') || null, city: get('city') || null, notes: get('notes') || null };
        const result = r ? await platformDb.from('vanessa_contacts').update(payload).eq('id', r.id).select('id').single() : await platformDb.from('vanessa_contacts').insert({ ...payload, id, workspace_id: data.workspace.id }).select('id').single();
        if (result.error) throw new Error(result.error.message);
      } else if (editor.kind === 'deal') {
        const value = Number(get('value') || 0);
        if (!Number.isFinite(value) || value < 0) throw new Error('Valor invalido.');
        if (newContact && !r) {
          await createSlimFunnelLead(platformDb as unknown as Parameters<typeof createSlimFunnelLead>[0], data.workspace.id, { crmSourceId: data.workspace.id, pipelineId: data.pipeline.id, stageId: get('stage'), name: get('name'), phone: get('phone'), email: get('email'), value, requestId: id });
        } else {
          const payload = { name: get('name'), contact_id: get('contact'), property_id: get('property') || null, value, notes: get('notes') || null };
          if (r) {
            const result = await platformDb.from('vanessa_deals').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', r.id).select('id').single();
            if (result.error) throw new Error(result.error.message);
          } else {
            const result = await platformDb.from('vanessa_deals').insert({ ...payload, id, workspace_id: data.workspace.id, pipeline_id: data.pipeline.id, stage_id: get('stage') }).select('id').single();
            if (result.error) throw new Error('Cadastro nao confirmado. Confira o funil antes de repetir. ' + result.error.message);
          }
        }
      } else if (editor.kind === 'task') {
        const due = new Date(get('due_at'));
        if (!Number.isFinite(due.getTime())) throw new Error('Prazo invalido.');
        const payload = { title: get('title'), contact_id: get('contact') || null, due_at: due.toISOString() };
        const result = r ? await platformDb.from('vanessa_tasks').update(payload).eq('id', r.id).select('id').single() : await platformDb.from('vanessa_tasks').insert({ ...payload, id, workspace_id: data.workspace.id }).select('id').single();
        if (result.error) throw new Error(result.error.message);
      } else {
        const delay = Number(get('delay_hours'));
        if (!Number.isInteger(delay) || delay < 0 || delay > 8760) throw new Error('Prazo invalido.');
        const payload = { name: get('name'), event_kind: get('event_kind') as Automation['event_kind'], stage_id: get('stage') || null, task_title: get('task_title'), delay_hours: delay };
        const result = r ? await platformDb.from('vanessa_automations').update(payload).eq('id', r.id).select('id').single() : await platformDb.from('vanessa_automations').insert({ ...payload, id, workspace_id: data.workspace.id }).select('id').single();
        if (result.error) throw new Error(result.error.message);
      }
    });
  };
  const contactOptions = <>{data.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</>;
  return <form className="vp-form" onSubmit={onSubmit}>
    {editor.kind === 'contact' && <><Field title="Nome"><Input name="name" required maxLength={200} defaultValue={editor.row?.name} /></Field><Field title="Telefone"><Input name="phone" maxLength={64} defaultValue={editor.row?.phone ?? ''} /></Field><Field title="E-mail"><Input name="email" type="email" maxLength={254} defaultValue={editor.row?.email ?? ''} /></Field><Field title="Cidade"><Input name="city" maxLength={120} defaultValue={editor.row?.city ?? ''} /></Field><Field title="Observacoes"><Textarea name="notes" maxLength={5000} defaultValue={editor.row?.notes ?? ''} /></Field></>}
    {editor.kind === 'deal' && <>{!r && <label className="vp-check"><input type="checkbox" checked={newContact} onChange={e => setNewContact(e.target.checked)} />Novo cliente</label>}{!newContact && <Field title="Cliente"><select name="contact" required defaultValue={editor.row?.contact_id ?? data.contacts[0]?.id}>{contactOptions}</select></Field>}<Field title={newContact ? 'Nome do cliente' : 'Nome da negociacao'}><Input name="name" required maxLength={200} defaultValue={editor.row?.name} /></Field>{newContact && <><Field title="Telefone"><Input name="phone" maxLength={64} /></Field><Field title="E-mail"><Input name="email" type="email" maxLength={254} /></Field></>}<Field title="Valor da negociacao (R$)"><Input name="value" type="number" min="0" step="0.01" defaultValue={editor.row?.value ?? 0} /></Field>{!r && <Field title="Etapa"><select name="stage" defaultValue={data.stages[0]?.id}>{data.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}{!newContact && <><Field title="Imovel"><select name="property" defaultValue={editor.row?.property_id ?? ''}><option value="">Sem imovel vinculado</option>{data.properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field><Field title="Observacoes"><Textarea name="notes" maxLength={5000} defaultValue={editor.row?.notes ?? ''} /></Field></>}</>}
    {editor.kind === 'task' && <><Field title="Tarefa"><Input name="title" required maxLength={200} defaultValue={editor.row?.title} /></Field><Field title="Prazo"><Input name="due_at" type="datetime-local" required defaultValue={editor.row ? new Date(new Date(editor.row.due_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} /></Field><Field title="Cliente"><select name="contact" defaultValue={editor.row?.contact_id ?? ''}><option value="">Sem cliente</option>{contactOptions}</select></Field></>}
    {editor.kind === 'automation' && <><Field title="Nome da regra"><Input name="name" required maxLength={200} defaultValue={editor.row?.name} /></Field><Field title="Evento"><select name="event_kind" defaultValue={editor.row?.event_kind ?? 'lead.created'}><option value="lead.created">Nova negociacao</option><option value="lead.stage_changed">Mudanca de etapa</option></select></Field><Field title="Etapa de destino"><select name="stage" defaultValue={editor.row?.stage_id ?? ''}><option value="">Todas as etapas</option>{data.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field title="Tarefa a criar"><Input name="task_title" required maxLength={200} defaultValue={editor.row?.task_title} /></Field><Field title="Prazo em horas apos o evento"><Input name="delay_hours" type="number" min="0" max="8760" required defaultValue={editor.row?.delay_hours ?? 0} /></Field></>}
    <Button type="submit" disabled={pending}>{pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}Salvar</Button>
  </form>;
}
