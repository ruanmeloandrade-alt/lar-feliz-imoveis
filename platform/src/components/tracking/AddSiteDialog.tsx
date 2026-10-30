import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createTrackingSite } from "@/lib/tracking.functions";

export function AddSiteDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const qc = useQueryClient();
  const createFn = useServerFn(createTrackingSite);
  const m = useMutation({
    mutationFn: async () => createFn({ data: { workspaceId, name, domain } }),
    onSuccess: () => {
      toast.success("Site adicionado. Copie o pixel na aba Instalação.");
      qc.invalidateQueries({ queryKey: ["tracking-sites", workspaceId] });
      setName("");
      setDomain("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao adicionar site"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar site / domínio</DialogTitle>
          <DialogDescription>
            Registre um site que vai receber o pixel Vanessa Simoni. Você pode adicionar quantos precisar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="site-name" className="text-xs">Nome</Label>
            <Input
              id="site-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Site institucional"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="site-domain" className="text-xs">Domínio</Label>
            <Input
              id="site-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="seu-site.com.br"
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Só o domínio, sem https:// nem barra no final.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !name.trim() || !domain.trim()}
          >
            {m.isPending ? "Adicionando…" : "Adicionar site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
