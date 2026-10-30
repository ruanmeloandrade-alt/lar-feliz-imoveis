import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BRAND, waUrl } from "@/lib/brand";

const Header = () => {
  const [open, setOpen] = useState(false);

  const links = [
    { href: "#analise", label: "Pré-análise" },
    { href: "#beneficios", label: "Benefícios" },
    { href: "#como-funciona", label: "Como funciona" },
    { href: "#imoveis", label: "Imóveis" },
    { href: "#faq", label: "Dúvidas" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="container flex items-center justify-between h-16">
        <a href="#" className="flex items-center gap-3 group">
          <div className="leading-tight">
            <div className="font-heading font-bold text-base text-foreground">{BRAND.name}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Corretora MCMV · SP</div>
          </div>
        </a>

        <nav className="hidden lg:flex items-center gap-6">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              {l.label}
            </a>
          ))}
          <a href={waUrl("Olá, quero fazer minha pré-análise do Minha Casa Minha Vida.")} target="_blank" rel="noopener noreferrer">
            <Button variant="default" size="sm">Falar no WhatsApp</Button>
          </a>
        </nav>

        <button className="lg:hidden text-foreground" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="lg:hidden bg-background border-b border-border overflow-hidden">
            <nav className="container flex flex-col gap-3 py-4">
              {links.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors py-2">
                  {l.label}
                </a>
              ))}
              <a href={waUrl("Olá, quero fazer minha pré-análise do Minha Casa Minha Vida.")} target="_blank" rel="noopener noreferrer">
                <Button variant="default" className="w-full">Falar no WhatsApp</Button>
              </a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
