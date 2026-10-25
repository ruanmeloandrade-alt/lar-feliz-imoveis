import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MessageCircle, CheckCircle2, AlertCircle, Sparkles, Home, Wallet, TrendingUp, Calendar, Coins, Briefcase, ShieldCheck, KeyRound, MapPin, PiggyBank, UserRound, Trophy, Zap } from "lucide-react";
import { waUrl } from "@/lib/brand";
import { supabase } from "@/integrations/supabase/client";

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });


type FormData = {
  renda: string;
  tipoTrabalho: string;
  fgts: string;
  fgtsValor: string;
  cpfLimpo: string;
  possuiImovel: string;
  cidade: string;
  entrada: string;
  nome: string;
  whatsapp: string;
  email: string;
};

const initialData: FormData = {
  renda: "", tipoTrabalho: "", fgts: "", fgtsValor: "", cpfLimpo: "", possuiImovel: "",
  cidade: "", entrada: "", nome: "", whatsapp: "", email: "",
};

const STEP_META = [
  { icon: Coins, chip: "Renda", vibe: "Vamos começar 💪", xp: 10 },
  { icon: Briefcase, chip: "Trabalho", vibe: "Você é dos bons! 🎯", xp: 15 },
  { icon: PiggyBank, chip: "FGTS", vibe: "Cada real conta 💰", xp: 20 },
  { icon: ShieldCheck, chip: "CPF", vibe: "Quase lá, siga firme 🛡️", xp: 15 },
  { icon: KeyRound, chip: "Imóvel", vibe: "Detalhe importante 🗝️", xp: 15 },
  { icon: MapPin, chip: "Cidade", vibe: "Onde é seu lar? 📍", xp: 10 },
  { icon: Wallet, chip: "Entrada", vibe: "Preparando o terreno 🏗️", xp: 10 },
  { icon: UserRound, chip: "Contato", vibe: "Última etapa! 🚀", xp: 20 },
];

const levelFromXp = (xp: number) => {
  if (xp >= 100) return { name: "Pronto para as chaves", color: "text-accent" };
  if (xp >= 70) return { name: "Estrategista", color: "text-secondary" };
  if (xp >= 40) return { name: "Explorador", color: "text-primary" };
  if (xp >= 15) return { name: "Iniciante", color: "text-primary/70" };
  return { name: "Recém-chegado", color: "text-muted-foreground" };
};

const formatCurrencyInput = (raw: string) => {
  const num = raw.replace(/\D/g, "");
  if (!num) return "";
  return parseInt(num).toLocaleString("pt-BR");
};

const formatWhatsApp = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

