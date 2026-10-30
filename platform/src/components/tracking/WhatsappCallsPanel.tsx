import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  PhoneCall,
  PhoneMissed,
  RefreshCw,
  Copy,
  Check,
  Wrench,
  Loader2,
  ExternalLink,
  Beaker,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getWhatsappCallPanel,
  saveWhatsappCallSettings,
  syncWhatsappCallsNow,
  repairCallWebhook,
  createTestCallEvent,
} from "@/lib/whatsapp-calls.functions";

const NONE = "__none__";

export function WhatsappCallsPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const loadPanel = useServerFn(getWhatsappCallPanel);
  const saveFn = useServerFn(saveWhatsappCallSettings);
  const syncFn = useServerFn(syncWhatsappCallsNow);
  const repairFn = useServerFn(repairCallWebhook);
  const testFn = useServerFn(createTestCallEvent);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-calls-panel", workspaceId],
    queryFn: () => loadPanel({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });

  const [enabled, setEnabled] = useState(true);
  const [createLead, setCreateLead] = useState(false);
  const [pipelineId, setPipelineId] = useState<string>(NONE);
  const [stageId, setStageId] = useState<string>(NONE);
  const [tag, setTag] = useState("ligacao-perdida");
  const [autoReply, setAutoReply] = useState(false);
  const [replyMsg, setReplyMsg] = useState(
    "Oi! Vi que você ligou agora e não consegui atender. Pode me contar por aqui o que você precisa?",
  );
  const [minDur, setMinDur] = useState(0);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setEnabled(s.enabled);
    setCreateLead(s.create_lead_on_missed);
    setPipelineId(s.lead_pipeline_id ?? NONE);
    setStageId(s.lead_stage_id ?? NONE);
    setTag(s.lead_tag ?? "");
    setAutoReply(s.auto_reply_missed);
    if (s.auto_reply_message) setReplyMsg(s.auto_reply_message);
    setMinDur(s.min_duration_seconds ?? 0);
  }, [data?.settings]);

  const sessions = data?.sessions ?? [];
  const connected = sessions.filter((s) => (s.status ?? "").toLowerCase().includes("conect"));
  const stagesOfPipeline = useMemo(
    () => (data?.stages ?? []).filter((st) => pipelineId !== NONE && st.pipeline_id === pipelineId),
    [data?.stages, pipelineId],
  );

  async function handleSave() {
    setSaving(true);
    try {
      await saveFn({
        data: {
          workspaceId,
          enabled,
          createLeadOnMissed: createLead,
          leadPipelineId: pipelineId === NONE ? null : pipelineId,
          leadStageId: stageId === NONE ? null : stageId,
          leadTag: tag || null,
          autoReplyMissed: autoReply,
          autoReplyMessage: replyMsg,
          minDurationSeconds: Number(minDur) || 0,
        },
      });
      toast.success("Configurações de ligação salvas.");
      qc.invalidateQueries({ queryKey: ["wa-calls-panel", workspaceId] });
    } catch (e) {
      toast.error((e as Error).message || "Não deu para salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await syncFn({ data: { workspaceId } });
      if (r.imported > 0) toast.success(`${r.imported} ligação(ões) importada(s).`);
      else toast.info(r.problems.length ? r.problems[0] : "Nenhuma ligação nova encontrada.");
      qc.invalidateQueries({ queryKey: ["wa-calls-panel", workspaceId] });
      qc.invalidateQueries({ queryKey: ["tracking-source-statuses", workspaceId] });
    } catch (e) {
      toast.error((e as Error).message || "Falha ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleRepair(sessionId: string) {
    setRepairing(sessionId);
    try {
      await repairFn({ data: { workspaceId, sessionId } });
      toast.success("Webhook reconfigurado com o evento de ligações ativo.");
    } catch (e) {
      toast.error((e as Error).message || "Falha ao configurar o webhook.");
    } finally {
      setRepairing(null);
    }
  }

  async function handleTest() {
    if (testPhone.replace(/\D/g, "").length < 8) {
      toast.error("Digite um número com DDD para o teste.");
      return;
    }
    setTesting(true);
    try {
      const r = await testFn({ data: { workspaceId, phone: testPhone } });
      toast.success(
        r.leadCreated
          ? "Ligação de teste criada e lead gerado no CRM."
          : "Ligação de teste registrada no feed de tracking.",
      );
      qc.invalidateQueries({ queryKey: ["wa-calls-panel", workspaceId] });
    } catch (e) {
      toast.error((e as Error).message || "Falha no teste.");
    } finally {
      setTesting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando ligações...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Estado da conexão */}
      <div className="rounded-xl border border-border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-semibold">Número que vai registrar as ligações</div>
          <Link
            to="/integracoes"
            search={{ abrir: "whatsapp" } as never}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            Abrir conexão do WhatsApp <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {sessions.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nenhum WhatsApp conectado ainda. Clique em Abrir conexão do WhatsApp, leia o QR Code com o
            celular da empresa e volte aqui. É o mesmo número que já usa a caixa de entrada, você não
            precisa de outro chip.
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const on = (s.status ?? "").toLowerCase().includes("conect");
              return (
                <div key={s.id} className="rounded-lg border border-border bg-background/50 p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", on ? "bg-success" : "bg-destructive")} />
                      <span className="text-xs font-medium">{s.phone_number || s.instance_id || "Instância"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {on ? "conectado" : "desconectado"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRepair(s.id)}
                      disabled={repairing === s.id}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50"
                    >
                      {repairing === s.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wrench className="w-3 h-3" />
                      )}
                      Ativar evento de ligações
                    </button>
                  </div>
                  {s.webhook_url && (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[10px] bg-muted rounded px-2 py-1 truncate">{s.webhook_url}</code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(s.webhook_url!);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                          toast.success("Endereço copiado.");
                        }}
                        className="p-1 rounded border border-border hover:bg-muted"
                      >
                        {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Esse endereço só serve se você usa um servidor Evolution próprio. Com o servidor do Vanessa Simoni,
                    o botão acima já faz tudo sozinho.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Números */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Ligações (30 dias)" value={data?.stats.total ?? 0} />
        <Stat label="Atendidas" value={data?.stats.answered ?? 0} tone="success" />
        <Stat label="Perdidas" value={data?.stats.missed ?? 0} tone="destructive" />
      </div>

      {/* Configurações */}
      <div className="rounded-xl border border-border p-3 space-y-3">
        <div className="text-xs font-semibold">Configurações</div>

        <Row
          title="Registrar ligações no tracking"
          desc="Liga ou desliga a captura de chamadas deste workspace."
        >
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </Row>

        <Row
          title="Criar lead quando a ligação for perdida"
          desc="Se ninguém atender e o número ainda não estiver no CRM, o Vanessa Simoni abre o lead sozinho."
        >
          <Switch checked={createLead} onCheckedChange={setCreateLead} />
        </Row>

        {createLead && (
          <div className="grid sm:grid-cols-3 gap-2 pl-1">
            <div className="space-y-1">
              <Label className="text-[10px]">Funil</Label>
              <Select
                value={pipelineId}
                onValueChange={(v) => {
                  setPipelineId(v);
                  setStageId(NONE);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Escolher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem funil</SelectItem>
                  {(data?.pipelines ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Etapa</Label>
              <Select value={stageId} onValueChange={setStageId} disabled={pipelineId === NONE}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Escolher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Primeira etapa</SelectItem>
                  {stagesOfPipeline.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Etiqueta do lead</Label>
              <Input value={tag} onChange={(e) => setTag(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        )}

        <Row
          title="Responder automaticamente quem ligou e não foi atendido"
          desc="O próprio WhatsApp conectado manda a mensagem em seguida, dentro da conversa."
        >
          <Switch checked={autoReply} onCheckedChange={setAutoReply} />
        </Row>

        {autoReply && (
          <Textarea
            value={replyMsg}
            onChange={(e) => setReplyMsg(e.target.value)}
            rows={3}
            className="text-xs"
            placeholder="Mensagem enviada logo após a ligação perdida"
          />
        )}

        <Row
          title="Duração mínima para contar como atendida"
          desc="Chamada mais curta que isso entra no relatório como perdida."
        >
          <Input
            type="number"
            min={0}
            max={600}
            value={minDur}
            onChange={(e) => setMinDur(Number(e.target.value))}
            className="h-8 w-20 text-xs"
          />
        </Row>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar configurações
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || connected.length === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Importar ligações agora
          </button>
        </div>
        {data?.settings?.last_sync_at && (
          <p className="text-[10px] text-muted-foreground">
            Última importação: {new Date(data.settings.last_sync_at).toLocaleString("pt-BR")}
          </p>
        )}
      </div>

      {/* Teste */}
      <div className="rounded-xl border border-border p-3 space-y-2">
        <div className="text-xs font-semibold">Testar sem depender de ninguém ligar</div>
        <p className="text-[11px] text-muted-foreground">
          Coloque um número com DDD e gere uma ligação perdida de mentira. Serve para conferir se o lead
          nasce no funil certo e se o card aparece no feed.
        </p>
        <div className="flex gap-2">
          <Input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="22999998888"
            className="h-8 text-xs"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted disabled:opacity-50 shrink-0"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Beaker className="w-3.5 h-3.5" />}
            Gerar teste
          </button>
        </div>
      </div>

      {/* Últimas ligações */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 text-xs font-semibold border-b border-border">Últimas ligações</div>
        {(data?.calls ?? []).length === 0 ? (
          <p className="p-3 text-[11px] text-muted-foreground">
            Nada registrado ainda. Assim que alguém ligar para o WhatsApp conectado, a chamada aparece aqui.
          </p>
        ) : (
          <div className="divide-y divide-border max-h-64 overflow-y-auto">
            {(data?.calls ?? []).map((c) => {
              const answered = (c.duration_seconds ?? 0) > 0;
              return (
                <div key={c.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    {answered ? (
                      <PhoneCall className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <PhoneMissed className="w-3.5 h-3.5 text-destructive" />
                    )}
                    <div>
                      <div className="text-[11px] font-medium">{c.phone_normalized || c.from_number}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {c.started_at ? new Date(c.started_at).toLocaleString("pt-BR") : "sem data"}
                        {c.lead_id ? " · lead no CRM" : ""}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {answered ? `${c.duration_seconds}s` : "perdida"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "destructive" }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div
        className={cn(
          "text-lg font-semibold",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[11.5px] font-medium">{title}</div>
        <div className="text-[10.5px] text-muted-foreground">{desc}</div>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
