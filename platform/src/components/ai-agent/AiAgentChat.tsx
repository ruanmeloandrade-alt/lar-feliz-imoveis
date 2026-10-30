import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useServerFn } from "@tanstack/react-start";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  loadAgentConversation,
  resetAgentConversation,
  getAgentSettings,
  updateAgentSettings,
} from "@/lib/ai-agent.functions";
import { Bot, RotateCcw, Settings2, Sparkles, Wrench, Paperclip, Mic, Square, X, Image as ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { SlimCopilotProposals } from "./SlimCopilotProposals";
import { useSlimCopilotUser } from "./useSlimCopilotUser";
import { slimCopilotConversationKey } from "@/lib/slim-copilot-ui.core";

type Module = "gestor_trafego" | "kommo_manager" | "salesbot" | "inbox" | "dashboard" | "social_media" | "strategist" | "support_robot";
type Mode = "consultor" | "gestor";

const MODE_LABEL: Record<Mode, { label: string; icon: React.ReactNode; hint: string }> = {
  consultor: { label: "Consultor", icon: <Sparkles className="w-3.5 h-3.5" />, hint: "Consultor de marketing digital. Lê seus dados, dá feedback, insights e ideias, não executa ações." },
  gestor: { label: "Gestor", icon: <Wrench className="w-3.5 h-3.5" />, hint: "Executor de mídia paga. Cria, pausa, ativa e ajusta campanhas de verdade na Meta." },
};

const SUGGESTIONS: Record<Module, string[]> = {
  support_robot: [
    "Consulte o estoque atual dos produtos",
    "Mostre o relatório de vendas dos últimos 30 dias",
    "Quero preparar uma mudança de etapa para um lead",
    "Liste os SalesBots disponíveis"
  ],
  gestor_trafego: [
    "Analise minhas campanhas dos últimos 7 dias e execute os ajustes necessários",
    "Crie uma campanha pausada usando a imagem que eu anexar",
    "Pause campanhas com CPL acima da minha meta",
    "Liste minhas contas, páginas e pixels conectados",
  ],
  kommo_manager: [
    "Onde meu funil está travando agora?",
    "Quais leads precisam de follow-up hoje e por quê?",
    "Por que os leads da etapa de proposta não avançam?",
    "Me dá o relatório da operação dos últimos 7 dias",
  ],
  salesbot: ["Como monto um fluxo de qualificação?"],
  inbox: ["Quais conversas estão sem resposta?"],
  dashboard: ["O que subiu e o que caiu esta semana?"],
  social_media: [
    "Me dá 5 ideias de post pra essa semana",
    "Monta um calendário editorial pra próximos 15 dias",
    "Escreve a legenda desse post que vou publicar amanhã",
    "Que tipo de conteúdo devo priorizar pra crescer no Instagram?",
  ],

  strategist: [
    "Monta uma estratégia de prospecção fria pra Black Friday",
    "Como configuro regras de proteção pra pausar campanha ruim?",
    "Quero uma estratégia de remarketing pra quem visitou o site",
    "Me ajuda a definir orçamento pra uma campanha de mensagens",
  ],
};

const TITLE: Record<Module, string> = {
  support_robot: "Copiloto Vanessa Simoni",
  gestor_trafego: "Chat Marketing",
  kommo_manager: "Chat CRM",
  salesbot: "Assistente Salesbot",
  inbox: "Assistente Inbox",
  dashboard: "Assistente Dashboard",
  social_media: "Social Media",
  strategist: "Estrategista de Mídia IA",
};

type AiAgentChatProps = {
  workspaceId: string;
  actorId?: string;
  module: Module;
  fullscreen?: boolean;
  onStrategyPatch?: (patch: Record<string, unknown>) => void;
  hideActions?: boolean;
  contextPayload?: Record<string, unknown>;
};

export function AiAgentChat(props: AiAgentChatProps) {
  return props.module === "support_robot"
    ? <ScopedSlimCopilotChat {...props} />
    : <AiAgentChatSession {...props} />;
}

function ScopedSlimCopilotChat(props: AiAgentChatProps) {
  const authenticatedActorId = useSlimCopilotUser();
  if (!authenticatedActorId || (props.actorId && props.actorId !== authenticatedActorId)) return null;
  return <AiAgentChatSession key={props.workspaceId + ":" + authenticatedActorId}
    {...props} actorId={authenticatedActorId} />;
}

function AiAgentChatSession({
  workspaceId,
  actorId,
  module: agentModule,
  fullscreen = false,
  onStrategyPatch,
  hideActions = false,
  contextPayload,
}: AiAgentChatProps) {
  const qc = useQueryClient();
  const loadFn = useServerFn(loadAgentConversation);
  const resetFn = useServerFn(resetAgentConversation);
  const settingsFn = useServerFn(getAgentSettings);
  const updateSettingsFn = useServerFn(updateAgentSettings);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const conversationKey = agentModule === "support_robot" && actorId
    ? slimCopilotConversationKey(workspaceId, actorId)
    : ["ai-agent-conv", workspaceId, agentModule];
  const conversationIdentity = {
    workspaceId, module: agentModule,
    ...(agentModule === "support_robot" ? { actorId } : {}),
  };

  // Carrega histórico + settings
  const historyQ = useQuery({
    queryKey: conversationKey,
    queryFn: () => loadFn({ data: conversationIdentity }),
    enabled: agentModule !== "support_robot" || Boolean(actorId),
  });
  const settingsQ = useQuery({
    queryKey: agentModule === "support_robot"
      ? ["ai-agent-settings", workspaceId, agentModule, actorId]
      : ["ai-agent-settings", workspaceId, agentModule],
    queryFn: () => settingsFn({ data: { workspaceId, module: agentModule } }),
  });

  useEffect(() => {
    if (historyQ.data && initialMessages === null) {
      try {
        const parsed = JSON.parse(historyQ.data.messages) as UIMessage[];
        setInitialMessages(Array.isArray(parsed) ? parsed : []);
      } catch {
        setInitialMessages([]);
      }
    }
  }, [historyQ.data, initialMessages]);

  const chatId = agentModule === "support_robot"
    ? agentModule + ":" + workspaceId + ":" + actorId
    : `${agentModule}-${workspaceId}`;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai-agent/chat",
        prepareSendMessagesRequest: async ({ messages }) => {
          const { data: sess } = await supabase.auth.getSession();
          const token = sess.session?.access_token;
          if (agentModule === "support_robot" && (!actorId || sess.session?.user?.id !== actorId)) {
            throw new Error("A sessão do operador mudou. Reabra o Copiloto na empresa atual.");
          }
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return {
            body: { workspaceId, module: agentModule, messages, contextPayload,
              ...(agentModule === "support_robot" ? { actorId } : {}) },
            headers,
          };
        },
      }),
    [workspaceId, actorId, agentModule, contextPayload],
  );

  const chat = useChat({
    id: chatId,
    messages: initialMessages ?? [],
    transport,
    onError: (err) => {
      setInitError(err.message);
      toast.error(err.message);
    },
  });

  useEffect(() => () => {
    if (agentModule === "support_robot") void chat.stop();
  }, [agentModule, chat.stop]);

  // Se as messages iniciais chegarem depois, sincroniza
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0 && chat.messages.length === 0) {
      chat.setMessages(initialMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages]);

  // Detecta blocos ```strategy-patch { ... } ``` no último assistente e aplica no formulário
  const lastPatchIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onStrategyPatch) return;
    const last = [...chat.messages].reverse().find((m) => m.role === "assistant");
    if (!last || last.id === lastPatchIdRef.current) return;
    const text = last.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
    const m = text.match(/```strategy-patch\s+([\s\S]*?)```/i);
    if (!m) return;
    try {
      const patch = JSON.parse(m[1]);
      if (patch && typeof patch === "object") {
        lastPatchIdRef.current = last.id;
        onStrategyPatch(patch);
      }
    } catch { /* ignora JSON inválido */ }
  }, [chat.messages, onStrategyPatch]);


  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Anexos locais (front). Guarda o File real para converter em base64 no submit.
  type Attachment =
    | { kind: "image" | "file"; file: File; name: string; size: number; mime: string; previewUrl?: string }
    | { kind: "audio"; name: string; size: number; mime: string; durationMs: number; previewUrl: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Gravação de áudio + transcrição automática
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef<number>(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRecRef = useRef(false);

  const stopRecTimer = () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
  };

  useEffect(() => () => {
    stopRecTimer();
    mediaRecRef.current?.stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const transcribeBlob = async (blob: Blob, mime: string) => {
    setTranscribing(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");
      const ext = mime.includes("mp4") ? "m4a" : "webm";
      const fd = new FormData();
      fd.append("file", new File([blob], `recording.${ext}`, { type: mime }));
      const res = await fetch(`/api/social/transcribe-audio?workspaceId=${workspaceId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Falha (${res.status}) ao transcrever.`);
      }
      const j = (await res.json()) as { text?: string };
      const text = (j.text ?? "").trim();
      if (!text) {
        toast.error("Não consegui entender o áudio. Tenta falar mais perto do microfone.");
        return;
      }
      setInput((prev) => (prev ? `${prev} ${text}` : text));
      setTimeout(() => inputRef.current?.focus(), 30);
      toast.success("Áudio transcrito.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    if (recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recChunksRef.current = [];
      cancelRecRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelRecRef.current) { recChunksRef.current = []; return; }
        const blob = new Blob(recChunksRef.current, { type: mime });
        recChunksRef.current = [];
        if (blob.size < 1500) {
          toast.error("Gravação muito curta.");
          return;
        }
        void transcribeBlob(blob, mime);
      };
      rec.start();
      mediaRecRef.current = rec;
      recStartRef.current = Date.now();
      setRecSecs(0);
      setRecording(true);
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      toast.error("Não consegui acessar o microfone. Verifique a permissão do navegador.");
    }
  };

  const stopRecording = () => {
    if (!recording) return;
    stopRecTimer();
    setRecording(false);
    cancelRecRef.current = false;
    mediaRecRef.current?.stop();
  };

  const cancelRecording = () => {
    if (!recording) return;
    stopRecTimer();
    setRecording(false);
    cancelRecRef.current = true;
    mediaRecRef.current?.stop();
  };

  const handleFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX = 20 * 1024 * 1024;
    const next: Attachment[] = [];
    Array.from(files).forEach((f) => {
      if (f.size > MAX) {
        toast.error(`${f.name}: arquivo maior que 20MB.`);
        return;
      }
      const isImage = f.type.startsWith("image/");
      next.push({
        kind: isImage ? "image" : "file",
        file: f,
        name: f.name,
        size: f.size,
        mime: f.type || "application/octet-stream",
        previewUrl: isImage ? URL.createObjectURL(f) : undefined,
      });
    });
    if (next.length) setAttachments((a) => [...a, ...next]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((a) => {
      const item = a[idx];
      if (item && "previewUrl" in item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return a.filter((_, i) => i !== idx);
    });
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, [agentModule, workspaceId]);

  const resetM = useMutation({
    mutationFn: () => resetFn({ data: conversationIdentity }),
    onSuccess: () => {
      chat.setMessages([]);
      setInitialMessages([]);
      qc.invalidateQueries({ queryKey: conversationKey });
      toast.success("Conversa zerada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const modeM = useMutation({
    mutationFn: (mode: Mode) =>
      updateSettingsFn({ data: { workspaceId, module: agentModule, mode } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agent-settings", workspaceId, agentModule] });
      toast.success("Modo atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Social Media e Estrategista não expõem toggle de modo (função única e fixa)
  const isSocialMedia = agentModule === "social_media";
  const isStrategist = agentModule === "strategist";
  const hideModeToggle = isSocialMedia || isStrategist;
  const rawMode = settingsQ.data?.mode as string | undefined;
  const currentMode: Mode = hideModeToggle
    ? "consultor"
    : (rawMode === "consultor" ? "consultor" : "gestor");

  const autoGestorModeDoneRef = useRef(false);
  useEffect(() => {
    if (agentModule !== "gestor_trafego" || hideModeToggle || autoGestorModeDoneRef.current) return;
    if (!settingsQ.data || modeM.isPending) return;
    autoGestorModeDoneRef.current = true;
    if (settingsQ.data.mode !== "gestor") {
      modeM.mutate("gestor");
    }
  }, [agentModule, hideModeToggle, modeM, settingsQ.data]);

  const isLoading = chat.status === "submitted" || chat.status === "streaming";

  const fileToDataUrl = (f: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

  const submit = async (message: { text?: string; files?: unknown[] }) => {
    const text = (message.text ?? input).trim();
    if ((!text && attachments.length === 0) || isLoading) return;
    setInput("");
    setInitError(null);

    // Converte imagens/arquivos em file parts com data URL (base64) para o modelo ler direto.
    const fileParts: Array<{ type: "file"; url: string; mediaType: string; filename: string }> = [];
    for (const a of attachments) {
      if ((a.kind === "image" || a.kind === "file") && "file" in a) {
        try {
          const url = await fileToDataUrl(a.file);
          fileParts.push({ type: "file", url, mediaType: a.mime, filename: a.name });
        } catch { /* ignore */ }
      }
    }

    await chat.sendMessage({
      text: text || (fileParts.length ? "(imagem anexada)" : ""),
      files: fileParts as unknown as never,
    });
    attachments.forEach((a) => { if ("previewUrl" in a && a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
    setAttachments([]);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  return (
    <div className={fullscreen
      ? "flex h-full min-h-0 flex-col bg-card"
      : "flex h-full min-h-[560px] flex-col overflow-hidden rounded-xl border border-border bg-card"}>

      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-background/40">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{TITLE[agentModule]}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {agentModule === "support_robot"
                ? "Conversa contínua · ações executadas após sua aprovação"
                : <>Conversa contínua · lê seus dados, imagens e executa ações no modo {isSocialMedia ? "Social Media" : "Gestor"}</>}
            </div>

          </div>
        </div>
        <div className="flex items-center gap-2">
          {!hideModeToggle && !hideActions && (
            <div className="hidden sm:flex items-center gap-1 rounded-md border border-border bg-background/60 p-0.5">
              {(["consultor", "gestor"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => modeM.mutate(m)}
                  disabled={modeM.isPending}
                  title={MODE_LABEL[m].hint}
                  className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition ${
                    currentMode === m
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {MODE_LABEL[m].icon}
                  {MODE_LABEL[m].label}
                </button>
              ))}
            </div>
          )}
          {!hideModeToggle && !hideActions && (
            <button
              onClick={() => setSettingsOpen((s) => !s)}
              className="h-8 w-8 rounded-md hover:bg-muted inline-flex items-center justify-center text-muted-foreground"
              title="Configurações do agente"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          {!hideActions && (
            <button
              onClick={() => {
                if (confirm("Zerar toda a conversa deste agente?")) resetM.mutate();
              }}
              disabled={resetM.isPending}
              className="h-8 w-8 rounded-md hover:bg-muted inline-flex items-center justify-center text-muted-foreground"
              title="Zerar conversa"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {settingsOpen && (
        <div className="px-5 py-3 border-b border-border bg-muted/20 text-xs text-muted-foreground space-y-1">
          <div><b>Consultor</b>, {MODE_LABEL.consultor.hint}</div>
          <div><b>Gestor</b>, {MODE_LABEL.gestor.hint}</div>
        </div>
      )}

      {/* Transcript */}
      <div className="relative min-h-[280px] flex-1">
        <Conversation className="h-full">
          <ConversationContent>
            {chat.messages.length === 0 ? (
              <EmptyState
                onPick={(s) => {
                  setInput(s);
                  setTimeout(() => inputRef.current?.focus(), 20);
                }}
                agentModule={agentModule}
              />
            ) : (
              chat.messages.map((m) => (
                <Message from={m.role} key={m.id}>
                  <MessageContent>
                    {m.parts.map((p, i) => {
                      if (p.type === "text") {
                        const clean = m.role === "assistant"
                          ? p.text.replace(/```strategy-patch[\s\S]*?```/gi, "").trim()
                          : p.text;
                        if (!clean) return null;
                        return m.role === "assistant" ? (
                          <MessageResponse key={i}>{clean}</MessageResponse>
                        ) : (
                          <span key={i}>{clean}</span>
                        );
                      }
                      if (p.type === "file") {
                        const fp = p as { type: "file"; url?: string; mediaType?: string; filename?: string };
                        if ((fp.mediaType ?? "").startsWith("image/") && fp.url) {
                          return <img key={i} src={fp.url} alt={fp.filename ?? "anexo"} className="max-w-[240px] rounded-md border border-border mt-1" />;
                        }
                        return <div key={i} className="text-xs opacity-70">📎 {fp.filename ?? "arquivo"}</div>;
                      }
                      if (typeof p.type === "string" && p.type.startsWith("tool-")) {
                        const tp = p as { type: string; state?: string; input?: unknown; output?: unknown; errorText?: string };
                        const toolName = p.type.replace(/^tool-/, "");
                        const state = tp.state ?? "";
                        const running = state === "input-streaming" || state === "input-available";
                        return (
                          <div key={i} className="my-1 rounded-md border border-border bg-background/50 px-2 py-1.5 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className={running ? "animate-pulse" : ""}>⚙️</span>
                              <span className="font-medium">{toolName}</span>
                              <span className="opacity-60">· {state}</span>
                            </div>
                            {tp.errorText && <div className="mt-1 text-destructive">{tp.errorText}</div>}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                </Message>
              ))
            )}
            {chat.status === "submitted" && (
              <Message from="assistant">
                <MessageContent>
                  <Shimmer>Pensando...</Shimmer>
                </MessageContent>
              </Message>
            )}
            {initError && (
              <div className="text-xs text-destructive px-2">{initError}</div>
            )}
            {agentModule === "support_robot" && actorId && (
              <SlimCopilotProposals key={workspaceId + ":" + actorId}
                workspaceId={workspaceId} actorId={actorId} chatStatus={chat.status} />
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-5 pb-4 pt-1 border-t border-border space-y-2">
        {/* Preview de anexos */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {attachments.map((a, i) => (
              <div key={i} className="group relative flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-[11px] max-w-[240px]">
                {a.kind === "image" && a.previewUrl ? (
                  <img src={a.previewUrl} alt={a.name} className="w-8 h-8 rounded object-cover" />
                ) : a.kind === "audio" ? (
                  <div className="w-8 h-8 rounded bg-primary/10 text-primary grid place-items-center"><Mic className="w-3.5 h-3.5" /></div>
                ) : (
                  <div className="w-8 h-8 rounded bg-muted grid place-items-center"><FileText className="w-3.5 h-3.5 text-muted-foreground" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {a.kind === "audio"
                      ? `${Math.round((a as any).durationMs / 1000)}s · ${(a.size / 1024).toFixed(0)}KB`
                      : `${(a.size / 1024).toFixed(0)}KB`}
                  </div>
                </div>
                <button
                  onClick={() => removeAttachment(i)}
                  className="w-5 h-5 rounded-full bg-background border border-border grid place-items-center hover:bg-muted"
                  title="Remover anexo"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Indicador de gravação */}
        {recording && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-destructive/30 bg-destructive/5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
            </span>
            <span className="text-xs font-medium">Gravando… {String(Math.floor(recSecs/60)).padStart(2,"0")}:{String(recSecs%60).padStart(2,"0")}</span>
            <button onClick={cancelRecording} className="ml-auto text-[11px] px-2 py-1 rounded border border-border hover:bg-muted">Cancelar</button>
            <button onClick={stopRecording} className="text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1">
              <Square className="w-3 h-3" /> Parar
            </button>
          </div>
        )}

        {transcribing && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/30 bg-primary/5 text-xs">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Transcrevendo áudio…
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json"
          className="hidden"
          onChange={(e) => { handleFilesPicked(e.target.files); e.target.value = ""; }}
        />

        <PromptInput onSubmit={submit}>
          <PromptInputTextarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={recording ? "Gravando áudio…" : agentModule === "gestor_trafego" ? "Peça uma análise, anexe uma imagem ou mande criar/ajustar campanhas..." : `Pergunte ao ${TITLE[agentModule]}...`}
            disabled={isLoading || recording}
          />
          <PromptInputFooter className="justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || recording}
                className="h-8 w-8 rounded-md hover:bg-muted inline-flex items-center justify-center text-muted-foreground disabled:opacity-40"
                title="Anexar imagem ou arquivo"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={isLoading}
                className={`h-8 w-8 rounded-md inline-flex items-center justify-center disabled:opacity-40 ${
                  recording ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "hover:bg-muted text-muted-foreground"
                }`}
                title={recording ? "Parar gravação" : "Gravar áudio"}
              >
                {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
            <PromptInputSubmit
              status={chat.status}
              disabled={isLoading || recording || (input.trim().length === 0 && attachments.length === 0)}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

function EmptyState({
  onPick,
  agentModule,
}: {
  onPick: (s: string) => void;
  agentModule: Module;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-5">
      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent inline-flex items-center justify-center">
        <Bot className="w-6 h-6 text-primary" />
      </div>
      <div>
        <div className="text-lg font-semibold">Olá! Como posso ajudar?</div>
        <div className="text-xs text-muted-foreground mt-1">
          {agentModule === "gestor_trafego"
            ? "No modo Gestor eu leio imagens anexadas e executo ações reais nas campanhas conectadas."
            : "Pergunte, peça análise ou uma ideia, respondo com base nos seus dados reais."}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-w-xl">
        {SUGGESTIONS[agentModule].map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-border bg-background/60 hover:bg-muted px-3 py-1.5 text-xs text-foreground/80"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
