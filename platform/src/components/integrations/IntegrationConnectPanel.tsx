import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, ExternalLink, Info } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  saveOpenAIIntegration, saveGeminiIntegration, testIntegration,
  saveDesignAIIntegration,
} from "@/lib/integrations.functions";

type Provider = "openai" | "gemini" | "ideogram" | "recraft" | "freepik";

interface CostRow {
  action: string;
  unit: string;
  price: string;
}

interface ProviderMeta {
  title: string;
  /** Uma linha, o que a integração faz de verdade. */
  tagline: string;
  placeholder: string;
  /** Onde pegar a chave, passo a passo. */
  whereSteps: string[];
  keyUrl: string;
  keyUrlLabel: string;
  /** Em quais telas da Vanessa Simoni essa chave entra em ação. */
  usedIn: string[];
  /** Quando o sistema usa e quando não usa. */
  whenUses: string[];
  whenNotUses: string[];
  /** Tabela de custo, sempre cobrado direto pelo provedor. */
  costs: CostRow[];
  costNote: string;
  /** Explicação de token, só faz sentido em modelo de texto. */
  tokenNote?: string;
  /** O que fazer logo depois de salvar a chave. */
  afterConnect: string[];
  /** Exemplos concretos de uso dentro da Vanessa Simoni. */
  examples: string[];
  /** Quando escolher esse provedor no lugar dos outros. */
  bestFor: string;
}

