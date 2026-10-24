import { MessageCircle } from "lucide-react";
import { waUrl } from "@/lib/brand";

const WhatsAppFloat = () => (
  <a
    href={waUrl("Olá Vanessa, quero saber se posso comprar meu imóvel pelo Minha Casa Minha Vida.")}
    target="_blank"
    rel="noopener noreferrer"
    className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 flex flex-col items-end gap-2 group"
    aria-label="Fale conosco pelo WhatsApp"
  >
    {/* Balão só aparece em telas ≥ sm para não poluir o mobile */}
    <div className="hidden sm:block relative bg-background text-foreground text-[11px] font-semibold leading-tight px-3 py-2 rounded-lg shadow-lg border border-border">
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
        </span>
        Estamos online
      </span>
      <span className="block text-muted-foreground font-medium mt-0.5 whitespace-nowrap">
        Fale conosco
      </span>
      <span className="absolute right-4 -bottom-1.5 w-3 h-3 bg-background border-r border-b border-border rotate-45" />
    </div>

    {/* Botão — 48×48 no mobile para bom alvo de toque */}
    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-200 group-hover:scale-105 ring-2 ring-background">
      <MessageCircle className="w-6 h-6" />
    </div>
  </a>
);

export default WhatsAppFloat;
