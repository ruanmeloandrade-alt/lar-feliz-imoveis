import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  FileImage,
  FileAudio,
  FileVideo,
  FileText,
  File as FileIcon,
  EyeOff,
  User,
  Download,
  Filter,
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Inbox,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArquivoRow, ArquivoKind } from "@/lib/crm-arquivos.functions";
import {
  listCrmArquivosPage,
  resolveCrmArquivoUrl,
  type ArquivoSource,
} from "@/lib/crm-arquivos-paged.functions";
import { requestClicksignSignature } from "@/lib/clicksign.functions";
import { requestZapSignSignature } from "@/lib/zapsign.functions";
import { requestDocusignSignature } from "@/lib/docusign.functions";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/crm/arquivos")({
  head: () => ({
    meta: [
      { title: "Arquivos · CRM · Vanessa Simoni" },
      {
        name: "description",
        content: "Central de arquivos recebidos e gerados na Vanessa Simoni, organizados por cliente e empresa.",
      },
    ],
  }),
  component: ArquivosPage,
});

const PAGE_SIZE = 50;

type ArquivosPageParam = { page: number; cursor: string | null };

const KIND_ICON: Record<ArquivoKind, typeof FileIcon> = {
  image: FileImage,
  audio: FileAudio,
  video: FileVideo,
  pdf: FileText,
  doc: FileIcon,
  other: FileIcon,
};
const KIND_LABEL: Record<ArquivoKind, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  pdf: "PDF",
  doc: "Documento",
  other: "Outro",
};

const SOURCE_LABEL: Record<ArquivoSource, string> = {
  platform: "Vanessa Simoni",
  whatsapp: "WhatsApp",
  channels: "Instagram / Messenger",
  google_drive: "Google Drive",
  microsoft_onedrive: "Microsoft OneDrive",
  microsoft_sharepoint: "Microsoft SharePoint",
};

const ORIGIN_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  upload: "Upload",
  email: "E-mail",
  social_media: "Social Media",
  gestor_trafego: "Gestor de Tráfego",
  workflow: "Workflow",
  google_drive: "Google Drive",
  microsoft_onedrive: "OneDrive",
  microsoft_sharepoint: "SharePoint",
};

type GroupKey = string;
interface Group {
  key: GroupKey;
  type: "company" | "lead";
  title: string;
  subtitle?: string;
  logo_url?: string | null;
  files: ArquivoRow[];
}
type SignatureProvider = "clicksign" | "zapsign" | "docusign";

interface SignatureDraft {
  file: ArquivoRow;
  provider: SignatureProvider;
  signerName: string;
  signerEmail: string;
}

