import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  { name: "Ana Paula", city: "Campinas, SP", text: "Pagávamos aluguel há anos e não sabíamos que dava pra financiar. A Vanessa nos orientou em tudo e hoje temos nosso apartamento." },
  { name: "Rodrigo e Camila", city: "Sumaré, SP", text: "Achei que meu CPF fosse impedir, mas ela mostrou o caminho pra regularizar. Recebemos as chaves em poucos meses!" },
  { name: "Josiane Oliveira", city: "Hortolândia, SP", text: "Atendimento humano e transparente. Fui informada de cada passo, sem promessas mirabolantes. Recomendo demais." },
];

const TestimonialsSection = () => (
  <section className="py-16 md:py-24 bg-background">
    <div className="container">
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12 max-w-2xl mx-auto">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Quem já saiu do aluguel</span>
        <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mt-2">Famílias atendidas em São Paulo</h2>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {testimonials.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="bg-card rounded-lg p-6 shadow-card border border-border"
          >
            <div className="flex gap-0.5 mb-3">
              {[...Array(5)].map((_, j) => (
                <Star key={j} className="w-4 h-4 fill-secondary text-secondary" />
              ))}
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed mb-5 italic">"{t.text}"</p>
            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <div className="w-10 h-10 rounded-full bg-foreground text-secondary flex items-center justify-center font-heading font-bold text-sm">
                {t.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.city}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default TestimonialsSection;
