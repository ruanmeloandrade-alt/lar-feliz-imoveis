const testimonials = [
  {
    name: "Ana Paula",
    city: "Campinas, SP",
    text: "Pagávamos aluguel há anos e não sabíamos que dava pra financiar. A Vanessa nos orientou em tudo e hoje temos nosso apartamento.",
  },
  {
    name: "Rodrigo e Camila",
    city: "Sumaré, SP",
    text: "Achei que meu CPF fosse impedir, mas ela mostrou o caminho pra regularizar. Recebemos as chaves em poucos meses!",
  },
  {
    name: "Josiane Oliveira",
    city: "Hortolândia, SP",
    text: "Atendimento humano e transparente. Fui informada de cada passo, sem promessas mirabolantes. Recomendo demais.",
  },
];

const TestimonialsSection = () => (
  <section className="vs-section vs-testimonials">
    <div className="container">
      <div className="vs-section-heading">
        <div>
          <p className="vs-eyebrow">Pessoas e novas histórias</p>
          <h2>
            Quem já deu
            <br />
            <em>o próximo passo.</em>
          </h2>
        </div>
        <p>Famílias atendidas em Campinas e região, no estado de São Paulo.</p>
      </div>
      <div className="vs-testimonial-grid">
        {testimonials.map((t) => (
          <figure key={t.name}>
            <span aria-hidden="true" className="vs-quote">
              “
            </span>
            <blockquote>{t.text}</blockquote>
            <figcaption>
              <strong>{t.name}</strong>
              <span>{t.city}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  </section>
);
export default TestimonialsSection;
