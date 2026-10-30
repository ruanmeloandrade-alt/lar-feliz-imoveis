/**
 * Seletores reutilizáveis para "alvos" de ações dos agentes de IA.
 *
 * Regra do produto: se o dado já existe no sistema (etapa, salesbot, usuário,
 * tag, formulário, arquivo), o usuário SELECIONA — nunca digita o nome.
 * Texto livre só onde o conteúdo é realmente livre (descrição, mensagem).
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Paperclip, Loader2, X } from "lucide-react";
import { listAllPipelineStages, listWorkspaceUsers } from "@/lib/crm.functions";
import { listWorkspaceTags, listLeadCustomFields } from "@/lib/leads.functions";
import { listForms } from "@/lib/forms.functions";
import { uploadSalesbotMedia, getSalesbotMediaSignedUrl, listSalesbotMedia, listSalesbots } from "@/lib/salesbots.functions";
import { listProductCatalogs } from "@/lib/products.functions";
import { listAgentSystemTargets, type AgentSystemTargets } from "@/lib/agent-system-targets.functions";
import { listWorkflowPipelinesLite } from "@/lib/workflow.functions";

export type TargetValue = { id: string; label?: string };
export type TargetChange = (v: { id: string; label: string }) => void;

const selCls = "w-full bg-background border border-border rounded px-2 py-1.5 text-xs";

function Hint({ value }: { value: TargetValue }) {
  if (!value.id || !value.label) return null;
  return <p className="text-[10px] text-muted-foreground mt-1">→ {value.label}</p>;
}

/* ---------------------------------------------------------------- etapa --- */

export function StagePicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const fn = useServerFn(listAllPipelineStages);
  const q = useQuery({
    queryKey: ["agent-target-stages"],
    queryFn: async () =>
      (await fn({})) as { pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }> },
    staleTime: 60_000,
  });
  const pipelines = q.data?.pipelines ?? [];
  const empty = pipelines.every((p) => p.stages.length === 0);

  return (
    <div>
      <select
        value={value.id}
        onChange={(e) => {
          const id = e.target.value;
          let label = "";
          for (const p of pipelines) {
            const s = p.stages.find((x) => x.id === id);
            if (s) { label = `${p.name} · ${s.name}`; break; }
          }
          onChange({ id, label });
        }}
        className={selCls}
      >
        <option value="">
          {q.isLoading ? "Carregando etapas…" : empty ? "Nenhum funil cadastrado" : "Selecione a etapa do funil…"}
        </option>
        {pipelines.map((p) => (
          <optgroup key={p.id} label={p.name}>
            {p.stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <Hint value={value} />
    </div>
  );
}

/* -------------------------------------------------------------- salesbot -- */

export function BotPicker({
  value,
  scope = "individual",
  onChange,
}: {
  value: TargetValue;
  scope?: "individual" | "grupo";
  onChange: TargetChange;
}) {
  // Fonte da verdade é o banco (o localStorage ficava desatualizado entre abas).
  const fn = useServerFn(listSalesbots);
  const q = useQuery({
    queryKey: ["agent-target-salesbots", scope],
    queryFn: async () => (await fn()) as { bots: Array<{ id: string; name: string | null }> },
    staleTime: 30_000,
  });
  const bots = q.data?.bots ?? [];

  return (
    <div>
      <select
        value={value.id}
        onChange={(e) => {
          const id = e.target.value;
          const bot = bots.find((b) => b.id === id);
          onChange({ id, label: bot?.name?.trim() || "Bot sem nome" });
        }}
        className={selCls}
      >
        <option value="">
          {q.isLoading
            ? "Carregando salesbots…"
            : bots.length === 0
              ? "Nenhum salesbot cadastrado"
              : "Selecione o salesbot…"}
        </option>
        {bots.map((b) => (
          <option key={b.id} value={b.id}>{b.name?.trim() || "Bot sem nome"}</option>
        ))}
      </select>
      <Hint value={value} />
    </div>
  );
}

/* ----------------------------------------------------------- formulário --- */

export function FormPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const listFn = useServerFn(listForms);
  const q = useQuery({ queryKey: ["agent-target-forms"], queryFn: () => listFn(), staleTime: 30_000 });
  const forms: Array<{ id: string; nome: string }> = (q.data as Array<{ id: string; nome: string }> | undefined) ?? [];

  return (
    <div>
      <select
        value={value.id}
        onChange={(e) => {
          const id = e.target.value;
          const f = forms.find((x) => x.id === id);
          onChange({ id, label: f?.nome?.trim() || "Formulário" });
        }}
        className={selCls}
      >
        <option value="">
          {q.isLoading ? "Carregando…" : forms.length === 0 ? "Nenhum formulário cadastrado" : "Selecione o formulário…"}
        </option>
        {forms.map((f) => (
          <option key={f.id} value={f.id}>{f.nome}</option>
        ))}
      </select>
      <Hint value={value} />
    </div>
  );
}

/* ------------------------------------------------------------- pausa ------ */

/**
 * Pausa: aguardar resposta do lead ou tempo de inatividade.
 * id guarda o JSON da configuração.
 */
export function PauseActionPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const cfg = (() => {
    try {
      return JSON.parse(value.id || "{}");
    } catch {
      return {};
    }
  })();
  
  const kind = (cfg.kind as "resposta" | "tempo") || "resposta";
  const minutes = Number(cfg.minutes ?? 30);

  const commit = (patch: any) => {
    const next = { kind, minutes, ...patch };
    const label = next.kind === "resposta" 
      ? "Aguardar resposta do lead" 
      : `Aguardar ${next.minutes} min de inatividade`;
    onChange({ id: JSON.stringify(next), label });
  };

  return (
    <div className="space-y-2">
      <select 
        value={kind} 
        onChange={(e) => commit({ kind: e.target.value })}
        className={selCls}
      >
        <option value="resposta">Até o lead responder</option>
        <option value="tempo">Tempo de inatividade (X min)</option>
      </select>
      
      {kind === "tempo" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => commit({ minutes: parseInt(e.target.value || "1", 10) })}
            className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs"
            placeholder="Minutos"
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">minutos</span>
        </div>
      )}
      
      <p className="text-[9px] text-muted-foreground">
        {kind === "resposta" 
          ? "O fluxo fica pausado e só continua quando o lead enviar qualquer mensagem." 
          : "O fluxo continua automaticamente se o lead ficar esse tempo sem falar."}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- usuário --- */

export function UserPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const fn = useServerFn(listWorkspaceUsers);
  const q = useQuery({
    queryKey: ["agent-target-users"],
    queryFn: async () => (await fn()) as { users: Array<{ id: string; name: string; email: string | null }> },
    staleTime: 60_000,
  });
  const users = q.data?.users ?? [];

  return (
    <div>
      <select
        value={value.id}
        onChange={(e) => {
          const id = e.target.value;
          const u = users.find((x) => x.id === id);
          onChange({ id, label: u ? (u.name || u.email || "Usuário") : "" });
        }}
        className={selCls}
      >
        <option value="">
          {q.isLoading ? "Carregando equipe…" : users.length === 0 ? "Nenhum usuário no workspace" : "Selecione o responsável…"}
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}{u.email ? ` · ${u.email}` : ""}</option>
        ))}
      </select>
      <Hint value={value} />
    </div>
  );
}

