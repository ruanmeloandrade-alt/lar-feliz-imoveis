export type DocumentationCategory = "Comece aqui" | "Comercial" | "Atendimento" | "Automação e IA" | "Produtividade" | "Dados" | "Marketing" | "Administração" | "Aprendizado";
export type DocumentationStatus = "available" | "requires_access" | "requires_integration" | "admin_only";

export type DocumentationArticle = {
  whatIs: string;
  purpose: string;
  capabilities: string[];
  location: string;
  prerequisites: string[];
  steps: string[];
  connections: string[];
  examples: string[];
  limitations: string[];
  troubleshooting: string[];
  related: string[];
};

export type DocumentationModule = {
  id: string;
  title: string;
  category: DocumentationCategory;
  summary: string;
  route: string;
  status: DocumentationStatus;
  keywords: string[];
  article: DocumentationArticle;
};

const article = (input: DocumentationArticle) => input;

export const DOCUMENTATION_MODULES: DocumentationModule[] = [
  {
    id: "crm-funis", title: "CRM e Funis", category: "Comercial", route: "/crm/funis-de-venda", status: "available",
    summary: "Organize processos comerciais em funis e etapas e acompanhe onde cada lead está.", keywords: ["crm", "funil", "etapa", "pipeline", "lead"],
    article: article({
      whatIs: "O CRM é a base comercial da MktOn. Os funis representam processos e as etapas mostram a posição atual de cada lead.",
      purpose: "Dar uma visão operacional do processo comercial e conectar leads, atendimento, automações e tarefas.",
      capabilities: ["Criar e organizar funis e etapas", "Mover e cadastrar leads", "Configurar ações por etapa", "Relacionar SalesBots, agentes, formulários, produtos e Workflow quando disponíveis"],
      location: "CRM → Funis de venda.", prerequisites: ["Acesso ao módulo CRM", "Permissão do usuário para operar o CRM"],
      steps: ["Abra CRM → Funis de venda", "Selecione ou crie o funil", "Organize as etapas", "Cadastre ou mova leads", "Configure automações somente depois de validar o fluxo manual"],
      connections: ["Leads e Públicos", "Automações e SalesBot", "Inbox", "Produtos", "Workflow", "Dashboard"],
      examples: ["Funil de qualificação", "Funil de vendas", "Pós-venda e acompanhamento"],
      limitations: ["Ações visíveis dependem das permissões e integrações do workspace", "Não configure automação antes de validar as etapas corretas"],
      troubleshooting: ["Confirme o workspace ativo", "Confira permissões", "Valide se o funil e a etapa usados pela automação são os corretos"], related: ["leads", "crm-automacoes", "inbox"]
    })
  },
  {
    id: "leads", title: "Leads e Públicos", category: "Comercial", route: "/crm/leads", status: "available",
    summary: "Centralize contatos, crie leads manualmente e monte segmentos operacionais.", keywords: ["lead", "público", "segmento", "contato"],
    article: article({ whatIs: "Leads reúne os contatos comerciais; Públicos cria segmentos desses contatos para ações operacionais e de mídia.", purpose: "Organizar pessoas e grupos para atendimento, CRM, reativação e campanhas.", capabilities: ["Listar, buscar e criar leads", "Detectar duplicidades", "Associar lead a origem, funil e etapa", "Criar e atualizar públicos", "Usar públicos em ações suportadas"], location: "Leads → Todos os Leads e Leads → Públicos.", prerequisites: ["CRM liberado", "Permissão de acesso"], steps: ["Abra Leads", "Busque ou cadastre o contato", "Defina origem/funil/etapa quando necessário", "Use Públicos para segmentações recorrentes"], connections: ["CRM", "Inbox", "Meta Ads", "SalesBot", "Agentes de IA"], examples: ["Público de leads parados", "Lista de clientes", "Segmento para reativação"], limitations: ["Exportações e disparos dependem das integrações correspondentes"], troubleshooting: ["Confira filtros e workspace", "Revise permissões", "Confirme se a integração exigida está conectada"], related: ["crm-funis", "inbox", "crm-automacoes"] })
  },
  {
    id: "empresas", title: "Empresas", category: "Comercial", route: "/crm/empresas", status: "available",
    summary: "Agrupe contatos por empresa e mantenha ficha, CNPJ, contatos e responsável principal.", keywords: ["empresa", "cnpj", "b2b", "contatos"],
    article: article({ whatIs: "Empresas organiza organizações relacionadas aos leads.", purpose: "Dar contexto B2B e reunir os contatos que pertencem à mesma empresa.", capabilities: ["Cadastrar ficha e CNPJ", "Adicionar logo/site/telefone", "Associar membros", "Definir contato principal e funções"], location: "CRM → Empresas.", prerequisites: ["CRM liberado"], steps: ["Crie a empresa", "Preencha os dados", "Associe os contatos", "Defina o contato principal"], connections: ["Leads", "Arquivos"], examples: ["Conta B2B com vários decisores"], limitations: ["A empresa organiza contatos; não substitui o funil comercial"], troubleshooting: ["Confira se o lead já está associado", "Revise o workspace ativo"], related: ["leads", "arquivos"] })
  },
  {
    id: "produtos", title: "Produtos e Catálogos", category: "Comercial", route: "/crm/produtos", status: "available",
    summary: "Estruture catálogos e produtos com SKU, valores, categorias e imagens.", keywords: ["produto", "catálogo", "sku", "preço"],
    article: article({ whatIs: "Produtos é a central de catálogos comerciais do CRM.", purpose: "Padronizar o que é vendido e permitir que outros fluxos trabalhem com produtos identificáveis.", capabilities: ["Criar catálogos", "Cadastrar produtos e SKU", "Organizar categorias", "Importar/exportar catálogo", "Controlar visibilidade"], location: "CRM → Produtos.", prerequisites: ["CRM liberado"], steps: ["Crie ou selecione um catálogo", "Cadastre os produtos", "Revise SKU, preço e categoria", "Use o catálogo nos fluxos compatíveis"], connections: ["CRM", "Dashboard e relatórios quando há venda associada"], examples: ["Planos de assinatura", "Catálogo de serviços"], limitations: ["Produto só gera métrica comercial quando existe vínculo real com a operação/venda"], troubleshooting: ["Confira catálogo ativo", "Valide SKU e preço", "Revise a associação usada no fluxo"], related: ["crm-funis", "dashboard"] })
  },
  {
    id: "arquivos", title: "Arquivos", category: "Comercial", route: "/crm/arquivos", status: "available",
    summary: "Visualize arquivos recebidos ou gerados, agrupados por cliente e empresa.", keywords: ["arquivo", "documento", "imagem", "pdf", "drive"],
    article: article({ whatIs: "Arquivos centraliza materiais do workspace relacionados a clientes e empresas.", purpose: "Evitar arquivos espalhados e facilitar a consulta contextual.", capabilities: ["Listar por cliente/empresa", "Filtrar tipo", "Buscar", "Baixar arquivos disponíveis"], location: "CRM → Arquivos.", prerequisites: ["Acesso ao CRM", "Integração correspondente quando o arquivo vem de fonte externa"], steps: ["Abra Arquivos", "Use busca/filtro", "Expanda o cliente ou empresa", "Abra ou baixe o material"], connections: ["Leads", "Empresas", "Google Drive", "OneDrive/SharePoint quando conectados"], examples: ["Propostas", "Imagens recebidas", "Documentos do cliente"], limitations: ["A disponibilidade depende da origem e das permissões da integração"], troubleshooting: ["Confira o agrupamento correto", "Valide a conexão externa", "Atualize a autorização da fonte se necessário"], related: ["empresas", "integracoes"] })
  },
  {
    id: "inbox", title: "Inbox", category: "Atendimento", route: "/inbox/leads", status: "requires_integration",
    summary: "Central de conversas com Leads, Equipe, Suporte e E-mail.", keywords: ["inbox", "whatsapp", "chat", "e-mail", "atendimento"],
    article: article({ whatIs: "Inbox é a central de comunicação da operação, separando conversas com leads, equipe, suporte e e-mail.", purpose: "Atender e colaborar sem perder o contexto do CRM.", capabilities: ["Conversar com leads", "Enviar mensagens e mídia nos canais suportados", "Consultar contexto do lead", "Comunicação de equipe e suporte", "Operar e-mail quando conectado"], location: "Inbox Chat no menu lateral.", prerequisites: ["Canal correspondente conectado em Integrações", "Permissão do usuário"], steps: ["Conecte o canal", "Abra Inbox", "Selecione a conversa", "Valide o lead e o contexto antes de responder"], connections: ["Leads", "CRM", "WhatsApp", "E-mail", "Agentes de IA e SalesBot conforme configuração"], examples: ["Atendimento WhatsApp", "Handoff para humano", "Comunicação interna"], limitations: ["Recursos dependem do canal conectado e de suas permissões"], troubleshooting: ["Confira status da integração", "Atualize/sincronize o canal", "Confirme que está no workspace correto"], related: ["integracoes", "leads", "crm-automacoes"] })
  },
  {
    id: "crm-automacoes", title: "Automações e SalesBot", category: "Automação e IA", route: "/crm/automacoes", status: "available",
    summary: "Crie automações, gatilhos e SalesBots com fluxos estruturados.", keywords: ["automação", "salesbot", "gatilho", "bot", "webhook"],
    article: article({ whatIs: "Automações reúne gatilhos e SalesBots; SalesBot executa um fluxo estruturado em blocos.", purpose: "Automatizar ações repetitivas mantendo regras e caminhos previsíveis.", capabilities: ["Criar e duplicar SalesBots", "Usar gatilhos", "Criar blocos e condições", "Conectar formulários, Tracking e canais quando compatíveis", "Chamar Make, n8n, Zapier ou Webhook quando a conexão existe"], location: "CRM → Automações.", prerequisites: ["CRM liberado", "Integrações conectadas para ações externas/canais"], steps: ["Defina o objetivo", "Escolha o gatilho", "Monte o fluxo", "Configure referências reais", "Teste em cenário controlado", "Ative somente após validar"], connections: ["CRM/Funis", "Inbox", "Formulários", "Tracking", "Make/n8n/Zapier/Webhook", "Agentes de IA"], examples: ["Follow-up", "Pré-atendimento", "Reativação", "Handoff"], limitations: ["Cada bloco depende das integrações e referências configuradas"], troubleshooting: ["Confira gatilho", "Revise IDs/referências", "Valide canal e integração", "Consulte logs disponíveis"], related: ["crm-funis", "inbox", "integracoes", "gestor-crm"] })
  },
  {
    id: "gestor-crm", title: "Gestor de CRM / IA", category: "Automação e IA", route: "/crm/agente-ia", status: "admin_only",
    summary: "Crie agentes de IA que leem e operam o CRM dentro de regras e níveis de autonomia.", keywords: ["ia", "agente", "gestor crm", "autonomia"],
    article: article({ whatIs: "O Gestor de CRM é a área de agentes de IA ligados à operação comercial.", purpose: "Permitir leitura, sugestão e atuação no CRM de acordo com autonomia e regras configuradas.", capabilities: ["Criar e duplicar agentes", "Definir regras", "Configurar horários e autonomia", "Acompanhar tarefas e estado do agente"], location: "CRM → Gestor de CRM (área administrativa).", prerequisites: ["Perfil administrativo", "Provider de IA/configuração necessária"], steps: ["Crie o agente", "Defina o papel e regras", "Escolha a autonomia", "Configure horários/tarefas", "Teste antes de ampliar a autonomia"], connections: ["CRM/Funis", "Leads", "Automações", "Inbox"], examples: ["Leitura do funil", "Sugestão de próxima ação", "Rotina de acompanhamento"], limitations: ["A autonomia real deve respeitar permissões e funções implementadas"], troubleshooting: ["Confira acesso administrativo", "Revise regras e provider", "Reduza autonomia durante diagnóstico"], related: ["crm-funis", "crm-automacoes", "integracoes"] })
  },
  {
    id: "workflow", title: "Fluxo de Trabalho", category: "Produtividade", route: "/fluxo-trabalho", status: "requires_access",
    summary: "Kanban de tarefas por etapas, setores, responsáveis, prazos, revisão e gamificação.", keywords: ["workflow", "kanban", "tarefas", "setor", "ranking"],
    article: article({ whatIs: "O Fluxo de Trabalho organiza tarefas internas em pipelines/Kanbans.", purpose: "Transformar demandas da operação em execução acompanhável por equipe e setor.", capabilities: ["Criar pipelines e etapas", "Criar tarefas, checklist e comentários", "Responsáveis e setores", "Timer, prazos e revisão", "Métricas, automações e Funcionário do mês"], location: "Módulo Fluxo de Trabalho.", prerequisites: ["Módulo liberado no plano", "Permissões da equipe"], steps: ["Escolha/crie o pipeline", "Organize etapas", "Cadastre setores e responsáveis", "Crie tarefas", "Acompanhe revisão e métricas"], connections: ["Tarefas da operação", "CRM/IA quando o fluxo correspondente cria tarefas"], examples: ["Kanban do comercial", "Operação por setor", "Revisão de entregas"], limitations: ["Ações administrativas dependem do perfil"], troubleshooting: ["Confira pipeline e setor", "Revise responsável/permissão", "Cheque automação e histórico da tarefa"], related: ["calendario", "dashboard"] })
  },
  {
    id: "calendario", title: "Calendário", category: "Produtividade", route: "/calendario", status: "available",
    summary: "Organize tarefas, reuniões e eventos em dia, semana ou mês.", keywords: ["calendário", "reunião", "evento", "tarefa", "google"],
    article: article({ whatIs: "Calendário é a agenda operacional do workspace.", purpose: "Visualizar e criar compromissos e tarefas com data.", capabilities: ["Visualização dia/semana/mês", "Criar e excluir eventos/tarefas", "Participantes, localização, link e lembrete", "Sincronização Google quando configurada"], location: "Calendário no menu lateral.", prerequisites: ["Workspace ativo", "Google conectado para sincronização externa"], steps: ["Escolha a visualização", "Crie o evento", "Defina data e detalhes", "Ative sincronização somente se a conta Google estiver conectada"], connections: ["Tarefas", "Google Calendar", "Notas"], examples: ["Reunião com cliente", "Follow-up agendado"], limitations: ["Sync externo depende de OAuth e escopos válidos"], troubleshooting: ["Confira fuso horário", "Valide Google em Integrações", "Revise data/horário"], related: ["notas", "integracoes", "workflow"] })
  },
  {
    id: "notas", title: "Notas", category: "Produtividade", route: "/notas", status: "available",
    summary: "Crie notas de texto e checklists, agrupe, fixe, arquive e transforme conteúdo em tarefa.", keywords: ["nota", "checklist", "lembrete", "tarefa"],
    article: article({ whatIs: "Notas é o mural pessoal/operacional do workspace.", purpose: "Registrar informação rápida sem precisar criar imediatamente uma estrutura maior.", capabilities: ["Texto e listas", "Grupos/pastas", "Fixar e arquivar", "Busca", "Transformar em tarefa"], location: "Notas no menu lateral.", prerequisites: ["Acesso ao workspace"], steps: ["Crie uma nota", "Escolha texto ou checklist", "Organize em grupo", "Fixe ou transforme em tarefa quando necessário"], connections: ["Tarefas/Calendário"], examples: ["Checklist de reunião", "Ideias e pendências"], limitations: ["Notas não substituem o Workflow para gestão estruturada"], troubleshooting: ["Use busca/arquivadas", "Confira grupo e workspace"], related: ["calendario", "workflow"] })
  },
  {
    id: "tracking", title: "Tracking & Analytics", category: "Dados", route: "/modulos/tracking", status: "requires_access",
    summary: "Instale o pixel MktOn, gere UTMs, acompanhe eventos, fontes, conversões e diagnóstico.", keywords: ["tracking", "pixel", "utm", "evento", "conversão"],
    article: article({ whatIs: "Tracking registra a jornada de aquisição usando pixel, eventos, UTMs, fontes e conversões.", purpose: "Relacionar origem, campanha e comportamento com os resultados da operação.", capabilities: ["Instalar pixel", "Cadastrar sites", "Ver fontes e eventos", "Gerar UTMs", "Mapear eventos do site", "Acompanhar conversões e diagnóstico"], location: "Módulos → Tracking & Analytics.", prerequisites: ["Acesso ao Tracking", "Site/domínio configurado e pixel instalado para eventos web"], steps: ["Adicione o site", "Instale o pixel", "Faça um teste real", "Valide o evento em Diagnóstico", "Use UTMs nas campanhas", "Configure conversões"], connections: ["CRM", "Dashboard", "Gestor de Tráfego", "Meta/Google e canais suportados"], examples: ["Origem do cadastro", "Campanha que gerou venda"], limitations: ["Sem pixel/evento/UTM corretos não existe atribuição confiável"], troubleshooting: ["Confira domínio", "Teste o pixel", "Abra Diagnóstico e logs", "Revise nome/mapeamento do evento"], related: ["dashboard", "gestor-trafego", "integracoes"] })
  },
  {
    id: "dashboard", title: "Dashboard", category: "Dados", route: "/painel", status: "available",
    summary: "Painel executivo que combina CRM, mídia, Tracking, Social e operação quando as fontes estão disponíveis.", keywords: ["dashboard", "kpi", "métrica", "relatório"],
    article: article({ whatIs: "Dashboard é a camada executiva de leitura da operação.", purpose: "Concentrar KPIs e permitir drilldown sem inventar dados quando uma fonte não está disponível.", capabilities: ["KPIs comerciais", "Dados V4 conectados", "Drilldowns", "Período", "Tracking quando liberado", "Mídia/Social/Workflow conforme módulos"], location: "Dashboard no menu principal.", prerequisites: ["Dados e módulos correspondentes configurados"], steps: ["Escolha o período", "Leia os indicadores", "Abra drilldowns", "Quando um bloco estiver vazio, valide a fonte correspondente"], connections: ["CRM", "Tracking", "Gestor de Tráfego", "Social Media", "Workflow", "Produtos"], examples: ["Acompanhar vendas e mídia no mesmo período"], limitations: ["Blocos dependem dos módulos e integrações liberados"], troubleshooting: ["Confirme período", "Valide fonte e módulo", "Cheque regras de KPI/funil"], related: ["tracking", "gestor-trafego", "social-media", "workflow"] })
  },
  {
    id: "gestor-trafego", title: "Gestor de Tráfego IA", category: "Marketing", route: "/modulos/gestor-trafego", status: "requires_integration",
    summary: "Leia e opere mídia paga com foco atual em Meta Ads e recursos auxiliares do gestor.", keywords: ["tráfego", "meta ads", "campanha", "criativo", "roas"],
    article: article({ whatIs: "O Gestor de Tráfego concentra mídia paga e ferramentas auxiliares de análise/produção.", purpose: "Unir campanhas, KPIs, criativos e decisões de mídia em uma área operacional.", capabilities: ["Meta Ads conectado", "Visão de campanhas e KPIs", "Criativos e relatórios", "Sugestões/recursos de IA conforme configuração", "Áreas auxiliares de automações, estratégias, personas, públicos e copies"], location: "Módulos → Gestor de Tráfego IA.", prerequisites: ["Módulo liberado", "Conta Meta conectada e ativos sincronizados"], steps: ["Conecte Meta", "Selecione/sincronize os ativos", "Valide os dados", "Use filtros e relatórios", "Só execute alterações depois de conferir a conta/campanha"], connections: ["Meta", "Tracking", "Dashboard", "CRM"], examples: ["Comparar gasto e resultado", "Auditar criativos"], limitations: ["No código atual Meta está marcada como fonte pronta; Google/TikTok/Pinterest/LinkedIn não devem ser apresentados como equivalentes prontos"], troubleshooting: ["Confira conta de anúncios", "Sincronize ativos", "Valide Tracking quando usar atribuição"], related: ["tracking", "dashboard", "integracoes"] })
  },
  {
    id: "social-media", title: "Social Media", category: "Marketing", route: "/modulos/social-media", status: "requires_access",
    summary: "Calendário editorial, ideias, marca, produção de posts, chat e KPIs conforme o nível de acesso.", keywords: ["social", "post", "calendário editorial", "imagem", "ideogram"],
    article: article({ whatIs: "Social Media é a área de conteúdo da MktOn.", purpose: "Planejar e produzir conteúdo mantendo calendário, ideias e contexto da marca.", capabilities: ["KPIs em modo leitura quando o plano libera", "Calendário editorial", "Banco de ideias", "Contexto de marca", "Criação/edição de posts", "Chat e geração de imagem quando provider suportado está conectado"], location: "Módulos → Social Media.", prerequisites: ["Entitlement correspondente", "Provider de IA/imagem conectado para geração"], steps: ["Configure a marca", "Escolha a área de conteúdo", "Planeje calendário/ideias", "Gere ou edite o post", "Revise antes de publicar/agendar"], connections: ["Integrações de IA/imagem", "Dashboard", "Calendário editorial"], examples: ["Criar calendário mensal", "Gerar arte a partir de briefing"], limitations: ["O acesso varia por plano; geração visual depende do provider"], troubleshooting: ["Confira entitlement", "Valide provider em Integrações", "Leia o erro exibido no próprio card quando a geração falhar"], related: ["integracoes", "dashboard"] })
  },
  {
    id: "integracoes", title: "Integrações", category: "Administração", route: "/integracoes", status: "available",
    summary: "Conecte Ads, Social, IA, automação, arquivos, e-mail e outros serviços suportados.", keywords: ["integração", "oauth", "whatsapp", "openai", "google", "microsoft", "make", "n8n", "zapier"],
    article: article({ whatIs: "Integrações é o catálogo central de conectores da MktOn.", purpose: "Fazer a ponte entre o workspace e provedores externos sem misturar as credenciais e estados de cada serviço.", capabilities: ["Catálogo por categoria", "Status de conexão", "Painéis específicos por provider", "WhatsApp Web/Evolution e WhatsApp Cloud", "Meta e canais sociais", "IA e imagem", "Make/n8n/Zapier/Webhook", "Google, Microsoft, arquivos e e-mail conforme disponibilidade"], location: "Integrações no menu principal.", prerequisites: ["Conta/credencial válida do serviço", "Configuração global da MktOn quando o provider exige app/OAuth central"], steps: ["Abra Integrações", "Escolha o provider", "Leia o requisito", "Autorize/conecte", "Confirme o status", "Depois teste no módulo consumidor"], connections: ["Inbox", "Tracking", "Gestor de Tráfego", "Social Media", "SalesBot", "Arquivos", "Calendário"], examples: ["Conectar Meta", "Conectar Google", "Adicionar n8n"], limitations: ["A lista visível depende do perfil e do status técnico; conectores em preparo não devem ser tratados como prontos"], troubleshooting: ["Confira status", "Refaça OAuth quando expirado", "Valide configuração global quando indicado", "Teste o consumidor final"], related: ["inbox", "tracking", "gestor-trafego", "social-media"] })
  },
  {
    id: "configuracoes", title: "Configurações, Equipe e Segurança", category: "Administração", route: "/configuracoes", status: "available",
    summary: "Gerencie perfil, empresa, equipe, expediente, plano, segurança, sessões, notificações e preferências.", keywords: ["configurações", "equipe", "permissão", "plano", "segurança", "sessão"],
    article: article({ whatIs: "Configurações reúne a administração da conta e do workspace.", purpose: "Controlar identidade, pessoas, acesso, faturamento e segurança em um único lugar.", capabilities: ["Perfil e empresa", "Equipe, convites e papéis", "Expediente", "Plano e assinatura", "Segurança e sessões", "Notificações e preferências", "MFA/passkeys e controles de segurança quando disponíveis"], location: "Configurações no menu principal.", prerequisites: ["Algumas ações exigem administrador"], steps: ["Escolha o grupo", "Abra a subseção", "Faça a alteração", "Revise impacto em acesso/segurança antes de salvar"], connections: ["Permissões de todos os módulos", "Planos/entitlements", "Sessões e dispositivos"], examples: ["Adicionar funcionário", "Alterar permissão", "Revogar sessão"], limitations: ["Usuários não administradores têm escopo reduzido"], troubleshooting: ["Confirme seu papel", "Revise permissões do usuário", "Verifique plano/entitlement quando uma área estiver bloqueada"], related: ["integracoes", "dashboard"] })
  },
  {
    id: "faculdade", title: "Faculdade Vanessa Simoni", category: "Aprendizado", route: "/faculdade", status: "available",
    summary: "Central de treinamento em vídeo/texto para clientes aprenderem a plataforma e marketing.", keywords: ["faculdade", "curso", "aula", "treinamento"],
    article: article({ whatIs: "A Faculdade MktOn é a área educacional dos clientes finais.", purpose: "Ensinar uso da plataforma e temas de marketing em trilhas de aprendizado.", capabilities: ["Módulos de treinamento", "Aulas em vídeo/texto/checklist", "Conteúdo de onboarding e temas da operação"], location: "Conta → Faculdade MktOn.", prerequisites: ["Acesso do usuário ao conteúdo correspondente"], steps: ["Abra a Faculdade", "Escolha o módulo", "Siga as aulas na sequência proposta"], connections: ["Documentação para consulta escrita", "FAQ para dúvidas rápidas"], examples: ["Configurando a plataforma"], limitations: ["Faculdade MktOn é para clientes finais; a Faculdade Partners é uma frente separada do ecossistema Partners"], troubleshooting: ["Confira acesso ao módulo/aula", "Use Documentação para passos escritos"], related: ["documentacao"] })
  }
];

export const DOCUMENTATION_CATEGORIES = Array.from(new Set(DOCUMENTATION_MODULES.map((item) => item.category)));

export function getDocumentationModule(id: string) {
  return DOCUMENTATION_MODULES.find((item) => item.id === id) ?? null;
}

export function filterDocumentationModules(term: string, category?: DocumentationCategory | null) {
  const q = term.trim().toLocaleLowerCase("pt-BR");
  return DOCUMENTATION_MODULES.filter((item) => {
    if (category && item.category !== category) return false;
    if (!q) return true;
    const haystack = [item.title, item.summary, item.category, ...item.keywords, ...item.article.capabilities, ...item.article.connections].join(" ").toLocaleLowerCase("pt-BR");
    return haystack.includes(q);
  });
}
