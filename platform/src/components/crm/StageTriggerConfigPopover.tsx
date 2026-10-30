import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, X, ChevronDown, Pencil } from "lucide-react";
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/components/ui/popover";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuCheckboxItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
 ActiveMode,
 AutomationAction,
 ConditionField,
 ConditionOp,
 ExecutionCondition,
 ExecutionConfig,
 TriggerKind,
 TriggerSpec,
} from "@/lib/crm-mock";
import { normalizeTrigger } from "@/lib/crm-mock";
import { listConnectedLeadSources, listWorkspaceUsers } from "@/lib/crm.functions";
import { listLeadCustomFields } from "@/lib/leads.functions";

const ACTIVE_OPTIONS: { value: ActiveMode; label: string }[] = [
 { value: "always", label: "sempre" },
 { value: "business-hours", label: "apenas em horário comercial" },
 { value: "custom", label: "personalizado" },
];

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MESSAGE_CHANNELS = new Set(["whatsapp", "instagram", "facebook", "telegram"]);

const UTM_FIELDS: { field: ConditionField; label: string }[] = [
 { field: "utm_source", label: "utm_source" },
 { field: "utm_medium", label: "utm_medium" },
 { field: "utm_campaign", label: "utm_campaign" },
 { field: "utm_content", label: "utm_content" },
 { field: "utm_term", label: "utm_term" },
 { field: "utm_referrer", label: "utm_referrer" },
];

function defaultExecution(): ExecutionConfig {
 return {
  trigger: { kind: "created-or-moved" },
  delayMinutes: 0,
  active: "always",
  conditions: [],
  sourceFilter: [],
  leaveUnanswered: false,
  applyToExisting: false,
 };
}


function defaultOp(field: ConditionField): ConditionOp {
 if (field === "value") return "gt";
 if (field === "no-tag") return "eq";
 if (field === "assignee") return "eq";
 return "contains";
}

function labelForField(field: ConditionField, customName?: string): string {
 switch (field) {
  case "tag": return "Tag";
  case "no-tag": return "Sem tag";
  case "assignee": return "Responsável";
  case "value": return "Venda";
  case "custom-field": return customName ?? "Campo personalizado";
  case "source": return "Fonte";
  case "name": return "Nome";
  case "email": return "E-mail";
  case "phone": return "Telefone";
  default: return field;
 }
}

/** Seletor nativo: não abre um portal fora do editor de gatilho. */
function PickerSelect({
 prefix,
 value,
 options,
 onChange,
 className,
}: {
 prefix?: string;
 value: string;
 options: { value: string; label: string }[];
 onChange: (value: string) => void;
 className?: string;
}) {
 return (
  <select aria-label={prefix || "Selecionar opção"} value={value}
   className={cn("w-full h-8 min-w-0 rounded border border-border bg-background px-2 text-xs text-foreground",className)}
   onClick={e=>e.stopPropagation()} onChange={e=>onChange(e.target.value)}>
   {!options.some(o=>o.value===value) && <option value="">Selecionar</option>}
   {options.map(o=><option key={o.value} value={o.value}>{prefix ? `${prefix} ${o.label}` : o.label}</option>)}
  </select>
 );
}

