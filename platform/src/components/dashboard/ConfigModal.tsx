import { X, Plug, Sparkles } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onOpenAddKpi?: () => void;
}

export function ConfigModal({ open, onOpenChange, onOpenAddKpi }: Props) {
 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="!max-w-xl p-0 overflow-hidden gap-0">
 <div className="px-6 pt-5 pb-4 border-b border-border flex items-start justify-between gap-3">
 <div>
 <h2 className="text-lg font-bold text-foreground">Configurar Dashboard</h2>
 <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">
 A organização da dashboard agora é por KPI: você escolhe quais quer ver
 e ajusta o tamanho de cada card direto na grid.
 </p>
 </div>
 <button
 onClick={() => onOpenChange(false)}
 className="text-muted-foreground hover:text-foreground transition-colors p-1"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

 <div className="px-6 py-5 space-y-4">
 <div className="rounded-lg border border-border bg-card p-4">
 <div className="flex items-center gap-2 mb-1">
 <Sparkles className="w-4 h-4 text-primary" />
 <h3 className="text-sm font-semibold">Adicionar KPIs</h3>
 </div>
 <p className="text-xs text-muted-foreground mb-3">
 Catálogo completo organizado por fonte (Meta Ads, Google Ads, TikTok, Vanessa Simoni nativo).
 Tags, campos personalizados e responsáveis do CRM aparecem automaticamente.
 </p>
 <Button size="sm" onClick={() => { onOpenChange(false); onOpenAddKpi?.(); }}>
 Abrir catálogo de KPIs
 </Button>
 </div>

 <div className="rounded-lg border border-border bg-card p-4">
 <div className="flex items-center gap-2 mb-1">
 <Plug className="w-4 h-4 text-primary" />
 <h3 className="text-sm font-semibold">Conectar mais fontes</h3>
 </div>
 <p className="text-xs text-muted-foreground mb-3">
 Cada nova integração libera o catálogo de KPIs dela. Sem mockup - você só vê o que
 está realmente conectado.
 </p>
 <a href="/integracoes" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
 Ir para Integrações →
 </a>
 </div>
 </div>
 </DialogContent>
 </Dialog>
 );
}
