import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Settings2,
  Megaphone, MessageCircle, Instagram, ShoppingBag, Activity, FileText,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { startMetaOAuth, syncMetaWorkspace, getMetaStatus, disconnectMeta, listMetaAvailableAssets, saveMetaCapiToken, deleteMetaCapiToken, getMetaCapiStatus, listMessagingStatus, subscribeMessaging } from "@/lib/meta.functions";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type AssetKey = "ads" | "messenger" | "instagram" | "catalog" | "pixel" | "leadforms";

const ASSETS: {
  key: AssetKey;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "ads", label: "Gestor de Tráfego (Ads)", desc: "Contas de anúncios, campanhas, insights e criação de campanha.", icon: Megaphone },
  { key: "messenger", label: "Messenger (Página do Facebook)", desc: "Recebe mensagens do Messenger no Inbox da Vanessa Simoni.", icon: MessageCircle },
  { key: "instagram", label: "Direct do Instagram", desc: "Recebe DMs do Instagram Business no Inbox da Vanessa Simoni.", icon: Instagram },
  { key: "catalog", label: "Catálogo Commerce", desc: "Produtos, conjuntos e disponibilidade para campanhas dinâmicas.", icon: ShoppingBag },
  { key: "pixel", label: "Pixel / Conversions API", desc: "Envia eventos server-side (Lead, Purchase) com deduplicação.", icon: Activity },
  { key: "leadforms", label: "Lead Ads (Formulários)", desc: "Puxa leads dos formulários instantâneos para o CRM.", icon: FileText },
];

const STORAGE_KEY = "Vanessa Simoni.meta.selectedAssets";

