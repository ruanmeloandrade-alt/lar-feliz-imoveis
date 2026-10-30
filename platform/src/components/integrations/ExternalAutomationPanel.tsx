import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  RefreshCw,
  Copy,
  ExternalLink,
  CheckCircle2,
  Trash2,
  Plus,
  X,
  BookOpen,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  getExternalAutomation,
  upsertExternalAutomation,
  rotateExternalAutomationSecrets,
  testExternalAutomation,
  listExternalAutomationLogs,
  deleteExternalAutomation,
  type ExternalAutomationDTO,
} from "@/lib/external-automations.functions";
import {
  EXTERNAL_EVENTS,
  EVENT_GROUP_META,
  PROVIDER_META,
  DEFAULT_AUTOMATION_OPTIONS,
  type AutomationOptions,
  type ExternalProvider,
} from "@/lib/external-automations-events";

interface Props {
  provider: ExternalProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LogRow {
  id: string;
  direction: string;
  event: string;
  httpStatus: number | null;
  status: string;
  error: string | null;
  occurredAt: string;
  payloadJson: string | null;
}

const INBOUND_ACTIONS = [
  { action: "create_lead", desc: "Cria um lead novo no CRM.", sample: { name: "Maria Silva", phone: "5522999998888", email: "maria@email.com" } },
  { action: "update_lead", desc: "Atualiza campos de um lead existente.", sample: { lead_id: "uuid-do-lead", name: "Maria S." } },
  { action: "move_stage", desc: "Move o lead para outra etapa da pipeline.", sample: { lead_id: "uuid-do-lead", stage: "Negociação" } },
  { action: "add_tag", desc: "Adiciona uma etiqueta ao lead.", sample: { lead_id: "uuid-do-lead", tag: "quente" } },
  { action: "add_note", desc: "Registra uma anotação no lead.", sample: { lead_id: "uuid-do-lead", note: "Cliente pediu proposta." } },
  { action: "create_task", desc: "Cria uma tarefa no Fluxo de Trabalho.", sample: { title: "Ligar para o lead", due_at: "2026-08-01T12:00:00Z" } },
  { action: "register_conversion", desc: "Registra uma conversão no Tracking.", sample: { event: "Purchase", value: 197.9, lead_id: "uuid-do-lead" } },
];

export function ExternalAutomationPanel({ provider, open, onOpenChange }: Props) {
  const getFn = useServerFn(getExternalAutomation);
  const upsertFn = useServerFn(upsertExternalAutomation);
  const rotateFn = useServerFn(rotateExternalAutomationSecrets);
  const testFn = useServerFn(testExternalAutomation);
  const logsFn = useServerFn(listExternalAutomationLogs);
  const deleteFn = useServerFn(deleteExternalAutomation);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [row, setRow] = useState<ExternalAutomationDTO | null>(null);
  const [outboundUrl, setOutboundUrl] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [options, setOptions] = useState<AutomationOptions>(DEFAULT_AUTOMATION_OPTIONS);
  const [testEvent, setTestEvent] = useState("saude-slim.test");
  const [testPayload, setTestPayload] = useState('{\n  "message": "Ping de teste do Vanessa Simoni"\n}');
  const [logs, setLogs] = useState<LogRow[]>([]);

  const meta = provider ? PROVIDER_META[provider] : null;

  const inboundUrl = useMemo(() => {
    if (!row || typeof window === "undefined") return "";
    return `${window.location.origin}/api/public/webhook-in/${row.provider}/${row.inboundToken}`;
  }, [row]);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, typeof EXTERNAL_EVENTS>();
    for (const ev of EXTERNAL_EVENTS) {
      if (!byGroup.has(ev.group)) byGroup.set(ev.group, []);
      byGroup.get(ev.group)!.push(ev);
    }
    return Array.from(byGroup.entries());
  }, []);

  async function refreshLogs(p: ExternalProvider) {
    try {
      const r = await logsFn({ data: { provider: p, limit: 30 } });
      setLogs(r as LogRow[]);
    } catch {
      /* silencioso */
    }
  }

  useEffect(() => {
    if (!open || !provider) return;
    setLoading(true);
    getFn({ data: { provider } })
      .then((r) => {
        setRow(r);
        setOutboundUrl(r?.outboundUrl ?? "");
        setSelected(new Set(r?.selectedEvents ?? []));
        setConnected(r?.status === "connected");
        setOptions(
          r?.options ?? {
            ...DEFAULT_AUTOMATION_OPTIONS,
            signOutbound: PROVIDER_META[provider].supportsSignature,
            requireInboundSignature: PROVIDER_META[provider].supportsSignature,
          },
        );
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Falha ao carregar."))
      .finally(() => setLoading(false));
    refreshLogs(provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider]);

  function toggleEvent(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(items: typeof EXTERNAL_EVENTS, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const ev of items) {
        if (on) next.add(ev.key);
        else next.delete(ev.key);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!provider) return;
    if (outboundUrl.trim() && !/^https?:\/\//i.test(outboundUrl.trim())) {
      toast.error("A URL precisa começar com https://");
      return;
    }
    setSaving(true);
    try {
      const updated = await upsertFn({
        data: {
          provider,
          outboundUrl: outboundUrl.trim() || null,
          selectedEvents: Array.from(selected),
          connected,
          options,
        },
      });
      setRow(updated);
      setOptions(updated.options);
      toast.success("Configuração salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRotate() {
    if (!provider) return;
    if (!confirm("Regerar token e secret invalida o webhook atual. Continuar?")) return;
    try {
      const updated = await rotateFn({ data: { provider } });
      setRow(updated);
      toast.success("Token e secret regenerados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao rotacionar.");
    }
  }

  async function handleDelete() {
    if (!provider) return;
    if (!confirm("Remover a configuração desta automação? Os disparos param na hora.")) return;
    try {
      await deleteFn({ data: { provider } });
      setRow(null);
      setOutboundUrl("");
      setSelected(new Set());
      setConnected(false);
      setLogs([]);
      toast.success("Automação removida.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover.");
    }
  }

  async function handleTest() {
    if (!provider) return;
    if (!outboundUrl.trim()) {
      toast.error("Cole a URL do webhook e salve antes de testar.");
      return;
    }
    setTesting(true);
    try {
      await testFn({ data: { provider, event: testEvent, payloadJson: testPayload } });
      toast.success("Evento de teste enviado. Confira o log.");
      await refreshLogs(provider);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no teste.");
    } finally {
      setTesting(false);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${label} copiado.`))
      .catch(() => toast.error("Falha ao copiar."));
  }

  if (!provider || !meta) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Automação {meta.label}
            {row?.status === "connected" ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="w-3 h-3" /> Conectado
              </Badge>
            ) : (
              <Badge variant="outline">Desconectado</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Envia eventos do Vanessa Simoni para o {meta.label} (saída) e recebe ações de volta (entrada). {meta.docHint}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="guia" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="guia">Guia</TabsTrigger>
              <TabsTrigger value="saida">Saída</TabsTrigger>
              <TabsTrigger value="eventos">Eventos</TabsTrigger>
              <TabsTrigger value="entrada">Entrada</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            {/* GUIA */}
            <TabsContent value="guia" className="space-y-4 pt-4">
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BookOpen className="w-4 h-4 text-primary" /> Como conectar o {meta.label}
                </div>
                <ol className="space-y-2 text-xs text-muted-foreground list-decimal pl-4">
                  {meta.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                {meta.docUrl && (
                  <a
                    href={meta.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> Documentação oficial do {meta.label}
                  </a>
                )}
              </div>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="text-sm font-semibold">Boas práticas</div>
                <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                  {meta.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="text-sm font-semibold">Formato do payload enviado</div>
                <pre className="text-[11px] bg-muted rounded p-3 overflow-x-auto">
{`{
  "event": "lead.created",
  "workspace_id": "uuid-do-workspace",
  "occurred_at": "2026-07-27T12:00:00.000Z",
  "data": { "...": "campos do evento" }
}`}
                </pre>
              </div>
            </TabsContent>

            {/* SAÍDA */}
            <TabsContent value="saida" className="space-y-5 pt-4">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">URL de destino</h3>
                <p className="text-xs text-muted-foreground">
                  Cole a URL do webhook do {meta.label}. Os eventos marcados na aba Eventos serão enviados para lá.
                </p>
                <Input
                  value={outboundUrl}
                  onChange={(e) => setOutboundUrl(e.target.value)}
                  placeholder={meta.outboundPlaceholder}
                />
                <div className="flex items-center gap-2">
                  <Checkbox id="conn" checked={connected} onCheckedChange={(v) => setConnected(v === true)} />
                  <label htmlFor="conn" className="text-sm cursor-pointer">
                    Ativar disparo (marcar como conectado)
                  </label>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Segurança e entrega</h3>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="pr-4">
                    <Label className="text-xs font-medium">Assinar o payload (HMAC-SHA256)</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Envia assinatura HMAC-SHA256 para o destino validar a origem.
                    </p>
                  </div>
                  <Switch
                    checked={options.signOutbound}
                    onCheckedChange={(v) => setOptions((o) => ({ ...o, signOutbound: v }))}
                  />
                </div>

                {row?.inboundSecret && options.signOutbound && (
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Secret HMAC:</span>
                      <button className="text-primary flex items-center gap-1" onClick={() => copy(row.inboundSecret, "Secret")}>
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                    </div>
                    <code className="block break-all text-muted-foreground">{row.inboundSecret}</code>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Header de autenticação (opcional)</Label>
                    <Input
                      value={options.authHeaderName}
                      onChange={(e) => setOptions((o) => ({ ...o, authHeaderName: e.target.value }))}
                      placeholder="Authorization"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor do header</Label>
                    <Input
                      value={options.authHeaderValue}
                      onChange={(e) => setOptions((o) => ({ ...o, authHeaderValue: e.target.value }))}
                      placeholder="Bearer abc123..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Headers extras</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() =>
                        setOptions((o) => ({ ...o, extraHeaders: [...o.extraHeaders, { key: "", value: "" }].slice(0, 10) }))
                      }
                    >
                      <Plus className="w-3 h-3" /> Adicionar
                    </Button>
                  </div>
                  {options.extraHeaders.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Use quando a plataforma de destino exigir cabeçalhos próprios, como X-Api-Key.
                    </p>
                  ) : (
                    options.extraHeaders.map((h, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          className="h-8 text-xs"
                          value={h.key}
                          placeholder="Nome"
                          onChange={(e) =>
                            setOptions((o) => {
                              const arr = [...o.extraHeaders];
                              arr[idx] = { ...arr[idx], key: e.target.value };
                              return { ...o, extraHeaders: arr };
                            })
                          }
                        />
                        <Input
                          className="h-8 text-xs"
                          value={h.value}
                          placeholder="Valor"
                          onChange={(e) =>
                            setOptions((o) => {
                              const arr = [...o.extraHeaders];
                              arr[idx] = { ...arr[idx], value: e.target.value };
                              return { ...o, extraHeaders: arr };
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() =>
                            setOptions((o) => ({ ...o, extraHeaders: o.extraHeaders.filter((_, i) => i !== idx) }))
                          }
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Novas tentativas em caso de erro</Label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        size="sm"
                        variant={options.retries === n ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setOptions((o) => ({ ...o, retries: n }))}
                      >
                        {n === 0 ? "Nenhuma" : `${n}x`}
                      </Button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">Enviar teste</h3>
                <div className="space-y-2">
                  <Input value={testEvent} onChange={(e) => setTestEvent(e.target.value)} placeholder="saude-slim.test" />
                  <Textarea
                    value={testPayload}
                    onChange={(e) => setTestPayload(e.target.value)}
                    rows={5}
                    className="font-mono text-xs"
                  />
                  <Button onClick={handleTest} disabled={testing} size="sm" className="gap-1.5">
                    {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Disparar teste agora
                  </Button>
                </div>
              </section>
            </TabsContent>

            {/* EVENTOS */}
            <TabsContent value="eventos" className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {selected.size === 0
                    ? "Nenhum evento marcado: nada será enviado."
                    : `${selected.size} evento(s) selecionado(s).`}
                </p>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
                  Limpar tudo
                </Button>
              </div>
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
                {grouped.map(([groupKey, items]) => {
                  const allOn = items.every((i) => selected.has(i.key));
                  return (
                    <div key={groupKey}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                          {EVENT_GROUP_META[groupKey as keyof typeof EVENT_GROUP_META].label.toUpperCase()}
                        </div>
                        <button
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => toggleGroup(items, !allOn)}
                        >
                          {allOn ? "Desmarcar grupo" : "Marcar grupo"}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {items.map((ev) => (
                          <label
                            key={ev.key}
                            className="flex items-start gap-2 rounded border border-border bg-card p-2 text-xs cursor-pointer hover:border-primary/40"
                          >
                            <Checkbox checked={selected.has(ev.key)} onCheckedChange={() => toggleEvent(ev.key)} />
                            <div className="min-w-0">
                              <div className="font-medium truncate">{ev.label}</div>
                              <div className="text-muted-foreground truncate">{ev.hint}</div>
                              <code className="text-[10px] text-muted-foreground/70">{ev.key}</code>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* ENTRADA */}
            <TabsContent value="entrada" className="space-y-4 pt-4">
              {!row ? (
                <div className="rounded-md border border-dashed p-6 text-xs text-muted-foreground text-center">
                  Salve a configuração primeiro para gerar a URL de entrada.
                </div>
              ) : (
                <>
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">URL de entrada ({meta.label} para Vanessa Simoni):</span>
                      <button className="text-primary flex items-center gap-1" onClick={() => copy(inboundUrl, "URL")}>
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                    </div>
                    <code className="block break-all text-muted-foreground">{inboundUrl}</code>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-border p-3">
                    <div className="pr-4">
                      <Label className="text-xs font-medium">Exigir assinatura na entrada</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Se desligado, o token secreto da URL já autentica a chamada. Útil para plataformas que não
                        conseguem calcular HMAC, como o Zapier.
                      </p>
                    </div>
                    <Switch
                      checked={options.requireInboundSignature}
                      onCheckedChange={(v) => setOptions((o) => ({ ...o, requireInboundSignature: v }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Ações disponíveis</div>
                    <p className="text-[11px] text-muted-foreground">
                      Envie POST JSON com o corpo {`{ "action": "...", "data": { ... } }`}.
                    </p>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {INBOUND_ACTIONS.map((a) => (
                        <div key={a.action} className="rounded border border-border p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <code className="font-medium">{a.action}</code>
                            <button
                              className="text-primary flex items-center gap-1 text-[11px]"
                              onClick={() =>
                                copy(JSON.stringify({ action: a.action, data: a.sample }, null, 2), "Exemplo")
                              }
                            >
                              <Copy className="w-3 h-3" /> Exemplo
                            </button>
                          </div>
                          <div className="text-muted-foreground">{a.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleRotate} className="gap-1.5">
                      <RefreshCw className="w-3 h-3" /> Regerar token e secret
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleDelete} className="gap-1.5 text-destructive">
                      <Trash2 className="w-3 h-3" /> Remover automação
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* LOGS */}
            <TabsContent value="logs" className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Últimos eventos</h3>
                <Button variant="ghost" size="sm" onClick={() => refreshLogs(provider)} className="gap-1.5">
                  <RefreshCw className="w-3 h-3" /> Atualizar
                </Button>
              </div>
              {logs.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-xs text-muted-foreground text-center">
                  Sem eventos ainda. Envie um teste na aba Saída.
                </div>
              ) : (
                <div className="rounded-md border border-border max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Quando</th>
                        <th className="text-left p-2">Direção</th>
                        <th className="text-left p-2">Evento</th>
                        <th className="text-left p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="p-2 whitespace-nowrap text-muted-foreground">
                            {new Date(l.occurredAt).toLocaleString("pt-BR")}
                          </td>
                          <td className="p-2">{l.direction === "outbound" || l.direction === "out" ? "Saída" : "Entrada"}</td>
                          <td className="p-2 font-mono">{l.event}</td>
                          <td className="p-2">
                            {l.status === "ok" ? (
                              <Badge variant="outline" className="text-[10px]">
                                {l.httpStatus ?? "OK"}
                              </Badge>
                            ) : (
                              <span className="text-destructive">{l.error ?? `Erro ${l.httpStatus ?? ""}`}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Salvar configuração
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
