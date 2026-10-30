import {
  X, Sparkles, MessageCircle, Clock, UserCheck, HelpCircle, PhoneOff, FileText,
  ShieldCheck, Flame, HeartHandshake, Vote, DoorOpen,
} from "lucide-react";
import { newId, type Salesbot, type Block, type SalesbotEscopo } from "@/lib/salesbot-types";

interface Props {
  onClose: () => void;
  onPickBlank: () => void;
  onPickTemplate: (bot: Salesbot) => void;
  /** Filtra templates conforme o escopo do bot que está sendo criado. */
  scope?: SalesbotEscopo;
}

type Template = {
  id: string;
  nome: string;
  descricao: string;
  icon: typeof MessageCircle;
  scope: "individual" | "grupo";
  build: () => { blocks: Block[]; startBlockId: string; nextSerial: number };
};

function b(kind: Block["kind"], serial: number, x: number, y: number, extra: Partial<Block> = {}): Block {
  return { id: newId("blk"), kind, serial, x, y, ...extra };
}

const TEMPLATES: Template[] = [
  // ============ 1-a-1 ============
  {
    id: "boas-vindas",
    nome: "Boas-vindas",
    descricao: "Envia uma saudação inicial ao lead assim que a conversa começa.",
    icon: MessageCircle,
    scope: "individual",
    build: () => {
      const b1 = b("enviar-mensagem", 1, 100, 100, {
        texto: "Olá! 👋 Seja bem-vindo(a). Em que podemos te ajudar hoje?",
      });
      return { blocks: [b1], startBlockId: b1.id, nextSerial: 2 };
    },
  },
  {
    id: "primeiro-atendimento",
    nome: "Primeiro atendimento",
    descricao: "Saudação, pergunta o nome do lead e valida a resposta antes de seguir.",
    icon: UserCheck,
    scope: "individual",
    build: () => {
      const b1 = b("enviar-mensagem", 1, 100, 100, {
        texto: "Oi! Sou o assistente virtual. Antes de começarmos, como posso te chamar?",
      });
      const b2 = b("validacao", 2, 100, 300, {
        roleta: [{ id: newId("r"), label: "Nome válido", tipo: "palavra", valor: "" }],
      });
      const b3 = b("enviar-mensagem", 3, 100, 500, {
        texto: "Perfeito! Um dos nossos atendentes já vai continuar com você. 🙌",
      });
      b1.nextBlockId = b2.id;
      if (b2.roleta?.[0]) b2.roleta[0].nextBlockId = b3.id;
      return { blocks: [b1, b2, b3], startBlockId: b1.id, nextSerial: 4 };
    },
  },
  {
    id: "fora-atendimento",
    nome: "Fora do horário de atendimento",
    descricao: "Avisa o lead que estamos fora do expediente e garante retorno depois.",
    icon: Clock,
    scope: "individual",
    build: () => {
      const b1 = b("enviar-mensagem", 1, 100, 100, {
        texto: "Olá! No momento estamos fora do horário de atendimento. Assim que voltarmos, retornaremos por aqui. ⏰",
      });
      return { blocks: [b1], startBlockId: b1.id, nextSerial: 2 };
    },
  },
  {
    id: "qualificacao-email",
    nome: "Qualificação por e-mail",
    descricao: "Pede o e-mail do lead e valida antes de encaminhar ao time comercial.",
    icon: FileText,
    scope: "individual",
    build: () => {
      const b1 = b("enviar-mensagem", 1, 100, 100, {
        texto: "Para continuarmos, pode me informar seu melhor e-mail?",
      });
      const b2 = b("validacao", 2, 100, 300, {
        roleta: [{ id: newId("r"), label: "E-mail válido", tipo: "email", valor: "" }],
      });
      const b3 = b("enviar-mensagem", 3, 100, 500, {
        texto: "Obrigado! Recebemos seu contato e em breve alguém do time falará com você. ✅",
      });
      b1.nextBlockId = b2.id;
      if (b2.roleta?.[0]) b2.roleta[0].nextBlockId = b3.id;
      return { blocks: [b1, b2, b3], startBlockId: b1.id, nextSerial: 4 };
    },
  },
  {
    id: "faq-rapido",
    nome: "FAQ rápido",
    descricao: "Oferece 3 opções de dúvidas frequentes com botões de resposta.",
    icon: HelpCircle,
    scope: "individual",
    build: () => {
      const b1 = b("enviar-mensagem", 1, 100, 100, {
        texto: "Como podemos te ajudar? Escolha uma das opções abaixo:",
        useBotoes: true,
        botoes: [
          { id: newId("bt"), label: "Preços" },
          { id: newId("bt"), label: "Suporte" },
          { id: newId("bt"), label: "Falar com humano" },
        ],
      });
      return { blocks: [b1], startBlockId: b1.id, nextSerial: 2 };
    },
  },
  {
    id: "ausencia",
    nome: "Ausência temporária",
    descricao: "Mensagem curta para quando o time está em reunião ou pausa.",
    icon: PhoneOff,
    scope: "individual",
    build: () => {
      const b1 = b("enviar-mensagem", 1, 100, 100, {
        texto: "Olá! Estamos brevemente ausentes. Deixe sua mensagem que já retornamos. 🙏",
      });
      return { blocks: [b1], startBlockId: b1.id, nextSerial: 2 };
    },
  },

  // ============ Grupo ============
  {
    id: "grupo-boas-vindas",
    nome: "Boas-vindas ao grupo",
    descricao: "Cumprimenta novos membros e apresenta as regras do grupo.",
    icon: DoorOpen,
    scope: "grupo",
    build: () => {
      const b1 = b("enviar-mensagem", 1, 100, 100, {
        texto:
          "Seja bem-vindo(a) ao grupo! 🎉\n\nAqui a gente troca ideia sobre o assunto do grupo. Antes de começar:\n• Nada de spam ou links promocionais\n• Respeite todo mundo\n• Dúvidas? Mande no privado do admin.\n\nBora conversar!",
      });
      return { blocks: [b1], startBlockId: b1.id, nextSerial: 2 };
    },
  },
  {
    id: "grupo-moderador",
    nome: "Bot moderador",
    descricao: "Avisa o membro em privado quando quebra uma regra e escala para o admin.",
    icon: ShieldCheck,
    scope: "grupo",
    build: () => {
      const b1 = b("msg-interna", 1, 100, 100, {
        texto:
          "⚠️ Regra do grupo quebrada por {{lead.nome}}, verifique a mensagem no grupo e aplique a moderação necessária.",
      });
      const b2 = b("pausar", 2, 100, 300, { pausas: [{ id: newId("p"), tipo: "cronometro", seg: 5 }] });
      const b3 = b("enviar-mensagem", 3, 100, 500, {
        texto:
          "Oi {{lead.nome}}! Notamos uma mensagem que foge das regras do nosso grupo. Vamos manter a conversa saudável por aqui 🙏",
      });
      b1.nextBlockId = b2.id;
      b2.nextBlockId = b3.id;
      return { blocks: [b1, b2, b3], startBlockId: b1.id, nextSerial: 4 };
    },
  },
  {
    id: "grupo-puxador",
    nome: "Puxador de assunto",
    descricao: "Solta uma pergunta para reanimar o grupo quando estiver quieto.",
    icon: Flame,
    scope: "grupo",
    build: () => {
      const b1 = b("enviar-mensagem", 1, 100, 100, {
        texto: "Ei pessoal 👋 pra não deixar o grupo dormir: qual foi o melhor aprendizado da semana pra vocês?",
      });
      return { blocks: [b1], startBlockId: b1.id, nextSerial: 2 };
    },
  },
  {
    id: "grupo-enquete",
    nome: "Enquete de engajamento",
    descricao: "Cria uma enquete no grupo para reengajar os membros.",
    icon: Vote,
    scope: "grupo",
    build: () => {
      const b1 = b("enquete", 1, 100, 100, {
        enquetePergunta: "Sobre qual assunto vocês querem que a gente fale essa semana?",
        enqueteOpcoes: [
          "Cases práticos",
          "Tira-dúvidas ao vivo",
          "Tutorial passo a passo",
        ],
        enqueteMultipla: false,
      });
      return { blocks: [b1], startBlockId: b1.id, nextSerial: 2 };
    },
  },
  {
    id: "grupo-suporte",
    nome: "Suporte no grupo",
    descricao: "Responde a menção do bot com FAQ e chama o admin se precisar de humano.",
    icon: HeartHandshake,
    scope: "grupo",
    build: () => {
      const b1 = b("enviar-mensagem", 1, 100, 100, {
        texto:
          "Fala {{lead.nome}}! Antes de chamar um humano, dá uma olhada nos links do FAQ que enviamos na descrição do grupo. Se ainda ficar dúvida, digite \"admin\" que eu chamo alguém.",
      });
      const b2 = b("iniciar-ia", 2, 100, 300, {});
      b1.nextBlockId = b2.id;
      return { blocks: [b1, b2], startBlockId: b1.id, nextSerial: 3 };
    },
  },
];

export function SalesbotTemplatePicker({ onClose, onPickBlank, onPickTemplate, scope = "individual" }: Props) {
  const effectiveScope = scope === "grupo" ? "grupo" : "individual";
  const filtered = TEMPLATES.filter((t) => t.scope === effectiveScope);

  function useTemplate(t: Template) {
    const { blocks, startBlockId, nextSerial } = t.build();
    const bot: Salesbot = {
      id: newId("bot"),
      nome: t.nome,
      escopo: effectiveScope,
      blocks,
      startBlockId,
      nextSerial,
      updatedAt: new Date().toISOString(),
    };
    onPickTemplate(bot);
  }

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
            <div className="text-xs font-semibold uppercase tracking-wider">
              {effectiveScope === "grupo" ? "Criar Salesbot de grupo" : "Criar novo bot"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Escolha um template pronto ou comece do zero.
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
                Abrir o editor com um bot em branco e montar o fluxo do jeito que você quiser.
              </div>
            </div>
          </button>

          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Templates prontos {effectiveScope === "grupo" ? "para grupos" : ""}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => useTemplate(t)}
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