/* ------------------------------------------------------------------ tag --- */

export function TagPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const fn = useServerFn(listWorkspaceTags);
  const q = useQuery({
    queryKey: ["agent-target-tags"],
    queryFn: async () => (await fn()) as { tags: string[] },
    staleTime: 60_000,
  });
  const tags = q.data?.tags ?? [];
  const [focused, setFocused] = useState(false);
  const typed = value.id ?? "";
  const matches = useMemo(() => {
    const t = typed.trim().toLowerCase();
    const base = t ? tags.filter((x) => x.toLowerCase().includes(t)) : tags;
    return base.slice(0, 8);
  }, [tags, typed]);
  const exact = tags.some((t) => t.toLowerCase() === typed.trim().toLowerCase());

  return (
    <div className="relative">
      <input
        value={typed}
        onChange={(e) => onChange({ id: e.target.value, label: e.target.value })}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        placeholder={q.isLoading ? "Carregando tags…" : "Digite para buscar ou criar uma tag…"}
        className={selCls}
      />
      {focused && (matches.length > 0 || (typed.trim() && !exact)) && (
        <div className="absolute z-30 mt-1 w-full rounded border border-border bg-popover shadow-md max-h-44 overflow-auto">
          {matches.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange({ id: t, label: t }); setFocused(false); }}
              className="block w-full text-left px-2 py-1.5 text-xs hover:bg-muted"
            >
              {t}
            </button>
          ))}
          {typed.trim() && !exact && (
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-t border-border">
              Enter cria a tag nova “{typed.trim()}”
            </div>
          )}
        </div>
      )}
      {typed.trim() && !exact && !focused && (
        <p className="text-[10px] text-muted-foreground mt-1">Nova tag: {typed.trim()}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- tópicos --- */

/** Lista de tópicos/assuntos em chips — evita a dúvida de "separo por vírgula?". */
export function TopicsPicker({
  value,
  onChange,
  placeholder,
}: {
  value: TargetValue;
  onChange: TargetChange;
  placeholder?: string;
}) {
  const items = (value.id ?? "").split("|").map((t) => t.trim()).filter(Boolean);
  const [draft, setDraft] = useState("");
  const commit = (list: string[]) => onChange({ id: list.join(" | "), label: list.join(", ") });
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (!items.some((x) => x.toLowerCase() === t.toLowerCase())) commit([...items, t]);
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-2 py-0.5 text-[11px]">
              {t}
              <button type="button" onClick={() => commit(items.filter((x) => x !== t))} className="hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          if (e.key === "Backspace" && !draft && items.length) commit(items.slice(0, -1));
        }}
        onBlur={add}
        placeholder={placeholder ?? "digite um tópico e aperte Enter"}
        className={selCls}
      />
      <p className="text-[10px] text-muted-foreground">Um tópico por vez: digite e aperte Enter para adicionar outro.</p>
    </div>
  );
}

