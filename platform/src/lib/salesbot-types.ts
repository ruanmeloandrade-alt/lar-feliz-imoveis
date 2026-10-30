// Tipos e catálogo de blocos do Salesbot

export type BlockKind =
  | "enviar-mensagem"
  | "reacao"
  | "comentario"
  | "enviar-dm"
  | "msg-interna"
  | "pausar"
  | "acao"
  | "condicao"
  | "validacao"
  | "ir-etapa"
  | "iniciar-salesbot"
  | "iniciar-ia"
  | "enquete"

  | "round-robin"
  | "encerrar-bot";



export type AcaoTipo =
 | "nota"
 | "tarefa"
 | "status-conversa"
 | "completar-tarefa"
 | "definir-campo"
 | "enviar-email"
 | "webhook"
 | "formulario"
 | "tags"
 | "mudar-status-lead"
 | "mudar-responsavel"
 | "vincular-produto"
 // Grupo: dispara mensagem no privado de quem interagiu no grupo
 | "enviar-privado"
 // Grupo: dispara mensagem no privado dos admins do grupo (notificar moderadores)
 | "notificar-admins";

export type ValidacaoTipo =
 | "igual"
 | "igual-lista"
 | "contem-lista"
 | "resposta-igual"
 | "contem"
 | "nao-contem"
 | "desigual"
 | "comprimento"
 | "regex"
 | "numero"
 | "letra"
 | "palavra"
 | "telefone"
 | "email"
 | "gama";

export type CondicaoOperador = "igual" | "desigual" | "contem";
export type CondicaoSujeito =
 | "cliente"
 | "comentario"
 | "fonte-leads"
 | "campo-personalizado"
 | "tag"
 | "etapa";
export type CondicaoComparador = "entrada-manual" | "campo-personalizado";

export interface Condicao {
 id: string;
 sujeito: CondicaoSujeito;
 campo?: string;
 operador: CondicaoOperador;
 comparador: CondicaoComparador;
 valor: string;
 /** Saída própria desta condição (usada quando o bloco está em modo "OU"). */
  nextBlockId?: string;
  /** ID do formulário (quando tipo === "formulario-enviado"). */
  formularioId?: string;
  formularioNome?: string;
}

export type PausaTipo =
  | "cronometro"
  | "msg-recebida"
  | "lote-msgs"
  | "exceto-expediente"
  | "exceto-fora-expediente"
  | "ate-expediente"
  | "ate-fora-expediente"
  | "video-aberto"
  | "video-fechado"
  | "audio-aberto"
  | "audio-fechado"
  | "formulario-enviado";

export interface PausaEntry {
 id: string;
 tipo: PausaTipo;
 anos?: number;
 meses?: number;
 semanas?: number;
 dias?: number;
 horas?: number;
 min?: number;
 seg?: number;
 videoUrl?: string;
 /** Quantidade de mensagens do lote (pausa "lote-msgs", usada em grupos). */
 qtdMensagens?: number;
 // Saída própria: quando esta pausa termina primeiro, o bot segue por este bloco.
  nextBlockId?: string;
  /** ID do formulário (quando tipo === "formulario-enviado"). */
  formularioId?: string;
  formularioNome?: string;
}


/**
 * O QUE a regra de validação analisa. Sempre algo que já existe no sistema:
 * a última mensagem do cliente ou um dado do lead/campo/tag.
 */
export type ValidacaoAlvo =
 | "mensagem"
 | "nome"
 | "email"
 | "telefone"
 | "empresa"
 | "responsavel"
 | "etapa"
 | "tag"
 | "campo"
 | "tracking-evento"
 | "tracking-pageview"
 | "tracking-tempo"
 | "tracking-produto"
 | "lead-produto"
 | "social-ativo"
 | "social-segue";

export const VALIDACAO_ALVO_OPCOES: { value: ValidacaoAlvo; label: string }[] = [
  { value: "mensagem", label: "Resposta do cliente" },
  { value: "nome", label: "Nome do lead" },
  { value: "email", label: "E-mail do lead" },
  { value: "telefone", label: "Telefone do lead" },
  { value: "empresa", label: "Empresa do lead" },
  { value: "campo", label: "Campo personalizado" },
  { value: "tag", label: "Tag do lead" },
  { value: "tracking-evento", label: "Tracking: Evento (Pixel)" },
  { value: "tracking-pageview", label: "Tracking: Viu página (URL)" },
  { value: "tracking-tempo", label: "Tracking: Tempo na página (min)" },
  { value: "tracking-produto", label: "Tracking: Produto (Evento)" },
  { value: "lead-produto", label: "CRM: Produto (Vínculo real)" },
  { value: "social-ativo", label: "Social: Lead ativo (Comentou/DM)" },
  { value: "social-segue", label: "Social: Lead segue perfil" },
  { value: "responsavel", label: "Dados: Responsável" },
  { value: "etapa", label: "Dados: Etapa do Funil" },
];


export interface RoletaOpcao {
 id: string;
 label: string;
 nextBlockId?: string;
 // Campos usados quando a opção representa uma REGRA de validação
 // (bloco "validacao"). Cada regra tem seu próprio alvo/tipo/valor e saída.
 alvo?: ValidacaoAlvo;
 campoId?: string;
 campoNome?: string;
 tipo?: ValidacaoTipo;
 valor?: string;
}


export interface MensagemBotao {
 id: string;
 label: string;
 /** Caminho próprio: bloco para onde o fluxo vai quando o lead clica neste botão. */
 nextBlockId?: string;
 /** NOVO: Se preenchido, o botão abre este link externo em vez de seguir um fluxo (botão de URL real). */
 url?: string;
}

export type MediaKind = "image" | "video" | "audio" | "document";

