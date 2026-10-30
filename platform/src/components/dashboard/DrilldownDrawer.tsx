import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Search, MessageSquare, Send, CheckCheck, GitBranch, DollarSign, Tag, Clock3 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { DrilldownLead } from "@/lib/mock-dashboard";
import { getLeadDetail, listLeadActivities, sendLeadMessage, type LeadDetailResponse } from "@/lib/leads.functions";
import { chatDayLabel, chatTime } from "@/lib/inbox-mock";
import { cn } from "@/lib/utils";

interface Props {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 title: string;
 subtitle: string;
 leads: DrilldownLead[];
}

const TONE_STYLES: Record<string, string> = {
 info: "bg-info/10 text-info border-info/20",
 warn: "bg-warning/10 text-warning border-warning/20",
 danger: "bg-danger/10 text-danger border-danger/20",
 success: "bg-success/10 text-success border-success/20",
 neutral: "bg-muted text-muted-foreground border-border",
};

export function DrilldownDrawer({ open, onOpenChange, title, subtitle, leads }: Props) {
 const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.lead_id?? null);
 const selected = leads.find((l) => l.lead_id === selectedId)?? leads[0];
 const queryClient = useQueryClient();
 const loadDetail = useServerFn(getLeadDetail);
 const loadActivities = useServerFn(listLeadActivities);
 
 const sendMessage = useServerFn(sendLeadMessage);

 useEffect(() => {
 if (!open) return;
 if (!selectedId ||!leads.some((lead) => lead.lead_id === selectedId)) {
 setSelectedId(leads[0]?.lead_id?? null);
 }
 }, [open, leads, selectedId]);

 const detailQ = useQuery({
 queryKey: ["dashboard", "lead-detail", selected?.lead_id],
 queryFn: () => loadDetail({ data: { leadId: selected!.lead_id } }),
 enabled: open && Boolean(selected?.lead_id),
 staleTime: 20_000,
 });
 const detail = detailQ.data as LeadDetailResponse | undefined;

 const activitiesQ = useQuery({
 queryKey: ["dashboard", "lead-activities", selected?.lead_id],
 queryFn: () => loadActivities({ data: { leadId: selected!.lead_id } }),
 enabled: open && Boolean(selected?.lead_id),
 staleTime: 10_000,
 });


 const sendMut = useMutation({
 mutationFn: (text: string) => sendMessage({ data: { leadId: selected!.lead_id, text } }),
 onSuccess: () => {
 if (!selected?.lead_id) return;
 queryClient.invalidateQueries({ queryKey: ["dashboard", "lead-activities", selected.lead_id] });
 queryClient.invalidateQueries({ queryKey: ["inbox", "activities", selected.lead_id] });
 queryClient.invalidateQueries({ queryKey: ["inbox", "lead-conversations"] });
 },
 });

 const selectedName = detail?.lead.name?? selected?.name?? "Lead";
 const selectedPhone = detail?.lead.phone?? selected?.phone?? "Não informado";
 const selectedEmail = detail?.lead.email?? selected?.email?? null;
 const selectedTags = detail?.lead.tags?.length? detail.lead.tags: selected?.crm_tags?? [];
 const selectedCustomFields = detail?.lead.customFields?.length
