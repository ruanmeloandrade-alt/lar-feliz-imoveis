import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  Plus,
  Reply,
  Search,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getEmailInboxStatus,
  listEmailInboxMessages,
  sendEmailInboxMessage,
  startGmailInboxAuthorization,
  type EmailInboxFolder,
} from "@/lib/email-inbox.functions";
import { connectGmailSender } from "@/lib/email-sender.functions";
import { cn } from "@/lib/utils";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

export function EmailInboxPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getEmailInboxStatus);
  const listFn = useServerFn(listEmailInboxMessages);
  const sendFn = useServerFn(sendEmailInboxMessage);
  const connectGmailFn = useServerFn(connectGmailSender);
  const gmailAuthFn = useServerFn(startGmailInboxAuthorization);

  const [folder, setFolder] = useState<EmailInboxFolder>("inbox");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ to: string; subject: string; body: string } | null>(null);

  const statusQ = useQuery({ queryKey: ["email-inbox-status"], queryFn: () => statusFn({}) });
  const status = statusQ.data;
  const messagesQ = useQuery({
    queryKey: ["email-inbox", status?.mode, folder, deferredSearch],
    enabled: Boolean(status?.connected && status.inboxCapable && status.inboxReady),
    queryFn: () => listFn({ data: { folder, search: deferredSearch } }),
    refetchInterval: 60_000,
  });
  const messages = messagesQ.data?.messages ?? [];
  const selected = useMemo(() => messages.find((message) => message.id === selectedId) ?? null, [messages, selectedId]);

  const connectGmailMutation = useMutation({
    mutationFn: () => connectGmailFn({ data: {} }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["email-inbox-status"] }),
  });
  const sendMutation = useMutation({
    mutationFn: (input: { to: string; subject: string; body: string }) => sendFn({ data: input }),
    onSuccess: async () => {
      setComposer(null);
      setFolder("sent");
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: ["email-inbox"] });
    },
  });

  const authorizeGmailInbox = async () => {
    const result = await gmailAuthFn({ data: { redirectOrigin: window.location.origin } });
    window.location.href = result.authorizeUrl;
  };

  if (statusQ.isLoading) {
    return <div className="grid h-full min-h-[420px] place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!status?.connected) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-xl rounded-xl border bg-card p-5 sm:p-7">
          <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><h1 className="text-lg font-semibold">Chat E-mail</h1></div>
          <p className="mt-2 text-sm text-muted-foreground">Use a Conta Google já autorizada no workspace para receber, enviar e responder e-mails dentro da Vanessa Simoni.</p>
          <div className="mt-5 rounded-lg border p-4">
            <div className="font-medium">Gmail / Google Workspace</div>
            <div className="mt-1 text-xs text-muted-foreground">{status?.google.email ?? "Conta Google ainda não autorizada"}</div>
            {status?.google.connected ? (
              status.google.inboxReady ? (
                <Button className="mt-4 w-full" onClick={() => connectGmailMutation.mutate()} disabled={connectGmailMutation.isPending}>Usar Gmail</Button>
              ) : (
                <Button className="mt-4 w-full" onClick={authorizeGmailInbox}>Autorizar Inbox do Gmail</Button>
              )
            ) : (
              <Button asChild variant="outline" className="mt-4 w-full"><a href="/integracoes">Conectar Google</a></Button>
            )}
          </div>
          {connectGmailMutation.error && <p className="mt-3 text-sm text-destructive">{connectGmailMutation.error.message}</p>}
        </div>
      </div>
    );
  }

  if (!status.inboxCapable) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-lg rounded-xl border bg-card p-5 sm:p-7">
          <Mail className="h-5 w-5 text-primary" />
          <h1 className="mt-3 text-lg font-semibold">Envio de e-mail conectado</h1>
          <p className="mt-2 text-sm text-muted-foreground">{status.mode} está configurado como provedor de envio. Ele funciona para SalesBot, automações e campanhas, mas não representa uma caixa postal de entrada.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setComposer({ to: "", subject: "", body: "" })}><Plus className="mr-2 h-4 w-4" />Novo e-mail</Button>
            <Button asChild variant="outline"><a href="/integracoes">Usar Gmail para Inbox</a></Button>
          </div>
        </div>
        {composer && <Composer value={composer} sending={sendMutation.isPending} error={sendMutation.error} onClose={() => setComposer(null)} onSend={(value) => sendMutation.mutate(value)} />}
      </div>
    );
  }

  if (!status.inboxReady) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-lg rounded-xl border bg-card p-5 sm:p-7">
          <Mail className="h-5 w-5 text-primary" />
          <h1 className="mt-3 text-lg font-semibold">Permissão do Inbox necessária</h1>
          <p className="mt-2 text-sm text-muted-foreground">O Gmail está conectado, mas a autorização atual não permite ler a caixa postal. Reautorize uma vez para liberar o Chat E-mail.</p>
          <Button className="mt-5" onClick={authorizeGmailInbox}>Reautorizar Gmail</Button>
        </div>
      </div>
    );
  }

  const mobileThreadOpen = Boolean(selected);
  return (
    <div className="flex h-full min-h-[560px] overflow-hidden bg-background md:rounded-xl md:border">
      <aside className={cn("w-full shrink-0 flex-col border-r bg-card/40 md:flex md:w-[340px] xl:w-[380px]", mobileThreadOpen ? "hidden" : "flex")}>
        <div className="border-b p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><h1 className="font-semibold">Chat E-mail</h1></div><p className="mt-1 truncate text-[11px] text-muted-foreground">{status.fromEmail} · Gmail</p></div>
            <Button size="sm" onClick={() => setComposer({ to: "", subject: "", body: "" })}><Plus className="mr-1 h-3.5 w-3.5" />Novo</Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button type="button" onClick={() => { setFolder("inbox"); setSelectedId(null); }} className={cn("rounded-md px-2 py-1.5 text-xs", folder === "inbox" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}><InboxIcon className="mr-1 inline h-3.5 w-3.5" />Recebidos</button>
            <button type="button" onClick={() => { setFolder("sent"); setSelectedId(null); }} className={cn("rounded-md px-2 py-1.5 text-xs", folder === "sent" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}><Send className="mr-1 inline h-3.5 w-3.5" />Enviados</button>
          </div>
          <div className="relative mt-3"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar e-mails" className="h-9 pl-8 text-xs" /></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {messagesQ.isLoading ? <div className="grid h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : messagesQ.error ? <div className="p-4 text-sm text-destructive">Não foi possível carregar a caixa postal: {(messagesQ.error as Error).message}</div> : messages.length === 0 ? <div className="p-5 text-center text-sm text-muted-foreground">Nenhum e-mail encontrado.</div> : messages.map((message) => (
            <button key={message.id} type="button" onClick={() => setSelectedId(message.id)} className={cn("w-full border-b border-l-2 border-l-transparent px-3 py-3 text-left hover:bg-muted/50 sm:px-4", selectedId === message.id && "border-l-primary bg-primary/5")}>
              <div className="flex items-center gap-2">{message.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}<span className={cn("truncate text-sm", message.unread && "font-semibold")}>{folder === "sent" ? message.to || "Destinatário" : message.fromName}</span><span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatDate(message.date)}</span></div>
              <div className="mt-1 truncate text-xs font-medium">{message.subject}</div><div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{message.preview}</div>{message.hasAttachment && <span className="mt-1 inline-block text-[10px] text-muted-foreground">Possui anexo</span>}
            </button>
          ))}
        </div>
      </aside>
      <main className={cn("min-w-0 flex-1 flex-col", mobileThreadOpen ? "flex" : "hidden md:flex")}>
        {!selected ? <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">Selecione um e-mail para ler.</div> : <><header className="flex items-start gap-3 border-b px-3 py-3 sm:px-5 sm:py-4"><button type="button" onClick={() => setSelectedId(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border text-muted-foreground md:hidden" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></button><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold sm:text-base">{selected.subject}</h2><div className="mt-1 text-xs text-muted-foreground">{folder === "sent" ? `Para ${selected.to}` : `${selected.fromName} <${selected.fromEmail}>`}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(selected.date).toLocaleString("pt-BR")}</div></div><Button size="sm" variant="outline" onClick={() => setComposer({ to: folder === "sent" ? selected.to : selected.fromEmail, subject: selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`, body: "" })}><Reply className="mr-1 h-3.5 w-3.5" />Responder</Button></header><div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"><div className="mx-auto max-w-4xl whitespace-pre-wrap break-words text-sm leading-relaxed">{selected.body || selected.preview}</div></div></>}
      </main>
      {composer && <Composer value={composer} sending={sendMutation.isPending} error={sendMutation.error} onClose={() => setComposer(null)} onSend={(value) => sendMutation.mutate(value)} />}
    </div>
  );
}