export function StageTriggerConfigPopover({

 open,
 onOpenChange,
 action,
 anchor,
 onSave,
 onRemove,
 onEditAction,
}: {
 open: boolean;
 onOpenChange: (o: boolean) => void;
 action: AutomationAction;
 anchor: React.ReactNode;
  onSave: (execution: ExecutionConfig) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
  onEditAction?: () => void;
}) {
  const [draft, setDraft] = useState<ExecutionConfig>(() => ({
    ...defaultExecution(),
    ...(action.execution ?? {}),
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

 useEffect(() => {
  if (!open) return;
  setSaveError(null);
  setDraft({
   ...defaultExecution(),
   ...(action.execution ?? {}),
  });
 }, [action.id, action.execution, open]);

 const listSources = useServerFn(listConnectedLeadSources);
 const listCustomFields = useServerFn(listLeadCustomFields);
 const loadUsers = useServerFn(listWorkspaceUsers);
 const usersQ = useQuery({queryKey:["stage-trigger-users",action.id],queryFn:()=>loadUsers({}),enabled:open,staleTime:0,gcTime:0});
 const sourcesQ = useQuery({
  queryKey: ["connected-lead-sources"],
  queryFn: () => listSources({}),
  enabled: open,
  staleTime: 60_000,
 });
 const customFieldsQ = useQuery({
  queryKey: ["lead-custom-fields"],
  queryFn: () => listCustomFields({}),
  enabled: open,
  staleTime: 60_000,
 });
 const sources = sourcesQ.data?.sources ?? [];
 const customFields = customFieldsQ.data?.fields ?? [];

 function update<K extends keyof ExecutionConfig>(key: K, value: ExecutionConfig[K]) {
  setDraft((prev) => ({ ...prev, [key]: value }));
 }

 function addCondition(cond: ExecutionCondition) {
  update("conditions", [...(draft.conditions ?? []), cond]);
 }
 function updateCondition(i: number, patch: Partial<ExecutionCondition>) {
  const list = [...(draft.conditions ?? [])];
  list[i] = { ...list[i], ...patch };
  update("conditions", list);
 }
 function removeCondition(i: number) {
  update("conditions", (draft.conditions ?? []).filter((_, idx) => idx !== i));
 }

 function toggleSource(id: string) {
  const cur = draft.sourceFilter ?? [];
  update("sourceFilter", cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]);
 }

 const activeWindows: Array<{ days: number[]; from: string; to: string }> =
  draft.activeWindows?.length
   ? draft.activeWindows
   : draft.activeWindow
    ? [draft.activeWindow]
    : [{ days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" }];

 function setWindows(next: Array<{ days: number[]; from: string; to: string }>) {
  setDraft((prev) => ({ ...prev, activeWindows: next, activeWindow: next[0] }));
 }
 function patchWindow(i: number, patch: Partial<{ days: number[]; from: string; to: string }>) {
  setWindows(activeWindows.map((w, j) => (j === i ? { ...w, ...patch } : w)));
 }
 function toggleDay(i: number, day: number) {
  const win = activeWindows[i];
  const days = win.days.includes(day) ? win.days.filter((d) => d !== day) : [...win.days, day].sort();
  patchWindow(i, { days });
 }


 const showLeaveUnanswered =
  MESSAGE_CHANNELS.has(action.channel) || action.config?.kind === "salesbot";
 const isSalesbot = action.config?.kind === "salesbot";
 const isAgenteIa = action.config?.kind === "executar-ia";
 const navigate = useNavigate();
 const selectedTargetId =
  action.config?.kind === "salesbot"
   ? action.config.botId
   : action.config?.kind === "executar-ia"
    ? action.config.agentId
    : undefined;
 const selectedTargetName =
  action.config?.kind === "salesbot"
   ? action.config.botNome
   : action.config?.kind === "executar-ia"
    ? action.config.agentNome
    : undefined;
 const selectedSourceIds = new Set(draft.sourceFilter ?? []);
 const hasAnyRule = (draft.conditions?.length ?? 0) > 0 || (draft.sourceFilter?.length ?? 0) > 0;
  const normalizedTrigger = normalizeSupportedTrigger(draft.trigger);

 function canonicalFieldByIdOrName(fieldId?: string, fieldName?: string) {
  const byId = fieldId ? customFields.find((field) => field.id === fieldId) : undefined;
  if (byId) return byId;
  const wantedName = String(fieldName ?? "").trim().toLocaleLowerCase();
  if (!wantedName) return undefined;
  return customFields.find((field) => field.name.trim().toLocaleLowerCase() === wantedName);
 }

 function validatedDraft(): ExecutionConfig {
  let trigger = normalizeSupportedTrigger(draft.trigger);
  if (!Number.isFinite(Number(draft.delayMinutes ?? 0)) || Number(draft.delayMinutes ?? 0) < 0) throw new Error("Informe um tempo válido.");
  if (trigger.kind === "created-or-moved" && draft.delayUnit && Number(draft.delayMinutes ?? 0) <= 0) throw new Error("Informe um tempo maior que zero para aguardar na etapa.");
  if (trigger.kind === "daily" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(trigger.time)) throw new Error("Escolha o horário da execução diária.");
  if (trigger.kind === "exact-datetime" && (!trigger.at || !Number.isFinite(new Date(trigger.at).getTime()) || new Date(trigger.at).getTime() <= Date.now())) throw new Error("Escolha uma data e hora futuras.");
  if (draft.active === "custom" && !(draft.activeWindows?.length ? draft.activeWindows : draft.activeWindow ? [draft.activeWindow] : []).some(w=>w.days.length && /^([01]\d|2[0-3]):[0-5]\d$/.test(w.from) && /^([01]\d|2[0-3]):[0-5]\d$/.test(w.to) && w.from!==w.to)) throw new Error("Configure os dias e horários do período personalizado.");

  if (trigger.kind === "field-updated") {
   if (trigger.fieldId || trigger.fieldName) {
    const field = canonicalFieldByIdOrName(trigger.fieldId, trigger.fieldName);
    if (!field) throw new Error("O campo personalizado escolhido não existe mais nesta conta.");
    trigger = {
     kind: "field-updated",
     entity: "lead",
     fieldId: field.id,
     fieldName: field.name,
    };
   } else {
    trigger = { kind: "field-updated", entity: "lead" };
   }
  }

  if (trigger.kind === "hours-before-field") {
   const field = canonicalFieldByIdOrName(trigger.fieldId, trigger.fieldName);
   if (!field) throw new Error("Escolha o campo de data/hora usado para o agendamento.");
   if (!["date", "datetime", "birthday"].includes(String(field.fieldType ?? "").toLowerCase())) {
    throw new Error(`O campo "${field.name}" não é do tipo data/data e hora.`);
   }
   trigger = {
    kind: "hours-before-field",
    hours: Math.max(0, Number(trigger.hours ?? 0)),
    fieldId: field.id,
    fieldName: field.name,
   };
  }

  const conditions = (draft.conditions ?? []).map((condition) => {
   if (condition.field !== "custom-field") return condition;
   const field = canonicalFieldByIdOrName(condition.customFieldId, condition.customFieldNome);
   if (!field) {
    throw new Error(`A condição de campo personalizado "${condition.customFieldNome ?? "sem nome"}" não é mais válida.`);
   }
   return {
    ...condition,
    customFieldId: field.id,
    customFieldNome: field.name,
   };
  });

  return {
   ...draft,
   trigger,
   conditions,
  };
 }

 async function saveExecution() {
  if (isSaving) return;
  setIsSaving(true);
  setSaveError(null);
  try {
   const next = validatedDraft();
   await onSave(next);
   setDraft(next);
   onOpenChange(false);
  } catch (error) {
   setSaveError(error instanceof Error ? error.message : "Não foi possível salvar o gatilho.");
  } finally {
   setIsSaving(false);
  }
 }

 return (
  <Popover open={open} onOpenChange={onOpenChange}>
   <PopoverTrigger asChild>{anchor}</PopoverTrigger>
   <PopoverContent
    align="start"
    side="bottom"
    sideOffset={8}
    collisionPadding={12}
    className="z-[90] flex w-[400px] max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] flex-col overflow-hidden p-0 border-border bg-popover"
    onClick={(e) => e.stopPropagation()}
    onOpenAutoFocus={(e) => e.preventDefault()}
    onPointerDownOutside={(e) => {
     const target = e.target as HTMLElement | null;
     if (target?.closest("[data-radix-popper-content-wrapper],[role='listbox'],[role='menu'],[data-radix-select-viewport]")) {
      e.preventDefault();
     }
    }}
    onFocusOutside={(e) => {
     const target = e.target as HTMLElement | null;
     if (target?.closest("[data-radix-popper-content-wrapper],[role='listbox'],[role='menu']")) {
      e.preventDefault();
     }
    }}
    onInteractOutside={(e) => {
     const target = e.target as HTMLElement | null;
     if (target?.closest("[data-radix-popper-content-wrapper],[role='listbox'],[role='menu']")) {
      e.preventDefault();
     }
    }}
   >
    <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
     {/* Filtros de lead */}
     <div className="space-y-2">
      <div className="text-xs font-semibold text-foreground">Para todos os leads com:</div>

      {/* Fonte, só aparece se houver alguma conectada */}
      {sources.length > 0 && (
       <div className="space-y-1.5">
        <label className="text-[10px] text-muted-foreground">Fonte</label>
        <DropdownMenu modal={false}>
         <DropdownMenuTrigger asChild>
          <button className="w-full min-h-[32px] flex flex-wrap items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:border-primary/40">
           {selectedSourceIds.size === 0 ? (
            <span className="text-muted-foreground">Qualquer fonte conectada</span>
           ) : (
            sources
             .filter((s) => selectedSourceIds.has(s.id))
             .map((s) => (
              <Badge
               key={s.id}
               variant="secondary"
               className="text-[10px] gap-1"
              >
               {s.label}
               <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); toggleSource(s.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSource(s.id); } }}
                className="hover:text-destructive cursor-pointer"
                aria-label="Remover fonte"
               >
                <X className="w-2.5 h-2.5" />
               </span>
              </Badge>
             ))
           )}
           <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground" />
          </button>
         </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[300px] z-[100]">
          {sources.map((s) => (
           <DropdownMenuCheckboxItem
            key={s.id}
            checked={selectedSourceIds.has(s.id)}
            onCheckedChange={() => toggleSource(s.id)}
            onSelect={(e) => { e.preventDefault(); }}
            className="text-xs"
           >
            {s.label}
           </DropdownMenuCheckboxItem>
          ))}
         </DropdownMenuContent>
        </DropdownMenu>
       </div>
      )}

      {/* Condições SE */}
      {(draft.conditions ?? []).map((c, i) => (
       <div key={i} className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase w-5">SE</span>
        <span className="text-[10px] rounded border border-border bg-muted/30 px-1.5 py-0.5 whitespace-nowrap">
         {labelForField(c.field, c.customFieldNome)}
        </span>
        {c.field !== "no-tag" && (
         <PickerSelect
          className="w-[90px] h-7"
          value={c.op}
          options={[
           { value: "eq", label: "é" },
           { value: "neq", label: "não é" },
           { value: "contains", label: "contém" },
           ...(c.field === "value"
            ? [
              { value: "gt", label: "maior que" },
              { value: "lt", label: "menor que" },
             ]
            : []),
          ]}
          onChange={(v) => updateCondition(i, { op: v as ConditionOp })}
         />
        )}

        {c.field === "assignee" ? <PickerSelect value={c.value} className="flex-1"
         options={(usersQ.data?.users ?? []).map(u=>({value:u.id,label:u.name}))}
         onChange={value=>updateCondition(i,{value})} /> : <Input
         value={c.value}
         onChange={(e) => updateCondition(i, { value: e.target.value })}
         className="h-7 text-[11px] flex-1"
         placeholder={c.field === "no-tag" ? "(qualquer)" : "valor"}
         type={c.field === "value" ? "number" : "text"}
        />}
        <button
         onClick={() => removeCondition(i)}
         className="text-muted-foreground hover:text-destructive"
         aria-label="Remover condição"
        >
         <X className="w-3.5 h-3.5" />
        </button>
       </div>
      ))}

      {/* Menu SE, Adicionar uma condição */}
      <DropdownMenu modal={false}>
       <DropdownMenuTrigger asChild>
        <button className="w-full text-left text-xs text-muted-foreground hover:text-foreground rounded border border-dashed border-border px-2 py-1.5 inline-flex items-center gap-1.5">
         <Plus className="w-3 h-3" /> Adicionar uma condição
        </button>
       </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px] max-h-[300px] overflow-y-auto z-[100]">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">Lead</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => addCondition({ field: "tag", op: "contains", value: "" })}>Tags</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => addCondition({ field: "assignee", op: "eq", value: "" })}>Usuário responsável</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => addCondition({ field: "value", op: "gt", value: "" })}>Venda</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => addCondition({ field: "no-tag", op: "eq", value: "" })}>Sem tags</DropdownMenuItem>
        {customFields.length > 0 && (
         <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] text-muted-foreground">Campos personalizados</DropdownMenuLabel>
          {customFields.map((f) => (
           <DropdownMenuItem
            key={f.id}
            onSelect={() => addCondition({
             field: "custom-field",
             op: "eq",
             value: "",
             customFieldId: f.id,
             customFieldNome: f.name,
            })}
           >
            {f.name}
           </DropdownMenuItem>
          ))}
         </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">UTM</DropdownMenuLabel>
        {UTM_FIELDS.map((u) => (
         <DropdownMenuItem
          key={u.field}
          onSelect={() => addCondition({ field: u.field, op: defaultOp(u.field), value: "" })}
         >
          {u.label}
         </DropdownMenuItem>
        ))}
       </DropdownMenuContent>
      </DropdownMenu>

      {!hasAnyRule && (
       <p className="text-[10px] text-muted-foreground leading-tight italic">
        Sem condições, dispara sempre que o lead cair nesta etapa.
       </p>
      )}
     </div>

     {/* Executar + Quando (bloco único) */}
     <div className="space-y-1.5">
      <ExecutionTiming
       spec={normalizedTrigger}
       delayMinutes={draft.delayMinutes ?? 0}
       customFields={customFields.map((f) => ({ id: f.id, name: f.name, fieldType: f.fieldType }))}
       onTriggerChange={(spec) => update("trigger", spec)}
       delayUnit={draft.delayUnit}
       onDelayChange={(minutes, unit, clearUnit) => setDraft(prev=>({...prev,delayMinutes:minutes,...(clearUnit?{delayUnit:undefined}:unit?{delayUnit:unit}:{})}))}
      />
      <p className="text-[10px] text-muted-foreground leading-tight">
       A mensagem será enviada aos contatos que se comunicaram com você nos aplicativos de mensagens que você integrou.
      </p>
     </div>



     {/* Ativo */}
     <div className="space-y-2">
      <PickerSelect
       prefix="Ativo:"
       value={draft.active ?? "always"}
       options={ACTIVE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
       onChange={(v) => {
        update("active", v as ActiveMode);
        if (v === "custom" && !(draft.activeWindows?.length)) {
         update("activeWindows", [{ days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" }]);
        }
       }}
      />
      {draft.active === "custom" && (
       <div className="space-y-2">
        {activeWindows.map((win, wi) => (
         <div key={wi} className="space-y-2 rounded border border-border p-2">
          <div className="flex items-center justify-between">
           <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Período {wi + 1}
           </span>
           {activeWindows.length > 1 && (
            <button
             type="button"
             onClick={() => setWindows(activeWindows.filter((_, j) => j !== wi))}
             className="text-destructive/70 hover:text-destructive p-1"
             title="Remover período"
            >
             <Trash2 className="w-3 h-3" />
            </button>
           )}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
           {DAY_LABELS.map((d, i) => {
            const on = win.days.includes(i);
            return (
             <button
              key={i}
              type="button"
              onClick={() => toggleDay(wi, i)}
              className={cn(
               "text-[10px] h-6 px-1.5 rounded border",
               on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground",
              )}
             >
              {d}
             </button>
            );
           })}
          </div>
          <div className="flex items-center gap-2">
           <Input
            type="time"
            value={win.from}
            onChange={(e) => patchWindow(wi, { from: e.target.value })}
            className="h-8 text-xs"
           />
           <span className="text-xs text-muted-foreground">até</span>
           <Input
            type="time"
            value={win.to}
            onChange={(e) => patchWindow(wi, { to: e.target.value })}
            className="h-8 text-xs"
           />
          </div>
         </div>
        ))}
        <button
         type="button"
         onClick={() => setWindows([...activeWindows, { days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" }])}
         className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10"
        >
         <Plus className="w-3 h-3" /> Adicionar período
        </button>
       </div>
      )}
     </div>


     {showLeaveUnanswered && (
      <div className="flex items-start justify-between gap-3">
       <div className="min-w-0">
        <div className="text-xs font-semibold">Deixar mensagem sem resposta</div>
        <p className="text-[10px] text-muted-foreground leading-tight">
         As mensagens às quais o bot responde serão marcadas como não respondidas.
        </p>
       </div>
       <Switch
        checked={!!draft.leaveUnanswered}
        onCheckedChange={(v) => update("leaveUnanswered", v)}
       />
      </div>
     )}

     {onEditAction && (isSalesbot || isAgenteIa) && (
      <div className="rounded border border-border bg-background p-2 space-y-2">
       <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">
         {isSalesbot ? "Escolher SalesBot" : "Escolher Agente IA"}
        </span>
        <div className="flex items-center gap-1">
         <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          disabled={!selectedTargetId}
          onClick={() => {
           onOpenChange(false);
           navigate({
            to: isSalesbot ? "/crm/automacoes" : "/crm/agente-ia",
            search: (isSalesbot
             ? { bot: selectedTargetId }
             : { agente: selectedTargetId }) as never,
           });
          }}
         >
          <Pencil className="w-3 h-3 mr-1" /> Editar
         </Button>
         <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          onClick={() => {
           onOpenChange(false);
           navigate({
            to: isSalesbot ? "/crm/automacoes" : "/crm/agente-ia",
            search: { novo: "1" } as never,
           });
          }}
         >
          <Plus className="w-3 h-3 mr-1" /> Criar
         </Button>
        </div>
       </div>
       <button
        type="button"
        onClick={onEditAction}
        className="w-full text-xs rounded border border-border px-3 py-2 hover:bg-accent text-left truncate"
       >
        {selectedTargetName ? (
         <span className="font-medium">{selectedTargetName}</span>
        ) : (
         <span className="text-muted-foreground">
          {isSalesbot ? "Nenhum SalesBot selecionado" : "Nenhum Agente IA selecionado"}
         </span>
        )}
       </button>
      </div>
     )}

     {onEditAction && !isSalesbot && !isAgenteIa && (
      <button
       onClick={onEditAction}
       className="w-full text-xs rounded border border-border px-3 py-2 hover:bg-accent text-left"
      >
       <span className="font-semibold">Configurar ação · </span>
       <span className="text-muted-foreground">abrir editor detalhado</span>
      </button>
     )}


     <label className="flex items-center gap-2 text-xs">
      <Checkbox
       checked={!!draft.applyToExisting}
       onCheckedChange={(v) => update("applyToExisting", !!v)}
      />
      <span>Aplicar o gatilho a todos os leads já nesta etapa</span>
     </label>
    </div>

    <div className="shrink-0 border-t border-border px-4 py-2.5">
     {saveError && (
      <div className="mb-2 rounded border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
       {saveError}
      </div>
     )}
     <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
      <Button
       size="sm"
       className="h-8 text-xs"
       disabled={isSaving}
       onClick={() => void saveExecution()}
      >
       {isSaving ? "Salvando..." : "Pronto"}
      </Button>
      <button
       onClick={() => onOpenChange(false)}
       className="text-xs text-muted-foreground hover:text-foreground"
      >
       Cancelar
      </button>
     </div>
      <button
       onClick={() => {
        onRemove();
        onOpenChange(false);
       }}
       className="text-destructive hover:text-destructive/80"
       aria-label="Remover gatilho"
       title="Remover gatilho"
      >
       <Trash2 className="w-4 h-4" />
      </button>
     </div>
    </div>
   </PopoverContent>
  </Popover>
 );
}


// ─────────────────────────────────────────────────────────────
// ExecutionTiming: um único seletor "Executar" com todas as opções.
// ─────────────────────────────────────────────────────────────

type TimingValue =
  | "created-or-moved" | "created-only" | "moved-only" | "dwell"
  | "assignee-changed" | "tag-added" | "field-updated" | "hours-before-field"
  | "daily" | "exact-datetime";

const TIMING_OPTIONS: { value: TimingValue; label: string }[] = [
 { value: "created-or-moved", label: "Assim que o lead for criado ou movido para esta etapa" },
 { value: "created-only", label: "Assim que o lead for criado nesta etapa" },
 { value: "moved-only", label: "Assim que o lead for movido para esta etapa" },
 { value: "dwell", label: "Depois de um tempo parado nesta etapa" },
 { value: "assignee-changed", label: "Quando o responsável pelo lead mudar" },
 { value: "tag-added", label: "Quando uma tag for adicionada ao lead" },
 { value: "field-updated", label: "Quando um campo personalizado for atualizado" },
 { value: "hours-before-field", label: "Horas antes de um campo de data/hora" },
 { value: "daily", label: "Todo dia em um horário fixo" },
 { value: "exact-datetime", label: "Em uma data e hora específicas" },
];

const SUPPORTED_TIMING = new Set<TriggerKind>([
 "created-or-moved", "created-only", "moved-only",
 "assignee-changed", "tag-added", "field-updated", "hours-before-field",
 "daily", "exact-datetime",
]);

function normalizeSupportedTrigger(trigger: ExecutionConfig["trigger"]): TriggerSpec {
 const spec = normalizeTrigger(trigger);
 return SUPPORTED_TIMING.has(spec.kind) ? spec : { kind: "created-or-moved" };
}

function splitDelay(minutes: number): { amount: number; unit: "minutes" | "hours" | "days" } {
 const safe = Math.max(0, Math.round(Number(minutes) || 0));
 if (safe > 0 && safe % 1440 === 0) return { amount: safe / 1440, unit: "days" };
 if (safe > 0 && safe % 60 === 0) return { amount: safe / 60, unit: "hours" };
 return { amount: safe, unit: "minutes" };
}

function toMinutes(amount: number, unit: "minutes" | "hours" | "days"): number {
 const n = Math.max(0, Math.round(Number(amount) || 0));
 if (unit === "days") return n * 1440;
 if (unit === "hours") return n * 60;
 return n;
}

function ExecutionTiming({
 spec,
 delayMinutes,
 delayUnit,
 customFields,
 onTriggerChange,
 onDelayChange,
}: {
 spec: TriggerSpec;
 delayMinutes: number;
 delayUnit?: "minutes" | "hours" | "days";
 customFields: Array<{ id: string; name: string; fieldType?: string }>;
 onTriggerChange: (spec: TriggerSpec) => void;
 onDelayChange: (minutes: number, unit?: "minutes" | "hours" | "days", clearUnit?: boolean) => void;
}) {
 const unit = delayUnit ?? splitDelay(delayMinutes).unit;
 const delay = {unit, amount: Math.max(0,Number(delayMinutes)||0) / toMinutes(1,unit)};
 const hasDelay = Math.max(0, Number(delayMinutes || 0)) > 0 || !!delayUnit;
 const current: TimingValue =
  spec.kind === "created-or-moved" && hasDelay ? "dwell" : (spec.kind as TimingValue);

 function selectTiming(value: TimingValue) {
  if (value === "dwell") {
   onTriggerChange({ kind: "created-or-moved" });
   onDelayChange(toMinutes(delay.amount || 30, delay.unit),delay.unit);
   return;
  }
  onDelayChange(0,undefined,true);
  if (value === "tag-added") { onTriggerChange({ kind: "tag-added", tags: [] }); return; }
  if (value === "field-updated") { onTriggerChange({ kind: "field-updated", entity: "lead" }); return; }
  if (value === "hours-before-field") {
   const firstDateField = customFields.find((field) =>
    ["date", "datetime", "birthday"].includes(String(field.fieldType ?? "").toLowerCase()),
   );
   onTriggerChange({
    kind: "hours-before-field",
    hours: 24,
    fieldId: firstDateField?.id,
    fieldName: firstDateField?.name,
   });
   return;
  }
  if (value === "daily") { onTriggerChange({ kind: "daily", time: "09:00" }); return; }
  if (value === "exact-datetime") {
   const d = new Date(Date.now() + 60 * 60_000);
   const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
   onTriggerChange({ kind: "exact-datetime", at: iso });
   return;
  }
  onTriggerChange({ kind: value } as TriggerSpec);
 }

 return (
  <div className="rounded border border-border bg-background p-2 space-y-2">
   <div className="space-y-1.5">
    <div className="text-[10px] font-semibold uppercase text-muted-foreground">Executar</div>
    <div className="grid gap-1" role="radiogroup" aria-label="Escolher gatilho de execução">
     {TIMING_OPTIONS.map((option) => {
      const selected = option.value === current;
      return (
       <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={(event) => {
         event.stopPropagation();
         selectTiming(option.value);
        }}
        className={cn(
         "flex min-h-9 w-full items-center gap-2 rounded border px-2.5 py-2 text-left text-xs transition-colors",
         selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground",
        )}
       >
        <span
         aria-hidden
         className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-muted-foreground/50",
         )}
        >
         {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
        </span>
        <span>{option.label}</span>
       </button>
      );
     })}
    </div>
   </div>

   {current === "dwell" && (
    <>
     <div className="flex items-center gap-2">
      <Input
       type="number"
       min={1}
       value={delay.amount || ""}
       onChange={(e) => onDelayChange(toMinutes(Number(e.target.value), delay.unit),delay.unit)}
       className="h-8 text-xs w-20"
      />
      <PickerSelect
       className="flex-1"
       value={delay.unit}
       options={[
        { value: "minutes", label: "minutos" },
        { value: "hours", label: "horas" },
        { value: "days", label: "dias" },
       ]}
       onChange={(unit) => onDelayChange(toMinutes(delay.amount || 1, unit as "minutes" | "hours" | "days"), unit as "minutes" | "hours" | "days")}
      />
     </div>
     <p className="text-[10px] text-muted-foreground leading-tight">
      Roda {delay.amount || 1} {delay.unit === "days" ? "dia(s)" : delay.unit === "hours" ? "hora(s)" : "minuto(s)"} depois que o lead entra nesta etapa, se ele ainda estiver aqui.
     </p>
    </>
   )}

   {current === "tag-added" && (
    <>
     <Input
      value={(spec.kind === "tag-added" ? spec.tags ?? [] : []).join(", ")}
      onChange={(e) =>
       onTriggerChange({
        kind: "tag-added",
        tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
       })
      }
      placeholder="Tags separadas por vírgula (vazio = qualquer tag)"
      className="h-8 text-xs"
     />
     <p className="text-[10px] text-muted-foreground leading-tight">
      Dispara quando qualquer uma dessas tags for adicionada ao lead nesta etapa.
     </p>
    </>
   )}

   {current === "field-updated" && (
    <>
     <PickerSelect
      prefix="Campo:"
      value={spec.kind === "field-updated" ? spec.fieldId ?? "" : ""}
      options={[
       { value: "", label: "Qualquer campo personalizado" },
       ...customFields.map((f) => ({ value: f.id, label: f.name })),
      ]}
      onChange={(id) =>
       onTriggerChange({
        kind: "field-updated",
        entity: "lead",
        fieldId: id || undefined,
        fieldName: customFields.find((f) => f.id === id)?.name,
       })
      }
     />
     <p className="text-[10px] text-muted-foreground leading-tight">
      Dispara quando o valor desse campo for salvo no perfil do lead.
     </p>
    </>
   )}

   {current === "hours-before-field" && (
    <>
     <div className="flex items-center gap-2">
      <Input
       type="number"
       min={0}
       value={spec.kind === "hours-before-field" ? spec.hours : 24}
       onChange={(e) => {
        const currentSpec = spec.kind === "hours-before-field" ? spec : { kind: "hours-before-field" as const, hours: 24 };
        onTriggerChange({
         ...currentSpec,
         hours: Math.max(0, Number(e.target.value) || 0),
        });
       }}
       className="h-8 w-20 text-xs"
      />
      <span className="text-xs text-muted-foreground">hora(s) antes de</span>
     </div>
     <PickerSelect
      prefix="Campo:"
      value={spec.kind === "hours-before-field" ? spec.fieldId ?? "" : ""}
      options={customFields
       .filter((field) => ["date", "datetime", "birthday"].includes(String(field.fieldType ?? "").toLowerCase()))
       .map((field) => ({ value: field.id, label: field.name }))}
      onChange={(id) => {
       const field = customFields.find((item) => item.id === id);
       const currentSpec = spec.kind === "hours-before-field" ? spec : { kind: "hours-before-field" as const, hours: 24 };
       onTriggerChange({
        ...currentSpec,
        fieldId: field?.id,
        fieldName: field?.name,
       });
      }}
     />
     <p className="text-[10px] text-muted-foreground leading-tight">
      Agenda a ação a partir do valor salvo no campo, respeitando o fuso horário da conta.
     </p>
    </>
   )}

   {current === "daily" && (
    <>
     <Input
      type="time"
      value={spec.kind === "daily" ? spec.time ?? "09:00" : "09:00"}
      onChange={(e) => onTriggerChange({ kind: "daily", time: e.target.value })}
      className="h-8 text-xs w-32"
     />
     <p className="text-[10px] text-muted-foreground leading-tight">
      Todo dia nesse horário, para os leads que estiverem nesta etapa.
     </p>
    </>
   )}

   {current === "exact-datetime" && (
    <>
     <Input
      type="datetime-local"
      value={spec.kind === "exact-datetime" ? spec.at ?? "" : ""}
      onChange={(e) => onTriggerChange({ kind: "exact-datetime", at: e.target.value })}
      className="h-8 text-xs"
     />
     <p className="text-[10px] text-muted-foreground leading-tight">
      Executa uma única vez nessa data/hora, se o lead ainda estiver nesta etapa.
     </p>
    </>
   )}

   {current === "assignee-changed" && (
    <p className="text-[10px] text-muted-foreground leading-tight">
     Dispara toda vez que o responsável pelo lead for alterado.
    </p>
   )}
  </div>
 );
}

