import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Check, Upload, Search, Image as ImageIcon, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  createMetaCampaign,
  createMetaAdSet,
  uploadMetaImageToStorage,
  createMetaCreativeAndAd,
  searchMetaDetailedTargeting,
  searchMetaGeoLocations,
  listAdAccountAssets,
  listMetaCreativeUploads,
  suggestDetailedTargetings,
  estimateAdvantageAudienceReach,
} from "@/lib/meta-campaigns.functions";
import { MapLocationSelector, type MapPin } from "./MapLocationSelector";

type AdAccount = { account_id: string; name: string | null; currency: string | null };
type Page = { page_id: string; page_name: string | null };
type IgAccount = { instagram_id: string; page_id: string; username: string | null };
type Pixel = { pixel_id: string; pixel_name: string | null; ad_account_id: string };

const OBJECTIVES: Array<{ v: "OUTCOME_LEADS" | "OUTCOME_SALES" | "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_AWARENESS" | "OUTCOME_APP_PROMOTION"; l: string; sub: string }> = [
  { v: "OUTCOME_LEADS", l: "Leads", sub: "Formulários / cadastros / WhatsApp" },
  { v: "OUTCOME_SALES", l: "Vendas", sub: "Conversão no site (pixel)" },
  { v: "OUTCOME_TRAFFIC", l: "Tráfego", sub: "Cliques para o site" },
  { v: "OUTCOME_ENGAGEMENT", l: "Engajamento", sub: "Curtidas, comentários, mensagens" },
  { v: "OUTCOME_AWARENESS", l: "Reconhecimento", sub: "Alcance / impressões" },
  { v: "OUTCOME_APP_PROMOTION", l: "App", sub: "Instalações e eventos in-app" },
];

type Destination =
  | "MESSAGES" | "VIDEO_VIEWS" | "POST_ENGAGEMENT" | "PAGE_LIKES" | "EVENT_RESPONSES"
  | "LEAD_FORM" | "PHONE_CALL" | "SITE_LEADS"
  | "WEBSITE" | "CATALOG_SALES" | "APP"
  | "MESSENGER" | "WHATSAPP" | "INSTAGRAM_DIRECT"
  | "REACH" | "IMPRESSIONS" | "BRAND_AWARENESS" | "AD_RECALL_LIFT" | "THRUPLAY"
  | "APP_INSTALLS" | "APP_EVENTS";

const DESTINATIONS_BY_OBJECTIVE: Record<typeof OBJECTIVES[number]["v"], Array<{ v: Destination; l: string; sub: string }>> = {
  OUTCOME_ENGAGEMENT: [
    { v: "MESSAGES", l: "Mensagens", sub: "WhatsApp / Instagram Direct / Messenger" },
    { v: "VIDEO_VIEWS", l: "Visualizações de vídeo", sub: "ThruPlay ou 2s contínuos" },
    { v: "POST_ENGAGEMENT", l: "Engajamento com publicação", sub: "Curtidas, comentários, compartilhamentos" },
    { v: "PAGE_LIKES", l: "Curtidas na Página", sub: "Cresce a base da Página do Facebook" },
    { v: "EVENT_RESPONSES", l: "Participações em evento", sub: "Confirmações de presença" },
  ],
  OUTCOME_LEADS: [
    { v: "LEAD_FORM", l: "Formulário instant-neo", sub: "Coleta lead dentro da Meta" },
    { v: "MESSAGES", l: "Mensagens", sub: "WhatsApp / Direct / Messenger" },
    { v: "PHONE_CALL", l: "Chamadas", sub: "Ligação direta pra empresa" },
    { v: "SITE_LEADS", l: "Site (conversão)", sub: "Leva ao site e otimiza no Pixel" },
  ],
  OUTCOME_SALES: [
    { v: "WEBSITE", l: "Site (Pixel + evento)", sub: "Otimiza por Purchase, Lead etc." },
    { v: "CATALOG_SALES", l: "Catálogo", sub: "Anúncios dinÃ¢micos de produto" },
    { v: "MESSAGES", l: "Mensagens", sub: "Vende via WhatsApp / Direct" },
    { v: "PHONE_CALL", l: "Chamadas", sub: "Fecha por telefone" },
  ],
  OUTCOME_TRAFFIC: [
    { v: "WEBSITE", l: "Site", sub: "Cliques no link" },
    { v: "APP", l: "App", sub: "Abrir o app" },
    { v: "MESSENGER", l: "Messenger", sub: "Abre conversa" },
    { v: "WHATSAPP", l: "WhatsApp", sub: "Abre conversa" },
    { v: "PHONE_CALL", l: "Chamadas", sub: "Ligação" },
  ],
  OUTCOME_AWARENESS: [
    { v: "REACH", l: "Alcance", sub: "Pessoas únicas" },
    { v: "IMPRESSIONS", l: "Impressões", sub: "Total de exibições" },
    { v: "BRAND_AWARENESS", l: "Reconhecimento da marca", sub: "Ad recall estimado" },
    { v: "AD_RECALL_LIFT", l: "Lembrança do anúncio", sub: "Ad recall lift" },
    { v: "THRUPLAY", l: "Visualizações de vídeo", sub: "ThruPlay ≥ 15s" },
  ],
  OUTCOME_APP_PROMOTION: [
    { v: "APP_INSTALLS", l: "Instalações", sub: "Novas instalações do app" },
    { v: "APP_EVENTS", l: "Eventos no app", sub: "Compra, cadastro, custom" },
  ],
};

const SPECIAL_AD_CATEGORIES: Array<{ v: "NONE" | "EMPLOYMENT" | "HOUSING" | "CREDIT" | "ISSUES_ELECTIONS_POLITICS"; l: string }> = [
  { v: "NONE", l: "Nenhuma" },
  { v: "CREDIT", l: "Crédito" },
  { v: "EMPLOYMENT", l: "Emprego" },
  { v: "HOUSING", l: "Habitação" },
  { v: "ISSUES_ELECTIONS_POLITICS", l: "Questões sociais / eleições / política" },
];

const BID_STRATEGIES: Array<{ v: "LOWEST_COST_WITHOUT_CAP" | "LOWEST_COST_WITH_BID_CAP" | "COST_CAP" | "LOWEST_COST_WITH_MIN_ROAS"; l: string; sub: string }> = [
  { v: "LOWEST_COST_WITHOUT_CAP", l: "Menor custo", sub: "A Meta gasta tudo e busca o menor CPA" },
  { v: "LOWEST_COST_WITH_BID_CAP", l: "Teto de lance", sub: "Limite máximo por leilão" },
  { v: "COST_CAP", l: "Teto de custo", sub: "CPA médio no teto definido" },
  { v: "LOWEST_COST_WITH_MIN_ROAS", l: "ROAS mínimo", sub: "Só para objetivo Vendas" },
];

const OPT_GOAL_BY_OBJECTIVE: Record<string, "LEAD_GENERATION" | "OFFSITE_CONVERSIONS" | "LINK_CLICKS" | "POST_ENGAGEMENT" | "REACH" | "IMPRESSIONS"> = {
  OUTCOME_LEADS: "LEAD_GENERATION",
  OUTCOME_SALES: "OFFSITE_CONVERSIONS",
  OUTCOME_TRAFFIC: "LINK_CLICKS",
  OUTCOME_ENGAGEMENT: "POST_ENGAGEMENT",
  OUTCOME_AWARENESS: "REACH",
  OUTCOME_APP_PROMOTION: "LINK_CLICKS",
};

const CTAS: Array<{ v: "LEARN_MORE" | "SHOP_NOW" | "SIGN_UP" | "SUBSCRIBE" | "CONTACT_US" | "GET_QUOTE" | "APPLY_NOW" | "DOWNLOAD" | "GET_OFFER" | "WHATSAPP_MESSAGE"; l: string }> = [
  { v: "LEARN_MORE", l: "Saiba mais" },
  { v: "SHOP_NOW", l: "Comprar" },
  { v: "SIGN_UP", l: "Cadastrar" },
  { v: "SUBSCRIBE", l: "Assinar" },
  { v: "CONTACT_US", l: "Fale conosco" },
  { v: "GET_QUOTE", l: "Solicitar orçamento" },
  { v: "APPLY_NOW", l: "Inscrever-se" },
  { v: "DOWNLOAD", l: "Baixar" },
  { v: "GET_OFFER", l: "Ver oferta" },
  { v: "WHATSAPP_MESSAGE", l: "Chamar no WhatsApp" },
];

// CTAs permitidos por objetivo, regras oficiais do Meta Ads Manager.
// Evita anúncio travar ou entrar em revisão com CTA sem sentido pro objetivo.
type CtaV = typeof CTAS[number]["v"];
type ObjV = "OUTCOME_LEADS" | "OUTCOME_SALES" | "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_AWARENESS" | "OUTCOME_APP_PROMOTION";
const CTA_BY_OBJECTIVE: Record<ObjV, CtaV[]> = {
  OUTCOME_LEADS:         ["LEARN_MORE", "SIGN_UP", "APPLY_NOW", "GET_QUOTE", "CONTACT_US", "SUBSCRIBE", "DOWNLOAD", "GET_OFFER", "WHATSAPP_MESSAGE"],
  OUTCOME_SALES:         ["SHOP_NOW", "LEARN_MORE", "GET_OFFER", "SUBSCRIBE", "SIGN_UP", "APPLY_NOW"],
  OUTCOME_TRAFFIC:       ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "GET_OFFER", "DOWNLOAD", "APPLY_NOW", "CONTACT_US", "WHATSAPP_MESSAGE"],
  // Engajamento (curtidas, mensagens, video views), sem "comprar", "baixar", "assinar".
  OUTCOME_ENGAGEMENT:    ["LEARN_MORE", "CONTACT_US", "WHATSAPP_MESSAGE", "GET_OFFER"],
  // Reconhecimento, só CTA neutro.
  OUTCOME_AWARENESS:     ["LEARN_MORE"],
  OUTCOME_APP_PROMOTION: ["LEARN_MORE", "DOWNLOAD", "SIGN_UP"],
};

