import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMetaAdDetails, updateMetaAd } from "@/lib/meta-campaigns.functions";

export function EditAdSheet({
  workspaceId, open, onOpenChange, ad, onSaved,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ad: { id: string; accountId: string; name: string } | null;
  onSaved?: () => void;
}) {
  const detailsFn = useServerFn(getMetaAdDetails);
  const detailsQ = useQuery({
    queryKey: ["meta-ad-details", workspaceId, ad?.id],
    enabled: open && !!ad,
    queryFn: () => detailsFn({ data: { workspaceId, adAccountId: ad!.accountId as `act_${string}`, adId: ad!.id } }),
  });

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED" | "ARCHIVED">("PAUSED");

  useEffect(() => {
    const d = detailsQ.data;
    if (!d) return;
    setName(d.name);
    setStatus((["ACTIVE", "PAUSED", "ARCHIVED"] as const).includes(d.status as never) ? (d.status as "ACTIVE" | "PAUSED" | "ARCHIVED") : "PAUSED");
  }, [detailsQ.data]);

  const updateFn = useServerFn(updateMetaAd);
  const mut = useMutation({
    mutationFn: async () => {
      if (!ad || !detailsQ.data) return;
      const d = detailsQ.data;
      const patch: Record<string, unknown> = { workspaceId, adAccountId: ad.accountId, adId: ad.id };
      if (name !== d.name) patch.name = name;
      if (status !== d.status) patch.status = status;
      const changed = Object.keys(patch).filter((k) => !["workspaceId", "adAccountId", "adId"].includes(k));
      if (changed.length === 0) throw new Error("Nenhuma alteração para salvar.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return updateFn({ data: patch as any });
    },
    onSuccess: () => {
      toast.success("Anúncio atualizado.");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = detailsQ.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Editar anúncio</SheetTitle></SheetHeader>

        {detailsQ.isLoading && (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando dados atuais…
          </div>
        )}

        {d && (
          <div className="space-y-5 mt-4 pb-6">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] space-y-1">
              <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{d.id}</span></div>
              <div><span className="text-muted-foreground">Conjunto:</span> <span className="font-mono">{d.adSetId}</span></div>
              <div><span className="text-muted-foreground">Campanha:</span> <span className="font-mono">{d.campaignId}</span></div>
            </div>

            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </div>

            <div>
              <Label>Status</Label>
              <div className="flex gap-2 mt-1">
                {(["ACTIVE", "PAUSED", "ARCHIVED"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setStatus(s)}
                    className={`px-3 py-1.5 rounded border text-xs ${status === s ? "border-primary bg-primary/10" : "border-border"}`}>
                    {s === "ACTIVE" ? "Ativo" : s === "PAUSED" ? "Pausado" : "Arquivado"}
                  </button>
                ))}
              </div>
            </div>

            {d.creative && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-xs font-medium">Criativo atual (somente leitura)</div>
                <div className="flex gap-3">
                  {d.creative.thumbnailUrl && (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <img src={d.creative.thumbnailUrl} className="w-20 h-20 object-cover rounded border border-border" />
                  )}
                  <div className="flex-1 text-[11px] space-y-1 min-w-0">
                    {d.creative.title && <div className="font-medium truncate">{d.creative.title}</div>}
                    {d.creative.body && <div className="text-muted-foreground line-clamp-3">{d.creative.body}</div>}
                    {d.creative.callToActionType && <div className="text-muted-foreground">CTA: {d.creative.callToActionType}</div>}
                    {d.creative.linkUrl && <div className="text-muted-foreground truncate">Link: {d.creative.linkUrl}</div>}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                  Para trocar imagem, texto ou CTA, duplique o anúncio, edite a cópia e pause o original, a Meta bloqueia alterações no criativo depois que ele começou a rodar.
                </div>
              </div>
            )}
          </div>
        )}

        <SheetFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={mut.isPending || !d} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Salvar alterações
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
