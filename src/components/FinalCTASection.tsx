import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { waUrl, BRAND } from "@/lib/brand";

const FinalCTASection = () => (
  <section className="py-16 md:py-24 bg-hero text-primary-foreground relative overflow-hidden">
    <div className="divider-sp absolute top-0 inset-x-0" />
    <div className="container text-center relative z-10">
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <span className="text-xs uppercase tracking-widest text-secondary font-semibold">Próximo passo</span>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-bold mt-3 mb-5">
          Saia do aluguel com <span className="text-gradient-gold">orientação especializada</span>.
        </h2>
        <p className="text-lg text-primary-foreground/80 mb-8 max-w-xl mx-auto">
          Fale agora com a corretora Vanessa Simoni e descubra sua possibilidade real de financiamento pelo MCMV em {BRAND.cities.join(", ")}.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href={waUrl("Olá Vanessa, quero conversar sobre o Minha Casa Minha Vida.")} target="_blank" rel="noopener noreferrer">
            <Button variant="whatsapp" size="xl">
              <MessageCircle className="w-5 h-5" /> Falar no WhatsApp agora
            </Button>
          </a>
          <a href="#analise">
            <Button variant="heroOutline" size="xl">
              Fazer pré-análise
            </Button>
          </a>
        </div>
      </motion.div>
    </div>
  </section>
);

export default FinalCTASection;
