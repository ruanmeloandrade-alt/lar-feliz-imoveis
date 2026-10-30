import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Package,
  FileText,
  Paperclip,
  Activity,
  CheckSquare,
  Bot,
  Plus,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLead360, setLeadCompany, type Lead360Response } from "@/lib/lead-360.functions";
import { listProductCatalogs, linkLeadProduct, unlinkLeadProduct } from "@/lib/products.functions";
import { listCompanies } from "@/lib/companies.functions";

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

function Block({
  icon: Icon,
  title,
  count,
  children,
  action,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b" style={{ borderColor: "var(--chat-divider)" }}>
      <div className="w-full px-4 py-2.5 flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--chat-meta)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: "var(--chat-text)" }}>
            {title}
          </span>
          {typeof count === "number" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10" style={{ color: "var(--chat-meta)" }}>
              {count}
            </span>
          )}
          <ChevronDown className={cn("w-3.5 h-3.5 ml-auto transition-transform", !open && "-rotate-90")} style={{ color: "var(--chat-meta)" }} />
        </button>
        {action}
      </div>
      {open && <div className="px-4 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

const emptyTxt = "text-[10px] italic";

/**
 * Visão 360º do lead dentro do perfil: empresa, produtos, formulários,
 * arquivos, tarefas, atividades e agente de IA ativo — tudo do módulo CRM
 * conectado no mesmo lugar.
 */
export function Lead360Section({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getLead360);
  const loadCatalogs = useServerFn(listProductCatalogs);
  const loadCompanies = useServerFn(listCompanies);
  const link = useServerFn(linkLeadProduct);
  const unlink = useServerFn(unlinkLeadProduct);
  const setCompany = useServerFn(setLeadCompany);

  const [addingProduct, setAddingProduct] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);

  const q = useQuery({
    queryKey: ["lead-360", leadId],
    queryFn: () => load({ data: { leadId } }),
    staleTime: 10_000,
  });
  const d = q.data as Lead360Response | undefined;

  const catalogsQ = useQuery({
    queryKey: ["product-catalogs"],
    queryFn: () => loadCatalogs(),
    enabled: addingProduct,
    staleTime: 60_000,
  });
  const companiesQ = useQuery({
    queryKey: ["companies"],
    queryFn: () => loadCompanies(),
    enabled: editingCompany,
    staleTime: 60_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead-360", leadId] });
    qc.invalidateQueries({ queryKey: ["lead-profile", leadId] });
  };

  const linkM = useMutation({
    mutationFn: (v: { productId: string; kind: "interesse" | "comprou" }) =>
      link({ data: { leadId, productId: v.productId, kind: v.kind } }),
    onSuccess: () => {
      setAddingProduct(false);
      refresh();
      toast.success("Produto vinculado ao lead.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlinkM = useMutation({
    mutationFn: (v: { productId: string; kind: string }) =>
      unlink({ data: { leadId, productId: v.productId, kind: v.kind } }),
    onSuccess: refresh,
  });

  const companyM = useMutation({
    mutationFn: (companyId: string | null) => setCompany({ data: { leadId, companyId } }),
    onSuccess: () => {
      setEditingCompany(false);
      refresh();
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <div className="px-4 py-3 text-[10px]" style={{ color: "var(--chat-meta)" }}>
        Carregando visão 360º…
      </div>
    );
  }
  if (!d) return null;

  const allProducts = (catalogsQ.data ?? []).flatMap((c) => c.products.map((p) => ({ ...p, catalogName: c.name })));
  const companies = (companiesQ.data?.companies ?? []) as Array<{ id: string; name: string }>;

  return (
    <div className="pb-4">
      {/* Empresa */}
      <Block
        icon={Building2}
        title="Empresa"
        action={
          <button
            onClick={() => setEditingCompany((v) => !v)}
            className="text-[10px] px-2 py-0.5 rounded-md hover:opacity-80"
            style={{ color: "var(--chat-meta)", border: "1px solid var(--chat-divider)" }}
          >
            {d.company ? "Alterar" : "Vincular"}
          </button>
        }
      >
        {d.company ? (
          <div className="flex items-center gap-2">
            {d.company.logoUrl ? (
              <img src={d.company.logoUrl} alt={d.company.name} className="w-7 h-7 rounded object-cover" />
            ) : (
              <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center">
                <Building2 className="w-3.5 h-3.5" style={{ color: "var(--chat-meta)" }} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs truncate" style={{ color: "var(--chat-text)" }}>{d.company.name}</div>
              <div className="text-[10px]" style={{ color: "var(--chat-meta)" }}>
                {d.company.leadsCount} contato(s){d.company.site ? ` · ${d.company.site}` : ""}
              </div>
            </div>
          </div>
        ) : (
          <div className={emptyTxt} style={{ color: "var(--chat-meta)" }}>Nenhuma empresa vinculada.</div>
        )}

        {editingCompany && (
          <select
            className="w-full text-xs rounded-md px-2.5 py-1.5 mt-1"
            style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
            value={d.company?.id ?? ""}
            onChange={(e) => companyM.mutate(e.target.value || null)}
          >
            <option value="">Sem empresa</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </Block>

      {/* Produtos */}
      <Block
        icon={Package}
        title="Produtos"
        count={d.totals.produtos}
        action={
          <button
            onClick={() => setAddingProduct((v) => !v)}
            className="text-[10px] px-2 py-0.5 rounded-md hover:opacity-80 flex items-center gap-1"
            style={{ color: "var(--chat-meta)", border: "1px solid var(--chat-divider)" }}
          >
            <Plus className="w-3 h-3" /> Vincular
          </button>
        }
      >
        {d.products.length === 0 && (
          <div className={emptyTxt} style={{ color: "var(--chat-meta)" }}>Nenhum produto vinculado.</div>
        )}
        {d.products.map((p) => (
          <div key={`${p.id}-${p.kind}`} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ backgroundColor: "var(--chat-bg)" }}>
            <div className="min-w-0 flex-1">
              <div className="text-xs truncate" style={{ color: "var(--chat-text)" }}>{p.name}</div>
              <div className="text-[10px]" style={{ color: "var(--chat-meta)" }}>
                {p.catalogName} · {brl(p.price)}
              </div>
            </div>
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full",
                p.kind === "comprou" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400",
              )}
            >
              {p.kind === "comprou" ? "Comprou" : "Interesse"}
            </span>
            <button onClick={() => unlinkM.mutate({ productId: p.id, kind: p.kind })} className="opacity-60 hover:opacity-100">
              <X className="w-3 h-3" style={{ color: "var(--chat-meta)" }} />
            </button>
          </div>
        ))}

        {addingProduct && (
          <div className="space-y-1.5 pt-1">
            <select
              className="w-full text-xs rounded-md px-2.5 py-1.5"
              style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) linkM.mutate({ productId: e.target.value, kind: "interesse" });
              }}
            >
              <option value="">Marcar interesse em…</option>
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {brl(p.price)}</option>
              ))}
            </select>
            <select
              className="w-full text-xs rounded-md px-2.5 py-1.5"
              style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) linkM.mutate({ productId: e.target.value, kind: "comprou" });
              }}
            >
              <option value="">Registrar compra de…</option>
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {brl(p.price)}</option>
              ))}
            </select>
            {allProducts.length === 0 && !catalogsQ.isLoading && (
              <div className={emptyTxt} style={{ color: "var(--chat-meta)" }}>
                Cadastre produtos em CRM → Produtos.
              </div>
            )}
          </div>
        )}
      </Block>

      {/* Agente IA */}
      <Block icon={Bot} title="Agente de IA">
        {d.agent ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--chat-text)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {d.agent.name} está atendendo este lead
          </div>
        ) : (
          <div className={emptyTxt} style={{ color: "var(--chat-meta)" }}>Nenhum agente ativo nesta conversa.</div>
        )}
      </Block>

      {/* Arquivos */}
      <Block icon={Paperclip} title="Arquivos" count={d.totals.arquivos}>
        {d.files.length === 0 && <div className={emptyTxt} style={{ color: "var(--chat-meta)" }}>Nenhum arquivo recebido.</div>}
        {d.files.slice(0, 8).map((f) => (
          <a
            key={f.id}
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:opacity-80"
            style={{ backgroundColor: "var(--chat-bg)" }}
          >
            <Paperclip className="w-3 h-3 flex-shrink-0" style={{ color: "var(--chat-meta)" }} />
            <span className="text-xs truncate flex-1" style={{ color: "var(--chat-text)" }}>{f.nome}</span>
            <span className="text-[10px]" style={{ color: "var(--chat-meta)" }}>{f.origem}</span>
          </a>
        ))}
      </Block>

      {/* Tarefas */}
      <Block icon={CheckSquare} title="Tarefas" count={d.totals.tarefas}>
        {d.tasks.length === 0 && <div className={emptyTxt} style={{ color: "var(--chat-meta)" }}>Nenhuma tarefa.</div>}
        {d.tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ backgroundColor: "var(--chat-bg)" }}>
            <span className="text-xs truncate flex-1" style={{ color: "var(--chat-text)" }}>{t.title}</span>
            <span className="text-[10px]" style={{ color: "var(--chat-meta)" }}>{fmtDate(t.dueAt)}</span>
          </div>
        ))}
      </Block>

      {/* Linha do tempo */}
      <Block icon={Activity} title="Atividades" count={d.totals.atividades}>
        {d.activities.length === 0 && <div className={emptyTxt} style={{ color: "var(--chat-meta)" }}>Sem atividades.</div>}
        {d.activities.slice(0, 10).map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-[11px]" style={{ color: "var(--chat-meta)" }}>
            <span className="w-1 h-1 rounded-full bg-white/30" />
            <span className="flex-1 truncate" style={{ color: "var(--chat-text)" }}>
              {a.type === "note" ? "📝 Nota interna" : a.type.replace(/_/g, " ")}
            </span>
            <span>{fmtDate(a.occurredAt)}</span>
          </div>
        ))}

      </Block>
    </div>
  );
}
