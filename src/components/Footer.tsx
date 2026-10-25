import { Phone, Instagram, MapPin } from "lucide-react";
import { BRAND } from "@/lib/brand";
import SpFlagMark from "./SpFlagMark";



const Footer = () => (
  <footer className="bg-foreground text-background">
    <div className="divider-sp" />
    <div className="container py-14">
      <div className="grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <div className="mb-4">
            <div className="font-heading font-bold text-lg">{BRAND.name}</div>
            <div className="text-[10px] uppercase tracking-widest text-secondary">Corretora Especialista MCMV</div>
          </div>
          <p className="text-sm text-background/70 max-w-md leading-relaxed">
            Especialista em Minha Casa Minha Vida em Campinas, Sumaré, Hortolândia e Paulínia.
            Missão: ajudar famílias a saírem do aluguel com orientação clara, humana e transparente.
          </p>
          <div className="flex items-center gap-2 text-xs text-background/60 mt-4">
            <MapPin className="w-3.5 h-3.5" />
            {BRAND.cities.join(" · ")} — Estado de São Paulo
          </div>
        </div>

        <div>
          <h4 className="font-heading font-bold mb-4 text-secondary">Navegação</h4>
          <nav className="space-y-2 text-sm">
            <a href="#analise" className="block text-background/70 hover:text-background transition-colors">Pré-análise</a>
            <a href="#beneficios" className="block text-background/70 hover:text-background transition-colors">Benefícios MCMV</a>
            <a href="#como-funciona" className="block text-background/70 hover:text-background transition-colors">Como funciona</a>
            <a href="#imoveis" className="block text-background/70 hover:text-background transition-colors">Imóveis</a>
            <a href="#faq" className="block text-background/70 hover:text-background transition-colors">Dúvidas</a>
          </nav>
        </div>

        <div>
          <h4 className="font-heading font-bold mb-4 text-secondary">Contato</h4>
          <div className="space-y-3 text-sm">
            <a href={`tel:+${BRAND.whatsappNumber}`} className="flex items-center gap-2 text-background/70 hover:text-background transition-colors">
              <Phone className="w-4 h-4" /> {BRAND.whatsappDisplay}
            </a>
            <a href={`https://wa.me/${BRAND.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-background/70 hover:text-background transition-colors">
              💬 WhatsApp
            </a>
            <a href={BRAND.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-background/70 hover:text-background transition-colors">
              <Instagram className="w-4 h-4" /> {BRAND.instagramHandle}
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-background/10 mt-12 pt-6 space-y-4">

        <p className="text-[11px] text-background/60 leading-relaxed max-w-4xl">
          <strong className="text-background/80">Aviso legal:</strong> Esta página oferece uma pré-análise informativa.
          A aprovação do financiamento, valor de subsídio, taxas, prazos e condições dependem da análise oficial da
          Caixa Econômica Federal ou da instituição financeira responsável. Esta página <strong>não representa órgão público</strong>,
          não possui vínculo oficial com a Caixa Econômica Federal ou o Governo do Estado de São Paulo, e não garante aprovação
          nem concessão de subsídio.
        </p>
        <p className="text-xs text-background/50 text-center">
          © {new Date().getFullYear()} {BRAND.name} — Corretora de Imóveis. Todos os direitos reservados.
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
