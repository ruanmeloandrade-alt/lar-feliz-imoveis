/**
 * Catálogo de KPIs do Meta Ads usado no dashboard, relatórios e automações.
 * Os campos `totalsField` apontam para `totals` retornado por `getMetaInsights`.
 */

export type MetaKpiUnit = "currency" | "number" | "percent" | "roas" | "ranking" | "duration_sec";

export interface MetaKpiDef {
  key: string;
  label: string;
  group: string;
  unit: MetaKpiUnit;
  totalsField?: string;
  realField?: string;
  description?: string;
}

export const META_KPI_GROUPS = [
  "Resultados e investimento",
  "Distribuição",
  "Visualizações e reconhecimento",
  "Cliques e tráfego",
  "Engajamento",
  "Mensagens e ligações",
  "Conversões",
  "Valores de conversão",
  "Custos por ação",
  "Qualidade (rankings Meta)",
  "ROAS Real (CRM × Ads)",
] as const;

export const META_KPI_CATALOG: MetaKpiDef[] = [
  // Resultados e investimento
  { key: "results", label: "Resultados", group: "Resultados e investimento", unit: "number", totalsField: "results" },
  { key: "cost_per_result", label: "Custo por resultado", group: "Resultados e investimento", unit: "currency", totalsField: "costPerResult" },
  { key: "result_rate", label: "Índice de resultados", group: "Resultados e investimento", unit: "percent", totalsField: "resultRate" },
  { key: "result_value", label: "Valor dos resultados", group: "Resultados e investimento", unit: "currency", totalsField: "resultValue" },
  { key: "result_roas", label: "ROAS de resultados", group: "Resultados e investimento", unit: "roas", totalsField: "resultRoas" },
  { key: "spend", label: "Valor usado", group: "Resultados e investimento", unit: "currency", totalsField: "spend" },
  { key: "social_spend", label: "Investimento social", group: "Resultados e investimento", unit: "currency", totalsField: "socialSpend" },
  { key: "budget_used_percent", label: "Porcentagem do valor gasto", group: "Resultados e investimento", unit: "percent", totalsField: "budgetUsedPercent" },

  // Distribuição
  { key: "impressions", label: "Impressões", group: "Distribuição", unit: "number", totalsField: "impressions" },
  { key: "reach", label: "Alcance", group: "Distribuição", unit: "number", totalsField: "reach" },
  { key: "frequency", label: "Frequência", group: "Distribuição", unit: "number", totalsField: "frequency" },
  { key: "cpm", label: "CPM (custo por 1.000 impressões)", group: "Distribuição", unit: "currency", totalsField: "cpm" },
  { key: "cpp_meta_accounts", label: "Custo por 1.000 Contas Meta alcançadas", group: "Distribuição", unit: "currency", totalsField: "cppMetaAccountsReached" },
  { key: "full_view_impressions", label: "Impressões vistas 100%", group: "Distribuição", unit: "number", totalsField: "fullViewImpressions" },
  { key: "full_view_reach", label: "Alcance de visualização total", group: "Distribuição", unit: "number", totalsField: "fullViewReach" },

  // Visualizações e reconhecimento
  { key: "views", label: "Visualizações", group: "Visualizações e reconhecimento", unit: "number", totalsField: "views" },
  { key: "video_plays", label: "Reproduções de vídeo", group: "Visualizações e reconhecimento", unit: "number", totalsField: "videoPlays" },
  { key: "video_views", label: "Reproduções de vídeo por no mínimo 3 segundos", group: "Visualizações e reconhecimento", unit: "number", totalsField: "videoViews" },
  { key: "video_continuous_plays", label: "Reproduções de vídeo contínuas", group: "Visualizações e reconhecimento", unit: "number", totalsField: "videoContinuousPlays" },
  { key: "unique_video_continuous_plays", label: "Reproduções de vídeo contínuas únicas", group: "Visualizações e reconhecimento", unit: "number", totalsField: "uniqueVideoContinuousPlays" },
  { key: "video_15s", label: "Reproduções de vídeo por no mínimo 15 segundos", group: "Visualizações e reconhecimento", unit: "number", totalsField: "video15s" },
  { key: "video_30s", label: "Reproduções de vídeo por no mínimo 30 segundos", group: "Visualizações e reconhecimento", unit: "number", totalsField: "video30s" },
  { key: "video_thruplay", label: "ThruPlays", group: "Visualizações e reconhecimento", unit: "number", totalsField: "videoThruplay" },
  { key: "video_p25", label: "Reproduções de vídeo 25%", group: "Visualizações e reconhecimento", unit: "number", totalsField: "videoP25" },
  { key: "video_p50", label: "Reproduções de vídeo 50%", group: "Visualizações e reconhecimento", unit: "number", totalsField: "videoP50" },
  { key: "video_p75", label: "Reproduções de vídeo 75%", group: "Visualizações e reconhecimento", unit: "number", totalsField: "videoP75" },
  { key: "video_p95", label: "Reproduções de vídeo 95%", group: "Visualizações e reconhecimento", unit: "number", totalsField: "videoP95" },
  { key: "video_p100", label: "Reproduções de vídeo 100%", group: "Visualizações e reconhecimento", unit: "number", totalsField: "videoP100" },
  { key: "video_retention_p25", label: "Retenção até 25%", group: "Visualizações e reconhecimento", unit: "percent", totalsField: "videoRetentionP25" },
  { key: "video_retention_p50", label: "Retenção até 50%", group: "Visualizações e reconhecimento", unit: "percent", totalsField: "videoRetentionP50" },
  { key: "video_retention_p75", label: "Retenção até 75%", group: "Visualizações e reconhecimento", unit: "percent", totalsField: "videoRetentionP75" },
  { key: "video_retention_p95", label: "Retenção até 95%", group: "Visualizações e reconhecimento", unit: "percent", totalsField: "videoRetentionP95" },
  { key: "video_hold_rate", label: "Hold rate até 100%", group: "Visualizações e reconhecimento", unit: "percent", totalsField: "videoHoldRate" },
  { key: "video_avg_watch_time", label: "Tempo médio de reprodução de vídeo", group: "Visualizações e reconhecimento", unit: "duration_sec", totalsField: "videoAvgWatchTime" },
  { key: "cost_per_video_play", label: "Custo por reprodução de vídeo", group: "Visualizações e reconhecimento", unit: "currency", totalsField: "costPerVideoPlay" },
  { key: "cost_per_video_view", label: "Custo por reprodução de vídeo de 3s", group: "Visualizações e reconhecimento", unit: "currency", totalsField: "costPerVideoView" },
  { key: "cost_per_video_continuous_play", label: "Custo por reprodução de vídeo contínua", group: "Visualizações e reconhecimento", unit: "currency", totalsField: "costPerVideoContinuousPlay" },
  { key: "cost_per_thruplay", label: "Custo por ThruPlay", group: "Visualizações e reconhecimento", unit: "currency", totalsField: "costPerThruplay" },
  { key: "estimated_ad_recallers", label: "Lembrança estimada do anúncio", group: "Visualizações e reconhecimento", unit: "number", totalsField: "estimatedAdRecallers" },
  { key: "estimated_ad_recall_rate", label: "Taxa de lembrança estimada", group: "Visualizações e reconhecimento", unit: "percent", totalsField: "estimatedAdRecallRate" },
  { key: "cost_per_estimated_recaller", label: "Custo por lembrança estimada", group: "Visualizações e reconhecimento", unit: "currency", totalsField: "costPerEstimatedRecaller" },

  // Cliques e tráfego
  { key: "clicks", label: "Cliques (todos)", group: "Cliques e tráfego", unit: "number", totalsField: "clicks" },
  { key: "unique_clicks", label: "Cliques únicos (todos)", group: "Cliques e tráfego", unit: "number", totalsField: "uniqueClicks" },
  { key: "link_clicks", label: "Cliques no link", group: "Cliques e tráfego", unit: "number", totalsField: "linkClicks" },
  { key: "unique_link_clicks", label: "Cliques no link únicos", group: "Cliques e tráfego", unit: "number", totalsField: "uniqueLinkClicks" },
  { key: "outbound_clicks", label: "Cliques de saída", group: "Cliques e tráfego", unit: "number", totalsField: "outboundClicks" },
  { key: "unique_outbound_clicks", label: "Cliques de saída únicos", group: "Cliques e tráfego", unit: "number", totalsField: "uniqueOutboundClicks" },
  { key: "photo_clicks", label: "Cliques na foto", group: "Cliques e tráfego", unit: "number", totalsField: "photoClicks" },
  { key: "business_ai_clicks", label: "Cliques na IA comercial", group: "Cliques e tráfego", unit: "number", totalsField: "businessAiClicks" },
  { key: "shop_clicks", label: "Cliques na loja", group: "Cliques e tráfego", unit: "number", totalsField: "shopClicks" },
  { key: "ctr", label: "CTR (todos)", group: "Cliques e tráfego", unit: "percent", totalsField: "ctr" },
  { key: "unique_ctr", label: "CTR único (todos)", group: "Cliques e tráfego", unit: "percent", totalsField: "uniqueCtr" },
  { key: "inline_link_click_ctr", label: "CTR (taxa de cliques no link)", group: "Cliques e tráfego", unit: "percent", totalsField: "inlineLinkClickCtr" },
  { key: "unique_inline_link_click_ctr", label: "CTR único (taxa de cliques no link)", group: "Cliques e tráfego", unit: "percent", totalsField: "uniqueInlineLinkClickCtr" },
  { key: "outbound_ctr", label: "CTR de saída", group: "Cliques e tráfego", unit: "percent", totalsField: "outboundCtr" },
  { key: "unique_outbound_ctr", label: "CTR de saída único", group: "Cliques e tráfego", unit: "percent", totalsField: "uniqueOutboundCtr" },
  { key: "cpc", label: "CPC (todos)", group: "Cliques e tráfego", unit: "currency", totalsField: "cpc" },
  { key: "cost_per_link_click", label: "CPC (custo por clique no link)", group: "Cliques e tráfego", unit: "currency", totalsField: "costPerLinkClick" },
  { key: "cost_per_unique_link_click", label: "Custo por clique no link único", group: "Cliques e tráfego", unit: "currency", totalsField: "costPerUniqueLinkClick" },
  { key: "cost_per_outbound_click", label: "Custo por clique de saída", group: "Cliques e tráfego", unit: "currency", totalsField: "costPerOutboundClick" },
  { key: "cost_per_unique_outbound_click", label: "Custo por clique de saída único", group: "Cliques e tráfego", unit: "currency", totalsField: "costPerUniqueOutboundClick" },
  { key: "cost_per_unique_click", label: "Custo por clique único (todos)", group: "Cliques e tráfego", unit: "currency", totalsField: "costPerUniqueClick" },
  { key: "landing_page_views", label: "Visualizações da página de destino", group: "Cliques e tráfego", unit: "number", totalsField: "landingPageViews" },
  { key: "cost_per_lpv", label: "Custo por visualização da página de destino", group: "Cliques e tráfego", unit: "currency", totalsField: "costPerLpv" },
  { key: "instagram_profile_visits", label: "Visitas ao perfil do Instagram", group: "Cliques e tráfego", unit: "number", totalsField: "instagramProfileVisits" },

  // Engajamento
  { key: "post_engagement", label: "Engajamentos com o post", group: "Engajamento", unit: "number", totalsField: "postEngagement" },
  { key: "page_engagement", label: "Engajamento com a Página", group: "Engajamento", unit: "number", totalsField: "pageEngagement" },
  { key: "post_reaction", label: "Reações ao post", group: "Engajamento", unit: "number", totalsField: "postReaction" },
  { key: "post_comment", label: "Comentários no post", group: "Engajamento", unit: "number", totalsField: "postComment" },
  { key: "post_share", label: "Compartilhamentos do post", group: "Engajamento", unit: "number", totalsField: "postShare" },
  { key: "post_save", label: "Salvamentos do post", group: "Engajamento", unit: "number", totalsField: "postSave" },
  { key: "page_like", label: "Curtidas do Facebook", group: "Engajamento", unit: "number", totalsField: "pageLike" },
  { key: "instagram_follows", label: "Seguidores no Instagram", group: "Engajamento", unit: "number", totalsField: "instagramFollows" },
  { key: "photo_view", label: "Cliques na foto", group: "Engajamento", unit: "number", totalsField: "photoView" },
  { key: "checkins", label: "Check-ins", group: "Engajamento", unit: "number", totalsField: "checkins" },
  { key: "event_responses", label: "Participações no evento", group: "Engajamento", unit: "number", totalsField: "eventResponses" },
  { key: "group_join_requests", label: "Solicitações para participar do grupo", group: "Engajamento", unit: "number", totalsField: "groupJoinRequests" },
  { key: "effect_shares", label: "Compartilhamento do efeito", group: "Engajamento", unit: "number", totalsField: "effectShares" },
  { key: "reminder_set", label: "Lembretes de rede ativados", group: "Engajamento", unit: "number", totalsField: "reminderSet" },
  { key: "link_click_actions", label: "Ações de clique no link", group: "Engajamento", unit: "number", totalsField: "linkClickActions" },
  { key: "cost_per_post_engagement", label: "Custo por engajamento com o post", group: "Engajamento", unit: "currency", totalsField: "costPerPostEngagement" },
  { key: "cost_per_page_engagement", label: "Custo por engajamento com a Página", group: "Engajamento", unit: "currency", totalsField: "costPerPageEngagement" },
  { key: "cost_per_page_like", label: "Custo por curtida", group: "Engajamento", unit: "currency", totalsField: "costPerPageLike" },
  { key: "cost_per_event_response", label: "Custo por participação no evento", group: "Engajamento", unit: "currency", totalsField: "costPerEventResponse" },
  { key: "cost_per_group_join_request", label: "Custo por solicitação para participar do grupo", group: "Engajamento", unit: "currency", totalsField: "costPerGroupJoinRequest" },

  // Mensagens e ligações
  { key: "messaging_subscriptions", label: "Assinaturas de mensagem", group: "Mensagens e ligações", unit: "number", totalsField: "messagingSubscriptions" },
  { key: "messaging_contacts", label: "Contatos por mensagem", group: "Mensagens e ligações", unit: "number", totalsField: "messagingContacts" },
  { key: "new_messaging_contacts", label: "Novos contatos de mensagem", group: "Mensagens e ligações", unit: "number", totalsField: "newMessagingContacts" },
  { key: "returning_messaging_contacts", label: "Contatos por mensagem que retornam", group: "Mensagens e ligações", unit: "number", totalsField: "returningMessagingContacts" },
  { key: "messaging_conversations_started", label: "Conversas por mensagem iniciadas", group: "Mensagens e ligações", unit: "number", totalsField: "messagingConversationsStarted" },
  { key: "messaging_conversations_replied", label: "Conversas por mensagem respondidas", group: "Mensagens e ligações", unit: "number", totalsField: "messagingConversationsReplied" },
  { key: "welcome_message_views", label: "Visualizações da mensagem de boas-vindas", group: "Mensagens e ligações", unit: "number", totalsField: "welcomeMessageViews" },
  { key: "cost_per_messaging_subscription", label: "Custo por assinatura de mensagem", group: "Mensagens e ligações", unit: "currency", totalsField: "costPerMessagingSubscription" },
  { key: "cost_per_messaging_conversation_started", label: "Custo por conversa por mensagem iniciada", group: "Mensagens e ligações", unit: "currency", totalsField: "costPerMessagingConversationStarted" },
  { key: "cost_per_new_messaging_contact", label: "Custo por novo contato por mensagem", group: "Mensagens e ligações", unit: "currency", totalsField: "costPerNewMessagingContact" },
  { key: "messenger_calls", label: "Ligações do Messenger feitas", group: "Mensagens e ligações", unit: "number", totalsField: "messengerCalls" },
  { key: "phone_calls", label: "Ligações feitas", group: "Mensagens e ligações", unit: "number", totalsField: "phoneCalls" },
  { key: "callback_requests", label: "Solicitações de retorno de ligação enviadas", group: "Mensagens e ligações", unit: "number", totalsField: "callbackRequests" },

  // Conversões
  { key: "leads", label: "Leads", group: "Conversões", unit: "number", totalsField: "leads" },
  { key: "purchases", label: "Compras", group: "Conversões", unit: "number", totalsField: "purchases" },
  { key: "website_purchases", label: "Compras direto no site", group: "Conversões", unit: "number", totalsField: "websitePurchases" },
  { key: "store_assisted_purchases", label: "Compras com assistência das lojas", group: "Conversões", unit: "number", totalsField: "storeAssistedPurchases" },
  { key: "add_to_cart", label: "Adições ao carrinho", group: "Conversões", unit: "number", totalsField: "addToCart" },
  { key: "wishlist_adds", label: "Adições à lista de desejos", group: "Conversões", unit: "number", totalsField: "wishlistAdds" },
  { key: "initiate_checkout", label: "Finalizações de compra iniciadas", group: "Conversões", unit: "number", totalsField: "initiateCheckout" },
  { key: "add_payment_info", label: "Inclusões de informações de pagamento", group: "Conversões", unit: "number", totalsField: "addPaymentInfo" },
  { key: "view_content", label: "Visualizações de conteúdo", group: "Conversões", unit: "number", totalsField: "viewContent" },
  { key: "complete_registration", label: "Registros concluídos", group: "Conversões", unit: "number", totalsField: "completeRegistration" },
  { key: "subscribe", label: "Assinaturas", group: "Conversões", unit: "number", totalsField: "subscribe" },
  { key: "app_activations", label: "Ativações de aplicativos", group: "Conversões", unit: "number", totalsField: "appActivations" },
  { key: "ratings_submitted", label: "Classificações enviadas", group: "Conversões", unit: "number", totalsField: "ratingsSubmitted" },
  { key: "get_directions_clicks", label: "Cliques em Como chegar", group: "Conversões", unit: "number", totalsField: "getDirectionsClicks" },
  { key: "app_ad_clicks", label: "Cliques no anúncio no aplicativo", group: "Conversões", unit: "number", totalsField: "appAdClicks" },
  { key: "phone_number_clicks", label: "Cliques no número de telefone", group: "Conversões", unit: "number", totalsField: "phoneNumberClicks" },
  { key: "workflow_completions", label: "Conclusões do fluxo de trabalho", group: "Conversões", unit: "number", totalsField: "workflowCompletions" },
  { key: "achievements_unlocked", label: "Conquistas desbloqueadas", group: "Conversões", unit: "number", totalsField: "achievementsUnlocked" },
  { key: "contact", label: "Contatos", group: "Conversões", unit: "number", totalsField: "contact" },
  { key: "donate", label: "Doações", group: "Conversões", unit: "number", totalsField: "donate" },
  { key: "app_engagement", label: "Engajamentos com o app", group: "Conversões", unit: "number", totalsField: "appEngagement" },
  { key: "app_story_engagement", label: "Engajamentos com o story no app", group: "Conversões", unit: "number", totalsField: "appStoryEngagement" },
  { key: "custom_events", label: "Eventos personalizados", group: "Conversões", unit: "number", totalsField: "customEvents" },
  { key: "credit_spends", label: "Gastos de créditos", group: "Conversões", unit: "number", totalsField: "creditSpends" },
  { key: "schedule", label: "Horas marcadas", group: "Conversões", unit: "number", totalsField: "schedule" },
  { key: "app_ad_impressions", label: "Impressões do anúncio no aplicativo", group: "Conversões", unit: "number", totalsField: "appAdImpressions" },
  { key: "submit_application", label: "Inscrições enviadas", group: "Conversões", unit: "number", totalsField: "submitApplication" },
  { key: "app_installs", label: "Instalações do app", group: "Conversões", unit: "number", totalsField: "appInstalls" },
  { key: "facebook_purchase_messages", label: "Mensagens para comprar no Facebook", group: "Conversões", unit: "number", totalsField: "facebookPurchaseMessages" },
  { key: "levels_achieved", label: "Níveis alcançados", group: "Conversões", unit: "number", totalsField: "levelsAchieved" },
  { key: "offline_conversions", label: "Outras conversões offline", group: "Conversões", unit: "number", totalsField: "offlineConversions" },
  { key: "orders_created", label: "Pedidos criados", group: "Conversões", unit: "number", totalsField: "ordersCreated" },
  { key: "orders_shipped", label: "Pedidos enviados", group: "Conversões", unit: "number", totalsField: "ordersShipped" },
  { key: "start_trial", label: "Períodos de avaliação iniciados", group: "Conversões", unit: "number", totalsField: "startTrial" },
  { key: "search", label: "Pesquisas", group: "Conversões", unit: "number", totalsField: "search" },
  { key: "find_location", label: "Pesquisas de localização", group: "Conversões", unit: "number", totalsField: "findLocation" },
  { key: "customize_product", label: "Personalizar produto", group: "Conversões", unit: "number", totalsField: "customizeProduct" },
  { key: "roas", label: "ROAS (pixel)", group: "Conversões", unit: "roas", totalsField: "roasActual" },
  { key: "purchase_roas", label: "ROAS de compra", group: "Conversões", unit: "roas", totalsField: "roas" },
  { key: "website_purchase_roas", label: "ROAS de compra no site", group: "Conversões", unit: "roas", totalsField: "websitePurchaseRoas" },

  // Valores de conversão
  { key: "purchase_value", label: "Valor de compras", group: "Valores de conversão", unit: "currency", totalsField: "purchaseValueActual" },
  { key: "website_purchase_value", label: "Valor de compras no site", group: "Valores de conversão", unit: "currency", totalsField: "websitePurchaseValue" },
  { key: "lead_value", label: "Valor de leads", group: "Valores de conversão", unit: "currency", totalsField: "leadValue" },
  { key: "add_to_cart_value", label: "Valor de adições ao carrinho", group: "Valores de conversão", unit: "currency", totalsField: "addToCartValue" },
  { key: "initiate_checkout_value", label: "Valor de checkouts iniciados", group: "Valores de conversão", unit: "currency", totalsField: "initiateCheckoutValue" },
  { key: "subscribe_value", label: "Valor de assinaturas", group: "Valores de conversão", unit: "currency", totalsField: "subscribeValue" },
  { key: "donate_value", label: "Valor de doações", group: "Valores de conversão", unit: "currency", totalsField: "donateValue" },
  { key: "omni_purchase_value", label: "Valor de compras omni", group: "Valores de conversão", unit: "currency", totalsField: "omniPurchaseValue" },
  { key: "total_action_value", label: "Valor total de ações", group: "Valores de conversão", unit: "currency", totalsField: "totalActionValue" },

  // Custos por ação
  { key: "cpl", label: "Custo por lead", group: "Custos por ação", unit: "currency", totalsField: "cpl" },
  { key: "cpp", label: "Custo por compra", group: "Custos por ação", unit: "currency", totalsField: "cpp" },
  { key: "cost_per_website_purchase", label: "Custo por compra no site", group: "Custos por ação", unit: "currency", totalsField: "costPerWebsitePurchase" },
  { key: "cost_per_atc", label: "Custo por adição ao carrinho", group: "Custos por ação", unit: "currency", totalsField: "costPerAtc" },
  { key: "cost_per_wishlist_add", label: "Custo por adição à lista de desejos", group: "Custos por ação", unit: "currency", totalsField: "costPerWishlistAdd" },
  { key: "cost_per_ic", label: "Custo por finalização de compra iniciada", group: "Custos por ação", unit: "currency", totalsField: "costPerIc" },
  { key: "cost_per_add_payment_info", label: "Custo por inclusão de informação de pagamento", group: "Custos por ação", unit: "currency", totalsField: "costPerAddPaymentInfo" },
  { key: "cost_per_view_content", label: "Custo por visualização de conteúdo", group: "Custos por ação", unit: "currency", totalsField: "costPerViewContent" },
  { key: "cost_per_complete_registration", label: "Custo por registro concluído", group: "Custos por ação", unit: "currency", totalsField: "costPerCompleteRegistration" },
  { key: "cost_per_subscribe", label: "Custo por assinatura", group: "Custos por ação", unit: "currency", totalsField: "costPerSubscribe" },
  { key: "cost_per_contact", label: "Custo por contato", group: "Custos por ação", unit: "currency", totalsField: "costPerContact" },
  { key: "cost_per_donate", label: "Custo por doação", group: "Custos por ação", unit: "currency", totalsField: "costPerDonate" },
  { key: "cost_per_app_install", label: "Custo por instalação do app", group: "Custos por ação", unit: "currency", totalsField: "costPerAppInstall" },
  { key: "cost_per_submit_application", label: "Custo por inscrição enviada", group: "Custos por ação", unit: "currency", totalsField: "costPerSubmitApplication" },
  { key: "cost_per_start_trial", label: "Custo por período de avaliação iniciado", group: "Custos por ação", unit: "currency", totalsField: "costPerStartTrial" },
  { key: "cost_per_search", label: "Custo por pesquisa", group: "Custos por ação", unit: "currency", totalsField: "costPerSearch" },
  { key: "cost_per_find_location", label: "Custo por pesquisa de localização", group: "Custos por ação", unit: "currency", totalsField: "costPerFindLocation" },
  { key: "cost_per_custom_event", label: "Custo por evento personalizado", group: "Custos por ação", unit: "currency", totalsField: "costPerCustomEvent" },

  // Qualidade
  { key: "quality_ranking", label: "Classificação de qualidade", group: "Qualidade (rankings Meta)", unit: "ranking", totalsField: "qualityRanking" },
  { key: "engagement_rate_ranking", label: "Classificação da taxa de engajamento", group: "Qualidade (rankings Meta)", unit: "ranking", totalsField: "engagementRanking" },
  { key: "conversion_rate_ranking", label: "Classificação da taxa de conversão", group: "Qualidade (rankings Meta)", unit: "ranking", totalsField: "conversionRanking" },

  // ROAS Real
  { key: "real_leads", label: "Leads no CRM (ads)", group: "ROAS Real (CRM × Ads)", unit: "number", realField: "leads" },
  { key: "real_won", label: "Vendas ganhas", group: "ROAS Real (CRM × Ads)", unit: "number", realField: "wonDeals" },
  { key: "real_revenue", label: "Receita real", group: "ROAS Real (CRM × Ads)", unit: "currency", realField: "wonValue" },
  { key: "real_cpl", label: "CPL real", group: "ROAS Real (CRM × Ads)", unit: "currency", realField: "cplReal" },
  { key: "real_cac", label: "CAC", group: "ROAS Real (CRM × Ads)", unit: "currency", realField: "cac" },
  { key: "real_roas", label: "ROAS real", group: "ROAS Real (CRM × Ads)", unit: "roas", realField: "realRoas" },
];

export const DEFAULT_META_KPIS: string[] = [
  "spend", "results", "cost_per_result", "impressions", "reach", "frequency",
  "clicks", "ctr", "cpc", "cpm", "leads", "cpl", "purchases", "roas",
];

export function findKpi(key: string): MetaKpiDef | undefined {
  return META_KPI_CATALOG.find((k) => k.key === key);
}