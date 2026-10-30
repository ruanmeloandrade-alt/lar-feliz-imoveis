export type DocumentationConnection = {
  id: string;
  title: string;
  purpose: string;
  flow: string[];
  notes: string[];
};

export type DocumentationRecipe = {
  id: string;
  title: string;
  objective: string;
  modules: string[];
  prerequisites: string[];
  steps: string[];
  validation: string[];
};

export type DocumentationDiagnostic = {
  id: string;
  symptom: string;
  checks: string[];
  escalateWhen: string;
};

export const DOCUMENTATION_CONNECTIONS: DocumentationConnection[] = [
  {
    id: "form-lead-crm-automation",
    title: "Formulário → Lead → CRM → Automação",
    purpose: "Transformar uma captação em um lead organizado e iniciar o processo comercial configurado.",
    flow: ["Formulário", "Lead", "Funil / etapa", "Automação ou SalesBot"],
    notes: ["Teste a submissão antes de divulgar o formulário.", "O destino e o gatilho precisam apontar para referências reais do workspace."],
  },
  {
    id: "inbox-lead-crm",
    title: "Inbox → Lead → CRM → IA / SalesBot",
    purpose: "Atender uma conversa sem perder o contexto comercial do contato.",
    flow: ["Canal conectado", "Inbox", "Lead", "CRM", "Agente de IA ou SalesBot quando configurado"],
    notes: ["O canal precisa estar conectado em Integrações.", "IA e SalesBot não substituem a validação do funil e das permissões."],
  },
  {
    id: "tracking-crm-dashboard-traffic",
    title: "Tracking → CRM → Dashboard / Gestor de Tráfego",
    purpose: "Relacionar origem e eventos com o resultado comercial e a leitura de mídia.",
    flow: ["Pixel / UTM", "Evento", "Tracking", "CRM / conversão", "Dashboard", "Gestor de Tráfego"],
    notes: ["Atribuição depende de evento e UTM corretos.", "No Gestor de Tráfego, trate apenas fontes realmente conectadas como prontas."],
  },
  {
    id: "products-crm-dashboard",
    title: "Produtos → CRM → Venda → Dashboard",
    purpose: "Padronizar o item vendido e permitir leitura comercial quando existe associação real da venda.",
    flow: ["Catálogo", "Produto / SKU", "CRM", "Venda associada", "Dashboard / relatório"],
    notes: ["Cadastrar produto sozinho não cria receita no Dashboard.", "A associação comercial precisa existir no fluxo real."],
  },
  {
    id: "notes-calendar-workflow",
    title: "Notas → Tarefa / Calendário → Workflow",
    purpose: "Transformar informação rápida em acompanhamento operacional quando necessário.",
    flow: ["Nota / checklist", "Tarefa ou compromisso", "Calendário", "Workflow quando a demanda exige gestão por etapas"],
    notes: ["Notas servem para registro leve; use Workflow para execução estruturada por equipe."],
  },
  {
    id: "salesbot-external-automation",
    title: "SalesBot → Make / n8n / Zapier / Webhook",
    purpose: "Enviar dados de um fluxo para uma automação externa conectada ao workspace.",
    flow: ["SalesBot", "Ação externa", "Conexão cadastrada", "Provider externo", "Retorno / caminho do fluxo"],
    notes: ["A conexão precisa estar ativa e configurada.", "Valide o retorno e o caminho de erro antes de usar em produção."],
  },
  {
    id: "social-provider",
    title: "Social Media → Provider de IA / imagem",
    purpose: "Usar providers conectados para apoiar geração de conteúdo e arte.",
    flow: ["Contexto de marca / briefing", "Social Media", "Provider conectado", "Conteúdo / imagem", "Revisão"],
    notes: ["Geração visual depende do provider disponível.", "Revise o resultado antes de publicar ou agendar."],
  },
];

