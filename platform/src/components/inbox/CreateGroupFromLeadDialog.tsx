import { useEffect, useRef, useState } from "react";
import { X, Upload, Plus, Trash2, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWorkspaceChannels } from "@/lib/channels.functions";
import { createWhatsAppGroup } from "@/lib/whatsapp-groups.functions";

interface Props {
  open: boolean;
  onClose: () => void;
  leadName?: string;
  leadPhone?: string | null | undefined;
}

export function CreateGroupFromLeadDialog({ open, onClose, leadName, leadPhone }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picture, setPicture] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [extraPhones, setExtraPhones] = useState<string[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadChannels = useServerFn(listWorkspaceChannels);
  const channelsQ = useQuery({
    queryKey: ["ws-channels-for-group"],
    queryFn: () => loadChannels({}),
    enabled: open,
    staleTime: 30_000,
  });
  const sessions = channelsQ.data?.whatsapp ?? [];

  useEffect(() => {
    if (open) {
      setName(leadName ? `Grupo, ${leadName}` : "");
      setDescription("");
      setPicture(null);
      setExtraPhones([]);
      setNewPhone("");
      setError(null);
    }
  }, [open, leadName]);

  useEffect(() => {
    if (!sessionId && sessions.length > 0) {
      const connected = sessions.find((s) => s.status === "connected") ?? sessions[0];
      setSessionId(connected.id);
    }
  }, [sessions, sessionId]);

  const createFn = useServerFn(createWhatsAppGroup);
  type CreatePayload = {
    sessionId: string;
    name: string;
    description?: string;
    pictureUrl?: string;
    participants: string[];
  };
  const mut = useMutation({
    mutationFn: (payload: CreatePayload) => createFn({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox", "group-conversations"] });
      onClose();
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Falha ao criar grupo");
    },
  });

  function onPickPicture(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) {
      setError("Foto deve ter no máximo 3MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPicture(String(reader.result));
    reader.readAsDataURL(f);
  }

  function addPhone() {
    const digits = newPhone.replace(/\D/g, "");
    if (digits.length < 8) return;
    if (extraPhones.includes(digits)) { setNewPhone(""); return; }
    setExtraPhones((p) => [...p, digits]);
    setNewPhone("");
  }

  function submit() {
    setError(null);
    if (!sessionId) { setError("Selecione um número de WhatsApp conectado."); return; }
    const leadDigits = (leadPhone ?? "").replace(/\D/g, "");
    const hasLead = leadDigits.length >= 8;
    const participants = Array.from(new Set(hasLead ? [leadDigits, ...extraPhones] : [...extraPhones]));
    if (participants.length === 0) { setError("Adicione pelo menos um participante."); return; }
    if (!name.trim()) { setError("Dê um nome ao grupo."); return; }
    mut.mutate({
      sessionId,
      name: name.trim(),
      description: description.trim() || undefined,
      pictureUrl: picture ?? undefined,
      participants,
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--chat-panel)", borderColor: "var(--chat-divider)", color: "var(--chat-text)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--chat-divider)" }}>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <div className="text-sm font-semibold">Criar grupo no WhatsApp</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Foto */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-2 border-dashed"
              style={{ borderColor: "var(--chat-divider)", backgroundColor: "var(--chat-bg)" }}
            >
              {picture ? (
                <img src={picture} alt="Foto do grupo" className="w-full h-full object-cover" />
              ) : (
                <Upload className="w-5 h-5 opacity-60" />
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPicture} />
            <div className="text-[11px]" style={{ color: "var(--chat-meta)" }}>
              {picture ? "Toque para trocar" : "Adicionar foto (opcional)"}
            </div>
          </div>

          {/* Número do WhatsApp de origem */}
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--chat-meta)" }}>
              Criar a partir de
            </div>
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full text-xs rounded-md px-2.5 py-2 outline-none"
              style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
            >
              {sessions.length === 0 ? (
                <option value="">Nenhum WhatsApp conectado</option>
              ) : (
                sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} {s.status === "connected" ? "" : `(${s.status ?? "offline"})`}
                  </option>
                ))
              )}
            </select>
          </label>

          {/* Nome */}
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--chat-meta)" }}>Nome do grupo</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full text-xs rounded-md px-2.5 py-2 outline-none"
              style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
            />
          </label>

          {/* Descrição */}
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--chat-meta)" }}>Descrição</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Opcional"
              className="w-full text-xs rounded-md px-2.5 py-2 outline-none"
              style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
            />
          </label>

          {/* Participantes */}
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--chat-meta)" }}>Participantes</div>
            <div className="rounded-md border" style={{ borderColor: "var(--chat-divider)" }}>
              {leadName ? (
                <div className="flex items-center justify-between px-2.5 py-1.5 text-xs" style={{ backgroundColor: "var(--chat-bg)" }}>
                  <span className="truncate">
                    <b>{leadName}</b> · {leadPhone || "sem telefone"}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--chat-meta)" }}>lead</span>
                </div>
              ) : null}
              {extraPhones.length === 0 && !leadName ? (
                <div className="px-2.5 py-2 text-[11px]" style={{ color: "var(--chat-meta)" }}>
                  Nenhum participante ainda. Adicione números abaixo.
                </div>
              ) : null}
              {extraPhones.map((p) => (
                <div key={p} className="flex items-center justify-between px-2.5 py-1.5 text-xs border-t" style={{ borderColor: "var(--chat-divider)" }}>
                  <span>+{p}</span>
                  <button
                    onClick={() => setExtraPhones((prev) => prev.filter((x) => x !== p))}
                    className="opacity-70 hover:opacity-100"
                    aria-label="Remover"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPhone(); } }}
                placeholder="Adicionar número com DDI (ex: 5511999999999)"
                className="flex-1 text-xs rounded-md px-2.5 py-2 outline-none"
                style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
              />
              <button
                type="button"
                onClick={addPhone}
                className="h-8 px-3 rounded-md text-xs flex items-center gap-1 hover:opacity-90"
                style={{ backgroundColor: "var(--chat-accent)", color: "#fff" }}
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
            <div className="text-[10px] mt-1" style={{ color: "var(--chat-meta)" }}>
              Você pode adicionar mais membros depois direto no WhatsApp.
            </div>
          </div>

          {error && (
            <div className="text-[11px] px-2.5 py-2 rounded-md" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171" }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--chat-divider)" }}>
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-md text-xs hover:bg-white/5"
            style={{ color: "var(--chat-text-muted)" }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={mut.isPending || !sessionId}
            className="h-9 px-4 rounded-md text-xs font-medium disabled:opacity-50"
            style={{ backgroundColor: "var(--chat-accent)", color: "#fff" }}
          >
            {mut.isPending ? "Criando…" : "Criar grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}