/** Um anexo enviado dentro de um bloco "Enviar mensagem". */
export interface MediaItem {
  id: string;
  path: string;      // caminho no bucket salesbot-media
  kind: MediaKind;
  mime: string;
  filename: string;
  caption?: string;  // legenda (imagem/vídeo); áudio ignora
  delayMs?: number;  // cronômetro antes de enviar este item (mostra digitando/gravando)
  // Áudio: quando true, envia como mensagem de voz (PTT). Quando false/undefined,
  // envia como anexo normal (encaminhado). Áudios gravados pelo microfone entram
  // com asVoice=true; áudios anexados entram com asVoice=false até o usuário converter.
  asVoice?: boolean;
}

export interface Block {
 id: string;
 kind: BlockKind;
 // Número persistente do bloco (1,2,3...). Não muda se outro bloco for excluído.
 serial?: number;
 x?: number;
 y?: number;
 nextBlockId?: string;
 texto?: string;
 // Bloco "Mensagem interna": para quem o alerta é enviado no Chat da equipe
 msgInternaDestinoTipo?: "usuario" | "setor" | "admins";
 msgInternaDestinoId?: string;
 useBotoes?: boolean;
 /** Bots de grupo: enviar no grupo (padrão) ou no privado de quem entrou/falou. */
 destino?: "grupo" | "privado";

 botoes?: MensagemBotao[];
 // Delay antes de enviar o texto (mostra "digitando..." durante esse tempo)
 textoDelayMs?: number;
 // Múltiplos anexos enviados em sequência após o texto (bloco "Enviar mensagem")
 mediaItems?: MediaItem[];
 // === Legado (compatibilidade), um único anexo. Convertido em mediaItems no runtime.
 mediaPath?: string;
 mediaKind?: MediaKind;
 mediaMime?: string;
 mediaFilename?: string;
 pausaTipo?: PausaTipo;
 pausaAnos?: number;
 pausaMeses?: number;
 pausaSemanas?: number;
 pausaDias?: number;
 pausaHoras?: number;
 pausaMin?: number;
 pausaSeg?: number;
 pausaVideoUrl?: string;
 /** Legado/1ª pausa: quantidade de mensagens do lote ("lote-msgs"). */
 pausaQtdMensagens?: number;
 // Lista de pausas combinadas dentro do mesmo bloco (avança quando qualquer uma resolve)
 pausas?: PausaEntry[];
 acaoTipo?: AcaoTipo;
 acaoConfig?: string;
 /** Assunto da ação Enviar e-mail; corpo permanece em acaoConfig. */
 emailSubject?: string;
 /** Modo da ação de tags. Ausente em bots antigos = adicionar. */
 tagsModo?: "adicionar" | "remover";
 // Config estruturada para "mudar-status-lead" e "ir-etapa"
 destinoPipelineId?: string;
 destinoPipelineNome?: string;
 destinoStageId?: string;
 destinoStageNome?: string;
 validacaoTipo?: ValidacaoTipo;
 validacaoValor?: string;
 condicoes?: Condicao[];
 condicaoModo?: "e" | "ou";
 destinoEtapa?: string; // legado (texto livre)
 destinoBot?: string; // legado (texto livre), usado como fallback quando destinoBotId ausente
 destinoBotId?: string;
 destinoBotNome?: string;
 roleta?: RoletaOpcao[];
 // Lista de variações de comentário (bloco "Responder comentário"). O bot alterna entre elas em round-robin.
 comentarios?: string[];
 // Config estruturada para "definir-campo"
  campoId?: string;
  campoNome?: string;
  campoValor?: string;
  /** Vínculo lead ↔ produto */
  productId?: string;
  productNome?: string;
  productKind?: "interesse" | "comprou";
 /** "lead" | "empresa" — entidade dona do campo alvo */
 campoEntidade?: "lead" | "empresa";
 /** de onde vem o valor: manual | mensagem do cliente | copiar de outro campo */
 campoOrigem?: "manual" | "mensagem" | "copiar";
 /** referência do campo de origem quando campoOrigem = "copiar" */
 campoOrigemRef?: string;
 campoOrigemLabel?: string;
 // Config estruturada para "mudar-responsavel"
 destinoResponsavelId?: string;
 destinoResponsavelNome?: string;
 // Config estruturada para "webhook" / Make / n8n / Zapier
 webhookUrl?: string;
 webhookMethod?: "POST" | "PUT" | "PATCH";
 webhookSecret?: string;
 /** Conexão externa cadastrada em Integrações; quando presente, prevalece sobre URL direta. */
 webhookAutomationId?: string;
 webhookProvider?: "n8n" | "make" | "zapier" | "custom";
 /** Variável que recebe JSON/texto devolvido pela automação. */
 webhookResponseVariable?: string;
 webhookTimeoutMs?: number;
 webhookRetries?: number;
 /** Saída de erro. Sucesso continua pelo nextBlockId normal. */
 webhookErrorNextBlockId?: string;
 // Config estruturada para "formulario"
 formularioId?: string;
 formularioNome?: string;
 formularioMensagem?: string;
 /** Vários formulários: o link de cada um é anexado no final da mensagem. */
 formularios?: Array<{ id: string; nome?: string }>;
 // Config estruturada para "tarefa"
 tarefaTitulo?: string;
 tarefaKind?: "tarefa" | "reuniao" | "evento";
 tarefaOffsetMin?: number; // minutos a partir de agora
 tarefaDuracaoMin?: number;
 /** Se preenchido, a tarefa entra no Fluxo de Trabalho (Kanban) em vez do calendário. */
 tarefaWorkflowPipelineId?: string;
 tarefaWorkflowPipelineNome?: string;
 /** Cria também no calendário (Google Agenda) além do fluxo de trabalho. */
 tarefaTambemCalendario?: boolean;
 tarefaWorkflowStageId?: string;
 tarefaWorkflowStageNome?: string;
 tarefaWorkflowAssigneeId?: string;
 tarefaWorkflowAssigneeNome?: string;
 tarefaWorkflowPriority?: "baixa" | "media" | "alta" | "urgente";
 // Config estruturada para "condicao" (extensões)
 // já suportado via condicoes[].sujeito
 // Branch falso para "condicao" e "validacao"
 falseNextBlockId?: string;
 // Config para "iniciar-ia", bloco Agente IA
 iaAgentId?: string;
 iaAgentNome?: string;
 iaMaxTurnos?: number; // 0 = ilimitado (até handoff explícito)
 iaMensagemInicial?: string; // se preenchido, envia esse texto antes de habilitar a IA
  // Config para "enquete", bloco de enquete/votação (apenas em bots de grupo)
  enquetePergunta?: string;
  enqueteOpcoes?: string[];
  enqueteMultipla?: boolean; // permite selecionar múltiplas opções
  /**
   * Ações executadas no bloco "Encerrar bot", antes de finalizar o fluxo.
   * Vazio/ausente = comportamento padrão (só encerra).
   */
  encerrarAcoes?: EncerrarAcao[];
 }

