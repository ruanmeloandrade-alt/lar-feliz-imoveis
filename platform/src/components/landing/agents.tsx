import { motion } from "framer-motion";
import { Brain, Headphones, LineChart, MessageSquare, Phone, Megaphone, PenLine, Target } from "lucide-react";
import { Reveal, Section } from "./shell";

const AGENTS = [
  { name: "SDR IA", role: "Qualifica leads 24/7", icon: Phone, color: "#a855f7", tasks: ["Atende em 8s", "Aplica BANT", "Agenda reunião"] },
  { name: "Closer IA", role: "Fecha negociações", icon: Target, color: "#a855f7", tasks: ["Reverte objeções", "Negocia desconto", "Envia contrato"] },
  { name: "Social Media", role: "Conteúdo semanal", icon: Megaphone, color: "#a855f7", tasks: ["Posta 14x/sem", "Reels & carrosséis", "Aprova com 1 toque"] },
  { name: "Tráfego IA", role: "Otimiza campanhas", icon: LineChart, color: "#a855f7", tasks: ["Realoca verba", "Testa criativos", "Reduz CPA"] },
  { name: "Copywriter IA", role: "Headlines & páginas", icon: PenLine, color: "#a855f7", tasks: ["A/B contínuo", "VSL", "Email + WhatsApp"] },
  { name: "Analista IA", role: "Lê seus dados", icon: Brain, color: "#a855f7", tasks: ["Detecta gargalos", "Alerta queda", "Sugere plano"] },
  { name: "Suporte IA", role: "Atende seu cliente", icon: Headphones, color: "#a855f7", tasks: ["FAQ inteligente", "Abre ticket", "Encaminha humano"] },
  { name: "Atendimento IA", role: "WhatsApp & Instagram", icon: MessageSquare, color: "#a855f7", tasks: ["Multi-canal", "Tom da marca", "Histórico unificado"] },
];

export function Agents() {
  return (
    <Section
      id="agentes"
      align="center"
      eyebrow="Agentes IA"
      title={<>Funcionários digitais<br />que nunca dormem.</>}
      description="Cada agente é especialista. Trabalham em paralelo, conversam entre si e operam sua marca enquanto você dorme. Tudo treinado com seus dados, seu tom e suas metas."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {AGENTS.map((a, i) => {
          const Icon = a.icon;
          return (
            <Reveal key={a.name} delay={i * 0.05}>
              <motion.div
                whileHover={{ y: -6 }}
                className="ml-card group relative overflow-hidden p-6 h-full"
              >
                <div className="flex items-start justify-between">
                  <div className="rounded-lg border border-white/10 bg-[#08080a] p-2.5 group-hover:border-[#a855f7] transition-colors">
                    <Icon className="h-5 w-5 text-[#a855f7]" />
                  </div>
                  <span className="font-tech text-[10px] uppercase text-white/30">AGT_{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="mt-6">
                  <div className="font-display text-2xl font-bold">{a.name}</div>
                  <div className="font-tech text-[11px] uppercase text-white/45 mt-1">{a.role}</div>
                </div>
                <div className="mt-6 space-y-2 max-h-0 opacity-0 group-hover:max-h-40 group-hover:opacity-100 transition-all duration-500 overflow-hidden">
                  {a.tasks.map((t) => (
                    <div key={t} className="flex items-center gap-2 text-xs text-white/70">
                      <span className="h-1 w-1 rounded-full bg-[#a855f7]" />
                      {t}
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
                  <span className="flex items-center gap-1.5 font-tech text-[10px] uppercase text-[#a855f7]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#a855f7] ml-pulse" />
                    ATIVO
                  </span>
                  <span className="font-tech text-[10px] text-white/30">v4.2</span>
                </div>
              </motion.div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