export const DOCUMENTATION_RECIPES: DocumentationRecipe[] = [
  {
    id: "captar-qualificar",
    title: "Captar e qualificar um lead",
    objective: "Receber dados, criar o contato no CRM e iniciar uma jornada de qualificação controlada.",
    modules: ["Formulários", "Leads", "CRM", "Automações / SalesBot"],
    prerequisites: ["Funil e etapas definidos", "Formulário testado", "Canal conectado se o fluxo enviar mensagens"],
    steps: ["Crie ou escolha o funil e suas etapas.", "Monte o formulário e defina os campos necessários.", "Faça uma submissão de teste e confirme a criação/organização do lead.", "Configure o gatilho de automação ou SalesBot.", "Teste com um contato controlado antes de divulgar."],
    validation: ["Lead aparece no workspace correto.", "Funil e etapa são os esperados.", "Automação dispara uma única vez no cenário previsto."],
  },
  {
    id: "atendimento-inbox-ia",
    title: "Atender no Inbox com apoio de IA",
    objective: "Centralizar a conversa e usar automação/IA sem perder o contexto do CRM.",
    modules: ["Integrações", "Inbox", "Leads", "CRM", "Agente de IA / SalesBot"],
    prerequisites: ["Canal conectado", "Permissões da equipe", "Agente ou SalesBot configurado quando for usado"],
    steps: ["Conecte e valide o canal em Integrações.", "Abra uma conversa real no Inbox.", "Confirme o lead e o contexto comercial.", "Ative o fluxo automatizado somente no ponto planejado.", "Defina claramente quando a conversa passa para atendimento humano."],
    validation: ["Mensagem chega no Inbox.", "Contato correto é associado.", "Handoff não perde histórico/contexto."],
  },
  {
    id: "followup-reativacao",
    title: "Criar follow-up ou reativação",
    objective: "Retomar contatos parados usando segmento, gatilho e cadência controlados.",
    modules: ["Leads / Públicos", "CRM", "Automações / SalesBot", "Inbox"],
    prerequisites: ["Critério claro de quem entra na ação", "Canal conectado", "Mensagens e intervalos revisados"],
    steps: ["Defina o segmento ou condição de entrada.", "Revise se o lead ainda deve receber contato.", "Configure SalesBot/automação e intervalos.", "Teste com poucos contatos.", "Acompanhe resposta e interrompa o fluxo quando o lead retomar a conversa, conforme a regra configurada."],
    validation: ["Público contém somente os leads esperados.", "Não há duplicidade de disparo.", "Respostas voltam para o atendimento correto."],
  },
  {
    id: "tracking-trafego-crm",
    title: "Ligar Tracking + Tráfego + CRM",
    objective: "Acompanhar a origem da aquisição até o resultado comercial.",
    modules: ["Tracking", "Gestor de Tráfego", "CRM", "Dashboard"],
    prerequisites: ["Site cadastrado", "Pixel instalado", "UTMs definidas", "Fonte de mídia suportada conectada"],
    steps: ["Cadastre o site no Tracking.", "Instale o pixel e valide um evento real em Diagnóstico.", "Use UTMs consistentes nos links de campanha.", "Confirme a chegada do lead ao CRM.", "Compare origem/evento com as leituras do Dashboard e do Gestor de Tráfego."],
    validation: ["Pixel carrega no domínio correto.", "Evento aparece no Tracking.", "UTM/origem está preservada.", "A leitura comercial usa a mesma janela/período esperado."],
  },
  {
    id: "tarefas-por-setor",
    title: "Organizar tarefas por setor",
    objective: "Distribuir trabalho interno em etapas, responsáveis e revisão.",
    modules: ["Workflow", "Calendário", "Notas quando necessário"],
    prerequisites: ["Setores e responsáveis configurados", "Módulo liberado"],
    steps: ["Crie ou selecione o pipeline do setor.", "Defina etapas e regras de revisão.", "Cadastre a tarefa com responsável e prazo.", "Use checklist/comentários para execução.", "Acompanhe revisão, métricas e histórico."],
    validation: ["Responsável correto enxerga a tarefa.", "Prazo/etapa refletem a operação.", "Conclusão e revisão ficam registradas."],
  },
  {
    id: "automacao-externa",
    title: "Usar Make, n8n, Zapier ou Webhook no SalesBot",
    objective: "Executar uma etapa externa sem expor segredo técnico no fluxo do usuário.",
    modules: ["Integrações", "Automações / SalesBot"],
    prerequisites: ["Conexão externa cadastrada e ativa", "Destino e autenticação configurados"],
    steps: ["Cadastre a conexão em Integrações.", "Abra o SalesBot e adicione a ação externa suportada.", "Defina payload/variáveis e caminho de resposta.", "Teste sucesso e erro.", "Só então ative no fluxo principal."],
    validation: ["A conexão usada pertence ao workspace correto.", "O retorno esperado chega ao fluxo.", "Falha externa segue o caminho de erro previsto."],
  },
  {
    id: "social-ia",
    title: "Produzir conteúdo no Social Media com IA",
    objective: "Criar conteúdo usando contexto de marca e provider disponível sem tratar geração automática como publicação final.",
    modules: ["Social Media", "Integrações de IA / imagem"],
    prerequisites: ["Acesso ao recurso", "Provider correspondente conectado", "Contexto de marca revisado"],
    steps: ["Configure/revise o contexto da marca.", "Crie briefing ou ideia.", "Escolha o provider disponível quando a tela permitir.", "Gere o conteúdo/arte.", "Revise e edite o resultado antes de usar no calendário/publicação."],
    validation: ["Provider aparece conectado.", "Erro de geração fica visível quando ocorre.", "Conteúdo final foi revisado por uma pessoa antes da publicação."],
  },
];

