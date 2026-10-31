import { MessageCircle } from "lucide-react";
import { openVanessaChat } from "@/lib/public-site";
const FinalCTASection = () => (
  <section className="vs-final-cta">
    <div className="container">
      <div className="vs-final-copy">
        <p className="vs-eyebrow">Seu próximo passo</p>
        <h2>
          Vamos encontrar
          <br />
          <em>o seu lugar?</em>
        </h2>
        <p>
          Conte seus planos. A Vanessa ajuda você a entender as possibilidades e
          conhecer os imóveis.
        </p>
      </div>
      <div className="vs-final-actions">
        <button className="vs-button" onClick={() => openVanessaChat()}>
          <MessageCircle size={20} aria-hidden="true" /> Começar atendimento
        </button>
        <a className="vs-text-link" href="#analise">
          Fazer minha pré-análise
        </a>
      </div>
    </div>
  </section>
);
export default FinalCTASection;
