import { ArrowUpRight, MapPin, ArrowDown } from "lucide-react";
import { BRAND } from "@/lib/brand";
import vanessa from "@/assets/vanessa.jpg";
import neighborhood from "@/assets/condominio-bg.jpg";
import flag from "@/assets/bandeira-sp.svg";
const HeroSection = () => (
  <section className="vs-hero">
    <div className="container vs-hero-grid">
      <div className="vs-hero-copy">
        <p className="vs-eyebrow">
          <MapPin size={15} />
          Campinas e região
        </p>
        <h1>
          O seu próximo capítulo
          <br />
          começa com uma
          <br />
          <em>boa escolha.</em>
        </h1>
        <p className="vs-hero-description">
          Um imóvel que combina com a sua vida. Uma corretora ao seu lado para
          encontrar o caminho até ele.
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
          {BRAND.cities.join(" · ")}
        </div>
      </div>
      <div className="vs-hero-visual">
        <div className="vs-hero-architecture">
          <img src={neighborhood} alt="Arquitetura residencial" />
          <span>Viver bem começa pela escolha.</span>
        </div>
        <figure className="vs-portrait">
          <img src={vanessa} alt="Vanessa Simoni, corretora de imóveis" />
          <figcaption>
            <span>Conheça sua corretora</span>
            <strong>Vanessa Simoni</strong>
            <p>Imóveis e Minha Casa Minha Vida</p>
          </figcaption>
        </figure>
        <span className="vs-vertical">Pessoas, planos e novos começos.</span>
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