/** Ação opcional disparada ao encerrar o bot. */
export interface EncerrarAcao {
 id: string;
 tipo: "status-conversa" | "iniciar-salesbot" | "iniciar-ia";
 /** tipo = status-conversa */
 status?: "aberta" | "lida" | "fechada";
 /** tipo = iniciar-salesbot */
 botId?: string;
 botNome?: string;
 /** tipo = iniciar-ia */
 agentId?: string;
 agentNome?: string;
}


// ============ Gatilhos estruturados ============

export type GatilhoKind =
 // Conversas
 | "qualquer-conversa"
 | "mensagem-recebida"
 | "palavra-chave"
 | "midia-recebida"
 | "primeira-mensagem"
 // CRM
 | "movido-etapa"
 | "tag-adicionada"
 | "crm-lead-criado"
 | "sem-resposta"
 | "campo-alterado"
 | "crm-lead-ganho"
 | "crm-lead-perdido"
 | "formulario-enviado"
 // Gestor de tráfego (Meta Ads)
 | "trafego-lead-anuncio"
 | "trafego-campanha-status"
 | "trafego-anuncio-publicado"
 | "trafego-orcamento-esgotado"
 | "trafego-comentario-anuncio"
 // Gestor de tráfego (Google Ads)
 | "trafego-google-lead-anuncio"
 | "trafego-google-campanha-status"
 | "trafego-google-anuncio-publicado"
 | "trafego-google-orcamento-esgotado"
 | "trafego-google-conversao"
 // Calendário editorial
 | "calendario-post-publicado"
 | "calendario-post-aprovado"
 | "calendario-post-agendado"
 | "calendario-post-reprovado"
 | "calendario-ideia-criada"
 // Tracking
 | "tracking-conversao"
 | "tracking-visita-quente"
 | "tracking-primeiro-acesso"
 | "tracking-abandono-formulario"
 // Webhooks
 | "webhook"
 | "webhook-enviado"
 // Grupos de WhatsApp
 | "grupo-novo-membro"
 | "grupo-membro-saiu"
 | "grupo-membro-removido"
 | "grupo-membro-promovido"
 | "grupo-palavra-chave"
 | "grupo-midia"
 | "grupo-mensagem-admin"
 | "grupo-mencao-bot"
 | "grupo-mensagem-periodica"
 | "grupo-link-nao-autorizado"
 | "grupo-flood"
 | "grupo-palavra-proibida"
 // Redes sociais (Meta)
 | "social-dm-messenger"
 | "social-dm-instagram"
 | "social-comentario-facebook"
 | "social-comentario-instagram"
 | "social-mencao-facebook"
 | "social-mencao-instagram"
 | "social-story-mencao-instagram"
 | "social-story-resposta-instagram"
 | "social-story-reacao-instagram"
 // Redes sociais (LinkedIn, via connector Lovable)
 | "social-comentario-linkedin"
 | "social-mencao-linkedin"
 | "social-dm-linkedin"
 // Redes sociais (TikTok, via connector Lovable)
 | "social-comentario-tiktok"
 | "social-mencao-tiktok"
 | "social-dm-tiktok";

export type GatilhoArea =
 | "conversa"
 | "crm"
 | "trafego"
 | "calendario"
 | "tracking"
 | "webhooks"
 | "grupo"
 | "social";

export interface Gatilho {
 id: string;
 kind: GatilhoKind;
 label?: string;
 pipelineId?: string;
 pipelineNome?: string;
 stageId?: string;
 stageNome?: string;
 canal?: "whatsapp" | "instagram" | "facebook" | "email" | "qualquer";
 canalId?: string;
 canalNome?: string;
 horasSemResposta?: number;
 tag?: string;
 campoNome?: string;
 campoId?: string;
 campoValor?: string;
 webhookUrl?: string;
 palavraChave?: string;
 palavraChaveModo?: "contem" | "igual" | "comeca" | "regex";
 midiaTipo?: "qualquer" | "audio" | "imagem" | "video" | "documento";
 // Tráfego
 adAccountId?: string;
 campanhaId?: string;
 campanhaStatus?: "publicada" | "pausada" | "qualquer";
 // Calendário
 socialCampaignId?: string;
 // Tracking
 trackingSiteId?: string;
 trackingSiteNome?: string;
 conversaoTipo?: string;
 /** Nome do evento do pixel (ex.: lead, purchase, form_submit) ou "qualquer". */
 trackingEvento?: string;
 /** Valor mínimo do evento para disparar (ex.: compra acima de R$ X). */
 trackingValorMin?: number;
 /** Dispara só se a URL/página do evento contiver este trecho. */
 trackingUrlContem?: string;
 // Formulários
 formularioId?: string;
 formularioNome?: string;
 /** Origem aceita: página MKTOn, site externo (endpoint) ou Meta Lead Ads. */
 formularioOrigem?: "qualquer" | "mkton" | "externo" | "meta";

 atrasoDias?: number;
 atrasoHoras?: number;
 atrasoMin?: number;
 atrasoSeg?: number;
}

export interface GatilhoCatalogItem {
 kind: GatilhoKind;
 label: string;
 desc: string;
 area: GatilhoArea;
 emBreve?: boolean;
}

