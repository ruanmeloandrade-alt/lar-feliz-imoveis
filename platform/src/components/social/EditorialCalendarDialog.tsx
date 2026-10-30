// Planejador de calendário editorial: configura pilares, cadência, dias e horário,
// e gera rascunhos de post distribuídos no mês atual da view.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, Loader2, X, Plus, Sparkles, Building2, Wand2, Palette, ImageIcon, Zap } from "lucide-react";
import { generateEditorialCalendar, listImageProviders } from "@/lib/social.functions";
import { getBrandContext } from "@/lib/social-brand.functions";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" }, { v: 0, l: "Dom" },
];
const CHANNELS: { v: "ig_feed"|"ig_story"|"ig_reels"|"fb_feed"|"fb_story"|"fb_reels"; l: string }[] = [
  { v: "ig_feed",  l: "Instagram · Feed" },
  { v: "ig_reels", l: "Instagram · Reels" },
  { v: "ig_story", l: "Instagram · Story" },
  { v: "fb_feed",  l: "Facebook · Feed" },
  { v: "fb_reels", l: "Facebook · Reels" },
  { v: "fb_story", l: "Facebook · Story" },
];

export function EditorialCalendarDialog({
  open, onClose, workspaceId, year, month, onCreated,
}: {
  open: boolean; onClose: () => void; workspaceId: string | null;
  year: number; month: number; // 0-11
  onCreated: () => void;
}) {
  const genFn = useServerFn(generateEditorialCalendar);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [hour, setHour] = useState(10);
  const [minute, setMinute] = useState(0);
  const [pillars, setPillars] = useState<string[]>(["Educativo", "Prova social", "Vendas"]);
  const [newPillar, setNewPillar] = useState("");
  const [channels, setChannels] = useState<typeof CHANNELS[number]["v"][]>(["ig_feed"]);
  const [brief, setBrief] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [targetImageProvider, setTargetImageProvider] = useState<"ideogram" | "recraft" | "freepik" | "gemini">("ideogram");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const toggle = <T,>(list: T[], v: T, setter: (l: T[]) => void) => {
    setter(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  };
  const addPillar = () => {
    const p = newPillar.trim();
    if (!p || pillars.length >= 8 || pillars.includes(p)) return;
    setPillars([...pillars, p]); setNewPillar("");
  };
  const removePillar = (p: string) => setPillars(pillars.filter(x => x !== p));

  const submit = async () => {
    if (!workspaceId) { toast.error("Workspace não carregado."); return; }
    if (!pillars.length) { toast.error("Adicione pelo menos 1 pilar."); return; }
    if (!weekdays.length) { toast.error("Escolha pelo menos 1 dia da semana."); return; }
    if (!channels.length) { toast.error("Escolha pelo menos 1 canal."); return; }
    setLoading(true);
    try {
      const res = await genFn({ data: {
        workspaceId, year, month,
        postsPerWeek, weekdays, hour, minute, pillars, channels, brief,
        brandId, targetImageProvider,
      }}) as { created: number };
      toast.success(`${res.created} rascunhos criados no calendário.`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar calendário.");
    } finally { setLoading(false); }
  };

  const monthLabel = new Date(year, month, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 grid place-items-center text-primary-foreground">
              <CalendarCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Planejamento</div>
              <div className="text-base font-bold capitalize">Calendário editorial · {monthLabel}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Pilares */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pilares de conteúdo</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pillars.map(p => (
                <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  {p}
                  <button onClick={() => removePillar(p)} className="hover:bg-primary/20 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <div className="inline-flex items-center gap-1">
                <input
                  value={newPillar} onChange={e => setNewPillar(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addPillar())}
                  placeholder="+ pilar (ex: bastidores)"
                  className="px-2.5 py-1 rounded-full border border-dashed border-border bg-background text-xs w-40 focus:outline-none focus:border-primary"
                />
                <button onClick={addPillar} disabled={!newPillar.trim() || pillars.length >= 8}
                  className="w-6 h-6 grid place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Cadência + horário */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Posts por semana</label>
              <input type="number" min={1} max={14} value={postsPerWeek}
                onChange={e => setPostsPerWeek(Math.max(1, Math.min(14, Number(e.target.value) || 1)))}
                className="mt-2 w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Horário</label>
              <div className="mt-2 flex gap-2">
                <input type="number" min={0} max={23} value={hour}
                  onChange={e => setHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
                <input type="number" min={0} max={59} value={minute}
                  onChange={e => setMinute(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
              </div>
            </div>
          </div>

          {/* Dias da semana */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dias da semana</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEKDAYS.map(w => (
                <button key={w.v} onClick={() => toggle(weekdays, w.v, setWeekdays)}
                  className={cn("px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                    weekdays.includes(w.v) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/50")}>
                  {w.l}
                </button>
              ))}
            </div>
          </div>

          {/* Canais */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Canais</label>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {CHANNELS.map(c => (
                <button key={c.v} onClick={() => toggle(channels, c.v, setChannels)}
                  className={cn("px-3 py-2 rounded-md text-xs font-medium border text-left transition-all",
                    channels.includes(c.v) ? "bg-primary/10 text-primary border-primary" : "bg-background border-border hover:border-primary/50")}>
                  {c.l}
                </button>
              ))}
            </div>
          </div>

          {/* Brief */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Direcionamento (opcional)</label>
            <textarea value={brief} onChange={e => setBrief(e.target.value)}
              placeholder="Ex.: mês de lançamento do curso X, focar em prova social nas segundas."
              rows={2}
              className="mt-2 w-full px-3 py-2 rounded-md border border-border bg-background text-sm resize-none" />
          </div>

          {/* Módulo Estratégico AI (Contexto da Marca + Motor) */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-primary">
                <Sparkles className="w-4 h-4" /> Inteligência Estratégica do Mês
              </div>
              {targetImageProvider === "ideogram" && (
                <span className="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                  IDEOGRAM V3
                </span>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-primary" /> Contexto Visual da Marca
                </label>
                <div className="mt-1.5">
                  <BrandSelector workspaceId={workspaceId} value={brandId} onChange={setBrandId} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Motor de Criação Sugerido</label>
                <div className="mt-1.5 grid grid-cols-4 gap-2">
                  {([
                    { id: "ideogram", label: "Ideogram", icon: Palette },
                    { id: "recraft", label: "Recraft", icon: Sparkles },
                    { id: "freepik", label: "Freepik", icon: ImageIcon },
                    { id: "gemini", label: "Gemini", icon: Zap },
                  ] as const).map((prov) => (
                    <button
                      key={prov.id}
                      onClick={() => setTargetImageProvider(prov.id)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-md border p-1.5 text-center transition-all",
                        targetImageProvider === prov.id 
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30" 
                          : "border-border hover:bg-muted bg-background"
                      )}
                    >
                      <prov.icon className="h-3 w-3 text-primary" />
                      <div className="text-[9px] font-bold leading-tight">{prov.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-muted/30">
          <div className="text-xs text-muted-foreground">
            Serão criados <span className="font-semibold text-foreground">rascunhos</span> distribuídos em {monthLabel}. Você revisa antes de agendar.
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium hover:bg-muted">Cancelar</button>
            <button onClick={submit} disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "Gerando..." : "Gerar calendário"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandSelector({ workspaceId, value, onChange }: { 
  workspaceId: string | null; 
  value?: string | null; 
  onChange: (id: string | null) => void 
}) {
  const getBrand = useServerFn(getBrandContext);
  const { data } = useQuery({
    queryKey: ["social-brand-context", workspaceId],
    queryFn: () => getBrand({ data: { workspaceId: workspaceId as string } }),
    enabled: !!workspaceId,
  });

  const brand = data?.context;

  return (
    <select 
      value={value || ""} 
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary/30"
    >
      <option value="">IA Padrão (Sem contexto de marca)</option>
      {brand && (
        <option value={(brand as any).id as string}>
          {brand.company_name || "Marca Principal"}
        </option>
      )}
    </select>
  );
}
