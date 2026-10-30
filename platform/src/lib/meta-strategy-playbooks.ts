// Playbooks = modelos prontos de estratégia de tráfego.
// Cada um preenche description, copyGuidelines, budget config, bid strategy e regras de automação.
// A ideia: o cliente não precisa contratar gestor de tráfego, a plataforma entrega os modelos que gestores usam.

export type PlaybookRule = {
  name: string;
  enabled: boolean;
  scope_level: "campaign" | "adset" | "ad";
  trigger_metric: string;
  trigger_operator: "gt" | "gte" | "lt" | "lte" | "eq";
  trigger_value: number;
  trigger_window: "last_1d" | "last_3d" | "last_7d" | "last_14d" | "last_30d";
  action_type: string;
  action_value: number | null;
  cooldown_minutes: number;
  interval_minutes: number;
};

export type PlaybookConfigField = {
  key: string;
  label: string;
  type: "number" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean;
  help?: string;
};

export type Playbook = {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  when: string;
  budgetMode: "daily" | "lifetime";
  budgetLevel: "campaign" | "adset";
  bidStrategy: string | null;
  description: string;
  copyGuidelines: string;
  rules: PlaybookRule[];
  config?: Record<string, unknown>;
  configFields?: PlaybookConfigField[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const PLAYBOOKS: Playbook[] = [
  {
    id: "low_cost",
    name: "Baixo custo / Distribuição",
    tagline: "Vários conjuntos com orçamento mínimo variando levemente entre si. Mesmo criativo, mesma copy.",
    icon: "🎯",
    when: "Quando você quer que a Meta encontre o melhor bolso de audiência sozinha. Ideal pra produto novo, oferta com margem apertada, ou quando o CPL fica instável no ABO tradicional.",
    budgetMode: "daily",
    budgetLevel: "adset",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    description: `MODELO: BAIXO CUSTO / DUPLICAÇÃO EM ESCALA
Objetivo: usar o algoritmo da Meta como distribuidor. Em vez de um conjunto com orçamento alto, criamos N conjuntos idênticos (mesmo criativo, mesma copy, mesmo público) porém com orçamento levemente diferente, todos beirando o mínimo permitido pela conta.

Como funciona:
1. Escolha o valor mínimo aceito pela conta (normalmente entre R$ 6 e R$ 10/dia).
2. Duplique o conjunto N vezes (recomendado: 6 a 12 duplicações iniciais).
3. Varie o orçamento em ±20% entre as cópias (ex: 6, 7, 8, 9, 10, 12 reais/dia).
4. NÃO altere criativo/copy/público entre as cópias, só o valor.
5. Deixe 48-72h de aprendizado antes de decidir.

O que esperar:
- Alguns conjuntos vão simplesmente não gastar, normal, é o algoritmo escolhendo o bolso mais barato.
- 20-30% das cópias tendem a concentrar a maior parte do resultado.
- CPL médio costuma ficar 15-40% abaixo de um conjunto único com o mesmo orçamento total.

Quando escalar: só depois de identificar os 2-3 conjuntos vencedores, duplique-os de novo (nova rodada) ou aumente o orçamento deles em 20% por dia.`,
    copyGuidelines: `TOM: direto, específico, sem hype. Como se você estivesse conversando 1:1.
ESTRUTURA da primary text:
- Linha 1: dor específica ou pergunta que ativa reconhecimento.
- Linhas 2-4: prova / mecanismo / como resolve.
- Linha final: CTA claro (chama no direct / clica no link / manda "quero saber mais").
HEADLINE: benefício concreto em até 5 palavras.
EVITE: adjetivos vazios ("incrível", "revolucionário"), promessas irreais, emojis em excesso.`,
    rules: [
      { name: "Pausar cópia com CPL 2x acima da meta", enabled: true, scope_level: "adset", trigger_metric: "cpl", trigger_operator: "gt", trigger_value: 60, trigger_window: "last_3d", action_type: "pause_adset", action_value: null, cooldown_minutes: 720, interval_minutes: 120 },
      { name: "Pausar cópia sem resultado gastando o suficiente", enabled: true, scope_level: "adset", trigger_metric: "spend", trigger_operator: "gt", trigger_value: 30, trigger_window: "last_3d", action_type: "pause_adset", action_value: null, cooldown_minutes: 1440, interval_minutes: 240 },
      { name: "Duplicar cópia vencedora (CPL bom)", enabled: true, scope_level: "adset", trigger_metric: "cpl", trigger_operator: "lt", trigger_value: 15, trigger_window: "last_7d", action_type: "duplicate_adset", action_value: null, cooldown_minutes: 2880, interval_minutes: 360 },
      { name: "Alerta: frequência muito alta", enabled: true, scope_level: "adset", trigger_metric: "frequency", trigger_operator: "gt", trigger_value: 3.5, trigger_window: "last_7d", action_type: "notify_only", action_value: null, cooldown_minutes: 1440, interval_minutes: 240 },
    ],
    config: {
      duplicationCount: 8,
      minBudget: 6,
      maxBudget: 12,
      variationPct: 20,
      keepCreative: true,
      keepCopy: true,
      keepAudience: true,
    },
    configFields: [
      { key: "duplicationCount", label: "Nº de duplicações", type: "number", min: 2, max: 30, default: 8, help: "Quantos conjuntos idênticos serão criados." },
      { key: "minBudget", label: "Orçamento mínimo (R$/dia)", type: "number", min: 1, step: 0.5, default: 6 },
      { key: "maxBudget", label: "Orçamento máximo (R$/dia)", type: "number", min: 1, step: 0.5, default: 12 },
      { key: "variationPct", label: "Variação (%)", type: "number", min: 0, max: 100, default: 20 },
      { key: "keepCreative", label: "Manter criativo", type: "boolean", default: true },
      { key: "keepCopy", label: "Manter copy", type: "boolean", default: true },
      { key: "keepAudience", label: "Manter público", type: "boolean", default: true },
    ],
  },
  {
    id: "vertical_scale",
    name: "Escala vertical",
    tagline: "Aumentar orçamento das campanhas vencedoras em % controlado, sem quebrar o aprendizado.",
    icon: "📈",
    when: "Quando você já tem campanhas com CPL/ROAS dentro da meta e quer aumentar volume sem estourar o custo.",
    budgetMode: "daily",
    budgetLevel: "campaign",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    description: `MODELO: ESCALA VERTICAL (aumento controlado de orçamento)
Objetivo: aumentar volume mantendo o CPL/ROAS dentro da meta.

Regra de ouro: no máximo +20% de orçamento por dia por campanha. Aumentos maiores reiniciam a fase de aprendizado e o CPL sobe.

Fluxo:
1. Identifique campanhas com pelo menos 7 dias rodando e CPL/ROAS dentro da meta.
2. Aumente 20% no orçamento diário.
3. Espere 48h e reavalie: se o CPL/ROAS piorou mais de 15%, volte o orçamento anterior.
4. Se manteve, repita o ciclo.

Sinais de teto:
- Frequência > 3,5 no público frio.
- CPM subindo consistentemente.
- CTR caindo dia a dia.
Quando bater teto, é hora de partir pra escala horizontal.`,
    copyGuidelines: `Manter EXATAMENTE a copy e criativo que já performam, não trocar durante a escala.
Se precisar refrescar criativo por fadiga, faça em novo conjunto/campanha, não na que está escalando.`,
    rules: [
      { name: "Escalar +20% quando CPL abaixo da meta", enabled: true, scope_level: "campaign", trigger_metric: "cpl", trigger_operator: "lt", trigger_value: 20, trigger_window: "last_7d", action_type: "increase_budget", action_value: 20, cooldown_minutes: 1440, interval_minutes: 240 },
      { name: "Reduzir orçamento se CPL disparar", enabled: true, scope_level: "campaign", trigger_metric: "cpl", trigger_operator: "gt", trigger_value: 40, trigger_window: "last_3d", action_type: "decrease_budget", action_value: 20, cooldown_minutes: 720, interval_minutes: 120 },
      { name: "Pausar se CPL 3x acima da meta", enabled: true, scope_level: "campaign", trigger_metric: "cpl", trigger_operator: "gt", trigger_value: 80, trigger_window: "last_3d", action_type: "pause_campaign", action_value: null, cooldown_minutes: 1440, interval_minutes: 120 },
      { name: "Alerta de saturação (frequência)", enabled: true, scope_level: "campaign", trigger_metric: "frequency", trigger_operator: "gt", trigger_value: 3.5, trigger_window: "last_7d", action_type: "notify_only", action_value: null, cooldown_minutes: 1440, interval_minutes: 240 },
    ],
    config: { stepPct: 20, maxDailyBudget: 500, cooldownHours: 24, revertPct: 15 },
    configFields: [
      { key: "stepPct", label: "% de aumento por ciclo", type: "number", min: 5, max: 100, default: 20, help: "Recomendado 20% pra não quebrar o aprendizado." },
      { key: "cooldownHours", label: "Cooldown entre aumentos (h)", type: "number", min: 12, max: 168, default: 24 },
      { key: "revertPct", label: "% de piora que reverte", type: "number", min: 5, max: 100, default: 15, help: "Se CPL/ROAS piorar mais que isso, volta orçamento anterior." },
      { key: "maxDailyBudget", label: "Orçamento máximo (R$/dia)", type: "number", min: 10, default: 500, help: "Teto de segurança da escala." },
    ],
  },
  {
    id: "horizontal_scale",
    name: "Escala horizontal",
    tagline: "Duplicar conjuntos vencedores mudando público, posicionamento ou criativo.",
    icon: "🔀",
    when: "Quando a escala vertical atingiu o teto, frequência alta, CTR caindo, CPM subindo.",
    budgetMode: "daily",
    budgetLevel: "adset",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    description: `MODELO: ESCALA HORIZONTAL (duplicação com variações)
Objetivo: replicar o que funciona em novos -ngulos pra aumentar volume total sem saturar um único público.

Eixos de duplicação (varie UM por vez):
- PÚBLICO: interesses adjacentes, faixa etária diferente, lookalike de compradores, região nova.
- POSICIONAMENTO: separar Reels, Feed, Stories em conjuntos próprios.
- CRIATIVO: variação de -ngulo mantendo a mesma oferta.
- COPY: mesma promessa, headline/CTA diferente.

Não mude 2 eixos ao mesmo tempo, você perde a leitura do que causou a mudança.

Ritmo: 3-5 conjuntos novos por semana. Corte o que não bateu meta em 4-5 dias.`,
    copyGuidelines: `Cada variação horizontal precisa ter 1 diferença clara e nomeada.
Convenção de nome sugerida: [Persona] · [Ângulo] · [Formato], ex: "Mães 30-40 · Autoridade · Reels".
Mantenha um "conjunto controle" com a versão original rodando em paralelo pra comparação.`,
    rules: [
      { name: "Pausar variação sem resultado", enabled: true, scope_level: "adset", trigger_metric: "cpl", trigger_operator: "gt", trigger_value: 45, trigger_window: "last_3d", action_type: "pause_adset", action_value: null, cooldown_minutes: 720, interval_minutes: 120 },
      { name: "Escalar variação vencedora", enabled: true, scope_level: "adset", trigger_metric: "cpl", trigger_operator: "lt", trigger_value: 18, trigger_window: "last_7d", action_type: "increase_budget", action_value: 20, cooldown_minutes: 1440, interval_minutes: 240 },
      { name: "Duplicar variação campeã pra próximo lookalike", enabled: false, scope_level: "adset", trigger_metric: "results", trigger_operator: "gte", trigger_value: 20, trigger_window: "last_7d", action_type: "duplicate_adset", action_value: null, cooldown_minutes: 2880, interval_minutes: 360 },
      { name: "Alerta: CTR do link caindo", enabled: true, scope_level: "adset", trigger_metric: "ctr_link", trigger_operator: "lt", trigger_value: 0.8, trigger_window: "last_3d", action_type: "notify_only", action_value: null, cooldown_minutes: 720, interval_minutes: 240 },
    ],
    config: { variantsPerWeek: 4, cutoffDays: 5, axesLocked: "one" },
    configFields: [
      { key: "variantsPerWeek", label: "Variações novas por semana", type: "number", min: 1, max: 20, default: 4 },
      { key: "cutoffDays", label: "Dias pra cortar sem resultado", type: "number", min: 2, max: 14, default: 5 },
      { key: "budgetPerVariant", label: "Orçamento por variação (R$/dia)", type: "number", min: 5, default: 30 },
    ],
  },
  {
    id: "cbo_advantage",
    name: "CBO / Advantage+",
    tagline: "Orçamento na campanha e deixa a Meta distribuir entre 4-6 conjuntos.",
    icon: "🤖",
    when: "Quando você tem 3+ públicos qualificados e quer que a Meta decida onde investir. Bom pra e-commerce e ofertas maduras.",
    budgetMode: "daily",
    budgetLevel: "campaign",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    description: `MODELO: CBO (Campaign Budget Optimization) / Advantage+
Objetivo: uma campanha, orçamento centralizado, 4-6 conjuntos com públicos e criativos DIFERENTES. A Meta escolhe onde alocar em tempo real.

Regras de setup:
- MESMA campanha, MESMO objetivo.
- 4 a 6 conjuntos, nem menos (pouca variação) nem mais (dilui aprendizado).
- Públicos DEVEM ser diferentes entre si (evita sobreposição).
- Cada conjunto com pelo menos 2 criativos.
- Orçamento total da campanha deve ser >= 20x o CPL alvo (senão não sai da fase de aprendizado).

O que NÃO fazer:
- Não pausar conjuntos individuais nos 3 primeiros dias, deixa a Meta calibrar.
- Não mudar orçamento com menos de 3 dias rodando.
- Não misturar objetivos diferentes na mesma CBO.`,
    copyGuidelines: `Cada conjunto pode ter tom levemente diferente conforme o público, mas mantenha a MESMA promessa central.
Diretriz: 1 headline forte + primary text de 3-5 linhas com prova social.`,
    rules: [
      { name: "Pausar campanha com CPL 2x meta", enabled: true, scope_level: "campaign", trigger_metric: "cpl", trigger_operator: "gt", trigger_value: 60, trigger_window: "last_3d", action_type: "pause_campaign", action_value: null, cooldown_minutes: 720, interval_minutes: 120 },
      { name: "Escalar campanha com ROAS bom", enabled: true, scope_level: "campaign", trigger_metric: "roas", trigger_operator: "gt", trigger_value: 3, trigger_window: "last_7d", action_type: "increase_budget", action_value: 15, cooldown_minutes: 1440, interval_minutes: 240 },
      { name: "Alerta gasto sem conversão", enabled: true, scope_level: "campaign", trigger_metric: "spend", trigger_operator: "gt", trigger_value: 150, trigger_window: "last_3d", action_type: "notify_only", action_value: null, cooldown_minutes: 1440, interval_minutes: 120 },
    ],
    config: { adsetsCount: 5, adsPerAdset: 2, minCampaignBudget: 200 },
    configFields: [
      { key: "adsetsCount", label: "Nº de conjuntos", type: "number", min: 3, max: 10, default: 5, help: "Recomendado 4-6." },
      { key: "adsPerAdset", label: "Anúncios por conjunto", type: "number", min: 1, max: 6, default: 2 },
      { key: "minCampaignBudget", label: "Orçamento total da campanha (R$/dia)", type: "number", min: 20, default: 200, help: "Deve ser >= 20x o CPL alvo." },
    ],
  },
  {
    id: "cold_prospecting",
    name: "Prospecção fria",
    tagline: "Público amplo/interesses novos, criativo direto de topo de funil.",
    icon: "❄️",
    when: "Pra alimentar o topo do funil e gerar público morno/quente para retargeting.",
    budgetMode: "daily",
    budgetLevel: "adset",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    description: `MODELO: PROSPECÇÃO FRIA
Objetivo: apresentar a marca/oferta pra gente que nunca ouviu falar.

Setup recomendado:
- Público: interesses amplos (2-5M) OU público aberto + Advantage detailed targeting on.
- Criativo: 3-4 variações de -ngulo (dor, desejo, autoridade, prova social).
- Formato: preferir vídeo curto (15-30s) + carrossel estático.
- CTA: baixa fricção, mensagem, formulário nativo, quiz.

KPIs de saúde:
- CTR do link >= 1%.
- Frequência <= 2 nos primeiros 7 dias.
- Custo por thruplay/engajamento consistente = boa retenção de atenção.`,
    copyGuidelines: `Hook nos 3 primeiros segundos / 5 primeiras palavras. Zero jargão.
Estrutura: PROBLEMA → AGITAÇÃO → SOLUÇÃO → PROVA → CTA.
Prefira storytelling curto (uma cena) sobre listas de benefícios.`,
    rules: [
      { name: "Pausar CTR muito baixo (criativo fraco)", enabled: true, scope_level: "ad", trigger_metric: "ctr_link", trigger_operator: "lt", trigger_value: 0.5, trigger_window: "last_3d", action_type: "pause_ad", action_value: null, cooldown_minutes: 720, interval_minutes: 240 },
      { name: "Pausar sem resultado após aprendizado", enabled: true, scope_level: "adset", trigger_metric: "spend", trigger_operator: "gt", trigger_value: 50, trigger_window: "last_3d", action_type: "pause_adset", action_value: null, cooldown_minutes: 1440, interval_minutes: 240 },
      { name: "Alerta frequência alta em público frio", enabled: true, scope_level: "adset", trigger_metric: "frequency", trigger_operator: "gt", trigger_value: 2.5, trigger_window: "last_7d", action_type: "notify_only", action_value: null, cooldown_minutes: 1440, interval_minutes: 240 },
    ],
    config: { creativeAngles: 4, budgetPerAdset: 40, maxFrequency: 2 },
    configFields: [
      { key: "creativeAngles", label: "Ângulos de criativo", type: "number", min: 2, max: 8, default: 4, help: "Dor / desejo / autoridade / prova social." },
      { key: "budgetPerAdset", label: "Orçamento por conjunto (R$/dia)", type: "number", min: 10, default: 40 },
      { key: "maxFrequency", label: "Frequência alvo (7d)", type: "number", min: 1, max: 5, step: 0.5, default: 2 },
    ],
  },
  {
    id: "warm_retargeting",
    name: "Retargeting quente",
    tagline: "Frequência controlada em quem já engajou, com oferta/prova reforçada.",
    icon: "🔥",
    when: "Pra fechar quem já viu conteúdo, entrou no site ou conversou no direct.",
    budgetMode: "daily",
    budgetLevel: "adset",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    description: `MODELO: RETARGETING QUENTE
Objetivo: converter quem já demonstrou interesse.

Públicos recomendados (em separado, um conjunto por público):
- Quem visitou o site nos últimos 30 dias e não comprou.
- Quem engajou com IG/FB nos últimos 60 dias.
- Quem viu 50%+ dos vídeos dos últimos 30 dias.
- Lista de leads / clientes (exclusões corretas).

Setup:
- Orçamento por conjunto menor que prospecção (público é finito).
- Frequência ALVO: 2-4 em janela de 7 dias.
- Criativo específico de retargeting: prova social + urgência + reforço de oferta.
- Exclua compradores recentes SEMPRE.`,
    copyGuidelines: `Tom: "vi que você chegou perto, deixa eu te ajudar a decidir".
Elementos obrigatórios: prova social (número, depoimento, marca) + reforço de garantia/risco baixo + CTA de baixa fricção ("responde só SIM que eu te chamo").`,
    rules: [
      { name: "Pausar com frequência estourada", enabled: true, scope_level: "adset", trigger_metric: "frequency", trigger_operator: "gt", trigger_value: 5, trigger_window: "last_7d", action_type: "pause_adset", action_value: null, cooldown_minutes: 1440, interval_minutes: 240 },
      { name: "Escalar retargeting com ROAS alto", enabled: true, scope_level: "adset", trigger_metric: "roas", trigger_operator: "gt", trigger_value: 4, trigger_window: "last_7d", action_type: "increase_budget", action_value: 15, cooldown_minutes: 1440, interval_minutes: 240 },
      { name: "Alerta CPM disparando", enabled: true, scope_level: "adset", trigger_metric: "cpm", trigger_operator: "gt", trigger_value: 80, trigger_window: "last_3d", action_type: "notify_only", action_value: null, cooldown_minutes: 1440, interval_minutes: 240 },
    ],
    config: { audienceWindowDays: 30, budgetPerAdset: 25, targetFrequency: 3, excludeBuyers: true },
    configFields: [
      { key: "audienceWindowDays", label: "Janela do público (dias)", type: "number", min: 7, max: 180, default: 30 },
      { key: "budgetPerAdset", label: "Orçamento por conjunto (R$/dia)", type: "number", min: 5, default: 25 },
      { key: "targetFrequency", label: "Frequência alvo (7d)", type: "number", min: 1, max: 6, step: 0.5, default: 3 },
      { key: "excludeBuyers", label: "Excluir compradores recentes", type: "boolean", default: true },
    ],
  },
];

// Utilitário: gera rules com IDs frescos ao aplicar um playbook.
export function materializePlaybookRules(playbook: Playbook): Array<PlaybookRule & { id: string }> {
  return playbook.rules.map((r) => ({ ...r, id: uid() }));
}
