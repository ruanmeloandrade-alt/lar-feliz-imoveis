import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { CheckCircle2, MessageCircle, MapPin, ShieldCheck, HandCoins, Sparkles } from "lucide-react";
import { BRAND, waUrl } from "@/lib/brand";
import vanessa from "@/assets/vanessa.jpg";
import bandeiraSP from "@/assets/bandeira-sp.svg";

const trustItems = [
  { icon: ShieldCheck, text: "Atendimento com corretora especializada" },
  { icon: HandCoins, text: "Possibilidade de subsídio" },
  { icon: Sparkles, text: "Orientação até a aprovação" },
  { icon: CheckCircle2, text: "Simulação sem compromisso" },
];

const HeroSection = () => {
  return (
    <section className="relative bg-hero text-primary-foreground overflow-hidden pt-16">
      {/* Faixa institucional SP */}
      <div className="divider-sp" />
      {/* Watermark bandeira SP */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-10 w-[560px] h-[380px] opacity-[0.06] rotate-[-8deg]"
        style={{ background: `url(${bandeiraSP}) center/contain no-repeat` }}
      />

      <div className="container relative z-10 py-14 md:py-20">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-7"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-foreground/10 border border-primary-foreground/15 text-primary-foreground/90 text-xs font-semibold tracking-wide uppercase mb-6 backdrop-blur-sm">
              <MapPin className="w-3.5 h-3.5 text-secondary" />
              {BRAND.cities.join(" · ")}
            </div>

            <h1 className="font-heading text-[clamp(1.9rem,7vw,3.75rem)] font-bold leading-[1.05] mb-6">
              Descubra se você pode comprar seu imóvel pelo{" "}
              <span className="text-gradient-gold">Minha Casa Minha Vida</span> em São Paulo
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-primary-foreground/80 mb-4 max-w-2xl">
              Faça uma pré-análise gratuita e veja se sua renda pode se enquadrar nas condições do programa habitacional.
            </p>

            <p className="text-sm text-primary-foreground/60 mb-8 max-w-xl">
              Em poucos minutos, nossa equipe consegue entender seu perfil, sua renda e sua possibilidade de financiamento.
              A pré-análise é gratuita e não garante aprovação, mas ajuda a indicar o melhor caminho para sair do aluguel.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <a href="#analise">
                <Button variant="hero" size="xl" className="w-full sm:w-auto">
                  Começar minha análise gratuita
                </Button>
              </a>
              <a href={waUrl("Olá Vanessa, quero saber se posso comprar meu imóvel pelo Minha Casa Minha Vida.")} target="_blank" rel="noopener noreferrer">
                <Button variant="heroOutline" size="xl" className="w-full sm:w-auto">
                  <MessageCircle className="w-5 h-5" /> WhatsApp direto
                </Button>
              </a>
            </div>

            <ul className="grid sm:grid-cols-2 gap-3">
              {trustItems.map((t, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-primary-foreground/85">
                  <t.icon className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
                  <span>{t.text}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="lg:col-span-5 hidden md:block"
          >
            <div className="relative">
              <div className="absolute -inset-4 bg-gold blur-2xl opacity-20 rounded-3xl" />
              <div className="relative rounded-2xl overflow-hidden border-4 border-secondary/40 shadow-2xl aspect-[4/5] max-w-sm lg:max-w-md ml-auto">
                <img src={vanessa} alt="Corretora Vanessa Simoni" className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5">
                  <p className="font-heading text-xl text-white font-bold">Vanessa Simoni</p>
                  <p className="text-xs uppercase tracking-widest text-secondary">Corretora Especialista MCMV</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