export const GATILHO_CATALOG: GatilhoCatalogItem[] = [
 // Conversas
  { kind: "qualquer-conversa", label: "Nova conversa aberta", desc: "Dispara ao abrir uma nova conversa (lead nunca falou antes).", area: "conversa" },
  { kind: "mensagem-recebida", label: "Qualquer mensagem recebida", desc: "Dispara em TODA mensagem que o lead enviar, a menos que haja um gatilho de palavra-chave mais específico.", area: "conversa" },
 { kind: "palavra-chave", label: "Palavra-chave na mensagem", desc: "Dispara quando a mensagem contém a palavra ou frase configurada.", area: "conversa" },
 { kind: "midia-recebida", label: "Mídia recebida", desc: "Dispara quando o lead envia áudio, imagem, vídeo ou documento.", area: "conversa" },
 { kind: "primeira-mensagem", label: "Primeira mensagem do lead", desc: "Dispara apenas quando é o primeiro contato do lead.", area: "conversa" },
 // CRM
 { kind: "movido-etapa", label: "Movido para etapa", desc: "Dispara quando o lead entra na etapa escolhida.", area: "crm" },
 { kind: "tag-adicionada", label: "Tag adicionada ao lead", desc: "Dispara quando uma tag específica é adicionada.", area: "crm" },
 { kind: "crm-lead-criado", label: "Novo lead criado", desc: "Dispara quando um novo lead entra no CRM.", area: "crm" },
 { kind: "sem-resposta", label: "Lead sem resposta há X horas", desc: "Dispara quando o lead não responde no prazo definido.", area: "crm" },
 { kind: "campo-alterado", label: "Campo personalizado alterado", desc: "Dispara quando um campo personalizado do lead muda.", area: "crm" },
 { kind: "crm-lead-ganho", label: "Lead marcado como ganho", desc: "Dispara quando o lead é marcado como venda concluída.", area: "crm" },
 { kind: "crm-lead-perdido", label: "Lead marcado como perdido", desc: "Dispara quando o lead é encerrado como perdido.", area: "crm" },
 // Gestor de tráfego (Meta Ads)
 { kind: "trafego-lead-anuncio", label: "Meta Ads: Novo lead de anúncio", desc: "Dispara quando um Lead Ad da Meta (Facebook/Instagram) chega ao workspace.", area: "trafego" },
 { kind: "trafego-campanha-status", label: "Meta Ads: Campanha publicada / pausada", desc: "Dispara quando uma campanha da Meta muda de status.", area: "trafego" },
 { kind: "trafego-anuncio-publicado", label: "Meta Ads: Anúncio publicado", desc: "Dispara quando um novo anúncio da Meta entra no ar.", area: "trafego" },
 { kind: "trafego-orcamento-esgotado", label: "Meta Ads: Orçamento diário esgotado", desc: "Dispara quando o budget diário de uma campanha da Meta é consumido.", area: "trafego" },
 { kind: "trafego-comentario-anuncio", label: "Meta Ads: Comentário em anúncio", desc: "Dispara quando alguém comenta em um post/anúncio do Facebook ou Instagram.", area: "trafego" },
 // Gestor de tráfego (Google Ads)
 { kind: "trafego-google-lead-anuncio", label: "Google Ads: Novo lead de anúncio", desc: "Dispara quando um Lead Form do Google Ads chega ao workspace.", area: "trafego", emBreve: true },
 { kind: "trafego-google-campanha-status", label: "Google Ads: Campanha publicada / pausada", desc: "Dispara quando uma campanha do Google Ads muda de status.", area: "trafego", emBreve: true },
 { kind: "trafego-google-anuncio-publicado", label: "Google Ads: Anúncio publicado", desc: "Dispara quando um novo anúncio do Google Ads entra no ar.", area: "trafego", emBreve: true },
 { kind: "trafego-google-orcamento-esgotado", label: "Google Ads: Orçamento diário esgotado", desc: "Dispara quando o budget diário de uma campanha do Google Ads é consumido.", area: "trafego", emBreve: true },
 { kind: "trafego-google-conversao", label: "Google Ads: Conversão registrada", desc: "Dispara quando o Google Ads reporta uma conversão.", area: "trafego", emBreve: true },
 // Calendário editorial
 { kind: "calendario-post-publicado", label: "Post publicado nas redes", desc: "Dispara quando um post do calendário editorial vai ao ar.", area: "calendario" },
 { kind: "calendario-post-aprovado", label: "Post aprovado pelo cliente", desc: "Dispara quando o cliente aprova um post no calendário.", area: "calendario" },
 { kind: "calendario-post-agendado", label: "Post agendado", desc: "Dispara quando um post é agendado para publicação.", area: "calendario" },
 { kind: "calendario-post-reprovado", label: "Post reprovado", desc: "Dispara quando um post é reprovado na aprovação.", area: "calendario" },
 { kind: "calendario-ideia-criada", label: "Nova ideia de conteúdo", desc: "Dispara quando uma nova ideia é adicionada ao calendário.", area: "calendario" },
 // Tracking
 { kind: "tracking-conversao", label: "Conversão capturada", desc: "Dispara quando o pixel/tracking registra uma conversão.", area: "tracking" },
 { kind: "tracking-visita-quente", label: "Visita quente ao site", desc: "Dispara em visitas repetidas ou de alto interesse.", area: "tracking" },
 { kind: "tracking-primeiro-acesso", label: "Primeiro acesso ao site", desc: "Dispara quando um visitante acessa o site pela primeira vez.", area: "tracking" },
 // Webhooks
 { kind: "webhook", label: "Webhook recebido", desc: "Dispara quando chega um POST na URL configurada.", area: "webhooks" },
 { kind: "webhook-enviado", label: "Webhook enviado", desc: "Dispara quando o sistema envia um webhook para um serviço externo.", area: "webhooks" },
 // Grupos de WhatsApp
 { kind: "grupo-novo-membro", label: "Novo membro entrou no grupo", desc: "Dispara quando alguém entra no grupo, permite enviar boas-vindas automáticas.", area: "grupo" },
 { kind: "grupo-membro-saiu", label: "Membro saiu do grupo", desc: "Dispara quando alguém sai do grupo por conta própria.", area: "grupo" },
 { kind: "grupo-membro-removido", label: "Membro removido do grupo", desc: "Dispara quando um admin remove alguém do grupo.", area: "grupo" },
 { kind: "grupo-membro-promovido", label: "Membro promovido a admin", desc: "Dispara quando um participante é promovido a administrador do grupo.", area: "grupo" },
 { kind: "grupo-palavra-chave", label: "Palavra-chave em mensagem do grupo", desc: "Dispara quando uma mensagem no grupo contém a palavra ou frase configurada.", area: "grupo" },
 { kind: "grupo-midia", label: "Mídia enviada no grupo", desc: "Dispara quando alguém envia áudio, imagem, vídeo ou documento no grupo.", area: "grupo" },
 { kind: "grupo-mensagem-admin", label: "Mensagem de administrador", desc: "Dispara apenas quando a mensagem no grupo vem de um administrador.", area: "grupo" },
 { kind: "grupo-mencao-bot", label: "Menção ao número do bot", desc: "Dispara quando alguém @menciona o número conectado dentro do grupo.", area: "grupo" },
 { kind: "grupo-mensagem-periodica", label: "Mensagem periódica no grupo", desc: "Envia mensagem em intervalos definidos (diário, semanal, mensal).", area: "grupo" },
 { kind: "grupo-link-nao-autorizado", label: "Link não autorizado detectado", desc: "Dispara quando alguém envia um link fora da lista permitida.", area: "grupo" },
 { kind: "grupo-flood", label: "Flood detectado", desc: "Dispara quando um membro envia muitas mensagens em pouco tempo.", area: "grupo" },
 { kind: "grupo-palavra-proibida", label: "Palavra proibida detectada", desc: "Dispara quando aparece uma palavra da lista de banidas no grupo.", area: "grupo" },
 // Redes sociais (Meta)
 { kind: "social-dm-messenger", label: "Messenger: mensagem direta recebida", desc: "Dispara quando alguém envia DM na página do Facebook (Messenger). Respeita a janela de 24h da Meta.", area: "social" },
 { kind: "social-dm-instagram", label: "Instagram: Direct recebido", desc: "Dispara quando alguém envia Direct para a conta do Instagram conectada.", area: "social" },
 { kind: "social-comentario-facebook", label: "Facebook: comentário em post da página", desc: "Dispara quando alguém comenta em um post da página do Facebook conectada.", area: "social" },
 { kind: "social-comentario-instagram", label: "Instagram: comentário em post/reel", desc: "Dispara quando alguém comenta em um post ou reel do Instagram conectado.", area: "social" },
 { kind: "social-mencao-facebook", label: "Facebook: menção à página", desc: "Dispara quando a página do Facebook é mencionada em outro post ou comentário.", area: "social" },
 { kind: "social-mencao-instagram", label: "Instagram: menção à conta", desc: "Dispara quando a conta do Instagram é mencionada em post, comentário ou story.", area: "social" },
 { kind: "social-story-mencao-instagram", label: "Instagram: menção em story", desc: "Dispara quando a conta é @mencionada dentro de um Story.", area: "social", emBreve: true },
 { kind: "social-story-resposta-instagram", label: "Instagram: resposta em story", desc: "Dispara quando alguém responde a um Story publicado pela conta.", area: "social", emBreve: true },
 { kind: "social-story-reacao-instagram", label: "Instagram: reação em story", desc: "Dispara quando alguém reage a um Story publicado pela conta.", area: "social", emBreve: true },
 // LinkedIn (via connector oficial Lovable)
 { kind: "social-comentario-linkedin", label: "LinkedIn: comentário em post", desc: "Dispara quando alguém comenta em um post publicado pela conta/página conectada.", area: "social" },
 { kind: "social-mencao-linkedin", label: "LinkedIn: menção à página", desc: "Dispara quando a conta/página é @mencionada em um post do LinkedIn.", area: "social" },
 { kind: "social-dm-linkedin", label: "LinkedIn: nova mensagem (InMail/DM)", desc: "Dispara quando a conta recebe uma nova mensagem no LinkedIn. Requer plano/API compatível.", area: "social", emBreve: true },
 // TikTok (via connector oficial Lovable)
 { kind: "social-comentario-tiktok", label: "TikTok: comentário em vídeo", desc: "Dispara quando alguém comenta em um vídeo publicado pela conta conectada.", area: "social" },
 { kind: "social-mencao-tiktok", label: "TikTok: menção à conta", desc: "Dispara quando a conta é @mencionada em um vídeo ou comentário.", area: "social" },
 { kind: "social-dm-tiktok", label: "TikTok: nova mensagem direta", desc: "Dispara quando a conta recebe uma DM. Só funciona quando a Business API de mensagens estiver liberada para a conta.", area: "social", emBreve: true },
];

