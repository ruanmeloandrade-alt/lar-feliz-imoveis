import { ArrowUpRight, ArrowDown } from "lucide-react";
import { BRAND } from "@/lib/brand";
import vanessa from "@/assets/vanessa.jpg";
import flag from "@/assets/bandeira-sp.svg";
const HeroSection = () => (
  <section className="vs-hero">
    <div className="container vs-hero-grid">
      <div className="vs-hero-copy">
        <h1>
          Seu imóvel em São Paulo.
          <em>Seu próximo capítulo.</em>
        </h1>
        <p className="vs-hero-description">
          Imóveis em Campinas e região, com orientação especializada em Minha
          Casa Minha Vida. Da escolha à documentação, a Vanessa acompanha você.
        </p>
        <div className="vs-hero-actions">
          <a className="vs-button" href="#imoveis">
            Encontre seu imóvel
            <ArrowUpRight size={18} />
          </a>
          <a className="vs-text-link" href="#analise">
            Faça sua pré-análise
            <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="vs-hero-note">
          <span className="vs-line" />
          <p>
            Orientação próxima. Escolhas com clareza.
            <br />
            <strong>Do primeiro contato à conquista do seu lugar.</strong>
          </p>
        </div>
        <div className="vs-region">
          <img src={flag} alt="São Paulo" />
          <span>
            <strong>São Paulo</strong>
            <small>{BRAND.cities.join(" · ")}</small>
          </span>
        </div>
      </div>
      <div className="vs-hero-visual">
        <figure className="vs-portrait">
          <img src={vanessa} alt="Vanessa Simoni, corretora de imóveis" />
          <figcaption>
            <div>
              <span>Conheça sua corretora</span>
              <strong>Vanessa Simoni</strong>
              <p>Imóveis e Minha Casa Minha Vida</p>
            </div>
            <div className="vs-creci">
              <span>CRECI-SP</span>
              <strong>273754-F</strong>
            </div>
          </figcaption>
        </figure>
      </div>
    </div>
    <div className="container vs-hero-bottom">
      <span>Seu lugar. Sua história.</span>
      <a href="#imoveis">
        Explore os empreendimentos
        <ArrowDown size={15} />
      </a>
    </div>
  </section>
);
export default HeroSection;