type GeoPick = {
  key: string;
  name: string;
  type: string;
  country_code?: string;
  region?: string;
  mode: "include" | "exclude";
};



async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function PlacementGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: ReadonlyArray<{ v: string; label: string }>;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium mb-1.5">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.v);
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onToggle(o.v)}
              className={`px-2.5 py-1 rounded-md border text-[11px] ${on ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}


export function NewCampaignDialog({
  workspaceId,
  open,
  onOpenChange,
  onCreated,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: () => void;
}) {
  const [step, setStep] = useState(1);

  // Passo 1, objetivo + orçamento + configurações de nível campanha
  const [adAccountId, setAdAccountId] = useState<string>("");
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState<typeof OBJECTIVES[number]["v"]>("OUTCOME_LEADS");
  const [destination, setDestination] = useState<Destination | "">("");
  const [specialCats, setSpecialCats] = useState<Array<typeof SPECIAL_AD_CATEGORIES[number]["v"]>>(["NONE"]);
  const [buyingType, setBuyingType] = useState<"AUCTION" | "RESERVED">("AUCTION");
  const [budgetMode, setBudgetMode] = useState<"daily" | "lifetime">("daily");
  const [dailyBudget, setDailyBudget] = useState(6);
  const [lifetimeBudget, setLifetimeBudget] = useState(0);
  const [spendCap, setSpendCap] = useState<number>(0);
  const [startTime, setStartTime] = useState<string>("");
  const [stopTime, setStopTime] = useState<string>("");
  const [isCbo, setIsCbo] = useState(false);
  const [bidStrategy, setBidStrategy] = useState<typeof BID_STRATEGIES[number]["v"] | "">("");
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [isAbTest, setIsAbTest] = useState(false);

  // Passo 2, público
  const [adSetName, setAdSetName] = useState("");
  // Local da conversão (Ads Manager → destination_type)
  const [conversionLocation, setConversionLocation] = useState<"WEBSITE" | "APP" | "MESSAGING" | "PHONE_CALL" | "INSTAGRAM_PROFILE" | "ON_AD" | "">("");
  // Quando conversionLocation = MESSAGING, o usuário escolhe onde receber a conversa
  const [msgMessenger, setMsgMessenger] = useState(false);
  const [msgInstagram, setMsgInstagram] = useState(false);
  const [msgWhatsapp, setMsgWhatsapp] = useState(false);
  const [wabaId, setWabaId] = useState<string>("");
  // Otimização e cobrança customizáveis (default vem do objetivo)
  const [optGoalOverride, setOptGoalOverride] = useState<string>("");
  const [billingEvent, setBillingEvent] = useState<"IMPRESSIONS" | "LINK_CLICKS" | "THRUPLAY">("IMPRESSIONS");
  const [adSetBidAmount, setAdSetBidAmount] = useState<number>(0);
  const [hasEndDate, setHasEndDate] = useState(false);
  // Advantage+ Audience: deixa o Meta expandir o público além dos critérios definidos.
  const [advantageAudience, setAdvantageAudience] = useState(true);

  const [pageId, setPageId] = useState<string>("");
  const [instagramActorId, setInstagramActorId] = useState<string>("");
  const [geoPicks, setGeoPicks] = useState<GeoPick[]>([]);
  const [mapPins, setMapPins] = useState<MapPin[]>([]);
  const [geoSearch, setGeoSearch] = useState("");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(55);
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [interestSearch, setInterestSearch] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestProduct, setSuggestProduct] = useState("");
  const [suggestAudience, setSuggestAudience] = useState("");
  type Suggestion = {
    id: string; name: string; type: string; path: string[];
    audience_size_lower_bound: number | null; audience_size_upper_bound: number | null;
    origin_term: string; reasoning: string; angle: string;
  };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [pixelId, setPixelId] = useState<string>("");

  // Passo 2, Dispositivos e Posicionamentos (idêntico ao Meta Ads Manager)
  const [placementMode, setPlacementMode] = useState<"advantage" | "manual">("advantage");
  const [devicePlatforms, setDevicePlatforms] = useState<Array<"mobile" | "desktop">>(["mobile", "desktop"]);
  const ALL_PUB = ["facebook", "instagram", "audience_network", "messenger"] as const;
  type Pub = typeof ALL_PUB[number];
  const [publisherPlatforms, setPublisherPlatforms] = useState<Pub[]>(["facebook", "instagram"]);
  const FB_POS = [
    { v: "feed", label: "Feed do Facebook" },
    { v: "facebook_reels", label: "Reels do Facebook" },
    { v: "story", label: "Stories do Facebook" },
    { v: "video_feeds", label: "Feeds de vídeo" },
    { v: "instream_video", label: "Vídeos in-stream" },
    { v: "marketplace", label: "Marketplace" },
    { v: "search", label: "Resultados de busca" },
    { v: "right_hand_column", label: "Coluna da direita" },
    { v: "facebook_reels_overlay", label: "Overlay em Reels" },
  ] as const;
  const IG_POS = [
    { v: "stream", label: "Feed do Instagram" },
    { v: "story", label: "Stories do Instagram" },
    { v: "reels", label: "Reels do Instagram" },
    { v: "explore", label: "Explorar" },
    { v: "explore_home", label: "Home do Explorar" },
    { v: "ig_search", label: "Busca do Instagram" },
    { v: "profile_feed", label: "Feed de perfil" },
  ] as const;
  const AN_POS = [
    { v: "classic", label: "Nativo, banner e intersticial" },
    { v: "rewarded_video", label: "Vídeos recompensados" },
  ] as const;
  const MSG_POS = [
    { v: "messenger_home", label: "Caixa de entrada" },
    { v: "story", label: "Stories do Messenger" },
    { v: "sponsored_messages", label: "Mensagens patrocinadas" },
  ] as const;
  const [fbPositions, setFbPositions] = useState<string[]>(FB_POS.map((p) => p.v));
  const [igPositions, setIgPositions] = useState<string[]>(IG_POS.map((p) => p.v));
  const [anPositions, setAnPositions] = useState<string[]>(AN_POS.map((p) => p.v));
  const [msgPositions, setMsgPositions] = useState<string[]>([]);


  // Passo 3, criativo
  const [adName, setAdName] = useState("");
  const [adFormat, setAdFormat] = useState<"SINGLE_IMAGE" | "SINGLE_VIDEO" | "CAROUSEL">("SINGLE_IMAGE");
  const [multiAdvertiser, setMultiAdvertiser] = useState(true);
  const [messageTemplate, setMessageTemplate] = useState<"START_CONVERSATIONS" | "COLLECT_INFO" | "PARTNER_APP">("START_CONVERSATIONS");
  const [urlTags, setUrlTags] = useState("");
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [cta, setCta] = useState<typeof CTAS[number]["v"]>("LEARN_MORE");
  const [imageHash, setImageHash] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // CTAs válidos p/ o objetivo escolhido (regras do Meta Ads Manager).
  // WHATSAPP_MESSAGE só faz sentido se o destino for WhatsApp.
  const allowedCtas = useMemo(() => {
    const base = CTA_BY_OBJECTIVE[objective as ObjV] ?? CTAS.map((c) => c.v);
    return base.filter((v) => v !== "WHATSAPP_MESSAGE" || destination === "WHATSAPP");
  }, [objective, destination]);

  // Se o CTA atual não é válido pro objetivo, cai no primeiro permitido.
  useEffect(() => {
    if (!allowedCtas.includes(cta)) setCta(allowedCtas[0] ?? "LEARN_MORE");
  }, [allowedCtas, cta]);



  // Contas de anúncio do workspace
  const accountsQ = useQuery({
    queryKey: ["meta-ad-accounts", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_ad_accounts")
        .select("account_id,name,currency")
        .eq("workspace_id", workspaceId);
      return (data ?? []) as AdAccount[];
    },
    enabled: open,
  });

  // Assets (Página, IG, Pixel, WABA) puxados direto da Meta a partir da ad account selecionada.
  const assetsFn = useServerFn(listAdAccountAssets);
  const assetsQ = useQuery({
    queryKey: ["meta-account-assets", workspaceId, adAccountId],
    queryFn: () => assetsFn({ data: { workspaceId, adAccountId: adAccountId as `act_${string}` } }),
    enabled: open && !!adAccountId,
    staleTime: 5 * 60 * 1000,
  });

  const currency = useMemo(
    () => accountsQ.data?.find((a) => a.account_id === adAccountId)?.currency ?? "BRL",
    [accountsQ.data, adAccountId],
  );
  const pixelsForAccount = useMemo(() => assetsQ.data?.pixels ?? [], [assetsQ.data]);
  const igForPage = useMemo(
    () => assetsQ.data?.pages.find((p) => p.page_id === pageId && p.instagram_id) ?? null,
    [assetsQ.data, pageId],
  );
  const wabaForAccount = useMemo(() => assetsQ.data?.whatsapp_accounts ?? [], [assetsQ.data]);

  // Sincroniza Instagram actor com a página escolhida (padrão).
  useEffect(() => {
    if (igForPage?.instagram_id && !instagramActorId) setInstagramActorId(igForPage.instagram_id);
    if (!igForPage) setInstagramActorId("");
  }, [igForPage, instagramActorId]);

  // destination_type efetivo enviado pra Meta.
  const effectiveDestinationType = useMemo(() => {
    if (conversionLocation === "WEBSITE") return "WEBSITE";
    if (conversionLocation === "APP") return "APP";
    if (conversionLocation === "PHONE_CALL") return "PHONE_CALL";
    if (conversionLocation === "INSTAGRAM_PROFILE") return "INSTAGRAM_PROFILE";
    if (conversionLocation === "ON_AD") return "ON_AD";
    if (conversionLocation === "MESSAGING") {
      // Prioridade quando múltiplos: WhatsApp > Messenger > Instagram Direct (comportamento do Ads Manager).
      if (msgWhatsapp) return "WHATSAPP";
      if (msgMessenger) return "MESSENGER";
      if (msgInstagram) return "INSTAGRAM_DIRECT";
    }
    return "";
  }, [conversionLocation, msgWhatsapp, msgMessenger, msgInstagram]);

  // Metas de otimização disponíveis (baseadas no objetivo + local de conversão).
  const OPT_GOAL_OPTIONS: Array<{ v: string; l: string }> = [
    { v: "LEAD_GENERATION", l: "Geração de leads" },
    { v: "OFFSITE_CONVERSIONS", l: "Conversões (pixel)" },
    { v: "LINK_CLICKS", l: "Cliques no link" },
    { v: "LANDING_PAGE_VIEWS", l: "Visualizações da página" },
    { v: "POST_ENGAGEMENT", l: "Engajamento" },
    { v: "PAGE_LIKES", l: "Curtidas na Página" },
    { v: "REACH", l: "Alcance" },
    { v: "IMPRESSIONS", l: "Impressões" },
    { v: "VIDEO_VIEWS", l: "Visualizações de vídeo" },
    { v: "THRUPLAY", l: "ThruPlay (vídeo)" },
    { v: "CONVERSATIONS", l: "Conversas" },
  ];

  // Cotação USD → moeda da conta de anúncios (mínimo da Meta é ~1 USD).
  // Usa open.er-api.com (gratuito, sem chave). Cache de 6h.
  const fxQ = useQuery({
    queryKey: ["fx-usd-to", currency],
    enabled: open && !!currency,
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: async () => {
      if (currency === "USD") return 1;
      try {
        const r = await fetch("https://open.er-api.com/v6/latest/USD");
        const j = (await r.json()) as { rates?: Record<string, number> };
        const rate = j.rates?.[currency];
        return typeof rate === "number" && rate > 0 ? rate : null;
      } catch {
        return null;
      }
    },
  });

  // Mínimo = 1 USD convertido na cotação real + 10 centavos de margem (na moeda da conta).
  // Preserva centavos, muitas estratégias dependem da verba mínima real.
  const minBudget = useMemo(() => {
    if (currency === "USD") return 1.1;
    const rate = fxQ.data;
    if (rate && rate > 0) return Math.round((rate * 1 + 0.1) * 100) / 100;
    // Sem cotação: retorna null-safe conservador só pra não travar UI.
    if (currency === "BRL") return 5.5;
    return 1.1;
  }, [currency, fxQ.data]);


  // Ajusta o valor atual quando o mínimo muda (troca de conta / cotação carrega).
  useEffect(() => {
    setDailyBudget((v) => (v < minBudget ? minBudget : v));
  }, [minBudget]);

  // Reseta destino ao trocar objetivo, mantém apenas destinos válidos.
  useEffect(() => {
    const valid = DESTINATIONS_BY_OBJECTIVE[objective] ?? [];
    setDestination((d) => (valid.find((x) => x.v === d) ? d : (valid[0]?.v ?? "")));
  }, [objective]);

  // busca interesses
  const searchFn = useServerFn(searchMetaDetailedTargeting);
  const interestsQ = useQuery({
    queryKey: ["meta-detailed-targeting", workspaceId, adAccountId, interestSearch],
    queryFn: () => searchFn({ data: { workspaceId, adAccountId: adAccountId as `act_${string}`, query: interestSearch, limit: 25 } }),
    enabled: interestSearch.trim().length >= 2 && !!adAccountId,
  });

  // sugestão IA de direcionamentos laterais (fora do óbvio) para fugir da concorrência
  const suggestFn = useServerFn(suggestDetailedTargetings);
  const suggestMut = useMutation({
    mutationFn: () => suggestFn({
      data: {
        workspaceId,
        adAccountId: adAccountId as `act_${string}`,
        productContext: suggestProduct.trim(),
        audienceContext: suggestAudience.trim(),
      },
    }),
    onSuccess: (r) => {
      setSuggestions(r.suggestions as Suggestion[]);
      if (!r.suggestions.length) toast.info("A IA gerou termos, mas nenhum retornou público válido na Meta. Tenta descrever o público com mais detalhe.");
    },
    onError: (e) => toast.error(`Erro na sugestão IA: ${(e as Error).message}`),
  });

  // Advantage+ Audience, preview de expansão via delivery_estimate
  const estimateFn = useServerFn(estimateAdvantageAudienceReach);
  const estimateMut = useMutation({
    mutationFn: () => {
      const byType: Record<string, Array<{ id: string; name: string }>> = {};
      for (const s of selectedInterests) {
        if (!byType[s.type]) byType[s.type] = [];
        byType[s.type].push({ id: s.id, name: s.name });
      }
      const legacyInterests = byType["interests"];
      const flexibleSpec = Object.keys(byType).length ? [byType] : undefined;
      const gendersV = gender === "all" ? undefined : gender === "male" ? [1] : [2];
      return estimateFn({
        data: {
          workspaceId,
          adAccountId: adAccountId as `act_${string}`,
          optimizationGoal: "REACH",
          targeting: {
            geo_locations: buildGeoLocations(geoPicks, mapPins),
            age_min: ageMin,
            age_max: ageMax,
            genders: gendersV,
            interests: legacyInterests && legacyInterests.length ? legacyInterests : undefined,
            flexible_spec: flexibleSpec,
          },
        },
      });
    },
  });



  // busca geolocalização
  const geoFn = useServerFn(searchMetaGeoLocations);
  const geoQ = useQuery({
    queryKey: ["meta-geo", workspaceId, geoSearch],
    queryFn: () => geoFn({ data: { workspaceId, query: geoSearch, limit: 15 } }),
    enabled: geoSearch.trim().length >= 2,
  });

  function buildGeoLocations(picks: GeoPick[], pins: MapPin[]) {
    const grp = (mode: "include" | "exclude") => {
      const arr = picks.filter((p) => p.mode === mode);
      const bucket = (t: string) => arr.filter((p) => p.type === t);
      const out: Record<string, unknown> = {};
      const countries = bucket("country").map((p) => p.country_code || p.key);
      if (countries.length) out.countries = countries;
      const regions = bucket("region").map((p) => ({ key: p.key }));
      if (regions.length) out.regions = regions;
      const cities = bucket("city").map((p) => ({ key: p.key, radius: 10, distance_unit: "kilometer" }));
      if (cities.length) out.cities = cities;
      const zips = bucket("zip").map((p) => ({ key: p.key }));
      if (zips.length) out.zips = zips;
      const nbh = bucket("neighborhood").map((p) => ({ key: p.key }));
      if (nbh.length) out.neighborhoods = nbh;
      const custom = pins.filter((p) => p.mode === mode).map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        radius: p.radius,
        distance_unit: "kilometer" as const,
        name: p.name,
        address_string: p.address,
      }));
      if (custom.length) out.custom_locations = custom;
      return out;
    };
    const base = grp("include");
    const excl = grp("exclude");
    const targeting = { ...base } as Record<string, unknown>;
    for (const [k, v] of Object.entries(excl)) {
      const key = k === "countries" ? "excluded_countries" : `excluded_${k}`;
      targeting[key] = v;
    }
    // Fallback: se nada foi selecionado, mantém país padrão pra evitar erro no Meta.
    if (!targeting.countries && !targeting.regions && !targeting.cities && !targeting.zips && !targeting.neighborhoods && !targeting.custom_locations) {
      targeting.countries = ["BR"];
    }
    return targeting;
  }


  // galeria
  const listFn = useServerFn(listMetaCreativeUploads);
  const galleryQ = useQuery({
    queryKey: ["meta-uploads", workspaceId, adAccountId],
    queryFn: () => listFn({ data: { workspaceId, adAccountId: adAccountId as `act_${string}`, limit: 30 } }),
    enabled: open && !!adAccountId && step === 3,
  });

  // mutations
  const createCampFn = useServerFn(createMetaCampaign);
  const createAdSetFn = useServerFn(createMetaAdSet);
  const uploadFn = useServerFn(uploadMetaImageToStorage);
  const createCreativeAdFn = useServerFn(createMetaCreativeAndAd);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith("image/")) throw new Error("Apenas imagens são suportadas.");
      if (file.size > 8 * 1024 * 1024) throw new Error("Imagem maior que 8MB.");
      const b64 = await fileToBase64(file);
      const img = new window.Image();
      const dims = await new Promise<{ w: number; h: number }>((res) => {
        img.onload = () => res({ w: img.width, h: img.height });
        img.onerror = () => res({ w: 0, h: 0 });
        img.src = URL.createObjectURL(file);
      });
      return uploadFn({
        data: {
          workspaceId,
          adAccountId: adAccountId as `act_${string}`,
          fileBase64: b64,
          mime: file.type as `image/${"jpeg" | "png" | "gif" | "webp"}`,
          filename: file.name,
          width: dims.w || undefined,
          height: dims.h || undefined,
        },
      });
    },
    onSuccess: (r) => {
      setImageHash(r.imageHash);
      toast.success("Imagem enviada para a Meta.");
      galleryQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalizeMut = useMutation({
    mutationFn: async () => {
      const dailyCents = budgetMode === "daily" ? Math.round(dailyBudget * 100) : undefined;
      const lifetimeCents = budgetMode === "lifetime" && lifetimeBudget > 0 ? Math.round(lifetimeBudget * 100) : undefined;
      const capCents = spendCap > 0 ? Math.round(spendCap * 100) : undefined;
      // 1. campanha
      const camp = await createCampFn({
        data: {
          workspaceId,
          adAccountId: adAccountId as `act_${string}`,
          name: campaignName,
          objective,
          destination: destination || undefined,
          status: "PAUSED",
          buyingType,
          dailyBudgetCents: isCbo ? dailyCents : undefined,
          lifetimeBudgetCents: isCbo ? lifetimeCents : undefined,
          spendCapCents: capCents,
          startTime: startTime || undefined,
          stopTime: stopTime || undefined,
          isCbo,
          bidStrategy: bidStrategy || undefined,
          bidAmountCents: bidAmount > 0 ? Math.round(bidAmount * 100) : undefined,
          isAbTest,
          specialAdCategories: specialCats.length ? specialCats : ["NONE"],
        },
      });
      // 2. ad set, se CBO, orçamento fica na campanha; senão vai no ad set (daily fallback).
      const genders = gender === "all" ? undefined : gender === "male" ? [1] : [2];
      const adset = await createAdSetFn({
        data: {
          workspaceId,
          adAccountId: adAccountId as `act_${string}`,
          campaignId: camp.id,
          name: adSetName.trim() || `${campaignName}, conjunto 1`,
          status: "PAUSED",
          dailyBudgetCents: isCbo ? undefined : (dailyCents ?? Math.round(minBudget * 100)),
          lifetimeBudgetCents: isCbo ? undefined : (budgetMode === "lifetime" && lifetimeBudget > 0 ? Math.round(lifetimeBudget * 100) : undefined),
          optimizationGoal: (optGoalOverride || OPT_GOAL_BY_OBJECTIVE[objective]) as "LINK_CLICKS",
          billingEvent,
          startTime: startTime || undefined,
          endTime: hasEndDate && stopTime ? stopTime : undefined,
          destinationType: effectiveDestinationType || undefined,
          bidAmountCents: adSetBidAmount > 0 ? Math.round(adSetBidAmount * 100) : undefined,
          advantageAudience,
          targeting: (() => {
            const byType: Record<string, Array<{ id: string; name: string }>> = {};
            for (const s of selectedInterests) {
              if (!byType[s.type]) byType[s.type] = [];
              byType[s.type].push({ id: s.id, name: s.name });
            }
            const legacyInterests = byType["interests"];
            const flexibleSpec = Object.keys(byType).length ? [byType] : undefined;
            return {
              geo_locations: buildGeoLocations(geoPicks, mapPins) as { countries?: string[] },
              age_min: ageMin,
              age_max: ageMax,
              genders,
              interests: legacyInterests && legacyInterests.length ? legacyInterests : undefined,
              flexible_spec: flexibleSpec,
              publisher_platforms: publisherPlatforms.length ? (publisherPlatforms as Pub[]) : undefined,
              device_platforms: placementMode === "manual" && devicePlatforms.length < 2 ? devicePlatforms : undefined,
              facebook_positions: placementMode === "manual" && publisherPlatforms.includes("facebook") && fbPositions.length ? fbPositions : undefined,
              instagram_positions: placementMode === "manual" && publisherPlatforms.includes("instagram") && igPositions.length ? igPositions : undefined,
              audience_network_positions: placementMode === "manual" && publisherPlatforms.includes("audience_network") && anPositions.length ? anPositions : undefined,
              messenger_positions: placementMode === "manual" && publisherPlatforms.includes("messenger") && msgPositions.length ? msgPositions : undefined,
            };
          })(),
          promotedObjectPixelId: objective === "OUTCOME_SALES" ? pixelId || undefined : undefined,
          promotedObjectCustomEvent: objective === "OUTCOME_SALES" ? "PURCHASE" : undefined,
          promotedObjectPageId: (conversionLocation === "MESSAGING" || objective === "OUTCOME_LEADS") ? pageId : undefined,
          promotedObjectInstagramActorId: (conversionLocation === "MESSAGING" && msgInstagram && instagramActorId) ? instagramActorId : undefined,
        },
      });
      // 3. criativo + ad
      const ad = await createCreativeAdFn({
        data: {
          workspaceId,
          adAccountId: adAccountId as `act_${string}`,
          adSetId: adset.id,
          adName: adName || `${campaignName}, anúncio 1`,
          pageId,
          instagramActorId: igForPage?.instagram_id,
          message,
          headline,
          description: description || undefined,
          link,
          callToAction: cta,
          imageHash,
          urlTags: urlTags.trim() || undefined,
          status: "PAUSED",
        },
      });
      return { campaignId: camp.id, adSetId: adset.id, adId: ad.adId };
    },
    onSuccess: () => {
      toast.success("Campanha criada em modo pausado. Ative quando quiser publicar.");
      onOpenChange(false);
      resetAll();
      onCreated?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetAll() {
    setStep(1);
    setCampaignName(""); setAdName("");
    setMessage(""); setHeadline(""); setDescription(""); setLink("");
    setImageHash(""); setPreviewUrl("");
    setSelectedInterests([]); setInterestSearch("");
    setGeoPicks([]); setMapPins([]); setGeoSearch("");
    setDestination(""); setSpecialCats(["NONE"]); setBuyingType("AUCTION");
    setBudgetMode("daily"); setLifetimeBudget(0); setSpendCap(0);
    setStartTime(""); setStopTime(""); setIsCbo(false);
    setBidStrategy(""); setBidAmount(0); setIsAbTest(false);
    setAdSetName(""); setConversionLocation("");
    setMsgMessenger(false); setMsgInstagram(false); setMsgWhatsapp(false); setWabaId("");
    setOptGoalOverride(""); setBillingEvent("IMPRESSIONS"); setAdSetBidAmount(0); setHasEndDate(false);
    setInstagramActorId("");
  }

  const budgetOk = isCbo
    ? (budgetMode === "daily" ? dailyBudget >= minBudget : lifetimeBudget >= minBudget * 7)
    : (budgetMode === "daily" ? dailyBudget >= minBudget : true);
  const canNext1 = !!adAccountId && campaignName.trim().length >= 3 && budgetOk && !!destination;
  const hasAnyIncludeGeo = geoPicks.some((p) => p.mode === "include") || mapPins.some((p) => p.mode === "include");
  const messagingOk = conversionLocation !== "MESSAGING" || msgMessenger || msgInstagram || msgWhatsapp;
  const canNext2 = !!pageId && !!conversionLocation && messagingOk && hasAnyIncludeGeo && ageMin >= 13 && ageMax >= ageMin && (objective !== "OUTCOME_SALES" || !!pixelId);
  const canFinish = imageHash && message.trim() && headline.trim() && /^https?:\/\//.test(link);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetAll(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Nova campanha Meta ·{" "}
            {step === 1 ? "1. Campanha" : step === 2 ? "2. Conjunto de anúncios" : "3. Anúncio"}
          </DialogTitle>
        </DialogHeader>

        {/* PASSO 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Conta de anúncios</Label>
              <Select value={adAccountId} onValueChange={setAdAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {accountsQ.data?.map((a) => (
                    <SelectItem key={a.account_id} value={a.account_id}>
                      {a.name || a.account_id} · {a.currency ?? "-"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome da campanha</Label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} maxLength={120} placeholder="Ex: Lançamento Curso · Leads" />
            </div>
            <div>
              <Label>Objetivo</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                {OBJECTIVES.map((o) => (
                  <button
                    key={o.v} type="button"
                    onClick={() => setObjective(o.v)}
                    className={`text-left p-3 rounded-lg border text-xs transition ${objective === o.v ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
                  >
                    <div className="font-medium">{o.l}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{o.sub}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Destino da conversão / objetivo específico</Label>
              <Select value={destination} onValueChange={(v) => setDestination(v as Destination)}>
                <SelectTrigger><SelectValue placeholder="Selecione o destino" /></SelectTrigger>
                <SelectContent>
                  {(DESTINATIONS_BY_OBJECTIVE[objective] ?? []).map((d) => (
                    <SelectItem key={d.v} value={d.v}>
                      <div className="flex flex-col">
                        <span>{d.l}</span>
                        <span className="text-[10px] text-muted-foreground">{d.sub}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Categorias especiais de anúncio</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {SPECIAL_AD_CATEGORIES.map((c) => {
                  const active = specialCats.includes(c.v);
                  return (
                    <button key={c.v} type="button"
                      onClick={() => {
                        if (c.v === "NONE") { setSpecialCats(["NONE"]); return; }
                        setSpecialCats((prev) => {
                          const cleaned = prev.filter((x) => x !== "NONE");
                          return active ? cleaned.filter((x) => x !== c.v) : [...cleaned, c.v];
                        });
                      }}
                      className={`px-3 py-1.5 rounded border text-xs ${active ? "border-primary bg-primary/10" : "border-border"}`}>
                      {c.l}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Obrigatório declarar quando o anúncio for de crédito, emprego, habitação ou temas sociais/políticos.</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de compra</Label>
                <Select value={buyingType} onValueChange={(v) => setBuyingType(v as "AUCTION" | "RESERVED")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUCTION">Leilão (padrão)</SelectItem>
                    <SelectItem value="RESERVED">Reserva (CPM fixo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Teste A/B</Label>
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" onClick={() => setIsAbTest((v) => !v)}
                    className={`px-3 py-1.5 rounded border text-xs ${isAbTest ? "border-primary bg-primary/10" : "border-border"}`}>
                    {isAbTest ? "Ativado" : "Desativado"}
                  </button>
                  <span className="text-[11px] text-muted-foreground">Compara variantes automaticamente.</span>
                </div>
              </div>
            </div>

            <div className="border border-border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Orçamento da campanha (Advantage+ / CBO)</Label>
                  <div className="text-[11px] text-muted-foreground">
                    Ativo: a Meta distribui a verba entre os conjuntos automaticamente.
                    Desativado (ABO): você define o valor de cada conjunto no passo 2.
                  </div>
                </div>
                <button type="button" onClick={() => setIsCbo((v) => !v)}
                  className={`px-3 py-1.5 rounded border text-xs ${isCbo ? "border-primary bg-primary/10" : "border-border"}`}>
                  {isCbo ? "Ativado" : "Desativado"}
                </button>
              </div>

              {isCbo ? (
                <>
                  <div className="flex gap-2">
                    {(["daily", "lifetime"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setBudgetMode(m)}
                        className={`px-3 py-1.5 rounded border text-xs ${budgetMode === m ? "border-primary bg-primary/10" : "border-border"}`}>
                        {m === "daily" ? "Orçamento diário" : "Vitalício"}
                      </button>
                    ))}
                  </div>

                  {budgetMode === "daily" ? (
                    <div>
                      <Label>Diário ({currency})</Label>
                      <Input type="number" min={minBudget} step={0.01} value={dailyBudget}
                        onChange={(e) => setDailyBudget(Math.max(0, Number(e.target.value) || 0))} />
                      <div className="text-[11px] text-muted-foreground mt-1">
                        Mínimo: {minBudget.toLocaleString("pt-BR", { style: "currency", currency })}
                        {currency !== "USD" && fxQ.data ? ` (1 USD = ${fxQ.data.toLocaleString("pt-BR", { style: "currency", currency })} + 0,10 de margem)` : ""}.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label>Vitalício ({currency})</Label>
                      <Input type="number" min={0} step={0.01} value={lifetimeBudget}
                        onChange={(e) => setLifetimeBudget(Math.max(0, Number(e.target.value) || 0))} />
                      <div className="text-[11px] text-muted-foreground mt-1">Divida pelo número de dias entre início e fim.</div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Início (opcional)</Label>
                      <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    </div>
                    <div>
                      <Label>Fim (opcional)</Label>
                      <Input type="datetime-local" value={stopTime} onChange={(e) => setStopTime(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <Label>Limite de gasto total ({currency}, opcional)</Label>
                    <Input type="number" min={0} step={0.01} value={spendCap}
                      onChange={(e) => setSpendCap(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                </>
              ) : (
                <div className="rounded border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
                  Modo ABO selecionado. Continue para o passo <span className="font-medium">2. Conjunto de anúncios</span> para definir o orçamento deste conjunto.
                </div>
              )}
            </div>


            <div className="border border-border rounded-lg p-3 space-y-3">
              <Label className="text-sm">Estratégia de lance</Label>
              <div className="grid grid-cols-2 gap-2">
                {BID_STRATEGIES.map((b) => (
                  <button key={b.v} type="button" onClick={() => setBidStrategy(b.v)}
                    className={`text-left p-2.5 rounded border text-xs ${bidStrategy === b.v ? "border-primary bg-primary/10" : "border-border"}`}>
                    <div className="font-medium">{b.l}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{b.sub}</div>
                  </button>
                ))}
              </div>
              {(bidStrategy === "LOWEST_COST_WITH_BID_CAP" || bidStrategy === "COST_CAP") && (
                <div>
                  <Label>Valor do lance ({currency})</Label>
                  <Input type="number" min={0} step={0.01} value={bidAmount}
                    onChange={(e) => setBidAmount(Math.max(0, Number(e.target.value) || 0))} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* PASSO 2 */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Nome do conjunto */}
            <div>
              <Label>Nome do conjunto de anúncios</Label>
              <Input
                value={adSetName}
                onChange={(e) => setAdSetName(e.target.value)}
                placeholder={`${campaignName || "Campanha"}, conjunto 1`}
                maxLength={200}
              />
            </div>

            {/* Local da conversão */}
            <div className="border border-border rounded-lg p-3 space-y-3">
              <div>
                <Label className="text-sm">Local da conversão</Label>
                <div className="text-[11px] text-muted-foreground">
                  Onde a conversa/conversão acontece. Define o <code>destination_type</code> enviado ao Meta.
                </div>
              </div>
              <Select value={conversionLocation} onValueChange={(v) => setConversionLocation(v as typeof conversionLocation)}>
                <SelectTrigger><SelectValue placeholder="Selecione o local da conversão" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEBSITE">Site</SelectItem>
                  <SelectItem value="APP">App</SelectItem>
                  <SelectItem value="MESSAGING">Destinos das mensagens (WhatsApp / Messenger / Direct)</SelectItem>
                  <SelectItem value="PHONE_CALL">Chamadas</SelectItem>
                  <SelectItem value="INSTAGRAM_PROFILE">Perfil do Instagram</SelectItem>
                  <SelectItem value="ON_AD">No próprio anúncio (formulário instant-neo)</SelectItem>
                </SelectContent>
              </Select>

              {conversionLocation === "MESSAGING" && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs">Destinos das mensagens</Label>
                  <div className="text-[10px] text-muted-foreground -mt-1">
                    Selecione onde conversar com as pessoas. Se marcar mais de um, a Meta prioriza o de maior probabilidade de interação.
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer ${msgMessenger ? "border-primary bg-primary/5" : "border-border"}`}>
                      <input type="checkbox" checked={msgMessenger} onChange={(e) => setMsgMessenger(e.target.checked)} />
                      <span className="font-medium">Messenger</span>
                      <span className="text-muted-foreground">- {assetsQ.data?.pages.find((p) => p.page_id === pageId)?.page_name || "Página do Facebook selecionada"}</span>
                    </label>
                    <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer ${msgInstagram ? "border-primary bg-primary/5" : "border-border"} ${!igForPage ? "opacity-50" : ""}`}>
                      <input type="checkbox" checked={msgInstagram} disabled={!igForPage} onChange={(e) => setMsgInstagram(e.target.checked)} />
                      <span className="font-medium">Instagram Direct</span>
                      <span className="text-muted-foreground">- {igForPage?.instagram_username ? `@${igForPage.instagram_username}` : "sem IG vinculado à página"}</span>
                    </label>
                    <label className={`flex flex-col gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer ${msgWhatsapp ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={msgWhatsapp} onChange={(e) => setMsgWhatsapp(e.target.checked)} />
                        <span className="font-medium">WhatsApp</span>
                        <span className="text-muted-foreground">- conta empresarial conectada</span>
                      </div>
                      {msgWhatsapp && (
                        <div className="pl-6">
                          <Select value={wabaId} onValueChange={setWabaId}>
                            <SelectTrigger className="h-8"><SelectValue placeholder={wabaForAccount.length ? "Selecione o WhatsApp Business" : "Nenhum WABA conectado a esta conta"} /></SelectTrigger>
                            <SelectContent>
                              {wabaForAccount.map((w) => (
                                <SelectItem key={w.waba_id} value={w.waba_id}>{w.name || w.waba_id}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            A Meta usa o número da conta empresarial vinculada à Página do Facebook. Se houver mais de um número, o Ads Manager escolhe pela Página.
                          </div>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Meta de desempenho + cobrança + lance */}
            <div className="border border-border rounded-lg p-3 space-y-3">
              <div>
                <Label className="text-sm">Meta de desempenho</Label>
                <div className="text-[11px] text-muted-foreground">
                  Como a Meta vai otimizar a entrega. Vazio = usar padrão do objetivo ({OPT_GOAL_BY_OBJECTIVE[objective]}).
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Otimização</Label>
                  <Select value={optGoalOverride || "__default__"} onValueChange={(v) => setOptGoalOverride(v === "__default__" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Padrão do objetivo</SelectItem>
                      {OPT_GOAL_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Evento de cobrança</Label>
                  <Select value={billingEvent} onValueChange={(v) => setBillingEvent(v as typeof billingEvent)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IMPRESSIONS">Impressões (CPM)</SelectItem>
                      <SelectItem value="LINK_CLICKS">Cliques (CPC)</SelectItem>
                      <SelectItem value="THRUPLAY">ThruPlay (vídeo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Limite de lance ({currency}), opcional</Label>
                <Input
                  type="number" min={0} step={0.01} value={adSetBidAmount}
                  onChange={(e) => setAdSetBidAmount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0 = automático"
                />
                <div className="text-[10px] text-muted-foreground mt-1">
                  Aplica-se se a estratégia da campanha exigir lance (teto de lance, teto de custo).
                </div>
              </div>
            </div>


            {!isCbo ? (
              <div className="border border-border rounded-lg p-3 space-y-3">
                <div>
                  <Label className="text-sm">Orçamento do conjunto de anúncios (ABO)</Label>
                  <div className="text-[11px] text-muted-foreground">
                    Você controla exatamente quanto este conjunto vai gastar. Para deixar a Meta distribuir automaticamente entre conjuntos, volte ao passo 1 e ative o Advantage+ (CBO).
                  </div>
                </div>
                <div className="flex gap-2">
                  {(["daily", "lifetime"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setBudgetMode(m)}
                      className={`px-3 py-1.5 rounded border text-xs ${budgetMode === m ? "border-primary bg-primary/10" : "border-border"}`}>
                      {m === "daily" ? "Orçamento diário" : "Vitalício"}
                    </button>
                  ))}
                </div>
                {budgetMode === "daily" ? (
                  <div>
                    <Label>Diário ({currency})</Label>
                    <Input type="number" min={minBudget} step={0.01} value={dailyBudget}
                      onChange={(e) => setDailyBudget(Math.max(0, Number(e.target.value) || 0))} />
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Mínimo: {minBudget.toLocaleString("pt-BR", { style: "currency", currency })}
                      {currency !== "USD" && fxQ.data ? ` (1 USD = ${fxQ.data.toLocaleString("pt-BR", { style: "currency", currency })} + 0,10 de margem)` : ""}.
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label>Vitalício ({currency})</Label>
                    <Input type="number" min={0} step={0.01} value={lifetimeBudget}
                      onChange={(e) => setLifetimeBudget(Math.max(0, Number(e.target.value) || 0))} />
                    <div className="text-[11px] text-muted-foreground mt-1">Divida pelo número de dias entre início e fim.</div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data de início</Label>
                    <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 mb-1 text-sm">
                      <input type="checkbox" checked={hasEndDate} onChange={(e) => setHasEndDate(e.target.checked)} />
                      Definir uma data de término
                    </label>
                    <Input type="datetime-local" value={stopTime} disabled={!hasEndDate} onChange={(e) => setStopTime(e.target.value)} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
                Orçamento gerenciado no nível da campanha (Advantage+ / CBO). Para definir o valor por conjunto, volte ao passo 1 e desative o CBO.
              </div>
            )}

            <div>
              <Label>Página do Facebook (obrigatória)</Label>
              <Select value={pageId} onValueChange={setPageId}>
                <SelectTrigger><SelectValue placeholder="Selecione a página" /></SelectTrigger>
                <SelectContent>
                  {assetsQ.data?.pages.map((p) => (
                    <SelectItem key={p.page_id} value={p.page_id}>{p.page_name || p.page_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {igForPage?.instagram_username && (
                <div className="text-[11px] text-muted-foreground mt-1">Instagram vinculado: @{igForPage.instagram_username}</div>
              )}
            </div>

            {igForPage && (
              <div>
                <Label>Conta do Instagram (opcional)</Label>
                <Select value={instagramActorId || "__page_default__"} onValueChange={(v) => setInstagramActorId(v === "__page_default__" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__page_default__">Usar Instagram vinculado à Página ({igForPage.instagram_username ? `@${igForPage.instagram_username}` : igForPage.instagram_id})</SelectItem>
                    {igForPage.instagram_id && (
                      <SelectItem value={igForPage.instagram_id}>@{igForPage.instagram_username || igForPage.instagram_id}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Conta usada para anúncios em posicionamentos do Instagram. Padrão: a conta conectada à Página.
                </div>
              </div>
            )}


            {objective === "OUTCOME_SALES" && (
              <div>
                <Label>Pixel de conversão</Label>
                <Select value={pixelId} onValueChange={setPixelId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o pixel" /></SelectTrigger>
                  <SelectContent>
                    {pixelsForAccount.map((p) => (
                      <SelectItem key={p.pixel_id} value={p.pixel_id}>{p.pixel_name || p.pixel_id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-[11px] text-muted-foreground mt-1">Otimização por evento PURCHASE.</div>
              </div>
            )}

            <div>
              <Label>Localização geográfica</Label>
              <div className="text-[11px] text-muted-foreground mb-2">
                Clique no mapa ou busque um endereço para adicionar pinos. Cada pino tem raio ajustável (1 a 80 km) e pode ser incluído ou excluído. Máximo 20 pinos (limite Meta).
              </div>
              <MapLocationSelector pins={mapPins} onChange={setMapPins} />

              <details className="mt-3 rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                  Ou selecione país / estado / cidade / bairro / CEP inteiros (opcional)
                </summary>
                <div className="p-3 pt-0">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={geoSearch}
                      onChange={(e) => setGeoSearch(e.target.value)}
                      placeholder="Ex: Brasil, São Paulo, Vila Mariana, 04101-000…"
                      className="pl-8"
                    />
                  </div>
                  {geoQ.data?.locations && geoQ.data.locations.length > 0 && (
                    <div className="mt-2 border border-border rounded-lg divide-y divide-border max-h-40 overflow-y-auto">
                      {geoQ.data.locations.map((loc) => {
                        const already = geoPicks.find((g) => g.key === loc.key);
                        return (
                          <button
                            key={loc.key} type="button"
                            onClick={() => {
                              if (already) setGeoPicks((prev) => prev.filter((g) => g.key !== loc.key));
                              else setGeoPicks((prev) => [...prev, { key: loc.key, name: loc.name, type: loc.type as GeoPick["type"], country_code: loc.country_code, region: loc.region, mode: "include" }]);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-muted ${already ? "bg-primary/5" : ""}`}
                          >
                            <span>
                              <span className="font-medium">{loc.name}</span>
                              <span className="text-muted-foreground ml-1">· {loc.type}{loc.region ? ` · ${loc.region}` : ""}{loc.country_name ? ` · ${loc.country_name}` : ""}</span>
                            </span>
                            {already && <Check className="w-3.5 h-3.5 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {geoPicks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {geoPicks.map((g) => (
                        <span key={g.key} className={`text-[11px] px-2 py-1 rounded-full flex items-center gap-1 ${g.mode === "exclude" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
                          {g.mode === "exclude" ? "excluir: " : ""}{g.name}
                          <button
                            type="button"
                            title={g.mode === "exclude" ? "Mudar para incluir" : "Mudar para excluir"}
                            onClick={() => setGeoPicks((prev) => prev.map((x) => x.key === g.key ? { ...x, mode: x.mode === "include" ? "exclude" : "include" } : x))}
                            className="ml-1 opacity-70 hover:opacity-100"
                          >⇄</button>
                          <button type="button" onClick={() => setGeoPicks((prev) => prev.filter((x) => x.key !== g.key))}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Idade mínima</Label>
                <Input type="number" min={13} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value) || 18)} />
              </div>
              <div>
                <Label>Idade máxima</Label>
                <Input type="number" min={13} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value) || 65)} />
              </div>
            </div>

            <div>
              <Label>Gênero</Label>
              <div className="flex gap-2 mt-1">
                {(["all", "male", "female"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGender(g)}
                    className={`px-3 py-1.5 rounded border text-xs ${gender === g ? "border-primary bg-primary/10" : "border-border"}`}>
                    {g === "all" ? "Todos" : g === "male" ? "Homens" : "Mulheres"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label>Direcionamento detalhado (interesses, comportamentos, demografia)</Label>
                <Button
                  type="button" size="sm" variant="outline"
                  disabled={!adAccountId}
                  onClick={() => setSuggestOpen(true)}
                  className="h-7 px-2 text-xs gap-1"
                  title="Gera direcionamentos laterais com IA, foge do óbvio pra baixar CPM"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Sugerir com IA
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground mb-1">
                Busca real na Meta Ads, mesmos itens do Ads Manager. Requer conta de anúncio selecionada.
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={interestSearch}
                  onChange={(e) => setInterestSearch(e.target.value)}
                  placeholder="Ex: marketing digital, empreendedores, viajantes frequentes…"
                  className="pl-8"
                  disabled={!adAccountId}
                />
              </div>
              {interestsQ.data?.items && interestsQ.data.items.length > 0 && (
                <div className="mt-2 border border-border rounded-lg divide-y divide-border max-h-56 overflow-y-auto">
                  {interestsQ.data.items.map((i) => {
                    const already = selectedInterests.find((s) => s.id === i.id && s.type === i.type);
                    const audience = i.audience_size_lower_bound && i.audience_size_upper_bound
                      ? `${(i.audience_size_lower_bound / 1_000_000).toFixed(1)}M-${(i.audience_size_upper_bound / 1_000_000).toFixed(1)}M pessoas`
                      : "";
                    return (
                      <button
                        key={`${i.type}:${i.id}`} type="button"
                        onClick={() => {
                          if (already) setSelectedInterests((prev) => prev.filter((s) => !(s.id === i.id && s.type === i.type)));
                          else setSelectedInterests((prev) => [...prev, { id: i.id, name: i.name, type: i.type }]);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted ${already ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{i.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {i.type}
                              {i.path && i.path.length ? ` · ${i.path.join(" > ")}` : ""}
                              {audience ? ` · ${audience}` : ""}
                            </div>
                          </div>
                          {already && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedInterests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedInterests.map((s) => (
                    <span key={`${s.type}:${s.id}`} className="text-[11px] px-2 py-1 rounded-full bg-primary/15 text-primary inline-flex items-center gap-1">
                      <span className="opacity-60">{s.type}:</span>{s.name}
                      <button type="button" onClick={() => setSelectedInterests((prev) => prev.filter((x) => !(x.id === s.id && x.type === s.type)))} className="ml-1">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ============ Advantage+ Audience ============ */}
            <div className="border border-border rounded-lg p-4 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-1"
                  checked={advantageAudience}
                  onChange={(e) => setAdvantageAudience(e.target.checked)} />
                <div>
                  <div className="text-sm font-medium">Advantage+ Audience (público expandido)</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    O Meta pode entregar seu anúncio além dos critérios de segmentação quando prever bom desempenho.
                    Recomendado; desligue quando precisar de controle total (ex.: categoria especial de anúncio).
                  </p>
                </div>
              </label>

              {advantageAudience && (
                <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold">Prévia da expansão</div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!adAccountId || estimateMut.isPending || (!geoPicks.length && !mapPins.length)}
                      onClick={() => estimateMut.mutate()}
                    >
                      {estimateMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Calcular alcance"}
                    </Button>
                  </div>
                  {!estimateMut.data && !estimateMut.isPending && (
                    <p className="text-xs text-muted-foreground">
                      Clique em <strong>Calcular alcance</strong> para o Meta estimar o público segmentado e quanto o Advantage+ pode expandir.
                    </p>
                  )}
                  {estimateMut.data && (() => {
                    const b = estimateMut.data.baseline;
                    const e = estimateMut.data.expanded;
                    const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
                    const okB = b && !("error" in b);
                    const okE = e && !("error" in e);
                    const lift = okB && okE && b.upper > 0 ? Math.max(0, ((e.upper - b.upper) / b.upper) * 100) : null;
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md border border-border bg-background p-2">
                          <div className="text-muted-foreground">Público segmentado (sem expansão)</div>
                          {okB ? (
                            <div className="font-semibold mt-0.5">
                              {fmt(b.lower)}, {fmt(b.upper)} pessoas
                            </div>
                          ) : (
                            <div className="text-muted-foreground italic mt-0.5">
                              {b && "error" in b ? (b as { error: string }).error.slice(0, 120) : "Estimativa ainda não disponível."}
                            </div>
                          )}
                        </div>
                        <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
                          <div className="text-muted-foreground">Com Advantage+ (expansão)</div>
                          {okE ? (
                            <div className="font-semibold mt-0.5">
                              {fmt(e.lower)}, {fmt(e.upper)} pessoas
                              {lift !== null && lift > 0 && (
                                <span className="ml-1 text-emerald-500">(+{lift.toFixed(0)}%)</span>
                              )}
                            </div>
                          ) : (
                            <div className="text-muted-foreground italic mt-0.5">
                              {e && "error" in e ? (e as { error: string }).error.slice(0, 120) : "Estimativa ainda não disponível."}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {estimateMut.isError && (
                    <p className="text-xs text-red-500">{(estimateMut.error as Error).message}</p>
                  )}
                </div>
              )}
            </div>



            {/* ============ Dispositivos e Posicionamentos ============ */}
            <div className="border border-border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <Label className="text-base">Dispositivos e posicionamentos</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Onde seu anúncio vai aparecer. Feed, Stories, Reels, Marketplace, Audience Network, igual ao Ads Manager.
                  </p>
                </div>
                <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setPlacementMode("advantage")}
                    className={`px-3 py-1.5 ${placementMode === "advantage" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    Advantage+ (recomendado)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlacementMode("manual")}
                    className={`px-3 py-1.5 border-l border-border ${placementMode === "manual" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    Manual
                  </button>
                </div>
              </div>

              {placementMode === "advantage" ? (
                <div className="text-xs text-muted-foreground rounded-md bg-muted/40 p-3">
                  A Meta distribui automaticamente o anúncio pelos posicionamentos com maior chance de resultado.
                  Costuma render mais barato, mas você perde controle fino. Troque para <strong>Manual</strong> se quiser
                  escolher dispositivo e cada superfície na mão.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Dispositivos */}
                  <div>
                    <Label className="text-xs">Dispositivos</Label>
                    <div className="flex gap-2 mt-1.5">
                      {(["mobile", "desktop"] as const).map((d) => {
                        const on = devicePlatforms.includes(d);
                        return (
                          <button
                            key={d} type="button"
                            onClick={() => setDevicePlatforms((prev) =>
                              prev.includes(d)
                                ? (prev.length > 1 ? prev.filter((x) => x !== d) : prev)
                                : [...prev, d]
                            )}
                            className={`px-3 py-1.5 rounded-md border text-xs ${on ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                          >
                            {d === "mobile" ? "Celular" : "Desktop"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Plataformas */}
                  <div>
                    <Label className="text-xs">Plataformas</Label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {ALL_PUB.map((p) => {
                        const on = publisherPlatforms.includes(p);
                        const label = p === "facebook" ? "Facebook" : p === "instagram" ? "Instagram" : p === "audience_network" ? "Audience Network" : "Messenger";
                        return (
                          <button
                            key={p} type="button"
                            onClick={() => setPublisherPlatforms((prev) =>
                              prev.includes(p)
                                ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev)
                                : [...prev, p]
                            )}
                            className={`px-3 py-1.5 rounded-md border text-xs ${on ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Posicionamentos por plataforma */}
                  {publisherPlatforms.includes("facebook") && (
                    <PlacementGroup
                      title="Facebook"
                      options={FB_POS as unknown as ReadonlyArray<{ v: string; label: string }>}
                      selected={fbPositions}
                      onToggle={(v) => setFbPositions((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    />
                  )}
                  {publisherPlatforms.includes("instagram") && (
                    <PlacementGroup
                      title="Instagram"
                      options={IG_POS as unknown as ReadonlyArray<{ v: string; label: string }>}
                      selected={igPositions}
                      onToggle={(v) => setIgPositions((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    />
                  )}
                  {publisherPlatforms.includes("audience_network") && (
                    <PlacementGroup
                      title="Audience Network"
                      options={AN_POS as unknown as ReadonlyArray<{ v: string; label: string }>}
                      selected={anPositions}
                      onToggle={(v) => setAnPositions((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    />
                  )}
                  {publisherPlatforms.includes("messenger") && (
                    <PlacementGroup
                      title="Messenger"
                      options={MSG_POS as unknown as ReadonlyArray<{ v: string; label: string }>}
                      selected={msgPositions}
                      onToggle={(v) => setMsgPositions((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}


        {/* PASSO 3 */}
        {step === 3 && (() => {
          const selectedPage = assetsQ.data?.pages.find((p) => p.page_id === pageId);
          const selectedWaba = assetsQ.data?.whatsapp_accounts.find((w) => w.waba_id === wabaId);
          const isMessagingAd = conversionLocation === "MESSAGING" && (msgMessenger || msgInstagram || msgWhatsapp);
          return (
          <div className="space-y-4">
            {/* Nome do anúncio */}
            <div className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-success" /> Nome do anúncio</Label>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Criar modelo · em breve</span>
              </div>
              <Input value={adName} onChange={(e) => setAdName(e.target.value)} placeholder={`${campaignName || "Campanha"}, anúncio 1`} maxLength={120} />
            </div>

            {/* Identidade, read-only summary do que foi escolhido no passo 2 */}
            <div className="border border-border rounded-lg p-3 space-y-2">
              <Label className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-success" /> Identidade</Label>
              <div className="text-[11px] text-muted-foreground">Perfis e elementos de marca usados no anúncio (definidos no passo 2).</div>
              <div className="grid grid-cols-1 gap-2 text-xs pt-1">
                <div className="flex items-center justify-between px-2.5 py-2 rounded bg-muted/40">
                  <span className="text-muted-foreground">Página do Facebook</span>
                  <span className="font-medium truncate ml-2">{selectedPage?.page_name || "-"}</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-2 rounded bg-muted/40">
                  <span className="text-muted-foreground">Perfil do Instagram</span>
                  <span className="font-medium truncate ml-2">{igForPage?.instagram_username ? `@${igForPage.instagram_username}` : "-"}</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-2 rounded bg-muted/40">
                  <span className="text-muted-foreground">Número do WhatsApp</span>
                  <span className="font-medium truncate ml-2">{msgWhatsapp && selectedWaba ? (selectedWaba.name || selectedWaba.waba_id) : "-"}</span>
                </div>
              </div>
              <button type="button" onClick={() => setStep(2)} className="text-[11px] text-primary hover:underline">Alterar no passo 2 →</button>
            </div>

            {/* Configuração do anúncio, formato */}
            <div className="border border-border rounded-lg p-3 space-y-3">
              <Label className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-success" /> Configuração do anúncio</Label>
              <div>
                <div className="text-xs font-medium mb-1.5">Formato</div>
                <div className="text-[11px] text-muted-foreground mb-2">Escolha um layout para o criativo do anúncio.</div>
                <div className="space-y-1.5">
                  {([
                    { v: "SINGLE_IMAGE", l: "Imagem ou vídeo único", sub: "Uma imagem ou um vídeo, ou uma apresentação com múltiplas imagens.", enabled: true },
                    { v: "CAROUSEL", l: "Carrossel", sub: "Duas ou mais imagens ou vídeos roláveis.", enabled: false },
                  ] as const).map((f) => (
                    <label key={f.v}
                      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${!f.enabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${adFormat === f.v ? "border-primary bg-primary/5" : "border-border"}`}>
                      <input type="radio" name="adfmt" disabled={!f.enabled} checked={adFormat === f.v} onChange={() => f.enabled && setAdFormat(f.v)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          {f.l}
                          {!f.enabled && <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">em breve</span>}
                        </div>
                        <div className="text-muted-foreground">{f.sub}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-2 text-xs pt-1 border-t border-border cursor-pointer">
                <input type="checkbox" checked={multiAdvertiser} onChange={(e) => setMultiAdvertiser(e.target.checked)} className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">Anúncios com vários anunciantes</div>
                  <div className="text-[10px] text-muted-foreground">O anúncio pode aparecer com outros na mesma unidade para ajudar na descoberta.</div>
                </div>
              </label>
            </div>

            {/* Criativo do anúncio */}
            <div className="border border-border rounded-lg p-3 space-y-3">
              <Label className="flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-primary" /> Criativo do anúncio</Label>
              <div className="text-[11px] text-muted-foreground">Selecione e otimize o texto do anúncio, a mídia e os aprimoramentos.</div>

              <div>
                <div className="text-xs font-medium mb-1">Mídia (imagem, JPG/PNG, máx 8MB)</div>
                <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                  <div className="flex flex-col gap-2">
                    <input
                      id="meta-image-file" type="file" accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setPreviewUrl(URL.createObjectURL(f));
                          uploadMut.mutate(f);
                        }
                      }}
                      className="hidden"
                    />
                    <label htmlFor="meta-image-file"
                      className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-xs hover:bg-muted">
                      {uploadMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploadMut.isPending ? "Enviando…" : "Enviar nova imagem"}
                    </label>
                    {imageHash && <div className="text-[11px] text-success">✓ Imagem pronta (hash: {imageHash.slice(0, 8)}…)</div>}
                  </div>
                  {previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="preview" className="w-24 h-24 object-cover rounded border border-border" />
                  )}
                </div>

                {galleryQ.data?.uploads && galleryQ.data.uploads.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Ou escolha de uploads recentes</div>
                    <div className="grid grid-cols-6 gap-2">
                      {galleryQ.data.uploads.map((u) => (
                        <button key={u.id} type="button"
                          onClick={() => { if (u.meta_image_hash) { setImageHash(u.meta_image_hash); setPreviewUrl(u.previewUrl ?? ""); } }}
                          className={`aspect-square rounded border overflow-hidden hover:opacity-90 ${imageHash === u.meta_image_hash ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
                        >
                          {u.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.previewUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted"><ImageIcon className="w-4 h-4 text-muted-foreground" /></div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">Texto principal</Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={3} placeholder="Texto que aparece acima da imagem no feed." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Título</Label>
                  <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={255} placeholder="Ex: Ganhe 50% no lançamento" />
                </div>
                <div>
                  <Label className="text-xs">CTA</Label>
                  <Select value={cta} onValueChange={(v) => setCta(v as typeof cta)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CTAS.filter((c) => allowedCtas.includes(c.v)).map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">Só aparecem CTAs válidos para o objetivo escolhido.</p>
                </div>
              </div>
              <div>
                <Label className="text-xs">Descrição (opcional)</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
              </div>
              <div>
                <Label className="text-xs">Link de destino</Label>
                <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" type="url" />
              </div>

              <div className="pt-2 border-t border-border space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Tradução do criativo Advantage+</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">em breve</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Teste de criativo (A/B até 7 versões)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">em breve</span>
                </div>
              </div>
            </div>

            {/* Modelo de mensagem, só p/ anúncios de mensagem */}
            {isMessagingAd && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <Label className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-success" /> Modelo de mensagem</Label>
                <div className="text-[11px] text-muted-foreground">Escolha o modelo que inicia a conversa depois que as pessoas tocarem no seu anúncio.</div>
                <div className="space-y-1.5 pt-1">
                  {([
                    { v: "START_CONVERSATIONS", l: "Iniciar conversas", sub: "Sugere frases para as pessoas tocarem e iniciarem conversas com sua empresa.", enabled: true },
                    { v: "COLLECT_INFO", l: "Coletar informações com um formulário no WhatsApp", sub: "Capture leads via WhatsApp Flows (padrão configurável no Ads Manager).", enabled: false },
                    { v: "PARTNER_APP", l: "App do parceiro", sub: "Use a sequência de mensagens de um app parceiro.", enabled: false },
                  ] as const).map((m) => (
                    <label key={m.v}
                      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${!m.enabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${messageTemplate === m.v ? "border-primary bg-primary/5" : "border-border"}`}>
                      <input type="radio" name="msgtpl" disabled={!m.enabled} checked={messageTemplate === m.v} onChange={() => m.enabled && setMessageTemplate(m.v)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          {m.l}
                          {!m.enabled && <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">em breve</span>}
                        </div>
                        <div className="text-muted-foreground">{m.sub}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground pt-1">
                  A saudação e as frases sugeridas usam o padrão da Página. Personalize depois pelo Ads Manager em "Modelo de mensagem".
                </div>
              </div>
            )}

            {/* Rastreamento */}
            <div className="border border-border rounded-lg p-3 space-y-2">
              <Label className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-success" /> Rastreamento</Label>
              <div className="text-[11px] text-muted-foreground">Selecione os eventos de conversão a serem rastreados.</div>

              <div className="flex items-center justify-between px-2.5 py-2 rounded bg-muted/40 text-xs">
                <span>Eventos do site (Pixel)</span>
                <span className="font-mono text-[10px] truncate max-w-[50%]">
                  {objective === "OUTCOME_SALES" ? (pixelId ? `pixel_id: ${pixelId}` : "definir no passo 1") : "não aplicável a este objetivo"}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-2 rounded bg-muted/40 text-xs opacity-60">
                <span>Eventos do app</span><span className="text-[10px]">em breve</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-2 rounded bg-muted/40 text-xs opacity-60">
                <span>Eventos offline</span><span className="text-[10px]">em breve</span>
              </div>

              <div>
                <Label className="text-xs">Par-metros de URL (UTMs)</Label>
                <Input value={urlTags} onChange={(e) => setUrlTags(e.target.value)}
                  placeholder="utm_source=facebook&utm_medium=cpc&utm_campaign={{campaign.name}}" maxLength={2000} />
                <div className="text-[10px] text-muted-foreground mt-1">
                  Anexados ao link de destino. Aceita variáveis dinÃ¢micas da Meta como <code>{"{{campaign.name}}"}</code>, <code>{"{{adset.id}}"}</code>, <code>{"{{ad.id}}"}</code>.
                </div>
              </div>
            </div>
          </div>
          );
        })()}


        <DialogFooter className="mt-4 flex-row justify-between sm:justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {step < 3 ? (
              <Button size="sm"
                disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
                onClick={() => setStep((s) => s + 1)}>
                Avançar <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button size="sm" disabled={!canFinish || finalizeMut.isPending} onClick={() => finalizeMut.mutate()}>
                {finalizeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Criar campanha (pausada)
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Dialog: Sugerir direcionamentos com IA (laterais, fora do óbvio) */}
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Sugestões de direcionamento com IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed">
              <strong>Estratégia:</strong> a IA gera direcionamentos <em>laterais</em>, hobbies, marcas,
              comportamentos e mídias que o público consome em paralelo, sem citar o produto. Isso foge dos
              interesses óbvios que todo mundo usa e reduz o custo do leilão.
            </div>
            <div>
              <Label>Produto / oferta</Label>
              <Textarea
                value={suggestProduct} onChange={(e) => setSuggestProduct(e.target.value)}
                placeholder="Ex: curso online de investimentos em ações para iniciantes"
                rows={2} maxLength={1200}
              />
            </div>
            <div>
              <Label>Público-alvo (opcional, mas melhora muito)</Label>
              <Textarea
                value={suggestAudience} onChange={(e) => setSuggestAudience(e.target.value)}
                placeholder="Ex: homens 25-40, classe B, moram em capital, já investem em renda fixa e querem migrar pra bolsa"
                rows={2} maxLength={1200}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => suggestMut.mutate()}
                disabled={suggestProduct.trim().length < 10 || suggestMut.isPending}
                className="gap-2"
              >
                {suggestMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Gerar sugestões
              </Button>
            </div>

            {suggestions.length > 0 && (
              <div className="border border-border rounded-lg divide-y divide-border max-h-[380px] overflow-y-auto">
                {suggestions.map((s) => {
                  const already = selectedInterests.find((x) => x.id === s.id && x.type === s.type);
                  const size = s.audience_size_lower_bound && s.audience_size_upper_bound
                    ? `${(s.audience_size_lower_bound / 1_000_000).toFixed(1)}M-${(s.audience_size_upper_bound / 1_000_000).toFixed(1)}M`
                    : "";
                  return (
                    <button
                      key={`${s.type}:${s.id}`} type="button"
                      onClick={() => {
                        if (already) setSelectedInterests((prev) => prev.filter((x) => !(x.id === s.id && x.type === s.type)));
                        else setSelectedInterests((prev) => [...prev, { id: s.id, name: s.name, type: s.type }]);
                      }}
                      className={`w-full text-left px-3 py-2.5 text-xs hover:bg-muted transition ${already ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{s.name} <span className="text-[10px] text-muted-foreground font-normal">· {s.type}{size ? ` · ${size}` : ""}</span></div>
                          {s.path.length > 0 && (
                            <div className="text-[10px] text-muted-foreground truncate">{s.path.join(" > ")}</div>
                          )}
                          <div className="text-[11px] text-primary/80 mt-0.5">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-primary/10 mr-1.5">{s.angle}</span>
                            <span className="italic">via "{s.origin_term}"</span>, {s.reasoning}
                          </div>
                        </div>
                        {already
                          ? <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          : <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">adicionar</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {suggestMut.isSuccess && suggestions.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                Nenhuma sugestão validada na Meta. Detalha melhor o público e tenta de novo.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
