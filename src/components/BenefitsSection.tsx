import {
  HandCoins,
  BadgePercent,
  Landmark,
  Clock,
  Home,
  ShieldCheck,
} from "lucide-react";
const benefits = [
  {
    icon: BadgePercent,
    title: "Possibilidade de subsídio",
    desc: "Famílias enquadradas podem receber ajuda do governo para reduzir o valor financiado.",
  },
  {
    icon: HandCoins,
    title: "Juros reduzidos",
    desc: "Taxas de juros entre as menores do mercado, específicas do programa habitacional.",
  },
  {
    icon: Landmark,
    title: "Uso do FGTS",
    desc: "Você pode usar seu FGTS como entrada ou para abater parcelas do financiamento.",
  },
  {
    icon: Clock,
    title: "Prazos de financiamento",
    desc: "A instituição financeira define os prazos e as parcelas na análise do financiamento.",
  },
  {
    icon: Home,
    title: "Condições de entrada",
    desc: "A entrada e o valor financiado são avaliados conforme o imóvel e o seu perfil.",
  },
  {
    icon: ShieldCheck,
    title: "Segurança institucional",
    desc: "Financiamento por instituição financeira responsável, com regras claras.",
  },
];

const BenefitsSection = () => (
  <section id="beneficios" className="vs-section vs-benefits">
    <div className="container">
      <div className="vs-section-heading">
        <div>
          <p className="vs-eyebrow">Minha Casa Minha Vida</p>
          <h2>
            Entenda os caminhos
            <br />
            <em>para sair do aluguel.</em>
          </h2>
        </div>
        <p>
          Cada conquista começa com informação. Conheça as possibilidades do
          programa e conte com orientação para avaliar seu caso.
        </p>
      </div>
      <ul className="vs-benefit-grid">
        {benefits.map((b, i) => (
          <li key={b.title}>
            <div className="vs-benefit-top">
              <b.icon size={23} strokeWidth={1.5} />
              <span>0{i + 1}</span>
            </div>
            <h3>{b.title}</h3>
            <p>{b.desc}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);
export default BenefitsSection;
