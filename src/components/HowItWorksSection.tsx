import { motion } from "framer-motion";
import { MessageSquare, UserCheck, FileText, Key, ArrowRight } from "lucide-react";

const steps = [
  { icon: MessageSquare, title: "Pré-análise no site", desc: "Você compartilha seu perfil e seus planos para uma orientação individual." },
  { icon: UserCheck, title: "Contato com a corretora", desc: "A Vanessa avalia seu perfil e te orienta sobre as possibilidades reais." },
  { icon: FileText, title: "Documentação e simulação oficial", desc: "Ajudamos com os documentos e enviamos para análise da instituição financeira." },
  { icon: Key, title: "Escolha do imóvel e assinatura", desc: "Selecionamos imóveis compatíveis e acompanhamos até a entrega das chaves." },
];

const HowItWorksSection = () => (
  <section id="como-funciona" className="py-16 md:py-24 bg-background">
    <div className="container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16 max-w-2xl mx-auto"
      >
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Passo a passo</span>
        <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mt-2">
          Como funciona o atendimento
        </h2>
        <p className="text-muted-foreground mt-3">
          Do primeiro contato até as chaves na mão, com acompanhamento em cada etapa.
        </p>
      </motion.div>

      <div className="max-w-6xl mx-auto relative">
        {/* Linha horizontal contínua (desktop) */}
        <div
          aria-hidden
          className="hidden lg:block absolute top-8 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        />
        {/* Linha vertical (mobile) */}
        <div
          aria-hidden
          className="lg:hidden absolute top-0 bottom-0 left-8 w-px bg-gradient-to-b from-transparent via-primary/40 to-transparent"
        />

        <ol className="grid lg:grid-cols-4 gap-12 lg:gap-6 relative">
          {steps.map((s, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, type: "spring", stiffness: 90 }}
              className="group relative flex lg:flex-col items-start lg:items-center gap-5 lg:gap-4 lg:text-center"
            >
              {/* Marcador numerado + ícone */}
              <div className="relative shrink-0">
                {/* halo */}
                <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative w-16 h-16 rounded-full bg-background border-2 border-primary/30 flex items-center justify-center transition-all duration-500 group-hover:border-primary group-hover:-translate-y-1 group-hover:shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)]">
                  <s.icon className="w-7 h-7 text-primary transition-transform duration-500 group-hover:scale-110" />
                </div>
                {/* número */}
                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[11px] font-heading font-black flex items-center justify-center shadow-md ring-2 ring-background">
                  {i + 1}
                </span>
              </div>

              <div className="flex-1 lg:max-w-[220px]">
                <h3 className="font-heading font-bold text-foreground text-base leading-tight mb-1.5">
                  {s.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>
              </div>

              {/* Seta entre passos (desktop, exceto último) */}
              {i < steps.length - 1 && (
                <ArrowRight
                  aria-hidden
                  className="hidden lg:block absolute top-6 -right-3 w-5 h-5 text-primary/50"
                />
              )}
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  </section>
);

export default HowItWorksSection;
