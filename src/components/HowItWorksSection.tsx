import { MessageSquare, UserCheck, FileText, Key } from "lucide-react";
const steps = [
  {
    icon: MessageSquare,
    title: "Pré-análise no site",
    desc: "Você compartilha seu perfil e seus planos para uma orientação individual.",
  },
  {
    icon: UserCheck,
    title: "Contato com a corretora",
    desc: "A Vanessa avalia seu perfil e te orienta sobre as possibilidades reais.",
  },
  {
    icon: FileText,
    title: "Documentação e simulação oficial",
    desc: "Ajudamos com os documentos e enviamos para análise da instituição financeira.",
  },
  {
    icon: Key,
    title: "Escolha do imóvel e assinatura",
    desc: "Selecionamos imóveis compatíveis e acompanhamos até a entrega das chaves.",
  },
];

const HowItWorksSection = () => (
  <section id="como-funciona" className="vs-section vs-process">
    <div className="container vs-process-layout">
      <div className="vs-process-intro">
        <p className="vs-eyebrow">Acompanhamento em cada etapa</p>
        <h2>
          Da primeira conversa
          <br />
          <em>às chaves na mão.</em>
        </h2>
        <p>
          Você entende o que acontece em cada passo e tem com quem contar
          durante a sua compra.
        </p>
        <a href="#analise" className="vs-text-link">
          Começar minha pré-análise ↗
        </a>
      </div>
      <ol className="vs-process-list">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="vs-process-number">0{i + 1}</span>
            <div>
              <s.icon size={20} strokeWidth={1.5} />
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  </section>
);
export default HowItWorksSection;