function ArquivosPage() {
  const fetchArquivos = useServerFn(listCrmArquivosPage);
  const resolveFileUrl = useServerFn(resolveCrmArquivoUrl);
  const sendToClicksign = useServerFn(requestClicksignSignature);
  const sendToZapSign = useServerFn(requestZapSignSignature);
  const sendToDocusign = useServerFn(requestDocusignSignature);

  const [source, setSource] = useState<ArquivoSource>("platform");
  const [filterKind, setFilterKind] = useState<"all" | ArquivoKind>("all");
  const [q, setQ] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [signatureDraft, setSignatureDraft] = useState<SignatureDraft | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["crm-arquivos", source],
    initialPageParam: { page: 0, cursor: null } as ArquivosPageParam,
    queryFn: ({ pageParam }) =>
      fetchArquivos({
        data: {
          source,
          page: pageParam.page,
          pageSize: PAGE_SIZE,
          cursor: pageParam.cursor,
        },
      }),
    getNextPageParam: (lastPage): ArquivosPageParam | undefined =>
      lastPage.hasMore
        ? { page: lastPage.page + 1, cursor: lastPage.nextCursor ?? null }
        : undefined,
  });

  const data = useMemo(
    () => query.data?.pages.flatMap((page) => page.rows) ?? [],
    [query.data],
  );
  const truncationReason = query.data?.pages.find((page) => page.truncated)?.truncationReason ?? null;

  const signatureMutation = useMutation({
    mutationFn: async (payload: {
      provider: SignatureProvider;
      storageFileId: string;
      signerName: string;
      signerEmail: string;
    }) => {
      const common = {
        storageFileId: payload.storageFileId,
        signerName: payload.signerName,
        signerEmail: payload.signerEmail,
      };
      if (payload.provider === "zapsign") return sendToZapSign({ data: common });
      if (payload.provider === "docusign") {
        return sendToDocusign({ data: { ...common, origin: window.location.origin } });
      }
      return sendToClicksign({ data: common });
    },
    onSuccess: (_, variables) => {
      const label =
        variables.provider === "zapsign"
          ? "ZapSign"
          : variables.provider === "docusign"
            ? "DocuSign"
            : "Clicksign";
      toast.success(`Solicitação enviada pela ${label}.`);
      setSignatureDraft(null);
    },
    onError: () => {
      toast.error("Não foi possível enviar o documento para assinatura. Tente novamente.");
    },
  });

  const filtered = useMemo(() => {
    const rows = data.filter((a) => !dismissed.has(a.id));
    const normalizedQuery = q.trim().toLowerCase();
    return rows.filter((a) => {
      if (filterKind !== "all" && a.kind !== filterKind) return false;
      if (normalizedQuery) {
        const hay = `${a.nome} ${a.lead.nome} ${a.company?.name || ""}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [data, filterKind, q, dismissed]);

  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<GroupKey, Group>();
    for (const a of filtered) {
      let key: GroupKey;
      let g: Group;
      if (a.company) {
        key = `company:${a.company.id}`;
        g = byKey.get(key) || {
          key,
          type: "company",
          title: a.company.name,
          subtitle: "Empresa",
          logo_url: a.company.logo_url,
          files: [],
        };
      } else {
        key = `lead:${a.lead.id || a.lead.phone || a.lead.nome}`;
        g = byKey.get(key) || {
          key,
          type: "lead",
          title: a.lead.nome,
          subtitle: a.lead.phone || undefined,
          files: [],
        };
      }
      g.files.push(a);
      byKey.set(key, g);
    }
    return Array.from(byKey.values()).sort((a, b) => b.files.length - a.files.length);
  }, [filtered]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
  }

  function openSignatureDialog(file: ArquivoRow) {
    if (!file.storage_file_id) return;
    setSignatureDraft({
      file,
      provider: file.kind === "pdf" ? "zapsign" : "clicksign",
      signerName: "",
      signerEmail: "",
    });
  }

  function submitSignature() {
    if (!signatureDraft?.file.storage_file_id) return;
    const signerName = signatureDraft.signerName.trim();
    const signerEmail = signatureDraft.signerEmail.trim();
    if (!signerName) {
      toast.error("Informe o nome completo do signatário.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(signerEmail)) {
      toast.error("Informe um e-mail válido para o signatário.");
      return;
    }
    if (signatureDraft.provider === "zapsign" && signatureDraft.file.kind !== "pdf") {
      toast.error("A ZapSign aceita somente PDF neste fluxo.");
      return;
    }
    signatureMutation.mutate({
      provider: signatureDraft.provider,
      storageFileId: signatureDraft.file.storage_file_id,
      signerName,
      signerEmail,
    });
  }

  async function openFile(file: ArquivoRow) {
    if (file.url) {
      window.open(file.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!file.storage_file_id) {
      toast.error("Este arquivo não possui um link disponível.");
      return;
    }

    const popup = window.open("about:blank", "_blank");
    setOpeningFileId(file.id);
    try {
      const result = await resolveFileUrl({ data: { storageFileId: file.storage_file_id } });
      if (!result.url) throw new Error("missing_url");
      if (popup) {
        popup.opener = null;
        popup.location.href = result.url;
      } else {
        window.location.assign(result.url);
      }
    } catch {
      popup?.close();
      toast.error("Não foi possível abrir o arquivo. Tente novamente.");
    } finally {
      setOpeningFileId(null);
    }
  }

  const totalLoaded = data.length;

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">Arquivos</h1>
              <p className="text-xs text-muted-foreground">
                Cada origem é carregada sob demanda para manter a central rápida mesmo com grande volume de documentos.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching && !query.isFetchingNextPage ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : null}
              Atualizar
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as ArquivoSource)}
              className="h-8 text-xs bg-background border border-border rounded px-2"
              aria-label="Origem dos arquivos"
            >
              {Object.entries(SOURCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nos arquivos carregados…"
              className="max-w-xs h-8"
            />
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as "all" | ArquivoKind)}
              className="h-8 text-xs bg-background border border-border rounded px-2"
              aria-label="Tipo de arquivo"
            >
              <option value="all">Todos os tipos</option>
              <option value="image">Imagens</option>
              <option value="audio">Áudios</option>
              <option value="video">Vídeos</option>
              <option value="pdf">PDFs</option>
              <option value="doc">Documentos</option>
              <option value="other">Outros</option>
            </select>
            <Badge variant="secondary" className="text-[10px]">
              <Filter className="w-3 h-3 mr-1" /> {filtered.length} exibidos · {totalLoaded} carregados
            </Badge>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {query.isLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando arquivos…
            </div>
          )}

          {query.error && (
            <div className="text-sm text-destructive p-4 rounded border border-destructive/30 bg-destructive/5">
              Não foi possível carregar esta origem. Tente atualizar ou selecione outra origem.
            </div>
          )}

          {truncationReason && !query.error && (
            <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{truncationReason}</span>
            </div>
          )}

          {!query.isLoading && !query.error && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Inbox className="w-8 h-8 mb-2 opacity-60" />
              <div className="text-sm">Nenhum arquivo encontrado em {SOURCE_LABEL[source]}.</div>
              <div className="text-xs mt-1">Troque a origem ou ajuste os filtros para consultar outros documentos.</div>
            </div>
          )}

          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            return (
              <div key={g.key} className="rounded-lg border border-border overflow-hidden">
                <div
                  onClick={() => toggle(g.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 text-left cursor-pointer"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div
                    className={cn(
                      "w-8 h-8 rounded flex items-center justify-center overflow-hidden",
                      g.type === "company"
                        ? "bg-primary/10 text-primary"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {g.logo_url ? (
                      <img src={g.logo_url} alt="" className="w-full h-full object-cover" />
                    ) : g.type === "company" ? (
                      <Building2 className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{g.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {g.subtitle ? `${g.subtitle} · ` : ""}
                      {g.files.length} arquivo{g.files.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {g.type === "company" ? "Empresa" : "Cliente"}
                  </Badge>
                </div>

                {!isCollapsed && (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/10 text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Arquivo</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                        <th className="text-left px-3 py-2">Origem</th>
                        <th className="text-left px-3 py-2">Recebido</th>
                        <th className="text-right px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.files.map((a) => {
                        const Icon = KIND_ICON[a.kind];
                        const canSign = Boolean(a.storage_file_id && (a.kind === "pdf" || a.kind === "doc"));
                        return (
                          <tr key={a.id} className="border-t border-border hover:bg-accent/20">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    "w-7 h-7 rounded flex items-center justify-center",
                                    a.kind === "image" && "bg-blue-500/10 text-blue-500",
                                    a.kind === "audio" && "bg-amber-500/10 text-amber-500",
                                    a.kind === "video" && "bg-purple-500/10 text-purple-500",
                                    a.kind === "pdf" && "bg-red-500/10 text-red-500",
                                    a.kind === "doc" && "bg-emerald-500/10 text-emerald-500",
                                    a.kind === "other" && "bg-muted text-muted-foreground",
                                  )}
                                >
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium truncate max-w-[320px]">{a.nome}</div>
                                  {a.lead.nome && g.type === "company" && (
                                    <div className="text-[10px] text-muted-foreground">via {a.lead.nome}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-[10px]">
                                {KIND_LABEL[a.kind]}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="secondary" className="text-[10px]">
                                {ORIGIN_LABEL[a.origem] || a.origem}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {(() => {
                                try {
                                  return formatDistanceToNow(new Date(a.received_at), {
                                    addSuffix: true,
                                    locale: ptBR,
                                  });
                                } catch {
                                  return "-";
                                }
                              })()}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {canSign && (
                                  <button
                                    onClick={() => openSignatureDialog(a)}
                                    disabled={signatureMutation.isPending}
                                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary disabled:opacity-50"
                                    title="Solicitar assinatura"
                                  >
                                    <PenLine className="w-3.5 h-3.5" /> Assinar
                                  </button>
                                )}
                                {(a.url || a.storage_file_id) && (
                                  <button
                                    onClick={() => openFile(a)}
                                    disabled={openingFileId === a.id}
                                    className="text-muted-foreground hover:text-primary disabled:opacity-50"
                                    title="Abrir / baixar"
                                  >
                                    {openingFileId === a.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Download className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={() => dismiss(a.id)}
                                  className="text-muted-foreground hover:text-foreground"
                                  title="Ocultar da lista nesta sessão"
                                >
                                  <EyeOff className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          {query.hasNextPage && !query.error && (
            <div className="flex justify-center pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      </main>

      <Dialog
        open={Boolean(signatureDraft)}
        onOpenChange={(open) => {
          if (!open) setSignatureDraft(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar assinatura</DialogTitle>
            <DialogDescription>
              Escolha o provedor e informe quem deve assinar {signatureDraft?.file.nome || "o documento"}.
            </DialogDescription>
          </DialogHeader>

          {signatureDraft && (
            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Provedor</span>
                <select
                  value={signatureDraft.provider}
                  onChange={(e) =>
                    setSignatureDraft((draft) =>
                      draft ? { ...draft, provider: e.target.value as SignatureProvider } : draft,
                    )
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="clicksign">Clicksign</option>
                  <option value="zapsign" disabled={signatureDraft.file.kind !== "pdf"}>
                    ZapSign{signatureDraft.file.kind !== "pdf" ? " — somente PDF" : ""}
                  </option>
                  <option value="docusign">DocuSign</option>
                </select>
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Nome completo</span>
                <Input
                  value={signatureDraft.signerName}
                  onChange={(e) =>
                    setSignatureDraft((draft) =>
                      draft ? { ...draft, signerName: e.target.value } : draft,
                    )
                  }
                  autoComplete="name"
                  placeholder="Nome do signatário"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">E-mail</span>
                <Input
                  type="email"
                  value={signatureDraft.signerEmail}
                  onChange={(e) =>
                    setSignatureDraft((draft) =>
                      draft ? { ...draft, signerEmail: e.target.value } : draft,
                    )
                  }
                  autoComplete="email"
                  placeholder="email@empresa.com"
                />
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatureDraft(null)} disabled={signatureMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitSignature} disabled={signatureMutation.isPending}>
              {signatureMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enviar para assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}