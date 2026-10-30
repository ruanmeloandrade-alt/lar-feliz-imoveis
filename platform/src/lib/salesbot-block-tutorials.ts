import type { BlockKind } from "@/lib/salesbot-types";

/**
 * Tutorial curto de cada bloco do SalesBot, mostrado embaixo do título do bloco
 * quando o usuário liga o modo tutorial (botão no "Iniciar robô").
 * É explicativo de propósito: serve como aula dentro da própria tela.
 */
export const BLOCK_TUTORIALS: Partial<Record<BlockKind, string>> = {
  "enviar-mensagem":
    "Envia texto, áudio, imagem, vídeo ou documento para o lead. Use {{variáveis}} para personalizar, ( para puxar campo personalizado e, em bots de grupo, { para marcar alguém. Vários itens no mesmo bloco são enviados na ordem, um atrás do outro.",
  reacao:
    "Reage com um emoji na última mensagem do lead (só funciona no WhatsApp Web/Evolution). Serve para dar um sinal humano de leitura antes de responder.",
  comentario:
    "Responde publicamente o comentário que disparou o bot no Instagram ou Facebook. Ideal para o primeiro contato: responde o comentário e depois puxa a pessoa para o Direct.",
  "enviar-dm":
    "Manda mensagem no Direct do Instagram ou no Messenger para quem comentou. Só funciona quando o bot foi disparado por um comentário.",
  "msg-interna":
    "Avisa a sua equipe no chat interno do MKTOn. O lead nunca vê essa mensagem. Use para alertar o vendedor de que um lead ficou quente.",
  pausar:
    "Segura o fluxo até um evento acontecer: tempo definido, mensagem recebida, lote de mensagens (grupos), horário de expediente, áudio/vídeo aberto e outros. Pode empilhar pausas de tipos diferentes: a primeira que acontecer libera o caminho dela.",
  acao:
    "Executa uma ação no CRM sem falar com o lead: mudar etapa, trocar responsável, adicionar/remover tag, definir campo personalizado, criar tarefa, marcar ganho/perdido, disparar webhook e mais.",
  condicao:
    "Ramifica o fluxo. Você cria caminhos (Se/Então) com base em tag, etapa, campo personalizado, horário ou conteúdo da conversa. O caminho 'Senão' pega tudo que não bateu em nenhuma regra.",
  validacao:
    "Confere o que o lead respondeu antes de seguir: e-mail, telefone, número, palavra específica, intervalo ou expressão regular. Se a resposta não passar, o fluxo segue pelo caminho de erro.",
  "ir-etapa":
    "Pula o fluxo para outro bloco deste mesmo bot. Use para reaproveitar um trecho já montado sem duplicar blocos.",
  "iniciar-salesbot":
    "Encerra este bot e começa outro SalesBot no mesmo lead, mantendo o histórico da conversa. Bom para dividir fluxos grandes em bots menores.",
  "iniciar-ia":
    "Entrega a conversa para um Agente IA (de prompt ou de fluxo de objetivos). O agente assume as respostas e continua ativo mesmo depois do bot terminar; as configurações de turnos ficam dentro do próprio agente.",
  "round-robin":
    "Distribui os leads entre vendedores ou caminhos em ordem, sem pular ninguém. Cada lead que passa aqui vai para a próxima saída da lista.",
  "encerrar-bot":
    "Finaliza o fluxo neste ponto. Pode empilhar ações de encerramento: marcar a conversa como fechada, mudar o status do lead, ou já iniciar outro bot/agente logo em seguida.",
  enquete:
    "Cria uma enquete de votação dentro do grupo de WhatsApp. Ótimo para engajar sem precisar de conversa individual.",
};

export function tutorialForBlock(kind: BlockKind, fallback?: string): string {
  return BLOCK_TUTORIALS[kind] ?? fallback ?? "";
}