? detail.lead.customFields.map((field) => ({ key: field.name, value: field.displayValue || " - " }))
: selected?.custom_fields?? [];

 return (
 <Sheet open={open} onOpenChange={onOpenChange}>
 <SheetContent
 side="right"
 className="!max-w-none w-[min(1100px,95vw)] p-0 flex flex-col sm:flex-row gap-0 overflow-hidden"
 >
 {/* Lista de leads */}
 <div className="w-full sm:w-[340px] shrink-0 border-r border-border flex flex-col bg-card">
 <div className="px-4 py-3 border-b border-border">
 <div className="flex items-center justify-between mb-2">
 <div>
 <div className="text-[10px] font-bold tracking-widest uppercase text-primary">
 {title}
 </div>
 <div className="text-base font-bold text-foreground">{subtitle}</div>
 </div>
 <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
 {leads.length} leads
 </span>
 </div>
 <div className="text-[10px] text-muted-foreground tracking-wide uppercase">
 PROSPECÇÃO · {leads.length} leads
 </div>
 </div>

 <div className="px-3 py-2 border-b border-border space-y-2">
 <div className="relative">
 <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
 <Input
 placeholder="Buscar lead, telefone, etapa ou tag..."
 className="h-8 pl-8 text-sm"
 />
 </div>
 <select className="w-full h-8 px-2 text-xs rounded-md border border-border bg-card text-foreground">
 <option>Todos</option>
 </select>
 </div>

 <div className="flex-1 overflow-y-auto divide-y divide-border scrollbar-hidden">
 {leads.map((lead) => (
 <button
 key={lead.lead_id}
 onClick={() => setSelectedId(lead.lead_id)}
 className={cn(
 "w-full text-left p-3 hover:bg-muted/50 transition-colors",
 selectedId === lead.lead_id && "bg-primary/5 border-l-2 border-l-primary"
 )}
 >
 <div className="flex items-start gap-3">
 <Avatar name={lead.name} />
 <div className="flex-1 min-w-0">
 <div className="flex items-baseline justify-between gap-2">
 <div className="font-semibold text-sm text-foreground truncate">
 {lead.name}
 </div>
 <div className="text-[11px] tabular-nums text-muted-foreground shrink-0">
 R$ {lead.value_brl}
 </div>
 </div>
 <div className="text-[11px] text-muted-foreground truncate">
 {lead.stage_name} / {lead.responsible}
 </div>
 <div className="flex flex-wrap gap-1 mt-1.5">
 {lead.status_tags.slice(0, 2).map((t, i) => (
 <span
 key={i}
 className={cn(
 "text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border",
 TONE_STYLES[t.tone]
 )}
 >
 {t.label}
 </span>
 ))}
 </div>
 </div>
 </div>
 </button>
 ))}
 </div>
 </div>

 {/* Detalhe do lead */}
 {selected && (
 <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
 <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3">
 <div className="min-w-0">
 <div className="flex items-center gap-3">
 <Avatar name={selectedName} large />
 <div className="min-w-0">
 <div className="text-xl font-bold text-foreground truncate">
 {selectedName}
 </div>
 <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
 <span className="font-mono">{selectedPhone}</span>
 <span>·</span>
 <span>{selectedEmail?? "E-mail não informado"}</span>
 </div>
 <div className="flex flex-wrap gap-1.5 mt-2">
 {selected.status_tags.map((t, i) => (
 <span
 key={i}
 className={cn(
 "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border",
 TONE_STYLES[t.tone]
 )}
 >
 {t.label}
 </span>
 ))}
 </div>
 </div>
 </div>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <Button asChild variant="outline" size="sm" className="h-8">
 <Link to="/inbox/leads/$leadId" params={{ leadId: selected.lead_id }}>
 <MessageSquare className="w-3.5 h-3.5" />
 Abrir Inbox
 </Link>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => onOpenChange(false)}
 >
 <X className="w-4 h-4" />
 </Button>
 </div>
 </div>

 <div className="px-6 pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-border pb-4">
 <Metric label="Valor" value={`R$ ${selected.value_brl}`} />
 <Metric label="Funil" value={selected.funnel_name} />
 <Metric label="Responsável" value={selected.responsible} />
 <Metric label="Origem" value={selected.origin} />
 </div>

 <div className="flex-1 overflow-y-auto scrollbar-hidden px-6 py-4">
 <Tabs defaultValue="perfil">
 <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none h-auto p-0 gap-6">
 {["perfil", "funil", "financeiro", "whatsapp"].map((t) => (
 <TabsTrigger
 key={t}
 value={t}
 className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-0 pb-2.5 capitalize"
 >
 {t === "perfil" && "Perfil & Dados"}
 {t === "funil" && "Funil"}
 {t === "financeiro" && "Financeiro"}
 {t === "whatsapp" && "WhatsApp"}
 </TabsTrigger>
 ))}
 </TabsList>

 <TabsContent value="perfil" className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
 <Panel title="Dados do contato">
 <Row label="ID" value={selected.lead_id} mono />
 <Row label="Telefone" value={selectedPhone} mono />
 <Row label="E-mail" value={selectedEmail?? "Não informado"} />
 <Row label="Campanha" value="CRM Vanessa Simoni" />
 <Row label="Criado em" value={fmtDate(selected.created_at)} />
 <Row label="Última atualização" value={fmtDateTime(selected.updated_at)} />
 </Panel>
 <Panel title="Tags e campos">
 {selectedTags.length > 0 && (
 <div className="flex flex-wrap gap-1.5 pb-2">
 {selectedTags.map((tag) => (
 <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
 <Tag className="h-3 w-3" /> {tag}
 </span>
 ))}
 </div>
 )}
 {selectedTags.length === 0? (
 <EmptyHint>Sem tags reais retornadas.</EmptyHint>
 ): null}
 {selectedCustomFields.map((field) => (
 <Row key={field.key} label={field.key} value={field.value} />
 ))}
 {selectedCustomFields.length === 0? (
 <EmptyHint>Sem campos personalizados reais retornados.</EmptyHint>
 ): null}
 </Panel>
 </TabsContent>

 <TabsContent value="funil" className="mt-4">
 <FunnelPanel selected={selected} activities={activitiesQ.data?.activities?? []} />
 </TabsContent>
 <TabsContent value="financeiro" className="mt-4">
 <FinancialPanel selected={selected} />
 </TabsContent>
 <TabsContent value="whatsapp" className="mt-4">
 <MiniInbox
 leadName={selectedName}
 loading={activitiesQ.isLoading}
 activities={activitiesQ.data?.activities?? []}
 sending={sendMut.isPending}
 sendError={sendMut.error}
 onSend={(text) => sendMut.mutate(text)}
 />
 </TabsContent>
 </Tabs>
 </div>
 </div>
 )}
 </SheetContent>
 </Sheet>
 );
}

