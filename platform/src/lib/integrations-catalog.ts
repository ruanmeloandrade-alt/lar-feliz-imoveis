// Catálogo declarativo de integrações Vanessa Simoni.
// Base: INTEGRACOES_ALL_CONNECTORS_PRIORITY_MATRIX_20260610.md +
// INTEGRACOES_ALL_CONNECTORS_REQUIREMENTS_MATRIX_20260609.md.
// Quando os contratos.md do back forem versionados aqui, basta atualizar este arquivo.


import openaiLogo from "@/assets/logos/openai.svg";
import ideogramLogo from "@/assets/logos/ideogram.svg";
import recraftLogo from "@/assets/logos/recraft.svg";
import twilioLogo from "@/assets/logos/twilio.svg";
import docusignLogo from "@/assets/logos/docusign.svg";
import amazonSesLogo from "@/assets/logos/amazon-ses.svg";

export type IntegrationStatus = "conectado" | "desconectado" | "em_preparacao";

export type IntegrationField =
 | { kind: "text"; key: string; label: string; placeholder?: string; help?: string }
 | { kind: "secret"; key: string; label: string; placeholder?: string; help?: string }
 | { kind: "url"; key: string; label: string; placeholder?: string; help?: string }
 | { kind: "select"; key: string; label: string; options: { value: string; label: string }[] }
 | { kind: "oauth"; key: string; provider: string; label: string; scopes?: string[] };

export type IntegrationCategory =
 | "ads"
 | "catalogos"
 | "social"
 | "ia"
 | "automacao"
 | "arquivos"
 | "email"
 | "voz"
 | "assinatura";

export const CATEGORY_META: Record<
 IntegrationCategory,
 { label: string; hint: string }
> = {
 ads: { label: "Ads e Tráfego Pago", hint: "Meta, Google e TikTok" },
 catalogos: { label: "Catálogos", hint: "produtos e feeds" },
 
 social: { label: "Social e Mensagens", hint: "Meta, WhatsApp e DMs" },
 ia: { label: "IA e Modelos", hint: "OpenAI, Gemini, Codex, Claude Code e OpenClaw" },
 automacao: { label: "Automação e Webhooks", hint: "n8n, Make, Zapier" },
 arquivos: { label: "Arquivos e Planilhas", hint: "Drive, Sheets, Excel" },
 email: { label: "E-mail", hint: "providers de envio" },
 voz: { label: "Voz, Áudio e Telefonia", hint: "TTS/STT, SMS, voz" },
 assinatura: { label: "Assinatura Digital", hint: "documentos e contratos" },
};

export interface Integration {
 id: string;
 name: string;
 category: IntegrationCategory;
 /** Categorias adicionais em que a integração também aparece no catálogo. */
 extraCategories?: IntegrationCategory[];
 categoryLabel: string;
 /** Letras de fallback caso não haja logo. */
 brand: string;
 /** Classes de cor para o fallback (sem logo). */
 brandColor: string;
 /** URL pública (SVG/PNG) da logo oficial. Quando presente, é renderizada no card e no modal. */
 logoUrl?: string;
 status: IntegrationStatus;
 shortDesc: string;
 longDesc: string;
 whatItDoes: string;
 requirements: string;
 dataUsed: string[];
 configSummary: string;
 dataIn: string[];
 technicalStatus?: { label: string; value: string }[];
 nextStep: string;
 checklist: string[];
 executionSteps: string[];
 fields: IntegrationField[];
 ctaLabel: string;
 /** Termos extras usados na busca (apelidos, produtos cobertos por esta integração). */
 keywords?: string[];
}

// Helper: monta URL colorida do Simple Icons CDN.
const si = (slug: string, color = "default") =>
 `https://cdn.simpleicons.org/${slug}/${color}`;