function Composer({ value, sending, error, onClose, onSend }: { value: { to: string; subject: string; body: string }; sending: boolean; error: unknown; onClose: () => void; onSend: (value: { to: string; subject: string; body: string }) => void }) {
  const [to, setTo] = useState(value.to);
  const [subject, setSubject] = useState(value.subject);
  const [body, setBody] = useState(value.body);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim()) && subject.trim() && body.trim();
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"><div className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl border bg-card shadow-2xl sm:max-w-2xl sm:rounded-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div className="font-semibold">Novo e-mail</div><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button></div><div className="space-y-3 overflow-y-auto p-4"><div><label className="mb-1 block text-xs font-medium">Para</label><Input value={to} onChange={(event) => setTo(event.target.value)} type="email" placeholder="cliente@empresa.com" /></div><div><label className="mb-1 block text-xs font-medium">Assunto</label><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Assunto" maxLength={200} /></div><div><label className="mb-1 block text-xs font-medium">Mensagem</label><Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escreva sua mensagem" className="min-h-[220px] resize-y" /></div>{error && <p className="text-sm text-destructive">{(error as Error).message}</p>}</div><div className="flex justify-end gap-2 border-t p-3 sm:p-4"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!valid || sending} onClick={() => onSend({ to: to.trim(), subject: subject.trim(), body })}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar</Button></div></div></div>;
}