type Activity = {
 id: string;
 type: string;
 text: string | null;
 from?: "us" | "lead";
 occurredAt: string;
 error?: string | null;
};

function FunnelPanel({ selected, activities }: { selected: DrilldownLead; activities: Activity[] }) {
 const stageEvents = activities.filter((activity) => /stage|pipeline|funil|etapa/i.test(`${activity.type} ${activity.text?? ""}`));
 const timeline = stageEvents.length > 0
? stageEvents
: [{ id: "current", type: "stage_current", text: selected.stage_name, occurredAt: selected.updated_at }];
 return (
 <Panel title="Passagem pelo funil">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pb-3">
 <Metric label="Funil" value={selected.funnel_name} />
 <Metric label="Etapa atual" value={selected.stage_name} />
 <Metric label="Status" value={selected.status_key === "won"? "Ganho": selected.status_key === "lost"? "Perdido": "Aberto"} />
 </div>
 <div className="space-y-3">
 {timeline.map((item, index) => (
 <div key={item.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
 <div className="flex flex-col items-center">
 <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center">
 <GitBranch className="h-3.5 w-3.5" />
 </span>
 {index < timeline.length - 1 && <span className="w-px flex-1 bg-border" />}
 </div>
 <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
 <div className="text-sm font-semibold text-foreground">{item.text || selected.stage_name}</div>
 <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
 <Clock3 className="h-3 w-3" /> {fmtDateTime(item.occurredAt)}
 </div>
 </div>
 </div>
 ))}
 </div>
 </Panel>
 );
}

function FinancialPanel({ selected }: { selected: DrilldownLead }) {
 const won = selected.status_key === "won";
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Panel title="Ficha financeira">
 <Row label="Valor informado" value={formatMoney(selected.value_brl)} />
 <Row label="Valor ganho registrado" value={won? formatMoney(selected.value_brl): "Sem fechamento registrado"} />
 <Row label="Potencial em aberto" value={!won && selected.value_brl > 0? formatMoney(selected.value_brl): " - "} />
 <Row label="Origem do valor" value="CRM conectado" />
 </Panel>
 <Panel title="Resumo comercial">
 <div className="flex items-start gap-3 rounded-md border border-border bg-muted/20 p-3">
 <span className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
 <DollarSign className="h-4 w-4" />
 </span>
 <div className="min-w-0">
 <div className="text-sm font-semibold text-foreground">{selected.stage_name}</div>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
 Os valores exibidos usam apenas dados sincronizados do CRM. Histórico de compras e projeções aparecem aqui quando existirem registros financeiros vinculados ao lead.
 </p>
 </div>
 </div>
 </Panel>
 </div>
 );
}

