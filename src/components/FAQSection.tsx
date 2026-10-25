import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { waUrl } from "@/lib/brand";

const faqs = [
  { q: "Preciso dar entrada para financiar pelo MCMV?", a: "Depende da faixa e da instituição financeira. Em muitos casos, o subsídio e o FGTS podem cobrir parte ou toda a entrada. Fazemos uma análise personalizada do seu caso." },
  { q: "Autônomo ou informal consegue financiar?", a: "Sim, é possível. Existem formas alternativas de comprovar renda. A análise oficial é feita pela instituição financeira, e nós te orientamos para aumentar suas chances." },
  { q: "Posso usar meu FGTS?", a: "Pode. O FGTS pode ser usado como entrada, para abater parcelas ou para quitar o saldo devedor, dentro das regras do programa." },
  { q: "Nome sujo impede o financiamento?", a: "Restrições no CPF dificultam a análise de crédito. Se você está regularizando, dá para começar a preparação em paralelo. Orientamos o caminho mais seguro." },
  { q: "Quanto tempo demora o processo?", a: "Depende da documentação e da análise da instituição. Em geral, entre 2 e 6 meses do primeiro contato até a entrega das chaves." },
  { q: "A pré-análise garante aprovação?", a: "Não. A pré-análise é uma indicação inicial baseada nas informações fornecidas. A aprovação, valor de subsídio, taxas e prazos dependem da análise oficial da Caixa Econômica Federal ou da instituição financeira responsável." },
];

const FAQSection = () => (
  <section id="faq" className="py-16 md:py-24 bg-muted">
    <div className="container max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Dúvidas frequentes</span>
        <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mt-2">Ainda tem dúvidas? A gente responde.</h2>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="bg-card rounded-lg px-6 border border-border shadow-card">
              <AccordionTrigger className="text-left font-heading font-semibold text-foreground hover:no-underline py-5">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-5 leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </motion.div>

      <div className="text-center mt-10">
        <p className="text-muted-foreground text-sm mb-4">Prefere falar direto?</p>
        <a href={waUrl("Olá Vanessa, tenho uma dúvida sobre o Minha Casa Minha Vida.")} target="_blank" rel="noopener noreferrer">
          <Button variant="default" size="lg">Falar com a corretora</Button>
        </a>
      </div>
    </div>
  </section>
);

export default FAQSection;
