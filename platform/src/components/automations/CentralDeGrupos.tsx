import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {useSlimGroupCatalog,useSlimGroupRulesDraft} from "./slim-group-catalog-ui";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceChannels } from "@/hooks/use-workspace-channels";
import {
  listWorkspaceGroups,
  syncSessionGroups,
  createWhatsAppGroup,
  joinGroupByLink,
  leaveGroup,
  renameGroup,
  setGroupDescription,
  setGroupAutomation,
  saveGroupRules,
  listGroupSalesbots,
  upsertGroupAiAgent,
  deleteGroupAiAgent,
  duplicateGroupAiAgent,
  getGroupAgentStats,
  type GroupAgentStat,
} from "@/lib/whatsapp-groups.functions";
import { duplicateSalesbot, deleteSalesbot } from "@/lib/salesbots.functions";
import { toast } from "sonner";
import { DuplicateNameDialog } from "@/components/automations/DuplicateNameDialog";
import { StageTriggerConfigPopover } from "@/components/crm/StageTriggerConfigPopover";
import { Switch } from "@/components/ui/switch";

import {
  emptyTree,
  type ObjectiveTree,
} from "./ObjectiveTree";
import { AgentSourcesEditor, type AgentSource } from "./AgentSourcesEditor";
import { AgentWebhookTrigger, type WebhookTriggerValue } from "./AgentWebhookTrigger";
import { AgentTargetField, DurationPicker, targetKindForAction } from "./AgentTargetPickers";
import { AgentOutcomeEditor, normalizeOutcome, type AgentOutcomeStep } from "./AgentOutcomeEditor";
import { AgentTestChat } from "./AgentTestChat";
import { AgentActionsEditor, type AgentAction } from "./AgentActionsEditor";
import { AgentTemplatePicker, type AgentTemplateData } from "./AgentTemplatePicker";
import { AgentModeBadge, type AgentMode } from "./AgentTypeDialog";
import {isLegacyObjectiveAgent,promptReadinessError} from "@/lib/slim-prompt-only.core";

import {
  Users,
  RefreshCw,
  Plus,
  LogOut,
  Pencil,
  Trash2,
  Copy,
  Shield,
  MessageSquare,
  Sparkles,
  Bot,
  Link2,
  X,
  Loader2,
  AlertTriangle,
  GitBranch,
  Search,
  Zap,
  AtSign,
  Clock,
  UserPlus,
  UserMinus,
  Link as LinkIcon,
  Filter,
  BarChart3,
} from "lucide-react";


type Tab = "grupos" | "regras" | "bots";

type Group = {
  id: string;
  workspace_id: string;
  session_id: string;
  group_jid: string;
  name: string | null;
  description: string | null;
  picture_url: string | null;
  participants_count: number;
  is_admin: boolean;
  active_bot_id: string | null;
  active_ai_agent_id: string | null;
  rules: Record<string, unknown> | null;
  last_synced_at: string | null;
};

type Bot = { id: string; nome: string; ativo: boolean };
type TriggerType =
  | "mention"
  | "keyword"
  | "all_messages"
  | "member_join"
  | "member_leave"
  | "webhook"
  | "schedule"
  | "lead_stage_change"
  | "link_not_allowed";
type Trigger = {
  id: string;
  type: TriggerType;
  enabled: boolean;
  config: Record<string, unknown>;
};
type Agent = {
  id: string;
  name: string;
  persona: string | null;
  system_prompt: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  respond_only_when_mentioned: boolean;
  cooldown_seconds: number;
  enabled: boolean;
  triggers?: Trigger[] | null;
  metadata?: Record<string, unknown> | null;
};


export function CentralDeGrupos() {
  const catalog=useSlimGroupCatalog();
  const {scopeQ,scopeKey,workspaceId,selectedSessionId,setSelectedSessionId,channels,groupsQ,botsQ,sync,syncing,notice,syncError,refresh}=catalog;
  const [selectedGroupId,setSelectedGroupId]=useState<string|undefined>();
  const [tab,setTab]=useState<Tab>('grupos');
  useEffect(()=>{setSelectedGroupId(undefined);},[scopeKey]);
  const groups=groupsQ.data??[],bots=botsQ.data??[];
  const selected=groups.some(g=>g.id===selectedGroupId)?selectedGroupId:groups[0]?.id;
  const openRules=(id:string)=>{setSelectedGroupId(id);setTab('regras')};
  const selectedSession=channels.data?.whatsapp?.some(s=>s.id===selectedSessionId);
  const missingSessions=Array.from(new Set(groups.map(g=>g.session_id))).filter(id=>!channels.data?.whatsapp?.some(s=>s.id===id));
  return <div className="min-w-0 rounded-lg border border-border bg-card text-foreground overflow-hidden shadow-sm" data-slim-group-catalog>
    <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
      <div><h1 className="text-base font-semibold text-card-foreground inline-flex items-center gap-2"><Users className="w-4 h-4 text-primary"/> Central de Grupos</h1><p className="text-xs text-muted-foreground mt-1 max-w-2xl">Gerencie seus grupos de WhatsApp. Configure regras, gatilhos e SalesBots de grupo.</p></div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="grid gap-1 text-xs min-w-0">Sessão de WhatsApp<select aria-label="Sessão de WhatsApp" value={selectedSessionId??''} disabled={syncing||!workspaceId} onChange={e=>setSelectedSessionId(e.target.value||null)} className="max-w-full bg-background border border-border rounded px-2 py-2 text-xs text-foreground"><option value="">Todas as sessões</option>{(channels.data?.whatsapp??[]).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}{missingSessions.map(id=><option key={id} value={id}>Sessão do histórico · {id.slice(0,8)}</option>)}</select></label>
        <button type="button" onClick={()=>void sync()} disabled={!selectedSessionId||syncing||!workspaceId} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50">{syncing?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>} Sincronizar</button>
      </div>
    </div>
    <div className="px-5 pt-3 border-b border-border flex flex-wrap items-center gap-1" role="tablist" aria-label="Central de Grupos"><TabButton active={tab==='grupos'} onClick={()=>setTab('grupos')} icon={Users} label="Grupos"/><TabButton active={tab==='regras'} onClick={()=>setTab('regras')} icon={Shield} label="Regras"/><TabButton active={tab==='bots'} onClick={()=>setTab('bots')} icon={MessageSquare} label="Salesbots de grupo"/></div>
    {notice&&<p role="status" className="mx-5 mt-3 rounded border border-border bg-muted/30 p-3 text-sm">{notice}</p>}
    {syncError&&<p role="alert" className="mx-5 mt-3 rounded border border-destructive/40 p-3 text-sm text-destructive">{syncError}</p>}
    <div className="p-5 min-w-0">
      {!workspaceId?(scopeQ.isError?<div role="alert" className="text-sm">Não foi possível confirmar a empresa. <button className="underline" onClick={()=>void scopeQ.refetch()}>Tentar novamente</button></div>:<p role="status" className="text-sm text-muted-foreground">Conferindo empresa...</p>):<div key={scopeKey}>
        {channels.isError&&<p role="alert" className="mb-3 text-sm text-destructive">Não foi possível consultar as sessões de WhatsApp. <button className="underline" onClick={()=>void channels.refetch()}>Consultar sessões novamente</button></p>}
        {groupsQ.isError&&<div role="alert" className="rounded border border-destructive/30 p-4 text-sm">Não foi possível carregar os grupos. A consulta não confirmou uma lista vazia. <button className="ml-2 underline" onClick={()=>void groupsQ.refetch()}>Tentar novamente</button></div>}<>
          <div hidden={tab!=='grupos'||(groupsQ.isError&&!groupsQ.data)} role="tabpanel" aria-label="Grupos"><GruposTab workspaceId={workspaceId} sessionId={selectedSession?selectedSessionId:null} groups={groups} loading={groupsQ.isLoading} bots={bots} onChange={()=>void refresh()} onOpenRegras={openRules}/></div>
          <div hidden={tab!=='regras'||(groupsQ.isError&&!groupsQ.data)} role="tabpanel" aria-label="Regras">{groupsQ.isLoading&&<p role="status" className="text-sm text-muted-foreground">Carregando grupos...</p>}<RegrasTab groups={groups} bots={bots} workspaceId={workspaceId} initialGroupId={selectedGroupId} onChange={()=>void refresh()}/></div>
        </>
        <div hidden={tab!=='bots'} role="tabpanel" aria-label="Salesbots de grupo">
          <div className="mb-4 flex min-w-0 flex-wrap items-end gap-2 rounded border border-border bg-muted/20 p-3"><label className="grid min-w-0 flex-1 gap-1 text-xs">Grupo para configurar gatilhos<select aria-label="Grupo para configurar gatilhos" value={selected??''} disabled={groupsQ.isLoading||groupsQ.isError||!groups.length} onChange={e=>setSelectedGroupId(e.target.value)} className="min-w-0 max-w-full rounded border border-border bg-background p-2 text-sm"><option value="" disabled>{groupsQ.isError?'Lista de grupos indisponível':groupsQ.isLoading?'Carregando grupos...':'Selecione um grupo'}</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name??g.group_jid}</option>)}</select></label><button className="rounded border border-border px-3 py-2 text-xs disabled:opacity-50" disabled={!selected||groupsQ.isError} onClick={()=>selected&&openRules(selected)}>Configurar gatilhos</button></div>
          {botsQ.isError?<div role="alert" className="text-sm">Não foi possível carregar os SalesBots. <button className="underline" onClick={()=>void botsQ.refetch()}>Tentar novamente</button></div>:<BotsGrupoTab bots={bots} loading={botsQ.isLoading} onChange={()=>void botsQ.refetch()}/>}
        </div>
      </div>}
    </div>
  </div>;
}

