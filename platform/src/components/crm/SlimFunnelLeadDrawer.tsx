import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ExternalLink, Loader2, MessageCircle, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { resolveSlimInboxContact } from '@/lib/slim-contact-route.functions';
import { getLeadDetail } from '@/lib/leads.functions';
import type { CrmLead } from '@/lib/crm-mock';
import { SlimEmbeddedChatThread } from '@/components/inbox/InboxPage.legacy';
import { ClientAutomationControls } from '@/components/inbox/InboxLeadRouteEnhancements';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  slimDrawerContextKey, slimDrawerConversation, slimDrawerEditLead, slimDrawerLeaveDecision,
  slimDrawerMatchesDetail, slimDrawerValidLeadId, slimDrawerWhatsappUrl, slimDrawerIsDirectLead,
  type SlimDrawerContext, type SlimDrawerInteraction, type SlimDrawerLead,
} from '@/lib/slim-funnel-drawer.core';
import './slim-funnel-drawer.css';
import { LeadWhatsappOrigin } from '@/components/inbox/LeadWhatsappOrigin';

export type SlimFunnelLeadDrawerHandle = { open: (lead: CrmLead) => boolean };
const emptyInteraction = (): SlimDrawerInteraction => ({ dirty: false, pending: false });
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'Não informado';