function MiniInbox({
 leadName,
 loading,
 activities,
 sending,
 sendError,
 onSend,
}: {
 leadName: string;
 loading: boolean;
 activities: Activity[];
 sending: boolean;
 sendError: unknown;
 onSend: (text: string) => void;
}) {
 const [draft, setDraft] = useState("");
 const messages = useMemo(
 () => activities.filter((activity) => activity.type === "message_in" || activity.type === "message_out"),
 [activities],
 );
 const grouped: { day: string; items: Activity[] }[] = [];
 for (const message of messages) {
 const day = chatDayLabel(message.occurredAt);
 const last = grouped[grouped.length - 1];
 if (!last || last.day!== day) grouped.push({ day, items: [message] });
 else last.items.push(message);
 }
 function submit() {
 const text = draft.trim();
 if (!text || sending) return;
 onSend(text);
 setDraft("");
 }
 return (
 <div data-chat-surface className="h-[460px] min-h-[360px] overflow-hidden rounded-lg border border-border bg-background flex flex-col">
 <div className="h-12 shrink-0 border-b border-border bg-card px-4 flex items-center justify-between gap-3">
 <div className="min-w-0">
 <div className="text-sm font-semibold text-foreground truncate">{leadName}</div>
 <div className="text-[11px] text-muted-foreground">Atendimento pelo Vanessa Simoni</div>
 </div>
 </div>

 <div data-chat-thread-bg className="flex-1 overflow-y-auto scrollbar-hidden p-4 space-y-3">
 {loading && <EmptyHint>Carregando conversas...</EmptyHint>}
 {!loading && messages.length === 0 && (
 <div className="h-full flex items-center justify-center text-center text-xs text-muted-foreground">
 Nenhuma conversa sincronizada para este lead ainda.
 </div>
 )}
 {grouped.map((group) => (
 <div key={group.day} className="space-y-2">
 <div className="flex justify-center">
 <span className="rounded-full bg-card px-2.5 py-1 text-[10px] text-muted-foreground border border-border/60">{group.day}</span>
 </div>
 {group.items.map((message) => (
 <MiniMessage key={message.id} activity={message} />
 ))}
 </div>
 ))}
 </div>

 {Boolean(sendError) && (
 <div className="border-t border-border bg-danger/10 px-4 py-2 text-[11px] text-foreground">
 Falha ao enviar: {sendError instanceof Error? sendError.message: "erro desconhecido"}
 </div>
 )}

 <div className="shrink-0 border-t border-border bg-card p-3 flex items-center gap-2">
 <Input
 value={draft}
 onChange={(event) => setDraft(event.target.value)}
 onKeyDown={(event) => {
 if (event.key === "Enter" &&!event.shiftKey) {
 event.preventDefault();
 submit();
 }
 }}
 placeholder={sending? "Enviando...": "Digite uma mensagem"}
 disabled={sending}
 className="h-10 rounded-full"
 />
 <Button size="icon" className="h-10 w-10 rounded-full" onClick={submit} disabled={!draft.trim() || sending}>
 <Send className="h-4 w-4" />
 </Button>
 </div>
 </div>
 );
}

function MiniMessage({ activity }: { activity: Activity }) {
 const mine = activity.from === "us" || activity.type === "message_out";
 return (
 <div className={cn("flex", mine? "justify-end": "justify-start")}>
 <div
 className={cn("max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm", mine? "rounded-br-sm": "rounded-bl-sm")}
 style={{
 backgroundColor: mine? "var(--chat-bubble-out)": "var(--chat-bubble-in)",
 color: "var(--chat-text)",
 }}
 >
 <div className="whitespace-pre-wrap break-words leading-snug">{activity.text || "Mensagem sem texto"}</div>
 <div className="mt-1 flex items-center justify-end gap-1 text-[10px]" style={{ color: "var(--chat-meta)" }}>
 {chatTime(activity.occurredAt)} {mine && <CheckCheck className="h-3 w-3" />}
 </div>
 </div>
 </div>
 );
}

function Avatar({ name, large }: { name: string; large?: boolean }) {
 const initial = name.trim().charAt(0).toUpperCase();
 return (
 <div
 className={cn(
 "rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0",
 large? "w-12 h-12 text-base": "w-8 h-8 text-xs"
 )}
 >
 {initial}
 </div>
 );
}

function Metric({ label, value }: { label: string; value: string }) {
 return (
 <div className="bg-muted/40 rounded-lg px-3 py-2 border border-border">
 <div className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
 {label}
 </div>
 <div className="text-sm font-semibold text-foreground mt-0.5 truncate">{value}</div>
 </div>
 );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
 return (
 <div className="border border-border rounded-lg p-4">
 <div className="text-sm font-semibold text-foreground mb-3">{title}</div>
 <div className="space-y-2">{children}</div>
 </div>
 );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
 return (
 <div className="flex items-baseline justify-between text-xs gap-3 border-b border-border/50 pb-1.5 last:border-b-0">
 <span className="text-muted-foreground">{label}</span>
 <span className={cn("text-foreground font-medium text-right", mono && "font-mono tabular-nums")}>
 {value}
 </span>
 </div>
 );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
 return (
 <div className="text-xs text-muted-foreground italic py-1">{children}</div>
 );
}

function formatMoney(value: number) {
 return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function fmtDate(iso: string) {
 return new Date(iso).toLocaleDateString("pt-BR");
}
function fmtDateTime(iso: string) {
 const d = new Date(iso);
 return `${d.toLocaleDateString("pt-BR")}, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}