/* ---------- helpers ---------- */


function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      role="tab" aria-selected={active}
      className={`px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

/* ---------- Grupos tab ---------- */

function GruposTab({
  workspaceId,
  sessionId,
  groups,
  loading,
  bots,
  onChange,
  onOpenRegras,
}: {
  workspaceId: string | null;
  sessionId: string | null;
  groups: Group[];
  loading: boolean;
  bots: Bot[];
  onChange: () => void;
  onOpenRegras: (groupId: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [somenteAdmin, setSomenteAdmin] = useState(false);

  const setAutoFn = useServerFn(setGroupAutomation);
  const leaveFn = useServerFn(leaveGroup);

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const filtrados = useMemo(() => {
    const q = norm(busca);
    return groups.filter((g) => {
      if (somenteAdmin && !g.is_admin) return false;
      if (!q) return true;
      return norm(`${g.name ?? ""} ${g.group_jid} ${g.description ?? ""}`).includes(q);
    });
  }, [groups, busca, somenteAdmin]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {loading
            ? "Carregando..."
            : `${filtrados.length} de ${groups.length} grupo(s) na sessão selecionada`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setJoinOpen(true)}
            disabled={!sessionId}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:bg-muted disabled:opacity-50"
          >
            <Link2 className="w-3.5 h-3.5" /> Entrar por link
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            disabled={!sessionId}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Criar grupo
          </button>
        </div>
      </div>

      {/* Busca por nome do grupo */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar grupo pelo nome..."
            className="w-full h-10 pl-9 pr-9 text-sm rounded-xl border border-border bg-card/60 backdrop-blur placeholder:text-muted-foreground/70 outline-none transition-all focus:border-primary/60 focus:ring-2 focus:ring-primary/20 focus:bg-card"
          />
          {busca && (
            <button
              onClick={() => setBusca("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setSomenteAdmin((v) => !v)}
          className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border text-xs font-medium transition-colors ${
            somenteAdmin
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Mostrar apenas grupos em que sou administrador"
        >
          <Shield className="w-3.5 h-3.5" /> Só onde sou admin
        </button>
      </div>

      {filtrados.length === 0 && groups.length > 0 && (
        <div className="text-center py-10 text-xs text-muted-foreground border border-dashed border-border rounded">
          Nenhum grupo encontrado para “{busca}”.
        </div>
      )}

      {groups.length === 0 && !loading && (
        <div className="text-center py-12 text-xs text-muted-foreground border border-dashed border-border rounded">
          Nenhum grupo encontrado nesta seleção. Selecione uma sessão conectada e clique em <strong>Sincronizar</strong>.
        </div>
      )}

      {filtrados.length > 0 && (

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="px-3 py-2 text-left">Grupo</th>
                <th className="px-2 py-2 text-right">Membros</th>
                <th className="px-2 py-2 text-left">Sou admin?</th>
                <th className="px-2 py-2 text-left">Regras</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((g) => {
                const active = g.active_bot_id
                  ? `Bot: ${bots.find((b) => b.id === g.active_bot_id)?.nome ?? "removido"}`
                  : "Nenhuma";
                return (
                  <tr key={g.id} className="border-b border-border hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {g.picture_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.picture_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground truncate">{g.name ?? "Sem nome"}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{g.group_jid}</div>
                          <div className="text-[11px] text-muted-foreground mt-1">{g.last_synced_at ? "Atualizado pelo WhatsApp" : "Histórico disponível"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs tabular-nums text-foreground">
                      {g.last_synced_at ? g.participants_count : "Não confirmado"}
                    </td>
                    <td className="px-2 py-2.5">
                      {!g.last_synced_at ? <span className="text-[11px] text-muted-foreground">Não confirmado</span> : g.is_admin ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          <Shield className="w-3 h-3" /> Admin
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Membro</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-foreground">
                      <button
                        onClick={() => {
                          onOpenRegras(g.id);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-[11px] font-medium transition-colors"
                        title="Configurar gatilhos e regras do grupo"
                      >
                        <Shield className="w-3.5 h-3.5 text-primary" /> Configurar regras
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={async () => {
                          if (!g.session_id) return;
                          if (!confirm(`Sair do grupo "${g.name ?? g.group_jid}"?`)) return;
                          await leaveFn({ data: { sessionId: g.session_id, groupJid: g.group_jid } });
                          onChange();
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-destructive hover:opacity-80"
                        title="Sair do grupo"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateGroupDialog
          sessionId={sessionId!}
          workspaceId={workspaceId!}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            onChange();
          }}
        />
      )}
      {joinOpen && (
        <JoinGroupDialog
          sessionId={sessionId!}
          onClose={() => setJoinOpen(false)}
          onJoined={() => {
            setJoinOpen(false);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function AutomationSelector({
  group,
  bots,
  onSet,
}: {
  group: Group;
  bots: Bot[];
  onSet: (p: { botId?: string | null; agentId?: string | null }) => Promise<void>;
}) {
  const value = group.active_bot_id ? `bot:${group.active_bot_id}` : "none";
  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "none") onSet({ botId: null, agentId: null });
        else if (v.startsWith("bot:")) onSet({ botId: v.slice(4), agentId: null });
      }}
      className="bg-background border border-border rounded px-1.5 py-1 text-[11px] w-full max-w-[220px]"
    >
      <option value="none">Nenhuma</option>
      {bots.length > 0 && (
        <optgroup label="Salesbots de grupo">
          {bots.map((b) => (
            <option key={b.id} value={`bot:${b.id}`}>
              {b.nome}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/* ---------- Create / Join dialogs ---------- */

function Modal({
  children,
  onClose,
  title,
  header,
  size = "md",
  shift = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  header?: React.ReactNode;
  size?: "md" | "lg" | "xl" | "full";
  shift?: boolean;
}) {
  const full = size === "full";
  const widthClass = full
    ? "w-screen h-screen max-w-none rounded-none border-0"
    : `${size === "xl" ? "max-w-4xl" : size === "lg" ? "max-w-2xl" : "max-w-md"} max-h-[90vh] w-full`;
  return (
    <div className={`fixed inset-0 z-50 bg-black/50 flex items-center justify-center ${full ? "p-0" : "p-4"}`}>
      <div
        className={`bg-card border border-border rounded-lg ${widthClass} shadow-xl flex flex-col transition-transform duration-200 ${
          shift && !full ? "-translate-x-[200px]" : ""
        }`}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            {header ? header : <h2 className="text-sm font-semibold">{title}</h2>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          <div className={full ? "mx-auto w-full max-w-5xl" : ""}>{children}</div>
        </div>
      </div>
    </div>
  );
}




function CreateGroupDialog({
  sessionId,
  workspaceId,
  onClose,
  onCreated,
}: {
  sessionId: string;
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [participants, setParticipants] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const createFn = useServerFn(createWhatsAppGroup);

  return (
    <Modal onClose={onClose} title="Criar grupo de WhatsApp">
      <div className="space-y-3">
        <input
          placeholder="Nome do grupo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
        />
        <textarea
          placeholder="Descrição (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
        />
        <textarea
          placeholder="Números com DDI (um por linha), ex: 5511999999999"
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          rows={4}
          className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm font-mono"
        />
        {err && <div className="text-xs text-destructive">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-border">
            Cancelar
          </button>
          <button
            onClick={async () => {
              setErr(null);
              const numbers = participants
                .split(/\n|,|;/)
                .map((s) => s.trim())
                .filter(Boolean);
              if (!name.trim() || numbers.length === 0) {
                setErr("Informe nome e ao menos um número.");
                return;
              }
              try {
                setLoading(true);
                await createFn({
                  data: { workspaceId, sessionId, name: name.trim(), participants: numbers, description: description.trim() || undefined },
                });
                onCreated();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Criar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function JoinGroupDialog({ sessionId, onClose, onJoined }: { sessionId: string; onClose: () => void; onJoined: () => void }) {
  const [link, setLink] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const joinFn = useServerFn(joinGroupByLink);
  return (
    <Modal onClose={onClose} title="Entrar em grupo por link">
      <div className="space-y-3">
        <input
          placeholder="https://chat.whatsapp.com/XXXX ou só o código"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
        />
        {err && <div className="text-xs text-destructive">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-border">
            Cancelar
          </button>
          <button
            onClick={async () => {
              setErr(null);
              if (!link.trim()) return;
              try {
                setLoading(true);
                await joinFn({ data: { sessionId, inviteCode: link.trim() } });
                onJoined();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Entrar
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Regras tab ---------- */

type Rules = {
  welcome?: string;
  farewell?: string;
  allowedLinks?: string[];
  bannedWords?: string[];
  antiFlood?: { messagesPerMinute: number; action: "warn" | "remove"; warnMessage?: string };
  onlyAdmins?: boolean;
  violationPolicy?: {
    maxViolations: number;
    windowHours: number;
    action: "warn" | "remove";
    warnMessage?: string;
  };
  triggers?: Array<{
    id: string;
    type: "member_join" | "member_leave" | "keyword" | "all_messages" | "link_not_allowed";
    enabled: boolean;
    config: {
      message?: string;
      keywords?: string;
      actionType?: "send_message" | "send_dm" | "start_bot" | "remove_member";
      botId?: string;
    };
  }>;
};

function RegrasTab({
  groups,
  bots,
  workspaceId,
  onChange,
  initialGroupId,
}: {
  groups: Group[];
  bots: any[];
  workspaceId: string | null;
  onChange: () => void;
  initialGroupId?: string;
}) {
  const {selectedGroupId,setSelectedGroupId,g,local,setLocal,dirty,markSaved}=useSlimGroupRulesDraft<Rules>(groups,initialGroupId);
  const savingRef=useRef(false),live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[]);

  const saveFn = useServerFn(saveGroupRules);
  const [saving, setSaving] = useState(false);
  const setAutoFn = useServerFn(setGroupAutomation);

  if (groups.length === 0)
    return <div className="text-sm text-muted-foreground py-8 text-center">Nenhum grupo disponível nesta seleção. Confira as sessões ou sincronize o WhatsApp.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
      <div className="border border-border rounded overflow-hidden">
        <ul className="divide-y divide-border max-h-[520px] overflow-y-auto">
          {groups.map((x) => (
            <li key={x.id}>
              <button
                onClick={() => setSelectedGroupId(x.id)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  selectedGroupId === x.id ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                }`}
              >
                {x.name ?? x.group_jid}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {g && (
        <div className="space-y-6">
          {/* Regras e Gatilhos */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" /> Gatilhos e Automações
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newRule: NonNullable<Rules["triggers"]>[number] = {
                      id: crypto.randomUUID(),
                      type: "member_join" as const,
                      enabled: true,
                      config: { message: "Bem-vindo(a) ao grupo! 👋", actionType: "send_message" }
                    };
                    const currentTriggers = local.triggers ?? [];
                    setLocal({ ...local, triggers: [...currentTriggers, newRule] });
                  }}
                  className="text-[11px] px-2 py-1 rounded border border-border hover:bg-muted inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Nova regra
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Configure regras para disparar ações automáticas. Se acontecer X, o bot executa Y.
            </p>

            <div className="space-y-3">
              {(local.triggers ?? []).map((t, idx) => (
                <div key={t.id} className="p-3 rounded-lg border border-border bg-card/50 space-y-3 relative group">
                  <button
                    onClick={() => {
                      const next = (local.triggers ?? []).filter((_, i) => i !== idx);
                      setLocal({ ...local, triggers: next });
                    }}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-primary uppercase">QUANDO</span>
                    <select
                      value={t.type}
                      onChange={(e) => {
                        const next = [...(local.triggers ?? [])];
                        next[idx] = { ...t, type: e.target.value as any };
                        setLocal({ ...local, triggers: next });
                      }}
                      className="bg-background border border-border rounded px-2 py-1 text-[11px] font-medium"
                    >
                      <option value="member_join">Alguém entrar no grupo</option>
                      <option value="member_leave">Alguém sair do grupo</option>
                      <option value="keyword">Palavra-chave detectada</option>
                      <option value="all_messages">Qualquer mensagem</option>
                      <option value="link_not_allowed">Link não permitido enviado</option>
                    </select>
                    <Switch
                      checked={t.enabled}
                      onCheckedChange={(v: boolean) => {
                        const next = [...(local.triggers ?? [])];
                        next[idx] = { ...t, enabled: v };
                        setLocal({ ...local, triggers: next });
                      }}
                    />
                  </div>

                  {t.type === "keyword" && (
                    <input
                      placeholder="Ex: suporte, ajuda, comprar"
                      value={t.config?.keywords ?? ""}
                      onChange={(e) => {
                        const next = [...(local.triggers ?? [])];
                        next[idx] = { ...t, config: { ...t.config, keywords: e.target.value } };
                        setLocal({ ...local, triggers: next });
                      }}
                      className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px]"
                    />
                  )}

                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-emerald-500 uppercase">ENTÃO</span>
                      <select
                        value={t.config?.actionType ?? "send_message"}
                        onChange={(e) => {
                          const next = [...(local.triggers ?? [])];
                          next[idx] = { ...t, config: { ...t.config, actionType: e.target.value as any } };
                          setLocal({ ...local, triggers: next });
                        }}
                        className="bg-background border border-border rounded px-2 py-1 text-[11px] font-medium"
                      >
                        <option value="send_message">Enviar mensagem no grupo</option>
                        <option value="send_dm">Enviar mensagem no privado (DM)</option>
                        <option value="start_bot">Iniciar SalesBot</option>
                        <option value="remove_member">Remover do grupo</option>
                      </select>
                    </div>

                    {(t.config?.actionType === "send_message" || t.config?.actionType === "send_dm" || !t.config?.actionType) && (
                      <textarea
                        placeholder="Escreva a mensagem..."
                        value={t.config?.message ?? ""}
                        onChange={(e) => {
                          const next = [...(local.triggers ?? [])];
                          next[idx] = { ...t, config: { ...t.config, message: e.target.value } };
                          setLocal({ ...local, triggers: next });
                        }}
                        rows={2}
                        className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] resize-none"
                      />
                    )}

                    {t.config?.actionType === "start_bot" && (
                      <select
                        value={t.config?.botId ?? ""}
                        onChange={(e) => {
                          const next = [...(local.triggers ?? [])];
                          next[idx] = { ...t, config: { ...t.config, botId: e.target.value } };
                          setLocal({ ...local, triggers: next });
                        }}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-[11px]"
                      >
                        <option value="">Selecionar SalesBot...</option>
                        {bots.map((b: any) => (
                          <option key={b.id} value={b.id}>{b.nome}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}

              {(local.triggers ?? []).length === 0 && (
                <div className="text-center py-6 border border-dashed border-border rounded-lg bg-muted/20">
                  <p className="text-[10px] text-muted-foreground italic">
                    Nenhuma regra de automação criada para este grupo.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" /> Moderação e Boas-vindas
            </h3>
            <RuleField label="Mensagem de boas-vindas" value={local.welcome ?? ""} onChange={(v) => setLocal({ ...local, welcome: v })} placeholder="Bem-vindo(a) ao grupo!" multiline />
            <RuleField
              label="Links permitidos (um por linha, vazio = todos)"
              value={(local.allowedLinks ?? []).join("\n")}
              onChange={(v) => setLocal({ ...local, allowedLinks: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
              placeholder="youtube.com&#10;instagram.com"
              multiline
            />
            <RuleField
              label="Palavras proibidas (uma por linha)"
              value={(local.bannedWords ?? []).join("\n")}
              onChange={(v) => setLocal({ ...local, bannedWords: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
              multiline
            />

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Anti-flood (anti-spam)</label>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                Se um mesmo membro enviar mais que <strong className="text-foreground">X mensagens em 1 minuto</strong>, o bot
                executa a ação escolhida. Serve pra conter spam, corrente e mensagem repetida.
                Deixe em <strong className="text-foreground">0</strong> para desativar.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={local.antiFlood?.messagesPerMinute ?? 0}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      antiFlood: {
                        messagesPerMinute: parseInt(e.target.value || "0", 10),
                        action: local.antiFlood?.action ?? "warn",
                        warnMessage: local.antiFlood?.warnMessage ?? "",
                      },
                    })
                  }
                  className="w-16 bg-background border border-border rounded px-2 py-1 text-xs"
                />
                <span className="text-xs text-muted-foreground">msgs/min</span>
                <span className="text-xs text-muted-foreground ml-2">Ação:</span>
                <select
                  value={local.antiFlood?.action ?? "warn"}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      antiFlood: {
                        messagesPerMinute: local.antiFlood?.messagesPerMinute ?? 0,
                        action: e.target.value as "warn" | "remove",
                        warnMessage: local.antiFlood?.warnMessage ?? "",
                      },
                    })
                  }
                  className="bg-background border border-border rounded px-2 py-1 text-xs"
                >
                  <option value="warn">Avisar no grupo</option>
                  <option value="remove">Remover do grupo</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Política de Reincidência
              </label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Define o que acontece com membros que quebram as regras acima (links, palavras proibidas, etc.)
                repetidamente.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted-foreground">Remover após</span>
                <input
                  type="number"
                  min={0}
                  placeholder="3"
                  value={local.violationPolicy?.maxViolations ?? 3}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      violationPolicy: {
                        maxViolations: parseInt(e.target.value || "0", 10),
                        windowHours: local.violationPolicy?.windowHours ?? 24,
                        action: local.violationPolicy?.action ?? "remove",
                        warnMessage: local.violationPolicy?.warnMessage ?? "",
                      },
                    })
                  }
                  className="w-16 bg-background border border-border rounded px-2 py-1 text-xs"
                />
                <span className="text-xs text-muted-foreground">violações</span>
                <span className="text-xs text-muted-foreground ml-2">dentro de</span>
                <input
                  type="number"
                  min={0}
                  placeholder="24"
                  value={local.violationPolicy?.windowHours ?? 24}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      violationPolicy: {
                        maxViolations: local.violationPolicy?.maxViolations ?? 3,
                        windowHours: parseInt(e.target.value || "0", 10),
                        action: local.violationPolicy?.action ?? "remove",
                        warnMessage: local.violationPolicy?.warnMessage ?? "",
                      },
                    })
                  }
                  className="w-16 bg-background border border-border rounded px-2 py-1 text-xs"
                />
                <span className="text-xs text-muted-foreground">horas (0 = sem expirar)</span>
                <span className="text-xs text-muted-foreground ml-2">Ação ao atingir:</span>
                <select
                  value={local.violationPolicy?.action ?? "remove"}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      violationPolicy: {
                        maxViolations: local.violationPolicy?.maxViolations ?? 3,
                        windowHours: local.violationPolicy?.windowHours ?? 24,
                        action: e.target.value as "warn" | "remove",
                        warnMessage: local.violationPolicy?.warnMessage ?? "",
                      },
                    })
                  }
                  className="bg-background border border-border rounded px-2 py-1 text-xs"
                >
                  <option value="remove">Remover do grupo</option>
                  <option value="warn">Só avisar de novo</option>
                </select>
              </div>
              <div className="mt-3 rounded border border-border bg-muted/20 p-3">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Aviso privado a cada violação
                </label>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  DM enviada ao membro toda vez que ele quebrar uma regra (antes de atingir o limite).
                  Variáveis: <code>{"{nome}"}</code>, <code>{"{grupo}"}</code>, <code>{"{regra}"}</code>,{" "}
                  <code>{"{atual}"}</code>, <code>{"{limite}"}</code>.
                </p>
                <textarea
                  rows={3}
                  placeholder="Oi {nome}, você quebrou a regra ({regra}) no grupo {grupo}. Aviso {atual}/{limite}, no próximo você será removido(a)."
                  value={local.violationPolicy?.warnMessage ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      violationPolicy: {
                        maxViolations: local.violationPolicy?.maxViolations ?? 3,
                        windowHours: local.violationPolicy?.windowHours ?? 24,
                        action: local.violationPolicy?.action ?? "remove",
                        warnMessage: e.target.value,
                      },
                    })
                  }
                  className="w-full mt-2 bg-background border border-border rounded px-2 py-1.5 text-xs resize-y"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs pt-4 border-t border-border">
              <input
                type="checkbox"
                checked={local.onlyAdmins ?? false}
                onChange={(e) => setLocal({ ...local, onlyAdmins: e.target.checked })}
              />
              Só administradores podem enviar mensagens
            </label>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">
              <span className="mr-auto text-xs text-muted-foreground">{dirty?"Alterações não salvas":"Sem alterações pendentes"}</span>
              <button
                onClick={async () => {
                  if (!workspaceId || savingRef.current) return;
                  savingRef.current=true; setSaving(true);
                  const savedGroupId=g.id, snapshot=structuredClone(local);
                  try {
                    const result=await saveFn({ data: { workspaceId, groupId: savedGroupId, rules: snapshot as Record<string, unknown> } });
                    if(!live.current)return;
                    if(result?.ok!==true)throw new Error("O servidor não confirmou o salvamento das regras.");
                    markSaved(savedGroupId,snapshot);onChange();toast.success("Regras salvas com sucesso.");
                  } catch(error) {
                    if(live.current)toast.error(error instanceof Error?error.message:"Não foi possível salvar as regras.");
                  } finally {
                    savingRef.current=false;if(live.current)setSaving(false);
                  }
                }}
                disabled={saving}
                className="text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold inline-flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar todas as regras
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs"
        />
      )}
    </div>
  );
}

