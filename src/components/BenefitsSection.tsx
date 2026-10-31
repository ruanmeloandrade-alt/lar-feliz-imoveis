import neighborhood from "@/assets/condominio-bg.jpg";
const BenefitsSection = () => (
  <section id="beneficios" className="vs-section vs-benefits">
    <div className="container vs-benefits-story">
      <figure>
        <img src={neighborhood} alt="Arquitetura residencial" loading="lazy" />
        <figcaption>Novos planos. Um lugar para chamar de seu.</figcaption>
      </figure>
      <div>
        <p className="vs-eyebrow">Minha Casa Minha Vida</p>
        <h2>
          Um caminho possível
          <br />
          <em>para o seu imóvel.</em>
        </h2>
        <p>
          O primeiro passo é entender o seu momento. A Vanessa orienta você
          sobre as possibilidades de subsídio, uso do FGTS e condições de
          financiamento, de acordo com o seu perfil e as regras da instituição
          financeira.
        </p>
        <p>
          Em vez de decidir sozinho, você tem acompanhamento para conhecer os
          imóveis, preparar a documentação e avaliar as condições da sua compra
          com clareza.
        </p>
        <a href="#analise" className="vs-text-link">
          Quero entender minhas possibilidades ↗
        </a>
      </div>
    </div>
  </section>
);
export default BenefitsSection;
