import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Phone, Instagram, MessageCircle } from "lucide-react";
import { BRAND } from "@/lib/brand";
import SpFlagMark from "./SpFlagMark";
import VanessaBrandLogo from "./VanessaBrandLogo";
const Footer = () => {
  const [legal, setLegal] = useState<"privacy" | "ads" | "terms" | null>(null);
  return (
    <footer className="vs-footer">
      <div className="container">
        <div className="vs-footer-grid">
          <div className="vs-footer-brand">
            <VanessaBrandLogo />
            <p className="vs-footer-creci">{BRAND.creci}</p>
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
            <p className="vs-contact-number">
              <Phone size={15} />
              {BRAND.whatsappDisplay}
            </p>
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
          <nav className="vs-policy-links" aria-label="Informações legais">
            <button type="button" onClick={() => setLegal("privacy")}>
              Política de privacidade
            </button>
            <button type="button" onClick={() => setLegal("ads")}>
              Plataformas de anúncios
            </button>
            <button type="button" onClick={() => setLegal("terms")}>
              Condições de uso
            </button>
          </nav>
          <p>
            Esta página oferece uma pré-análise informativa. Aprovação de
            financiamento, subsídio, taxas, prazos e condições dependem da
            análise oficial da instituição financeira. Não representa órgão
            público, não possui vínculo oficial com a Caixa Econômica Federal ou
            o Governo do Estado de São Paulo e não garante aprovação ou
            concessão de subsídio.
          </p>
          <span>
            © {new Date().getFullYear()} {BRAND.name}. Todos os direitos
            reservados.
          </span>
        </div>
      </div>
      <Dialog open={!!legal} onOpenChange={(open) => !open && setLegal(null)}>
        <DialogContent className="vs-legal-dialog" aria-describedby={undefined}>
          <DialogTitle>
            {legal === "privacy"
              ? "Política de privacidade"
              : legal === "ads"
                ? "Independência das plataformas de anúncios"
                : "Condições de uso"}
          </DialogTitle>
          {legal === "privacy" ? (
            <>
              <p>
                Vanessa Simoni, {BRAND.creci}, utiliza os dados informados neste
                site para responder à sua solicitação, organizar o atendimento e
                apresentar imóveis compatíveis com seu interesse.
              </p>
              <p>
                O formulário pode coletar nome, WhatsApp, cidade, preferências
                de imóvel e informações declaradas sobre renda, trabalho, FGTS e
                entrada. As conversas podem ser registradas no CRM e utilizar
                assistência automatizada, quando disponível. A pré-análise não
                decide nem garante crédito.
              </p>
              <p>
                A navegação pública pode registrar visitas, campanhas, páginas
                de imóveis, cliques e tempo de visualização para avaliar o
                atendimento e o desempenho do site. Os prestadores de
                hospedagem, banco de dados e comunicação processam informações
                necessárias ao funcionamento desses serviços.
              </p>
              <p>
                Para solicitar acesso, correção ou eliminação de dados, obter
                informações sobre seu uso ou interromper o contato, fale com
                Vanessa pelo WhatsApp {BRAND.whatsappDisplay}. A eliminação
                observa as hipóteses de conservação legalmente aplicáveis.
              </p>
              <p>
                Os dados são utilizados durante o atendimento e pelo período
                necessário às finalidades informadas e obrigações aplicáveis. Ao
                abrir WhatsApp, Instagram ou outra plataforma externa, também se
                aplicam as políticas do respectivo serviço.
              </p>
              <a
                href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares"
                target="_blank"
                rel="noopener noreferrer"
              >
                Conheça seus direitos na ANPD
              </a>
            </>
          ) : legal === "ads" ? (
            <>
              <p>
                Este site é de responsabilidade de Vanessa Simoni. Não é um site
                da Meta, Facebook, Instagram, Google ou TikTok, nem é
                patrocinado, administrado ou endossado por essas plataformas.
              </p>
              <p>
                As marcas mencionadas pertencem aos respectivos titulares. A
                veiculação de um anúncio nessas plataformas não significa
                vínculo institucional, recomendação ou garantia dos imóveis e
                serviços apresentados.
              </p>
              <p>
                As informações sobre imóveis e o atendimento são de
                responsabilidade da anunciante; o uso de plataformas externas
                segue seus próprios termos e políticas.
              </p>
            </>
          ) : (
            <>
              <p>
                O conteúdo apresenta imóveis e permite solicitar atendimento.
                Valores, disponibilidade, imagens e condições devem ser
                confirmados com Vanessa antes de qualquer contratação.
              </p>
              <p>
                A pré-análise é informativa. Financiamento, subsídios e
                condições dependem da avaliação oficial da instituição
                financeira. O envio de um formulário não constitui contrato,
                reserva de imóvel ou aprovação de crédito.
              </p>
              <p>
                Dúvidas e solicitações podem ser encaminhadas pelo WhatsApp{" "}
                {BRAND.whatsappDisplay}. Nenhuma condição aqui limita direitos
                previstos na legislação aplicável.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </footer>
  );
};
export default Footer;