/* ---------- Bots de grupo tab ---------- */

function BotsGrupoTab({
  bots,
  loading,
  onChange,
}: {
  bots: Bot[];
  loading: boolean;
  onChange: () => void;
}) {
  const dupBot = useServerFn(duplicateSalesbot);
  const delBot = useServerFn(deleteSalesbot);
  // Bot alvo do diálogo "Duplicar" (escolha do nome da cópia).
  const [dupTarget, setDupTarget] = useState<Bot | null>(null);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <p className="text-xs text-muted-foreground max-w-lg">
          Estes são Salesbots com escopo <strong className="text-foreground">Grupo</strong>. Eles têm gatilhos, blocos e regras
          próprios (broadcast, moderação, boas-vindas, palavra-chave em grupo) e nunca se misturam com bots 1-a-1.
        </p>
        <a
          href="/crm/automacoes?escopo=grupo&novo=1"
          className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted inline-flex items-center gap-1.5"
        >
          <Bot className="w-3.5 h-3.5" /> Criar bot de grupo
        </a>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-8 text-center">Carregando...</div>
      ) : bots.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded">
          <p className="text-xs text-muted-foreground">Nenhum Salesbot de grupo criado.</p>
          <a
            href="/crm/automacoes?escopo=grupo&novo=1"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90"
          >
            <Bot className="w-3.5 h-3.5" /> Criar bot de grupo
          </a>
        </div>

      ) : (
        <ul className="divide-y divide-border border border-border rounded">
          {bots.map((b) => (
            <li key={b.id} data-slim-group-bot-id={b.id} className="px-3 py-2.5 flex flex-wrap items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground flex-1">{b.nome}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  b.ativo ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                }`}
              >
                {b.ativo ? "Ativo" : "Pausado"}
              </span>
              <button
                onClick={() => setDupTarget(b)}
                className="text-muted-foreground hover:text-foreground"
                title="Duplicar bot"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Excluir o bot "${b.nome}"?`)) return;
                  await delBot({ data: { id: b.id } });
                  onChange();
                }}
                className="text-destructive hover:opacity-80"
                title="Excluir bot"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <DuplicateNameDialog
        open={!!dupTarget}
        originalName={dupTarget?.nome ?? ""}
        title="Duplicar bot de grupo"
        maxLength={80}
        onCancel={() => setDupTarget(null)}
        onConfirm={async (name) => {
          if (!dupTarget) return;
          try {
            await dupBot({ data: { id: dupTarget.id, name } });
            onChange();
            toast.success("Bot duplicado.");
          } catch {
            toast.error("Não foi possível duplicar o bot. Tente de novo.");
          }
          setDupTarget(null);
        }}
      />
    </div>
  );
}

