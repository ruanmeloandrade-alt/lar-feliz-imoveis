// Conteúdo do blog / central de ajuda da MKTOn.
// Cada artigo vira uma rota /blog/<slug> com SEO próprio.
// Estruturado como dado puro (sem JSX) pra ser fácil de expandir depois com CMS/DB.

export type BlogSection =
 | { kind: "p"; text: string }
 | { kind: "h2"; text: string; anchor?: string }
 | { kind: "h3"; text: string }
 | { kind: "ul"; items: string[] }
 | { kind: "ol"; items: string[] }
 | { kind: "code"; lang?: string; code: string }
 | { kind: "callout"; tone: "info" | "warn" | "success"; text: string };

export interface BlogArticle {
 slug: string;
 title: string;         // Usado no H1 e no <title>
 description: string;   // Meta description e og:description
 category: "Webhooks" | "Integrações" | "CRM" | "Automações";
 keywords: string[];
 updatedAt: string;     // ISO
 readingMinutes: number;
 hero?: string;         // Emoji / ícone visual
 related: string[];     // slugs relacionados
 body: BlogSection[];
 cta?: { title: string; text: string; href: string; label: string };
}

const DEFAULT_CTA = {
 title: "Automatize seu comercial com a Vanessa Simoni",
 text: "CRM + WhatsApp + IA + automações no mesmo lugar. Teste grátis, sem cartão.",
 href: "/",
 label: "Começar grátis",
} as const;

