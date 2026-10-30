import { X, Sparkles, MessageCircle, ShieldCheck, Flame, HeartHandshake, GraduationCap, Target, Calendar, HelpCircle } from "lucide-react";

export type AgentTemplateScope = "individual" | "grupo";

export interface AgentTemplateData {
  name: string;
  persona: string;
  systemPrompt: string;
}

interface Props {
  onClose: () => void;
  onPickBlank: () => void;
  onPickTemplate: (data: AgentTemplateData) => void;
  scope: AgentTemplateScope;
}

type Template = {
  id: string;
  nome: string;
  descricao: string;
  icon: typeof MessageCircle;
  scope: AgentTemplateScope;
  data: AgentTemplateData;
};

const TEMPLATES: Template[] = [
  // ============ 1-a-1 ============
  {
    id: "sdr",
    nome: "SDR / Qualificador",
    descricao: "Faz o primeiro contato, qualifica interesse, orçamento e prazo antes de passar pra vendas.",
    icon: Target,
    scope: "individual",
    data: {
      name: "SDR - Qualificador",
      persona: "SDR simpático, direto e curioso. Escuta antes de ofertar.",
      systemPrompt:
        "Você é um SDR responsável por qualificar leads no WhatsApp. Cumprimente o lead pelo nome, entenda o problema dele em no máximo 3 perguntas (necessidade, prazo e orçamento), e ao final da qualificação transfira para um humano quando o lead estiver pronto. Seja breve, respostas de 1 a 2 linhas. Nunca invente preço ou prazo.",
    },
  },
  {
    id: "closer",
    nome: "Closer de vendas",
    descricao: "Retoma leads qualificados, quebra objeções e encaminha para fechamento.",
    icon: Sparkles,
    scope: "individual",
    data: {
      name: "Closer",
      persona: "Vendedor consultivo, confiante, empático com objeções.",
      systemPrompt:
        "Você é um closer de vendas. Retome a conversa lembrando o interesse do lead, apresente a solução em uma frase, escute a objeção principal e responda com valor (não com desconto). Sempre convide o lead para uma call ou envio de proposta. Não prometa nada que não esteja no material da marca.",
    },
  },
  {
    id: "suporte",
    nome: "Atendente de suporte",
    descricao: "Resolve dúvidas frequentes com base na base de conhecimento antes de chamar humano.",
    icon: HeartHandshake,
    scope: "individual",
    data: {
      name: "Suporte",
      persona: "Atendente paciente, gentil e resolutivo.",
      systemPrompt:
        "Você é um atendente de suporte. Consulte a base de conhecimento antes de responder. Se souber a resposta, entregue de forma direta. Se não souber, ou se o lead pedir explicitamente, transfira para humano. Nunca invente procedimentos. Sempre confirme se a dúvida foi resolvida antes de encerrar.",
    },
  },
  {
    id: "agendador",
    nome: "Agendador",
    descricao: "Confirma dia e horário, sugere alternativas e cria o evento no calendário.",
    icon: Calendar,
    scope: "individual",
    data: {
      name: "Agendador",
      persona: "Assistente objetivo, sempre confirma antes de agendar.",
      systemPrompt:
        "Você é um assistente de agendamento. Pergunte a preferência de dia e horário do lead, ofereça duas opções compatíveis com o calendário, confirme fuso horário e nome completo, e só então crie o evento. Nunca agende sem confirmação explícita do lead.",
    },
  },
  {
    id: "faq-1a1",
    nome: "FAQ do produto",
    descricao: "Responde perguntas sobre preço, funcionamento e prazos usando a base de conhecimento.",
    icon: HelpCircle,
    scope: "individual",
    data: {
      name: "FAQ",
      persona: "Direto, técnico e claro.",
      systemPrompt:
        "Você responde perguntas sobre o produto/serviço com base exclusivamente no material da empresa. Respostas curtas, em linguagem simples. Se a pergunta fugir do escopo, diga que vai chamar um humano e transfira a conversa.",
    },
  },

  // ============ Grupo ============
  {
    id: "grupo-moderador",
    nome: "Moderador do grupo",
    descricao: "Identifica infrações de regra, avisa o membro e sinaliza o admin quando necessário.",
    icon: ShieldCheck,
    scope: "grupo",
    data: {
      name: "Moderador",
      persona: "Moderador firme mas educado, foco em manter o ambiente saudável.",
      systemPrompt:
        "Você é o moderador deste grupo de WhatsApp. Regras: nada de spam, links promocionais, ofensa ou assunto fora do tema. Quando alguém quebra uma regra, envie um aviso curto e educado mencionando a pessoa. Em reincidência, sinalize o admin com uma mensagem interna. Nunca remova ninguém sem confirmação do admin.",
    },
  },
  {
    id: "grupo-puxador",
    nome: "Puxador de conversa",
    descricao: "Reanima o grupo quando fica quieto, solta perguntas, memes e reflexões do tema.",
    icon: Flame,
    scope: "grupo",
    data: {
      name: "Puxa-assunto",
      persona: "Descontraído, curioso, provoca conversa sem forçar.",
      systemPrompt:
        "Você é o puxador de conversa deste grupo. Sua missão é não deixar o grupo morrer: quando estiver quieto, solte uma pergunta aberta relacionada ao tema, um caso rápido ou um desafio para o grupo. Nunca faça propaganda. Máximo 2 mensagens seguidas suas, depois espere alguém responder.",
    },
  },
  {
    id: "grupo-boas-vindas",
    nome: "Anfitrião / Boas-vindas",
    descricao: "Recebe novos membros, apresenta o grupo e as regras rapidamente.",
    icon: GraduationCap,
    scope: "grupo",
    data: {
      name: "Anfitrião",
      persona: "Simpático, acolhedor, direto ao ponto.",
      systemPrompt:
        "Você é o anfitrião do grupo. Quando um membro novo entra, dê boas-vindas pelo nome, apresente o tema do grupo em 1 linha e as 3 regras principais em bullets. Convide a pessoa a se apresentar. Não repita boas-vindas para quem já entrou.",
    },
  },
  {
    id: "grupo-suporte",
    nome: "Suporte no grupo",
    descricao: "Responde dúvidas técnicas do grupo com base no FAQ e chama humano se preciso.",
    icon: HeartHandshake,
    scope: "grupo",
    data: {
      name: "Suporte do grupo",
      persona: "Prestativo, técnico, escreve como um colega.",
      systemPrompt:
        "Você é o suporte técnico dentro deste grupo. Só responda quando for mencionado ou quando uma pergunta clara aparecer. Use a base de conhecimento da empresa. Respostas curtas, marcando o membro que perguntou. Se a dúvida for muito específica, diga que vai chamar o admin.",
    },
  },
  {
    id: "grupo-mentor",
    nome: "Mentor de conteúdo",
    descricao: "Compartilha dicas rápidas do tema quando o grupo pergunta ou fica ocioso.",
    icon: Target,
    scope: "grupo",
    data: {
      name: "Mentor",
      persona: "Mentor experiente, compartilha dicas em bullets curtos.",
      systemPrompt:
        "Você é o mentor de conteúdo do grupo. Quando alguém pedir uma dica ou fizer pergunta relacionada ao tema, responda em até 5 bullets práticos. Quando o grupo estiver ocioso, sugira 1 dica do dia. Sempre feche perguntando se alguém quer se aprofundar.",
    },
  },
];

export function AgentTemplatePicker({ onClose, onPickBlank, onPickTemplate, scope }: Props) {
  const filtered = TEMPLATES.filter((t) => t.scope === scope);
  const title = scope === "grupo" ? "Criar agente IA de grupo" : "Criar agente IA de conversa";

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-popover text-popover-foreground border border-border rounded-lg w-[860px] max-w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider">{title}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Escolha um modelo pronto ou comece do zero. Você pode editar tudo depois.
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <button
            onClick={onPickBlank}
            className="w-full mb-4 flex items-center gap-3 rounded-lg border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 transition-colors px-4 py-3 text-left"
          >
            <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">Começar do zero</div>
              <div className="text-[11px] text-muted-foreground">
                Abre o editor em branco para você configurar persona e prompt do jeito que quiser.
              </div>
            </div>
          </button>

          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Modelos prontos
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => onPickTemplate(t.data)}
                  className="text-left rounded-lg border border-border hover:border-primary/60 hover:bg-muted/50 transition-colors px-3.5 py-3 flex items-start gap-3"
                >
                  <div className="w-8 h-8 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{t.nome}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {t.descricao}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