export const DOCUMENTATION_DIAGNOSTICS: DocumentationDiagnostic[] = [
  {
    id: "acesso-bloqueado",
    symptom: "Módulo ou função aparece bloqueado / não aparece",
    checks: ["Confirme o workspace ativo.", "Confira papel e permissões do usuário.", "Revise plano/entitlement do módulo.", "Verifique se a área é administrativa/superadmin."],
    escalateWhen: "O plano e as permissões estão corretos, mas o gate continua divergente.",
  },
  {
    id: "canal-desconectado",
    symptom: "Inbox ou canal não recebe mensagens",
    checks: ["Abra Integrações e confirme o status do conector.", "Verifique se autorização/sessão continua válida.", "Confirme o workspace e o canal esperado.", "Faça um teste controlado após reconectar/sincronizar."],
    escalateWhen: "O conector mostra estado válido, mas o consumidor final continua sem receber dados.",
  },
  {
    id: "automacao-nao-dispara",
    symptom: "Automação ou SalesBot não dispara",
    checks: ["Confira o gatilho e a condição de entrada.", "Valide funil, etapa, formulário ou evento referenciado.", "Confirme integrações/canais necessários.", "Revise logs/estado do fluxo quando disponíveis."],
    escalateWhen: "O evento de entrada foi comprovado e todas as referências estão corretas, mas nenhuma execução é registrada.",
  },
  {
    id: "tracking-sem-evento",
    symptom: "Evento não aparece no Tracking",
    checks: ["Confirme domínio/site cadastrado.", "Valide instalação do pixel.", "Dispare um evento real.", "Abra Diagnóstico e logs.", "Revise nome e mapeamento do evento."],
    escalateWhen: "O pixel e a requisição foram comprovados no domínio correto, mas o evento não é processado/exibido.",
  },
  {
    id: "dado-dashboard",
    symptom: "Métrica ou bloco do Dashboard está vazio",
    checks: ["Revise o período selecionado.", "Confirme se o módulo/fonte correspondente está liberado.", "Valide integração e sincronização.", "Confira regras de funil/KPI quando a métrica depende delas."],
    escalateWhen: "A fonte possui dados no mesmo período e o módulo está liberado, mas o Dashboard diverge.",
  },
  {
    id: "integracao-oauth",
    symptom: "Integração conecta, expira ou não sincroniza",
    checks: ["Confira o status no catálogo de Integrações.", "Refaça OAuth/autorização quando aplicável.", "Revise escopos/ativos selecionados.", "Diferencie problema do workspace de dependência global da MktOn."],
    escalateWhen: "A credencial/autorização do cliente está válida e o bloqueio está no app/provider central da plataforma.",
  },
  {
    id: "social-imagem",
    symptom: "Social Media gera texto, mas imagem falha ou não aparece",
    checks: ["Confirme entitlement do recurso.", "Valide o provider de imagem em Integrações.", "Leia a mensagem de erro do próprio card/tela.", "Faça um teste simples no provider conectado."],
    escalateWhen: "O provider responde corretamente e o erro ocorre na persistência/retorno da MktOn.",
  },
];