export const GATILHO_AREA_LABEL: Record<GatilhoArea, string> = {
 conversa: "Conversas",
 crm: "CRM",
 trafego: "Gestor de tráfego",
 calendario: "Calendário editorial",
 tracking: "Tracking",
 webhooks: "Webhooks",
 grupo: "Grupos de WhatsApp",
 social: "Redes sociais (Meta)",
};

export function isGatilhoEmBreve(kind: GatilhoKind): boolean {
 return GATILHO_CATALOG.find((c) => c.kind === kind)?.emBreve === true;
}

export function computeGatilhoDelaySeconds(g: Gatilho): number {
 const d = Math.max(0, Math.floor(g.atrasoDias ?? 0));
 const h = Math.max(0, Math.floor(g.atrasoHoras ?? 0));
 const m = Math.max(0, Math.floor(g.atrasoMin ?? 0));
 const s = Math.max(0, Math.floor(g.atrasoSeg ?? 0));
 return d * 86400 + h * 3600 + m * 60 + s;
}

export function describeGatilho(g: Gatilho): string {
 const cat = GATILHO_CATALOG.find((c) => c.kind === g.kind);
 const base = (() => {
  switch (g.kind) {
   case "qualquer-conversa":
    return g.canal && g.canal !== "qualquer" ? `Nova conversa · ${g.canal}` : "Qualquer nova conversa";
   case "movido-etapa":
    return g.stageNome
     ? `Movido p/ etapa: ${g.pipelineNome ? `${g.pipelineNome} → ` : ""}${g.stageNome}`
     : "Movido para etapa (configurar)";
   case "mensagem-recebida":
    return g.canal && g.canal !== "qualquer" ? `Msg recebida · ${g.canal}` : "Mensagem recebida";
   case "palavra-chave":
    return g.palavraChave ? `Palavra-chave: "${g.palavraChave}"` : "Palavra-chave (configurar)";
   case "midia-recebida":
    return g.midiaTipo && g.midiaTipo !== "qualquer" ? `Mídia: ${g.midiaTipo}` : "Mídia recebida";
   case "primeira-mensagem":
    return g.canal && g.canal !== "qualquer" ? `Primeira msg · ${g.canal}` : "Primeira mensagem do lead";
   case "sem-resposta":
    return `Sem resposta há ${g.horasSemResposta ?? 24}h`;
   case "tag-adicionada":
    return g.tag ? `Tag adicionada: ${g.tag}` : "Tag adicionada (configurar)";
   case "campo-alterado":
    return g.campoNome ? `Campo alterado: ${g.campoNome}${g.campoValor ? ` = ${g.campoValor}` : ""}` : "Campo alterado (configurar)";
   case "webhook":
    return g.webhookUrl ? `Webhook: ${g.webhookUrl.slice(0, 40)}` : "Webhook (configurar)";
   case "webhook-enviado":
    return g.webhookUrl ? `Webhook enviado: ${g.webhookUrl.slice(0, 40)}` : "Webhook enviado (configurar)";
   case "formulario-enviado": {
    const origem = g.formularioOrigem && g.formularioOrigem !== "qualquer"
     ? ` · ${g.formularioOrigem === "mkton" ? "MKTOn" : g.formularioOrigem === "externo" ? "site externo" : "Meta"}`
     : "";
    return g.formularioId
     ? `Formulário: ${g.formularioNome ?? "selecionado"}${origem}`
     : `Qualquer formulário enviado${origem}`;
   }
   case "tracking-conversao":
   case "tracking-visita-quente":
   case "tracking-primeiro-acesso":
   case "tracking-abandono-formulario": {
    const evt = (g.trackingEvento ?? "").trim();
    const site = g.trackingSiteNome ? ` · ${g.trackingSiteNome}` : "";
    const min = g.trackingValorMin && g.trackingValorMin > 0 ? ` · ≥ ${g.trackingValorMin}` : "";
    if (g.kind === "tracking-conversao") {
     return evt ? `Conversão no site: ${evt}${site}${min}` : "Conversão no site (configurar evento)";
    }
    return `${cat?.label ?? g.kind}${evt && evt !== "qualquer" ? `: ${evt}` : ""}${site}`;
   }
   default:
    return cat?.label ?? g.kind;
  }
 })();
 const delay = computeGatilhoDelaySeconds(g);
 return delay > 0 ? `${base} · +${formatDelaySeconds(delay)}` : base;
}