/* --------------------------------------------- campo personalizado (=) --- */

type CustomField = { id: string; name: string; fieldType: string; options: string[] };

function useCustomFields() {
  const fn = useServerFn(listLeadCustomFields);
  const q = useQuery({
    queryKey: ["agent-target-custom-fields"],
    queryFn: async () => (await fn()) as { fields: CustomField[] },
    staleTime: 60_000,
  });
  return { fields: q.data?.fields ?? [], loading: q.isLoading };
}

/** Alvo no formato `fieldId=valor`. O campo é SEMPRE escolhido da lista real. */
export function CustomFieldPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const { fields, loading } = useCustomFields();
  const [fieldId, val] = (() => {
    const raw = value.id ?? "";
    const i = raw.indexOf("=");
    return i === -1 ? [raw, ""] : [raw.slice(0, i), raw.slice(i + 1)];
  })();
  const field = fields.find((f) => f.id === fieldId);
  const emit = (fid: string, v: string) => {
    const f = fields.find((x) => x.id === fid);
    onChange({ id: fid ? `${fid}=${v}` : "", label: f ? `${f.name}${v ? ` = ${v}` : ""}` : "" });
  };

  return (
    <div className="space-y-1.5">
      <select value={fieldId} onChange={(e) => emit(e.target.value, "")} className={selCls}>
        <option value="">
          {loading ? "Carregando campos…" : fields.length === 0 ? "Nenhum campo personalizado cadastrado" : "Selecione o campo personalizado…"}
        </option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
      {field && (
        field.options.length > 0 ? (
          <select value={val} onChange={(e) => emit(fieldId, e.target.value)} className={selCls}>
            <option value="">Selecione o valor…</option>
            {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            value={val}
            onChange={(e) => emit(fieldId, e.target.value)}
            placeholder={field.fieldType === "date" ? "AAAA-MM-DD ou {{agora}}" : "valor a gravar no campo"}
            className={selCls}
          />
        )
      )}
      <Hint value={value} />
    </div>
  );
}

/* -------------------------------------------- solicitar dados ao cliente -- */

const REQUEST_PRESETS = ["nome completo", "e-mail", "telefone", "CPF/CNPJ", "endereço", "data de nascimento"];