const META: Record<Provider, ProviderMeta> = {
  openai: {
    title: "OpenAI",
    tagline: "Motor de texto e imagem próprio do seu workspace: copy, roteiros, análises do agente de IA e geração de imagem.",
    placeholder: "sk-proj-...",
    afterConnect: [
      "Abra Social Media, clique em Novo post e escolha OpenAI no seletor de motor.",
      "Gere uma legenda de teste, se sair texto a chave está valendo.",
      "Vá em Gestor de Tráfego IA e rode uma análise de campanha usando OpenAI.",
      "Defina um limite de gasto mensal no painel da OpenAI, em Settings, Limits.",
    ],
    examples: [
      "Escrever a legenda e a chamada de um post a partir do briefing do cliente.",
      "Transformar um único tema em roteiro de Reels com gancho, desenvolvimento e CTA.",
      "Ler os números da campanha e sugerir o que pausar, escalar ou reescrever.",
      "Responder lead no Salesbot com o tom de voz que você configurou.",
    ],
    bestFor: "É a escolha mais completa: serve para texto, análise e imagem no mesmo lugar. Se você só vai conectar uma chave, conecte esta.",
    whereSteps: [
      "Acesse platform.openai.com e faça login.",
      "Abra o menu do perfil e vá em API keys.",
      "Clique em Create new secret key, dê um nome como Vanessa Simoni.",
      "Copie a chave (ela só aparece uma vez) e cole aqui.",
      "Importante: adicione crédito em Billing, chave sem crédito falha no teste.",
    ],
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlLabel: "Criar API key na OpenAI",
    usedIn: [
      "Social Media: gerar legenda, roteiro de Reels, carrossel e ideias.",
      "Social Media: gerar imagem do post quando você escolhe OpenAI no seletor.",
      "Gestor de Tráfego IA: análise de campanha, sugestão de criativo e copy de anúncio.",
      "Agente de IA do CRM e Salesbot: respostas e classificação de leads.",
    ],
    whenUses: [
      "Sempre que existir chave OpenAI salva e válida neste workspace.",
      "Quando você seleciona OpenAI no seletor de modelo dentro do módulo.",
      "Na geração de imagem, quando você escolhe OpenAI como provedor.",
    ],
    whenNotUses: [
      "Se a chave estiver ausente, inválida ou sem crédito, o sistema volta para o motor padrão da Vanessa Simoni.",
      "Se você escolher outro provedor no seletor (Gemini, Ideogram, Recraft, Freepik).",
      "Em tarefas que não usam IA, como enviar mensagem, mover lead ou agendar post.",
    ],
    costs: [
      { action: "Texto, entrada (o que você manda)", unit: "1 milhão de tokens", price: "a partir de US$ 0,15" },
      { action: "Texto, saída (o que a IA responde)", unit: "1 milhão de tokens", price: "a partir de US$ 0,60" },
      { action: "Legenda de post média", unit: "1 geração", price: "cerca de US$ 0,001, menos de 1 centavo de real" },
      { action: "Roteiro de Reels completo", unit: "1 geração", price: "cerca de US$ 0,004" },
      { action: "Imagem 1024x1024 qualidade baixa", unit: "1 imagem", price: "cerca de US$ 0,01 a US$ 0,02" },
      { action: "Imagem 1024x1792 alta qualidade", unit: "1 imagem", price: "cerca de US$ 0,07 a US$ 0,19" },
    ],
    costNote:
      "A cobrança é feita direto pela OpenAI no cartão cadastrado na conta deles. A Vanessa Simoni não cobra nada por cima e não vê o valor da sua fatura. Preços de referência, confira sempre a tabela oficial em openai.com/api/pricing.",
    tokenNote:
      "Token é o pedaço de texto que o modelo lê e escreve. Uma regra prática em português: 1 token equivale a mais ou menos 3 a 4 letras, e 1.000 tokens dão umas 700 palavras. Uma legenda de Instagram gasta algo entre 300 e 800 tokens somando pergunta e resposta. Ou seja, com US$ 1 você faz na casa de mil legendas.",
  },
  gemini: {
    title: "Google Gemini",
    tagline: "Alternativa ao OpenAI com camada gratuita generosa, boa para volume alto de texto e leitura de imagem.",
    placeholder: "AIza...",
    afterConnect: [
      "Abra Social Media, clique em Novo post e escolha Gemini no seletor de motor.",
      "Gere uma legenda de teste para confirmar que a chave respondeu.",
      "Use o Gestor de Tráfego IA para enviar um print de campanha e pedir leitura.",
      "Acompanhe o consumo em aistudio.google.com, a camada gratuita tem limite por minuto.",
    ],
    examples: [
      "Produzir dezenas de legendas por dia sem gerar custo, na camada gratuita.",
      "Ler um print do gerenciador de anúncios e explicar o que está caro.",
      "Resumir uma conversa longa de WhatsApp em três linhas dentro do CRM.",
      "Classificar leads como quente, morno ou frio automaticamente.",
    ],
    bestFor: "É a escolha para volume e economia: dá conta do dia a dia sem custo na camada gratuita, e lê imagem muito bem.",
    whereSteps: [
      "Acesse aistudio.google.com e faça login com sua conta Google.",
      "Clique em Get API key, no menu lateral.",
      "Crie a chave em um projeto novo ou existente.",
      "Copie a chave e cole aqui.",
      "A camada gratuita já funciona, cartão só é necessário para volume alto.",
    ],
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyUrlLabel: "Criar API key no Google AI Studio",
    usedIn: [
      "Social Media: legendas, roteiros e ideias de conteúdo.",
      "Gestor de Tráfego IA: leitura de criativos e análise de print de campanha.",
      "Agente de IA do CRM: resumo de conversas e classificação de leads.",
    ],
    whenUses: [
      "Quando você escolhe Gemini no seletor de modelo.",
      "Como alternativa quando quiser economizar, a camada gratuita cobre bastante uso diário.",
    ],
    whenNotUses: [
      "Se a chave estiver ausente ou inválida, volta para o motor padrão da Vanessa Simoni.",
      "Quando outro provedor estiver selecionado.",
    ],
    costs: [
      { action: "Camada gratuita", unit: "por dia", price: "centenas de requisições sem custo, com limite por minuto" },
      { action: "Texto, entrada (modelo Flash)", unit: "1 milhão de tokens", price: "cerca de US$ 0,10" },
      { action: "Texto, saída (modelo Flash)", unit: "1 milhão de tokens", price: "cerca de US$ 0,40" },
      { action: "Legenda de post média", unit: "1 geração", price: "praticamente zero na camada gratuita" },
    ],
    costNote:
      "A cobrança, quando existir, é feita direto pelo Google no projeto da sua conta. Preços de referência, confira em ai.google.dev/pricing.",
    tokenNote:
      "Mesma lógica de token do OpenAI: mais ou menos 3 a 4 letras por token em português. A diferença é que o Gemini tem uma camada gratuita diária, então para uso normal de agência costuma sair de graça.",
  },
  ideogram: {
    title: "Ideogram",
    tagline: "O melhor entre os grandes para colocar texto legível dentro da imagem: promoção, preço, chamada no criativo.",
    placeholder: "id-...",
    afterConnect: [
      "Adicione crédito na conta Ideogram, sem crédito a API recusa.",
      "Abra Social Media, Novo post, e selecione Ideogram no motor de imagem.",
      "No prompt, escreva o texto que deve aparecer na arte entre aspas.",
      "Compare o resultado com outro motor antes de padronizar o uso.",
    ],
    examples: [
      "Criativo de promoção com o preço grande e legível na imagem.",
      "Arte de story com cupom escrito corretamente, sem letra embaralhada.",
      "Capa de carrossel com título forte já embutido na imagem.",
      "Selo de lançamento ou de garantia dentro do anúncio.",
    ],
    bestFor: "Escolha o Ideogram quando o texto precisa sair certo dentro da imagem. Para texto de legenda, continue no OpenAI ou Gemini.",
    whereSteps: [
      "Acesse ideogram.ai e faça login.",
      "Abra o menu do perfil e entre em Manage API.",
      "Adicione crédito, a API do Ideogram é pré-paga.",
      "Gere a API key e cole aqui.",
    ],
    keyUrl: "https://ideogram.ai/manage-api",
    keyUrlLabel: "Gerar API key no Ideogram",
    usedIn: [
      "Social Media: geração de imagem do post quando você escolhe Ideogram.",
      "Gestor de Tráfego IA: criação de criativo de anúncio com texto na arte.",
    ],
    whenUses: [
      "Só quando você seleciona Ideogram como provedor de imagem na hora de gerar.",
      "Indicado quando a arte precisa de texto correto: preço, cupom, chamada, selo.",
    ],
    whenNotUses: [
      "Nunca é usado para texto, legenda ou análise, isso é papel do OpenAI ou Gemini.",
      "Não é usado se você deixar o provedor padrão selecionado.",
    ],
    costs: [
      { action: "Imagem modelo Turbo", unit: "1 imagem", price: "cerca de US$ 0,02" },
      { action: "Imagem modelo padrão", unit: "1 imagem", price: "cerca de US$ 0,06 a US$ 0,08" },
      { action: "Pacote de 100 criativos", unit: "100 imagens", price: "cerca de US$ 2 a US$ 8, conforme o modelo" },
    ],
    costNote:
      "Cobrança pré-paga direto no Ideogram, você coloca crédito e ele é consumido por imagem. A Vanessa Simoni não cobra nada por cima. Preços de referência, confira em ideogram.ai.",
  },
  recraft: {
    title: "Recraft",
    tagline: "Design gráfico de marca: ilustração vetorial, ícone, mockup e imagem com estilo consistente entre posts.",
    placeholder: "Cole aqui a API key do Recraft",
    afterConnect: [
      "Abra Social Media, Novo post, e selecione Recraft no motor de imagem.",
      "Gere a primeira arte e salve o estilo que agradou, para reaproveitar.",
      "Use o mesmo estilo nos próximos posts para manter a identidade da marca.",
      "Acompanhe o saldo de unidades no perfil do Recraft.",
    ],
    examples: [
      "Ícone e ilustração para post educativo, tudo no mesmo traço.",
      "Mockup de produto para anúncio, sem sessão de foto.",
      "SVG de logo ou selo para usar em material impresso e no site.",
      "Linha inteira de posts do mês com paleta e estilo idênticos.",
    ],
    bestFor: "Escolha o Recraft quando o cliente exige consistência visual entre todos os posts, ou quando precisa de vetor editável.",
    whereSteps: [
      "Acesse recraft.ai e faça login.",
      "Clique no seu avatar e vá em Profile, depois API.",
      "Gere a API key, o Recraft trabalha com unidades pré-pagas.",
      "Copie e cole aqui, depois clique em Salvar e testar.",
    ],
    keyUrl: "https://www.recraft.ai/profile/api",
    keyUrlLabel: "Gerar API key no Recraft",
    usedIn: [
      "Social Media: geração de imagem do post quando você escolhe Recraft.",
      "Gestor de Tráfego IA: criativos com identidade visual fixa da marca.",
    ],
    whenUses: [
      "Só quando você seleciona Recraft como provedor de imagem.",
      "Indicado para vetor, ícone, ilustração e para manter o mesmo estilo em toda a linha de posts.",
    ],
    whenNotUses: [
      "Nunca gera texto, legenda ou análise, isso continua no OpenAI ou Gemini.",
      "Não entra em ação enquanto o provedor selecionado for outro.",
    ],
    costs: [
      { action: "Imagem raster (JPG/PNG)", unit: "1 imagem", price: "cerca de US$ 0,04" },
      { action: "Imagem vetorial (SVG)", unit: "1 imagem", price: "cerca de US$ 0,08" },
      { action: "Pacote de 100 posts", unit: "100 imagens", price: "cerca de US$ 4 a US$ 8" },
    ],
    costNote:
      "Cobrança pré-paga direto no Recraft por unidades de API. A Vanessa Simoni não cobra nada por cima e não tem acesso ao seu saldo. Preços de referência, confira em recraft.ai/pricing.",
  },
  freepik: {
    title: "Freepik AI",
    tagline: "Fotorrealismo publicitário com os modelos Flux e Mystic, bom para foto de produto e cena de estilo de vida.",
    placeholder: "FPSX...",
    afterConnect: [
      "Confirme que o plano ou o crédito de API está ativo no Freepik.",
      "Abra Social Media, Novo post, e selecione Freepik no motor de imagem.",
      "Teste primeiro com Flux, que é mais barato, e só suba para Mystic se precisar de mais resolução.",
      "Acompanhe o consumo de crédito no painel do Freepik.",
    ],
    examples: [
      "Foto de produto em cima da bancada, sem estúdio e sem fotógrafo.",
      "Cena de estilo de vida com pessoa usando o produto, para anúncio frio.",
      "Imagem de ambiente para post de imobiliária, clínica ou restaurante.",
      "Banner fotográfico para campanha sazonal.",
    ],
    bestFor: "Escolha o Freepik quando a arte precisa parecer foto de verdade. Para arte com texto, prefira o Ideogram.",
    whereSteps: [
      "Acesse freepik.com/api e faça login.",
      "Assine um plano de API ou compre créditos.",
      "Abra o painel de API keys e gere uma chave.",
      "Copie e cole aqui.",
    ],
    keyUrl: "https://www.freepik.com/api",
    keyUrlLabel: "Gerar API key no Freepik",
    usedIn: [
      "Social Media: geração de imagem do post quando você escolhe Freepik.",
      "Gestor de Tráfego IA: criativos fotorrealistas de produto e cena.",
    ],
    whenUses: [
      "Só quando você seleciona Freepik como provedor de imagem.",
      "Indicado quando a arte precisa parecer foto de verdade, não ilustração.",
    ],
    whenNotUses: [
      "Nunca é usado para texto ou análise.",
      "Não entra em ação com outro provedor selecionado.",
    ],
    costs: [
      { action: "Imagem Flux dev", unit: "1 imagem", price: "cerca de US$ 0,01 a US$ 0,03" },
      { action: "Imagem Mystic alta resolução", unit: "1 imagem", price: "cerca de US$ 0,05 a US$ 0,10" },
      { action: "Plano de créditos mensal", unit: "mês", price: "a partir de cerca de US$ 10" },
    ],
    costNote:
      "Cobrança direto no Freepik, por plano ou crédito. A Vanessa Simoni não cobra nada por cima. Preços de referência, confira em freepik.com/api.",
  },
};