/* ---------- Agentes IA tab ---------- */

function AgentesGrupoTab({
  workspaceId,
  agents,
  loading,
  onChange,
}: {
  workspaceId: string | null;
  agents: Agent[];
  loading: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [templateSeed, setTemplateSeed] = useState<AgentTemplateData | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [newMode, setNewMode] = useState<AgentMode>("prompt");
  const [sub, setSub] = useState<"agentes">("agentes");
  const delFn = useServerFn(deleteGroupAiAgent);
  const dupAgentFn = useServerFn(duplicateGroupAiAgent);
  // Agente alvo do diálogo "Duplicar" (escolha do nome da cópia).
  const [dupAgent, setDupAgent] = useState<Agent | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1 border-b border-border">
          <SubTabBtn active={sub === "agentes"} onClick={() => setSub("agentes")}>
            <Sparkles className="w-3.5 h-3.5" /> Agentes
          </SubTabBtn>
        </div>
        {sub === "agentes" && (
          <button
            onClick={() => {setNewMode("prompt");setTemplateSeed(null);setPickerOpen(true);}}
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Novo agente
          </button>
        )}
      </div>

      {sub === "agentes" ? (
        <>
          <p className="text-xs text-muted-foreground max-w-lg">
            Agentes de IA <strong className="text-foreground">exclusivos para grupos</strong>, persona, prompt,
            cooldown e gatilhos próprios, totalmente isolados dos agentes 1-a-1.
          </p>
          {loading ? (
            <div className="text-xs text-muted-foreground py-8 text-center">Carregando...</div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded">
              <p className="text-xs text-muted-foreground">Nenhum agente de grupo criado.</p>
              <button
                onClick={() => setPickerOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90"
              >
                <Plus className="w-3.5 h-3.5" /> Criar agente de grupo
              </button>
            </div>

          ) : (
            <ul className="divide-y divide-border border border-border rounded">
              {agents.map((a) => (
                <li key={a.id} className="px-3 py-2.5 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {a.persona || "Sem persona"} · {a.model} ·{" "}
                      {(a.triggers?.filter((t) => t.enabled).length ?? 0)} gatilho(s)
                    </div>
                  </div>
                  <button onClick={() => setEditing(a)} className="text-muted-foreground hover:text-foreground" title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDupAgent(a)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Duplicar"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!workspaceId) return;
                      if (!confirm(`Excluir agente "${a.name}"?`)) return;
                      await delFn({ data: { workspaceId, agentId: a.id } });
                      onChange();
                    }}
                    className="text-destructive hover:opacity-80"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <GroupAgentReport workspaceId={workspaceId} />
      )}

      <DuplicateNameDialog
        open={!!dupAgent}
        originalName={dupAgent?.name ?? ""}
        title="Duplicar agente de grupo"
        maxLength={120}
        onCancel={() => setDupAgent(null)}
        onConfirm={async (name) => {
          if (!workspaceId || !dupAgent) return;
          try {
            await dupAgentFn({ data: { workspaceId, agentId: dupAgent.id, name } });
            onChange();
            toast.success("Agente duplicado.");
          } catch {
            toast.error("Não foi possível duplicar o agente. Tente de novo.");
          }
          setDupAgent(null);
        }}
      />

      {pickerOpen && (
        <AgentTemplatePicker
          scope="grupo"
          onClose={() => setPickerOpen(false)}
          onPickBlank={() => {
            setPickerOpen(false);
            setTemplateSeed(null);
            setCreating(true);
          }}
          onPickTemplate={(data) => {
            setPickerOpen(false);
            setTemplateSeed(data);
            setCreating(true);
          }}
        />
      )}

      {(creating || editing) && (
        <AgentEditor
          workspaceId={workspaceId}
          forcedMode={creating ? newMode : undefined}
          initial={editing ?? (templateSeed ? ({
            id: "",
            name: templateSeed.name,
            persona: templateSeed.persona,
            system_prompt: templateSeed.systemPrompt,
            model: "",
            temperature: 0.7,
            max_tokens: 1024,
            respond_only_when_mentioned: false,
            cooldown_seconds: 15,
            enabled: true,
          } as Agent) : undefined)}
          onClose={() => {
            setCreating(false);
            setEditing(null);
            setTemplateSeed(null);
          }}
          onSaved={() => {
            // Salvar não fecha a janela — apenas atualiza a lista.
            onChange();
          }}
        />
      )}

    </div>
  );
}

function SubTabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 rounded-t border-b-2 -mb-px transition-colors ${
        active ? "text-foreground border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function GroupAgentReport({ workspaceId }: { workspaceId: string | null }) {
  const statsFn = useServerFn(getGroupAgentStats);
  const q = useQuery({
    queryKey: ["group-agent-stats", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => (await statsFn({ data: { workspaceId: workspaceId! } })) as GroupAgentStat[],
  });

  if (q.isLoading) return <div className="p-5 text-xs text-muted-foreground text-center">Carregando relatório...</div>;
  if(q.isError)return <div role="alert" className="p-5 text-sm text-destructive">Relatório de grupos indisponível. A falha de consulta não representa ausência de atendimentos.</div>;
  const stats = q.data ?? [];
  if (stats.length === 0) {
    return (
      <div className="text-center py-12 text-xs text-muted-foreground border border-dashed border-border rounded">
        Nenhum agente de grupo com dados ainda.
      </div>
    );
  }

  const totals = stats.reduce(
    (acc, s) => ({
      messages: acc.messages + s.messages_handled,
      mentions: acc.mentions + s.mentions_answered,
      warnings: acc.warnings + s.warnings_issued,
      removed: acc.removed + s.members_removed,
      groups: acc.groups + s.groups_covered,
    }),
    { messages: 0, mentions: 0, warnings: 0, removed: 0, groups: 0 },
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Métricas próprias de <strong className="text-foreground">agentes de grupo</strong>: moderação, menções
        respondidas, avisos e remoções por anti-flood, dados alimentados conforme os agentes atuam nos grupos.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi label="Grupos cobertos" value={totals.groups} />
        <Kpi label="Mensagens tratadas" value={totals.messages} />
        <Kpi label="Menções respondidas" value={totals.mentions} />
        <Kpi label="Avisos anti-flood" value={totals.warnings} />
        <Kpi label="Membros removidos" value={totals.removed} />
      </div>
      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Agente</th>
              <th className="px-3 py-2 text-right">Grupos</th>
              <th className="px-3 py-2 text-right">Msgs</th>
              <th className="px-3 py-2 text-right">Menções</th>
              <th className="px-3 py-2 text-right">Avisos</th>
              <th className="px-3 py-2 text-right">Removidos</th>
              <th className="px-3 py-2 text-right">Objetivo</th>
              <th className="px-3 py-2 text-right">Média msgs/run</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {stats.map((s) => (
              <tr key={s.agent_id}>
                <td className="px-3 py-2 font-medium">{s.agent_name}</td>
                <td className="px-3 py-2 text-right">{s.groups_covered}</td>
                <td className="px-3 py-2 text-right">{s.messages_handled}</td>
                <td className="px-3 py-2 text-right">{s.mentions_answered}</td>
                <td className="px-3 py-2 text-right">{s.warnings_issued}</td>
                <td className="px-3 py-2 text-right">{s.members_removed}</td>
                <td className="px-3 py-2 text-right">{(s.objective_rate * 100).toFixed(0)}%</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{s.avg_messages_per_run.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}


const GPT_MODELS = [
  { id: "openai/gpt-5.5", label: "GPT-5.5 (recomendado)" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 mini (rápido)" },
  { id: "openai/gpt-5.4-nano", label: "GPT-5.4 nano (barato)" },
];

const LANGUAGES: Array<{ id: string; label: string }> = [
  { id: "pt-BR", label: "Português (Brasil)" },
  { id: "en-US", label: "Inglês (EUA)" },
  { id: "es-ES", label: "Espanhol" },
  { id: "fr-FR", label: "Francês" },
  { id: "it-IT", label: "Italiano" },
  { id: "de-DE", label: "Alemão" },
];

/** Campo → operadores válidos → placeholder. Cada campo só aceita operadores que fazem sentido. */
const RULE_FIELDS: Array<{
  id: string;
  label: string;
  ops: string[];
  valueType: "text" | "number";
  placeholder: string;
}> = [
  {
    id: "mensagem-membro",
    label: "Mensagem do membro",
    ops: ["contem", "igual", "diferente"],
    valueType: "text",
    placeholder: "ex: preço, cancelar, ajuda...",
  },
  {
    id: "interacoes",
    label: "Nº de interações do membro no grupo",
    ops: ["maior", "menor", "igual"],
    valueType: "number",
    placeholder: "ex: 5",
  },
  {
    id: "sem-resposta-min",
    label: "Tempo sem resposta do membro",
    ops: ["maior", "menor"],
    valueType: "number",
    placeholder: "ex: 30",
  },
  {
    id: "tag-lead",
    label: "Tag do lead correspondente",
    ops: ["igual", "diferente", "contem"],
    valueType: "text",
    placeholder: "ex: cliente-vip",
  },
  {
    id: "membros-grupo",
    label: "Total de membros no grupo",
    ops: ["maior", "menor", "igual"],
    valueType: "number",
    placeholder: "ex: 100",
  },
];

const RULE_OPS: Array<{ id: string; label: string }> = [
  { id: "contem", label: "contém" },
  { id: "igual", label: "é igual a" },
  { id: "diferente", label: "é diferente de" },
  { id: "maior", label: "é maior que" },
  { id: "menor", label: "é menor que" },
];

/** Ações executáveis pelo agente quando a regra dispara. */
const RULE_ACTIONS: Array<{ id: string; label: string; needsTarget: boolean; targetLabel?: string }> = [
  { id: "responder-grupo", label: "Responder no grupo", needsTarget: true, targetLabel: "Mensagem" },
  { id: "responder-privado", label: "Responder no privado (DM)", needsTarget: true, targetLabel: "Mensagem" },
  { id: "mencionar-admin", label: "Mencionar admin", needsTarget: false },
  { id: "remover-membro", label: "Remover membro do grupo", needsTarget: false },
  { id: "adicionar-tag", label: "Adicionar tag ao lead", needsTarget: true, targetLabel: "Tag" },
  { id: "criar-tarefa", label: "Criar tarefa no CRM", needsTarget: true, targetLabel: "Descrição" },
  { id: "mudar-etapa", label: "Mover lead para etapa", needsTarget: true, targetLabel: "Etapa do funil" },
  { id: "iniciar-bot", label: "Iniciar salesbot de grupo", needsTarget: true, targetLabel: "Salesbot" },
  { id: "enviar-arquivo", label: "Enviar arquivo no grupo", needsTarget: true, targetLabel: "Arquivo" },
  { id: "encerrar-conversa", label: "Encerrar conversa no CRM", needsTarget: false },
];


type AgentRule = {
  id?: string;
  logic: "e" | "ou";
  conditions: Array<{ field: string; op: string; value: string }>;
  action: { type: string; target: string; targetLabel?: string };
};

type AgentSessionSettings = {
  mode: "grupo-aberto" | "por-membro";
  open_on: "regra" | "palavra-chave" | "mencao" | "pergunta";
  open_keywords: string;
  respond_in: "grupo" | "privado" | "ambos";
  timeout_minutes: number;
  max_concurrent: number;
  intro_message: string;
};

type AgentSettings = {
  mode?: "prompt" | "objetivos";
  language?: string;
  max_interactions?: number;
  allowed_actions?: string[];
  rules?: AgentRule[];
  sources?: AgentSource[];
  actions?: AgentAction[];
  outcome?: AgentOutcomeStep[] | { action: string; target: string; farewell?: string };
  session?: AgentSessionSettings;
};

const DEFAULT_SESSION: AgentSessionSettings = {
  mode: "grupo-aberto",
  open_on: "regra",
  open_keywords: "",
  respond_in: "grupo",
  timeout_minutes: 15,
  max_concurrent: 0,
  intro_message: "",
};


function readGroupAgentSettings(a: Agent | undefined): AgentSettings {
  const meta = (a?.metadata ?? null) as { settings?: AgentSettings } | null;
  return meta?.settings ?? {};
}

function GroupSessionModeEditor({
  value,
  onChange,
}: {
  value: AgentSessionSettings;
  onChange: (v: AgentSessionSettings) => void;
}) {
  const set = <K extends keyof AgentSessionSettings>(k: K, v: AgentSessionSettings[K]) =>
    onChange({ ...value, [k]: v });
  const isPerMember = value.mode === "por-membro";
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 space-y-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Modo de sessão no grupo
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
          Como o agente atende dentro do grupo. Em <strong className="text-foreground">Sessão por membro</strong> ele
          abre um atendimento individual quando alguém dispara o gatilho (ex: pergunta de suporte) e conversa <em>só com
          aquela pessoa</em> até resolver, outros membros podem abrir suas próprias sessões em paralelo.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label
          className={`cursor-pointer rounded border px-3 py-2 text-xs ${
            value.mode === "grupo-aberto" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <input
            type="radio"
            name="session-mode"
            className="mr-2"
            checked={value.mode === "grupo-aberto"}
            onChange={() => set("mode", "grupo-aberto")}
          />
          <span className="font-semibold text-foreground">Grupo aberto</span>
          <div className="text-[11px] text-muted-foreground mt-1">
            Responde no grupo para qualquer membro que dispare uma regra/gatilho. Sem estado por pessoa.
          </div>
        </label>
        <label
          className={`cursor-pointer rounded border px-3 py-2 text-xs ${
            isPerMember ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <input
            type="radio"
            name="session-mode"
            className="mr-2"
            checked={isPerMember}
            onChange={() => set("mode", "por-membro")}
          />
          <span className="font-semibold text-foreground">Sessão por membro</span>
          <div className="text-[11px] text-muted-foreground mt-1">
            Abre um atendimento individual (suporte, dúvida, qualificação) para cada membro que ativar o gatilho.
            Sessões rodam em paralelo.
          </div>
        </label>
      </div>

      {isPerMember && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Abre sessão quando
              </label>
              <select
                value={value.open_on}
                onChange={(e) => set("open_on", e.target.value as AgentSessionSettings["open_on"])}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
              >
                <option value="regra">Uma regra condicional dispara</option>
                <option value="palavra-chave">Membro usa palavra-chave</option>
                <option value="mencao">Membro menciona o agente/@bot</option>
                <option value="pergunta">Membro faz pergunta (detecção por IA)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Onde responder
              </label>
              <select
                value={value.respond_in}
                onChange={(e) => set("respond_in", e.target.value as AgentSessionSettings["respond_in"])}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
              >
                <option value="grupo">No grupo, marcando o membro</option>
                <option value="privado">Puxa a conversa pro privado (DM)</option>
                <option value="ambos">Notifica no grupo e continua no privado</option>
              </select>
            </div>
          </div>

          {value.open_on === "palavra-chave" && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Palavras-chave (separadas por vírgula)
              </label>
              <input
                value={value.open_keywords}
                onChange={(e) => set("open_keywords", e.target.value)}
                placeholder="suporte, ajuda, dúvida, preço"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mensagem de abertura <span className="normal-case text-muted-foreground/70">(opcional)</span>
            </label>
            <input
              value={value.intro_message}
              onChange={(e) => set("intro_message", e.target.value)}
              placeholder="Ex: Oi @nome, vi sua dúvida, te ajudo por aqui 👇"
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Timeout sem resposta (min)
              </label>
              <input
                type="number"
                min={1}
                max={1440}
                value={value.timeout_minutes}
                onChange={(e) => set("timeout_minutes", parseInt(e.target.value || "0", 10))}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Máx. sessões simultâneas <span className="normal-case text-muted-foreground/70">(0 = ilimitado)</span>
              </label>
              <input
                type="number"
                min={0}
                max={500}
                value={value.max_concurrent}
                onChange={(e) => set("max_concurrent", parseInt(e.target.value || "0", 10))}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
              />
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground leading-snug">
            Cada sessão é isolada por membro: histórico, contador de interações e "Objetivo do agente" contam por
            pessoa. Encerramento segue a etapa <strong className="text-foreground">Objetivo do agente</strong> acima.
          </p>
        </div>
      )}
    </div>
  );
}



function AgentEditor({
  workspaceId,
  initial,
  forcedMode,
  onClose,
  onSaved,
}: {
  workspaceId: string | null;
  initial?: Agent;
  /** Tipo escolhido na criação. Depois de definido não muda mais. */
  forcedMode?: AgentMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialTree = useMemo<ObjectiveTree>(() => {
    const meta = (initial?.metadata ?? null) as { objective_tree?: ObjectiveTree } | null;
    if (meta && meta.objective_tree && meta.objective_tree.root) return meta.objective_tree;
    return emptyTree();
  }, [initial]);
  const initialSettings = useMemo(() => readGroupAgentSettings(initial), [initial]);

  // Tipo é definitivo: vem da escolha na criação ou do que já está salvo.
  const mode: AgentMode = "prompt";
  const legacyNeedsReview=isLegacyObjectiveAgent(initial?.metadata);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    persona: initial?.persona ?? "",
    systemPrompt: initial?.system_prompt ?? "",
    model: initial?.model && initial.model.startsWith("openai/") ? initial.model : GPT_MODELS[0].id,
    cooldownSeconds: initial?.cooldown_seconds ?? 30,
    language: initialSettings.language ?? "pt-BR",
    maxInteractions: initialSettings.max_interactions ?? 0,
    enabled: initial?.enabled ?? true,
  });
  const [rules, setRules] = useState<AgentRule[]>(initialSettings.rules ?? []);
  const [sources, setSources] = useState<AgentSource[]>(initialSettings.sources ?? []);
  const [actions, setActions] = useState<AgentAction[]>(initialSettings.actions ?? []);
  const [outcome, setOutcome] = useState<AgentOutcomeStep[]>(normalizeOutcome(initialSettings.outcome));
  const [session, setSession] = useState<AgentSessionSettings>({
    ...DEFAULT_SESSION,
    ...(initialSettings.session ?? {}),
  });

  const [tree, setTree] = useState<ObjectiveTree>(initialTree);
  const [triggers, setTriggers] = useState<Trigger[]>(() => {
    if (initial?.triggers && initial.triggers.length > 0) return initial.triggers;
    if (initial?.respond_only_when_mentioned === false) {
      return [{ id: `t_${Date.now()}`, type: "all_messages", enabled: true, config: {} }];
    }
    return [{ id: `t_${Date.now()}`, type: "mention", enabled: true, config: {} }];
  });

  // Compat com backend: derivamos as ações permitidas das próprias regras.
  const allowedActions = useMemo(
    () => Array.from(new Set(rules.map((r) => r.action.type))),
    [rules],
  );


  const addRule = () =>
    setRules((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        logic: "e",
        conditions: [{ field: "mensagem-membro", op: "contem", value: "" }],
        action: { type: "responder-grupo", target: "" },
      },
    ]);
  const updateRule = (idx: number, patch: Partial<AgentRule>) =>
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const deleteRule = (idx: number) => setRules((prev) => prev.filter((_, i) => i !== idx));

  const addTrigger = (type: TriggerType) => {
    const defaults: Record<TriggerType, Record<string, unknown>> = {
      mention: {},
      all_messages: {},
      keyword: { keywords: "" },
      member_join: { message: "Bem-vindo(a) ao grupo! 👋" },
      member_leave: {},
      webhook: {},
      schedule: { cron: "0 9 * * *", message: "" },
      lead_stage_change: { pipelineId: "", stageId: "" },
      link_not_allowed: { message: "Links não são permitidos neste grupo." },
    };
    setTriggers((prev) => [
      ...prev,
      { id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, type, enabled: true, config: defaults[type] },
    ]);
  };
  const updateTrigger = (id: string, patch: Partial<Trigger>) => {
    setTriggers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };
  const updateTriggerConfig = (id: string, patch: Record<string, unknown>) => {
    setTriggers((prev) => prev.map((t) => (t.id === id ? { ...t, config: { ...t.config, ...patch } } : t)));
  };
  const removeTrigger = (id: string) => setTriggers((prev) => prev.filter((t) => t.id !== id));

  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [agentId, setAgentId] = useState<string | undefined>(initial?.id||undefined);
  const [saveVersion,setSaveVersion]=useState<string|undefined>((initial as (Agent&{updated_at?:string})|undefined)?.updated_at);
  const creationRequestId=useRef(crypto.randomUUID());
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const saveFn = useServerFn(upsertGroupAiAgent);

  const payloadRef = useRef<Record<string, unknown>>({});
  payloadRef.current = {
    workspaceId,
    id: agentId,
    creationRequestId:creationRequestId.current,
    expectedUpdatedAt:saveVersion,
    name: form.name,
    persona: form.persona,
    systemPrompt: form.systemPrompt,
    model: form.model,
    temperature: initial?.temperature ?? 0.7,
    maxTokens: initial?.max_tokens ?? 1024,
    respondOnlyWhenMentioned: initial?.respond_only_when_mentioned ?? true,
    cooldownSeconds: form.cooldownSeconds,
    enabled: form.enabled,
    triggers,
    mode,
    language: form.language,
    maxInteractions: form.maxInteractions,
    allowedActions,
    rules,
    sources,
    actions,
    outcome,
    session,
    // Archived objective_tree is not sent by this editor.
  };
  const savingRef = useRef(false);
  const lastSyncedRef = useRef<string>(JSON.stringify(payloadRef.current));
  const dirtySinceRef=useRef<number|null>(null);
  const failedSaveRef=useRef(false);
  const payloadSignature=JSON.stringify(payloadRef.current);
  useEffect(()=>{if(payloadSignature===lastSyncedRef.current)dirtySinceRef.current=null;else if(dirtySinceRef.current===null)dirtySinceRef.current=Date.now();},[payloadSignature]);

  /** Salva sem fechar a janela. `silent` = autosave de 1 minuto. */
  const doSave = useCallback(
    async (silent = false) => {
      if (savingRef.current) return;
      const payload = structuredClone(payloadRef.current);
      if(silent&&(failedSaveRef.current||((legacyNeedsReview||!agentId)&&!lastSavedAt)))return;
      const invalid=promptReadinessError(payload.systemPrompt);
      if(payload.enabled&&invalid){if(!silent)setErr(invalid);return;}
      if (!workspaceId) return;
      if (!String(payload.name ?? "").trim()) {
        if (!silent) setErr("Nome obrigatório");
        return;
      }
      const acaoIncompleta = (actions ?? []).find(
        (action) =>
          ((action.do.action === "sempre-usar-mensagem" || action.do.action === "sempre-responder-info") &&
            !(action.do.message ?? "").trim()) ||
          ([
            "sempre-falar-assunto",
            "tentar-falar-assunto",
            "nao-mencionar",
            "solicitar-cliente",
            "definir-campo",
            "gerenciar-tags",
            "criar-compromisso",
            "iniciar-salesbot",
            "mudar-etapa-lead",
            "alterar-responsavel",
            "enviar-arquivo",
          ].includes(action.do.action) && !(action.do.target ?? "").trim()) ||
          (action.do.action === "definir-campo" && !(action.do.target ?? "").includes("=")) ||
          (action.do.action === "adicionar-tarefa" && !(action.do.task?.title ?? "").trim()),
      );
      if (acaoIncompleta) {
        if (!silent) setErr("Preencha os campos obrigatórios das ações do agente.");
        return;
      }
      const snapshot = JSON.stringify(payload);
      if (silent && snapshot === lastSyncedRef.current) return;
      savingRef.current = true;
      setSaving(true);
      if (!silent) setErr(null);
      try {
        const res=(await saveFn({data:payload as never})) as {id:string;updatedAt:string};
        if(!res?.id||!res.updatedAt)throw new Error('O servidor não confirmou o salvamento. Confira a lista antes de tentar novamente.');
        setAgentId(res.id);setSaveVersion(res.updatedAt);failedSaveRef.current=false;
        lastSyncedRef.current=JSON.stringify({...payload,id:res.id,expectedUpdatedAt:res.updatedAt});
        dirtySinceRef.current=null;
        setLastSavedAt(new Date());
        onSaved();
      } catch (e) {
        failedSaveRef.current=true;setErr((e as Error).message);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [actions, onSaved, saveFn, workspaceId,legacyNeedsReview,agentId,lastSavedAt],
  );

  const saveLatest=useRef(doSave);saveLatest.current=doSave;
  useEffect(()=>{const timer=setInterval(()=>{if(dirtySinceRef.current!==null&&Date.now()-dirtySinceRef.current>=120000)void saveLatest.current(true);},1000);return()=>clearInterval(timer);},[]);
  const closeEditor=()=>{if(savingRef.current)return;if(JSON.stringify(payloadRef.current)!==lastSyncedRef.current&&!window.confirm('Existem alterações não salvas. Fechar sem salvar?'))return;onClose();};

  return (
    <>
    <Modal
      onClose={closeEditor}
      size="full"
      shift={testOpen}
      header={

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <AgentModeBadge mode={mode} />
            <span className="text-[10px] text-muted-foreground">Configuração por prompt. A árvore antiga não é executada no teste.</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {mode === "prompt"
              ? "Agente de Prompt, atua como moderador do grupo (responde, modera, aplica regras)."
              : "Fluxo de Objetivos, assume quando o moderador não consegue atender, seguindo os gatilhos configurados."}
          </p>
        </div>
      }
    >
      <div className="space-y-3">
        {legacyNeedsReview&&<p role="status" className="rounded border border-amber-500/30 p-3 text-xs">A árvore anterior está arquivada. Revise o prompt e clique em Salvar. O primeiro salvamento de conversão não é automático.</p>}
        <p role="status" className="text-xs text-muted-foreground">Configuração e teste do agente. O atendimento automático em grupos ainda precisa da integração de execução; salvar não inicia mensagens.</p>
        {mode === "prompt" ? (

          <>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Moderador do grupo VIP"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Idioma</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Máx. interações <span className="normal-case text-muted-foreground/70">(0 = ilimitado)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={form.maxInteractions}
                  onChange={(e) => setForm({ ...form, maxInteractions: parseInt(e.target.value || "0", 10) })}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Persona</label>
              <input
                value={form.persona}
                onChange={(e) => setForm({ ...form, persona: e.target.value })}
                placeholder="Ex: Moderador amigável e objetivo"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Prompt do sistema
              </label>
              <textarea
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                rows={6}
                placeholder="Manual do agente no grupo: tom de voz, o que responder, o que ignorar, quando chamar admin..."
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm font-mono mt-1"
              />
            </div>

            <AgentOutcomeEditor
              value={outcome}
              onChange={setOutcome}
              scope="grupo"
              title="Encerramento do atendimento no grupo"
              subtitle="Defina o encaminhamento ao concluir o atendimento ou atingir o limite de interações."
            />


            <GroupSessionModeEditor value={session} onChange={setSession} />



            <AgentSourcesEditor value={sources} onChange={setSources} />

            <AgentActionsEditor value={actions} onChange={setActions} />



            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Modelo</label>
                <select
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                >
                  {GPT_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cooldown (s)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.cooldownSeconds}
                  onChange={(e) => setForm({ ...form, cooldownSeconds: parseInt(e.target.value || "0", 10) })}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                />
              </div>
            </div>

            {/* "Ações que o agente pode tomar" foi removido, as ações agora
                vivem dentro de cada Regra condicional ("Então → ...") pra não duplicar
                com os Gatilhos do grupo. */}



          </>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Monte a <strong className="text-foreground">árvore de objetivos</strong> da conversa em grupo. A IA
              persegue cada objetivo em sequência; se a conversa fugir, ela identifica, responde e retoma.
            </p>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nome do agente</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Onboarding no grupo VIP"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1 mb-2"
              />
            </div>
            <p>O editor de objetivos foi retirado. Utilize o prompt.</p>

          </div>
        )}

        {/* Regras condicionais, comum aos dois modos (prompt e árvore) */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Regras condicionais
              </label>
              <p className="text-[10px] text-muted-foreground">
                Se acontecer X <em>(E/OU outras condições)</em>, o agente executa Y automaticamente.
                {mode === "objetivos" && <> Vale também dentro do fluxo de objetivo, a regra dispara em qualquer nó da árvore.</>}
              </p>
            </div>
            <button
              type="button"
              onClick={addRule}
              className="text-[11px] px-2 py-1 rounded border border-border hover:bg-muted inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Nova regra
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="text-[11px] text-muted-foreground text-center border border-dashed border-border rounded py-4">
              Sem regras, o agente segue apenas o {mode === "objetivos" ? "fluxo de objetivo" : "prompt do sistema"}.
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((r, idx) => (
                <RuleRow
                  key={r.id ?? idx}
                  rule={r}
                  onChange={(patch) => updateRule(idx, patch)}
                  onDelete={() => deleteRule(idx)}
                />
              ))}
            </div>
          )}
        </div>


        {/* Gatilhos, específicos de grupo */}
        <div className="mt-3 border border-border rounded p-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Gatilhos do grupo ({triggers.filter((t) => t.enabled).length} ativos)
            </div>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  addTrigger(e.target.value as TriggerType);
                  e.target.value = "";
                }
              }}
              className="text-[11px] bg-background border border-border rounded px-2 py-1"
            >
              <option value="">+ Adicionar gatilho</option>
              <option value="mention">Quando mencionado (@)</option>
              <option value="all_messages">Toda mensagem no grupo</option>
              <option value="keyword">Palavra-chave</option>
              <option value="member_join">Novo membro entra (boas-vindas)</option>
              <option value="member_leave">Membro sai (despedida)</option>
              <option value="webhook">Webhook externo</option>
              <option value="schedule">Agendamento (cron)</option>
              <option value="lead_stage_change">Lead muda de etapa (CRM)</option>
            </select>
          </div>
          {triggers.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic py-2 text-center">
              Nenhum gatilho. Adicione ao menos um para o agente disparar.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {triggers.map((t) => (
                <li key={t.id} className="border border-border rounded p-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={t.enabled}
                      onChange={(e) => updateTrigger(t.id, { enabled: e.target.checked })}
                    />
                    <span className="text-xs font-medium flex-1">{triggerLabel(t.type)}</span>
                    <button
                      onClick={() => removeTrigger(t.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Remover"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {t.type === "keyword" && (
                    <input
                      value={(t.config.keywords as string) ?? ""}
                      onChange={(e) => updateTriggerConfig(t.id, { keywords: e.target.value })}
                      placeholder="Palavras separadas por vírgula (ex: preço, ajuda, suporte)"
                      className="mt-1.5 w-full bg-background border border-border rounded px-2 py-1 text-xs"
                    />
                  )}
                  {t.type === "member_join" && (
                    <textarea
                      value={(t.config.message as string) ?? ""}
                      onChange={(e) => updateTriggerConfig(t.id, { message: e.target.value })}
                      rows={2}
                      placeholder="Mensagem de boas-vindas. Use {{nome}} para o novo membro."
                      className="mt-1.5 w-full bg-background border border-border rounded px-2 py-1 text-xs"
                    />
                  )}
                  {t.type === "member_leave" && (
                    <textarea
                      value={(t.config.message as string) ?? ""}
                      onChange={(e) => updateTriggerConfig(t.id, { message: e.target.value })}
                      rows={2}
                      placeholder="Mensagem quando alguém sai (opcional)"
                      className="mt-1.5 w-full bg-background border border-border rounded px-2 py-1 text-xs"
                    />
                  )}
                  {t.type === "schedule" && (
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <input
                        value={(t.config.cron as string) ?? ""}
                        onChange={(e) => updateTriggerConfig(t.id, { cron: e.target.value })}
                        placeholder="Cron (ex: 0 9 * * *)"
                        className="bg-background border border-border rounded px-2 py-1 text-xs"
                      />
                      <input
                        value={(t.config.message as string) ?? ""}
                        onChange={(e) => updateTriggerConfig(t.id, { message: e.target.value })}
                        placeholder="Mensagem/prompt"
                        className="bg-background border border-border rounded px-2 py-1 text-xs"
                      />
                    </div>
                  )}
                  {t.type === "webhook" && (
                    <div className="mt-2">
                      <AgentWebhookTrigger
                        agentId={initial?.id ?? null}
                        scope="grupo"
                        targetLabel="JID do grupo"
                        targetPlaceholder="1203xxxxxxxx@g.us"
                        value={{
                          enabled: t.enabled,
                          secret: (t.config.secret as string) ?? "",
                          target: (t.config.target as string) ?? "",
                          template: (t.config.template as string) ?? "",
                        }}
                        onChange={(v: WebhookTriggerValue) => {
                          updateTriggerConfig(t.id, {
                            secret: v.secret,
                            target: v.target,
                            template: v.template,
                          });
                          if (v.enabled !== t.enabled) {
                            setTriggers((prev) => prev.map((x) => x.id === t.id ? { ...x, enabled: v.enabled } : x));
                          }
                        }}
                      />
                    </div>
                  )}
                  {t.type === "lead_stage_change" && (
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <input
                        value={(t.config.pipelineId as string) ?? ""}
                        onChange={(e) => updateTriggerConfig(t.id, { pipelineId: e.target.value })}
                        placeholder="ID do funil (opcional)"
                        className="bg-background border border-border rounded px-2 py-1 text-xs"
                      />
                      <input
                        value={(t.config.stageId as string) ?? ""}
                        onChange={(e) => updateTriggerConfig(t.id, { stageId: e.target.value })}
                        placeholder="ID da etapa alvo"
                        className="bg-background border border-border rounded px-2 py-1 text-xs"
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Habilitado
        </label>

        {err && <div className="text-xs text-destructive">{err}</div>}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <span className="mr-auto text-xs text-muted-foreground">{payloadSignature!==lastSyncedRef.current?"Alterações não salvas":"Sem alterações pendentes"}</span>
          <button type="button" className="rounded border px-3 py-1.5 text-xs" disabled={saving||Boolean(promptReadinessError(form.systemPrompt))} onClick={()=>setTestOpen(true)}>Testar prompt</button>
          {lastSavedAt && !saving && (
            <span
              className="text-[11px] text-muted-foreground"
              title={`Último salvamento: ${lastSavedAt.toLocaleString("pt-BR")}`}
            >
              Salvo {lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={closeEditor} disabled={saving} className="text-xs px-3 py-1.5 rounded border border-border">
            Fechar
          </button>
          <button
            onClick={() => void doSave(false)}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {saving?"Salvando...":"Salvar"}
          </button>
        </div>
      </div>
    </Modal>
    <AgentTestChat
      workspaceId={workspaceId}
      open={testOpen}
      onOpenChange={setTestOpen}
      config={{
        scope: "grupo",
        mode,
        model: form.model,
        name: form.name,
        persona: form.persona,
        systemPrompt: form.systemPrompt,
        language: form.language,
        tree: mode === "objetivos" ? tree : null,
        sources,
        actions,
      }}
    />

    </>
  );
}


function RuleRow({
  rule,
  onChange,
  onDelete,
}: {
  rule: AgentRule;
  onChange: (patch: Partial<AgentRule>) => void;
  onDelete: () => void;
}) {
  const action = RULE_ACTIONS.find((a) => a.id === rule.action.type);
  return (
    <div className="border border-border rounded p-2 space-y-1.5 bg-background/60">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1.5">
          {rule.conditions.map((c, ci) => {
            const fieldDef = RULE_FIELDS.find((f) => f.id === c.field) ?? RULE_FIELDS[0];
            const validOps = RULE_OPS.filter((o) => fieldDef.ops.includes(o.id));
            return (
              <div key={ci} className="flex flex-wrap items-center gap-1.5">
                {ci > 0 && (
                  <select
                    value={rule.logic}
                    onChange={(e) => onChange({ logic: e.target.value as "e" | "ou" })}
                    className="bg-background border border-border rounded px-1 py-0.5 text-[10px] uppercase font-semibold"
                  >
                    <option value="e">E</option>
                    <option value="ou">OU</option>
                  </select>
                )}
                {ci === 0 && <span className="text-[10px] uppercase font-semibold text-muted-foreground w-6">Se</span>}
                <select
                  value={c.field}
                  onChange={(e) => {
                    const nextField = RULE_FIELDS.find((f) => f.id === e.target.value) ?? RULE_FIELDS[0];
                    const nextOp = nextField.ops.includes(c.op) ? c.op : nextField.ops[0];
                    const next = [...rule.conditions];
                    next[ci] = { field: nextField.id, op: nextOp, value: "" };
                    onChange({ conditions: next });
                  }}
                  className="bg-background border border-border rounded px-1.5 py-1 text-[11px]"
                >
                  {RULE_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                <select
                  value={c.op}
                  onChange={(e) => {
                    const next = [...rule.conditions];
                    next[ci] = { ...c, op: e.target.value };
                    onChange({ conditions: next });
                  }}
                  className="bg-background border border-border rounded px-1.5 py-1 text-[11px]"
                >
                  {validOps.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                {c.field === "tag-lead" ? (
                  <div className="flex-1 min-w-[160px]">
                    <AgentTargetField
                      kind="tag"
                      value={{ id: c.value, label: c.value }}
                      onChange={(v) => {
                        const next = [...rule.conditions];
                        next[ci] = { ...c, value: v.id };
                        onChange({ conditions: next });
                      }}
                    />
                  </div>
                ) : c.field === "sem-resposta-min" ? (
                  <DurationPicker
                    value={{ id: c.value }}
                    onChange={(v) => {
                      const next = [...rule.conditions];
                      next[ci] = { ...c, value: v.id };
                      onChange({ conditions: next });
                    }}
                  />
                ) : (
                  <input
                    type={fieldDef.valueType === "number" ? "number" : "text"}
                    value={c.value}
                    onChange={(e) => {
                      const next = [...rule.conditions];
                      next[ci] = { ...c, value: e.target.value };
                      onChange({ conditions: next });
                    }}
                    placeholder={fieldDef.placeholder}
                    className="flex-1 min-w-[120px] bg-background border border-border rounded px-1.5 py-1 text-[11px]"
                  />
                )}

                <button
                  type="button"
                  onClick={() => {
                    const next = rule.conditions.filter((_, i) => i !== ci);
                    onChange({ conditions: next.length ? next : rule.conditions });
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  title="Remover condição"
                  disabled={rule.conditions.length <= 1}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() =>
              onChange({
                conditions: [...rule.conditions, { field: "mensagem-membro", op: "contem", value: "" }],
              })
            }
            className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus className="w-2.5 h-2.5" /> Adicionar condição ({rule.logic.toUpperCase()})
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title="Remover regra"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/60">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground w-14">Então</span>
        <select
          value={rule.action.type}
          onChange={(e) => onChange({ action: { ...rule.action, type: e.target.value } })}
          className="bg-background border border-border rounded px-1.5 py-1 text-[11px]"
        >
          {RULE_ACTIONS.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
        {action?.needsTarget && (
          <div className="flex-1 min-w-0">
            <AgentTargetField
              kind={targetKindForAction(rule.action.type) ?? "texto"}
              scope={"grupo"}
              placeholder={action.targetLabel ?? "alvo"}
              value={{ id: rule.action.target, label: rule.action.targetLabel }}
              onChange={(v) => onChange({ action: { ...rule.action, target: v.id, targetLabel: v.label } })}
            />
          </div>
        )}
      </div>
    </div>
  );
}


function triggerLabel(type: TriggerType): string {
  const map: Record<TriggerType, string> = {
    mention: "Quando @mencionado",
    all_messages: "Toda mensagem no grupo",
    keyword: "Palavra-chave detectada",
    member_join: "Novo membro entra",
    member_leave: "Membro sai do grupo",
    webhook: "Webhook externo",
    schedule: "Agendamento (cron)",
    lead_stage_change: "Lead muda de etapa",
    link_not_allowed: "Link não permitido enviado",
  };
  return map[type];
}

// SLIM_GROUP_PROMPT_V1

// SLIM_GROUP_SALESBOTS_ONLY_V1

// SLIM_GROUP_CATALOG_UI_V1