function formatDelaySeconds(total: number): string {
 const d = Math.floor(total / 86400);
 const h = Math.floor((total % 86400) / 3600);
 const m = Math.floor((total % 3600) / 60);
 const s = total % 60;
 const parts: string[] = [];
 if (d) parts.push(`${d}d`);
 if (h) parts.push(`${h}h`);
 if (m) parts.push(`${m}m`);
 if (s) parts.push(`${s}s`);
 return parts.join(" ") || "0s";
}

export function isGatilhoConfigured(g: Gatilho): boolean {
  // Em breve: pode ser adicionado (visual), mas não considerado funcional pelo runtime
  if (isGatilhoEmBreve(g.kind)) {
    switch (g.kind) {
      case "sem-resposta":
        return typeof g.horasSemResposta === "number" && g.horasSemResposta > 0;
      case "campo-alterado":
        return !!g.campoNome?.trim();
      default:
        return true;
    }
  }

  // Se tem atraso configurado, consideramos configurado (intencional)
  const delay = computeGatilhoDelaySeconds(g);
  if (delay > 0) return true;

  switch (g.kind) {
    case "qualquer-conversa":
    case "mensagem-recebida":
    case "primeira-mensagem":
      // Requer canal selecionado
      return !!g.canal && g.canal !== "qualquer" && !!g.canalId;
    case "palavra-chave":
      return !!g.palavraChave?.trim() && !!g.canal && g.canal !== "qualquer" && !!g.canalId;
    case "midia-recebida":
      return !!g.canal && g.canal !== "qualquer" && !!g.canalId;
    case "crm-lead-criado":
      return true;
    case "movido-etapa":
      return !!g.stageId;
    case "tag-adicionada":
      return !!g.tag?.trim();
    case "webhook":
    case "webhook-enviado":
      return !!g.webhookUrl?.trim();
    case "tracking-conversao":
      return !!g.trackingEvento?.trim();
    case "tracking-visita-quente":
    case "tracking-primeiro-acesso":
    case "tracking-abandono-formulario":
      return true;
    default:
      return true;
  }
}


// ============ Storage ============

export type SalesbotEscopo = "individual" | "grupo" | "social-comentario";

export interface Salesbot {
 id: string;
 nome: string;
 escopo?: SalesbotEscopo;
 blocks: Block[];
 startBlockId?: string;
 // Próximo número de série a atribuir ao criar um bloco. Nunca decrementa.
 nextSerial?: number;
  gatilhos?: Gatilho[];
  isActive?: boolean;
 conversao?: number;
 totalLancado?: number;
 sessoesAtivas?: number;
 /** Bots de grupo: máximo de interações do bot antes de encerrar sozinho. */
 maxInteracoes?: number;
 /** Posição visual persistida do nó inicial no canvas. */
 startPosition?: { x: number; y: number };
 /** Token de concorrência otimista vindo do banco (metadata/listagem). */
 revision?: number;
 updatedAt: string;
}

