import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, QrCode, Copy, Check, Plus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  createEvolutionInstance,
  fetchEvolutionQrCode,
  fetchEvolutionStatus,
  disconnectEvolution,
  listEvolutionSessions,
  getWhatsappQuota,
  recreateEvolutionInstance,
} from "@/lib/evolution.functions";

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

type Notice = { tone: "info" | "success" | "error"; text: string };
type QrResult = { connected: boolean; qr: string | null };

const VPS_QR_FIX_TEXT =
  "A Evolution respondeu sem QR. A Vanessa Simoni tentou recuperar a sessão automaticamente, mas o provedor ainda não devolveu um QR válido.";

const PAIRING_FIX_TEXT =
  "A sessão continua disponível para uma nova tentativa. Recupere a conexão para gerar outro QR Code.";

const AUTO_RESUME_STATUSES = new Set(["configurando", "aguardando_qr", "conectando", "erro_qr", "falha_pareamento"]);

export function EvolutionConnectPanel({ open, onOpenChange }: Props) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Notice | null>(null);

  const [friendlyName, setFriendlyName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [pairingFailed, setPairingFailed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<number | null>(null);
  const pollTickBusyRef = useRef(false);
  const qrRef = useRef<string | null>(null);
  const autoRecoveredRef = useRef<Set<string>>(new Set());

  const create = useServerFn(createEvolutionInstance);
  const getQr = useServerFn(fetchEvolutionQrCode);
  const getStatus = useServerFn(fetchEvolutionStatus);
  const disc = useServerFn(disconnectEvolution);
  const list = useServerFn(listEvolutionSessions);
  const quotaFn = useServerFn(getWhatsappQuota);
  const recreate = useServerFn(recreateEvolutionInstance);

  const callbackUrl =
    webhookSecret && typeof window !== "undefined"
      ? `${window.location.origin}/api/public/evolution/webhook/${webhookSecret}`
      : "";

  useEffect(() => {
    qrRef.current = qr;
  }, [qr]);

  useEffect(() => {
    if (!open) {
      stopPolling();
      return;
    }

    setMsg(null);
    setActiveSession(null);
    setQr(null);
    setQrFailed(false);
    setPairingFailed(false);
    setConnected(false);
    setPhone(null);
    setWebhookSecret(null);
    setShowNewForm(false);
    setFriendlyName("");
    autoRecoveredRef.current = new Set();

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
        setMsg({ tone: "error", text: "Workspace não encontrado." });
        return;
      }

      setWorkspaceId(wsId);

      try {
        const [r, q] = await Promise.all([
          list({ data: { workspaceId: wsId } }),
          quotaFn({ data: { workspaceId: wsId } }),
        ]);
        const loadedSessions = (r.sessions as Session[]) ?? [];
        setSessions(loadedSessions);
        setQuota(q);

        if (loadedSessions.length === 0) {
          setShowNewForm(true);
          return;
        }

        const pending = loadedSessions.find(
          (session) =>
            AUTO_RESUME_STATUSES.has(session.status) &&
            !session.phone_number &&
            !session.last_connected_at,
        );

        if (pending) {
          await resumePendingSession(pending, true);
        }
      } catch (e) {
        setShowNewForm(true);
        setMsg({
          tone: "error",
          text: e instanceof Error ? e.message : "Não foi possível carregar a conexão do WhatsApp.",
        });
      }
    })();

    return () => stopPolling();
  }, [open, list]);

  function stopPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    pollTickBusyRef.current = false;
  }

  async function refreshSessions() {
    if (!workspaceId) return;
    try {
      const [r, q] = await Promise.all([
        list({ data: { workspaceId } }),
        quotaFn({ data: { workspaceId } }),
      ]);
      setSessions((r.sessions as Session[]) ?? []);
      setQuota(q);
    } catch {
      // O fluxo principal já informa qualquer erro da Evolution.
    }
  }

  async function handleCreate() {
    if (!workspaceId || !friendlyName.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await create({ data: { workspaceId, friendlyName: friendlyName.trim() } });
      setActiveSession(r.sessionId);
      setShowNewForm(false);
      setPairingFailed(false);
      setConnected(false);

      if (r.qr) {
        setQr(r.qr);
        setQrFailed(false);
        setMsg({ tone: "success", text: "QR Code gerado. Escaneie para concluir a conexão." });
        startPolling(r.sessionId);
      } else {
        setQr(null);
        setQrFailed(true);
        setMsg({ tone: "error", text: VPS_QR_FIX_TEXT });
      }
      await refreshSessions();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Falha ao criar instância." });
    } finally {
      setBusy(false);
    }
  }

  async function pullQr(sessionId: string): Promise<QrResult | null> {
    try {
      setMsg((current) => (current?.tone === "success" ? current : null));
      const r = await getQr({ data: { sessionId } });
      const result: QrResult = { connected: r.connected, qr: r.qr };
      setConnected(result.connected);
      setQr(result.qr);
      setQrFailed(!result.connected && !result.qr);
      if (result.qr) setPairingFailed(false);
      if (!result.connected && result.qr) {
        setMsg({ tone: "success", text: "QR Code gerado. Escaneie para concluir a conexão." });
      }
      return result;
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Falha ao obter QR." });
      setQr(null);
      setQrFailed(true);
      return null;
    }
  }

  async function recreateSession(sessionId: string, name = "WhatsApp"): Promise<boolean> {
    setBusy(true);
    setMsg({ tone: "info", text: "Recuperando a conexão do WhatsApp…" });
    try {
      const r = await recreate({
        data: { sessionId, friendlyName: name.trim() || "WhatsApp" },
      });
      setActiveSession(r.sessionId);
      setQr(r.qr);
      setQrFailed(!r.qr);
      setPairingFailed(false);
      setConnected(false);
      setPhone(null);
      setMsg({
        tone: r.qr ? "success" : "error",
        text: r.qr
          ? "Conexão recuperada. Escaneie o QR Code para concluir."
          : VPS_QR_FIX_TEXT,
      });

      if (r.qr) startPolling(r.sessionId);
      await refreshSessions();
      return Boolean(r.qr);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Falha ao recuperar a instância." });
      setQrFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function resumePendingSession(session: Session, allowAutoRecreate: boolean) {
    setActiveSession(session.id);
    setWebhookSecret(session.webhook_secret);
    setPhone(session.phone_number);
    setConnected(session.status === "conectado");
    setPairingFailed(false);

    if (session.status === "conectado") return;

    const result = await pullQr(session.id);
    if (result?.connected) {
      await refreshSessions();
      return;
    }
    if (result?.qr) {
      startPolling(session.id);
      return;
    }

    const neverPaired = !session.phone_number && !session.last_connected_at;
    if (
      allowAutoRecreate &&
      neverPaired &&
      !autoRecoveredRef.current.has(session.id)
    ) {
      autoRecoveredRef.current.add(session.id);
      await recreateSession(session.id, "WhatsApp");
    }
  }

  function startPolling(sessionId: string) {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      if (pollTickBusyRef.current) return;
      pollTickBusyRef.current = true;
      try {
        const s = await getStatus({ data: { sessionId } });
        setConnected(s.connected);
        setPhone(s.phone);
        setWebhookSecret(s.webhookSecret);

        if (s.pairingFailed) {
          stopPolling();
          setQr(null);
          setQrFailed(false);
          setPairingFailed(false);
          if (!autoRecoveredRef.current.has(sessionId)) {
            autoRecoveredRef.current.add(sessionId);
            await recreateSession(sessionId, "WhatsApp");
          } else {
            setMsg({ tone: "info", text: PAIRING_FIX_TEXT });
          }
          return;
        }

        setPairingFailed(false);
        if (s.connected) {
          stopPolling();
          setQr(null);
          setQrFailed(false);
          setMsg({
            tone: "success",
            text: `WhatsApp conectado ao número ${s.phone ?? "(desconhecido)"}.`,
          });
          await refreshSessions();
          return;
        }

        await pullQr(sessionId);
      } catch {
        // Uma falha transitória não encerra o polling da sessão válida.
      } finally {
        pollTickBusyRef.current = false;
      }
    }, 3000);
  }

  async function handleReconnect(session: Session) {
    const allowRecovery = !session.phone_number && !session.last_connected_at;
    await resumePendingSession(session, allowRecovery);
  }

  async function handleDisconnect(sessionId: string) {
    stopPolling();
    setBusy(true);
    setDisconnectingId(sessionId);
    try {
      await disc({ data: { sessionId } });
      setMsg({ tone: "success", text: "Instância removida. Você já pode conectar outro WhatsApp." });
      await refreshSessions();
      setActiveSession(null);
      setQr(null);
      setQrFailed(false);
      setPairingFailed(false);
      setConnected(false);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Falha ao desconectar." });
    } finally {
      setBusy(false);
      setDisconnectingId(null);
    }
  }

  async function handleRecreate() {
    if (!activeSession) return;
    autoRecoveredRef.current.add(activeSession);
    await recreateSession(activeSession, friendlyName.trim() || "WhatsApp");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>WhatsApp Web</DialogTitle>
          <DialogDescription>
            Conecte os números de WhatsApp da Vanessa Simoni escaneando o QR Code. Cada número fica separado por sessão para organizar atendimento, vendas e suporte.
          </DialogDescription>
          {quota && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[11px]">
              <span className="text-muted-foreground">Números conectados:</span>
              <span className="font-semibold text-foreground">
                {quota.used}
              </span>
            </div>
          )}
        </DialogHeader>

        {sessions.length > 0 && !activeSession && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                Números conectados
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNewForm(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Novo número
              </Button>
            </div>
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {session.phone_number ?? session.instance_id ?? "sem número"}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    Status: <span className="font-semibold">{session.status}</span> · {session.instance_id}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleReconnect(session)} disabled={busy}>
                    {session.status === "conectado" ? "Ver" : "Gerar QR"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDisconnect(session.id)} disabled={busy}>
                    {disconnectingId === session.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Remover
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!activeSession && showNewForm && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
              Adicionar novo número
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Nome amigável</label>
              <Input
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="Ex: Comercial SP, SDR Ruan, Suporte…"
              />
              <div className="text-[10px] text-muted-foreground">
                Só para você identificar. A sessão é criada automaticamente.
              </div>
            </div>
            <Button onClick={handleCreate} disabled={busy || !friendlyName.trim()} className="w-full">
              {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Conectar e gerar QR Code
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
              ) : pairingFailed ? (
                <div className="space-y-2 py-6 text-sm text-destructive">
                  <AlertCircle className="h-8 w-8 mx-auto" />
                  <div className="font-semibold">Sessão pronta para nova tentativa</div>
                  <div className="mx-auto max-w-sm text-xs text-muted-foreground">
                    {PAIRING_FIX_TEXT}
                  </div>
                </div>
              ) : qr ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <QrCode className="h-3.5 w-3.5" /> Escaneie com o WhatsApp do celular
                  </div>
                  <img
                    src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                    alt="QR Code WhatsApp Web"
                    className="mx-auto w-72 h-72 rounded-md border border-border bg-white p-3"
                  />
                  <div className="text-[11px] text-muted-foreground">
                    WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
                  </div>
                  <div className="text-[10px] text-muted-foreground/70">
                    O QR expira em ~40s e atualiza sozinho.
                  </div>
                </div>
              ) : qrFailed || msg?.tone === "error" ? (
                <div className="space-y-2 py-6 text-sm text-destructive">
                  <AlertCircle className="h-8 w-8 mx-auto" />
                  <div className="font-semibold">QR Code não gerado</div>
                  <div className="mx-auto max-w-sm text-xs text-muted-foreground">
                    {VPS_QR_FIX_TEXT}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Preparando QR Code…
                </div>
              )}
            </div>

            {webhookSecret && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                    Webhook (configurado automaticamente)
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
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => activeSession && pullQr(activeSession)}
                disabled={connected || busy}
              >
                Atualizar QR
              </Button>
              <Button variant="outline" onClick={handleRecreate} disabled={connected || busy}>
                {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Recuperar conexão
              </Button>
              <Button variant="ghost" onClick={() => activeSession && handleDisconnect(activeSession)} disabled={busy}>
                {activeSession && disconnectingId === activeSession && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Remover instância
              </Button>
            </div>
          </div>
        )}

        {msg && (
          <div
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
              msg.tone === "success"
                ? "border-success/30 bg-success/10 text-success"
                : msg.tone === "info"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {msg.tone === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            )}
            <span>{msg.text}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