/** O que pedir ao cliente: presets + campos personalizados reais + texto livre. */
export function RequestPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const { fields } = useCustomFields();
  const items = (value.id ?? "").split("|").map((t) => t.trim()).filter(Boolean);
  const [draft, setDraft] = useState("");
  const commit = (list: string[]) => onChange({ id: list.join(" | "), label: list.join(", ") });
  const toggle = (t: string) =>
    commit(items.some((x) => x.toLowerCase() === t.toLowerCase()) ? items.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...items, t]);

  const options = [...REQUEST_PRESETS, ...fields.map((f) => f.name)];

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {options.map((t) => {
          const on = items.some((x) => x.toLowerCase() === t.toLowerCase());
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {t}
            </button>
          );
        })}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const t = draft.trim();
            if (t && !items.some((x) => x.toLowerCase() === t.toLowerCase())) commit([...items, t]);
            setDraft("");
          }
        }}
        placeholder="ou digite outra informação e aperte Enter"
        className={selCls}
      />
      {items.length > 0 && <p className="text-[10px] text-muted-foreground">O agente vai pedir: {items.join(", ")}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- arquivo -- */

/**
 * Arquivo: sobe do computador (bucket salesbot-media) ou aceita um link.
 * `id` guarda o storage path (ou a URL, quando colada).
 */
export function FilePicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const uploadFn = useServerFn(uploadSalesbotMedia);
  const signFn = useServerFn(getSalesbotMediaSignedUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    if (file.size > 20 * 1024 * 1024) { setErr("Máx. 20 MB por arquivo."); return; }
    const kind = file.type.startsWith("image/") ? "image"
      : file.type.startsWith("video/") ? "video"
      : file.type.startsWith("audio/") ? "audio"
      : "document";
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
      const r = await uploadFn({
        data: { fileName: file.name, mimeType: file.type || "application/octet-stream", kind: kind as "image" | "video" | "audio" | "document", base64: btoa(bin) },
      });
      onChange({ id: r.path, label: r.fileName });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (!value.id) return;
    if (/^https?:\/\//i.test(value.id)) { window.open(value.id, "_blank"); return; }
    try {
      const r = await signFn({ data: { path: value.id } });
      if (r.url) window.open(r.url, "_blank");
    } catch { /* ignora */ }
  }

  const listMediaFn = useServerFn(listSalesbotMedia);
  const lib = useQuery({
    queryKey: ["agent-target-media"],
    queryFn: async () => (await listMediaFn()) as { files: Array<{ path: string; fileName: string }> },
    staleTime: 30_000,
  });
  const libFiles = lib.data?.files ?? [];

  return (
    <div className="space-y-1.5">
      <select
        value={libFiles.some((f) => f.path === value.id) ? value.id : ""}
        onChange={(e) => {
          const f = libFiles.find((x) => x.path === e.target.value);
          if (f) onChange({ id: f.path, label: f.fileName });
        }}
        className={selCls}
      >
        <option value="">
          {lib.isLoading
            ? "Carregando arquivos salvos…"
            : libFiles.length === 0
              ? "Nenhum arquivo salvo na Vanessa Simoni ainda"
              : "Escolher arquivo já salvo na Vanessa Simoni…"}
        </option>
        {libFiles.map((f) => (
          <option key={f.path} value={f.path}>{f.fileName}</option>
        ))}
      </select>
      <div className="flex items-center gap-1.5">
        <label className="inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded border border-border hover:bg-muted cursor-pointer shrink-0">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
          {busy ? "Enviando…" : "Do computador"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.currentTarget.value = ""; }}
          />
        </label>
        <input
          value={/^https?:\/\//i.test(value.id) ? value.id : ""}
          onChange={(e) => onChange({ id: e.target.value, label: e.target.value })}
          placeholder="ou cole um link https://…"
          className={selCls}
        />
      </div>
      {value.id && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <button type="button" onClick={() => void preview()} className="text-primary hover:underline">
            {value.label || value.id}
          </button>
          <button type="button" onClick={() => onChange({ id: "", label: "" })} className="hover:text-destructive">
            remover
          </button>
        </div>
      )}
      {err && <p className="text-[10px] text-destructive">{err}</p>}
    </div>
  );
}


/* ----------------------------------------------------------- compromisso -- */

export type AppointmentConfig = {
  titulo: string;
  duracaoMin: number;
  antecedenciaMin: number;
  responsavelId?: string;
  responsavelNome?: string;
  googleAgendaLead: boolean;
};

export function parseAppointment(raw?: string): AppointmentConfig {
  const base: AppointmentConfig = {
    titulo: "",
    duracaoMin: 30,
    antecedenciaMin: 60,
    googleAgendaLead: true,
  };
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<AppointmentConfig>;
    return { ...base, ...p, titulo: String(p.titulo ?? "") };
  } catch {
    // versões antigas guardavam só o título digitado
    return { ...base, titulo: raw };
  }
}

/**
 * Compromisso: sempre cria no calendário da MKTOn. Se o lead tiver e-mail,
 * também recebe o convite para adicionar no Google Agenda dele.
 */