export const BLOCK_CATALOG: {
 kind: BlockKind;
 label: string;
 color: string;
 desc: string;
 emBreve?: boolean;
}[] = [
 { kind: "enviar-mensagem", label: "Enviar mensagem", color: "bg-emerald-500", desc: "Envia uma mensagem para o cliente." },
 { kind: "reacao", label: "Reação", color: "bg-pink-500", desc: "Reage com emoji (só WhatsApp Web)." },
 	{ kind: "comentario", label: "Comentário", color: "bg-fuchsia-500", desc: "Responde o comentário no Instagram ou Facebook." },
 	{ kind: "enviar-dm", label: "Enviar DM", color: "bg-violet-500", desc: "Manda no Direct/Messenger de quem comentou." },
 	{ kind: "msg-interna", label: "Mensagem interna", color: "bg-slate-400", desc: "Avisa a equipe no chat interno. O lead não vê." },

 	{ kind: "pausar", label: "Pausar", color: "bg-amber-500", desc: "Aguarda antes do próximo passo." },

  { kind: "acao", label: "Ação", color: "bg-green-500", desc: "Executa uma ação no CRM." },
  { kind: "condicao", label: "Condição", color: "bg-yellow-500", desc: "Se/então: ramifica o fluxo." },
  { kind: "validacao", label: "Validação", color: "bg-orange-500", desc: "Confere o que o cliente respondeu." },
  { kind: "ir-etapa", label: "Outra etapa", color: "bg-indigo-500", desc: "Pula para outro bloco deste bot." },
  { kind: "iniciar-salesbot", label: "Iniciar Salesbot", color: "bg-sky-500", desc: "Inicia outro salesbot." },
  { kind: "iniciar-ia", label: "Agente IA", color: "bg-violet-500", desc: "Entrega a conversa para um agente IA." },


 { kind: "round-robin", label: "Distribuição", color: "bg-cyan-500", desc: "Divide os leads em ordem, sem pular ninguém." },
 { kind: "encerrar-bot", label: "Encerrar bot", color: "bg-rose-500", desc: "Finaliza o fluxo neste ponto." },
 { kind: "enquete", label: "Enquete / Votação", color: "bg-teal-500", desc: "Cria uma enquete no grupo." },
];

// Blocos que NÃO fazem sentido em bots de grupo (grupo não espera resposta
// individual do cliente, não anda no funil e não roda em posts Meta).
const BLOCK_KINDS_HIDDEN_FOR_GROUP: BlockKind[] = [
 "reacao",
 "comentario",
 "enviar-dm",
 "validacao",
];

// Blocos exclusivos de grupo (não aparecem no builder de 1-a-1).
const BLOCK_KINDS_ONLY_GROUP: BlockKind[] = [
 "enquete",
];

// Bots de "responder comentário" em rede social só devem oferecer os blocos
// que realmente rodam nesse contexto. O restante do catálogo (mensagens 1-a-1,
// reação, msg interna, round-robin, enquete) fica escondido porque não há
// canal de WhatsApp associado, quem comentou não está numa conversa do CRM.
const BLOCK_KINDS_SOCIAL_COMENTARIO: BlockKind[] = [
 "comentario",
 "enviar-dm",
 "pausar",
 "acao",
 "condicao",
 "validacao",
 "ir-etapa",
 "iniciar-salesbot",
 "iniciar-ia",
 "encerrar-bot",
];

export function filterBlockCatalogByScope(scope: SalesbotEscopo): typeof BLOCK_CATALOG {
 const available = BLOCK_CATALOG.filter((b) => b.kind !== "enviar-dm" && b.kind !== "comentario");
 if (scope === "grupo") {
  return available.filter((b) => !BLOCK_KINDS_HIDDEN_FOR_GROUP.includes(b.kind));
 }
 if (scope === "social-comentario") {
  return available.filter((b) => BLOCK_KINDS_SOCIAL_COMENTARIO.includes(b.kind));
 }
 return available.filter((b) => !BLOCK_KINDS_ONLY_GROUP.includes(b.kind));
}

export const ACAO_OPCOES: { value: AcaoTipo; label: string }[] = [
 { value: "nota", label: "Adicionar nota" },
 { value: "tarefa", label: "Adicionar tarefa" },
 { value: "status-conversa", label: "Alterar status da conversa (fechada/lida)" },
 { value: "completar-tarefa", label: "Completar tarefa" },
 { value: "definir-campo", label: "Definir campo" },
 { value: "enviar-email", label: "Enviar e-mail" },
 { value: "webhook", label: "Enviar webhook" },
 { value: "tags", label: "Gerenciar tags" },
 { value: "mudar-status-lead", label: "Mudar status do lead" },
 { value: "mudar-responsavel", label: "Mudar usuário responsável" },
 { value: "enviar-privado", label: "Enviar mensagem no privado do membro" },
  { value: "notificar-admins", label: "Notificar admins do grupo (no privado)" },
  { value: "vincular-produto", label: "Vincular produto" },
];

// Ações que fazem sentido dentro de um bot de grupo. As demais são de CRM/1-a-1
// (funil, campo personalizado, e-mail transacional etc.) e ficam ocultas.
const ACOES_GRUPO: AcaoTipo[] = [
 "webhook",
 "enviar-privado",
 "notificar-admins",
 "tags",
 "nota",
 "tarefa",
 "formulario",
];

export function filterAcoesByScope(scope: SalesbotEscopo): typeof ACAO_OPCOES {
 const available = ACAO_OPCOES.filter((a) => a.value !== "enviar-email");
 if (scope === "grupo") {
  return available.filter((a) => ACOES_GRUPO.includes(a.value));
 }
 // 1-a-1: esconde ações exclusivas de grupo
 return available.filter((a) => a.value !== "enviar-privado" && a.value !== "notificar-admins");
}

