import type { DocumentationModule } from "@/lib/documentation-catalog";

const guide = (input: DocumentationModule) => input;

export const PUBLIC_DOCUMENTATION_MODULES: DocumentationModule[] = [
  guide({
    id: "crm-automacoes", title: "Bots, Automações e SalesBot", category: "Automação e IA", route: "/crm/automacoes", status: "available",
    summary: "Aprenda a criar, testar, duplicar e ativar bots e automações sem perder o controle do fluxo.",
    keywords: ["bot", "salesbot", "automação", "gatilho", "follow-up", "duplicar"],
    article: {
      whatIs: "A área de Automações organiza regras e SalesBots que executam ações quando um gatilho acontece.",
      purpose: "Automatizar atendimento, follow-up, reativação e tarefas repetitivas com um fluxo visual e controlável.",
      capabilities: ["Criar uma automação", "Criar e duplicar SalesBots", "Definir gatilhos", "Adicionar mensagens, esperas, condições e ações", "Ativar ou desativar um fluxo", "Editar um fluxo existente"],
      location: "CRM → Automações.",
      prerequisites: ["Ter acesso ao CRM", "Ter o canal ou integração exigida pela ação já conectado", "Saber qual evento deve iniciar o fluxo"],
      steps: [
        "Abra CRM → Automações e escolha se quer criar uma automação ou um SalesBot.",
        "Clique em criar e dê um nome que explique o objetivo do fluxo.",
        "Escolha o gatilho: por exemplo, entrada em etapa, formulário, mensagem recebida ou outra opção disponível na tela.",
        "Adicione os blocos na ordem em que devem executar: mensagem, espera, condição, alteração de etapa, tarefa ou integração.",
        "Abra cada bloco e preencha os campos obrigatórios mostrados no painel lateral ou modal.",
        "Quando quiser reaproveitar um fluxo, use Duplicar e edite somente o que muda.",
        "Faça um teste com um lead controlado antes de ativar.",
        "Depois do teste, volte ao fluxo e clique em Ativar. Para interromper novas execuções, desative o fluxo."
      ],
      connections: [],
      examples: ["Follow-up após lead parar de responder", "Pré-atendimento automático", "Reativação de base", "Criar tarefa depois de uma resposta"],
      limitations: ["Não ative um fluxo sem testar o gatilho e o destino", "Ações externas só funcionam quando o canal correspondente está conectado"],
      troubleshooting: [], related: []
    }
  }),
  guide({
    id: "gestor-crm", title: "Agentes IA", category: "Automação e IA", route: "/crm/agente-ia", status: "requires_access",
    summary: "Configure agentes IA, suas instruções, autonomia, horários e atuação na operação.",
    keywords: ["agente ia", "ia", "crm", "autonomia", "instruções"],
    article: {
      whatIs: "Agentes IA são perfis configuráveis que ajudam a executar ou acompanhar atividades da operação conforme as permissões escolhidas.",
      purpose: "Dar contexto, regras e limites claros para a IA trabalhar de forma previsível.",
      capabilities: ["Criar e duplicar agente", "Definir objetivo e instruções", "Configurar regras de atuação", "Escolher autonomia", "Definir horários", "Acompanhar estado e tarefas"],
      location: "CRM → Agentes IA / Gestor de CRM.",
      prerequisites: ["Ter acesso administrativo à configuração do agente", "Ter um provedor de IA exigido pelo workspace configurado"],
      steps: [
        "Abra CRM → Agentes IA e clique em Criar agente.",
        "Escolha o nome e descreva claramente o papel daquele agente.",
        "Preencha as instruções com o que ele deve fazer, o que não deve fazer e quando deve pedir ajuda.",
        "Configure as regras e o nível de autonomia disponível na tela.",
        "Defina os horários em que o agente pode atuar, quando essa opção estiver habilitada.",
        "Revise quais áreas ou tarefas o agente poderá acessar.",
        "Salve e faça um teste com um cenário simples antes de aumentar a autonomia.",
        "Use Duplicar quando quiser criar outro agente parecido sem refazer toda a configuração."
      ],
      connections: [],
      examples: ["Agente para acompanhar funil", "Agente para sugerir próxima ação", "Agente para rotinas comerciais"],
      limitations: ["Comece com autonomia menor e aumente somente depois de testar", "O agente não substitui permissões e integrações que o workspace não possui"],
      troubleshooting: [], related: []
    }
  }),
  guide({
    id: "tracking", title: "Tracking", category: "Dados", route: "/modulos/tracking", status: "requires_access",
    summary: "Configure site, pixel, UTMs, eventos e conversões para acompanhar a origem dos resultados.",
    keywords: ["tracking", "pixel", "utm", "evento", "conversão", "site"],
    article: {
      whatIs: "Tracking registra visitas e eventos para ajudar a entender de onde vieram cadastros e conversões.",
      purpose: "Acompanhar a jornada de aquisição com dados reais de site, campanha e evento.",
      capabilities: ["Cadastrar site", "Instalar o pixel MktOn", "Gerar UTMs", "Visualizar eventos recebidos", "Definir conversões", "Acompanhar origem e resultado"],
      location: "Módulos → Tracking.",
      prerequisites: ["Ter o módulo Tracking liberado", "Ter acesso ao site onde o pixel será instalado"],
      steps: [
        "Abra Tracking e entre na área de Sites.",
        "Clique em adicionar site e informe o domínio correto.",
        "Copie o código do pixel mostrado pela MktOn e instale no site conforme a opção disponível para sua plataforma.",
        "Abra o site em uma nova aba e faça uma navegação de teste.",
        "Volte ao Tracking e confirme se os eventos começaram a aparecer na lista de eventos recebidos.",
        "Use o Gerador de UTM para criar URLs de campanha e mantenha os campos padronizados.",
        "Na área de Conversões, escolha qual evento deve ser tratado como resultado importante.",
        "Depois de configurar, faça um cadastro ou ação real de teste e confirme se a conversão aparece no painel."
      ],
      connections: [],
      examples: ["Descobrir qual campanha gerou um cadastro", "Medir conversão de formulário", "Usar UTMs diferentes por campanha"],
      limitations: ["Sem pixel instalado ou UTM correta, a origem pode ficar incompleta", "Não considere uma conversão validada sem fazer pelo menos um teste real"],
      troubleshooting: [], related: []
    }
  }),
  guide({
    id: "gestor-trafego", title: "Gestor de Tráfego", category: "Marketing", route: "/modulos/gestor-trafego", status: "requires_integration",
    summary: "Use o Gestor de Tráfego para acompanhar mídia, trabalhar criativos, públicos e automações com segurança.",
    keywords: ["gestor de tráfego", "meta", "campanha", "criativo", "público", "automação"],
    article: {
      whatIs: "O Gestor de Tráfego reúne leitura de mídia e ferramentas para organizar decisões, criativos, públicos e automações.",
      purpose: "Facilitar o trabalho de mídia sem precisar navegar por várias áreas para cada análise.",
      capabilities: ["Selecionar conta de anúncios", "Consultar campanhas e métricas", "Trabalhar criativos", "Criar personas e públicos", "Usar estratégias", "Criar e duplicar automações executáveis"],
      location: "Módulos → Gestor de Tráfego.",
      prerequisites: ["Ter o módulo liberado", "Ter a conta de mídia suportada conectada e sincronizada"],
      steps: [
        "Abra o Gestor de Tráfego e confirme qual conta de anúncios está selecionada.",
        "Use a visão de campanhas para conferir gasto, entrega e resultados disponíveis.",
        "Abra Central de Criativos para consultar ou preparar os criativos usados na operação.",
        "Use Personas, Públicos e Estratégias quando precisar organizar uma nova abordagem de campanha.",
        "Em Automações Executáveis, escolha criar uma automação manual ou com IA.",
        "Ao editar uma automação, selecione as campanhas, conjuntos ou anúncios que ela deve acompanhar.",
        "Use Duplicar para reaproveitar uma automação e alterar somente as condições necessárias.",
        "Revise qualquer ação que mexa em orçamento, status ou ativos antes de confirmar."
      ],
      connections: [],
      examples: ["Acompanhar campanha com queda de performance", "Duplicar uma regra para vários conjuntos", "Comparar criativos"],
      limitations: ["Só execute alterações depois de confirmar a conta e o ativo selecionado", "Métricas comerciais dependem de atribuição comprovada"],
      troubleshooting: [], related: []
    }
  }),
  guide({
    id: "social-media", title: "Social Media", category: "Marketing", route: "/modulos/social-media", status: "requires_access",
    summary: "Planeje conteúdo, use Banco de Ideias, crie posts e imagens e organize o calendário editorial.",
    keywords: ["social media", "post", "banco de ideias", "imagem", "calendário", "conteúdo"],
    article: {
      whatIs: "Social Media é o espaço de planejamento e produção de conteúdo da MktOn.",
      purpose: "Centralizar ideias, posts, contexto da marca e calendário editorial.",
      capabilities: ["Configurar contexto da marca", "Gerar ideias", "Criar post", "Criar carrossel", "Gerar imagem quando houver provider conectado", "Organizar calendário editorial"],
      location: "Módulos → Social Media.",
      prerequisites: ["Ter acesso ao módulo", "Ter o provedor de IA ou imagem correspondente conectado quando quiser usar geração"],
      steps: [
        "Abra Social Media e configure primeiro as informações da marca que serão usadas como contexto.",
        "Entre no Banco de Ideias para gerar ou registrar temas de conteúdo.",
        "Escolha uma ideia e use a ação de criar conteúdo quando quiser transformá-la em post.",
        "Em Novo Post, escolha o formato e preencha o briefing do conteúdo.",
        "Se for carrossel, revise cada slide e o texto antes de gerar as artes.",
        "Quando usar geração de imagem, confirme se o provider de imagem aparece conectado.",
        "Revise texto e arte antes de salvar ou levar para o calendário.",
        "Use o calendário editorial para organizar quando cada conteúdo deve ser produzido ou publicado."
      ],
      connections: [],
      examples: ["Gerar calendário mensal", "Criar carrossel a partir de uma ideia", "Produzir arte para um post"],
      limitations: ["A geração visual depende de um provider compatível conectado", "Sempre revise texto e imagem antes de publicar"],
      troubleshooting: [], related: []
    }
  }),
  guide({
    id: "workflow", title: "Fluxo de Trabalho", category: "Produtividade", route: "/fluxo-trabalho", status: "requires_access",
    summary: "Organize tarefas em Kanban, setores, etapas, responsáveis, prazos e revisão.",
    keywords: ["workflow", "fluxo de trabalho", "kanban", "tarefa", "setor"],
    article: {
      whatIs: "Fluxo de Trabalho é o Kanban operacional da equipe.",
      purpose: "Transformar demandas em tarefas acompanháveis, com etapa, responsável e prazo.",
      capabilities: ["Criar e organizar pipelines", "Criar tarefas", "Mover tarefa entre etapas", "Definir setor e responsável", "Adicionar checklist e comentários", "Acompanhar prazos e revisão"],
      location: "Fluxo de Trabalho no menu lateral.",
      prerequisites: ["Ter o módulo liberado", "Ter setores e usuários da equipe configurados quando for atribuir tarefas"],
      steps: [
        "Abra Fluxo de Trabalho e escolha o Kanban que deseja usar.",
        "Se necessário, crie ou organize as etapas do processo.",
        "Clique em Nova tarefa e preencha título, descrição e prazo.",
        "Escolha o setor e o responsável quando a tarefa precisar de um dono definido.",
        "Adicione checklist para atividades que tenham vários passos.",
        "Arraste a tarefa entre as etapas conforme o trabalho avançar.",
        "Abra a tarefa para comentar, revisar o histórico ou ajustar responsável e prazo.",
        "Use as métricas do módulo para acompanhar volume, atrasos e execução da equipe."
      ],
      connections: [],
      examples: ["Kanban comercial", "Produção de conteúdo", "Processo de implantação", "Revisão de entrega"],
      limitations: ["Defina etapas simples antes de criar automações", "Evite criar vários Kanbans para o mesmo processo sem necessidade"],
      troubleshooting: [], related: []
    }
  }),
  guide({
    id: "notas", title: "Notas", category: "Produtividade", route: "/notas", status: "available",
    summary: "Crie notas e checklists, organize em grupos, fixe, arquive e transforme em tarefa.",
    keywords: ["notas", "checklist", "grupo", "arquivar", "tarefa"],
    article: {
      whatIs: "Notas é o espaço rápido para registrar informações, ideias e listas dentro da MktOn.",
      purpose: "Guardar informações operacionais sem precisar criar uma tarefa completa imediatamente.",
      capabilities: ["Criar nota de texto", "Criar checklist", "Organizar por grupo", "Fixar nota", "Arquivar", "Buscar", "Transformar em tarefa"],
      location: "Notas no menu lateral.",
      prerequisites: ["Estar dentro do workspace correto"],
      steps: [
        "Abra Notas e clique em criar nova nota.",
        "Escolha entre texto livre ou checklist, conforme o que precisa registrar.",
        "Digite o conteúdo e salve.",
        "Use grupos para separar assuntos como reuniões, clientes ou pendências.",
        "Fixe uma nota quando quiser mantê-la em destaque.",
        "Use Arquivar para tirar uma nota concluída da visualização principal sem apagar.",
        "Use a busca para localizar conteúdo antigo.",
        "Quando uma anotação virar trabalho executável, use Transformar em tarefa e complete os dados da tarefa."
      ],
      connections: [],
      examples: ["Checklist de reunião", "Ideias de campanha", "Pendências rápidas", "Resumo de cliente"],
      limitations: ["Use Fluxo de Trabalho quando precisar de responsável, prazo e acompanhamento estruturado"],
      troubleshooting: [], related: []
    }
  }),
];
