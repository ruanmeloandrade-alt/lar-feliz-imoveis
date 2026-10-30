export type HelpFaqCategory =
  | "Primeiros passos"
  | "Conta e equipe"
  | "Planos e faturamento"
  | "CRM"
  | "Inbox"
  | "Automações e IA"
  | "Produtividade"
  | "Tracking e dados"
  | "Marketing"
  | "Integrações"
  | "Segurança"
  | "Suporte";

export type HelpFaq = {
  category: HelpFaqCategory;
  question: string;
  answer: string;
  keywords?: string[];
};

export const HELP_FAQ_CATEGORIES: HelpFaqCategory[] = [
  "Primeiros passos",
  "Conta e equipe",
  "Planos e faturamento",
  "CRM",
  "Inbox",
  "Automações e IA",
  "Produtividade",
  "Tracking e dados",
  "Marketing",
  "Integrações",
  "Segurança",
  "Suporte",
];

export const HELP_FAQS: HelpFaq[] = [
  {
    category: "Primeiros passos",
    question: "Acabei de entrar. Por onde eu começo?",
    answer:
      "Comece pela Home e pelas Integrações. Conecte primeiro os canais e ferramentas que sua operação realmente usa, depois organize o CRM e só então ative automações, SalesBots e agentes de IA. Assim você consegue testar cada camada antes de adicionar a próxima.",
    keywords: ["começar", "onboarding", "ativação"],
  },
  {
    category: "Primeiros passos",
    question: "Preciso configurar todos os módulos de uma vez?",
    answer:
      "Não. A MktOn é modular. Você pode começar pelo núcleo que resolve sua operação — por exemplo CRM + Inbox — e adicionar Tracking, Fluxo de Trabalho, Gestor de Tráfego ou Social Media conforme a necessidade e o acesso do seu plano.",
  },
  {
    category: "Primeiros passos",
    question: "Onde eu encontro os módulos da MktOn?",
    answer:
      "O menu lateral separa as áreas principais, a rotina e os módulos disponíveis. CRM, Leads, Inbox, Calendário e Notas ficam na operação diária; Tracking, Gestor de Tráfego, Social Media e Fluxo de Trabalho aparecem conforme disponibilidade e acesso.",
  },
  {
    category: "Conta e equipe",
    question: "Como adiciono um funcionário?",
    answer:
      "Abra Configurações e acesse a área de conta, equipe e permissões. O administrador controla quem participa do workspace, o setor de cada pessoa e quais áreas ficam disponíveis para cada perfil.",
  },
  {
    category: "Conta e equipe",
    question: "O funcionário vê tudo que o administrador vê?",
    answer:
      "Não necessariamente. A MktOn possui permissões por módulo e itens de navegação. O administrador pode restringir áreas e ações; algumas superfícies administrativas também são reservadas ao administrador principal ou superadmin.",
  },
  {
    category: "Conta e equipe",
    question: "Como troco de workspace ou conta?",
    answer:
      "Use a troca de conta/workspace disponível na navegação da conta. Ao selecionar outro workspace, os dados, permissões e integrações passam a refletir aquele contexto.",
  },
  {
    category: "Planos e faturamento",
    question: "Onde vejo meu plano e os recursos liberados?",
    answer:
      "Abra Configurações e a área de plano/faturamento. O sistema usa o plano e os entitlements para liberar módulos, limites e recursos da conta.",
  },
  {
    category: "Planos e faturamento",
    question: "Por que uma função pode aparecer bloqueada para mim?",
    answer:
      "Normalmente é uma de três coisas: permissão do usuário, módulo não liberado no plano ou dependência de integração/configuração ainda não concluída. A documentação do módulo indica os pré-requisitos de cada recurso.",
  },
  {
    category: "Planos e faturamento",
    question: "O período de teste libera toda a plataforma?",
    answer:
      "O trial segue as regras de acesso configuradas pela MktOn para o período de teste. Alguns recursos ainda podem depender de integrações externas, permissões e configurações do workspace.",
  },
  {
    category: "CRM",
    question: "Para que serve o CRM da MktOn?",
    answer:
      "O CRM centraliza funis, etapas, leads e a rotina comercial. Ele é o ponto de encontro entre captação, atendimento, automações, SalesBots, agentes de IA e outras áreas da operação.",
  },
  {
    category: "CRM",
    question: "Como funcionam funis e etapas?",
    answer:
      "Cada funil representa um processo comercial ou operacional. Dentro dele, as etapas mostram onde cada lead está. Você pode organizar o processo usando os funis e etapas existentes do workspace e vincular automações ao avanço desse lead.",
  },
  {
    category: "CRM",
    question: "Posso cadastrar um lead manualmente?",
    answer:
      "Sim. A área de Leads e o CRM possuem fluxo para registrar e organizar leads manualmente, além dos leads que chegam por canais e integrações conectadas.",
  },
  {
    category: "CRM",
    question: "Para que servem Públicos?",
    answer:
      "Públicos ajudam a organizar grupos de leads para leitura e uso operacional. Eles ficam dentro da área de Leads e podem apoiar segmentação de ações e campanhas conforme os recursos conectados.",
  },
  {
    category: "CRM",
    question: "O que são Empresas, Produtos e Arquivos dentro do CRM?",
    answer:
      "Empresas organizam organizações relacionadas aos contatos; Produtos estruturam itens/planos que podem ser associados à operação comercial; Arquivos centralizam documentos e materiais ligados ao workspace e às integrações compatíveis.",
  },
  {
    category: "CRM",
    question: "Para que servem os Formulários?",
    answer:
      "Formulários capturam informações e podem alimentar a operação comercial. A combinação mais comum é Formulário → Lead → CRM → Automação, desde que o fluxo esteja configurado para esse objetivo.",
  },
  {
    category: "Inbox",
    question: "O que é o Inbox Chat?",
    answer:
      "É a central de conversas da operação. O menu separa Chat com Leads, Chat da Equipe, Chat Suporte e Chat E-mail, permitindo manter atendimento e comunicação interna em áreas distintas.",
  },
  {
    category: "Inbox",
    question: "Conectar WhatsApp significa necessariamente usar QR Code?",
    answer:
      "Não. A MktOn possui mais de uma forma de integração com WhatsApp. Há conexão baseada em sessão/WhatsApp Web e também estrutura para WhatsApp Cloud oficial. O procedimento correto depende do conector escolhido em Integrações.",
  },
  {
    category: "Inbox",
    question: "Onde verifico se um canal está conectado?",
    answer:
      "Abra Integrações. Cada conector possui status e próximo passo. No caso de canais que exigem autorização, sessão ou credenciais, o próprio painel do conector mostra o estado atual.",
  },
  {
    category: "Automações e IA",
    question: "Qual a diferença entre Automação, SalesBot e Agente de IA?",
    answer:
      "Automação executa ações e regras disparadas por eventos; SalesBot segue um fluxo estruturado em blocos; Agente de IA interpreta objetivo, contexto e conhecimento para conversar ou atuar de forma mais flexível. Eles podem fazer parte do mesmo processo, mas não são a mesma coisa.",
  },
  {
    category: "Automações e IA",
    question: "O SalesBot consegue chamar ferramentas externas?",
    answer:
      "Sim, quando a integração correspondente estiver configurada. A MktOn possui suporte para automações externas como Make, n8n, Zapier e Webhook, permitindo que um fluxo envie dados e receba retorno conforme a configuração.",
  },
  {
    category: "Automações e IA",
    question: "O que é o Gestor de CRM?",
    answer:
      "É a área de IA ligada à operação de CRM. O acesso e as ações disponíveis dependem do perfil e das configurações do workspace. A documentação específica explica os modos de criação e uso disponíveis.",
  },
  {
    category: "Automações e IA",
    question: "Posso usar IA e SalesBot no mesmo processo?",
    answer:
      "Sim. Um processo pode combinar etapas determinísticas de SalesBot com momentos em que um agente de IA assume uma conversa ou tarefa, desde que o fluxo seja configurado dessa forma.",
  },
  {
    category: "Produtividade",
    question: "Para que serve o Fluxo de Trabalho?",
    answer:
      "O Fluxo de Trabalho organiza tarefas em Kanban, com etapas, responsáveis, setores, prazos e acompanhamento da execução. Ele é voltado à operação interna da equipe.",
  },
  {
    category: "Produtividade",
    question: "O que é o Funcionário do mês?",
    answer:
      "É a camada de gamificação do Fluxo de Trabalho. Ela usa a execução das tarefas para compor ranking e acompanhamento interno quando o recurso está ativado pelo administrador.",
  },
  {
    category: "Produtividade",
    question: "Calendário e Notas são ligados ao CRM?",
    answer:
      "Eles fazem parte da rotina do workspace e podem ser usados em conjunto com a operação comercial. As conexões automáticas específicas dependem do fluxo e das funções disponíveis em cada módulo.",
  },
  {
    category: "Tracking e dados",
    question: "Para que serve o Tracking & Analytics?",
    answer:
      "O Tracking registra eventos, UTMs e informações de origem para ajudar a relacionar aquisição e resultado. Esses dados podem alimentar leituras de performance e KPIs quando a configuração do site/campanha estiver correta.",
  },
  {
    category: "Tracking e dados",
    question: "Por que meu evento não aparece no Tracking?",
    answer:
      "Confira se o site/domínio está cadastrado, se o pixel/configuração foi instalado corretamente, se o evento realmente disparou e se você está olhando o workspace certo. Também verifique permissões e filtros ativos.",
  },
  {
    category: "Tracking e dados",
    question: "O Dashboard inventa dados quando uma integração não existe?",
    answer:
      "Não deve. A regra da MktOn é trabalhar com dados reais das fontes conectadas e mostrar estados vazios ou indisponíveis quando uma fonte ainda não está pronta ou autorizada.",
  },
  {
    category: "Marketing",
    question: "O que faz o Gestor de Tráfego IA?",
    answer:
      "O módulo concentra leitura e operação de mídia paga, incluindo recursos para Meta Ads e estrutura de Google Ads, otimizações e relatórios conforme as contas e integrações efetivamente disponíveis.",
  },
  {
    category: "Marketing",
    question: "O que faz o Social Media?",
    answer:
      "O Social Media organiza produção de conteúdo, calendário editorial, ideias, legendas e fluxos de aprovação. Recursos de geração de imagem dependem do provider de imagem conectado e da configuração correspondente.",
  },
  {
    category: "Marketing",
    question: "Por que uma campanha ou métrica de Ads pode não aparecer?",
    answer:
      "Verifique se a conta de anúncios correta foi autorizada, se o workspace está usando a conexão certa e se a sincronização/configuração necessária foi concluída. Alguns recursos também dependem de configuração global da própria MktOn.",
  },
  {
    category: "Integrações",
    question: "Quais tipos de integração existem?",
    answer:
      "O catálogo da MktOn organiza conectores por categorias como Ads, Social, Catálogos, IA, Automação, Arquivos, E-mail, Voz e Assinatura. A lista visível depende do perfil, do status técnico e do que está liberado para o cliente.",
  },
  {
    category: "Integrações",
    question: "Posso conectar OpenAI e outros provedores de IA?",
    answer:
      "A área de Integrações possui conectores de IA e painéis próprios para providers suportados. O status exibido no catálogo indica se o conector está disponível, conectado ou ainda depende de configuração.",
  },
  {
    category: "Integrações",
    question: "Make, n8n, Zapier e Webhook fazem a mesma coisa?",
    answer:
      "Eles cumprem papéis parecidos de integração/automação externa, mas cada plataforma tem sua própria conexão. Na MktOn, esses conectores podem ser utilizados por fluxos que precisam enviar informações para uma automação externa.",
  },
  {
    category: "Integrações",
    question: "Alguma integração depende da configuração global da MktOn?",
    answer:
      "Sim. Alguns provedores exigem app, OAuth, revisão, chave ou configuração mantida pela própria MktOn. Nesses casos o cliente não deve precisar criar a infraestrutura central da plataforma; a interface indica quando a dependência é externa ou administrativa.",
  },
  {
    category: "Segurança",
    question: "Como funcionam permissões e sessões?",
    answer:
      "A MktOn aplica permissões de acesso e possui controles de sessão/dispositivo na área de segurança. O administrador tem uma visão mais ampla da equipe; usuários comuns ficam limitados ao próprio contexto e às permissões concedidas.",
  },
  {
    category: "Segurança",
    question: "Meus dados de um workspace aparecem em outro?",
    answer:
      "A operação é organizada por workspace. As consultas e integrações devem respeitar esse contexto para que dados de clientes diferentes não sejam misturados.",
  },
  {
    category: "Suporte",
    question: "Onde encontro aulas e tutoriais?",
    answer:
      "A Faculdade MktOn reúne conteúdo de treinamento para clientes. A nova Central de Documentação complementa isso com tutoriais escritos, explicação de módulos, conexões e diagnóstico.",
  },
  {
    category: "Suporte",
    question: "Quando devo falar com o suporte?",
    answer:
      "Procure o suporte quando a documentação e o diagnóstico básico não resolverem, quando houver erro de integração, comportamento inconsistente, problema de acesso ou necessidade de análise humana da sua conta.",
  },
];

export function filterHelpFaqs(term: string, category?: HelpFaqCategory | null) {
  const normalized = term.trim().toLocaleLowerCase("pt-BR");
  return HELP_FAQS.filter((faq) => {
    if (category && faq.category !== category) return false;
    if (!normalized) return true;
    return [faq.question, faq.answer, faq.category, ...(faq.keywords ?? [])]
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(normalized);
  });
}
