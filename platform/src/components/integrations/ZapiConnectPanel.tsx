import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, QrCode, Copy, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  saveZapiCredentials,
  fetchZapiQrCode,
  fetchZapiStatus,
  registerZapiWebhook,
  disconnectZapi,
  listZapiSessions,
} from "@/lib/zapi.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Session = {
  id: string;
  instance_id: string | null;
  phone_number: string | null;
  status: string;
  last_connected_at: string | null;
  webhook_secret: string | null;
  created_at: string;
};

export function ZapiConnectPanel({ open, onOpenChange }: Props) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [clientToken, setClientToken] = useState("");

  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<number | null>(null);

  const save = useServerFn(saveZapiCredentials);
  const getQr = useServerFn(fetchZapiQrCode);
  const getStatus = useServerFn(fetchZapiStatus);
  const regHook = useServerFn(registerZapiWebhook);
  const disc = useServerFn(disconnectZapi);
  const list = useServerFn(listZapiSessions);

  const callbackUrl =
    webhookSecret && typeof window !== "undefined"
      ? `${window.location.origin}/api/public/zapi/webhook/${webhookSecret}`
      : "";

  useEffect(() => {
    if (!open) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    setMsg(null);
    setActiveSession(null);
    setQr(null);
    setConnected(false);
    setPhone(null);
    setWebhookSecret(null);
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      const wsId = prof?.current_workspace_id;
      if (!wsId) {
        setMsg({ ok: false, text: "Workspace não encontrado." });
        return;
      }
      setWorkspaceId(wsId);
      try {
        const r = await list({ data: { workspaceId: wsId } });
        setSessions(r.sessions as Session[]);
      } catch {
        // ignore
      }
    })();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [open, list]);

  async function handleSave() {
    if (!workspaceId) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await save({
        data: {
          workspaceId,
          instanceId: instanceId.trim(),
          token: token.trim(),
          clientToken: clientToken.trim() || null,
        },
      });
      setActiveSession(r.sessionId);
      setMsg({ ok: true, text: "Instância salva. Gerando QR Code…" });
      await pullQr(r.sessionId);
      startPolling(r.sessionId);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally {
      setBusy(false);
    }
  }

  async function pullQr(sessionId: string) {
    try {
      const r = await getQr({ data: { sessionId } });
      setConnected(r.connected);
      setQr(r.qr);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao obter QR." });
    }
  }

  function startPolling(sessionId: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await getStatus({ data: { sessionId } });
        setConnected(s.connected);
        setPhone(s.phone);
        setWebhookSecret(s.webhookSecret);
        if (s.connected) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setQr(null);
          setMsg({ ok: true, text: `Conectado ao número ${s.phone ?? "(desconhecido)"}.` });
          // Auto-registra webhook agora que temos secret
          if (workspaceId && s.webhookSecret) {
            const url = `${window.location.origin}/api/public/zapi/webhook/${s.webhookSecret}`;
            try {
              await regHook({ data: { sessionId, callbackUrl: url } });
            } catch {
              // silencioso; usuário pode configurar manualmente
            }
          }
          try {
            const r = await list({ data: { workspaceId: workspaceId! } });
            setSessions(r.sessions as Session[]);
          } catch { /* noop */ }
        } else if (!qr) {
          void pullQr(sessionId);
        }
      } catch {
        // continua tentando
      }
    }, 4000);
  }

  async function handleReconnect(s: Session) {
    setActiveSession(s.id);
    setWebhookSecret(s.webhook_secret);
    setPhone(s.phone_number);
    setConnected(s.status === "conectado");
    if (s.status !== "conectado") {
      await pullQr(s.id);
      startPolling(s.id);
    }
  }

  async function handleDisconnect(sessionId: string) {
    setBusy(true);
    try {
      await disc({ data: { sessionId } });
      setMsg({ ok: true, text: "Sessão desconectada." });
      if (workspaceId) {
        const r = await list({ data: { workspaceId } });
        setSessions(r.sessions as Session[]);
      }
      setActiveSession(null);
      setQr(null);
      setConnected(false);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao desconectar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>WhatsApp via Z-API</DialogTitle>
          <DialogDescription>
            Conecte um número WhatsApp por QR Code usando a Z-API. Cada instância = 1 número.
          </DialogDescription>
        </DialogHeader>

        {sessions.length > 0 && !activeSession && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
              Instâncias já cadastradas
            </div>
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {s.phone_number ?? s.instance_id ?? "sem número"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Status: <span className="font-semibold">{s.status}</span> · Instância: {s.instance_id}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleReconnect(s)}>
                    {s.status === "conectado" ? "Ver" : "Reconectar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDisconnect(s.id)}>
                    Desconectar
                  </Button>
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-border" />
          </div>
        )}

        {!activeSession && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                Passo 1 · Crie a instância na Z-API
              </div>
              <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1 leading-relaxed">
                <li>Entre em <strong className="text-foreground">z-api.io</strong> e crie uma nova instância.</li>
                <li>Copie o <strong className="text-foreground">ID da Instância</strong> e o <strong className="text-foreground">Token</strong>.</li>
                <li>Se ativou segurança, copie também o <strong className="text-foreground">Client-Token</strong>.</li>
              </ol>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">ID da Instância</label>
              <Input value={instanceId} onChange={(e) => setInstanceId(e.target.value)} placeholder="3EXXXXXXXX..." />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Token</label>
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="B0X..." />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Client-Token (opcional)</label>
              <Input type="password" value={clientToken} onChange={(e) => setClientToken(e.target.value)} placeholder="F..." />
            </div>

            <Button onClick={handleSave} disabled={busy || !instanceId || !token} className="w-full">
              {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Salvar e gerar QR Code
            </Button>
          </div>
        )}

        {activeSession && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
              {connected ? (
                <div className="space-y-2">
                  <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
                  <div className="text-sm font-semibold">Conectado</div>
                  {phone && <div className="text-xs text-muted-foreground">Número: {phone}</div>}
                </div>
              ) : qr ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <QrCode className="h-3.5 w-3.5" /> Escaneie com o WhatsApp do celular
                  </div>
                  <img
                    src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                    alt="QR Code Z-API"
                    className="mx-auto w-64 h-64 rounded-md border border-border bg-white p-2"
                  />
                  <div className="text-[11px] text-muted-foreground">
                    WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Aguardando QR Code…
                </div>
              )}
            </div>

            {webhookSecret && (
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-primary font-bold">
                    URL de Webhook (auto-configurada)
                  </div>
                  <Button
                    size="sm"
                    variant={copied ? "default" : "outline"}
                    className="h-7 px-3 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(callbackUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                <code className="block w-full rounded bg-background border border-border px-2 py-1.5 text-[11px] font-mono break-all">
                  {callbackUrl}
                </code>
                <div className="text-[10px] text-muted-foreground">
                  Quando você conectar, tentamos configurar essa URL automaticamente nos webhooks da Z-API.
                  Se preferir, cole manualmente em: Painel Z-API → sua instância → Webhooks.
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => activeSession && pullQr(activeSession)} disabled={connected}>
                Atualizar QR
              </Button>
              <Button variant="ghost" onClick={() => activeSession && handleDisconnect(activeSession)}>
                Desconectar
              </Button>
            </div>
          </div>
        )}

        {msg && (
          <div
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
              msg.ok
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