export const BLOG_ARTICLES: BlogArticle[] = [
 // ============ PILAR 1 ============
 {
  slug: "como-enviar-webhook-do-crm",
  title: "Como enviar um webhook do CRM para outro sistema (guia completo)",
  description:
   "Aprenda o que é um webhook, quando usar e passo a passo pra configurar o envio automático de dados do seu CRM Vanessa Simoni pra Zapier, Make, Slack ou qualquer sistema externo.",
  category: "Webhooks",
  keywords: [
   "como enviar webhook",
   "webhook CRM",
   "integrar CRM com Zapier",
   "notificação automática de venda",
   "webhook venda ganha",
  ],
  updatedAt: "2026-07-08",
  readingMinutes: 6,
  hero: "🔗",
  related: [
   "como-receber-webhook-no-crm",
   "integrar-mkton-com-zapier",
   "notificar-slack-nova-venda",
  ],
  body: [
   { kind: "p", text: "Se você já se pegou copiando dados do CRM pra outra plataforma na mão, atualizando uma planilha, avisando o financeiro no WhatsApp, criando um projeto no Trello toda vez que fecha uma venda -, você precisa de webhook. É a forma mais simples do CRM avisar outros sistemas que algo aconteceu, em tempo real, sem código." },

   { kind: "h2", text: "O que é um webhook, em uma frase", anchor: "o-que-e" },
   { kind: "p", text: "Webhook é um POST HTTP que sai do CRM assim que um gatilho é disparado, carregando os dados do evento em formato JSON. Quem recebe (Zapier, Make, seu ERP, Slack) decide o que fazer com isso: criar linha na planilha, mandar mensagem, gerar boleto." },
   { kind: "callout", tone: "info", text: "Pensa no webhook como um 'grito' que o CRM dá pra internet quando algo importante acontece. Ele não espera resposta, só avisa." },

   { kind: "h2", text: "Quando usar (casos reais)", anchor: "quando-usar" },
   { kind: "ul", items: [
    "Etapa \"Venda ganha\" → cria linha no Google Sheets de comissão",
    "Etapa \"Perdido\" → dispara pesquisa NPS pelo Typeform pedindo o motivo",
    "Etapa \"Contrato assinado\" → gera cobrança automática no Asaas ou no seu gateway",
    "Novo lead qualificado → alerta o closer no Slack ou Discord",
    "Reunião marcada → cria evento no Google Calendar e avisa o vendedor",
    "Cliente novo → cria projeto de onboarding no ClickUp ou Trello",
   ]},

   { kind: "h2", text: "Passo a passo no Vanessa Simoni", anchor: "passo-a-passo" },
   { kind: "ol", items: [
    "No painel, entre em CRM → Funis de venda e clique em Automatize (ícone de raio).",
    "Escolha a etapa onde o gatilho deve disparar (ex.: \"Fechado\").",
    "Clique em Adicionar gatilho → grupo Integrações → escolha um dos presets de webhook (Venda ganha, Remarketing, Cobrança…) ou o Enviar webhook genérico.",
    "Cole a URL de destino no campo indicado (você pega essa URL na plataforma que vai receber, Zapier, Make, Slack, etc.).",
    "Opcional: clique em Gerar automaticamente pra criar um segredo HMAC. O destinatário usa esse segredo pra confirmar que o POST veio mesmo da MKTOn.",
    "Clique em Testar pra ver a resposta e em Salvar. Pronto, a partir de agora, todo lead que entrar naquela etapa dispara o webhook.",
   ]},

   { kind: "h2", text: "O que vai dentro do JSON", anchor: "payload" },
   { kind: "p", text: "Cada preset envia um evento nomeado (`sale.won`, `remarketing.add`, `billing.request`…) junto dos dados completos do lead: id, nome, telefone, e-mail, valor, tags, funil, etapa de origem e destino, responsável. A prévia do JSON aparece no próprio modal de configuração, dá pra copiar e colar no destino pra montar o mapeamento antes mesmo do primeiro disparo." },
   { kind: "code", lang: "json", code: `{
  "event": "sale.won",
  "event_id": "evt_01H...",
  "workspace_id": "ws_...",
  "sent_at": "2026-07-08T14:32:11Z",
  "lead": {
    "id": "lead_...",
    "name": "Fulano de Tal",
    "email": "fulano@exemplo.com",
    "phone": "5511999998888",
    "value": 1500,
    "tags": ["quente"],
    "pipeline": "Funil principal",
    "stage_from": "Negociação",
    "stage_to": "Fechado",
    "responsible": { "id": "user_...", "name": "Vendedor" }
  },
  "sale": { "valor": 1500, "produto": "Plano Pro" }
}` },

   { kind: "h2", text: "Segurança: use o segredo HMAC", anchor: "seguranca" },
   { kind: "p", text: "Como a URL do webhook é pública, qualquer pessoa que descobrir o endereço pode postar dados falsos no seu sistema. Pra evitar isso, a Vanessa Simoni assina cada POST com HMAC-SHA256 usando o segredo que você cadastra. O header X-Vanessa Simoni-Signature carrega a assinatura, do outro lado, você recalcula e confere. Sistemas como Zapier e Make aceitam essa validação nativamente." },

   { kind: "h2", text: "E se eu quiser fazer o contrário, receber webhook?", anchor: "receber" },
   { kind: "p", text: "Isso é o inverso: você quer que outro sistema (Meta Ads, checkout, formulário externo) avise a Vanessa Simoni quando algo acontece. Cobrimos isso no guia \"Como receber webhook no CRM\", com a URL de entrada da workspace e o mapeamento de campos." },
  ],
  cta: DEFAULT_CTA,
 },

 // ============ PILAR 2 ============
 {
  slug: "como-receber-webhook-no-crm",
  title: "Como receber webhooks no CRM (entrada), criar leads e conversões de fora",
  description:
   "Cada workspace Vanessa Simoni tem uma URL de entrada exclusiva. Aprenda a receber webhooks de Meta Ads, checkout, formulários e qualquer sistema externo pra criar leads automaticamente.",
  category: "Webhooks",
  keywords: [
   "receber webhook",
   "webhook de entrada CRM",
   "criar lead via API",
   "integração checkout CRM",
   "webhook Meta Ads",
  ],
  updatedAt: "2026-07-08",
  readingMinutes: 5,
  hero: "📥",
  related: [
   "como-enviar-webhook-do-crm",
   "integrar-mkton-com-make",
   "integrar-mkton-com-zapier",
  ],
  body: [
   { kind: "p", text: "Assim como o CRM envia webhooks quando um lead avança de etapa, ele também sabe receber webhooks, ou seja, aceitar POSTs de outros sistemas e criar/atualizar leads automaticamente. É a forma padrão de conectar checkout, formulários externos, Meta Ads Lead Ads, TikTok Leads e qualquer plataforma que exponha webhook." },

   { kind: "h2", text: "Como funciona", anchor: "como-funciona" },
   { kind: "p", text: "Cada workspace tem uma URL única no formato:" },
   { kind: "code", code: "https://app.mkton.io/api/public/webhook/inbound/{workspace_id}/{secret}" },
   { kind: "p", text: "Você cola essa URL no painel do sistema que vai enviar o dado (Facebook Business, checkout, Typeform, etc.). Toda vez que aquele sistema disparar um evento, a Vanessa Simoni recebe o JSON, aplica o mapeamento que você configurou e cria (ou atualiza) o lead na etapa que você escolher." },

   { kind: "h2", text: "Passo a passo", anchor: "passo" },
   { kind: "ol", items: [
    "CRM → Funis de venda → Automatize e escolha a etapa que vai receber os leads novos (ex.: \"Novos leads\").",
    "Adicione o gatilho Receber webhook (URL de entrada).",
    "Copie a URL de entrada e cole no sistema de origem (ex.: campo \"Webhook URL\" do Meta Lead Ads).",
    "No modal, mapeie os campos: qual chave do JSON corresponde ao nome, e-mail, telefone e valor do lead.",
    "Envie um POST de teste (mostramos o comando curl pronto no modal) e confira se o lead aparece no Kanban.",
   ]},

   { kind: "h2", text: "Casos de uso comuns", anchor: "casos" },
   { kind: "ul", items: [
    "Meta Lead Ads → toda submissão vira lead qualificado com origem \"Facebook\"",
    "Checkout (Hotmart, Kirvano, Kiwify) → compra aprovada vira lead na etapa \"Cliente novo\"",
    "Typeform / Tally → resposta de formulário vira lead com respostas em campos personalizados",
    "n8n / Zapier → agregam dados de várias fontes e mandam pro CRM já enriquecidos",
   ]},

   { kind: "callout", tone: "warn", text: "Nunca compartilhe a URL de entrada em público, ela contém o secret. Se vazar, gere uma nova no botão \"Rotacionar segredo\" e recadastre nos destinos." },

   { kind: "h2", text: "Testar antes de conectar", anchor: "testar" },
   { kind: "p", text: "Antes de plugar no sistema real, teste com curl direto do terminal:" },
   { kind: "code", lang: "bash", code: `curl -X POST https://app.mkton.io/api/public/webhook/inbound/SEU_WS/SEU_SECRET \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Lead de teste",
    "email": "teste@exemplo.com",
    "phone": "5511999990000",
    "source": "teste-curl"
  }'` },
   { kind: "p", text: "Se voltar 200 e o lead aparecer no Kanban em segundos, tá tudo certo. Se der erro, o modal mostra o log dos últimos disparos com o motivo da falha." },
  ],
  cta: DEFAULT_CTA,
 },

 // ============ ZAPIER ============
 {
  slug: "integrar-mkton-com-zapier",
  title: "Como integrar o CRM Vanessa Simoni com o Zapier (webhook em 3 minutos)",
  description:
   "Passo a passo pra conectar o Vanessa Simoni ao Zapier usando webhooks: capture URL do Catch Hook, cole no gatilho da etapa e conecte a mais de 6.000 apps.",
  category: "Integrações",
  keywords: ["MKTOn Zapier", "integrar CRM Zapier", "webhook Zapier CRM"],
  updatedAt: "2026-07-08",
  readingMinutes: 4,
  hero: "⚡",
  related: ["como-enviar-webhook-do-crm", "integrar-mkton-com-make", "notificar-slack-nova-venda"],
  body: [
   { kind: "p", text: "O Zapier é a ponte mais simples pra ligar o Vanessa Simoni a mais de 6.000 apps, Google Sheets, Gmail, Trello, ClickUp, Notion, Pipedrive e por aí vai. E o método é sempre o mesmo: um webhook sai do Vanessa Simoni quando um lead entra numa etapa e o Zapier faz o resto do fluxo." },

   { kind: "h2", text: "1. Crie o Zap com Catch Hook", anchor: "catch-hook" },
   { kind: "ol", items: [
    "No Zapier, clique em Create Zap.",
    "Como Trigger, procure Webhooks by Zapier e escolha o evento Catch Hook.",
    "Copie a Custom Webhook URL que o Zapier vai gerar (algo tipo https://hooks.zapier.com/hooks/catch/12345/abcde/).",
   ]},

   { kind: "h2", text: "2. Cole a URL no Vanessa Simoni", anchor: "cole-url" },
   { kind: "ol", items: [
    "No painel: CRM → Funis de venda → Automatize.",
    "Escolha a etapa (ex.: \"Fechado\") e adicione o gatilho Webhook · Venda ganha.",
    "Cole a URL do Zapier no campo URL de destino.",
    "Clique em Testar pra disparar um POST de exemplo e depois em Salvar.",
   ]},

   { kind: "h2", text: "3. Termine o Zap", anchor: "finalize" },
   { kind: "p", text: "Volte pro Zapier, o teste que você acabou de disparar vai aparecer como amostra. A partir daí, escolha a Action (ex.: adicionar linha no Google Sheets, criar card no Trello, mandar e-mail) e mapeie os campos do JSON pros campos do app de destino. Publique o Zap." },

   { kind: "callout", tone: "success", text: "Pronto. A cada lead que fechar, o Zap roda automaticamente. Você pode criar quantos Zaps quiser, cada etapa do funil pode ter um gatilho diferente." },

   { kind: "h2", text: "Dica: use o segredo HMAC", anchor: "hmac" },
   { kind: "p", text: "No Zapier, adicione um Filter que só continua o Zap se o header X-Vanessa Simoni-Signature estiver presente. Assim ninguém consegue disparar seu Zap fingindo ser a Vanessa Simoni." },
  ],
  cta: DEFAULT_CTA,
 },

 // ============ MAKE ============
 {
  slug: "integrar-mkton-com-make",
  title: "Integrar Vanessa Simoni com Make (Integromat), webhook + cenários visuais",
  description:
   "Aprenda a receber os webhooks do Vanessa Simoni no Make e montar automações visuais com centenas de módulos: e-mail, ERP, ChatGPT, Google Sheets e mais.",
  category: "Integrações",
  keywords: ["MKTOn Make", "Integromat CRM", "webhook Make", "cenário Make"],
  updatedAt: "2026-07-08",
  readingMinutes: 4,
  hero: "🧩",
  related: ["como-enviar-webhook-do-crm", "integrar-mkton-com-zapier", "integrar-mkton-com-n8n"],
  body: [
   { kind: "p", text: "O Make (ex-Integromat) é o queridinho de quem gosta de montar automações visuais complexas, ele mostra cada passo como um bloco conectado. Pra integrar com o Vanessa Simoni, o caminho é o módulo Webhooks → Custom webhook." },

   { kind: "h2", text: "1. Crie o Custom webhook", anchor: "criar-webhook" },
   { kind: "ol", items: [
    "No Make, clique em Create a new scenario.",
    "Adicione o primeiro módulo, procure Webhooks e escolha Custom webhook.",
    "Clique em Add pra criar um novo webhook, dê um nome (ex.: \"MKTOn, Venda ganha\") e copie a URL gerada.",
   ]},

   { kind: "h2", text: "2. Conecte no gatilho da etapa", anchor: "gatilho" },
   { kind: "p", text: "No Vanessa Simoni: CRM → Funis de venda → Automatize → etapa desejada → Adicionar gatilho → escolha um preset de webhook (ex.: Venda ganha). Cole a URL do Make e clique em Testar. O Make vai captar o POST e usar como amostra de estrutura." },

   { kind: "h2", text: "3. Continue o cenário", anchor: "cenario" },
   { kind: "p", text: "Agora é só arrastar os próximos módulos: enviar e-mail via Gmail, criar linha no Google Sheets, chamar a API do seu ERP, gerar boleto no Asaas, mandar mensagem no Telegram, o que fizer sentido. Cada campo do JSON aparece como variável pra você mapear visualmente." },

   { kind: "callout", tone: "info", text: "O Make cobra por operação. Se o volume for alto, use filtros logo depois do webhook pra evitar rodar o cenário quando não precisa (ex.: só continuar se o valor for acima de R$ 500)." },
  ],
  cta: DEFAULT_CTA,
 },

 // ============ N8N ============
 {
  slug: "integrar-mkton-com-n8n",
  title: "Como integrar o Vanessa Simoni com o n8n (self-hosted ou cloud)",
  description:
   "Use n8n pra receber webhooks do Vanessa Simoni e orquestrar automações self-hosted com mais controle e sem limite de operações.",
  category: "Integrações",
  keywords: ["MKTOn n8n", "CRM n8n webhook", "n8n self-hosted CRM"],
  updatedAt: "2026-07-08",
  readingMinutes: 3,
  hero: "🔧",
  related: ["integrar-mkton-com-make", "integrar-mkton-com-zapier", "como-receber-webhook-no-crm"],
  body: [
   { kind: "p", text: "n8n é uma alternativa open-source ao Zapier/Make: você hospeda onde quiser, paga zero por operação e tem controle total do fluxo. Combina muito bem com o Vanessa Simoni pra quem já tem infra ou quer previsibilidade de custo." },

   { kind: "h2", text: "1. Adicione o nó Webhook", anchor: "webhook-node" },
   { kind: "ol", items: [
    "No n8n, crie um novo workflow e adicione o nó Webhook.",
    "Configure Method: POST e escolha o Path (ex.: mkton-venda).",
    "Copie a URL de produção (não a de teste, a MKTOn precisa chegar em endpoint público).",
   ]},

   { kind: "h2", text: "2. Cole no Vanessa Simoni", anchor: "colar" },
   { kind: "p", text: "No painel do Vanessa Simoni, adicione o gatilho de webhook desejado na etapa, cole a URL do n8n e clique em Testar. Se a inst-ncia do n8n for privada, garanta que ela está exposta em HTTPS (ex.: via ngrok pra testes, ou domínio próprio em produção)." },

   { kind: "h2", text: "3. Ative o workflow", anchor: "ativar" },
   { kind: "p", text: "Continue montando os nós seguintes, Slack, Postgres, HTTP Request pra qualquer API, IF/Switch pra lógica condicional. Ative o workflow no toggle superior direito. n8n não cobra por execução: dispare à vontade." },

   { kind: "callout", tone: "warn", text: "Use o segredo HMAC. No n8n, adicione um nó Function logo depois do Webhook que recalcula a assinatura e compara com o header X-Vanessa Simoni-Signature, descarte se não bater." },
  ],
  cta: DEFAULT_CTA,
 },

 // ============ SLACK ============
 {
  slug: "notificar-slack-nova-venda",
  title: "Notificar o Slack sempre que uma venda for fechada no CRM",
  description:
   "Configure um webhook do Vanessa Simoni pra avisar seu canal do Slack em tempo real toda vez que um lead entrar na etapa de venda ganha.",
  category: "Automações",
  keywords: ["Slack venda CRM", "notificação Slack vendas", "webhook Slack", "incoming webhook"],
  updatedAt: "2026-07-08",
  readingMinutes: 3,
  hero: "💬",
  related: ["notificar-discord-nova-venda", "como-enviar-webhook-do-crm", "integrar-mkton-com-zapier"],
  body: [
   { kind: "p", text: "Nada gera mais energia num time de vendas do que ver a notificação de \"🎉 Fulano fechou R$ 12k\" pipocando no canal do Slack. Dá pra montar isso em 5 minutos usando o Incoming Webhook nativo do Slack, sem código, sem integração paga." },

   { kind: "h2", text: "1. Crie o Incoming Webhook no Slack", anchor: "slack-webhook" },
   { kind: "ol", items: [
    "Acesse api.slack.com/apps e clique em Create New App → From scratch.",
    "Dê um nome (ex.: MKTOn Vendas) e selecione seu workspace.",
    "No menu lateral, entre em Incoming Webhooks e ative o toggle.",
    "Clique em Add New Webhook to Workspace, escolha o canal (ex.: #vendas) e autorize.",
    "Copie a URL que começa com https://hooks.slack.com/services/T…/B…/…",
   ]},

   { kind: "h2", text: "2. Cole no Vanessa Simoni", anchor: "colar" },
   { kind: "p", text: "No CRM → Funis de venda → Automatize, escolha a etapa \"Fechado\" (ou o nome que você usa). Adicione o gatilho Webhook · Venda ganha e cole a URL do Slack no campo URL de destino." },

   { kind: "callout", tone: "info", text: "O Slack espera um formato específico de mensagem ({ \"text\": \"…\" }). Nosso payload padrão traz o lead completo, se você quiser texto formatado bonitinho, use Zapier ou Make como intermediário e monte o Block Kit lá." },

   { kind: "h2", text: "3. Alternativa: use Zapier no meio", anchor: "zapier" },
   { kind: "p", text: "Pra ter mensagens do tipo \":tada: *Nova venda!* Fulano, R$ 12.000, vendedor: Beltrano\", coloque um Zap no meio: Vanessa Simoni → Catch Hook do Zapier → ação Send Channel Message do Slack, com o texto formatado que você quiser." },
  ],
  cta: DEFAULT_CTA,
 },

 // ============ DISCORD ============
 {
  slug: "notificar-discord-nova-venda",
  title: "Enviar notificações do CRM para o Discord (webhook em 2 minutos)",
  description:
   "Alerta seu time de vendas no Discord toda vez que um lead avança pra etapa de fechamento, usando o webhook nativo do Discord.",
  category: "Automações",
  keywords: ["Discord CRM", "notificação Discord vendas", "webhook Discord"],
  updatedAt: "2026-07-08",
  readingMinutes: 3,
  hero: "🎮",
  related: ["notificar-slack-nova-venda", "como-enviar-webhook-do-crm"],
  body: [
   { kind: "p", text: "Se seu time se comunica no Discord (comum em times de agência, cripto, gaming e SaaS mais jovens), dá pra receber as notificações do CRM direto no canal, sem precisar de Zapier no meio, porque o Discord aceita webhooks nativos." },

   { kind: "h2", text: "1. Crie o webhook no Discord", anchor: "criar" },
   { kind: "ol", items: [
    "No canal desejado, clique no ícone de engrenagem → Integrations → Webhooks → New Webhook.",
    "Dê um nome (ex.: MKTOn Bot), escolha o avatar e o canal.",
    "Clique em Copy Webhook URL, vai gerar algo como https://discord.com/api/webhooks/1234/abcd…",
   ]},

   { kind: "h2", text: "2. Conecte no Vanessa Simoni", anchor: "conectar" },
   { kind: "p", text: "No painel: CRM → Funis de venda → Automatize → escolha a etapa → gatilho Webhook · Venda ganha (ou o preset que fizer sentido). Cole a URL do Discord e teste." },

   { kind: "callout", tone: "warn", text: "O Discord também espera um formato específico ({ \"content\": \"…\" } ou embeds). Se quiser mensagens bonitas com cores e campos, use Make ou n8n no meio pra transformar o payload." },
  ],
  cta: DEFAULT_CTA,
 },

 // ============ META ADS · CONVERSIONS API ============
 {
  slug: "configurar-meta-conversions-api-system-user",
  title: "Meta Conversions API na Vanessa Simoni: System User Token + snippet do site (passo a passo)",
  description:
   "Deixe o envio de eventos pro Meta 100% em produção: gere o System User Token no Business Manager, salve na Vanessa Simoni e cole o snippet no site pra capturar fbc/fbp e melhorar o match do Pixel.",
  category: "Integrações",
  keywords: [
   "meta conversions api",
   "capi facebook",
   "system user token meta",
   "pixel facebook lead",
   "fbc fbp fbclid",
   "meta ads mkton",
  ],
  updatedAt: "2026-07-08",
  readingMinutes: 7,
  hero: "📈",
  related: ["como-enviar-webhook-do-crm", "como-receber-webhook-no-crm"],
  body: [
   { kind: "p", text: "O gatilho Meta Ads da Vanessa Simoni dispara os eventos Lead, Purchase e LeadLost pra Conversions API (CAPI) sempre que o lead cai na etapa correspondente do funil. Pra funcionar em produção com estabilidade e taxa de match alta, você precisa de duas coisas: um System User Token (que não expira) salvo na sua workspace, e o snippet de captação colado no site pra pegar os cookies fbc / fbp e o par-metro fbclid." },

   { kind: "callout", tone: "info", text: "Sem o System User Token, o envio cai no OAuth do usuário que conectou o Meta, se ele revogar o acesso ou trocar de senha, o disparo quebra. Sem o snippet, o CAPI envia sem dedupe com o Pixel do navegador e a qualidade do evento cai no Gerenciador de Eventos." },

   { kind: "h2", text: "1. Gerar o System User Token no Business Manager", anchor: "gerar-token" },
   { kind: "ol", items: [
    "Entre no Business Manager (business.facebook.com) com um usuário admin do negócio.",
    "Vá em Configurações do Negócio → Usuários → Usuários do sistema.",
    "Se ainda não tiver, clique em Adicionar e crie um System User com função Admin (ex.: \"MKTOn Integração\").",
    "Selecione esse usuário e clique em Adicionar ativos → escolha a Conta de Anúncios e o Pixel que a MKTOn vai usar, com acesso total.",
    "Ainda no mesmo usuário, clique em Gerar novo token.",
    "Selecione o app da MKTOn (ou o app padrão do seu Business Manager) e marque os escopos: ads_management, business_management e, se estiver disponível, pages_read_engagement.",
    "Escolha validade Nunca expira (esse é o ponto todo do System User).",
    "Copie o token que aparece, ele começa com EAAB… e só é mostrado uma vez.",
   ]},
   { kind: "callout", tone: "warn", text: "Guarde o token num gerenciador de senhas antes de fechar a tela. Se perder, você precisa gerar outro (o antigo continua ativo até você revogar manualmente na mesma tela)." },

   { kind: "h2", text: "2. Salvar o token na Vanessa Simoni", anchor: "salvar-token" },
   { kind: "ol", items: [
    "No painel da MKTOn, entre em Integrações → Meta.",
    "Localize o bloco Pixel / Conversions API → System User Token.",
    "Cole o token e clique em Salvar. A MKTOn valida contra a Graph API e mostra o nome do System User confirmando que deu certo.",
    "A partir de agora, todo disparo do gatilho Meta Ads usa esse token, o OAuth do usuário vira só fallback.",
   ]},

   { kind: "h2", text: "3. Colar o snippet no site do cliente", anchor: "snippet" },
   { kind: "p", text: "O snippet é um <script> leve que roda no navegador do visitante, lê os cookies _fbp / _fbc e o fbclid da URL, e envia esses dados pra Vanessa Simoni junto com o leadId assim que o formulário é enviado. Isso permite que o CAPI mande o evento server-side com o mesmo event_id do Pixel do navegador, o Meta deduplica os dois e conta como um único evento de alta qualidade." },
   { kind: "ol", items: [
    "Copie o snippet no bloco Snippet de captação no site do cliente (em Integrações → Meta).",
    "Cole antes do </head> em todas as páginas com formulário de lead (landing pages, checkout, blog, etc.).",
    "Em cada formulário, adicione o atributo data-mkton-lead-id=\"{{leadId}}\" no <form>, troque {{leadId}} pelo ID do lead assim que ele for criado (ou por um ID temporário que você já mande no webhook de entrada).",
    "Publique a página e envie um lead de teste. No Gerenciador de Eventos do Meta, o evento Lead deve aparecer marcado como Pixel + Server (Deduplicado).",
   ]},
   { kind: "code", lang: "html", code: `<script src="https://app.mkton.io/api/public/track/meta-snippet"
  data-pixel-id="SEU_PIXEL_ID"
  data-mkton-origin="https://app.mkton.io"></script>` },

   { kind: "h2", text: "4. Testar antes de virar produção", anchor: "test-event" },
   { kind: "p", text: "No Gerenciador de Eventos do Meta, abra Test events e copie o Test Event Code (formato TEST12345). No modal do gatilho Meta Ads (CRM → Funis de venda → Automatize → etapa desejada → Meta Ads), cole esse código no campo Test Event Code. Enquanto ele estiver preenchido, os eventos vão pra aba de testes, não afetam otimização de campanha. Quando tudo estiver validado, apague o campo pra ir pra produção." },

   { kind: "h2", text: "5. Moeda: definida pela conta, não pelo vendedor", anchor: "moeda" },
   { kind: "p", text: "A moeda enviada ao Meta (BRL, USD, EUR…) é a moeda principal da workspace, definida em Configurações → Moeda principal da conta. Só owner ou admin conseguem trocar. Isso garante que todos os vendedores do mesmo cliente disparam o CAPI com a mesma currency, evita rejeição de evento por moeda inconsistente na BM." },

   { kind: "h2", text: "Checklist final", anchor: "checklist" },
   { kind: "ul", items: [
    "System User Token salvo → status \"configurado\" no painel Meta",
    "Snippet colado antes do </head> em todas as páginas de captação",
    "Atributo data-mkton-lead-id preenchido nos <form>",
    "Gatilhos Lead / Purchase / LeadLost adicionados nas etapas certas do funil",
    "Test Event Code validado no Gerenciador de Eventos antes de tirar o campo",
    "Moeda principal da workspace conferida em Configurações",
   ]},

   { kind: "callout", tone: "success", text: "Com esses cinco itens marcados, o Meta Ads da Vanessa Simoni opera 100% em produção, sem depender de sessão OAuth do usuário e com dedupe Pixel + Server no Gerenciador de Eventos." },
  ],
  cta: DEFAULT_CTA,
 },

 // ============ FORMULÁRIOS ============
 {
  slug: "central-de-formularios-mkton",
  title: "Central de Formulários: crie, personalize e envie formulários pra seus leads",
  description:
   "Como criar formulários de captação/qualificação na Vanessa Simoni, personalizar a identidade visual (logo e cores do seu cliente), enviar por WhatsApp e ter as respostas caindo automaticamente nos campos do lead.",
  category: "CRM",
  keywords: [
   "formulário crm",
   "formulário lead whatsapp",
   "identidade visual formulário",
   "campos personalizados lead",
   "central de formulários mkton",
  ],
  updatedAt: "2026-07-08",
  readingMinutes: 4,
  hero: "📝",
  related: ["como-enviar-webhook-do-crm", "como-receber-webhook-no-crm"],
  body: [
   { kind: "p", text: "A Central de Formulários gera páginas públicas prontas pra você mandar pro lead pelo WhatsApp, e-mail ou qualquer canal. Cada formulário tem sua própria URL curta (/f/<slug>), identidade visual personalizada e as respostas caem direto nos campos do lead, inclusive nos campos personalizados que você criou no CRM." },

   { kind: "h2", text: "Criar um formulário", anchor: "criar" },
   { kind: "ol", items: [
    "No painel, entre em CRM → Formulários.",
    "Clique em Novo formulário. Já vem com um campo Nome. Renomeie e adicione quantos campos precisar (texto, e-mail, telefone, valor, seleção, arquivo, personalizado).",
    "Marque quais campos são obrigatórios. Se quiser conectar um campo do formulário direto a um campo personalizado do lead, escolha o tipo Personalizado.",
    "Clique em Salvar. Pronto, a URL pública já está ativa em app.mkton.io/f/<slug>.",
   ]},

   { kind: "h2", text: "Personalizar a identidade visual", anchor: "identidade" },
   { kind: "p", text: "A URL sempre fica no domínio da Vanessa Simoni (pra você manter controle), mas o que aparece dentro da página pode ser 100% do seu cliente. Na aba Identidade visual do editor você configura:" },
   { kind: "ul", items: [
    "Logo (URL da imagem), exibido no topo",
    "Cor primária, cor do botão de envio",
    "Cor de destaque, fundo do cabeçalho",
    "Título grande, substitui o nome do formulário no topo",
    "Subtítulo, texto de contexto abaixo do título",
    "Mensagem de agradecimento, o que o lead vê depois de enviar",
    "Texto de rodapé, ex.: © da marca do cliente",
   ]},
   { kind: "callout", tone: "info", text: "A URL nunca muda: pertence à Vanessa Simoni. A identidade visual muda o miolo da página pra o cliente final se sentir em casa." },

   { kind: "h2", text: "Enviar pelo inbox (WhatsApp)", anchor: "enviar-inbox" },
   { kind: "p", text: "Dentro do Inbox → chat do lead, tem um botão de formulário na barra do composer (ao lado do SalesBot e do Agente IA). Clique, escolha o formulário e mande Enviar por WhatsApp, a Vanessa Simoni dispara uma mensagem já com o link personalizado do lead. Também dá pra só copiar o link pra colar onde quiser." },

   { kind: "h2", text: "Enviar automaticamente por gatilho de etapa", anchor: "enviar-gatilho" },
   { kind: "p", text: "Em CRM → Funis de venda → Automatize, adicione o gatilho Gerar formulário na etapa desejada e escolha canal (WhatsApp / só link) e o formulário. Toda vez que um lead cair naquela etapa, o formulário é disparado sozinho." },

   { kind: "h2", text: "As respostas vão pra onde?", anchor: "respostas" },
   { kind: "p", text: "Quando o lead envia o formulário, a Vanessa Simoni:" },
   { kind: "ul", items: [
    "Atualiza os campos básicos do lead (nome, e-mail, telefone, valor) a partir dos campos correspondentes.",
    "Grava cada campo personalizado que estiver vinculado (customFieldId) direto no campo personalizado do lead, mesma coluna que aparece no card lateral.",
    "Registra uma nota no histórico do lead com o resumo das respostas, pra você acompanhar sem sair do chat.",
    "Guarda o envio completo em crm_form_submissions pra você consultar depois.",
   ]},

    { kind: "callout", tone: "success", text: "Formulário + inbox + custom fields = qualificação sem perguntas repetidas. O lead responde uma vez, e o CRM já sabe tudo." },
   ],
   cta: DEFAULT_CTA,
  },

  // ============ FUNCIONÁRIO DO MÊS ============
  {
   slug: "funcionario-do-mes",
   title: "Funcionário do Mês: como motivar a equipe com dados no Fluxo de Trabalho",
   description:
    "Entenda como o Funcionário do Mês do Vanessa Simoni funciona, quais KPIs definem o vencedor e como usar o cartão de compartilhamento para celebrar o time.",
   category: "CRM",
   keywords: [
    "funcionário do mês",
    "gamificação equipe",
    "motivar funcionários",
    "KPI equipe",
    "reconhecimento no trabalho",
   ],
   updatedAt: "2026-07-28",
   readingMinutes: 5,
   hero: "🏆",
   related: [
    "como-usar-fluxo-de-trabalho",
    "como-configurar-automacoes-crm",
   ],
   body: [
    { kind: "p", text: "Reconhecer quem mais entrega é uma das formas mais baratas e eficientes de manter um time engajado. O Funcionário do Mês do Vanessa Simoni faz isso sozinho: ele lê as entregas do Fluxo de Trabalho, calcula XP e coins, e aponta o vencedor com base em dados, não em achismo do chefe." },

    { kind: "h2", text: "Como o vencedor é escolhido", anchor: "como-funciona" },
    { kind: "p", text: "O sistema soma pontos (XP) a cada tarefa concluída, com bônus por entregar no prazo, com folga ou abaixo do tempo estimado. Quem acumula mais XP até o fim do mês vence. Coins são acumulados separadamente e podem ser trocados por prêmios cadastrados pelo gestor." },
    { kind: "ul", items: [
     "XP zera a cada mês, então todo mundo começa do zero no dia 1º.",
     "Coins acumulam e viram recompensas concretas.",
     "O gestor pode aprovar o vencedor antes de publicar.",
     "O ranking pode ser geral ou separado por setor.",
    ]},

    { kind: "h2", text: "O que o gestor precisa configurar", anchor: "configuracao" },
    { kind: "ol", items: [
     "Acesse Fluxo de Trabalho → Funcionário do Mês.",
     "Clique em Configurar e ative o ranking.",
     "Defina o escopo: empresa toda, por setor ou ambos.",
     "Ajuste quanto de XP e coins cada prioridade vale.",
     "Cadastre prêmios no catálogo e escolha o prêmio do mês.",
    ]},

    { kind: "h2", text: "Cartão de compartilhamento", anchor: "cartao" },
    { kind: "p", text: "Assim que o vencedor é definido, o gestor pode gerar um cartão 1200x630 pronto para postar no Instagram, LinkedIn, WhatsApp ou enviar por e-mail. É uma forma rápida de mostrar para o time e para clientes que a empresa valoriza quem entrega." },

    { kind: "h2", text: "Hall da Fama", anchor: "hall" },
    { kind: "p", text: "Todo vencedor fica guardado no Hall da Fama. Dá para filtrar por setor, ver o histórico de meses anteriores e acompanhar quem está construindo uma sequência de vitórias." },

    { kind: "callout", tone: "success", text: "Funcionário do Mês não é só um troféu virtual. Quando ligado a prêmios reais e celebrado publicamente, ele vira um motor de produtividade para o time." },
   ],
   cta: DEFAULT_CTA,
  },
];

export function findArticle(slug: string): BlogArticle | undefined {
 return BLOG_ARTICLES.find((a) => a.slug === slug);
}

export function articlesByCategory(): Record<BlogArticle["category"], BlogArticle[]> {
 const map: Record<string, BlogArticle[]> = {};
 for (const a of BLOG_ARTICLES) {
  (map[a.category] ??= []).push(a);
 }
 return map as Record<BlogArticle["category"], BlogArticle[]>;
}
