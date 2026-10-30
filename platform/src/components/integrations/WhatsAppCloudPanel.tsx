import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, CheckCircle2, AlertCircle, RefreshCw, Phone, FileText, Send,
  Trash2, ShieldCheck, Info, ExternalLink,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  getWhatsappEmbeddedConfig, getWhatsappCloudStatus, completeWhatsappEmbeddedSignup,
  refreshWhatsappCloud, subscribeWhatsappWebhook, listWhatsappTemplates,
  createWhatsappTemplate, deleteWhatsappTemplate, sendWhatsappTemplateMessage,
  disconnectWhatsappCloud,
} from "@/lib/whatsapp-cloud.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type PhoneNumber = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  registered?: boolean;
};

type Template = {
  id: string;
  name: string;
  status: string;
  category?: string;
  language?: string;
  rejected_reason?: string;
  components?: Array<{ type: string; text?: string }>;
};

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void, o: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const STATUS_TONE: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  IN_APPEAL: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-700",
  PAUSED: "bg-muted text-muted-foreground",
  DISABLED: "bg-red-100 text-red-700",
};

export function WhatsAppCloudPanel({ open, onOpenChange }: Props) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [config, setConfig] = useState<{ appId: string | null; configId: string | null; graphVersion: string; ready: boolean } | null>(null);
  const [status, setStatus] = useState<{
    connected: boolean; wabaId: string | null; businessName: string | null;
    webhookSubscribed: boolean; defaultPhoneNumberId: string | null;
    phoneNumbers: PhoneNumber[]; connectedAt: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [tplLoading, setTplLoading] = useState(false);
  const [tab, setTab] = useState("conexao");

  // formulário de modelo
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("UTILITY");
  const [tplLanguage, setTplLanguage] = useState("pt_BR");
  const [tplHeader, setTplHeader] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplFooter, setTplFooter] = useState("");

  // teste de envio
  const [testTo, setTestTo] = useState("");
  const [testTemplate, setTestTemplate] = useState("");

  const signupInfo = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  const readConfig = useServerFn(getWhatsappEmbeddedConfig);
  const readStatus = useServerFn(getWhatsappCloudStatus);
  const completeSignup = useServerFn(completeWhatsappEmbeddedSignup);
  const refresh = useServerFn(refreshWhatsappCloud);
  const resubscribe = useServerFn(subscribeWhatsappWebhook);
  const loadTemplates = useServerFn(listWhatsappTemplates);
  const saveTemplate = useServerFn(createWhatsappTemplate);
  const removeTemplate = useServerFn(deleteWhatsappTemplate);
  const sendTemplate = useServerFn(sendWhatsappTemplateMessage);
  const disconnect = useServerFn(disconnectWhatsappCloud);

  // 1) workspace + config + status
  useEffect(() => {
    if (!open) return;
    setMsg(null);
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles")
        .select("current_workspace_id").eq("id", u.user.id).maybeSingle();
      const wsId = prof?.current_workspace_id ?? null;
      setWorkspaceId(wsId);
      try { setConfig(await readConfig({})); } catch { /* noop */ }
      if (wsId) {
        try { setStatus(await readStatus({ data: { workspaceId: wsId } })); } catch { /* noop */ }
      }
    })();
  }, [open, readConfig, readStatus]);

  // 2) SDK do Facebook (só carrega quando o painel abre e o app está configurado)
  useEffect(() => {
    if (!open || !config?.appId) return;
    if (window.FB) { setSdkReady(true); return; }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: config.appId, autoLogAppEvents: true, xfbml: true, version: config.graphVersion });
      setSdkReady(true);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    document.body.appendChild(s);
  }, [open, config]);

  // 3) mensagem do Embedded Signup com a WABA e o número escolhidos
  useEffect(() => {
    if (!open) return;
    function onMessage(event: MessageEvent) {
      if (!/facebook\.com$/.test(new URL(event.origin).hostname)) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.data) {
          signupInfo.current = {
            wabaId: data.data.waba_id,
            phoneNumberId: data.data.phone_number_id,
          };
        }
      } catch { /* mensagem de outro fluxo */ }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open]);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    try { setStatus(await readStatus({ data: { workspaceId } })); } catch { /* noop */ }
  }, [workspaceId, readStatus]);

  function launchSignup() {
    if (!workspaceId || !window.FB || !config?.configId) return;
    setMsg(null);
    signupInfo.current = {};
    window.FB.login(
      async (response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          setMsg({ ok: false, text: "Conexão cancelada na janela da Meta." });
          return;
        }
        setBusy(true);
        try {
          const r = await completeSignup({
            data: {
              workspaceId,
              code,
              wabaId: signupInfo.current.wabaId,
              phoneNumberId: signupInfo.current.phoneNumberId,
            },
          });
          setMsg({
            ok: true,
            text: r.webhookSubscribed
              ? "Número conectado. As mensagens já caem no Inbox."
              : "Número conectado, mas o webhook ficou pendente. Clique em Reativar recebimento.",
          });
          await reload();
          setTab("numeros");
        } catch (e) {
          setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao finalizar a conexão." });
        } finally {
          setBusy(false);
        }
      },
      {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    );
  }

  async function handleRefresh() {
    if (!workspaceId) return;
    setBusy(true); setMsg(null);
    try {
      await refresh({ data: { workspaceId } });
      await reload();
      setMsg({ ok: true, text: "Dados atualizados direto da Meta." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao atualizar." });
    } finally { setBusy(false); }
  }

  async function handleResubscribe() {
    if (!workspaceId) return;
    setBusy(true); setMsg(null);
    try {
      await resubscribe({ data: { workspaceId } });
      await reload();
      setMsg({ ok: true, text: "Recebimento de mensagens reativado." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao reativar." });
    } finally { setBusy(false); }
  }

  async function handleDisconnect() {
    if (!workspaceId) return;
    setBusy(true); setMsg(null);
    try {
      await disconnect({ data: { workspaceId } });
      setStatus(null); setTemplates(null);
      setMsg({ ok: true, text: "WhatsApp desconectado desta conta." });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao desconectar." });
    } finally { setBusy(false); }
  }

  const fetchTemplates = useCallback(async () => {
    if (!workspaceId) return;
    setTplLoading(true);
    try {
      const r = await loadTemplates({ data: { workspaceId } });
      setTemplates(r.templates as Template[]);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao listar modelos." });
    } finally { setTplLoading(false); }
  }, [workspaceId, loadTemplates]);

  useEffect(() => {
    if ((tab === "modelos" || tab === "envio") && status?.connected && templates === null) void fetchTemplates();
  }, [tab, status?.connected, templates, fetchTemplates]);

  async function handleCreateTemplate() {
    if (!workspaceId) return;
    setBusy(true); setMsg(null);
    try {
      await saveTemplate({
        data: {
          workspaceId,
          name: tplName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
          language: tplLanguage,
          category: tplCategory,
          header: tplHeader.trim() || undefined,
          body: tplBody.trim(),
          footer: tplFooter.trim() || undefined,
        },
      });
      setMsg({ ok: true, text: "Modelo enviado para análise da Meta. A resposta costuma sair em minutos." });
      setTplName(""); setTplHeader(""); setTplBody(""); setTplFooter("");
      await fetchTemplates();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao criar o modelo." });
    } finally { setBusy(false); }
  }

  async function handleDeleteTemplate(name: string) {
    if (!workspaceId) return;
    setBusy(true);
    try {
      await removeTemplate({ data: { workspaceId, name } });
      await fetchTemplates();
      setMsg({ ok: true, text: "Modelo removido." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao remover." });
    } finally { setBusy(false); }
  }

  async function handleSendTest() {
    if (!workspaceId) return;
    setBusy(true); setMsg(null);
    try {
      const tpl = templates?.find((t) => t.name === testTemplate);
      await sendTemplate({
        data: {
          workspaceId,
          to: testTo,
          templateName: testTemplate,
          language: tpl?.language ?? "pt_BR",
        },
      });
      setMsg({ ok: true, text: "Mensagem enviada. Confira o WhatsApp do número de teste." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao enviar." });
    } finally { setBusy(false); }
  }

  const connected = !!status?.connected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-emerald-600" />
            WhatsApp Cloud API (oficial)
          </DialogTitle>
          <DialogDescription>
            Você não digita token nem código nenhum aqui. Clique em conectar, faça tudo dentro da janela
            oficial da Meta e volte pronto. Aqui dentro você só cuida dos modelos de mensagem e dos envios.
          </DialogDescription>
        </DialogHeader>

        {msg && (
          <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="conexao">Conexão</TabsTrigger>
            <TabsTrigger value="numeros" disabled={!connected}>Números</TabsTrigger>
            <TabsTrigger value="modelos" disabled={!connected}>Modelos</TabsTrigger>
            <TabsTrigger value="envio" disabled={!connected}>Testar envio</TabsTrigger>
          </TabsList>

          {/* CONEXÃO */}
          <TabsContent value="conexao" className="space-y-4 pt-4">
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="mb-2 flex items-center gap-2 font-medium">
                <Info className="h-4 w-4" /> Como funciona
              </p>
              <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
                <li>Você clica em <strong>Conectar com o Meta</strong> e faz login na sua conta do Facebook.</li>
                <li>Dentro da janela da Meta você escolhe (ou cria) o Portfólio Empresarial e a conta do WhatsApp Business.</li>
                <li>Ainda na Meta, você coloca o número e recebe o código de verificação por SMS ou ligação.</li>
                <li>Pronto. A Meta devolve o número já conectado e a Vanessa Simoni liga o recebimento de mensagens sozinha.</li>
              </ol>
              <p className="mt-3 text-muted-foreground">
                Cobrança, limites, verificação do negócio e qualidade do número continuam sendo tratados dentro do
                Gerenciador da Meta. Aqui na plataforma você cria os modelos, manda pra análise e dispara.
              </p>
            </div>

            {config && !config.ready && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  O app da Meta ainda não está configurado nesta instalação. Fale com o suporte para liberar
                  o cadastro incorporado do WhatsApp.
                </span>
              </div>
            )}

            {connected ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Conectado
                  {status?.businessName ? <span className="text-muted-foreground">· {status.businessName}</span> : null}
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>Conta WhatsApp Business: <span className="font-mono">{status?.wabaId}</span></div>
                  <div>Números conectados: {status?.phoneNumbers.length ?? 0}</div>
                  <div className="flex items-center gap-2">
                    Recebimento de mensagens:
                    {status?.webhookSubscribed
                      ? <Badge className="bg-emerald-100 text-emerald-700">ativo</Badge>
                      : <Badge className="bg-amber-100 text-amber-700">pendente</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={handleRefresh} disabled={busy}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Atualizar dados
                  </Button>
                  {!status?.webhookSubscribed && (
                    <Button size="sm" variant="outline" onClick={handleResubscribe} disabled={busy}>
                      <ShieldCheck className="mr-2 h-4 w-4" /> Reativar recebimento
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={launchSignup} disabled={busy || !sdkReady}>
                    <Phone className="mr-2 h-4 w-4" /> Adicionar outro número
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={handleDisconnect} disabled={busy}>
                    Desconectar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  className="w-full bg-[#1877F2] text-white hover:bg-[#166fe0]"
                  size="lg"
                  onClick={launchSignup}
                  disabled={busy || !sdkReady || !config?.ready}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Conectar com o Meta
                </Button>
                {!sdkReady && config?.ready && (
                  <p className="text-center text-xs text-muted-foreground">Carregando a janela oficial da Meta...</p>
                )}
                <p className="text-center text-xs text-muted-foreground">
                  Precisa ter um número que não esteja ativo em outro WhatsApp (nem no app comum, nem no Business).
                </p>
              </div>
            )}

            <a
              href="https://business.facebook.com/wa/manage/home/"
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Abrir o Gerenciador do WhatsApp na Meta <ExternalLink className="h-3 w-3" />
            </a>
          </TabsContent>

          {/* NÚMEROS */}
          <TabsContent value="numeros" className="space-y-3 pt-4">
            {(status?.phoneNumbers ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum número encontrado. Use Atualizar dados na aba Conexão.</p>
            )}
            {(status?.phoneNumbers ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">{p.display_phone_number ?? p.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.verified_name ?? "Sem nome verificado"}
                    {p.quality_rating ? ` · qualidade ${p.quality_rating.toLowerCase()}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {status?.defaultPhoneNumberId === p.id && <Badge variant="secondary">principal</Badge>}
                  {p.registered
                    ? <Badge className="bg-emerald-100 text-emerald-700">pronto</Badge>
                    : <Badge className="bg-amber-100 text-amber-700">verificar na Meta</Badge>}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* MODELOS */}
          <TabsContent value="modelos" className="space-y-4 pt-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              Para começar uma conversa com alguém que não te escreveu nas últimas 24 horas, o WhatsApp
              exige um modelo aprovado pela Meta. Crie aqui, a análise costuma levar poucos minutos.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome do modelo</Label>
                <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="boas_vindas_lead" />
                <p className="text-xs text-muted-foreground">Só letras minúsculas, números e underline.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={tplCategory} onValueChange={(v) => setTplCategory(v as typeof tplCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">Utilidade (aviso, status de pedido)</SelectItem>
                    <SelectItem value="MARKETING">Marketing (oferta, novidade)</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticação (código)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Idioma</Label>
                <Select value={tplLanguage} onValueChange={setTplLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                    <SelectItem value="en_US">Inglês (EUA)</SelectItem>
                    <SelectItem value="es_ES">Espanhol</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Título (opcional)</Label>
                <Input value={tplHeader} onChange={(e) => setTplHeader(e.target.value)} placeholder="Seu pedido chegou" maxLength={60} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <Textarea
                rows={4}
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                placeholder="Oi {{1}}, tudo bem? Vi que você pediu um orçamento e já separei as opções pra você."
              />
              <p className="text-xs text-muted-foreground">
                Use chaves duplas com número para os campos que mudam por pessoa, por exemplo o nome.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Rodapé (opcional)</Label>
              <Input value={tplFooter} onChange={(e) => setTplFooter(e.target.value)} maxLength={60} />
            </div>

            <Button onClick={handleCreateTemplate} disabled={busy || !tplName.trim() || !tplBody.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Enviar para análise da Meta
            </Button>

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Modelos da conta</h4>
                <Button size="sm" variant="ghost" onClick={fetchTemplates} disabled={tplLoading}>
                  <RefreshCw className={`h-4 w-4 ${tplLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {tplLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
              {templates?.length === 0 && !tplLoading && (
                <p className="text-sm text-muted-foreground">Nenhum modelo criado ainda.</p>
              )}
              {(templates ?? []).map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{t.name}</span>
                      <Badge className={STATUS_TONE[t.status] ?? "bg-muted text-muted-foreground"}>
                        {t.status.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.components?.find((c) => c.type === "BODY")?.text ?? t.category}
                    </p>
                    {t.rejected_reason && t.status === "REJECTED" && (
                      <p className="text-xs text-red-600">Motivo: {t.rejected_reason}</p>
                    )}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleDeleteTemplate(t.name)} disabled={busy}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* TESTE */}
          <TabsContent value="envio" className="space-y-3 pt-4">
            <div className="space-y-1.5">
              <Label>Número de destino (com DDI e DDD)</Label>
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="5522999998888" />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo aprovado</Label>
              <Select value={testTemplate} onValueChange={setTestTemplate}>
                <SelectTrigger><SelectValue placeholder="Escolha um modelo" /></SelectTrigger>
                <SelectContent>
                  {(templates ?? []).filter((t) => t.status === "APPROVED").map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSendTest} disabled={busy || !testTo || !testTemplate}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar teste
            </Button>
            <p className="text-xs text-muted-foreground">
              Modelos com campos variáveis são enviados aqui sem preenchimento. O disparo real com nome do lead
              acontece nas automações e no Inbox.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
