import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, CheckCircle2, AlertCircle, Mail, Send, Zap, Rocket,
  ExternalLink, Info, RefreshCw,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getEmailSenderStatus, connectGmailSender, connectEmailProvider,
  sendTestEmail, disconnectEmailSender,
} from "@/lib/email-sender.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenGoogle?: () => void;
}

type Mode = "gmail" | "brevo" | "resend" | "sendgrid" | "mailgun";

const MODE_LABEL: Record<Mode, string> = {
  gmail: "Gmail / Google Workspace",
  brevo: "Brevo",
  resend: "Resend",
  sendgrid: "SendGrid",
  mailgun: "Mailgun",
};

const PROVIDER_GUIDE: Record<Exclude<Mode, "gmail">, {
  site: string;
  keyPath: string;
  steps: string[];
  freeTier: string;
  placeholder: string;
  needsDomain?: boolean;
  needsRegion?: boolean;
}> = {
  brevo: {
    site: "https://app.brevo.com/settings/keys/api",
    keyPath: "Brevo, canto superior direito, SMTP & API, aba Chaves de API",
    freeTier: "300 e-mails por dia de graça, para sempre.",
    placeholder: "xkeysib-...",
    steps: [
      "Crie a conta gratuita em brevo.com com o mesmo e-mail da sua empresa.",
      "Dentro da Brevo abra Remetentes e confirme o endereço que você vai usar para enviar.",
      "Abra SMTP & API, aba Chaves de API, e clique em Gerar nova chave.",
      "Copie a chave que começa com xkeysib e cole aqui embaixo.",
    ],
  },
  resend: {
    site: "https://resend.com/api-keys",
    keyPath: "Resend, menu lateral, API Keys, botão Create API Key",
    freeTier: "3.000 e-mails por mês de graça.",
    placeholder: "re_...",
    needsDomain: true,
    steps: [
      "Crie a conta em resend.com.",
      "Abra Domains e adicione o domínio da sua empresa.",
      "Espere o domínio ficar verificado.",
      "Abra API Keys, clique em Create API Key e copie a chave que começa com re_.",
    ],
  },
  sendgrid: {
    site: "https://app.sendgrid.com/settings/api_keys",
    keyPath: "SendGrid, Settings, API Keys, Create API Key",
    freeTier: "100 e-mails por dia de graça.",
    placeholder: "SG....",
    needsDomain: true,
    steps: [
      "Crie a conta em sendgrid.com e conclua a verificação da empresa.",
      "Abra Settings, Sender Authentication, e autentique o domínio.",
      "Abra Settings, API Keys, e crie uma chave com a permissão Mail Send.",
      "Copie a chave que começa com SG. e cole aqui.",
    ],
  },
  mailgun: {
    site: "https://app.mailgun.com/settings/api_security",
    keyPath: "Mailgun, perfil, API Security, Add new key",
    freeTier: "Plano pago, com período de teste conforme a conta.",
    placeholder: "key-...",
    needsDomain: true,
    needsRegion: true,
    steps: [
      "Crie a conta em mailgun.com e escolha a região do servidor.",
      "Abra Sending, Domains, e adicione um domínio de envio.",
      "Configure os registros DNS indicados.",
      "Abra API Security e gere uma chave privada.",
    ],
  },
};