export const VALIDACAO_OPCOES: { value: ValidacaoTipo; label: string }[] = [
 { value: "igual", label: "É igual a" },
 { value: "igual-lista", label: "É um destes valores" },
 { value: "contem-lista", label: "Contém alguma destas frases" },
 { value: "resposta-igual", label: "Resposta é" },
 { value: "contem", label: "Contém" },
 { value: "nao-contem", label: "Não contém" },
 { value: "desigual", label: "É desigual a" },
 { value: "comprimento", label: "Tem comprimento de" },
 { value: "regex", label: "Expressão regular" },
 { value: "numero", label: "É número" },
 { value: "letra", label: "É letra" },
 { value: "palavra", label: "É palavra" },
 { value: "telefone", label: "É telefone" },
 { value: "email", label: "É e-mail" },
 { value: "gama", label: "Está na gama de" },
];

export const PAUSA_OPCOES: { value: PausaTipo; label: string }[] = [
  { value: "cronometro", label: "Cronômetro (esperar tempo)" },
  { value: "msg-recebida", label: "Resposta do cliente" },
  { value: "lote-msgs", label: "Lote de mensagens (grupos)" },
  { value: "ate-expediente", label: "Até início do expediente" },
  { value: "ate-fora-expediente", label: "Até fim do expediente" },
  { value: "exceto-expediente", label: "Exceto durante expediente" },
  { value: "exceto-fora-expediente", label: "Exceto fora do expediente" },
  { value: "video-aberto", label: "Vídeo aberto" },
  { value: "audio-aberto", label: "Áudio aberto" },
  { value: "audio-fechado", label: "Áudio fechado" },
];

/** Pausas que só fazem sentido em bots de grupo (fluxo alto de mensagens). */
const PAUSAS_ONLY_GROUP: PausaTipo[] = ["lote-msgs"];

export function filterPausaOpcoesByScope(scope: SalesbotEscopo): typeof PAUSA_OPCOES {
  if (scope === "grupo") return PAUSA_OPCOES;
  return PAUSA_OPCOES.filter((p) => !PAUSAS_ONLY_GROUP.includes(p.value));
}

/** Limite padrão de interações do bot dentro de um grupo. */
export const GRUPO_MAX_INTERACOES_PADRAO = 5;



const STORAGE_KEY = "mkton:salesbots";

function migrateGatilho(g: unknown): Gatilho | null {
 if (typeof g === "string") {
  const label = g.trim();
  if (!label) return null;
  return { id: newId("gat"), kind: "mensagem-recebida", label };
 }
 if (g && typeof g === "object" && "kind" in (g as Record<string, unknown>)) {
  const rec = g as Gatilho;
  // migração: kinds antigos que foram removidos/renomeados
  const oldKind = rec.kind as string;
  let kind: GatilhoKind = rec.kind;
  if (oldKind === "custom") kind = "mensagem-recebida";
  else if (oldKind === "trackeamento-conversao") kind = "tracking-conversao";
  else if (oldKind === "trackeamento-visita-quente") kind = "tracking-visita-quente";
  return { ...rec, kind, id: rec.id || newId("gat") };
 }
 return null;
}

export function loadSalesbots(): Salesbot[] {
 if (typeof window === "undefined") return [];
 try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr
     .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
     .map((b, index) => {
     const bot = { ...(b as unknown as Salesbot) };
     bot.id = typeof b.id === "string" && b.id.trim() ? b.id : newId("bot");
     bot.nome = typeof b.nome === "string" && b.nome.trim() ? b.nome : `Bot sem nome ${index + 1}`;
     bot.updatedAt = typeof b.updatedAt === "string" && b.updatedAt ? b.updatedAt : new Date().toISOString();
     bot.blocks = Array.isArray(b.blocks)
      ? ((b.blocks as unknown[]).filter((blk) => !!blk && typeof blk === "object") as Block[])
      : [];
    bot.gatilhos = Array.isArray(b.gatilhos)
     ? (b.gatilhos as unknown[]).map(migrateGatilho).filter((x): x is Gatilho => !!x)
     : [];
    // Migração: bloco de validação legado (só tinha 1 tipo/valor) vira uma regra.
    if (Array.isArray(bot.blocks)) {
     bot.blocks = bot.blocks.map((blk) => {
      if (blk?.kind !== "validacao") return blk;
      const hasRoleta = Array.isArray(blk.roleta) && blk.roleta.length > 0;
      if (hasRoleta) return blk;
      if (!blk.validacaoTipo) return blk;
      return {
       ...blk,
       roleta: [{
        id: newId("r"),
        label: "Regra 1",
        alvo: "mensagem" as const,
        tipo: blk.validacaoTipo,

        valor: blk.validacaoValor ?? "",
        // Preserva o antigo ramo "verdadeiro" (nextBlockId era o próximo se passasse)
        nextBlockId: blk.nextBlockId,
       }],
       // O novo default de "nenhuma passou" continua sendo nextBlockId; se
       // existia um falseNextBlockId legado, ele vira o "senão".
       nextBlockId: blk.falseNextBlockId ?? blk.nextBlockId,
      };
     });

     // Migração: atribuir serial persistente por ordem de aparição, uma única vez.
     let maxSerial = 0;
     bot.blocks.forEach((blk) => {
      if (typeof blk.serial === "number" && blk.serial > maxSerial) maxSerial = blk.serial;
     });
     bot.blocks = bot.blocks.map((blk) => {
      if (typeof blk.serial === "number") return blk;
      maxSerial += 1;
      return { ...blk, serial: maxSerial };
     });
     if (typeof bot.nextSerial !== "number" || bot.nextSerial <= maxSerial) {
      bot.nextSerial = maxSerial + 1;
     }
    }
    return bot;
   });
  } catch {
   return [];
  }
}

/** Cache local: apenas conveniência de leitura. O banco é a fonte da verdade,
 *  então uma falha aqui (quota cheia, modo privado) nunca pode propagar erro
 *  e interromper o salvamento remoto. */
export function saveSalesbots(bots: Salesbot[]) {
 if (typeof window === "undefined") return;
 try {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bots));
 } catch {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignora */ }
 }
}

export function newId(prefix = "id"): string {
 return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