// Pré-análise MCMV — baseada nas regras vigentes (2024/2025) da Caixa Econômica Federal
// Referência: Faixa Urbano 1 (até R$ 2.850), Faixa 2 (até R$ 4.700), Faixa 3 (até R$ 8.600),
// Faixa 4 / Classe Média MCMV (até R$ 12.000). Prazo máx. 420 meses. Comprometimento ~30% da renda.
const analisarMCMV = (renda: number, entrada: number, fgts: string, fgtsInformado: number) => {
  let faixa = "Faixa 4 (Classe Média)";
  let taxaAnual = 0.1049; // Faixa 4
  let subsidioMax = 0;
  let descFaixa = "Enquadramento no Pró-Cotista/Classe Média MCMV, com condições diferenciadas do mercado.";

  if (renda <= 2850) {
    faixa = "Faixa 1";
    taxaAnual = 0.0450;
    subsidioMax = 55000;
    descFaixa = "Melhor faixa do programa: maiores subsídios, menores juros e prazo estendido de 420 meses.";
  } else if (renda <= 4700) {
    faixa = "Faixa 2";
    taxaAnual = 0.0566;
    subsidioMax = 29000;
    descFaixa = "Faixa com subsídio parcial, juros reduzidos e ótimas condições de prazo.";
  } else if (renda <= 8600) {
    faixa = "Faixa 3";
    taxaAnual = 0.0816;
    subsidioMax = 0;
    descFaixa = "Taxas de juros reduzidas do MCMV com uso de FGTS, prazo de até 420 meses.";
  } else if (renda <= 12000) {
    faixa = "Faixa 4 (Classe Média)";
    taxaAnual = 0.1049;
    subsidioMax = 0;
    descFaixa = "Enquadramento na nova faixa Classe Média do MCMV, com taxas melhores que o mercado.";
  }

  let subsidioEstimado = 0;
  if (subsidioMax > 0) {
    const teto = renda <= 2850 ? 2850 : 4700;
    const proporcao = Math.max(0.55, 1 - renda / teto);
    subsidioEstimado = Math.round((subsidioMax * proporcao) / 1000) * 1000;
  }

  const parcelaMax = renda * 0.30;
  const prazoMeses = 420;
  const i = taxaAnual / 12;
  const valorFinanciavel = parcelaMax * ((1 - Math.pow(1 + i, -prazoMeses)) / i);

  // FGTS: usa valor informado se houver; senão estima 6 meses de renda quando o cliente disse "Sim"
  const fgtsEstimado = fgtsInformado > 0
    ? fgtsInformado
    : (fgts === "Sim" ? renda * 6 : 0);
  const recursosProprios = entrada + fgtsEstimado;

  const valorImovel = Math.round((valorFinanciavel + subsidioEstimado + recursosProprios) / 1000) * 1000;

  return {
    faixa,
    descFaixa,
    taxaAnual,
    subsidioEstimado,
    parcelaMax: Math.round(parcelaMax),
    prazoMeses,
    valorFinanciavel: Math.round(valorFinanciavel / 1000) * 1000,
    valorImovel,
    fgtsEstimado: Math.round(fgtsEstimado),
    recursosProprios: Math.round(recursosProprios),
    subsidioLabel: subsidioEstimado > 0
      ? `Estimativa de subsídio de até ${money(subsidioEstimado)}`
      : "Condições especiais de juros do programa",
  };
};

