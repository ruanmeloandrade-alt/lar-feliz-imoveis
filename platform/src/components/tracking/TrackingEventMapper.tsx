import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MousePointerClick, Plus, Trash2, Clock, ArrowDownWideNarrow, Link2, FileInput, Loader2 } from "lucide-react";
import { ModuleSection } from "@/components/modules/ModuleShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getActiveWorkspace } from "@/lib/workspace.functions";
import { listTrackingSites } from "@/lib/tracking.functions";
import { listEventRules, upsertEventRule, deleteEventRule } from "@/lib/tracking-rules.functions";

type Rule = {
  id: string;
  name: string;
  event_name: string;
  trigger_type: string;
  selector: string | null;
  match_text: string | null;
  url_contains: string | null;
  threshold: number | null;
  value: number | null;
  once_per_session: boolean;
  active: boolean;
  site_id: string | null;
};

const TRIGGERS = [
  { id: "click", label: "Clique em elemento", Icon: MousePointerClick, hint: "Dispara quando alguém clica num botão/link do seu site." },
  { id: "form",  label: "Envio de formulário", Icon: FileInput, hint: "Dispara quando um formulário é enviado." },
  { id: "url",   label: "Visita a URL",        Icon: Link2, hint: "Dispara ao abrir uma página cuja URL contém o texto informado." },
  { id: "scroll",label: "Rolagem da página",   Icon: ArrowDownWideNarrow, hint: "Capturado automaticamente pelo pixel nos marcos padrão." },
  { id: "time",  label: "Tempo na página",     Icon: Clock, hint: "Capturado automaticamente pelo pixel nos marcos padrão." },
] as const;

const CREATABLE_TRIGGERS = TRIGGERS.filter((trigger) => ["click", "form", "url"].includes(trigger.id));

const AUTO_EVENTS = [
  "page_view", "page_leave", "scroll_depth", "time_on_page", "click",
  "outbound_click", "whatsapp_click", "phone_click", "email_click",
  "form_submit", "video_play", "video_complete",
];

