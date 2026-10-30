import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Video,
  MessageSquare, Megaphone, Activity, EyeOff, Eye, Heart, Send, XCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  saveTikTokIntegration, getTikTokStatus, disconnectTikTok, listTikTokVideos,
  listTikTokComments, replyTikTokComment, moderateTikTokComment, likeTikTokComment,
  listTikTokCampaigns, sendTikTokPixelEvent,
} from "@/lib/tiktok.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Video {
  item_id?: string;
  caption?: string;
  thumbnail_url?: string;
  share_url?: string;
  comment_count?: number;
  like_count?: number;
  view_count?: number;
}

interface Comment {
  comment_id?: string;
  text?: string;
  username?: string;
  nickname?: string;
  like_count?: number;
  status?: string;
}

interface Campaign {
  campaign_id?: string;
  campaign_name?: string;
  objective_type?: string;
  operation_status?: string;
  budget?: number;
}

const CAPABILITIES: { ok: boolean; title: string; desc: string }[] = [
  {
    ok: true,
    title: "Comentários das publicações",
    desc: "Listar, responder, curtir, esconder e reexibir comentários dos seus vídeos. Usa a Business Account API oficial com os escopos comment.list e comment.list.manage.",
  },
  {
    ok: true,
    title: "Vídeos e métricas orgânicas",
    desc: "Puxa seus vídeos publicados com views, curtidas, comentários e compartilhamentos para alimentar o Social Media e os relatórios.",
  },
  {
    ok: true,
    title: "TikTok Ads (Marketing API)",
    desc: "Leitura de campanhas, orçamento, status e objetivos do Advertiser conectado, direto no Gestor de Tráfego.",
  },
  {
    ok: true,
    title: "Pixel TikTok (Events API 2.0)",
    desc: "Envio de eventos server-side (Lead, CompletePayment, ViewContent) com e-mail e telefone já hasheados em SHA-256.",
  },
  {
    ok: false,
    title: "Mensagens diretas (DM)",
    desc: "O TikTok não publica API de DM para terceiros. Nenhuma plataforma consegue ler ou responder Direct do TikTok de forma oficial. Só dá para responder DM dentro do app do TikTok.",
  },
  {
    ok: false,
    title: "Stories do TikTok",
    desc: "Não existe endpoint público para ler ou responder Stories. O TikTok só expõe vídeos do feed na API de conteúdo.",
  },
];