export function MetaConnectPanel({ open, onOpenChange }: Props) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<{
    connected: boolean;
    counts: { adAccounts: number; pages: number; instagram: number; pixels: number };
    metadata: Record<string, string | number | boolean | null> | null;
  } | null>(null);
  const [selected, setSelected] = useState<Set<AssetKey>>(new Set(["ads"]));
  const [activeTab, setActiveTab] = useState<AssetKey>("ads");
  const [assetsEditorOpen, setAssetsEditorOpen] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [available, setAvailable] = useState<{
    accounts: { id: string; name: string; currency: string | null; status: number | null; businessName: string | null; selected: boolean }[];
    pages: { id: string; name: string; category: string | null; selected: boolean; canConnect: boolean; source: string; businessName: string | null; instagramId: string | null }[];
    instagram: { id: string; username: string | null; pageId: string; pageName: string; selected: boolean; canConnect: boolean }[];
  } | null>(null);
  const [pickAccts, setPickAccts] = useState<Set<string>>(new Set());
  const [pickPages, setPickPages] = useState<Set<string>>(new Set());
  const [pickInstagram, setPickInstagram] = useState<Set<string>>(new Set());

  const startOAuth = useServerFn(startMetaOAuth);
  const runSync = useServerFn(syncMetaWorkspace);
  const readStatus = useServerFn(getMetaStatus);
  const disconnect = useServerFn(disconnectMeta);
  const listAvailable = useServerFn(listMetaAvailableAssets);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    setPickerOpen(false);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as AssetKey[];
        if (Array.isArray(arr) && arr.length) setSelected(new Set(arr));
      }
    } catch { /* noop */ }
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles")
        .select("current_workspace_id").eq("id", u.user.id).maybeSingle();
      const wsId = prof?.current_workspace_id ?? null;
      setWorkspaceId(wsId);
      if (wsId) {
        try {
          const s = await readStatus({ data: { workspaceId: wsId } });
          setStatus(s);
        } catch (e) { console.warn("[meta] status", e); }
      }
    })();
  }, [open, readStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("meta") === "ok" && workspaceId && open) {
      u.searchParams.delete("meta");
      window.history.replaceState({}, "", u.toString());
      setMsg({
        ok: true,
        text: "Autorização Meta concluída. Escolha agora as contas de anúncio, Páginas e Instagrams deste workspace.",
      });
      // OAuth concluído não significa ativos sincronizados. Abrimos o picker
      // imediatamente para impedir estado de “conectado” com zero ativos gravados.
      void openPicker();
    }
  }, [workspaceId, open]);

  function toggle(k: AssetKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next))); } catch { /* noop */ }
      return next;
    });
  }

  async function handleConnect() {
    if (!workspaceId) return;
    if (selected.size === 0) {
      setMsg({ ok: false, text: "Selecione ao menos um recurso para conectar." });
      return;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selected))); } catch { /* noop */ }
    setBusy(true); setMsg(null);
    try {
      const r = await startOAuth({ data: { workspaceId, redirectOrigin: window.location.origin } });
      window.location.href = r.authorizeUrl;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao iniciar OAuth." });
      setBusy(false);
    }
  }

  async function openPicker() {
    if (!workspaceId) return;
    setPickerOpen(true);
    setPickerLoading(true);
    setMsg(null);
    try {
      const r = await listAvailable({ data: { workspaceId } });
      setAvailable(r);
      setPickAccts(new Set(r.accounts.filter((a) => a.selected).map((a) => a.id)));
      setPickPages(new Set(r.pages.filter((p) => p.selected).map((p) => p.id)));
      setPickInstagram(new Set(r.instagram.filter((ig) => ig.selected).map((ig) => ig.id)));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao listar contas." });
      setPickerOpen(false);
    } finally { setPickerLoading(false); }
  }

  async function confirmPicker() {
    if (!workspaceId) return;
    setBusy(true); setMsg(null);
    try {
      const requiredPages = available?.instagram.filter((ig) => pickInstagram.has(ig.id)).map((ig) => ig.pageId) ?? [];
      const pageIds = Array.from(new Set([...pickPages, ...requiredPages]));
      const r = await runSync({ data: {
        workspaceId,
        accountIds: Array.from(pickAccts),
        pageIds,
        instagramIds: Array.from(pickInstagram),
      } });
      setMsg({ ok: true, text: "Sincronizado: " + r.adAccounts + " contas · " + r.pages + " páginas · " + r.instagram + " Instagram · " + r.pixels + " pixels." });
      const s = await readStatus({ data: { workspaceId } });
      setStatus(s);
      setPickerOpen(false);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao sincronizar seleção." });
    } finally { setBusy(false); }
  }

  async function handleSync() {
    await openPicker();
  }

  async function handleDisconnect() {
    if (!workspaceId) return;
    if (!confirm("Desconectar a Meta deste workspace? Isso apaga tokens, páginas, contas Instagram, ad accounts, pixels e criativos sincronizados. Você pode reconectar do zero em seguida.")) return;
    setBusy(true);
    try {
      await disconnect({ data: { workspaceId } });
      setStatus({ connected: false, counts: { adAccounts: 0, pages: 0, instagram: 0, pixels: 0 }, metadata: null });
      setSelected(new Set());
      setMsg({ ok: true, text: "Meta desconectada e dados limpos." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha." });
    } finally { setBusy(false); }
  }

  const connected = !!status?.connected;
  const selectedList = useMemo(() => ASSETS.filter((a) => selected.has(a.key)), [selected]);

  useEffect(() => {
    if (connected && selectedList.length && !selectedList.some((a) => a.key === activeTab)) {
      setActiveTab(selectedList[0].key);
    }
  }, [connected, selectedList, activeTab]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPickerOpen(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        {pickerOpen ? (
          <MetaAssetPicker
            available={available}
            loading={pickerLoading}
            busy={busy}
            pickAccts={pickAccts}
            pickPages={pickPages}
            pickInstagram={pickInstagram}
            setPickAccts={setPickAccts}
            setPickPages={setPickPages}
            setPickInstagram={setPickInstagram}
            onConfirm={confirmPicker}
            onCancel={() => setPickerOpen(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Conectar Meta</DialogTitle>
              <DialogDescription>
                O Meta é a central de Páginas do Facebook, Instagram, Direct, Messenger, contas de anúncio,
                Pixel, Catálogo e Lead Ads. O WhatsApp possui conexão própria. Marque os recursos que quer usar
                e volte quando precisar ampliar a autorização.
              </DialogDescription>
            </DialogHeader>

            {!connected ? (
              <div className="space-y-4">
                <div className="text-sm font-medium">1. O que você quer conectar?</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ASSETS.map((a) => {
                    const on = selected.has(a.key);
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => toggle(a.key)}
                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                          on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox checked={on} className="mt-0.5 pointer-events-none" />
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{a.label}</div>
                          <div className="text-xs leading-snug text-muted-foreground">{a.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div>2. Ao clicar em <strong className="text-foreground">Conectar Meta</strong>, você será levado ao Facebook para autorizar os recursos marcados.</div>
                  <div><strong className="text-foreground">Quem deve entrar?</strong> O usuário Facebook que possui acesso às Páginas/portfólios do cliente. Pode ser o próprio cliente; você não precisa virar administrador de todas as Páginas.</div>
                  <div>Instagram pessoal não aparece neste fluxo: é necessário Instagram Professional (Business/Creator) vinculado a uma Página.</div>
                </div>

                <Button onClick={handleConnect} disabled={busy || !workspaceId || selected.size === 0} className="w-full">
                  {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-2 h-3.5 w-3.5" />}
                  Conectar Meta ({selected.size})
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-success/30 bg-success/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-success">
                    <CheckCircle2 className="h-4 w-4" /> Meta conectada neste workspace
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Esta conexão e seus ativos são compartilhados com todos os membros autorizados deste workspace. Outros usuários não precisam refazer o OAuth.</div>
                  {status?.metadata?.facebook_user_id && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Usuário Facebook ID: <code>{String(status.metadata.facebook_user_id)}</code>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { l: "Contas Ads", v: status!.counts.adAccounts },
                    { l: "Páginas", v: status!.counts.pages },
                    { l: "Instagram", v: status!.counts.instagram },
                    { l: "Pixels", v: status!.counts.pixels },
                  ].map((k) => (
                    <div key={k.l} className="rounded-md border border-border bg-muted/30 p-2 text-center">
                      <div className="text-lg font-semibold tabular-nums">{k.v}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Recursos ativados</div>
                    <button
                      type="button"
                      onClick={() => setAssetsEditorOpen((v) => !v)}
                      className="text-xs text-primary hover:underline"
                    >
                      {assetsEditorOpen ? "Fechar" : "Escolher recursos"}
                    </button>
                  </div>
                  {!assetsEditorOpen ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ASSETS.map((a) => {
                        const on = selected.has(a.key);
                        return (
                          <span
                            key={a.key}
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${
                              on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                            }`}
                          >
                            {on ? "ativo: " : "pendente: "}{a.label.split(" (")[0]}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {ASSETS.map((a) => {
                        const on = selected.has(a.key);
                        const Icon = a.icon;
                        return (
                          <button
                            key={a.key}
                            type="button"
                            onClick={() => toggle(a.key)}
                            className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition ${
                              on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                            }`}
                          >
                            <Checkbox checked={on} className="mt-0.5 pointer-events-none" />
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="text-xs font-medium">{a.label}</div>
                              <div className="text-[11px] leading-snug text-muted-foreground">{a.desc}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {workspaceId && <MessagingStatusPanel workspaceId={workspaceId} />}

                {selectedList.length > 0 && (
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AssetKey)}>
                    <TabsList className="flex h-auto flex-wrap justify-start">
                      {selectedList.map((a) => (
                        <TabsTrigger key={a.key} value={a.key} className="text-xs">
                          <a.icon className="mr-1.5 h-3.5 w-3.5" />
                          {a.label.split(" ")[0]}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {selectedList.map((a) => (
                      <TabsContent key={a.key} value={a.key} className="mt-3">
                        <AssetPane assetKey={a.key} status={status} workspaceId={workspaceId} />
                      </TabsContent>
                    ))}
                  </Tabs>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button onClick={openPicker} disabled={busy} className="min-w-[220px] flex-1">
                    {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Settings2 className="mr-2 h-3.5 w-3.5" />}
                    Escolher contas, páginas e Instagram
                  </Button>
                  <Button onClick={handleConnect} disabled={busy} variant="outline" title="Autorizar mais ativos na Meta">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Autorizar mais
                  </Button>
                  <Button onClick={handleSync} disabled={busy} variant="outline" title="Reabrir seleção">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button onClick={handleDisconnect} disabled={busy} variant="outline">
                    Desconectar
                  </Button>
                </div>
              </div>
            )}

            {msg && (
              <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                msg.ok ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}>
                {msg.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>{msg.text}</span>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetaAssetPicker({
  available,
  loading,
  busy,
  pickAccts,
  pickPages,
  pickInstagram,
  setPickAccts,
  setPickPages,
  setPickInstagram,
  onConfirm,
  onCancel,
}: {
  available: {
    accounts: { id: string; name: string; currency: string | null; status: number | null; businessName: string | null; selected: boolean }[];
    pages: { id: string; name: string; category: string | null; selected: boolean; canConnect: boolean; source: string; businessName: string | null; instagramId: string | null }[];
    instagram: { id: string; username: string | null; pageId: string; pageName: string; selected: boolean; canConnect: boolean }[];
  } | null;
  loading: boolean;
  busy: boolean;
  pickAccts: Set<string>;
  pickPages: Set<string>;
  pickInstagram: Set<string>;
  setPickAccts: React.Dispatch<React.SetStateAction<Set<string>>>;
  setPickPages: React.Dispatch<React.SetStateAction<Set<string>>>;
  setPickInstagram: React.Dispatch<React.SetStateAction<Set<string>>>;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Escolha o que sincronizar</DialogTitle>
        <DialogDescription>
          A lista combina os ativos diretos do usuário com Páginas dos portfólios empresariais acessíveis. Instagram Professional aparece separado e informa a Página vinculada.
        </DialogDescription>
      </DialogHeader>

      {loading || !available ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando ativos da Meta…
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contas de anúncio ({available.accounts.length})</div>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setPickAccts(new Set(available.accounts.map((a) => a.id)))}>Todas</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPickAccts(new Set())}>Nenhuma</button>
              </div>
            </div>
            {available.accounts.length === 0 ? <div className="text-xs text-muted-foreground">Nenhuma conta de anúncio encontrada.</div> : (
              <div className="space-y-1">{available.accounts.map((a) => {
                const on = pickAccts.has(a.id);
                return <button key={a.id} type="button" onClick={() => setPickAccts((prev) => { const next = new Set(prev); if (next.has(a.id)) next.delete(a.id); else next.add(a.id); return next; })}
                  className={"flex w-full items-center gap-3 rounded-md border p-2 text-left transition " + (on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                  <Checkbox checked={on} className="pointer-events-none" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{a.name}</div><div className="truncate text-[11px] text-muted-foreground">{a.id}{a.businessName ? " · " + a.businessName : ""}{a.currency ? " · " + a.currency : ""}</div></div>
                </button>;
              })}</div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Instagram Professional ({available.instagram.length})</div>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => {
                  const connectable = available.instagram.filter((ig) => ig.canConnect);
                  setPickInstagram(new Set(connectable.map((ig) => ig.id)));
                  setPickPages((prev) => new Set([...prev, ...connectable.map((ig) => ig.pageId)]));
                }}>Todas</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPickInstagram(new Set())}>Nenhuma</button>
              </div>
            </div>
            {available.instagram.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Nenhuma conta Instagram Professional ligada às Páginas acessíveis foi encontrada. Contas pessoais não aparecem neste fluxo.</div>
            ) : <div className="space-y-1">{available.instagram.map((ig) => {
              const on = pickInstagram.has(ig.id);
              return <button key={ig.id} type="button" disabled={!ig.canConnect} onClick={() => {
                setPickInstagram((prev) => { const next = new Set(prev); if (next.has(ig.id)) next.delete(ig.id); else next.add(ig.id); return next; });
                if (!on) setPickPages((prev) => new Set(prev).add(ig.pageId));
              }} className={"flex w-full items-center gap-3 rounded-md border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55 " + (on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                <Checkbox checked={on} className="pointer-events-none" /><Instagram className="h-4 w-4 shrink-0 text-pink-500" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{ig.username ? "@" + ig.username : "Instagram " + ig.id}</div><div className="truncate text-[11px] text-muted-foreground">Página vinculada: {ig.pageName}</div>{!ig.canConnect && <div className="text-[10px] text-amber-600">Ativo visível, mas sem Page Access Token. Autorize com um usuário que tenha acesso suficiente à Página.</div>}</div>
              </button>;
            })}</div>}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Páginas do Facebook ({available.pages.length})</div>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setPickPages(new Set(available.pages.filter((p) => p.canConnect).map((p) => p.id)))}>Todas</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPickPages(new Set())}>Nenhuma</button>
              </div>
            </div>
            {available.pages.length === 0 ? <div className="text-xs text-muted-foreground">Nenhuma página encontrada.</div> : <div className="space-y-1">{available.pages.map((p) => {
              const on = pickPages.has(p.id);
              return <button key={p.id} type="button" disabled={!p.canConnect} onClick={() => setPickPages((prev) => { const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next; })}
                className={"flex w-full items-center gap-3 rounded-md border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55 " + (on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                <Checkbox checked={on} className="pointer-events-none" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="truncate text-[11px] text-muted-foreground">{p.id}{p.category ? " · " + p.category : ""}{p.businessName ? " · " + p.businessName : ""}</div>{!p.canConnect && <div className="text-[10px] text-amber-600">Página encontrada no portfólio, mas sem acesso suficiente para gerar Page Access Token.</div>}</div>
              </button>;
            })}</div>}
          </section>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button onClick={() => void onConfirm()} disabled={busy || loading} className="min-w-[240px] flex-1">
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
          Salvar seleção ({pickAccts.size} contas · {pickPages.size} páginas · {pickInstagram.size} Instagram)
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>Voltar</Button>
      </div>
    </div>
  );
}

function AssetPane({
  assetKey,
  status,
  workspaceId,
}: {
  assetKey: AssetKey;
  status: {
    counts: { adAccounts: number; pages: number; instagram: number; pixels: number };
  } | null;
  workspaceId: string | null;
}) {
  const c = status?.counts;
  switch (assetKey) {
    case "ads":
      return (
        <PaneShell
          title="Gestor de Tráfego (Ads)"
          count={c?.adAccounts ?? 0}
          countLabel="contas de anúncios detectadas"
          hint="Abra o módulo Gestor de Tráfego para escolher a conta ativa, ver KPIs e criar campanhas."
          done={(c?.adAccounts ?? 0) > 0}
        />
      );
    case "messenger":
      return (
        <PaneShell
          title="Messenger (Página do Facebook)"
          count={c?.pages ?? 0}
          countLabel="páginas do Facebook detectadas"
          hint="No módulo Inbox → Canais, marque a página que deve receber conversas do Messenger."
          done={(c?.pages ?? 0) > 0}
        />
      );
    case "instagram":
      return (
        <PaneShell
          title="Direct do Instagram"
          count={c?.instagram ?? 0}
          countLabel="contas Instagram Business detectadas"
          hint="É necessário que o Instagram seja Business/Creator e esteja vinculado a uma página do Facebook."
          done={(c?.instagram ?? 0) > 0}
        />
      );
    case "pixel":
      return <PixelCapiPane pixelCount={c?.pixels ?? 0} workspaceId={workspaceId} />;
    case "catalog":
      return (
        <PaneShell
          title="Catálogo Commerce"
          count={0}
          countLabel="catálogos vinculados"
          hint="Confirme no Commerce Manager que o catálogo tem permissão para este business. A sincronização de catálogos entra na Fase 2."
          done={false}
        />
      );
    case "leadforms":
      return (
        <PaneShell
          title="Lead Ads (Formulários)"
          count={c?.pages ?? 0}
          countLabel="páginas com Lead Ads elegíveis"
          hint="Cada página autorizada envia leads dos formulários instantâneos direto para o CRM."
          done={(c?.pages ?? 0) > 0}
        />
      );
  }
}

function PaneShell({
  title, count, countLabel, hint, done,
}: { title: string; count: number; countLabel: string; hint: string; done: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <div className={`flex items-center gap-1 text-xs ${done ? "text-success" : "text-muted-foreground"}`}>
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {done ? "OK" : "Pendente"}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground">{count}</span> {countLabel}
      </div>
      <div className="text-xs leading-relaxed text-muted-foreground">{hint}</div>
    </div>
  );
}

function PixelCapiPane({ pixelCount, workspaceId }: { pixelCount: number; workspaceId: string | null }) {
  const [token, setToken] = useState("");
  const [capiStatus, setCapiStatus] = useState<{ configured: boolean; metadata?: { system_user_name?: string | null } | null; updated_at?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const readStatus = useServerFn(getMetaCapiStatus);
  const saveToken = useServerFn(saveMetaCapiToken);
  const removeToken = useServerFn(deleteMetaCapiToken);

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      try { setCapiStatus(await readStatus({ data: { workspaceId } }) as typeof capiStatus); } catch {}
    })();
  }, [workspaceId, readStatus]);

  async function handleSave() {
    if (!workspaceId || !token.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await saveToken({ data: { workspaceId, accessToken: token.trim() } });
      setMsg({ ok: true, text: `Token válido, System User: ${r.systemUser.name ?? r.systemUser.id ?? "OK"}.` });
      setToken("");
      setCapiStatus(await readStatus({ data: { workspaceId } }) as typeof capiStatus);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  async function handleRemove() {
    if (!workspaceId) return;
    setBusy(true); setMsg(null);
    try {
      await removeToken({ data: { workspaceId } });
      setMsg({ ok: true, text: "Token removido. O CAPI volta a usar o token OAuth do usuário." });
      setCapiStatus(await readStatus({ data: { workspaceId } }) as typeof capiStatus);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Pixel / Conversions API</div>
        <div className={`flex items-center gap-1 text-xs ${pixelCount > 0 ? "text-success" : "text-muted-foreground"}`}>
          {pixelCount > 0 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {pixelCount} pixels detectados
        </div>
      </div>

      <div className="space-y-2 rounded border border-border bg-background p-2.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">System User Token (recomendado para produção)</div>
          <div className={`text-[10px] ${capiStatus?.configured ? "text-success" : "text-muted-foreground"}`}>
            {capiStatus?.configured ? "configurado" : "não configurado"}
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Sem esse token, o Conversions API cai no OAuth do usuário conectado; se ele revogar, o envio quebra.
        </p>
        <details className="rounded border border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Como gerar (resumo)</summary>
          <ol className="mt-1.5 ml-4 list-decimal space-y-0.5">
            <li>Business Manager → Configurações do Negócio → Usuários do sistema.</li>
            <li>Crie/selecione um System User Admin (ex.: "Vanessa Simoni Integração").</li>
            <li>Adicionar ativos → sua Conta de Anúncios e o Pixel, com acesso total.</li>
            <li>Gerar novo token → app da Vanessa Simoni → escopos <b>ads_management</b> + <b>business_management</b> → validade <b>Nunca expira</b>.</li>
            <li>Copie o token (começa com <code>EAAB…</code>) e cole aqui embaixo.</li>
          </ol>
          <a
            href="/blog/configurar-meta-conversions-api-system-user"
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-block text-primary hover:underline"
          >
            Tutorial completo no blog →
          </a>
        </details>
        {capiStatus?.configured && capiStatus.metadata?.system_user_name && (
          <p className="text-[11px]">Usuário: <b>{capiStatus.metadata.system_user_name}</b></p>
        )}
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="EAAB…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="h-8 text-xs font-mono"
            disabled={busy || !workspaceId}
          />
          <Button size="sm" onClick={handleSave} disabled={busy || !token.trim() || !workspaceId}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar"}
          </Button>
          {capiStatus?.configured && (
            <Button size="sm" variant="outline" onClick={handleRemove} disabled={busy}>Remover</Button>
          )}
        </div>
        {msg && (
          <div className={`text-[11px] ${msg.ok ? "text-success" : "text-destructive"}`}>{msg.text}</div>
        )}
      </div>

      <div className="space-y-1.5 rounded border border-dashed border-border bg-background p-2.5">
        <div className="text-xs font-medium">Snippet de captação no site do cliente</div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Cole antes do <code>&lt;/head&gt;</code> do site do cliente. Marque cada formulário de lead com
          <code> data-Vanessa Simoni-lead-id="&#123;&#123;leadId&#125;&#125;"</code> para o snippet capturar
          fbc, fbp e fbclid e enviar para a API. Sem isso o CAPI envia sem dedupe e a taxa de match cai.
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-border bg-muted/40 p-2 text-[10px]">{`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/public/track/meta-snippet"
  data-pixel-id="SEU_PIXEL_ID"
  data-Vanessa Simoni-origin="${typeof window !== "undefined" ? window.location.origin : ""}"></script>`}</pre>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              try {
                navigator.clipboard.writeText(`<script src="${origin}/api/public/track/meta-snippet"\n  data-pixel-id="SEU_PIXEL_ID"\n  data-Vanessa Simoni-origin="${origin}"></script>`);
              } catch {}
            }}
            className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90"
          >Copiar snippet</button>
          <a
            href="/blog/configurar-meta-conversions-api-system-user"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-primary hover:underline"
          >Tutorial completo →</a>
        </div>
      </div>
    </div>
  );
}

function MessagingStatusPanel({ workspaceId }: { workspaceId: string }) {
  const load = useServerFn(listMessagingStatus);
  const subscribe = useServerFn(subscribeMessaging);
  const [state, setState] = useState<{
    pages: Array<{ page_id: string; page_name: string | null; messaging_subscribed_at: string | null; messaging_error: string | null }>;
    instagram: Array<{ instagram_id: string; username: string | null; page_id: string | null; messaging_subscribed_at: string | null; messaging_error: string | null }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selPages, setSelPages] = useState<Set<string>>(new Set());
  const [selIgs, setSelIgs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await load({ data: { workspaceId } });
        if (!alive) return;
        setState(r);
        setSelPages(new Set(r.pages.filter((p) => !p.messaging_subscribed_at).map((p) => p.page_id)));
        setSelIgs(new Set(r.instagram.filter((i) => !i.messaging_subscribed_at).map((i) => i.instagram_id)));
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, [workspaceId, load]);

  const total = (state?.pages.length ?? 0) + (state?.instagram.length ?? 0);
  const ok = (state?.pages.filter((p) => p.messaging_subscribed_at).length ?? 0)
    + (state?.instagram.filter((i) => i.messaging_subscribed_at).length ?? 0);
  const pending = total - ok;
  const selectedCount = selPages.size + selIgs.size;

  const refresh = async () => {
    const fresh = await load({ data: { workspaceId } });
    setState(fresh);
  };

  const runSubscribe = async (pageIds?: string[], instagramIds?: string[]) => {
    setBusy(true); setMsg(null);
    try {
      const r = await subscribe({ data: { workspaceId, pageIds, instagramIds } });
      setMsg(`Conexões concluídas. Páginas: ${r.pagesOk}/${r.pagesOk + r.pagesFail} · Instagram: ${r.igsOk}/${r.igsOk + r.igsFail}`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao conectar mensagens.");
    } finally {
      setBusy(false);
    }
  };

  const connectSelected = () => {
    if (!selectedCount) { setMsg("Marque ao menos uma página ou conta do Instagram."); return; }
    void runSubscribe(Array.from(selPages), Array.from(selIgs));
  };

  const connectPending = () => {
    if (!state) return;
    const p = state.pages.filter((x) => !x.messaging_subscribed_at).map((x) => x.page_id);
    const i = state.instagram.filter((x) => !x.messaging_subscribed_at).map((x) => x.instagram_id);
    if (!p.length && !i.length) { setMsg("Nada pendente, tudo já está conectado."); return; }
    setSelPages(new Set(p)); setSelIgs(new Set(i));
    void runSubscribe(p, i);
  };

  const togglePage = (id: string) => setSelPages((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleIg = (id: string) => setSelIgs((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  if (!state || total === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="h-4 w-4" /> Direct do Instagram e Messenger no Inbox
          </div>
          <div className="text-xs text-muted-foreground">
            {ok}/{total} conectados{pending > 0 ? `, ${pending} pendente${pending > 1 ? "s" : ""}` : ""}. Marque o que quer ligar e clique em conectar.
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pending > 0 && (
            <button
              type="button"
              onClick={connectPending}
              disabled={busy}
              className="rounded-md border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {busy ? "Conectando..." : `Conectar pendentes (${pending})`}
            </button>
          )}
          <button
            type="button"
            onClick={connectSelected}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Conectando..." : `Conectar selecionados (${selectedCount})`}
          </button>
        </div>
      </div>

      <div className="flex gap-3 text-[11px]">
        <button type="button" className="text-primary hover:underline"
          onClick={() => { setSelPages(new Set(state.pages.map((p) => p.page_id))); setSelIgs(new Set(state.instagram.map((i) => i.instagram_id))); }}>
          Marcar todos
        </button>
        <button type="button" className="text-muted-foreground hover:underline"
          onClick={() => { setSelPages(new Set()); setSelIgs(new Set()); }}>
          Limpar seleção
        </button>
        <button type="button" className="text-muted-foreground hover:underline"
          onClick={() => {
            setSelPages(new Set(state.pages.filter((p) => !p.messaging_subscribed_at).map((p) => p.page_id)));
            setSelIgs(new Set(state.instagram.filter((i) => !i.messaging_subscribed_at).map((i) => i.instagram_id)));
          }}>
          Marcar só pendentes
        </button>
      </div>

      {msg && <div className="text-xs text-muted-foreground">{msg}</div>}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {state.pages.map((p) => {
          const on = selPages.has(p.page_id);
          return (
            <button
              key={p.page_id}
              type="button"
              onClick={() => togglePage(p.page_id)}
              className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition ${
                on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <Checkbox checked={on} className="pointer-events-none" />
              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{p.page_name ?? p.page_id}</span>
              <span className={p.messaging_subscribed_at ? "text-success" : "text-warning"}>
                {p.messaging_subscribed_at ? "conectado" : "pendente"}
              </span>
            </button>
          );
        })}
        {state.instagram.map((i) => {
          const on = selIgs.has(i.instagram_id);
          return (
            <button
              key={i.instagram_id}
              type="button"
              onClick={() => toggleIg(i.instagram_id)}
              className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition ${
                on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <Checkbox checked={on} className="pointer-events-none" />
              <Instagram className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">@{i.username ?? i.instagram_id}</span>
              <span className={i.messaging_subscribed_at ? "text-success" : "text-warning"}>
                {i.messaging_subscribed_at ? "conectado" : "pendente"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-muted-foreground">
        A Meta só permite responder dentro de 24h após a última mensagem do contato. Fora dessa janela, use os formatos permitidos pela política vigente da Meta.
      </div>
    </div>
  );
}