export function EmailConnectPanel({ open, onOpenChange, onOpenGoogle }: Props) {
  const [status, setStatus] = useState<{
    connected: boolean;
    mode: Mode | null;
    fromEmail: string | null;
    fromName: string | null;
    replyTo: string | null;
    domain: string | null;
    region: "us" | "eu" | null;
    googleConnected: boolean;
    googleEmail: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState("conectar");
  const [gmailName, setGmailName] = useState("");
  const [gmailReply, setGmailReply] = useState("");
  const [provider, setProvider] = useState<Exclude<Mode, "gmail">>("brevo");
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [domain, setDomain] = useState("");
  const [region, setRegion] = useState<"us" | "eu">("us");
  const [testTo, setTestTo] = useState("");

  const readStatus = useServerFn(getEmailSenderStatus);
  const connectGmail = useServerFn(connectGmailSender);
  const connectProvider = useServerFn(connectEmailProvider);
  const sendTest = useServerFn(sendTestEmail);
  const disconnect = useServerFn(disconnectEmailSender);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const s = await readStatus({});
      setStatus(s as typeof status);
      if (s.fromName) setFromName(s.fromName);
      if (s.fromEmail && s.mode !== "gmail") setFromEmail(s.fromEmail);
      if (s.domain) setDomain(s.domain);
      if (s.region) setRegion(s.region);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao carregar." });
    } finally {
      setLoading(false);
    }
  }, [readStatus]);

  useEffect(() => {
    if (open) {
      setMsg(null);
      void reload();
    }
  }, [open, reload]);

  async function handleGmail() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await connectGmail({ data: { fromName: gmailName || undefined, replyTo: gmailReply || undefined } });
      setMsg({ ok: true, text: `Pronto. Seus e-mails vão sair de ${r.fromEmail}.` });
      await reload();
      setTab("teste");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao conectar o Gmail." });
    } finally {
      setBusy(false);
    }
  }

  async function handleProvider() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await connectProvider({
        data: {
          mode: provider,
          apiKey,
          fromEmail,
          fromName: fromName || undefined,
          replyTo: replyTo || undefined,
          domain: domain || undefined,
          region: provider === "mailgun" ? region : undefined,
        },
      });
      setMsg({ ok: true, text: `Conectado. Seus e-mails vão sair de ${r.fromEmail}.` });
      setApiKey("");
      await reload();
      setTab("teste");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao conectar o provedor." });
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setMsg(null);
    try {
      await sendTest({ data: { to: testTo } });
      setMsg({ ok: true, text: "Enviado. Confira a caixa de entrada e o spam na primeira vez." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao enviar o teste." });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setMsg(null);
    try {
      await disconnect({});
      setMsg({ ok: true, text: "E-mail desconectado deste workspace." });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao desconectar." });
    } finally {
      setBusy(false);
    }
  }

  const guide = PROVIDER_GUIDE[provider];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> E-mail Central</DialogTitle>
          <DialogDescription>Use o Gmail conectado na Google Central ou um provedor de envio por API.</DialogDescription>
        </DialogHeader>

        {msg && <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{msg.text}</span></div>}

        {status?.connected && <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="font-medium">Conectado</span><Badge variant="secondary">{status.mode ? MODE_LABEL[status.mode] : "E-mail"}</Badge><span className="text-muted-foreground">enviando como {status.fromEmail}</span><div className="ml-auto flex gap-2"><Button size="sm" variant="ghost" onClick={reload} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button><Button size="sm" variant="ghost" className="text-red-600" onClick={handleDisconnect} disabled={busy}>Desconectar</Button></div></div>}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="conectar">Conectar</TabsTrigger><TabsTrigger value="teste" disabled={!status?.connected}>Testar envio</TabsTrigger><TabsTrigger value="entender">Qual escolher</TabsTrigger></TabsList>
          <TabsContent value="conectar" className="space-y-6 pt-4">
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><h3 className="font-semibold">Gmail</h3><Badge variant="secondary">Google Central</Badge></div>
              <p className="text-sm text-muted-foreground">Usa a mesma Conta Google conectada na plataforma. Não precisa cadastrar outra chave.</p>
              {status?.googleConnected ? <>
                <div className="rounded-md bg-muted/50 p-2 text-sm">Conta encontrada: <strong>{status.googleEmail}</strong></div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Nome que aparece para quem recebe</Label><Input value={gmailName} onChange={(e) => setGmailName(e.target.value)} placeholder="Equipe da sua empresa" /></div><div className="space-y-1.5"><Label>Responder para (opcional)</Label><Input value={gmailReply} onChange={(e) => setGmailReply(e.target.value)} placeholder="atendimento@suaempresa.com" /></div></div>
                <Button onClick={handleGmail} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}Usar este Gmail para enviar</Button>
              </> : <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>Conecte a Google Central primeiro para usar o Gmail.</p>{onOpenGoogle && <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); onOpenGoogle(); }}>Abrir a integração Google</Button>}</div>}
            </div>

            <div className="space-y-3 rounded-lg border-2 border-primary/30 p-4">
              <div className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /><h3 className="font-semibold">Provedor de envio</h3><Badge className="bg-primary/10 text-primary">para volume</Badge></div>
              <div className="space-y-1.5"><Label>Provedor</Label><Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="brevo">Brevo</SelectItem><SelectItem value="resend">Resend</SelectItem><SelectItem value="sendgrid">SendGrid</SelectItem><SelectItem value="mailgun">Mailgun</SelectItem></SelectContent></Select></div>
              <div className="rounded-md bg-muted/40 p-3 text-sm"><p className="mb-2 flex items-center gap-2 font-medium"><Info className="h-4 w-4" /> Passo a passo no {MODE_LABEL[provider]}</p><ol className="ml-4 list-decimal space-y-1 text-muted-foreground">{guide.steps.map((s) => <li key={s}>{s}</li>)}</ol><p className="mt-2 text-xs text-muted-foreground">Custo: {guide.freeTier}</p><a href={guide.site} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">Abrir a tela da chave: {guide.keyPath} <ExternalLink className="h-3 w-3" /></a></div>
              <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5 sm:col-span-2"><Label>Chave de API</Label><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={guide.placeholder} /></div><div className="space-y-1.5"><Label>E-mail que envia</Label><Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="contato@suaempresa.com" /></div><div className="space-y-1.5"><Label>Nome que aparece</Label><Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Equipe da sua empresa" /></div><div className="space-y-1.5"><Label>Responder para (opcional)</Label><Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="atendimento@suaempresa.com" /></div>{guide.needsDomain && <div className="space-y-1.5"><Label>Domínio de envio</Label><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mg.suaempresa.com" /></div>}{guide.needsRegion && <div className="space-y-1.5"><Label>Região</Label><Select value={region} onValueChange={(v) => setRegion(v as "us" | "eu")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="us">Estados Unidos</SelectItem><SelectItem value="eu">Europa</SelectItem></SelectContent></Select></div>}</div>
              <Button variant="outline" onClick={handleProvider} disabled={busy || !apiKey || !fromEmail}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Conectar {MODE_LABEL[provider]}</Button>
            </div>
          </TabsContent>
          <TabsContent value="teste" className="space-y-3 pt-4"><p className="text-sm text-muted-foreground">Mande um e-mail de teste para você mesmo antes de ligar qualquer automação.</p><div className="space-y-1.5"><Label>Enviar para</Label><Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="voce@suaempresa.com" /></div><Button onClick={handleTest} disabled={busy || !testTo}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar teste</Button></TabsContent>
          <TabsContent value="entender" className="space-y-3 pt-4 text-sm"><div className="rounded-lg border p-3"><p className="font-medium">Comece pelo Gmail para uso operacional normal.</p><p className="mt-1 text-muted-foreground">Para listas maiores, relatórios de entrega e domínio dedicado, use um provedor de envio.</p></div></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