export function TikTokConnectPanel({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [meta, setMeta] = useState<Record<string, string | number | boolean | null>>({});

  const [accessToken, setAccessToken] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [advertiserId, setAdvertiserId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [pixelToken, setPixelToken] = useState("");

  const [videos, setVideos] = useState<Video[]>([]);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [eventName, setEventName] = useState("Lead");
  const [eventUrl, setEventUrl] = useState("");
  const [testCode, setTestCode] = useState("");

  const status = useServerFn(getTikTokStatus);
  const save = useServerFn(saveTikTokIntegration);
  const disconnect = useServerFn(disconnectTikTok);
  const loadVideos = useServerFn(listTikTokVideos);
  const loadComments = useServerFn(listTikTokComments);
  const reply = useServerFn(replyTikTokComment);
  const moderate = useServerFn(moderateTikTokComment);
  const like = useServerFn(likeTikTokComment);
  const loadCampaigns = useServerFn(listTikTokCampaigns);
  const sendEvent = useServerFn(sendTikTokPixelEvent);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await status();
      setConnected(r.connected);
      setMeta(r.metadata ?? {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (open) {
      setError(null);
      setOk(null);
      void refresh();
    }
  }, [open, refresh]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Central TikTok
            {connected ? (
              <Badge className="bg-success/15 text-success border-success/30">Conectado</Badge>
            ) : (
              <Badge variant="outline">Desconectado</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Um único lugar para TikTok orgânico (vídeos e comentários), TikTok Ads e Pixel TikTok.
            O que o TikTok não libera por API aparece marcado aqui de forma honesta.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {ok && (
          <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success flex gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{ok}</span>
          </div>
        )}

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue={connected ? "comentarios" : "conexao"}>
            <TabsList className="w-full flex-wrap h-auto">
              <TabsTrigger value="conexao">Conexão</TabsTrigger>
              <TabsTrigger value="recursos">O que dá para fazer</TabsTrigger>
              <TabsTrigger value="comentarios">Comentários</TabsTrigger>
              <TabsTrigger value="ads">Ads</TabsTrigger>
              <TabsTrigger value="pixel">Pixel</TabsTrigger>
            </TabsList>

            {/* CONEXÃO */}
            <TabsContent value="conexao" className="space-y-4 pt-4">
              {connected && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {meta.display_name ? String(meta.display_name) : "Conta conectada"}
                      {meta.username ? ` (@${String(meta.username)})` : ""}
                    </span>
                    <span className="text-muted-foreground">Token {String(meta.masked ?? "")}</span>
                  </div>
                  <div className="text-muted-foreground">
                    Orgânico: {meta.organic_ok ? "ativo" : "não conectado"} · Ads:{" "}
                    {meta.ads_ok ? String(meta.advertiser_name ?? "ativo") : "não conectado"} · Pixel:{" "}
                    {meta.pixel_id ? String(meta.pixel_id) : "não configurado"}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Access Token TikTok for Business</Label>
                  <Input
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="act.xxxxxxxx"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Gere em business-api.tiktok.com com os escopos de vídeo e de comentários
                    (video.list, comment.list, comment.list.manage) e, se for usar mídia paga, os de Ads.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Business ID (conta orgânica)</Label>
                  <Input value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder="7xxxxxxxxxxxxx" autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Advertiser ID (TikTok Ads)</Label>
                  <Input value={advertiserId} onChange={(e) => setAdvertiserId(e.target.value)} placeholder="7xxxxxxxxxxxxx" autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pixel ID (opcional)</Label>
                  <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="C..." autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Access Token do Pixel (opcional)</Label>
                  <Input
                    value={pixelToken}
                    onChange={(e) => setPixelToken(e.target.value)}
                    placeholder="Se o token do Events Manager for outro"
                    autoComplete="off"
                    data-lpignore="true"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || accessToken.trim().length < 10}
                  onClick={() =>
                    run(async () => {
                      const r = await save({
                        data: {
                          accessToken: accessToken.trim(),
                          businessId: businessId.trim() || undefined,
                          advertiserId: advertiserId.trim() || undefined,
                          pixelId: pixelId.trim() || undefined,
                          pixelAccessToken: pixelToken.trim() || undefined,
                        },
                      });
                      setOk(
                        r.warnings.length
                          ? `Conectado com ressalvas: ${r.warnings.join(" | ")}`
                          : "TikTok conectado e validado com retorno real da API.",
                      );
                      setAccessToken("");
                      setPixelToken("");
                      await refresh();
                    })
                  }
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {connected ? "Atualizar conexão" : "Conectar TikTok"}
                </Button>
                <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Atualizar status
                </Button>
                <Button variant="outline" asChild>
                  <a href="https://business-api.tiktok.com/portal" target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" /> Portal TikTok
                  </a>
                </Button>
                {connected && (
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await disconnect();
                        setOk("TikTok desconectado deste workspace.");
                        await refresh();
                      })
                    }
                  >
                    Desconectar
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* RECURSOS */}
            <TabsContent value="recursos" className="space-y-2 pt-4">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="rounded-lg border border-border p-3 flex gap-3">
                  {c.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="text-sm font-medium">{c.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{c.desc}</div>
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* COMENTÁRIOS */}
            <TabsContent value="comentarios" className="space-y-3 pt-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !connected}
                  onClick={() =>
                    run(async () => {
                      const r = await loadVideos({ data: {} });
                      setVideos(r.videos as Video[]);
                      if (!r.videos.length) setOk("Nenhum vídeo retornado para esta conta.");
                    })
                  }
                >
                  <Video className="h-4 w-4 mr-2" /> Carregar vídeos
                </Button>
                {activeVideo && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActiveVideo(null);
                      setComments([]);
                    }}
                  >
                    Voltar aos vídeos
                  </Button>
                )}
              </div>

              {!activeVideo && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {videos.map((v) => (
                    <button
                      key={v.item_id}
                      className="text-left rounded-lg border border-border p-3 hover:bg-muted/40 transition"
                      onClick={() =>
                        run(async () => {
                          setActiveVideo(v.item_id ?? null);
                          const r = await loadComments({ data: { videoId: v.item_id ?? "" } });
                          setComments(r.comments as Comment[]);
                        })
                      }
                    >
                      <div className="text-xs font-medium line-clamp-2">{v.caption || "(sem legenda)"}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {v.view_count ?? 0} views · {v.like_count ?? 0} curtidas · {v.comment_count ?? 0} comentários
                      </div>
                    </button>
                  ))}
                  {videos.length === 0 && (
                    <div className="text-xs text-muted-foreground sm:col-span-2">
                      Conecte a conta orgânica (Business ID) e clique em Carregar vídeos.
                    </div>
                  )}
                </div>
              )}

              {activeVideo && (
                <div className="space-y-2">
                  {comments.length === 0 && (
                    <div className="text-xs text-muted-foreground">Nenhum comentário público neste vídeo.</div>
                  )}
                  {comments.map((c) => (
                    <div key={c.comment_id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="text-xs">
                        <span className="font-medium">@{c.username ?? c.nickname ?? "usuário"}</span>{" "}
                        <span className="text-muted-foreground">{c.text}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => {
                            setReplyTo(c.comment_id ?? null);
                            setReplyText("");
                          }}
                        >
                          <MessageSquare className="h-3 w-3 mr-1" /> Responder
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await like({ data: { commentId: c.comment_id ?? "", like: true } });
                              setOk("Comentário curtido.");
                            })
                          }
                        >
                          <Heart className="h-3 w-3 mr-1" /> Curtir
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await moderate({ data: { commentIds: [c.comment_id ?? ""], hide: true } });
                              setOk("Comentário escondido.");
                            })
                          }
                        >
                          <EyeOff className="h-3 w-3 mr-1" /> Esconder
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px]"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await moderate({ data: { commentIds: [c.comment_id ?? ""], hide: false } });
                              setOk("Comentário reexibido.");
                            })
                          }
                        >
                          <Eye className="h-3 w-3 mr-1" /> Reexibir
                        </Button>
                      </div>
                      {replyTo === c.comment_id && (
                        <div className="flex gap-2">
                          <Input
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Sua resposta (até 150 caracteres)"
                            maxLength={150}
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={busy || !replyText.trim()}
                            onClick={() =>
                              run(async () => {
                                await reply({
                                  data: {
                                    videoId: activeVideo,
                                    commentId: c.comment_id ?? "",
                                    text: replyText.trim(),
                                  },
                                });
                                setOk("Resposta publicada no TikTok.");
                                setReplyTo(null);
                                setReplyText("");
                              })
                            }
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ADS */}
            <TabsContent value="ads" className="space-y-3 pt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !connected}
                onClick={() =>
                  run(async () => {
                    const r = await loadCampaigns();
                    setCampaigns(r.campaigns as Campaign[]);
                    if (!r.campaigns.length) setOk("Nenhuma campanha encontrada neste Advertiser.");
                  })
                }
              >
                <Megaphone className="h-4 w-4 mr-2" /> Carregar campanhas
              </Button>
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <div key={c.campaign_id} className="rounded-lg border border-border p-3 text-xs flex justify-between gap-3">
                    <div>
                      <div className="font-medium">{c.campaign_name}</div>
                      <div className="text-muted-foreground">{c.objective_type}</div>
                    </div>
                    <Badge variant="outline">{c.operation_status}</Badge>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* PIXEL */}
            <TabsContent value="pixel" className="space-y-3 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Dispara um evento real pela Events API 2.0 usando o Pixel salvo na aba Conexão.
                Use o Test Event Code do Events Manager para ver o disparo chegando em tempo real.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Evento</Label>
                  <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Lead" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">URL da página</Label>
                  <Input value={eventUrl} onChange={(e) => setEventUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Test Event Code</Label>
                  <Input value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="TEST12345" />
                </div>
              </div>
              <Button
                size="sm"
                disabled={busy || !connected}
                onClick={() =>
                  run(async () => {
                    await sendEvent({
                      data: {
                        eventName: eventName.trim(),
                        url: eventUrl.trim() || undefined,
                        testEventCode: testCode.trim() || undefined,
                      },
                    });
                    setOk("Evento aceito pelo TikTok Events API.");
                  })
                }
              >
                <Activity className="h-4 w-4 mr-2" /> Disparar evento de teste
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