export function TrackingEventMapper() {
  const qc = useQueryClient();
  const { data: ws } = useQuery({ queryKey: ["active-workspace"], queryFn: () => getActiveWorkspace() });
  const workspaceId = ws?.id ?? "";

  const { data: sites = [] } = useQuery({
    queryKey: ["tracking-sites", workspaceId],
    queryFn: () => listTrackingSites({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["tracking-event-rules", workspaceId],
    queryFn: () => listEventRules({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });

  const [form, setForm] = useState({
    name: "",
    eventName: "",
    triggerType: "click" as (typeof CREATABLE_TRIGGERS)[number]["id"],
    selector: "",
    matchText: "",
    urlContains: "",
    value: "",
    siteId: "all",
    oncePerSession: false,
  });

  const save = useMutation({
    mutationFn: () =>
      upsertEventRule({
        data: {
          workspaceId,
          siteId: form.siteId === "all" ? null : form.siteId,
          name: form.name.trim(),
          eventName: form.eventName.trim().toLowerCase().replace(/\s+/g, "_"),
          triggerType: form.triggerType,
          selector: form.selector.trim() || null,
          matchText: form.matchText.trim() || null,
          urlContains: form.urlContains.trim() || null,
          value: form.value ? Number(form.value) : null,
          oncePerSession: form.oncePerSession,
          active: true,
        },
      }),
    onSuccess: () => {
      toast.success("Regra criada, já vale nas próximas visitas do site.");
      setForm({ name: "", eventName: "", triggerType: "click", selector: "", matchText: "", urlContains: "", value: "", siteId: "all", oncePerSession: false });
      qc.invalidateQueries({ queryKey: ["tracking-event-rules", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteEventRule({ data: { workspaceId, id } }),
    onSuccess: () => {
      toast.success("Regra removida.");
      qc.invalidateQueries({ queryKey: ["tracking-event-rules", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trigger = TRIGGERS.find((t) => t.id === form.triggerType)!;
  const canSave = !!workspaceId && form.name.trim().length > 1 && form.eventName.trim().length > 1 &&
    (form.triggerType !== "click" || !!(form.selector.trim() || form.matchText.trim())) &&
    (form.triggerType !== "url" || !!form.urlContains.trim());

  return (
    <div className="space-y-4">
      <ModuleSection title="Eventos automáticos" description="Estes o pixel captura sozinho, sem você configurar nada.">
        <div className="flex flex-wrap gap-1.5">
          {AUTO_EVENTS.map((e) => (
            <span key={e} className="text-[11px] font-mono px-2 py-0.5 rounded border border-border bg-muted/40">{e}</span>
          ))}
        </div>
      </ModuleSection>

      <ModuleSection
        title="Criar evento personalizado"
        description="Crie um evento rastreado por clique, formulário ou URL. Para ele contar como resultado, marque esse evento como conversão na aba Conversões."
      >
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px]">Nome da regra</Label>
            <Input className="h-9 text-xs" placeholder="Clique no botão Orçamento" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Nome do evento</Label>
            <Input className="h-9 text-xs font-mono" placeholder="lead_orcamento" value={form.eventName} onChange={(e) => setForm((f) => ({ ...f, eventName: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px]">Quando disparar</Label>
            <Select value={form.triggerType} onValueChange={(v) => setForm((f) => ({ ...f, triggerType: v as typeof f.triggerType }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CREATABLE_TRIGGERS.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[10.5px] text-muted-foreground">{trigger.hint}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px]">Site</Label>
            <Select value={form.siteId} onValueChange={(v) => setForm((f) => ({ ...f, siteId: v }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todos os sites</SelectItem>
                {(sites as Array<{ id: string; name: string; domain: string }>).map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{s.name} · {s.domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(form.triggerType === "click" || form.triggerType === "form") && (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Seletor CSS (opcional)</Label>
                <Input className="h-9 text-xs font-mono" placeholder="#btn-orcamento, .cta-principal" value={form.selector} onChange={(e) => setForm((f) => ({ ...f, selector: e.target.value }))} />
              </div>
              {form.triggerType === "click" && (
                <div className="space-y-1.5">
                  <Label className="text-[11px]">…ou texto do botão</Label>
                  <Input className="h-9 text-xs" placeholder="Pedir orçamento" value={form.matchText} onChange={(e) => setForm((f) => ({ ...f, matchText: e.target.value }))} />
                </div>
              )}
            </>
          )}

          {form.triggerType === "url" && (
            <div className="space-y-1.5">
              <Label className="text-[11px]">URL contém</Label>
              <Input className="h-9 text-xs font-mono" placeholder="/obrigado" value={form.urlContains} onChange={(e) => setForm((f) => ({ ...f, urlContains: e.target.value }))} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[11px]">Valor do evento (opcional)</Label>
            <Input className="h-9 text-xs" type="number" placeholder="197" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-xs font-medium">Contar só uma vez por sessão</div>
              <div className="text-[10.5px] text-muted-foreground">Evita duplicar em cliques repetidos.</div>
            </div>
            <Switch checked={form.oncePerSession} onCheckedChange={(v) => setForm((f) => ({ ...f, oncePerSession: v }))} />
          </div>
        </div>

        <div className="flex justify-end mt-3">
          <button onClick={() => save.mutate()} disabled={!canSave || save.isPending} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Criar regra
          </button>
        </div>
      </ModuleSection>

      <ModuleSection title="Regras ativas" description="O pixel busca estas regras a cada carregamento de página.">
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-4">Carregando…</div>
        ) : (rules as Rule[]).length === 0 ? (
          <div className="text-xs text-muted-foreground py-4">Nenhuma regra personalizada ainda.</div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg">
            {(rules as Rule[]).map((r) => {
              const T = TRIGGERS.find((t) => t.id === r.trigger_type) ?? TRIGGERS[0];
              return (
                <li key={r.id} className="p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-md bg-muted grid place-items-center"><T.Icon className="w-4 h-4 text-muted-foreground" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      {r.event_name} · {T.label}{r.selector ? ` · ${r.selector}` : ""}{r.match_text ? ` · "${r.match_text}"` : ""}{r.url_contains ? ` · ${r.url_contains}` : ""}
                    </div>
                  </div>
                  {r.value != null && <span className="text-[11px] text-muted-foreground">R$ {Number(r.value).toLocaleString("pt-BR")}</span>}
                  <button onClick={() => remove.mutate(r.id)} className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Excluir regra">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ModuleSection>
    </div>
  );
}
