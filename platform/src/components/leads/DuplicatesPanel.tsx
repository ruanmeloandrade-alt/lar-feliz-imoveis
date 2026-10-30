import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Users, Mail, Phone, Instagram, X, Check } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DuplicateGroup, DuplicateLead } from "@/lib/leads-dedupe.functions";
import { findSlimDuplicateLeads, dismissSlimDuplicateGroup, mergeSlimLeads } from "@/lib/saude-slim-dedupe-client";
import { formatBRL, timeAgo } from "@/lib/crm-mock";

export function DuplicatesPanel({
  open, onOpenChange, onMerged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onMerged: () => void;
}) {
  const load = findSlimDuplicateLeads;
  const dismiss = dismissSlimDuplicateGroup;
  const merge = mergeSlimLeads;
  const [busySig, setBusySig] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["dedupe", "list"],
    queryFn: () => load({ data: {} }),
    enabled: open,
    staleTime: 20_000,
  });

  const groups: DuplicateGroup[] = q.data?.groups ?? [];

  async function handleDismiss(sig: string) {
    setBusySig(sig);
    try {
      await dismiss({ data: { signature: sig } });
      await q.refetch();
      toast.success("Grupo ignorado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ignorar");
    } finally {
      setBusySig(null);
    }
  }

  async function handleMerge(g: DuplicateGroup, primary: DuplicateLead) {
    setBusySig(g.signature);
    try {
      const mergedIds = g.leads.filter((l) => l.id !== primary.id).map((l) => l.id);
      const res = await merge({ data: { primaryId: primary.id, mergedIds } });
      toast.success(`${res.mergedCount} lead(s) mesclado(s)`);
      await q.refetch();
      onMerged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao mesclar");
    } finally {
      setBusySig(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Duplicatas
          </SheetTitle>
          <SheetDescription>
            Leads suspeitos de duplicidade neste workspace. Escolha o principal
            para mesclar, os demais viram histórico dentro dele.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {q.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando…
            </div>
          )}
          {!q.isLoading && groups.length === 0 && (
            <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Nenhuma duplicata encontrada. Bom trabalho!
            </div>
          )}
          {groups.map((g) => (
            <GroupCard
              key={g.signature}
              group={g}
              busy={busySig === g.signature}
              onDismiss={() => handleDismiss(g.signature)}
              onMerge={(primary) => handleMerge(g, primary)}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GroupCard({
  group, busy, onDismiss, onMerge,
}: {
  group: DuplicateGroup;
  busy: boolean;
  onDismiss: () => void;
  onMerge: (primary: DuplicateLead) => void;
}) {
  const [primaryId, setPrimaryId] = useState<string>(group.leads[0].id);
  const Icon = group.reason === "email" ? Mail : group.reason === "instagram" ? Instagram : Phone;
  const label = group.reason === "email" ? "Mesmo e-mail"
    : group.reason === "phone" ? "Mesmo telefone"
    : group.reason === "instagram" ? "Mesmo Instagram" : "Nome similar";

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1"><Icon className="w-3 h-3" /> {label}</Badge>
          <span className="text-muted-foreground truncate">{group.key}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
          <X className="w-3.5 h-3.5" /> Ignorar
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {group.leads.map((l) => (
          <li key={l.id} className="flex items-start gap-3 px-3 py-2.5">
            <input
              type="radio"
              name={`primary-${group.signature}`}
              checked={primaryId === l.id}
              onChange={() => setPrimaryId(l.id)}
              className="mt-1 accent-primary"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{l.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {[l.email, l.phone, l.company, l.instagram && `@${l.instagram}`]
                  .filter(Boolean).join(" · ") || "sem contato"}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {l.pipelineName ? `${l.pipelineName} · ` : ""}{l.stageName ?? "-"} · atualizado {timeAgo(l.updatedAt)}
              </div>
            </div>
            <div className="text-right text-xs tabular-nums font-medium">{formatBRL(l.value)}</div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border bg-muted/30">
        <span className="text-[11px] text-muted-foreground mr-auto">
          O selecionado permanece; os demais viram histórico.
        </span>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onMerge(group.leads.find((l) => l.id === primaryId)!)}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Mesclar ({group.leads.length})
        </Button>
      </div>
    </div>
  );
}