export function AppointmentPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const cfg = parseAppointment(value.id);
  const fn = useServerFn(listWorkspaceUsers);
  const q = useQuery({
    queryKey: ["agent-target-users"],
    queryFn: async () => (await fn()) as { users: Array<{ id: string; name: string; email: string | null }> },
    staleTime: 60_000,
  });
  const users = q.data?.users ?? [];

  const commit = (patch: Partial<AppointmentConfig>) => {
    const next = { ...cfg, ...patch };
    const label = next.titulo
      ? `${next.titulo} · ${next.duracaoMin} min${next.googleAgendaLead ? " · convida no Google Agenda" : ""}`
      : "";
    onChange({ id: JSON.stringify(next), label });
  };

  return (
    <div className="space-y-1.5">
      <input
        value={cfg.titulo}
        onChange={(e) => commit({ titulo: e.target.value })}
        placeholder="Título do compromisso (ex.: Reunião de apresentação)"
        className={selCls}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10px] text-muted-foreground">
          Duração (min)
          <input
            type="number"
            min={5}
            value={cfg.duracaoMin}
            onChange={(e) => commit({ duracaoMin: Math.max(5, parseInt(e.target.value || "30", 10)) })}
            className={selCls}
          />
        </label>
        <label className="text-[10px] text-muted-foreground">
          Antecedência mínima (min)
          <input
            type="number"
            min={0}
            value={cfg.antecedenciaMin}
            onChange={(e) => commit({ antecedenciaMin: Math.max(0, parseInt(e.target.value || "0", 10)) })}
            className={selCls}
          />
        </label>
      </div>
      <select
        value={cfg.responsavelId ?? ""}
        onChange={(e) => {
          const u = users.find((x) => x.id === e.target.value);
          commit({ responsavelId: u?.id ?? "", responsavelNome: u ? (u.name || u.email || "Usuário") : "" });
        }}
        className={selCls}
      >
        <option value="">
          {q.isLoading ? "Carregando equipe…" : "Responsável pelo compromisso (opcional)"}
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}{u.email ? ` · ${u.email}` : ""}</option>
        ))}
      </select>
      <label className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
        <input
          type="checkbox"
          checked={cfg.googleAgendaLead}
          onChange={(e) => commit({ googleAgendaLead: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          Também gerar o evento no <strong>Google Agenda do lead</strong> quando ele tiver e-mail cadastrado
          (o agente envia o convite pronto para adicionar).
        </span>
      </label>
    </div>
  );
}

/* --------------------------------------- módulos do sistema (dados reais) --- */

type JsonTarget = Record<string, unknown>;

function parseJson(value: TargetValue): JsonTarget {
  const raw = (value.id ?? "").trim();
  if (!raw.startsWith("{")) return {};
  try { return JSON.parse(raw) as JsonTarget; } catch { return {}; }
}

function useSystemTargets() {
  const fn = useServerFn(listAgentSystemTargets);
  return useQuery({
    queryKey: ["agent-system-targets"],
    queryFn: async () => (await fn({} as never)) as AgentSystemTargets,
    staleTime: 60_000,
  });
}

const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
];

/** Gestor de Tráfego: conta de anúncio real + período. */
export function TrafficPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const cfg = parseJson(value);
  const q = useSystemTargets();
  const accounts = q.data?.adAccounts ?? [];
  const accountId = String(cfg["accountId"] ?? "");
  const period = String(cfg["period"] ?? "7d");

  const commit = (next: JsonTarget) => {
    const acc = accounts.find((a) => a.id === String(next["accountId"] ?? ""));
    const per = PERIODOS.find((p) => p.id === String(next["period"] ?? "7d"));
    onChange({
      id: JSON.stringify(next),
      label: `${acc?.name ?? "Conta padrão"} · ${per?.label ?? "Últimos 7 dias"}`,
    });
  };

  return (
    <div className="space-y-1.5">
      <select className={selCls} value={accountId} onChange={(e) => commit({ ...cfg, accountId: e.target.value })}>
        <option value="">Conta de anúncio padrão do workspace</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select className={selCls} value={period} onChange={(e) => commit({ ...cfg, period: e.target.value })}>
        {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {q.isLoading && <p className="text-[10px] text-muted-foreground">Carregando contas conectadas…</p>}
      {!q.isLoading && !accounts.length && (
        <p className="text-[10px] text-amber-500">Nenhuma conta Meta sincronizada neste workspace.</p>
      )}
      <p className="text-[10px] text-muted-foreground">
        O agente recebe investimento, cliques, CTR, leads, CPL e ROAS reais desse período.
      </p>
    </div>
  );
}

/** Social Media: agenda/publicados reais, podendo filtrar por campanha. */
export function SocialPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const cfg = parseJson(value);
  const q = useSystemTargets();
  const campaigns = q.data?.socialCampaigns ?? [];
  const escopo = String(cfg["escopo"] ?? "agendados");
  const campaignId = String(cfg["campaignId"] ?? "");

  const commit = (next: JsonTarget) => {
    const camp = campaigns.find((c) => c.id === String(next["campaignId"] ?? ""));
    const esc = String(next["escopo"] ?? "agendados") === "publicados" ? "Publicados" : "Agendados";
    onChange({ id: JSON.stringify(next), label: `${esc}${camp ? ` · ${camp.name}` : ""}` });
  };

  return (
    <div className="space-y-1.5">
      <select className={selCls} value={escopo} onChange={(e) => commit({ ...cfg, escopo: e.target.value })}>
        <option value="agendados">Posts agendados / aprovados</option>
        <option value="publicados">Posts já publicados</option>
      </select>
      <select className={selCls} value={campaignId} onChange={(e) => commit({ ...cfg, campaignId: e.target.value })}>
        <option value="">Todas as campanhas</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

/** Tracking: site e evento reais capturados pelo pixel MKTOn. */
export function TrackingQueryPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const cfg = parseJson(value);
  const q = useSystemTargets();
  const sites = q.data?.trackingSites ?? [];
  const siteId = String(cfg["siteId"] ?? "");
  const evento = String(cfg["event"] ?? "");
  const site = sites.find((s) => s.id === siteId);

  const commit = (next: JsonTarget) => {
    const s = sites.find((x) => x.id === String(next["siteId"] ?? ""));
    const ev = String(next["event"] ?? "");
    onChange({ id: JSON.stringify(next), label: `${s?.name ?? "Todos os sites"}${ev ? ` · ${ev}` : ""}` });
  };

  return (
    <div className="space-y-1.5">
      <select className={selCls} value={siteId} onChange={(e) => commit({ ...cfg, siteId: e.target.value, event: "" })}>
        <option value="">Todos os sites com pixel</option>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className={selCls} value={evento} onChange={(e) => commit({ ...cfg, event: e.target.value })}>
        <option value="">Todos os eventos</option>
        {(site?.events ?? Array.from(new Set(sites.flatMap((s) => s.events)))).map((ev) => (
          <option key={ev} value={ev}>{ev}</option>
        ))}
      </select>
      {!q.isLoading && !sites.length && (
        <p className="text-[10px] text-amber-500">Nenhum site com pixel instalado ainda.</p>
      )}
    </div>
  );
}