export const SlimFunnelLeadDrawer = forwardRef<SlimFunnelLeadDrawerHandle, { onEdit: (lead: CrmLead) => void }>(function SlimFunnelLeadDrawer({ onEdit }, ref) {
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [tab, setTab] = useState<'details' | 'conversation'>('conversation');
  const [interaction, setInteraction] = useState(emptyInteraction);
  const [observedActor, setObservedActor] = useState<string | null>(null);
  const observedActorRef = useRef<string | null>(null);
  const stateRef = useRef(interaction);
  const threadInteraction = useRef(emptyInteraction());
  const automationPending = useRef(false);
  const selectedRef = useRef(selected);
  const boundContext = useRef<SlimDrawerContext | null>(null);
  const activeThreadKey = useRef<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const resolve = useServerFn(resolveSlimInboxContact);
  const loadDetail = useServerFn(getLeadDetail);
  selectedRef.current = selected;
  const onInteraction = useCallback((next: SlimDrawerInteraction) => {
    stateRef.current = next;
    setInteraction(previous => previous.dirty === next.dirty && previous.pending === next.pending ? previous : next);
  }, []);
  const clear = useCallback(() => {
    const previous = selectedRef.current;
    const scope = boundContext.current;
    selectedRef.current = null;
    boundContext.current = null;
    activeThreadKey.current = null;
    observedActorRef.current = null;
    setObservedActor(null);
    threadInteraction.current = emptyInteraction();
    automationPending.current = false;
    stateRef.current = emptyInteraction();
    setInteraction(emptyInteraction());
    setSelected(null);
    if (previous) queryClient.removeQueries({ queryKey: ['slim-funnel-contact', previous.id] });
    if (scope) queryClient.removeQueries({ queryKey: ['slim-funnel-detail', scope.workspaceId, scope.actorId, scope.leadId] });
  }, [queryClient]);
  const canLeave = useCallback(() => {
    const decision = slimDrawerLeaveDecision(stateRef.current);
    if (decision === 'blocked') { toast.info('Aguarde o envio, a transcrição ou a operação da automação terminar antes de sair da conversa.'); return false; }
    return decision !== 'confirm' || window.confirm('Descartar o texto, anexo ou áudio preparado e sair desta conversa?');
  }, []);
  const close = useCallback(() => { if (canLeave()) clear(); }, [canLeave, clear]);
  const contextChanged = useCallback(() => {
    if (!selectedRef.current) return;
    clear();
    toast.info('A empresa ou a sessão mudou. Abra novamente a ficha no contexto atual.');
  }, [clear]);
  useImperativeHandle(ref, () => ({ open(lead) {
    if (!slimDrawerValidLeadId(lead.id)) { toast.error('Contato inválido para abrir a ficha.'); return false; }
    if (selectedRef.current?.id === lead.id) return true;
    if (selectedRef.current && !canLeave()) return false;
    clear();
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    selectedRef.current = lead;
    setSelected(lead);
    setTab('conversation');
    return true;
  } }), [canLeave, clear]);
  useBlocker({
    disabled: !selected,
    enableBeforeUnload: () => !!selectedRef.current && (stateRef.current.dirty || stateRef.current.pending),
    shouldBlockFn: () => {
      if (!selectedRef.current) return false;
      if (!canLeave()) return true;
      clear();
      return false;
    },
  });
  const contactQ = useQuery({
    queryKey: ['slim-funnel-contact', selected?.id],
    queryFn: () => resolve({ data: { leadId: selected!.id } }),
    enabled: !!selected, staleTime: 0, gcTime: 0, retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: selected ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const context = contactQ.data as SlimDrawerContext | undefined;
  const contextKey = slimDrawerContextKey(context);
  const detailQ = useQuery({
    queryKey: ['slim-funnel-detail', context?.workspaceId, context?.actorId, context?.leadId],
    queryFn: () => loadDetail({ data: { leadId: context!.leadId, includeActivities: false } }),
    enabled: !!selected && !!contextKey && !contactQ.error,
    staleTime: 0, gcTime: 0, retry: 1, refetchOnWindowFocus: true,
  });
  const scopedDetail = !!context && slimDrawerMatchesDetail(context, detailQ.data);
  const lead = scopedDetail ? detailQ.data!.lead as SlimDrawerLead : null;
  const isGroup = !!lead && !slimDrawerIsDirectLead(lead);
  const boundKey = slimDrawerContextKey(boundContext.current);
  const contextMismatch = !!boundKey && !!contextKey && boundKey !== contextKey;
  const actorMatches = !!observedActor && context?.actorId === observedActor;
  const canMount = !!selected && !!context && !!contextKey && !!lead && !isGroup && actorMatches && !contextMismatch && (!!boundKey || (!contactQ.error && !detailQ.error));
  activeThreadKey.current = canMount ? contextKey : null;
  const onThreadInteraction = useCallback((next: SlimDrawerInteraction) => {
    if (contextKey && activeThreadKey.current === contextKey) {
      threadInteraction.current = next;
      onInteraction({ dirty: next.dirty, pending: next.pending || automationPending.current });
    }
  }, [contextKey, onInteraction]);
  const onAutomationPending = useCallback((pending: boolean) => {
    if (contextKey && activeThreadKey.current === contextKey) {
      automationPending.current = pending;
      onInteraction({ dirty: threadInteraction.current.dirty, pending: threadInteraction.current.pending || pending });
    }
  }, [contextKey, onInteraction]);
  useEffect(() => {
    if (!selected || !contextKey || !context) return;
    if (contextMismatch || (observedActor && !actorMatches) || (detailQ.data && !scopedDetail)) { contextChanged(); return; }
    if (canMount) boundContext.current = context;
  }, [selected, contextKey, context, contextMismatch, observedActor, actorMatches, detailQ.data, scopedDetail, canMount, contextChanged]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const observe = (actor: string | null | undefined) => {
      if (cancelled || selectedRef.current !== selected) return;
      const previous = observedActorRef.current;
      if (!actor || (previous && previous !== actor) || (boundContext.current && boundContext.current.actorId !== actor)) { contextChanged(); return; }
      observedActorRef.current = actor;
      setObservedActor(actor);
    };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') observe(null);
      else observe(session?.user?.id);
    });
    void supabase.auth.getSession().then(({ data: auth, error }) => {
      if (!error) observe(auth.session?.user?.id);
      else if (!cancelled && selectedRef.current === selected) contextChanged();
    }).catch(() => { if (!cancelled && selectedRef.current === selected) contextChanged(); });
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, [selected, contextChanged]);
  useEffect(() => {
    if (!canMount || !context) return;
    const channel = supabase.channel(`slim-funnel-profile:${context.actorId}:${context.leadId}`).on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${context.actorId}`,
    }, payload => {
      const current = (payload.new as { current_workspace_id?: string | null }).current_workspace_id;
      if (current !== undefined && current !== context.workspaceId) contextChanged();
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [canMount, context?.workspaceId, context?.actorId, context?.leadId, contextChanged]);
  const conversation = useMemo(() => lead ? slimDrawerConversation(lead) : null, [lead]);
  const whatsappUrl = slimDrawerWhatsappUrl(lead?.phone, lead?.source);
  function edit() {
    if (!selected || !lead || !canLeave()) return;
    const target = slimDrawerEditLead(selected, lead);
    clear();
    onEdit(target);
  }
  function openInbox() {
    if (!context || !canMount) return;
    void navigate({ to: '/inbox/leads/$leadId', params: { leadId: context.leadId } });
  }
  const failed = isGroup || !!contactQ.error || !!detailQ.error || (!!contactQ.data && !contextKey);
  return <Sheet open={!!selected} onOpenChange={open => { if (!open) close(); }}>
    <SheetContent className="slim-funnel-drawer" aria-describedby="slim-funnel-drawer-description" onEscapeKeyDown={event => {
      // Radix handles Escape in native capture, before the selector's React key handler.
      const dismiss = (event.target as Element | null)?.closest?.('.slim-funnel-drawer')
        ?.querySelector<HTMLButtonElement>('[data-inbox-lead-actions="inline"] [role="dialog"] button[aria-label="Fechar"]');
      if (dismiss) { event.preventDefault(); dismiss.click(); }
    }} onCloseAutoFocus={event => {
      event.preventDefault();
      if (opener.current?.isConnected) opener.current.focus();
    }}>
      <header className="slim-funnel-drawer-header">
        <SheetTitle className="text-lg">{lead?.name ?? selected?.name ?? 'Ficha do contato'}</SheetTitle>
        <SheetDescription id="slim-funnel-drawer-description" className="mt-1">Ficha do cliente e conversa no Funil.</SheetDescription>
        {canMount && context && <LeadWhatsappOrigin leadId={context.leadId} workspaceId={context.workspaceId} actorId={context.actorId} />}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={edit} disabled={!canMount || interaction.pending}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar dados</Button>
          <Button type="button" size="sm" variant="outline" onClick={openInbox} disabled={!canMount || interaction.pending}><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Abrir Inbox</Button>
          {canMount && whatsappUrl && <Button size="sm" variant="outline" asChild><a href={whatsappUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />WhatsApp Web</a></Button>}
          <Button type="button" size="sm" variant="ghost" aria-label="Atualizar ficha" disabled={!canMount || detailQ.isFetching || interaction.pending} onClick={() => void detailQ.refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        {canMount && context && <div className="slim-funnel-drawer-automations">
          <ClientAutomationControls key={contextKey} inline leadId={context.leadId} workspaceId={context.workspaceId} actorId={context.actorId}
            disabled={interaction.pending} onPendingChange={onAutomationPending} />
        </div>}
        {interaction.pending && <p role="status" className="mt-2 text-xs text-muted-foreground">Envio, transcrição ou automação em andamento. Aguarde para fechar ou mudar de conversa.</p>}
        {canMount && (contactQ.error || detailQ.error) && <p role="status" className="mt-2 text-xs text-amber-700">Não foi possível atualizar a ficha. Os dados da última leitura e o rascunho foram mantidos.</p>}
      </header>
      {canMount && lead && conversation && context ? <>
        <div className="slim-funnel-drawer-tabs" role="tablist" aria-label="Conteúdo da ficha">
          <Button type="button" role="tab" aria-selected={tab === 'conversation'} size="sm" variant={tab === 'conversation' ? 'secondary' : 'ghost'} onClick={() => setTab('conversation')}>Conversa</Button>
          <Button type="button" role="tab" aria-selected={tab === 'details'} size="sm" variant={tab === 'details' ? 'secondary' : 'ghost'} onClick={() => setTab('details')}>Dados do cliente</Button>
        </div>
        <div className="slim-funnel-drawer-body" data-tab={tab}>
          <SlimFunnelLeadDetails lead={lead} />
          <section data-chat-surface className="slim-funnel-drawer-chat" aria-label="Conversa do cliente">
            <SlimEmbeddedChatThread key={contextKey} embedded conversation={conversation} channel="leads" workspaceId={context.workspaceId}
              cacheScope={{ workspaceId: context.workspaceId, userId: context.actorId }} onInteractionStateChange={onThreadInteraction} />
          </section>
        </div>
      </> : <div role={failed ? 'alert' : 'status'} className="p-6 text-sm text-muted-foreground">
        {isGroup ? <p>Este registro é um grupo. Abra a conversa de grupo pelo Inbox.</p> : failed ? <><p>Não foi possível conferir esta ficha. Atualize para tentar novamente.</p><Button className="mt-3" variant="outline" size="sm" onClick={() => { void contactQ.refetch(); if (contextKey) void detailQ.refetch(); }}>Tentar novamente</Button></>
          : <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando os dados atuais do contato...</>}
      </div>}
    </SheetContent>
  </Sheet>;
});

export function SlimFunnelLeadDetails({ lead }: { lead: SlimDrawerLead }) {
  const statuses: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', archived: 'Arquivado', converted: 'Convertido', won: 'Ganho', lost: 'Perdido' };
  const fields = [
    ['Telefone', lead.phone], ['E-mail', lead.email], ['Responsável', lead.responsibleName],
    ['Situação', statuses[lead.status ?? ''] ?? lead.status], ['Funil', lead.pipelineName], ['Etapa', lead.stageName],
    ['Valor', currency.format(Number(lead.value ?? 0))], ['Origem', lead.sourceDisplayName || lead.sourceProvider],
    ['Endereço', lead.address], ['Observações', lead.notes], ['Criado em', date(lead.createdAt)], ['Atualizado em', date(lead.updatedAt)],
  ];
  return <section className="slim-funnel-drawer-info" aria-label="Dados do cliente">
    <h2 className="mb-4 text-sm font-semibold">Dados do cliente</h2>
    <dl className="grid gap-4">{fields.map(([label, value]) => <div key={label} className="slim-funnel-drawer-field"><dt>{label}</dt><dd>{value || 'Não informado'}</dd></div>)}</dl>
    <h3 className="mb-2 mt-6 text-sm font-semibold">Etiquetas</h3>
    {lead.tags.length ? <div className="flex flex-wrap gap-1.5">{lead.tags.map(tag => <span key={tag} className="rounded-full bg-muted px-2 py-1 text-xs">{tag}</span>)}</div> : <p className="text-xs text-muted-foreground">Sem etiquetas.</p>}
    <h3 className="mb-3 mt-6 text-sm font-semibold">Campos personalizados</h3>
    {lead.customFields.length ? <dl className="grid gap-4">{lead.customFields.map(field => <div key={field.id} className="slim-funnel-drawer-field"><dt>{field.name}</dt><dd>{field.displayValue || 'Não informado'}</dd></div>)}</dl> : <p className="text-xs text-muted-foreground">Sem campos personalizados.</p>}
  </section>;
}
