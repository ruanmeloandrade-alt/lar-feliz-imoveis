import React from "react";
import { createRoot } from "react-dom/client";
import { CheckCircle2, Home, MessageCircle, ShieldCheck, Sparkles, MapPin, HandCoins } from "lucide-react";
import "./styles.css";

const whatsappNumber = "5519992250701";
const whatsappText = "Ola Vanessa, quero saber se posso comprar meu imovel pelo Minha Casa Minha Vida.";
const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappText)}`;

const cities = ["Campinas", "Sumare", "Hortolandia", "Paulinia"];

const benefits = [
  [ShieldCheck, "Pre-analise gratuita", "Entenda se sua renda pode se enquadrar antes de visitar os imoveis."],
  [HandCoins, "Possibilidade de subsidio", "Orientacao sobre entrada, parcelas e caminhos para financiamento."],
  [Home, "Imoveis para familia", "Opcoes pensadas para quem quer sair do aluguel com seguranca."],
  [Sparkles, "Acompanhamento humano", "Atendimento direto com Vanessa Simoni pelo WhatsApp."],
] as const;

const steps = [
  "Voce envia seus dados basicos pelo WhatsApp.",
  "A corretora avalia renda, perfil e possibilidades do MCMV.",
  "Voce recebe orientacao clara sobre proximos passos.",
  "Se fizer sentido, a visita e a proposta seguem com acompanhamento.",
];

function App() {
  return (
    <main>
      <section className="hero">
        <nav className="nav">
          <strong>Lar Feliz Imoveis</strong>
          <a href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>
        </nav>

        <div className="heroGrid">
          <div>
            <p className="eyebrow"><MapPin size={16} /> {cities.join(" · ")}</p>
            <h1>Descubra se voce pode comprar seu imovel pelo Minha Casa Minha Vida</h1>
            <p className="lead">Faca uma pre-analise gratuita com Vanessa Simoni e veja se sua renda pode se enquadrar nas condicoes do programa habitacional.</p>
            <p className="support">Em poucos minutos, a equipe entende seu perfil, sua renda e sua possibilidade de financiamento. A pre-analise nao garante aprovacao, mas ajuda a indicar o melhor caminho para sair do aluguel.</p>
            <div className="actions">
              <a className="button primary" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={20} /> Comecar analise gratuita</a>
              <a className="button secondary" href="#como-funciona">Ver como funciona</a>
            </div>
          </div>
          <aside className="profileCard">
            <div className="portrait">VS</div>
            <h2>Vanessa Simoni</h2>
            <p>Corretora especialista Minha Casa Minha Vida</p>
            <ul>
              <li><CheckCircle2 size={18} /> Atendimento consultivo</li>
              <li><CheckCircle2 size={18} /> Simulacao sem compromisso</li>
              <li><CheckCircle2 size={18} /> Foco em Campinas e regiao</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section benefits">
        {benefits.map(([Icon, title, text]) => (
          <article className="card" key={title}>
            <Icon />
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="section split" id="como-funciona">
        <div>
          <p className="eyebrow">Processo simples</p>
          <h2>Do primeiro contato ate a proxima decisao</h2>
          <p>O objetivo e tirar a duvida principal com clareza: se vale seguir para simulacao, escolha de imovel e proposta.</p>
        </div>
        <ol className="steps">
          {steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="section cta">
        <h2>Quer saber se voce se enquadra?</h2>
        <p>Chame a Vanessa no WhatsApp e envie as informacoes basicas para a pre-analise.</p>
        <a className="button primary" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={20} /> Falar com Vanessa</a>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