/** Fluxo de Trabalho: cria tarefa em pipeline/etapa/responsável reais. */
export function WorkflowTaskPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const cfg = parseJson(value);
  const fn = useServerFn(listWorkflowPipelinesLite);
  const q = useQuery({
    queryKey: ["agent-workflow-pipelines"],
    queryFn: async () =>
      (await fn({} as never)) as Array<{
        id: string; name: string;
        members: Array<{ id: string; name: string }>;
        stages: Array<{ id: string; name: string }>;
      }>,
    staleTime: 60_000,
  });
  const pipelines = q.data ?? [];
  const pipelineId = String(cfg["pipelineId"] ?? "");
  const pipeline = pipelines.find((p) => p.id === pipelineId);

  const commit = (next: JsonTarget) => {
    const p = pipelines.find((x) => x.id === String(next["pipelineId"] ?? ""));
    const title = String(next["title"] ?? "").trim();
    onChange({
      id: JSON.stringify(next),
      label: `${title || "Tarefa"}${p ? ` · ${p.name}` : ""}`,
    });
  };

  return (
    <div className="space-y-1.5">
      <input
        className={selCls}
        value={String(cfg["title"] ?? "")}
        onChange={(e) => commit({ ...cfg, title: e.target.value })}
        placeholder="Título da tarefa (ex: Preparar proposta para o lead)"
      />
      <select className={selCls} value={pipelineId} onChange={(e) => commit({ ...cfg, pipelineId: e.target.value, stageId: "", assigneeId: "" })}>
        <option value="">Selecione o fluxo de trabalho</option>
        {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {pipeline && (
        <>
          <select className={selCls} value={String(cfg["stageId"] ?? "")} onChange={(e) => commit({ ...cfg, stageId: e.target.value })}>
            <option value="">Primeira etapa do fluxo</option>
            {pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className={selCls} value={String(cfg["assigneeId"] ?? "")} onChange={(e) => commit({ ...cfg, assigneeId: e.target.value })}>
            <option value="">Sem responsável definido</option>
            {pipeline.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </>
      )}
      <div className="flex gap-1.5">
        <select className={selCls} value={String(cfg["priority"] ?? "media")} onChange={(e) => commit({ ...cfg, priority: e.target.value })}>
          <option value="baixa">Prioridade baixa</option>
          <option value="media">Prioridade média</option>
          <option value="alta">Prioridade alta</option>
          <option value="urgente">Urgente</option>
        </select>
        <select className={selCls} value={String(cfg["dueInMinutes"] ?? 1440)} onChange={(e) => commit({ ...cfg, dueInMinutes: Number(e.target.value) })}>
          <option value={60}>Prazo: 1 hora</option>
          <option value={240}>Prazo: 4 horas</option>
          <option value={1440}>Prazo: 1 dia</option>
          <option value={4320}>Prazo: 3 dias</option>
          <option value={10080}>Prazo: 7 dias</option>
        </select>
      </div>
    </div>
  );
}

/** CRM: cria tarefa (calendário, fluxo ou ambos) com dados reais. */
export function CrmTaskPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const cfg = parseJson(value);
  const fn = useServerFn(listAllPipelineStages);
  const uFn = useServerFn(listWorkspaceUsers);

  const q = useQuery({
    queryKey: ["agent-crm-pipelines"],
    queryFn: async () => (await fn({})) as { pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }> },
    staleTime: 60_000,
  });

  const uQ = useQuery({
    queryKey: ["agent-target-users"],
    queryFn: async () => (await uFn()) as { users: Array<{ id: string; name: string; email: string | null }> },
    staleTime: 60_000,
  });

  const pipelines = q.data?.pipelines ?? [];
  const users = uQ.data?.users ?? [];

  const destino = (cfg["destino"] as "calendario" | "fluxo" | "ambos") || "calendario";
  const pipelineId = String(cfg["workflowPipelineId"] ?? "");
  const pipe = pipelines.find((p) => p.id === pipelineId);

  const commit = (next: JsonTarget) => {
    const title = String(next["title"] ?? "").trim();
    const d = (next["destino"] as string) || "calendario";
    const label = `${title || "Tarefa"}${d === "calendario" ? " (Calendário)" : d === "fluxo" ? " (Fluxo)" : " (Ambos)"}`;
    onChange({ id: JSON.stringify(next), label });
  };

  return (
    <div className="space-y-2">
      <input
        className={selCls}
        value={String(cfg["title"] ?? "")}
        onChange={(e) => commit({ ...cfg, title: e.target.value })}
        placeholder="Descrição da tarefa (ex: Ligar para o lead)"
      />
      
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Onde criar</label>
        <select 
          className={selCls} 
          value={destino} 
          onChange={(e) => commit({ ...cfg, destino: e.target.value })}
        >
          <option value="calendario">Somente no Calendário</option>
          <option value="fluxo">Somente no Fluxo de Trabalho</option>
          <option value="ambos">Nos dois (Calendário + Fluxo)</option>
        </select>
      </div>

      {destino !== "calendario" && (
        <>
          <select 
            className={selCls} 
            value={pipelineId} 
            onChange={(e) => commit({ ...cfg, workflowPipelineId: e.target.value, workflowStageId: "", workflowAssigneeId: "" })}
          >
            <option value="">Selecione o funil (CRM)</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {pipe && (
            <>
              <select 
                className={selCls} 
                value={String(cfg["workflowStageId"] ?? "")} 
                onChange={(e) => commit({ ...cfg, workflowStageId: e.target.value })}
              >
                <option value="">Primeira etapa do funil</option>
                {pipe.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select 
                className={selCls} 
                value={String(cfg["workflowAssigneeId"] ?? "")} 
                onChange={(e) => commit({ ...cfg, workflowAssigneeId: e.target.value })}
              >
                <option value="">Sem responsável definido</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- produto --- */

export function ProductPicker({ value, onChange }: { value: TargetValue; onChange: TargetChange }) {
  const cfg = parseJson(value);
  const fn = useServerFn(listProductCatalogs);
  const q = useQuery({
    queryKey: ["agent-target-products"],
    queryFn: async () => (await fn()) as any[],
    staleTime: 60_000,
  });
  const catalogs = q.data ?? [];
  
  const productId = String(cfg["productId"] ?? "");
  const kind = (cfg["kind"] as "interesse" | "comprou") || "interesse";

  const commit = (next: JsonTarget) => {
    let label = "";
    const pId = String(next["productId"] ?? "");
    for (const c of catalogs) {
      const p = c.products?.find((x: any) => x.id === pId);
      if (p) {
        label = `${p.name} (${next["kind"] === "comprou" ? "Compra" : "Interesse"})`;
        break;
      }
    }
    onChange({ id: JSON.stringify(next), label });
  };

  return (
    <div className="space-y-1.5">
      <select 
        className={selCls} 
        value={productId} 
        onChange={(e) => commit({ ...cfg, productId: e.target.value })}
      >
        <option value="">Selecione o produto…</option>
        {catalogs.map((c) => (
          <optgroup key={c.id} label={c.name}>
            {(c.products ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <select 
        className={selCls} 
        value={kind} 
        onChange={(e) => commit({ ...cfg, kind: e.target.value })}
      >
        <option value="interesse">Marcar interesse</option>
        <option value="comprou">Marcar como comprado</option>
      </select>
      {q.isLoading && <p className="text-[10px] text-muted-foreground">Carregando catálogo…</p>}
    </div>
  );
}

/* -------------------------------------------------- dispatcher por ação --- */

export type TargetKind =
  | "etapa" | "bot" | "form" | "usuario" | "tag" | "arquivo" | "topicos" | "campo"
  | "solicitacao" | "compromisso" | "trafego" | "social" | "tracking" | "tarefa-workflow" | "tarefa-crm" | "produto" | "texto" | "pausa";

/** Descobre que tipo de alvo uma ação precisa. */
export function targetKindForAction(action: string): TargetKind | null {
  switch (action) {
    case "mudar-etapa":
    case "trocar-etapa":
    case "mudar-etapa-lead":
      return "etapa";
    case "iniciar-bot":
    case "iniciar-automacao":
    case "iniciar-salesbot":
      return "bot";
    case "enviar-formulario":
      return "form";
    case "pausar":
      return "pausa";
    case "transferir-humano":
    case "transferir-usuario":
    case "mudar-responsavel":
    case "alterar-responsavel":
      return "usuario";
    case "adicionar-tag":
    case "remover-tag":
    case "gerenciar-tags":
      return "tag";
    case "enviar-arquivo":
      return "arquivo";
    case "nao-mencionar":
    case "tentar-falar-assunto":
    case "sempre-falar-assunto":
      return "topicos";
    case "definir-campo":
    case "atualizar-campo":
    case "adicionar-campo":
    case "remover-campo":
      return "campo";
    case "solicitar-cliente":
      return "solicitacao";
    case "criar-compromisso":
    case "criar-evento":
      return "compromisso";
    case "consultar-trafego":
      return "trafego";
    case "consultar-social":
      return "social";
    case "consultar-tracking":
      return "tracking";
    case "criar-tarefa-workflow":
      return "tarefa-workflow";
    case "criar-tarefa":
      return "tarefa-crm";
    case "vincular-produto":
      return "produto";
    default:
      return null;
  }
}


export function AgentTargetField({
  kind,
  value,
  scope = "individual",
  placeholder,
  onChange,
}: {
  kind: TargetKind;
  value: TargetValue;
  scope?: "individual" | "grupo";
  placeholder?: string;
  onChange: TargetChange;
}) {
  switch (kind) {
    case "etapa":
      return <StagePicker value={value} onChange={onChange} />;
    case "bot":
      return <BotPicker value={value} scope={scope} onChange={onChange} />;
    case "form":
      return <FormPicker value={value} onChange={onChange} />;
    case "pausa":
      return <PauseActionPicker value={value} onChange={onChange} />;
    case "usuario":
      return <UserPicker value={value} onChange={onChange} />;
    case "tag":
      return <TagPicker value={value} onChange={onChange} />;
    case "arquivo":
      return <FilePicker value={value} onChange={onChange} />;
    case "topicos":
      return <TopicsPicker value={value} onChange={onChange} placeholder={placeholder} />;
    case "campo":
      return <CustomFieldPicker value={value} onChange={onChange} />;
    case "solicitacao":
      return <RequestPicker value={value} onChange={onChange} />;
    case "compromisso":
      return <AppointmentPicker value={value} onChange={onChange} />;
    case "trafego":
      return <TrafficPicker value={value} onChange={onChange} />;
    case "social":
      return <SocialPicker value={value} onChange={onChange} />;
    case "tracking":
      return <TrackingQueryPicker value={value} onChange={onChange} />;
    case "tarefa-workflow":
      return <WorkflowTaskPicker value={value} onChange={onChange} />;
    case "tarefa-crm":
      return <CrmTaskPicker value={value} onChange={onChange} />;
    case "produto":
      return <ProductPicker value={value} onChange={onChange} />;
    default:
      return (
        <input
          value={value.id}
          onChange={(e) => onChange({ id: e.target.value, label: e.target.value })}
          placeholder={placeholder}
          className={selCls}
        />
      );
  }
}

/* -------------------------------------------------------------- duração --- */

/**
 * Tempo em minutos, mas escolhido em cronômetro (valor + unidade).
 * Nunca texto livre: evita "trinta minutos" virar erro no runtime.
 */
export function DurationPicker({
  value,
  onChange,
}: {
  value: TargetValue;
  onChange: TargetChange;
}) {
  const totalMin = Math.max(0, parseInt(value.id || "0", 10) || 0);
  const unit: "min" | "h" | "d" =
    totalMin > 0 && totalMin % 1440 === 0 ? "d" : totalMin > 0 && totalMin % 60 === 0 ? "h" : "min";
  const factor = unit === "d" ? 1440 : unit === "h" ? 60 : 1;
  const amount = totalMin > 0 ? totalMin / factor : 0;

  const commit = (nextAmount: number, nextUnit: "min" | "h" | "d") => {
    const f = nextUnit === "d" ? 1440 : nextUnit === "h" ? 60 : 1;
    const minutes = Math.max(0, Math.round(nextAmount * f));
    const label =
      minutes === 0
        ? ""
        : `${nextAmount} ${nextUnit === "d" ? "dia(s)" : nextUnit === "h" ? "hora(s)" : "minuto(s)"}`;
    onChange({ id: String(minutes), label });
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        step={1}
        value={amount === 0 ? "" : amount}
        onChange={(e) => commit(Math.max(0, parseInt(e.target.value || "0", 10) || 0), unit)}
        placeholder="0"
        className="w-20 bg-background border border-border rounded px-2 py-1.5 text-xs"
      />
      <select
        value={unit}
        onChange={(e) => commit(amount, e.target.value as "min" | "h" | "d")}
        className="bg-background border border-border rounded px-2 py-1.5 text-xs"
      >
        <option value="min">minutos</option>
        <option value="h">horas</option>
        <option value="d">dias</option>
      </select>
    </div>
  );
}
