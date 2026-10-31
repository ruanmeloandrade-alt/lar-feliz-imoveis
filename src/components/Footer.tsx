import { Phone, Instagram, MessageCircle } from "lucide-react";
import { BRAND } from "@/lib/brand";
import SpFlagMark from "./SpFlagMark";
const Footer = () => (
  <footer className="vs-footer">
    <div className="container">
      <div className="vs-footer-grid">
        <div className="vs-footer-brand">
          <strong>{BRAND.name}</strong>
          <span>Corretora de imóveis · Minha Casa Minha Vida</span>
          <p>
            Orientação próxima e transparente para encontrar seu imóvel em
            Campinas e região.
          </p>
          <div className="vs-footer-region">
            <SpFlagMark size={40} />
            <span>
              Estado de São Paulo
              <br />
              {BRAND.cities.join(" · ")}
            </span>
          </div>
        </div>
        <nav aria-label="Navegação do rodapé">
          <h3>Explore</h3>
          <a href="#imoveis">Imóveis</a>
          <a href="#beneficios">Minha Casa Minha Vida</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#analise">Pré-análise</a>
          <a href="#faq">Dúvidas frequentes</a>
        </nav>
        <div className="vs-footer-contact">
          <h3>Converse com a Vanessa</h3>
          <a href={"tel:+" + BRAND.whatsappNumber}>
            <Phone size={15} />
            {BRAND.whatsappDisplay}
          </a>
          <a
            href={"https://wa.me/" + BRAND.whatsappNumber}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={15} />
            WhatsApp
          </a>
          <a href={BRAND.instagram} target="_blank" rel="noopener noreferrer">
            <Instagram size={15} />
            {BRAND.instagramHandle}
          </a>
        </div>
      </div>
      <div className="vs-footer-legal">
        <p>
          Esta página oferece uma pré-análise informativa. Aprovação de
          financiamento, subsídio, taxas, prazos e condições dependem da análise
          oficial da instituição financeira. Não representa órgão público, não
          possui vínculo oficial com a Caixa Econômica Federal ou o Governo do
          Estado de São Paulo e não garante aprovação ou concessão de subsídio.
        </p>
        <span>
          © {new Date().getFullYear()} {BRAND.name}. Todos os direitos
          reservados.
        </span>
      </div>
    </div>
  </footer>
);
export default Footer;
