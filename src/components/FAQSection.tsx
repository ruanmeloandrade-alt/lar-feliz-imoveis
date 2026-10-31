import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { openVanessaChat } from "@/lib/public-site";
const faqs = [
  {
    q: "Preciso dar entrada para financiar pelo MCMV?",
    a: "Depende da faixa e da instituição financeira. Em muitos casos, o subsídio e o FGTS podem cobrir parte ou toda a entrada. Fazemos uma análise personalizada do seu caso.",
  },
  {
    q: "Autônomo ou informal consegue financiar?",
    a: "Sim, é possível. Existem formas alternativas de comprovar renda. A análise oficial é feita pela instituição financeira, e nós te orientamos para aumentar suas chances.",
  },
  {
    q: "Posso usar meu FGTS?",
    a: "Pode. O FGTS pode ser usado como entrada, para abater parcelas ou para quitar o saldo devedor, dentro das regras do programa.",
  },
  {
    q: "Nome sujo impede o financiamento?",
    a: "Restrições no CPF dificultam a análise de crédito. Se você está regularizando, dá para começar a preparação em paralelo. Orientamos o caminho mais seguro.",
  },
  {
    q: "Quanto tempo demora o processo?",
    a: "Depende da documentação e da análise da instituição. Em geral, entre 2 e 6 meses do primeiro contato até a entrega das chaves.",
  },
  {
    q: "A pré-análise garante aprovação?",
    a: "Não. A pré-análise é uma indicação inicial baseada nas informações fornecidas. A aprovação, valor de subsídio, taxas e prazos dependem da análise oficial da Caixa Econômica Federal ou da instituição financeira responsável.",
  },
];

const FAQSection = () => (
  <section id="faq" className="vs-section vs-faq">
    <div className="container vs-faq-layout">
      <div>
        <p className="vs-eyebrow">Respostas com clareza</p>
        <h2>
          Antes de decidir,
          <br />
          <em>tire suas dúvidas.</em>
        </h2>
        <p>
          Se a sua pergunta não está aqui, comece uma conversa com a Vanessa.
        </p>
        <button className="vs-text-link" onClick={() => openVanessaChat()}>
          Começar atendimento ↗
        </button>
      </div>
      <Accordion type="single" collapsible className="vs-faq-list">
        {faqs.map((f, i) => (
          <AccordionItem key={f.q} value={"faq-" + i}>
            <AccordionTrigger>{f.q}</AccordionTrigger>
            <AccordionContent>{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);
export default FAQSection;