const AnaliseSection = () => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormData>(initialData);
  const [showResult, setShowResult] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [displayXp, setDisplayXp] = useState(0);

  const totalSteps = 8;

  const update = <K extends keyof FormData>(k: K, v: FormData[K]) => setData((d) => ({ ...d, [k]: v }));

  const canNext = () => {
    switch (step) {
      case 0: return !!data.renda;
      case 1: return !!data.tipoTrabalho;
      case 2: return !!data.fgts && (data.fgts !== "Sim" || !!data.fgtsValor);
      case 3: return !!data.cpfLimpo;
      case 4: return !!data.possuiImovel;
      case 5: return data.cidade.trim().length > 1;
      case 6: return true;
      case 7: return data.nome.trim().length > 1 && data.whatsapp.replace(/\D/g, "").length >= 10;
      default: return false;
    }
  };

  const next = async () => {
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 700);
    if (step < totalSteps - 1) {
      setStep(step + 1);
      return;
    }
    await saveLead();
    setShowResult(true);
  };
  const prev = () => step > 0 && setStep(step - 1);


  const rendaNum = parseFloat(data.renda.replace(/\D/g, "")) || 0;
  const entradaNum = parseFloat(data.entrada.replace(/\D/g, "")) || 0;
  const fgtsValorNum = parseFloat(data.fgtsValor.replace(/\D/g, "")) || 0;
  const resultado = analisarMCMV(rendaNum, entradaNum, data.fgts, fgtsValorNum);

  // Gamificação — XP acumulado conforme respostas preenchidas
  const answered: boolean[] = [
    !!data.renda,
    !!data.tipoTrabalho,
    !!data.fgts && (data.fgts !== "Sim" || !!data.fgtsValor),
    !!data.cpfLimpo,
    !!data.possuiImovel,
    data.cidade.trim().length > 1,
    !!data.entrada || step > 6,
    data.nome.trim().length > 1 && data.whatsapp.replace(/\D/g, "").length >= 10,
  ];
  const xpTotal = STEP_META.reduce((acc, s, i) => acc + (answered[i] ? s.xp : 0), 0);
  const level = levelFromXp(xpTotal);

  // Anima o contador de XP suavemente
  useEffect(() => {
    if (displayXp === xpTotal) return;
    const start = displayXp;
    const delta = xpTotal - start;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 600);
      setDisplayXp(Math.round(start + delta * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xpTotal]);

  const pontosAtencao: string[] = [];
  if (data.cpfLimpo === "Não") pontosAtencao.push("CPF com restrições: nossa equipe orienta como regularizar em poucas semanas.");
  if (data.cpfLimpo === "Estou regularizando") pontosAtencao.push("Continue a regularização do CPF; podemos avançar com a documentação em paralelo.");
  if (data.possuiImovel === "Sim") pontosAtencao.push("Já possuir imóvel exige avaliação especial — existem exceções que podem se aplicar ao seu caso.");
  if (data.tipoTrabalho === "Informal") pontosAtencao.push("Renda informal é aceita com comprovação alternativa (extratos, DECORE) — te ajudamos com isso.");


  const saveLead = async () => {
    try {
      const rendaVal = parseFloat(data.renda.replace(/\D/g, "")) || null;
      const entradaVal = parseFloat(data.entrada.replace(/\D/g, "")) || null;
      const { error } = await supabase
        .from("leads")
        .insert({
          nome: data.nome.trim(),
          whatsapp: data.whatsapp.trim(),
          email: data.email.trim() || null,
          renda: rendaVal,
          tipo_trabalho: data.tipoTrabalho || null,
          fgts: data.fgts ? (data.fgtsValor ? `${data.fgts} (R$ ${data.fgtsValor})` : data.fgts) : null,
          cpf_limpo: data.cpfLimpo || null,
          possui_imovel: data.possuiImovel || null,
          cidade: data.cidade.trim() || null,
          entrada: entradaVal,
          faixa: resultado.faixa,
          subsidio_resultado: resultado.subsidioLabel,
          produto_interesse: "Pré-análise MCMV",
        });

      if (error) throw error;

    } catch (err) {
      // Silencioso — não bloqueia o usuário
      console.error("Falha ao salvar lead:", err);
    }
  };

  const enviarWhatsApp = () => {
    const msg = `Olá, fiz minha pré-análise do Minha Casa Minha Vida pelo site e quero falar com um corretor.

*Meus dados:*
Nome: ${data.nome}
Renda familiar: R$ ${data.renda || "não informado"}
Tipo de trabalho: ${data.tipoTrabalho}
Possui FGTS: ${data.fgts}${data.fgtsValor ? ` — R$ ${data.fgtsValor}` : ""}
CPF sem restrições: ${data.cpfLimpo}
Possui imóvel no nome: ${data.possuiImovel}
Cidade/região desejada: ${data.cidade}
Entrada disponível: R$ ${data.entrada || "não informado"}
E-mail: ${data.email || "não informado"}

*Resultado da pré-análise:*
Faixa provável: ${resultado.faixa}
Valor de imóvel estimado: ${money(resultado.valorImovel)}
Subsídio estimado: ${resultado.subsidioEstimado > 0 ? money(resultado.subsidioEstimado) : "—"}
Parcela estimada: ${money(resultado.parcelaMax)}/mês
Taxa: ${(resultado.taxaAnual * 100).toFixed(2)}% a.a. em até ${resultado.prazoMeses} meses`;
    window.open(waUrl(msg), "_blank");
  };


  const inputClass = "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-base";
  const labelClass = "block text-sm font-semibold text-foreground mb-3";

  const OptionButton = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-5 py-4 rounded-md border-2 transition-all font-medium ${
        selected
          ? "border-primary bg-primary/5 text-foreground shadow-sm"
          : "border-input bg-background text-foreground hover:border-foreground/40"
      }`}
    >
      {children}
    </button>
  );

  const progress = ((step + 1) / totalSteps) * 100;

  return (
    <section id="analise" className="py-16 md:py-24 bg-background">
      <div className="container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10 max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">Pré-análise gratuita</span>
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mt-2">
            Faça sua pré-análise de crédito
          </h2>
          <p className="text-muted-foreground mt-3">
            Responda em poucos passos e receba uma indicação da sua faixa provável no Minha Casa Minha Vida.
          </p>
        </motion.div>

        <div className="max-w-2xl mx-auto bg-card rounded-2xl shadow-card border border-border overflow-hidden">
          {/* Progress + Gamificação */}
          <div className="px-6 md:px-8 pt-6 pb-4 border-b border-border bg-gradient-to-br from-primary/5 via-card to-accent/5">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              {/* Chip da etapa atual */}
              <div className="flex items-center gap-2">
                {!showResult && (() => {
                  const Icon = STEP_META[step].icon;
                  return (
                    <motion.div
                      key={step}
                      initial={{ scale: 0.6, rotate: -20, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                      className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md"
                    >
                      <Icon className="w-4 h-4" />
                    </motion.div>
                  );
                })()}
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    {showResult ? "Missão cumprida" : `Etapa ${step + 1} de ${totalSteps} · ${STEP_META[step].chip}`}
                  </span>
                  <span className={`text-sm font-heading font-bold ${level.color}`}>
                    {showResult ? "Pronto para as chaves 🏆" : STEP_META[step].vibe}
                  </span>
                </div>
              </div>

              {/* XP + Nível */}
              <motion.div
                animate={celebrate ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-2 bg-background border border-border rounded-full pl-2 pr-3 py-1 shadow-sm"
              >
                <div className="w-6 h-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-heading font-black text-foreground tabular-nums text-sm">{displayXp}</span>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">XP</span>
                </div>
              </motion.div>
            </div>

            {/* Barra segmentada */}
            <div className="flex items-center gap-1">
              {STEP_META.map((_, i) => {
                const done = i < step || showResult;
                const current = i === step && !showResult;
                return (
                  <motion.div
                    key={i}
                    className={`flex-1 h-1.5 rounded-full ${
                      done ? "bg-primary" : current ? "bg-primary/50" : "bg-muted"
                    }`}
                    animate={current ? { scaleY: [1, 1.8, 1] } : {}}
                    transition={{ duration: 0.6, repeat: current ? Infinity : 0, repeatDelay: 1.4 }}
                  />
                );
              })}
            </div>
          </div>

          <div className="p-6 md:p-8 relative">
            {/* Confete/estrelas ao avançar */}
            <AnimatePresence>
              {celebrate && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
                >
                  {[...Array(8)].map((_, i) => (
                    <motion.span
                      key={i}
                      className="absolute text-lg"
                      initial={{ x: 0, y: 0, opacity: 1, scale: 0.5 }}
                      animate={{
                        x: Math.cos((i / 8) * Math.PI * 2) * 120,
                        y: Math.sin((i / 8) * Math.PI * 2) * 80,
                        opacity: 0,
                        scale: 1.2,
                        rotate: 180,
                      }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                    >
                      {["✨", "⭐", "💫", "🎉"][i % 4]}
                    </motion.span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {!showResult ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  {step === 0 && (
                    <>
                      <label className={labelClass}>Qual sua renda familiar mensal?</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <input type="text" inputMode="numeric" value={data.renda} onChange={(e) => update("renda", formatCurrencyInput(e.target.value))} placeholder="3.500" className={`${inputClass} pl-10`} autoFocus />
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">Some a renda de todos os moradores que ajudam nas contas.</p>
                    </>
                  )}

                  {step === 1 && (
                    <>
                      <label className={labelClass}>Você trabalha registrado, autônomo ou informal?</label>
                      <div className="space-y-3">
                        {["Registrado CLT", "Autônomo", "Informal", "Aposentado/Pensionista", "Outro"].map((opt) => (
                          <OptionButton key={opt} selected={data.tipoTrabalho === opt} onClick={() => update("tipoTrabalho", opt)}>{opt}</OptionButton>
                        ))}
                      </div>
                    </>
                  )}

                  {step === 2 && (
                    <>
                      <label className={labelClass}>Você possui FGTS?</label>
                      <div className="space-y-3">
                        {["Sim", "Não", "Não sei"].map((opt) => (
                          <OptionButton key={opt} selected={data.fgts === opt} onClick={() => update("fgts", opt)}>{opt}</OptionButton>
                        ))}
                      </div>
                      <AnimatePresence>
                        {data.fgts === "Sim" && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-5">
                              <label className={labelClass}>
                                Qual o valor aproximado do seu FGTS?
                                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-secondary bg-secondary/15 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  <Sparkles className="w-3 h-3" /> +5 XP bônus
                                </span>
                              </label>
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={data.fgtsValor}
                                  onChange={(e) => update("fgtsValor", formatCurrencyInput(e.target.value))}
                                  placeholder="15.000"
                                  className={`${inputClass} pl-10`}
                                  autoFocus
                                />
                              </div>
                              <p className="text-xs text-muted-foreground mt-3">
                                Você pode consultar o saldo pelo app FGTS. Se não souber o valor exato, coloque uma estimativa.
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}

                  {step === 3 && (
                    <>
                      <label className={labelClass}>Seu CPF está sem restrições?</label>
                      <div className="space-y-3">
                        {["Sim", "Não", "Estou regularizando", "Não sei"].map((opt) => (
                          <OptionButton key={opt} selected={data.cpfLimpo === opt} onClick={() => update("cpfLimpo", opt)}>{opt}</OptionButton>
                        ))}
                      </div>
                    </>
                  )}

                  {step === 4 && (
                    <>
                      <label className={labelClass}>Você já possui imóvel no seu nome?</label>
                      <div className="space-y-3">
                        {["Sim", "Não"].map((opt) => (
                          <OptionButton key={opt} selected={data.possuiImovel === opt} onClick={() => update("possuiImovel", opt)}>{opt}</OptionButton>
                        ))}
                      </div>
                    </>
                  )}

                  {step === 5 && (
                    <>
                      <label className={labelClass}>Em qual cidade ou região de São Paulo você quer comprar?</label>
                      <input type="text" value={data.cidade} onChange={(e) => update("cidade", e.target.value)} placeholder="Ex: Campinas, Sumaré, Hortolândia, Paulínia..." className={inputClass} maxLength={100} autoFocus />
                    </>
                  )}

                  {step === 6 && (
                    <>
                      <label className={labelClass}>Quanto você tem disponível para entrada?</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <input type="text" inputMode="numeric" value={data.entrada} onChange={(e) => update("entrada", formatCurrencyInput(e.target.value))} placeholder="10.000" className={`${inputClass} pl-10`} autoFocus />
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">Se ainda não tem, tudo bem — pode deixar em branco.</p>
                    </>
                  )}

                  {step === 7 && (
                    <>
                      <label className={labelClass}>Deixe seus dados para receber a análise</label>
                      <div className="space-y-3">
                        <input type="text" value={data.nome} onChange={(e) => update("nome", e.target.value)} placeholder="Seu nome completo" className={inputClass} maxLength={100} autoFocus />
                        <input type="tel" value={data.whatsapp} onChange={(e) => update("whatsapp", formatWhatsApp(e.target.value))} placeholder="WhatsApp (19) 99999-9999" className={inputClass} />
                        <input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} placeholder="E-mail (opcional)" className={inputClass} maxLength={150} />
                      </div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            ) : (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent/10 mb-4">
                    <CheckCircle2 className="w-7 h-7 text-accent" />
                  </div>
                  <h3 className="font-heading text-2xl md:text-3xl font-bold text-foreground mb-2">
                    Boas notícias, {data.nome.split(" ")[0]}! 🎉
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Com base nas regras atuais do Minha Casa Minha Vida, seu perfil tem <strong className="text-foreground">excelente potencial</strong> de aprovação. Veja o que preparamos para você:
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Destaque principal — Valor do imóvel */}
                  <div className="p-6 rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-card">
                    <div className="flex items-center gap-2 mb-2">
                      <Home className="w-5 h-5" />
                      <p className="text-xs uppercase tracking-widest font-semibold opacity-90">Você pode buscar imóveis de até</p>
                    </div>
                    <p className="font-heading text-4xl font-bold">{money(resultado.valorImovel)}</p>
                    <p className="text-sm opacity-90 mt-2">
                      Somando o valor financiável, subsídio estimado e recursos próprios (entrada + FGTS).
                    </p>
                  </div>

                  {/* Grid de detalhes financeiros */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-lg bg-accent/10 border border-accent/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-accent" />
                        <p className="text-xs uppercase tracking-widest font-semibold text-accent">Subsídio estimado</p>
                      </div>
                      <p className="font-heading text-2xl font-bold text-foreground">
                        {resultado.subsidioEstimado > 0 ? money(resultado.subsidioEstimado) : "Condições MCMV"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Recurso do governo que não precisa devolver.</p>
                    </div>

                    <div className="p-4 rounded-lg bg-secondary/10 border border-secondary/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Wallet className="w-4 h-4 text-foreground" />
                        <p className="text-xs uppercase tracking-widest font-semibold text-foreground">Parcela estimada</p>
                      </div>
                      <p className="font-heading text-2xl font-bold text-foreground">{money(resultado.parcelaMax)}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                      <p className="text-xs text-muted-foreground mt-1">Até 30% da sua renda familiar.</p>
                    </div>

                    <div className="p-4 rounded-lg bg-muted border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <p className="text-xs uppercase tracking-widest font-semibold text-foreground">Taxa de juros</p>
                      </div>
                      <p className="font-heading text-2xl font-bold text-foreground">{(resultado.taxaAnual * 100).toFixed(2)}%<span className="text-sm font-normal text-muted-foreground"> a.a.</span></p>
                      <p className="text-xs text-muted-foreground mt-1">Muito abaixo do mercado tradicional.</p>
                    </div>

                    <div className="p-4 rounded-lg bg-muted border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-primary" />
                        <p className="text-xs uppercase tracking-widest font-semibold text-foreground">Prazo</p>
                      </div>
                      <p className="font-heading text-2xl font-bold text-foreground">{resultado.prazoMeses / 12}<span className="text-sm font-normal text-muted-foreground"> anos</span></p>
                      <p className="text-xs text-muted-foreground mt-1">Prazo máximo do programa.</p>
                    </div>
                  </div>

                  {/* Faixa */}
                  <div className="p-5 rounded-lg bg-foreground text-background">
                    <p className="text-xs uppercase tracking-widest text-secondary font-semibold mb-1">Sua faixa no programa</p>
                    <p className="font-heading text-xl font-bold">{resultado.faixa}</p>
                    <p className="text-sm text-background/80 mt-2">{resultado.descFaixa}</p>
                  </div>

                  {/* Recursos próprios detalhe */}
                  {(entradaNum > 0 || resultado.fgtsEstimado > 0) && (
                    <div className="p-4 rounded-lg bg-accent/5 border border-accent/20">
                      <p className="text-xs uppercase tracking-widest font-semibold text-foreground mb-2">Seus recursos próprios somam</p>
                      <p className="font-heading text-xl font-bold text-foreground">{money(resultado.recursosProprios)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {entradaNum > 0 && `Entrada: ${money(entradaNum)}`}
                        {entradaNum > 0 && resultado.fgtsEstimado > 0 && " + "}
                        {resultado.fgtsEstimado > 0 && `FGTS estimado: ${money(resultado.fgtsEstimado)}`}
                      </p>
                    </div>
                  )}

                  {pontosAtencao.length > 0 && (
                    <div className="p-4 rounded-lg bg-muted border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-primary" />
                        <p className="text-xs uppercase tracking-widest font-semibold text-primary">Observações que ajudam na aprovação</p>
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                        {pontosAtencao.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                    Simulação baseada nas regras vigentes do MCMV (Caixa Econômica Federal, 2024/2025). Os valores finais de subsídio, taxa, prazo e enquadramento serão confirmados na análise oficial da Caixa. <strong>Esta pré-análise não representa aprovação de crédito.</strong>
                  </p>

                  <Button variant="whatsapp" size="xl" className="w-full" onClick={enviarWhatsApp}>
                    <MessageCircle className="w-5 h-5" /> Falar com o corretor e garantir minha aprovação
                  </Button>
                </div>
              </motion.div>

            )}
          </div>

          {/* Nav buttons */}
          {!showResult && (
            <div className="px-6 md:px-8 py-4 border-t border-border flex items-center justify-between bg-muted/50">
              <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0} className="text-muted-foreground disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </Button>
              <Button variant="default" onClick={next} disabled={!canNext()}>
                {step === totalSteps - 1 ? "Ver resultado" : "Próximo"} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 max-w-lg mx-auto">
          🔒 Seus dados são usados exclusivamente para a análise e contato do corretor. Sem spam.
        </p>
      </div>
    </section>
  );
};

export default AnaliseSection;
