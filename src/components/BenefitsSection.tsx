import { motion } from "framer-motion";
import { HandCoins, BadgePercent, Landmark, Clock, Home, ShieldCheck } from "lucide-react";

const benefits = [
  { icon: BadgePercent, title: "Subsídio de até R$ 55 mil", desc: "Famílias enquadradas podem receber ajuda do governo para reduzir o valor financiado." },
  { icon: HandCoins, title: "Juros reduzidos", desc: "Taxas de juros entre as menores do mercado, específicas do programa habitacional." },
  { icon: Landmark, title: "Uso do FGTS", desc: "Você pode usar seu FGTS como entrada ou para abater parcelas do financiamento." },
  { icon: Clock, title: "Prazo de até 35 anos", desc: "Parcelas que cabem no bolso, com prazo estendido e previsibilidade." },
  { icon: Home, title: "Financiamento de até 90%", desc: "Você pode financiar quase o valor total do imóvel, com entrada reduzida." },
  { icon: ShieldCheck, title: "Segurança institucional", desc: "Financiamento por instituição financeira responsável, com regras claras." },
];

const BenefitsSection = () => (
  <section id="beneficios" className="py-16 md:py-24 bg-muted">
    <div className="container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-14 max-w-2xl mx-auto"
      >
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Programa Habitacional</span>
        <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mt-2">
          Benefícios do Minha Casa Minha Vida
        </h2>
        <p className="text-muted-foreground mt-3">
          Condições facilitadas para famílias de baixa e média renda saírem do aluguel.
        </p>
      </motion.div>

      <ul className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-x-12 gap-y-2 divide-y divide-border/60 sm:divide-y-0">
        {benefits.map((b, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="group relative flex items-start gap-5 py-5 sm:border-b sm:border-border/60"
          >
            {/* Ícone tipográfico, sem bloco */}
            <div className="relative shrink-0 pt-1">
              <b.icon
                className="w-7 h-7 text-primary transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-0.5"
                strokeWidth={1.75}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3">
                <span className="font-heading text-[11px] font-black text-primary/40 tracking-widest tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-heading font-bold text-foreground text-base sm:text-lg leading-tight">
                  {b.title}
                </h3>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {b.desc}
              </p>
              {/* underline animado */}
              <div className="mt-3 h-[2px] w-8 bg-primary/70 rounded-full transition-all duration-500 group-hover:w-24" />
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  </section>
);

export default BenefitsSection;