export const INTEGRATIONS: Integration[] = [
 // ============================================================
 // P0 - ADS
 // ============================================================
  {
  id: "meta",
  name: "Meta",
  category: "ads",
  extraCategories: ["social"],
  categoryLabel: "ADS E TRÁFEGO PAGO",
  brand: "Meta",
  brandColor: "bg-blue-50 text-blue-600",
  logoUrl: si("meta"),
  status: "desconectado",
 shortDesc:
 "Central Meta: Páginas, Instagram, Direct, Messenger, Ads, Pixel/CAPI, Catálogo e Lead Ads.",
 longDesc:
 "Faça login com sua conta Meta Business uma única vez. Tudo que é Meta entra por aqui: contas de anúncios, pixels, Páginas do Facebook, contas Instagram, Direct do Instagram, Messenger, catálogos e formulários de Lead Ads. O único canal que não passa pelo Meta é o WhatsApp. Se não conectar tudo de primeira, é só reabrir este painel e conectar o que ficou pendente.",
  whatItDoes:
  "Sincroniza contas de anúncios, campanhas, pixels/CAPI, páginas, Instagram e catálogos numa conexão só.",
  requirements: "Login Meta Business com permissão nos ativos.",
  dataUsed: ["Contas de anúncios", "Campanhas", "Pixels", "Páginas", "Instagram", "Catálogos"],
  configSummary: "OAuth Meta Business (unificado)",
  dataIn: ["Ads", "Pixel/CAPI", "Catálogo"],
  technicalStatus: [
  { label: "Status", value: "Desconectado" },
  { label: "Ativos", value: "detectados após login" },
  ],
  nextStep: "Clique em Conectar Meta e autorize os ativos que a MktOn deve ler.",
  checklist: [
  "Usuário admin do Meta Business",
  "Permissão nas contas de anúncios",
  "Pixel vinculado à conta",
  "Página/Instagram do negócio (opcional)",
  "Catálogo Commerce (opcional)",
  ],
  executionSteps: [
  "Clique em Conectar Meta",
  "Faça login com sua conta Meta Business",
  "Marque os ativos (contas, pixels, páginas, IG, catálogos)",
  "Aguarde a MktOn sincronizar",
  "Volte para o Gestor de Tráfego para operar",
  ],
  fields: [],
  ctaLabel: "Conectar Meta",
  },
 

 {
 id: "tiktok",
 name: "TikTok Central",
 category: "ads",
 categoryLabel: "ADS E TRÁFEGO PAGO",
 brand: "TT",
 brandColor: "bg-slate-900 text-white",
 logoUrl: si("tiktok"),
 status: "desconectado",
 keywords: ["tiktok", "tiktok ads", "pixel tiktok", "events api", "comentarios", "comentários", "dm", "direct", "stories", "orgânico", "vídeos"],
 shortDesc: "Central única do TikTok: vídeos, comentários, Ads e Pixel no mesmo lugar.",
 longDesc:
 "Um único Access Token do TikTok for Business conecta a conta orgânica (vídeos e comentários), o TikTok Ads (Marketing API) e o Pixel TikTok (Events API 2.0). DM e Stories não têm API pública no TikTok, então ficam sinalizados no painel.",
 whatItDoes:
 "Lê vídeos e métricas, lista e responde comentários, esconde e reexibe comentários, lê campanhas do TikTok Ads e dispara eventos server-side no Pixel.",
 requirements: "Access Token TikTok for Business + Business ID (orgânico) e/ou Advertiser ID (Ads).",
 dataUsed: ["Vídeos", "Comentários", "Campanhas", "Eventos"],
 configSummary: "Access Token + Business ID + Advertiser ID + Pixel",
 dataIn: ["Vídeos", "Comentários", "Campanhas", "Eventos"],
 technicalStatus: [
 { label: "Status", value: "Desconectado" },
 { label: "Escopos", value: "video.list, comment.list, comment.list.manage, Ads" },
 ],
 nextStep: "Gere o Access Token no portal TikTok for Business e cole na central.",
 checklist: [
 "Conta TikTok Business criada",
 "App aprovado no TikTok for Business",
 "Escopos de vídeo e comentário liberados",
 "Access Token gerado",
 "Advertiser ID e Pixel (se usar mídia paga)",
 ],
 executionSteps: [
 "Acesse business-api.tiktok.com/portal",
 "Abra seu app e autorize a conta TikTok",
 "Copie Access Token, Business ID e Advertiser ID",
 "Cole tudo na central TikTok da Vanessa Simoni",
 "Valide carregando vídeos, comentários e campanhas reais",
 ],
 fields: [
 { kind: "secret", key: "access_token", label: "Access Token TikTok for Business", placeholder: "act..." },
 { kind: "text", key: "business_id", label: "Business ID (orgânico)", placeholder: "7..." },
 { kind: "text", key: "advertiser_id", label: "Advertiser ID (Ads)", placeholder: "7..." },
 { kind: "text", key: "pixel_id", label: "Pixel ID", placeholder: "C..." },
 ],
 ctaLabel: "Abrir central TikTok",
 },

 // ============================================================
 // CATÁLOGOS
 // ============================================================
  {
  id: "shopify",
  name: "Shopify Central",
  category: "catalogos",
  categoryLabel: "CATÁLOGOS",
  brand: "Sh",
  brandColor: "bg-emerald-100 text-emerald-700",
  logoUrl: si("shopify"),
  status: "desconectado",
  keywords: ["shopify", "loja", "ecommerce", "e-commerce", "pedido", "venda", "catálogo", "carrinho", "checkout"],
  shortDesc: "Central da loja: produtos, pedidos, vendas e clientes indo direto para o CRM.",
  longDesc:
    "Uma única conexão com a Admin API da Shopify puxa o catálogo, o histórico de pedidos, o faturamento e os clientes da loja. Quem se cadastra ou compra vira lead na pipeline que você escolher, na etapa que você escolher, com atualização em tempo real por webhook assinado.",
  whatItDoes:
    "Lê produtos e estoque, lê pedidos e valores, lê clientes, importa clientes para o CRM e cria ou move leads automaticamente quando alguém se cadastra, inicia checkout, faz pedido ou paga.",
  requirements: "Domínio .myshopify.com + Admin API access token (e a API secret key para os avisos em tempo real).",
  dataUsed: ["Produtos", "Pedidos", "Clientes", "Checkouts"],
  configSummary: "Domínio da loja + Access Token + API secret key",
  dataIn: ["Produtos", "Pedidos", "Clientes"],
  technicalStatus: [
  { label: "API", value: "Admin REST API 2024-10" },
  { label: "Webhooks", value: "customers, checkouts, orders (HMAC-SHA256)" },
  ],
  nextStep: "Crie o app na sua loja, copie o token e cole na central Shopify.",
  checklist: [
  "App criado em Configurações → Aplicativos → Desenvolver aplicativos",
  "Permissões de leitura marcadas (produtos, pedidos, clientes)",
  "Aplicativo instalado na loja",
  "Admin API access token copiado (shpat_...)",
  "API secret key copiada para ligar os avisos automáticos",
  ],
  executionSteps: [
  "No painel da Shopify, abra Configurações e depois Aplicativos e canais de vendas",
  "Clique em Desenvolver aplicativos e crie um app chamado Vanessa Simoni",
  "Na aba Configuração, marque as permissões de leitura de produtos, pedidos, clientes e estoque",
  "Instale o aplicativo e copie o Admin API access token",
  "Na aba Credenciais da API, copie também a API secret key",
  "Cole tudo na central Shopify da Vanessa Simoni e escolha a pipeline que vai receber os compradores",
  ],
  fields: [
  { kind: "text", key: "shop_domain", label: "Domínio da loja", placeholder: "minhaloja.myshopify.com" },
  { kind: "secret", key: "access_token", label: "Admin API access token", placeholder: "shpat_..." },
  { kind: "secret", key: "api_secret", label: "API secret key", placeholder: "para os avisos em tempo real" },
  ],
  ctaLabel: "Abrir central Shopify",
  },




 // ============================================================
 // WHATSAPP
 // ============================================================
 {
 id: "whatsapp-cloud",
 name: "WhatsApp Cloud API",
 category: "social",
 categoryLabel: "SOCIAL E MENSAGENS",
 brand: "WA",
 brandColor: "bg-green-100 text-green-700",
 logoUrl: si("whatsapp", "075E54"),
 status: "desconectado",
 shortDesc: "Canal oficial do WhatsApp para atendimento e disparo.",
 longDesc:
 "Conexão em um clique pela janela oficial da Meta. Você escolhe o portfólio, a conta do WhatsApp Business e o número lá dentro, recebe o código de verificação e volta pronto. Nenhum token é digitado aqui.",
 whatItDoes: "Recebe e envia mensagens do WhatsApp oficial dentro do Inbox e das automações.",
 requirements: "Conta no Facebook com portfólio empresarial e um número que não esteja ativo em outro WhatsApp.",
 dataUsed: ["Mensagens", "Modelos", "Status de entrega"],
 configSummary: "Login pelo Meta",
 dataIn: ["Mensagens", "Modelos"],
 technicalStatus: [{ label: "Status", value: "Desconectado" }],
 nextStep: "Clique em Conectar com o Meta e conclua na janela oficial.",
 checklist: [
 "Conta do Facebook com acesso ao portfólio empresarial",
 "Número livre, sem WhatsApp comum ou Business ativo",
 "Celular em mãos para receber o código da Meta",
 ],
 executionSteps: [
 "Clique em Conectar com o Meta",
 "Escolha ou crie o portfólio empresarial e a conta do WhatsApp Business",
 "Cadastre o número e confirme o código recebido",
 "Volte para a Vanessa Simoni: o recebimento de mensagens liga sozinho",
 "Crie seus modelos de mensagem na aba Modelos",
 ],
 fields: [],
 ctaLabel: "Conectar com o Meta",
 },

  {
    id: "whatsapp-web",
    name: "WhatsApp Web",
    category: "social",
    categoryLabel: "SOCIAL E MENSAGENS",
    brand: "WW",
    brandColor: "bg-emerald-100 text-emerald-700",
    logoUrl: si("whatsapp", "25D366"),
    status: "desconectado",
    shortDesc: "Conecte seu número via QR Code, sem aprovação Meta, sem tarifa por inst-ncia.",
    longDesc:
      "Sessão WhatsApp Web gerenciada pela Vanessa Simoni. Cada workspace pode conectar quantos números precisar, tudo integrado ao Inbox nativo.",
    whatItDoes: "Cria uma sessão dedicada por número, mostra o QR Code na hora e conecta ao Inbox.",
    requirements: "Nenhum. É só dar um nome amigável ao número e escanear o QR.",
    dataUsed: ["Mensagens", "Contatos", "Status de entrega", "QR Code"],
    configSummary: "Sessão WhatsApp Web gerenciada + QR Code",
    dataIn: ["Mensagens", "Status", "Presença"],
    technicalStatus: [{ label: "Status", value: "Desconectado" }],
    nextStep: "Dê um nome ao número e clique em Conectar, o QR aparece na hora.",
    checklist: [
      "Nome do número definido",
      "Sessão criada",
      "QR Code escaneado no celular",
      "Webhook configurado automaticamente",
    ],
    executionSteps: [
      "Clique em Conectar",
      "Digite um nome amigável (ex: Comercial SP)",
      "Escaneie o QR Code no WhatsApp do celular",
      "Pronto, as mensagens caem no Inbox",
    ],
    fields: [],
    ctaLabel: "Conectar via QR Code",
  },




 // ============================================================
 // SOCIAL DM
 // ============================================================
 // Direct do Instagram e Facebook Messenger foram removidos daqui:
 // tudo que e Meta (Paginas, Instagram, Direct, Messenger, Ads, Pixel,
 // Catalogo, Lead Ads) e conectado pelo card unico "Meta".

 

 // ============================================================
 // IA E MODELOS
 // ============================================================
 {
 id: "openai",
 name: "OpenAI",
 category: "ia",
 categoryLabel: "IA E MODELOS",
 brand: "AI",
 brandColor: "bg-emerald-100 text-emerald-700",
 logoUrl: openaiLogo,
 status: "desconectado",
 shortDesc: "Chave OpenAI para agentes IA Vanessa Simoni com limites e logs por workspace.",
 longDesc:
 "Conecte uma API Key autorizada; project/org/assistant são opcionais. Limites de consumo aplicados server-side.",
 whatItDoes: "Habilita modelos OpenAI nos agentes IA Vanessa Simoni com chave mascarada.",
 requirements: "API Key OpenAI autorizada.",
 dataUsed: ["Conversas", "Embeddings"],
 configSummary: "API Key + organização",
 dataIn: ["Conversas", "Embeddings"],
 nextStep: "Informe a API Key e teste com prompt curto.",
 checklist: ["Plano com IA contratado", "API Key autorizada", "Organização identificada", "Termo aceito"],
 executionSteps: [
 "Acesse platform.openai.com",
 "Gere API Key",
 "Cole abaixo (mascarada)",
 "Teste com prompt curto",
 "Defina limite de consumo",
 ],
 fields: [
 { kind: "secret", key: "api_key", label: "API Key", placeholder: "sk-..." },
 { kind: "text", key: "organization", label: "Organização (opcional)", placeholder: "org-..." },
 { kind: "text", key: "project", label: "Project (opcional)", placeholder: "proj-..." },
 { kind: "text", key: "assistant_id", label: "Assistant ID (opcional)", placeholder: "asst-..." },
 ],
 ctaLabel: "Conectar OpenAI",
 },
 {
 id: "gemini",
 name: "Google Gemini",
 category: "ia",
 categoryLabel: "IA E MODELOS",
 brand: "Gem",
 brandColor: "bg-violet-100 text-violet-700",
 logoUrl: si("googlegemini"),
 status: "desconectado",
  shortDesc: "Só a API Key do Google AI Studio. Camada gratuita generosa para texto, análise e imagem.",
  longDesc: "Cole a API Key do Google AI Studio, nada mais. A Vanessa Simoni valida, salva cifrada e isolada no seu workspace, e o Gemini passa a aparecer como opção de motor no Social Media, no Gestor de Tráfego e nos agentes de IA do CRM.",
  whatItDoes: "Gera legenda, roteiro, ideia e análise de campanha, lê print de criativo e cria imagem, tudo com a sua conta Google. Custo aproximado: camada gratuita cobre o uso diário normal, acima disso cerca de US$ 0,10 por milhão de tokens de entrada.",
  requirements: "Apenas a API Key do Google AI Studio. Não precisa de project, nem de cartão para começar.",
 dataUsed: ["Conversas", "Embeddings"],
 configSummary: "Apenas a API Key",
 dataIn: ["Conversas", "Embeddings"],
  nextStep: "Cole a API Key e clique em Salvar e testar. Depois escolha Gemini no seletor de motor dentro do Social Media.",
  checklist: ["Conta Google AI Studio", "API Key gerada", "Chave colada", "Teste validado"],
 executionSteps: [
 "Acesse ai.google.dev",
 "Gere API Key",
  "Copie a chave gerada",
  "Cole abaixo (mascarada)",
  "Teste a conexão",
 ],
 fields: [
  { kind: "secret", key: "api_key", label: "API Key", placeholder: "AIza..." },
 ],
  ctaLabel: "Conectar Gemini",
  },
  {
    id: "ideogram",
    name: "Ideogram",
    category: "ia",
    categoryLabel: "IA E MODELOS",
    brand: "Idg",
    brandColor: "bg-indigo-100 text-indigo-700",
    logoUrl: ideogramLogo,
    status: "desconectado",
    shortDesc: "A melhor para colocar texto legível dentro da arte: preço, cupom, selo e headline.",
    longDesc: "Cole a API Key do Ideogram. Depois de conectar, o Ideogram aparece como opção no seletor de motor de imagem do Social Media e do Gestor de Tráfego. Use quando a arte precisa de texto correto na imagem, que é justamente onde os outros modelos erram.",
    whatItDoes: "Gera criativo de anúncio e post com tipografia integrada. Custo aproximado, cobrado direto pelo Ideogram: cerca de US$ 0,02 por imagem no modelo Turbo e US$ 0,06 a US$ 0,08 no modelo padrão. Cem criativos ficam entre US$ 2 e US$ 8.",
    requirements: "API Key Ideogram (ideogram.ai → Manage API).",
    dataUsed: ["Prompts de imagem"],
    configSummary: "API Key",
    dataIn: ["Prompts", "Referências visuais"],
    nextStep: "Cole a API Key, adicione crédito na conta Ideogram e escolha Ideogram no seletor de imagem ao criar um post.",
    checklist: ["Conta Ideogram", "Crédito pré-pago adicionado", "API Key gerada", "Motor escolhido no Social Media"],
    executionSteps: [
      "Acesse ideogram.ai/manage-api",
      "Gere uma API Key",
      "Cole abaixo (mascarada)",
      "Teste com prompt curto",
    ],
    fields: [
      { kind: "secret", key: "api_key", label: "API Key", placeholder: "id-..." },
    ],
    ctaLabel: "Conectar Ideogram",
  },
  {
    id: "recraft",
    name: "Recraft",
    category: "ia",
    categoryLabel: "IA E MODELOS",
    brand: "Rcf",
    brandColor: "bg-amber-100 text-amber-700",
    logoUrl: recraftLogo,
    status: "desconectado",
    shortDesc: "Ilustração vetorial, ícone e estilo de marca igual em toda a linha de posts.",
    longDesc: "Cole a API Key do Recraft. Depois de conectar, ele vira opção no seletor de motor de imagem do Social Media e do Gestor de Tráfego. Use quando a marca precisa do mesmo traço e da mesma paleta em todos os posts, ou quando você precisa de SVG.",
    whatItDoes: "Gera ilustração, ícone, mockup e imagem com estilo travado da marca. Custo aproximado, cobrado direto pelo Recraft: cerca de US$ 0,04 por imagem comum e US$ 0,08 por vetor SVG. Cem posts ficam entre US$ 4 e US$ 8.",
    requirements: "API Key Recraft (recraft.ai → API).",
    dataUsed: ["Prompts de imagem"],
    configSummary: "API Key",
    dataIn: ["Prompts", "Referências visuais"],
    nextStep: "Cole a API Key e teste com um prompt curto.",
    checklist: ["Conta Recraft", "API Key gerada", "Créditos disponíveis"],
    executionSteps: [
      "Acesse recraft.ai → Profile → API",
      "Gere uma API Key",
      "Cole abaixo (mascarada)",
      "Teste com prompt curto",
    ],
    fields: [
      { kind: "secret", key: "api_key", label: "API Key", placeholder: "rc-..." },
    ],
    ctaLabel: "Conectar Recraft",
  },
  {
    id: "freepik",
    name: "Freepik AI",
    category: "ia",
    categoryLabel: "IA E MODELOS",
    brand: "Fpk",
    brandColor: "bg-sky-100 text-sky-700",
    logoUrl: si("freepik"),
    status: "desconectado",
    shortDesc: "Foto de produto e cena de estilo de vida com cara de foto de verdade, não de desenho.",
    longDesc: "Cole a API Key do Freepik AI. Depois de conectar, o Freepik vira opção no seletor de motor de imagem do Social Media e do Gestor de Tráfego, com os modelos Flux e Mystic. Use quando o criativo precisa parecer fotografia publicitária.",
    whatItDoes: "Gera imagem fotorrealista de produto, ambiente e pessoa para post e anúncio. Custo aproximado, cobrado direto pelo Freepik: cerca de US$ 0,01 a US$ 0,03 por imagem no Flux e US$ 0,05 a US$ 0,10 no Mystic, ou plano de crédito a partir de cerca de US$ 10 por mês.",
    requirements: "Somente a API Key do Freepik AI Suite, gerada em freepik.com/api com plano ou crédito ativo.",
    dataUsed: ["Prompts de imagem"],
    configSummary: "API Key",
    dataIn: ["Prompts", "Referências visuais"],
    nextStep: "Cole a API Key e escolha Freepik no seletor de imagem ao criar um post ou um criativo de anúncio.",
    checklist: ["Conta Freepik", "Plano ou crédito de API ativo", "API Key gerada", "Motor escolhido no Social Media"],
    executionSteps: [
      "Acesse freepik.com/api",
      "Gere uma API Key",
      "Cole abaixo (mascarada)",
      "Teste com prompt curto",
    ],
    fields: [
      { kind: "secret", key: "api_key", label: "API Key", placeholder: "FPSX..." },
    ],
    ctaLabel: "Conectar Freepik",
  },

 // ============================================================
 // AUTOMAÇÃO / WEBHOOKS
 // ============================================================
 {
 id: "n8n",
 name: "n8n",
 category: "automacao",
 categoryLabel: "AUTOMAÇÃO E WEBHOOKS",
 brand: "n8n",
 brandColor: "bg-rose-100 text-rose-700",
 logoUrl: si("n8n"),
  status: "desconectado",
  shortDesc: "Webhook assinado para workflows n8n com inbound, outbound, teste e logs.",
  longDesc: "Cole a URL do Webhook do n8n, escolha eventos outbound e use a URL inbound para acionar ações na Vanessa Simoni.",
  whatItDoes: "Dispara workflows n8n a partir de eventos Vanessa Simoni e recebe ações de volta por webhook assinado.",
  requirements: "Webhook URL do n8n.",
  dataUsed: ["Workflows", "Webhooks", "Eventos"],
  configSummary: "Webhook outbound + URL inbound + assinatura HMAC",
 dataIn: ["Workflows", "Eventos"],
  nextStep: "Abra o painel, cole a URL do webhook e selecione os eventos.",
  checklist: ["Webhook n8n criado", "Eventos selecionados", "Disparo ativado", "Teste recebido"],
 executionSteps: [
 "Acesse sua inst-ncia n8n",
  "Crie um workflow com nó Webhook",
  "Cole a URL no painel Vanessa Simoni",
  "Selecione eventos e ative o disparo",
  "Envie teste e confira o log",
 ],
 fields: [
 { kind: "url", key: "webhook_url", label: "Webhook URL", placeholder: "https://..." },
 ],
  ctaLabel: "Conectar n8n",
 },
 {
 id: "make",
 name: "Make",
 category: "automacao",
 categoryLabel: "AUTOMAÇÃO E WEBHOOKS",
 brand: "Mk",
 brandColor: "bg-violet-100 text-violet-700",
 logoUrl: si("make"),
  status: "desconectado",
  shortDesc: "Cenários Make recebem eventos assinados e podem executar ações de volta.",
  longDesc: "Cole a URL do Custom Webhook do Make, escolha eventos outbound e use a URL inbound para ações na Vanessa Simoni.",
  whatItDoes: "Dispara cenários Make.com com payload assinado e recebe comandos inbound por webhook seguro.",
  requirements: "Custom Webhook URL do Make.",
  dataUsed: ["Cenários", "Webhooks", "Eventos"],
  configSummary: "Webhook outbound + URL inbound + assinatura HMAC",
 dataIn: ["Cenários", "Eventos"],
  nextStep: "Abra o painel, cole a URL do webhook e selecione os eventos.",
  checklist: ["Cenário Make criado", "Webhook publicado", "Eventos selecionados", "Teste recebido"],
  executionSteps: ["Acesse make.com", "Crie cenário com webhook", "Copie URL", "Cole abaixo", "Envie teste e confira o log"],
  fields: [
  { kind: "url", key: "webhook_url", label: "Webhook URL", placeholder: "https://hook.make.com/..." },
  ],
  ctaLabel: "Conectar Make",
 },
 {
 id: "zapier",
 name: "Zapier",
 category: "automacao",
 categoryLabel: "AUTOMAÇÃO E WEBHOOKS",
 brand: "Zp",
 brandColor: "bg-orange-100 text-orange-700",
 logoUrl: si("zapier"),
 status: "desconectado",
 shortDesc: "Conecte o Vanessa Simoni a mais de 6 mil apps via Zaps.",
 longDesc: "Envia eventos do CRM, tráfego, tarefas e social para o Zapier e recebe ações de volta.",
 whatItDoes: "Dispara Zaps a cada evento selecionado e aceita comandos inbound (criar lead, mover etapa, criar tarefa).",
 requirements: "Um Zap com trigger Webhooks by Zapier (Catch Hook).",
 dataUsed: ["Leads", "Tarefas", "Campanhas", "Conversões"],
 configSummary: "Catch Hook URL + eventos",
 dataIn: ["Eventos Vanessa Simoni"],
 nextStep: "Abra o painel, cole a Catch Hook URL e selecione os eventos.",
 checklist: ["Zap criado", "Catch Hook copiado", "Eventos selecionados", "Teste recebido"],
 executionSteps: ["Acesse zapier.com", "Crie um Zap com Webhooks by Zapier / Catch Hook", "Copie a URL", "Cole no painel", "Envie teste e confira o log"],
 fields: [],
 ctaLabel: "Configurar Zapier",
 },
 {
 id: "webhooks",
 name: "Webhook",
 category: "automacao",
 categoryLabel: "AUTOMAÇÃO E WEBHOOKS",
 brand: "{ }",
 brandColor: "bg-slate-100 text-slate-700",
 status: "desconectado",
 shortDesc: "Ligue o Vanessa Simoni a qualquer sistema que fale HTTP.",
 longDesc: "Saída com assinatura HMAC, headers próprios e novas tentativas. Entrada com token secreto e ações no CRM.",
 whatItDoes: "Envia eventos para o seu endpoint e recebe comandos para criar leads, mover etapas, criar tarefas e registrar conversões.",
 requirements: "Um endpoint HTTP POST que aceite JSON.",
 dataUsed: ["Leads", "Tarefas", "Campanhas", "Conversões"],
 configSummary: "URL + headers + eventos",
 dataIn: ["Eventos Vanessa Simoni"],
 nextStep: "Abra o painel, cole a URL do seu endpoint e selecione os eventos.",
 checklist: ["Endpoint publicado", "URL colada", "Eventos selecionados", "Teste recebido"],
 executionSteps: ["Crie o endpoint HTTP POST", "Cole a URL no painel", "Configure headers se precisar", "Selecione os eventos", "Envie teste e confira o log"],
 fields: [],
 ctaLabel: "Configurar webhook",
 },

 // ============================================================
 // AGENTES DE IA (MCP)
 // ============================================================
 {
  id: "codex",
  name: "Codex",
  category: "ia",
  categoryLabel: "IA E MODELOS",
  brand: "Cx",
  brandColor: "bg-neutral-100 text-neutral-800",
  logoUrl: "https://www.google.com/s2/favicons?domain=openai.com&sz=128",
  status: "desconectado",
  shortDesc: "Deixe o Codex operar seu CRM, tarefas e tracking com autorização da sua conta.",
  longDesc: "A Vanessa Simoni expõe um servidor MCP oficial. O Codex se conecta por OAuth, entra como você e passa a consultar leads, funis, tarefas, eventos de tracking e ideias de conteúdo, além de criar leads, mover etapas e abrir tarefas para a equipe.",
  whatItDoes: "Dá ao Codex acesso autorizado às ferramentas da Vanessa Simoni: diagnóstico de marketing, CRM, Fluxo de Trabalho, Tracking e Banco de Ideias.",
  requirements: "Codex CLI instalado e uma conta Vanessa Simoni ativa.",
  dataUsed: ["Leads", "Funis", "Tarefas", "Eventos de tracking", "Ideias"],
  configSummary: "Servidor MCP + OAuth da conta",
  dataIn: ["Comandos do agente"],
  nextStep: "Abra o painel, copie o comando e autorize o acesso no navegador.",
  checklist: ["Codex instalado", "Servidor Vanessa Simoni adicionado", "OAuth aprovado", "Primeira consulta feita"],
  executionSteps: ["Instale o Codex CLI", "Rode o comando de conexão", "Aprove o acesso no navegador", "Peça um panorama de marketing", "Deixe o agente criar as tarefas"],
  fields: [],
  ctaLabel: "Conectar Codex",
 },
 {
  id: "claude-code",
  name: "Claude Code",
  category: "ia",
  categoryLabel: "IA E MODELOS",
  brand: "CC",
  brandColor: "bg-orange-100 text-orange-800",
  logoUrl: "https://www.google.com/s2/favicons?domain=anthropic.com&sz=128",
  status: "desconectado",
  shortDesc: "O Claude Code lê e movimenta sua operação Vanessa Simoni direto do terminal.",
  longDesc: "Conexão por MCP com OAuth. O Claude Code consulta o funil, investiga o tracking, cria leads, move etapas, abre tarefas com prazo e alimenta o Banco de Ideias, tudo dentro do workspace ativo da sua conta.",
  whatItDoes: "Permite que o Claude Code execute ações reais na Vanessa Simoni em vez de apenas conversar sobre elas.",
  requirements: "Claude Code instalado e uma conta Vanessa Simoni ativa.",
  dataUsed: ["Leads", "Funis", "Tarefas", "Eventos de tracking", "Ideias"],
  configSummary: "Servidor MCP + OAuth da conta",
  dataIn: ["Comandos do agente"],
  nextStep: "Abra o painel, copie o comando claude mcp add e autorize o acesso.",
  checklist: ["Claude Code instalado", "Servidor adicionado", "OAuth aprovado", "Primeira consulta feita"],
  executionSteps: ["Instale o Claude Code", "Rode claude mcp add", "Autentique com /mcp", "Aprove o acesso", "Peça as tarefas atrasadas"],
  fields: [],
  ctaLabel: "Conectar Claude Code",
 },
 {
  id: "openclaw",
  name: "OpenClaw",
  category: "ia",
  categoryLabel: "IA E MODELOS",
  brand: "Ow",
  brandColor: "bg-emerald-100 text-emerald-800",
  logoUrl: "https://www.google.com/s2/favicons?domain=openclaw.ai&sz=128",
  status: "desconectado",
  shortDesc: "Agente open source com acesso autorizado ao CRM, tarefas e métricas.",
  longDesc: "O OpenClaw roda na sua máquina e conecta na Vanessa Simoni pelo servidor MCP com OAuth. Serve bem para rotinas diárias: revisar o funil, comparar semanas, investigar tracking e transformar as conclusões em tarefas para a equipe.",
  whatItDoes: "Conecta o OpenClaw às ferramentas da Vanessa Simoni para consultar dados e executar ações no CRM, no Fluxo de Trabalho e no Social Media.",
  requirements: "OpenClaw instalado e uma conta Vanessa Simoni ativa.",
  dataUsed: ["Leads", "Funis", "Tarefas", "Eventos de tracking", "Ideias"],
  configSummary: "Servidor MCP + OAuth da conta",
  dataIn: ["Comandos do agente"],
  nextStep: "Abra o painel, cole o bloco de configuração e autorize o acesso.",
  checklist: ["OpenClaw instalado", "Config colada", "OAuth aprovado", "Primeira consulta feita"],
  executionSteps: ["Instale o OpenClaw", "Cole o bloco no openclaw.json", "Reinicie o OpenClaw", "Aprove o acesso", "Peça o comparativo semanal"],
  fields: [],
  ctaLabel: "Conectar OpenClaw",
 },




 // ============================================================
 // ARQUIVOS / PLANILHAS / CALENDÁRIO
 // ============================================================
  {
  id: "microsoft-office",
  name: "Microsoft 365",
  category: "arquivos",
  categoryLabel: "ARQUIVOS E PLANILHAS",
  brand: "MS",
  brandColor: "bg-blue-100 text-blue-800",
  logoUrl: "https://www.google.com/s2/favicons?domain=microsoft.com&sz=128",
  status: "desconectado",
  shortDesc: "Central Microsoft: uma autorização libera Excel, Word, OneDrive, Outlook, Teams e mais.",
  longDesc: "Esta é a central de tudo que é Microsoft dentro da Vanessa Simoni. Um único OAuth autoriza a sua conta Microsoft 365 e você escolhe quais produtos ativar: Excel (planilhas e importação de dados), Word, PowerPoint, OneDrive e SharePoint (arquivos), Outlook (e-mail e calendário), Teams (mensagens e canais) e Contatos. Não existem conexões Microsoft separadas, tudo passa por aqui.",
  whatItDoes: "Conecta a sua conta Microsoft uma vez e libera todos os produtos do pacote Office suportados, com você escolhendo quais ativar.",
  requirements: "Uma conta Microsoft 365 (pessoal ou corporativa) com acesso aos produtos que você quer usar.",
  dataUsed: ["Planilhas", "Arquivos", "E-mails", "Eventos", "Mensagens"],
  configSummary: "OAuth Microsoft único",
  dataIn: ["Planilhas", "Arquivos", "E-mails", "Eventos"],
  nextStep: "Crie o aplicativo no Entra ID, cole o ID e o segredo e autorize a conta Microsoft.",
  checklist: ["OAuth Microsoft autorizado", "Escopos revisados", "Produtos ativos escolhidos", "Teste em pelo menos um produto"],
  executionSteps: ["Clique em Autorizar Microsoft", "Escolha a conta", "Revise os escopos solicitados", "Volte ao Vanessa Simoni", "Teste abrindo uma planilha do Excel"],
  fields: [{ kind: "oauth", key: "ms_oauth", provider: "microsoft", label: "Autorizar Microsoft" }],
  ctaLabel: "Abrir Microsoft 365 Central",
  keywords: [
  "microsoft",
  "office",
  "pacote office",
  "microsoft 365",
  "office 365",
  "excel",
  "planilha",
  "planilhas",
  "xlsx",
  "csv",
  "word",
  "documento",
  "powerpoint",
  "apresentacao",
  "apresentação",
  "onedrive",
  "sharepoint",
  "outlook",
  "e-mail microsoft",
  "calendario outlook",
  "calendário outlook",
  "teams",
  "microsoft teams",
  "contatos microsoft",
  ],
  },

 {
 id: "conta-google",
 name: "Google Central",
 category: "ads",
 extraCategories: ["email", "arquivos"],
 categoryLabel: "ADS, E-MAIL E ARQUIVOS",
 brand: "G",
 brandColor: "bg-red-100 text-red-700",
 logoUrl: si("google"),
 status: "desconectado",
 shortDesc: "Uma autorização só liga Google Ads, Analytics 4, Tag Manager, Business Profile, Merchant e Workspace.",
 longDesc: "Esta é a central de tudo que é Google dentro da Vanessa Simoni. Um único login autoriza a sua Conta Google e libera: Google Ads (investimento, cliques, CTR, conversões e CPA por campanha), Google Analytics 4 (usuários, sessões, canais e pessoas no site agora), Google Tag Manager (conferir contas, containers, tags e gatilhos publicados), Google Business Profile (visualizações, ligações, rotas, cliques no site e resposta de avaliações), Google Merchant Center (catálogo de produtos) e os produtos Workspace: Agenda, Drive, Sheets, Docs e envio pelo Gmail. Não existem conexões Google separadas, tudo passa por aqui.",
 whatItDoes: "Lê campanhas do Google Ads, relatórios do GA4, tags do GTM, desempenho e avaliações da ficha da empresa, catálogo do Merchant e conecta Agenda, Drive, Sheets, Docs e Gmail.",
 requirements: "Uma Conta Google com acesso aos produtos que você quer usar. Para o Google Ads também é preciso um Developer Token do API Center.",
 dataUsed: ["Campanhas", "Sessões", "Tags", "Ligações e rotas", "Produtos", "Arquivos"],
 configSummary: "OAuth Google único + IDs por produto",
 dataIn: ["Google Ads", "GA4", "GTM", "Business Profile", "Merchant", "Workspace"],
 technicalStatus: [
 { label: "Status", value: "Desconectado" },
 { label: "Produtos", value: "liberados após o login" },
 ],
 nextStep: "Clique em conectar, autorize a Conta Google e depois escolha conta do Ads, propriedade GA4, container do GTM e local da ficha.",
 checklist: [
 "Conta Google com acesso ao Ads, Analytics e ficha da empresa",
 "Todas as permissões aceitas na tela do Google",
 "Developer Token do Google Ads (só para o Ads)",
 "Propriedade GA4 escolhida",
 "Container do Tag Manager escolhido",
 "Local do Business Profile escolhido",
 ],
 executionSteps: [
 "Clique em Conectar Conta Google",
 "Escolha a conta que administra Ads, Analytics e a ficha da empresa",
 "Aceite todas as permissões pedidas",
 "Volte ao Vanessa Simoni e abra a aba do produto que quer usar",
 "Escolha conta, propriedade, container ou local e salve",
 ],
 fields: [],
 ctaLabel: "Abrir central Google",
 keywords: [
 "google",
 "central google",
 "conta google",
 "google ads",
 "ads",
 "adwords",
 "campanha google",
 "google analytics",
 "analytics",
 "ga4",
 "google tag manager",
 "tag manager",
 "gtm",
 "tags",
 "google business",
 "google meu negocio",
 "meu negócio",
 "business profile",
 "ficha da empresa",
 "avaliacoes google",
 "merchant",
 "google merchant center",
 "catalogo google",
 "google drive",
 "drive",
 "google sheets",
 "sheets",
 "planilha",
 "planilhas",
 "spreadsheet",
 "google docs",
 "docs",
 "documentos",
 "gmail",
 "e-mail google",
 "google agenda",
 "agenda",
 "calendar",
 "google calendar",
 "calendario",
 "google meet",
 "meet",
 "google forms",
 "formularios google",
 "google slides",
 "apresentacoes",
 "google contacts",
 "contatos",
 "google tasks",
 "tarefas",
 "arquivos",
 "upload",
 "oauth google",
 "workspace google",
 ],
 },


 // ============================================================
 // EMAIL
 // ============================================================
  {
  id: "email",
  name: "E-mail Central",
  category: "email",
  categoryLabel: "EMAIL",
  brand: "@",
  brandColor: "bg-blue-100 text-blue-700",
  logoUrl: si("maildotru"),
  status: "desconectado",
   shortDesc: "Conecte Brevo, Resend, SendGrid ou Mailgun para disparos reais. Gmail entra quando a Google Central estiver liberada.",
  longDesc:
    "Central única de envio de e-mail. O caminho funcional hoje usa Brevo, Resend, SendGrid ou Mailgun com chave do próprio cliente e passo a passo dentro do painel. O Gmail aparece como opção rápida quando a Google Central estiver liberada.",
  whatItDoes:
    "Dispara e-mails das automações, das campanhas e dos avisos do CRM usando o remetente que você escolher.",
   requirements: "Chave de API de Brevo, Resend, SendGrid ou Mailgun. Gmail depende da Google Central.",
  dataUsed: ["Envios", "Remetente", "Respostas"],
   configSummary: "Provedor de envio por chave de API",
  dataIn: ["Envios"],
   nextStep: "Abra o painel, escolha um provedor de envio e mande um teste.",
  checklist: [
    "Remetente definido",
    "Conexão salva",
    "Teste de envio recebido",
    "Automações apontadas para o remetente",
  ],
  executionSteps: [
    "Abra o painel de e-mail",
     "Escolha Brevo, Resend, SendGrid ou Mailgun",
    "Confirme o remetente",
    "Envie um teste para você mesmo",
  ],
  fields: [],
  ctaLabel: "Configurar e-mail",
  },


 // ============================================================
 // VOZ, ÁUDIO, TELEFONIA
 // ============================================================
 {
 id: "elevenlabs",
 name: "ElevenLabs",
 category: "voz",
 categoryLabel: "VOZ, ÁUDIO E TELEFONIA",
 brand: "11",
 brandColor: "bg-slate-900 text-white",
 logoUrl: si("elevenlabs"),
 status: "em_preparacao",
 shortDesc: "TTS em alta fidelidade com voice id e limites de custo.",
 longDesc: "API Key + Voice ID + modelo.",
 whatItDoes: "Gera áudio TTS para campanhas e atendimentos.",
 requirements: "API Key + Voice ID.",
 dataUsed: ["Áudios"],
 configSummary: "API Key + Voice ID",
 dataIn: ["Áudios"],
 nextStep: "Informe API Key e Voice ID.",
 checklist: ["API Key gerada", "Voice ID escolhido", "Modelo definido", "Limite de custo"],
 executionSteps: ["Acesse elevenlabs.io", "Gere API Key", "Escolha Voice ID", "Cole abaixo", "Teste amostra"],
 fields: [
 { kind: "secret", key: "api_key", label: "API Key", placeholder: "..." },
 { kind: "text", key: "voice_id", label: "Voice ID", placeholder: "..." },
 ],
 ctaLabel: "Preparar ElevenLabs",
 },
 {
 id: "deepgram",
 name: "Deepgram",
 category: "voz",
 categoryLabel: "VOZ, ÁUDIO E TELEFONIA",
 brand: "Dg",
 brandColor: "bg-emerald-100 text-emerald-700",
 logoUrl: "https://www.google.com/s2/favicons?domain=deepgram.com&sz=128",
 status: "em_preparacao",
 shortDesc: "Transcrição STT em tempo real com modelo configurável.",
 longDesc: "API Key + modelo + idioma.",
 whatItDoes: "Transcreve áudio em tempo real para Inbox/Call Center.",
 requirements: "API Key.",
 dataUsed: ["Áudios", "Transcrições"],
 configSummary: "API Key",
 dataIn: ["Áudios"],
 nextStep: "Informe API Key e modelo.",
 checklist: ["API Key gerada", "Modelo escolhido", "Idioma definido", "Limite de custo"],
 executionSteps: ["Acesse deepgram.com", "Gere API Key", "Escolha modelo", "Cole abaixo", "Teste amostra"],
 fields: [
 { kind: "secret", key: "api_key", label: "API Key", placeholder: "..." },
 { kind: "text", key: "model", label: "Modelo", placeholder: "nova-2" },
 ],
 ctaLabel: "Preparar Deepgram",
 },
 {
 id: "assemblyai",
 name: "AssemblyAI",
 category: "voz",
 categoryLabel: "VOZ, ÁUDIO E TELEFONIA",
 brand: "Aa",
 brandColor: "bg-violet-100 text-violet-700",
 logoUrl: "https://www.google.com/s2/favicons?domain=assemblyai.com&sz=128",
 status: "em_preparacao",
 shortDesc: "Transcrição com diarização e análise para Call Center.",
 longDesc: "API Key + modelo.",
 whatItDoes: "Transcreve e analisa chamadas para qualidade e insights.",
 requirements: "API Key.",
 dataUsed: ["Áudios", "Transcrições"],
 configSummary: "API Key",
 dataIn: ["Áudios"],
 nextStep: "Informe API Key.",
 checklist: ["API Key gerada", "Modelo escolhido", "Idioma definido", "Limite de custo"],
 executionSteps: ["Acesse assemblyai.com", "Gere API Key", "Escolha modelo", "Cole abaixo", "Teste amostra"],
 fields: [{ kind: "secret", key: "api_key", label: "API Key", placeholder: "..." }],
 ctaLabel: "Preparar AssemblyAI",
 },
 {
 id: "twilio",
 name: "Twilio",
 category: "voz",
 categoryLabel: "VOZ, ÁUDIO E TELEFONIA",
 brand: "Tw",
 brandColor: "bg-red-100 text-red-700",
 logoUrl: twilioLogo,
 status: "em_preparacao",
 shortDesc: "SMS, voz e WhatsApp via Twilio com números autorizados.",
 longDesc: "Account SID + Auth Token + número autorizado.",
 whatItDoes: "Envia SMS, faz/recebe ligações e mensagens via Twilio.",
 requirements: "Account SID + Auth Token + Phone Number.",
 dataUsed: ["Mensagens", "Chamadas"],
 configSummary: "Account SID + Auth Token",
 dataIn: ["Mensagens", "Chamadas"],
 nextStep: "Informe credenciais Twilio.",
 checklist: ["Account SID copiado", "Auth Token gerado", "Phone Number autorizado", "Webhook configurado"],
 executionSteps: ["Acesse console.twilio.com", "Copie SID e Token", "Compre/autorize número", "Cole abaixo", "Teste envio"],
 fields: [
 { kind: "text", key: "account_sid", label: "Account SID", placeholder: "AC..." },
 { kind: "secret", key: "auth_token", label: "Auth Token", placeholder: "..." },
 { kind: "text", key: "phone_number", label: "Phone Number", placeholder: "+55..." },
 ],
 ctaLabel: "Preparar Twilio",
 },
 {
 id: "zenvia",
 name: "Zenvia",
 category: "voz",
 categoryLabel: "VOZ, ÁUDIO E TELEFONIA",
 brand: "Zv",
 brandColor: "bg-cyan-100 text-cyan-700",
 logoUrl: "https://www.google.com/s2/favicons?domain=zenvia.com&sz=128",
 status: "em_preparacao",
 shortDesc: "SMS, WhatsApp e RCS via Zenvia com remetente autorizado.",
 longDesc: "API Token + remetente.",
 whatItDoes: "Envia SMS/WhatsApp/RCS via Zenvia.",
 requirements: "API Token + remetente.",
 dataUsed: ["Mensagens"],
 configSummary: "API Token + remetente",
 dataIn: ["Mensagens"],
 nextStep: "Informe API Token e remetente.",
 checklist: ["Token gerado", "Remetente aprovado", "Webhook configurado", "Teste enviado"],
 executionSteps: ["Acesse app.zenvia.com", "Gere API Token", "Configure remetente", "Cole abaixo", "Teste envio"],
 fields: [
 { kind: "secret", key: "api_token", label: "API Token", placeholder: "..." },
 { kind: "text", key: "sender", label: "Remetente", placeholder: "..." },
 ],
 ctaLabel: "Preparar Zenvia",
 },
 {
 id: "plivo",
 name: "Plivo",
 category: "voz",
 categoryLabel: "VOZ, ÁUDIO E TELEFONIA",
 brand: "Pl",
 brandColor: "bg-amber-100 text-amber-700",
 logoUrl: "https://www.google.com/s2/favicons?domain=plivo.com&sz=128",
 status: "em_preparacao",
 shortDesc: "SMS e voz via Plivo com Auth ID/Token.",
 longDesc: "Auth ID + Auth Token + número autorizado.",
 whatItDoes: "Envia SMS e gerencia chamadas via Plivo.",
 requirements: "Auth ID + Auth Token + Phone Number.",
 dataUsed: ["Mensagens", "Chamadas"],
 configSummary: "Auth ID + Token",
 dataIn: ["Mensagens", "Chamadas"],
 nextStep: "Informe credenciais Plivo.",
 checklist: ["Auth ID copiado", "Auth Token gerado", "Número autorizado", "Webhook configurado"],
 executionSteps: ["Acesse console.plivo.com", "Copie credenciais", "Autorize número", "Cole abaixo", "Teste envio"],
 fields: [
 { kind: "text", key: "auth_id", label: "Auth ID", placeholder: "..." },
 { kind: "secret", key: "auth_token", label: "Auth Token", placeholder: "..." },
 { kind: "text", key: "phone_number", label: "Phone Number", placeholder: "+55..." },
 ],
 ctaLabel: "Preparar Plivo",
 },
 {
 id: "vonage",
 name: "Vonage",
 category: "voz",
 categoryLabel: "VOZ, ÁUDIO E TELEFONIA",
 brand: "Vn",
 brandColor: "bg-fuchsia-100 text-fuchsia-700",
 logoUrl: si("vonage"),
 status: "em_preparacao",
 shortDesc: "SMS, voz e mensageria via Vonage com API Key/Secret.",
 longDesc: "API Key + API Secret + número.",
 whatItDoes: "Envia SMS e gerencia voz via Vonage.",
 requirements: "API Key + Secret + Phone Number.",
 dataUsed: ["Mensagens", "Chamadas"],
 configSummary: "API Key + Secret",
 dataIn: ["Mensagens", "Chamadas"],
 nextStep: "Informe credenciais Vonage.",
 checklist: ["API Key copiada", "Secret gerado", "Número autorizado", "Webhook configurado"],
 executionSteps: ["Acesse dashboard.vonage.com", "Copie credenciais", "Autorize número", "Cole abaixo", "Teste envio"],
 fields: [
 { kind: "text", key: "api_key", label: "API Key", placeholder: "..." },
 { kind: "secret", key: "api_secret", label: "API Secret", placeholder: "..." },
 { kind: "text", key: "phone_number", label: "Phone Number", placeholder: "+55..." },
 ],
 ctaLabel: "Preparar Vonage",
 },

 // ============================================================
 // ASSINATURA DIGITAL
 // ============================================================
 {
 id: "clicksign",
 name: "Clicksign",
 category: "assinatura",
 categoryLabel: "ASSINATURA DIGITAL",
 brand: "Cs",
 brandColor: "bg-emerald-100 text-emerald-700",
 logoUrl: "https://www.google.com/s2/favicons?domain=clicksign.com&sz=128",
 status: "em_preparacao",
 shortDesc: "Envio e acompanhamento de documentos para assinatura.",
 longDesc: "API Token + Webhook Secret.",
 whatItDoes: "Cria documentos e acompanha status de assinaturas.",
 requirements: "API Token + Webhook Secret.",
 dataUsed: ["Documentos", "Assinaturas"],
 configSummary: "API Token",
 dataIn: ["Documentos"],
 nextStep: "Informe API Token e Webhook Secret.",
 checklist: ["Conta Clicksign ativa", "API Token gerado", "Webhook configurado", "Teste enviado"],
 executionSteps: ["Acesse app.clicksign.com", "Gere API Token", "Configure webhook", "Cole abaixo", "Teste documento"],
 fields: [
 { kind: "secret", key: "api_token", label: "API Token", placeholder: "..." },
 { kind: "secret", key: "webhook_secret", label: "Webhook Secret", placeholder: "..." },
 ],
 ctaLabel: "Preparar Clicksign",
 },
 {
 id: "zapsign",
 name: "ZapSign",
 category: "assinatura",
 categoryLabel: "ASSINATURA DIGITAL",
 brand: "Zs",
 brandColor: "bg-yellow-100 text-yellow-700",
 logoUrl: "https://www.google.com/s2/favicons?domain=zapsign.com.br&sz=128",
 status: "em_preparacao",
 shortDesc: "Assinatura digital com API Token e webhooks.",
 longDesc: "API Token + Webhook Secret.",
 whatItDoes: "Cria documentos e acompanha status no ZapSign.",
 requirements: "API Token + Webhook Secret.",
 dataUsed: ["Documentos"],
 configSummary: "API Token",
 dataIn: ["Documentos"],
 nextStep: "Informe API Token e Webhook Secret.",
 checklist: ["Conta ZapSign ativa", "API Token gerado", "Webhook configurado", "Teste enviado"],
 executionSteps: ["Acesse app.zapsign.com.br", "Gere API Token", "Configure webhook", "Cole abaixo", "Teste documento"],
 fields: [
 { kind: "secret", key: "api_token", label: "API Token", placeholder: "..." },
 { kind: "secret", key: "webhook_secret", label: "Webhook Secret", placeholder: "..." },
 ],
 ctaLabel: "Preparar ZapSign",
 },
 {
 id: "docusign",
 name: "DocuSign",
 category: "assinatura",
 categoryLabel: "ASSINATURA DIGITAL",
 brand: "Ds",
 brandColor: "bg-yellow-100 text-yellow-800",
 logoUrl: docusignLogo,
 status: "em_preparacao",
 shortDesc: "Assinatura empresarial DocuSign via OAuth.",
 longDesc: "OAuth DocuSign + Account ID.",
 whatItDoes: "Cria envelopes e acompanha assinaturas no DocuSign.",
 requirements: "OAuth + Account ID.",
 dataUsed: ["Envelopes"],
 configSummary: "OAuth + Account ID",
 dataIn: ["Envelopes"],
 nextStep: "Autorize DocuSign e informe Account ID.",
 checklist: ["Conta ativa", "App OAuth criado", "Account ID copiado", "Webhook configurado"],
 executionSteps: ["Acesse account.docusign.com", "Crie app integração", "Autorize", "Cole Account ID", "Teste envelope"],
 fields: [
 { kind: "text", key: "account_id", label: "Account ID", placeholder: "..." },
 { kind: "oauth", key: "docusign_oauth", provider: "docusign", label: "Autorizar DocuSign" },
 ],
 ctaLabel: "Preparar DocuSign",
 },
];


export function summarizeStatus(items: Integration[]) {
 return {
 conectado: items.filter((i) => i.status === "conectado").length,
 desconectado: items.filter((i) => i.status === "desconectado").length,
 em_preparacao: items.filter((i) => i.status === "em_preparacao").length,
 total: items.length,
 };
}

export function groupByCategory(items: Integration[]) {
 const map = new Map<IntegrationCategory, Integration[]>();
 for (const i of items) {
 if (!map.has(i.category)) map.set(i.category, []);
 map.get(i.category)!.push(i);
 }
 return map;
}

export const STATUS_META: Record<
 IntegrationStatus,
 { label: string; chip: string; dot: string }
> = {
 conectado: {
 label: "Conectado",
 chip: "bg-success/10 text-success border-success/20",
 dot: "bg-success",
 },
 desconectado: {
 // Integração pronta, só falta o cliente conectar. Nada de alerta vermelho aqui.
 label: "Pronta para conectar",
 chip: "bg-muted text-muted-foreground border-border",
 dot: "bg-muted-foreground/50",
 },

 em_preparacao: {
 label: "Em preparação",
 chip: "bg-warning/10 text-warning border-warning/20",
 dot: "bg-warning",
 },
};
