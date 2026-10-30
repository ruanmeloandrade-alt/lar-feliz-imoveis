import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toPng } from "html-to-image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Trophy,
  Crown,
  Medal,
  Award,
  Gift,
  Settings2,
  Download,
  Share2,
  Check,
  History,
  Sparkles,
  Info,
  ChevronRight,
  Star,
  Trash2,
  Pencil,
  Megaphone,
} from "lucide-react";
import {
  getGamificationConfig,
  saveGamificationConfig,
  getMonthlyLeaderboard,
  computeEmployeeOfMonth,
  getHallOfFame,
  markRewardDelivered,
  saveShareCardUrl,
  type GamificationConfig,
  type LeaderRow,
  type EmployeeOfMonth,
} from "@/lib/workflow-gamification.functions";
import {
  listRewards,
  createReward,
  updateReward,
  deleteReward,
  type WorkflowReward,
} from "@/lib/workflow-rewards.functions";

interface Props {
  canManage: boolean;
}

function currentMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatMonthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${monthNames[Number(m) - 1]} de ${y}`;
}

export function EmployeeOfMonthView({ canManage }: Props) {
  const [month, setMonth] = useState(currentMonthISO());
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [view, setView] = useState<"ranking" | "hall">("ranking");
  const [configOpen, setConfigOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const qc = useQueryClient();
  const cfgFn = useServerFn(getGamificationConfig);
  const boardFn = useServerFn(getMonthlyLeaderboard);
  const hallFn = useServerFn(getHallOfFame);
  const computeFn = useServerFn(computeEmployeeOfMonth);

  const cfgQ = useQuery<{ config: GamificationConfig; canManage: boolean }>({
    queryKey: ["gamification-config"],
    queryFn: () => cfgFn({ data: {} as never }),
  });
  const boardQ = useQuery<{ month: string; leaderboard: LeaderRow[]; sectors: { id: string; name: string }[] }>({
    queryKey: ["gamification-leaderboard", month, sectorId],
    queryFn: () => boardFn({ data: { month, sectorId } }),
  });
  const hallQ = useQuery<EmployeeOfMonth[]>({
    queryKey: ["gamification-hall", sectorId],
    queryFn: () => hallFn({ data: { sectorId } }),
    enabled: view === "hall",
  });

  const enabled = cfgQ.data?.config.enabled ?? false;
  const currentRewardId = cfgQ.data?.config.currentRewardId ?? null;

  const computeMutation = useMutation({
    mutationFn: () => computeFn({ data: { month, sectorId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gamification-hall"] });
      qc.invalidateQueries({ queryKey: ["gamification-leaderboard"] });
    },
  });

  useEffect(() => {
    if (enabled && view === "ranking" && canManage) {
      computeFn({ data: { month, sectorId } }).catch(() => {});
    }
  }, [enabled, month, sectorId, view, canManage]);

  if (cfgQ.isLoading) return <div className="p-6 text-muted-foreground">Carregando…</div>;

  if (!enabled && !canManage) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <Trophy className="w-12 h-12 mx-auto text-muted-foreground/40" />
        <p className="mt-3 text-muted-foreground">
          O <b>Funcionário do Mês</b> ainda não foi ativado neste workspace.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          O gestor precisa ativar a premiação para o time começar a competir.
        </p>
      </div>
    );
  }

  const list = boardQ.data?.leaderboard ?? [];
  const winner = list[0] ?? null;

  return (
    <div className="h-full overflow-y-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Funcionário do Mês
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Ranking automático por KPIs. Quem mais entregar no prazo leva o prêmio do mês.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setTutorialOpen(true)}>
            <Info className="w-4 h-4 mr-1.5" /> Como funciona
          </Button>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button
              onClick={() => setView("ranking")}
              className={cn(
                "px-3 py-1.5 font-medium uppercase tracking-wider transition-colors flex items-center gap-1",
                view === "ranking" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Trophy className="w-3.5 h-3.5" /> Ranking
            </button>
            <button
              onClick={() => setView("hall")}
              className={cn(
                "px-3 py-1.5 font-medium uppercase tracking-wider transition-colors flex items-center gap-1",
                view === "hall" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <History className="w-3.5 h-3.5" /> Hall da Fama
            </button>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
              <Settings2 className="w-4 h-4 mr-1.5" /> Configurar
            </Button>
          )}
        </div>
      </div>

      {!enabled && canManage && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
          Recurso desativado. Clique em <b>Configurar</b> para ativar o ranking e definir a premiação.
        </div>
      )}

      {view === "ranking" && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Mês</Label>
              <Input
                type="month"
                value={month.slice(0, 7)}
                onChange={(e) => setMonth(`${e.target.value}-01`)}
                className="text-sm w-40"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Setor</Label>
              <select
                value={sectorId ?? ""}
                onChange={(e) => setSectorId(e.target.value || null)}
                className="text-sm rounded-md border border-border bg-background px-2 py-1.5 min-w-[160px]"
              >
                <option value="">Empresa toda</option>
                {(boardQ.data?.sectors ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {canManage && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => computeMutation.mutate()}
                disabled={computeMutation.isPending}
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                {computeMutation.isPending ? "Atualizando…" : "Atualizar vencedor"}
              </Button>
            )}
          </div>

          {/* Hero Winner */}
          {winner && enabled && (
            <WinnerHeroCard
              winner={winner}
              monthLabel={formatMonthLabel(month)}
              canManage={canManage}
              config={cfgQ.data?.config}
            />
          )}

          {/* Podium */}
          {list.length > 0 ? (
            <PodiumSection list={list} />
          ) : (
            <div className="text-center text-muted-foreground py-16">
              Nenhuma pontuação registrada neste período ainda.
            </div>
          )}

          {/* Rest of ranking */}
          {list.length > 3 && <RankingTable list={list.slice(3)} startRank={4} />}
        </>
      )}

      {view === "hall" && <HallOfFameView data={hallQ.data ?? []} loading={hallQ.isLoading} />}

      {configOpen && cfgQ.data && (
        <GamificationConfigDialog
          config={cfgQ.data.config}
          onClose={() => setConfigOpen(false)}
          onSaved={() => {
            setConfigOpen(false);
            qc.invalidateQueries({ queryKey: ["gamification-config"] });
            qc.invalidateQueries({ queryKey: ["gamification-leaderboard"] });
            qc.invalidateQueries({ queryKey: ["gamification-hall"] });
          }}
        />
      )}

      <RewardsCatalogDialog open={rewardsOpen} onClose={() => setRewardsOpen(false)} />

      <TutorialDialog open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
  );
}

function WinnerHeroCard({
  winner,
  monthLabel,
  canManage,
  config,
}: {
  winner: LeaderRow;
  monthLabel: string;
  canManage: boolean;
  config?: GamificationConfig;
}) {
  const [showShare, setShowShare] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const qc = useQueryClient();
  const markDelivered = useServerFn(markRewardDelivered);

  const handleDeliver = async () => {
    // Não temos o ID do registro aqui sem buscar; abrimos o share dialog para gerenciar.
    setShowShare(true);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-6 md:p-8 shadow-sm">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Crown className="w-32 h-32 text-amber-600" />
      </div>
      <div className="relative flex flex-col md:flex-row items-center md:items-start gap-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-4 border-amber-300 bg-amber-100 flex items-center justify-center overflow-hidden shadow-inner">
            {winner.avatarUrl ? (
              <img src={winner.avatarUrl} alt={winner.userName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-amber-700">{winner.userName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="absolute -top-2 -right-2 bg-amber-500 text-white rounded-full p-1.5 shadow">
            <Crown className="w-4 h-4" />
          </div>
        </div>
        <div className="flex-1 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold uppercase tracking-wider">
            <Star className="w-3 h-3" /> Funcionário do Mês
          </div>
          <h3 className="text-2xl md:text-3xl font-bold text-amber-900 mt-2">{winner.userName}</h3>
          <p className="text-amber-700/80 font-medium">{monthLabel}</p>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{winner.points}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">XP</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{winner.coins}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Coins mês</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{winner.tasksCompleted}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Concluídas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{winner.tasksOnTime}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">No prazo</div>
            </div>
          </div>
          {config?.prizeTitle && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/70 border border-amber-200 text-sm text-amber-900">
              <Gift className="w-4 h-4 text-amber-600" />
              <span className="font-medium">Prêmio em disputa:</span> {config.prizeTitle}
            </div>
          )}
        </div>
        {canManage && (
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={() => setShowShare(true)}>
              <Megaphone className="w-4 h-4 mr-1.5" /> Gerar cartão
            </Button>
            <Button size="sm" variant="outline" onClick={handleDeliver}>
              <Check className="w-4 h-4 mr-1.5" /> Marcar entregue
            </Button>
          </div>
        )}
      </div>

      {showShare && (
        <ShareCardDialog
          winner={winner}
          monthLabel={monthLabel}
          prizeTitle={config?.prizeTitle ?? null}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

function PodiumSection({ list }: { list: LeaderRow[] }) {
  const podium = list.slice(0, 3);
  const ordered = [podium[1], podium[0], podium[2]].filter(Boolean);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
      {ordered.map((row, idx) => {
        const rank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
        const isFirst = rank === 1;
        const badge =
          rank === 1
            ? { icon: Crown, color: "text-amber-500", bg: "from-amber-100 to-yellow-100", border: "border-amber-300", height: "md:order-2 md:-mt-4" }
            : rank === 2
              ? { icon: Medal, color: "text-slate-400", bg: "from-slate-100 to-gray-100", border: "border-slate-300", height: "md:order-1" }
              : { icon: Award, color: "text-orange-500", bg: "from-orange-100 to-amber-100", border: "border-orange-300", height: "md:order-3" };
        const Icon = badge.icon;
        return (
          <div
            key={row.userId}
            className={cn(
              "rounded-xl border p-5 bg-gradient-to-br shadow-sm relative text-center transition-transform hover:-translate-y-1",
              badge.bg,
              badge.border,
              badge.height,
            )}
          >
            <Icon className={cn("w-8 h-8 mx-auto mb-2", badge.color)} />
            <div className="text-xs uppercase tracking-wider text-muted-foreground">#{rank}</div>
            <div className="w-14 h-14 mx-auto rounded-full border-2 border-white/60 bg-white/40 flex items-center justify-center overflow-hidden mb-2">
              {row.avatarUrl ? (
                <img src={row.avatarUrl} alt={row.userName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-muted-foreground">{row.userName.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className={cn("font-semibold truncate", isFirst && "text-lg")}>{row.userName || "-"}</div>
            <div className={cn("font-bold text-emerald-600 mt-1", isFirst ? "text-3xl" : "text-2xl")}>
              {row.points} <span className="text-sm font-medium text-muted-foreground">XP</span>
            </div>
            <div className="text-sm font-medium text-amber-600 mt-0.5">{row.coins} coins</div>
          </div>
        );
      })}
    </div>
  );
}

function RankingTable({ list, startRank }: { list: LeaderRow[]; startRank: number }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2">#</th>
            <th className="text-left px-4 py-2">Funcionário</th>
            <th className="text-right px-4 py-2">XP</th>
            <th className="text-right px-4 py-2">Coins</th>
            <th className="text-right px-4 py-2">Concluídas</th>
            <th className="text-right px-4 py-2">No prazo</th>
            <th className="text-right px-4 py-2">Aprovadas</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={r.userId} className="border-t border-border/60">
              <td className="px-4 py-2 text-muted-foreground">{startRank + i}</td>
              <td className="px-4 py-2 font-medium flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                  {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" /> : r.userName.slice(0, 2).toUpperCase()}
                </div>
                {r.userName || "-"}
              </td>
              <td className="px-4 py-2 text-right font-semibold text-emerald-600">{r.points}</td>
              <td className="px-4 py-2 text-right font-semibold text-amber-600">{r.coins}</td>
              <td className="px-4 py-2 text-right">{r.tasksCompleted}</td>
              <td className="px-4 py-2 text-right">{r.tasksOnTime}</td>
              <td className="px-4 py-2 text-right text-emerald-600">{r.reviewsApproved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HallOfFameView({ data, loading }: { data: EmployeeOfMonth[]; loading: boolean }) {
  if (loading) return <div className="p-6 text-muted-foreground">Carregando Hall da Fama…</div>;
  if (data.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <History className="w-10 h-10 mx-auto mb-3 opacity-40" />
        Nenhum vencedor registrado ainda.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map((w) => (
        <div
          key={w.id}
          className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-5 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-3">
            <Crown className="w-5 h-5 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              {formatMonthLabel(w.month)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center overflow-hidden">
              {w.avatarUrl ? (
                <img src={w.avatarUrl} alt={w.userName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-amber-700">{w.userName.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className="font-semibold text-amber-900">{w.userName}</div>
              <div className="text-xs text-muted-foreground">{w.points} XP · {w.tasksCompleted} tarefas</div>
            </div>
          </div>
          {w.rewardTitle && (
            <div className="mt-3 text-sm text-amber-800 flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5" /> {w.rewardTitle}
              {w.rewardDelivered && <span className="ml-auto text-emerald-600 text-xs font-medium flex items-center gap-1"><Check className="w-3 h-3" /> Entregue</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ShareCardDialog({
  winner,
  monthLabel,
  prizeTitle,
  onClose,
}: {
  winner: LeaderRow;
  monthLabel: string;
  prizeTitle: string | null;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const generate = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const dataUrl = await toPng(cardRef.current, { width: 1200, height: 630, pixelRatio: 2 });
      setPreviewUrl(dataUrl);
    } finally {
      setGenerating(false);
    }
  };

  const download = () => {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = `funcionario-do-mes-${winner.userName.replace(/\s+/g, "-")}.png`;
    link.click();
  };

  useEffect(() => {
    generate();
  }, []);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" /> Cartão do Funcionário do Mês
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="overflow-auto rounded-lg border border-border bg-slate-100 p-4 flex justify-center">
            <div ref={cardRef} className="shrink-0" style={{ width: 1200, height: 630 }}>
              <ShareCardDesign winner={winner} monthLabel={monthLabel} prizeTitle={prizeTitle} />
            </div>
          </div>
          {previewUrl && (
            <div className="rounded-lg border border-border overflow-hidden">
              <img src={previewUrl} alt="Prévia do cartão" className="w-full h-auto" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            <Button onClick={generate} disabled={generating} variant="secondary">
              {generating ? "Gerando…" : "Regenerar"}
            </Button>
            <Button onClick={download} disabled={!previewUrl || generating}>
              <Download className="w-4 h-4 mr-1.5" /> Baixar imagem
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareCardDesign({
  winner,
  monthLabel,
  prizeTitle,
}: {
  winner: LeaderRow;
  monthLabel: string;
  prizeTitle: string | null;
}) {
  return (
    <div
      className="w-[1200px] h-[630px] relative flex flex-col items-center justify-center text-center overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)",
      }}
    >
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #fbbf24 0%, transparent 40%), radial-gradient(circle at 80% 70%, #a78bfa 0%, transparent 40%)" }} />
      <div className="absolute top-6 right-8 text-white/60 font-semibold tracking-wider text-sm">Vanessa Simoni</div>
      <div className="relative z-10 flex flex-col items-center">
        <div className="text-amber-300 text-xl font-bold uppercase tracking-widest mb-4">Funcionário do Mês</div>
        <div className="w-36 h-36 rounded-full border-4 border-amber-300 bg-white/10 flex items-center justify-center overflow-hidden mb-6 shadow-2xl">
          {winner.avatarUrl ? (
            <img src={winner.avatarUrl} alt={winner.userName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-5xl font-bold text-white">{winner.userName.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <h2 className="text-6xl font-bold text-white mb-2">{winner.userName}</h2>
        <p className="text-2xl text-white/80 mb-8">{monthLabel}</p>
        <div className="flex items-center gap-8 mb-8">
          <div className="text-center">
            <div className="text-4xl font-bold text-amber-300">{winner.points}</div>
            <div className="text-sm text-white/70 uppercase tracking-wider">XP</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-amber-300">{winner.tasksCompleted}</div>
            <div className="text-sm text-white/70 uppercase tracking-wider">Tarefas</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-amber-300">{winner.tasksOnTime}</div>
            <div className="text-sm text-white/70 uppercase tracking-wider">No prazo</div>
          </div>
        </div>
        {prizeTitle && (
          <div className="px-6 py-3 rounded-full bg-white/10 border border-white/20 text-white text-lg">
            🎁 {prizeTitle}
          </div>
        )}
      </div>
    </div>
  );
}

function GamificationConfigDialog({
  config,
  onClose,
  onSaved,
}: {
  config: GamificationConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [scope, setScope] = useState<GamificationConfig["scope"]>(config.scope);
  const [prizeTitle, setPrizeTitle] = useState(config.prizeTitle ?? "");
  const [prizeDescription, setPrizeDescription] = useState(config.prizeDescription ?? "");
  const [prizeImageUrl, setPrizeImageUrl] = useState(config.prizeImageUrl ?? "");
  const [currentRewardId, setCurrentRewardId] = useState<string | null>(config.currentRewardId ?? null);
  const [rules, setRules] = useState(config.rules);
  const [rewardsOpen, setRewardsOpen] = useState(false);

  const saveFn = useServerFn(saveGamificationConfig);
  const [saving, setSaving] = useState(false);

  const priorityKeys: Array<"baixa" | "media" | "alta" | "urgente"> = ["baixa", "media", "alta", "urgente"];

  const save = async () => {
    setSaving(true);
    try {
      await saveFn({
        data: {
          enabled,
          scope,
          rules,
          prizeTitle: prizeTitle || null,
          prizeDescription: prizeDescription || null,
          prizeImageUrl: prizeImageUrl || null,
          currentRewardId,
        },
      });
      onSaved();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Configurar Funcionário do Mês
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4" />
              <span className="font-medium">Ativar ranking de Funcionário do Mês</span>
            </Label>
            <Button variant="outline" size="sm" onClick={() => setRewardsOpen(true)}>
              <Gift className="w-4 h-4 mr-1.5" /> Catálogo de prêmios
            </Button>
          </div>

          <div>
            <Label className="text-sm font-medium mb-1 block">Escopo do ranking</Label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as GamificationConfig["scope"])}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="company">Empresa inteira (um ranking geral)</option>
              <option value="sector">Por setor (um ranking para cada setor)</option>
              <option value="both">Empresa + setor (vários rankings)</option>
            </select>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">
              <span className="text-emerald-600">XP</span> por prioridade da tarefa concluída
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {priorityKeys.map((k) => (
                <div key={k}>
                  <Label className="text-xs text-muted-foreground capitalize">{k}</Label>
                  <Input
                    type="number"
                    value={(rules as any).points_by_priority?.[k] ?? 0}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        points_by_priority: { ...(rules as any).points_by_priority, [k]: Number(e.target.value) || 0 },
                      } as typeof rules)
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">
              <span className="text-amber-600">🪙 Coins</span> por prioridade da tarefa concluída
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {priorityKeys.map((k) => (
                <div key={`c-${k}`}>
                  <Label className="text-xs text-muted-foreground capitalize">{k}</Label>
                  <Input
                    type="number"
                    value={(rules as any).coins_by_priority?.[k] ?? 0}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        coins_by_priority: { ...((rules as any).coins_by_priority ?? {}), [k]: Number(e.target.value) || 0 },
                      } as typeof rules)
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              ["on_time_bonus", "XP, Bônus por entregar no prazo"],
              ["early_bonus", "XP, Bônus por entregar com folga (>25%)"],
              ["per_hour_under_estimate", "XP, Pontos por hora abaixo do estimado"],
              ["incomplete_penalty", "XP, Penalidade tarefa incompleta"],
              ["review_approved_bonus", "XP, Bônus revisão aprovada"],
              ["review_returned_penalty", "XP, Penalidade devolvida na revisão"],
              ["coins_on_time_bonus", "🪙 Coins, Bônus por entregar no prazo"],
              ["coins_early_bonus", "🪙 Coins, Bônus por entregar com folga"],
              ["coins_review_approved_bonus", "🪙 Coins, Bônus revisão aprovada"],
            ].map(([key, label]) => (
              <div key={key}>
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  type="number"
                  value={(rules as unknown as Record<string, number>)[key as string] ?? 0}
                  onChange={(e) => setRules({ ...rules, [key as string]: Number(e.target.value) || 0 } as typeof rules)}
                />
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <h4 className="font-medium flex items-center gap-1.5"><Gift className="w-4 h-4 text-amber-500" /> Premiação do mês</h4>
            <div>
              <Label className="text-xs text-muted-foreground">Título do prêmio</Label>
              <Input
                value={prizeTitle}
                onChange={(e) => setPrizeTitle(e.target.value)}
                placeholder="Ex.: R$ 500 + dia de folga"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Textarea
                value={prizeDescription}
                onChange={(e) => setPrizeDescription(e.target.value)}
                rows={3}
                placeholder="Descreva as regras da premiação"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">URL da imagem do prêmio (opcional)</Label>
              <Input
                type="url"
                value={prizeImageUrl}
                onChange={(e) => setPrizeImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar configuração"}</Button>
          </div>
        </div>
      </DialogContent>
      <RewardsCatalogDialog open={rewardsOpen} onClose={() => setRewardsOpen(false)} />
    </Dialog>
  );
}

function RewardsCatalogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const listFn = useServerFn(listRewards);
  const createFn = useServerFn(createReward);
  const updateFn = useServerFn(updateReward);
  const deleteFn = useServerFn(deleteReward);
  const qc = useQueryClient();

  const { data: rewards, isLoading } = useQuery<WorkflowReward[]>({
    queryKey: ["workflow-rewards"],
    queryFn: () => listFn({ data: {} as never }),
    enabled: open,
  });

  const [editing, setEditing] = useState<WorkflowReward | null>(null);
  const [form, setForm] = useState<Partial<WorkflowReward>>({ title: "", description: "", coinCost: 0, imageUrl: "", active: true, position: 0 });

  const resetForm = () => {
    setEditing(null);
    setForm({ title: "", description: "", coinCost: 0, imageUrl: "", active: true, position: 0 });
  };

  const handleSave = async () => {
    if (!form.title) return;
    const payload = {
      title: form.title,
      description: form.description ?? null,
      coinCost: Number(form.coinCost ?? 0),
      imageUrl: form.imageUrl || null,
      active: form.active ?? true,
      position: Number(form.position ?? 0),
    };
    if (editing) {
      await updateFn({ data: { ...payload, id: editing.id } });
    } else {
      await createFn({ data: payload });
    }
    resetForm();
    qc.invalidateQueries({ queryKey: ["workflow-rewards"] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este prêmio?")) return;
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["workflow-rewards"] });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-500" /> Catálogo de Prêmios
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-muted/30">
            <div className="md:col-span-2">
              <Label className="text-xs">Título</Label>
              <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Vale-presente R$ 100" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Descrição</Label>
              <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Custo em coins</Label>
              <Input type="number" value={form.coinCost ?? 0} onChange={(e) => setForm({ ...form, coinCost: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Posição</Label>
              <Input type="number" value={form.position ?? 0} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">URL da imagem</Label>
              <Input value={form.imageUrl ?? ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm({ ...form, active: e.target.checked })} id="reward-active" />
              <Label htmlFor="reward-active" className="text-sm">Ativo</Label>
            </div>
            <div className="flex gap-2 md:col-span-2">
              {editing && <Button variant="outline" onClick={resetForm}>Cancelar edição</Button>}
              <Button onClick={handleSave}>{editing ? "Atualizar" : "Adicionar prêmio"}</Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-muted-foreground">Carregando…</div>
          ) : (
            <div className="space-y-2">
              {(rewards ?? []).length === 0 && <div className="text-sm text-muted-foreground">Nenhum prêmio cadastrado.</div>}
              {(rewards ?? []).map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  {r.imageUrl && <img src={r.imageUrl} alt="" className="w-12 h-12 rounded object-cover" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.coinCost} coins · {r.active ? "Ativo" : "Inativo"}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setForm(r); }}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TutorialDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" /> Como funciona o Funcionário do Mês
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            O <b>Funcionário do Mês</b> é um ranking automático baseado nas entregas do time dentro do Fluxo de Trabalho.
          </p>
          <ul className="space-y-2 list-disc pl-4">
            <li><b>XP</b> é ganho ao concluir tarefas, com bônus por entregar no prazo, com folga e abaixo do tempo estimado.</li>
            <li><b>Coins</b> são acumulados e podem ser trocados por prêmios cadastrados pelo gestor.</li>
            <li>Quem tiver mais <b>XP</b> no fim do mês vence e aparece no Hall da Fama.</li>
            <li>O gestor pode gerar um <b>cartão de compartilhamento</b> para celebrar o vencedor nas redes.</li>
          </ul>
          <p>
            Quer saber mais? Leia o artigo completo no nosso blog:
            <a href="/blog/funcionario-do-mes" target="_blank" rel="noreferrer" className="ml-1 text-primary hover:underline inline-flex items-center gap-1">
              Funcionário do Mês: motive sua equipe com dados <ChevronRight className="w-3 h-3" />
            </a>
          </p>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>Entendi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