interface Props {
  provider: Provider | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function IntegrationConnectPanel({ provider, open, onOpenChange }: Props) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [existing, setExisting] = useState<{ status: string; metadata: Record<string, unknown> } | null>(null);
  // Trava o autofill do navegador e dos gerenciadores de senha: o campo só
  // fica editável depois que o usuário clica nele, então nada é preenchido sozinho.
  const [locked, setLocked] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const saveOpenAI = useServerFn(saveOpenAIIntegration);
  const saveGemini = useServerFn(saveGeminiIntegration);
  const saveDesign = useServerFn(saveDesignAIIntegration);
  const testFn = useServerFn(testIntegration);

  useEffect(() => {
    if (!open || !provider) return;
    setMsg(null);
    setApiKey("");
    setReveal(false);
    setLocked(true);
    setExisting(null);
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      const wsId = prof?.current_workspace_id;
      if (!wsId) {
        setMsg({ ok: false, text: "Workspace não encontrado." });
        return;
      }
      setWorkspaceId(wsId);
      const { data: existingRow } = await supabase
        .from("integrations")
        .select("status,metadata")
        .eq("workspace_id", wsId)
        .eq("provider", provider)
        .maybeSingle();
      if (existingRow) setExisting(existingRow as { status: string; metadata: Record<string, unknown> });
    })();
  }, [open, provider]);

  async function handleSave() {
    if (!provider || !workspaceId) return;
    setBusy(true);
    setMsg(null);
    try {
      const key = apiKey.trim();
      if (key.length < 10) { setMsg({ ok: false, text: "Cole uma API Key válida." }); setBusy(false); return; }
      if (provider === "openai") {
        const r = await saveOpenAI({ data: { workspaceId, apiKey: key } });
        setMsg({ ok: true, text: `OpenAI conectada (${r.modelCount} modelos disponíveis).` });
      } else if (provider === "gemini") {
        const r = await saveGemini({ data: { workspaceId, apiKey: key } });
        setMsg({ ok: true, text: `Gemini conectado (${r.modelCount} modelos disponíveis).` });
      } else {
        await saveDesign({ data: { workspaceId, provider, apiKey: key } });
        setMsg({ ok: true, text: `${META[provider].title} conectada.` });
      }
      setApiKey("");
      setReveal(false);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha." });
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    if (!provider || !workspaceId) return;
    setBusy(true);
    setMsg(null);
    try {
      await testFn({ data: { workspaceId, provider } });
      setMsg({ ok: true, text: "Conexão validada." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha no teste." });
    } finally {
      setBusy(false);
    }
  }

  const meta = provider ? META[provider] : null;
  const connected = existing?.status === "conectado" || existing?.status === "connected";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {meta ? `Conectar ${meta.title}` : ""}
            {existing && (
              <Badge variant={connected ? "default" : "secondary"} className="text-[10px]">
                {connected ? "conectado" : existing.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{meta?.tagline}</DialogDescription>
        </DialogHeader>

        {meta && (
          <Tabs defaultValue="conectar">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="conectar">Conectar</TabsTrigger>
              <TabsTrigger value="como">Como funciona</TabsTrigger>
              <TabsTrigger value="custo">Quanto custa</TabsTrigger>
            </TabsList>

            {/* -------------------- CONECTAR -------------------- */}
            <TabsContent value="conectar" className="space-y-4 pt-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Onde pegar a chave</p>
                <ol className="mt-2 space-y-1.5">
                  {meta.whereSteps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <a href={meta.keyUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    {meta.keyUrlLabel}
                  </a>
                </Button>
              </div>

              {existing && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  <p>
                    Status atual desta conta: <span className="font-semibold">{existing.status}</span>
                    {connected && " . A chave salva fica cifrada e nunca é exibida de volta aqui."}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-muted-foreground">
                  API key {connected ? "(cole uma nova só se quiser substituir)" : ""}
                </label>
                {/* Campos-isca: alguns navegadores insistem em preencher o primeiro
                    par de campos do formulário. Estes ficam ocultos e absorvem isso. */}
                <input type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden className="hidden" />
                <input type="password" name="password" autoComplete="new-password" tabIndex={-1} aria-hidden className="hidden" />
                <div className="relative">
                  <Input
                    ref={inputRef}
                    type={reveal ? "text" : "password"}
                    inputMode="text"
                    name={`Vanessa Simoni-api-key-${provider}`}
                    id={`Vanessa Simoni-api-key-${provider}`}
                    placeholder={meta.placeholder}
                    value={apiKey}
                    readOnly={locked}
                    onFocus={() => setLocked(false)}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    data-bwignore="true"
                    className="pr-10 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={reveal ? "Ocultar chave" : "Mostrar chave"}
                  >
                    {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  Este campo começa em branco e bloqueado justamente para o navegador não preencher nada sozinho. A
                  chave é cifrada, fica isolada no seu workspace e nenhum outro cliente da Vanessa Simoni tem acesso a ela.
                </p>
              </div>

              {msg && (
                <div
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                    msg.ok
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {msg.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{msg.text}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={busy || apiKey.trim().length < 10} className="flex-1">
                  {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Salvar e testar
                </Button>
                {existing && (
                  <Button onClick={handleTest} disabled={busy} variant="outline">
                    Re-testar chave salva
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* -------------------- COMO FUNCIONA -------------------- */}
            <TabsContent value="como" className="space-y-4 pt-4">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase text-primary">Quando escolher este</p>
                <p className="mt-1 text-sm text-muted-foreground">{meta.bestFor}</p>
              </div>

              <div>
                <p className="text-sm font-medium">Conectei, e agora? Faça nesta ordem</p>
                <ol className="mt-2 space-y-1.5">
                  {meta.afterConnect.map((a, i) => (
                    <li key={a} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <p className="text-sm font-medium">Exemplos reais de uso</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {meta.examples.map((ex) => (
                    <div key={ex} className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
                      {ex}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium">Onde essa chave entra em ação</p>
                <ul className="mt-2 space-y-1.5">
                  {meta.usedIn.map((u) => (
                    <li key={u} className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                      {u}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                  <p className="text-xs font-semibold uppercase text-success">Quando o sistema usa</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    {meta.whenUses.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Quando não usa</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    {meta.whenNotUses.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Resumo em uma frase</p>
                <p className="mt-1">
                  Conectar não muda nada sozinho. A Vanessa Simoni continua funcionando com o motor padrão dela, e a sua chave
                  passa a ser uma opção a mais no seletor. Você escolhe, na hora de gerar, qual motor quer usar. Se a
                  sua chave falhar, o sistema não trava, ele volta para o motor padrão e avisa.
                </p>
              </div>
            </TabsContent>

            {/* -------------------- CUSTO -------------------- */}
            <TabsContent value="custo" className="space-y-4 pt-4">
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Ação</th>
                      <th className="px-3 py-2 font-medium">Unidade</th>
                      <th className="px-3 py-2 font-medium">Custo aproximado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meta.costs.map((c) => (
                      <tr key={c.action} className="border-t border-border">
                        <td className="px-3 py-2">{c.action}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.unit}</td>
                        <td className="px-3 py-2 font-medium">{c.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {meta.tokenNote && (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">O que é token</p>
                  <p className="mt-1 text-xs text-muted-foreground">{meta.tokenNote}</p>
                </div>
              )}

              <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">{meta.costNote}</p>

              <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Como não tomar susto na fatura</p>
                <ul className="mt-1 space-y-1">
                  <li>Defina um limite de gasto mensal no painel do provedor, todos oferecem isso.</li>
                  <li>Comece com um crédito pequeno, tipo US$ 5, e acompanhe o consumo na primeira semana.</li>
                  <li>Se preferir custo zero, não conecte nada: o motor padrão da Vanessa Simoni já atende o dia a dia.</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
