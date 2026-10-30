import { useEffect, useMemo, useRef, useState } from "react";
import { X, Settings2, Plus, Trash2, Save, User, Upload, ChevronDown, ArrowRightLeft, Check, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { customFieldDraftKey, readCustomFieldDraft, writeCustomFieldDraft, clearCustomFieldDraft } from "@/lib/custom-field-tab-draft";
import { cn } from "@/lib/utils";
import { FUNNELS } from "@/lib/crm-mock";
import { getLeadDetail, updateLead, listLeadCustomFields, saveLeadCustomFields, setLeadCustomFieldValue, type LeadDetailResponse } from "@/lib/leads.functions";
import { listFunnels, moveLead } from "@/lib/crm.functions";
import { setLeadKeepFiles } from "@/lib/crm-arquivos.functions";
import { Archive } from "lucide-react";
import { CreateGroupFromLeadDialog } from "./CreateGroupFromLeadDialog";
import { supabase } from "@/integrations/supabase/client";
import { Lead360Section } from "@/components/crm/Lead360Section";
import { listProductCatalogs } from "@/lib/products.functions";


export type LeadFieldType =
 | "text"
 | "textarea"
 | "phone"
 | "email"
 | "date"
 | "datetime"
 | "birthday"
 | "cpf"
 | "address"
 | "url"
 | "money"
 | "file"
 | "product"
 | "select"
 | "multiselect";

export interface LeadProfileField {
 key: string;
 label: string;
 type: LeadFieldType;
 options?: string[];
 group?: string;
}

export const DEFAULT_LEAD_FIELDS: LeadProfileField[] = [
 { key: "name", label: "Nome", type: "text", group: "Contato" },
 { key: "company", label: "Empresa", type: "text", group: "Contato" },
 { key: "role", label: "Cargo", type: "text", group: "Contato" },
 { key: "email", label: "E-mail", type: "email", group: "Contato" },
 { key: "phone", label: "Telefone", type: "phone", group: "Contato" },
 { key: "whatsapp", label: "WhatsApp", type: "phone", group: "Contato" },
 { key: "cpf", label: "CPF", type: "cpf", group: "Contato" },
 { key: "city", label: "Cidade/Estado", type: "text", group: "Contato" },
 { key: "birthday", label: "Data de nascimento", type: "birthday", group: "Contato" },

 { key: "source", label: "Origem", type: "select", options: ["Orgânico", "Anúncio Meta", "Anúncio Google", "Indicação", "Outro"], group: "Negócio" },
 { key: "stage", label: "Etapa do funil", type: "select", options: ["Novo", "Qualificação", "Apresentação", "Proposta", "Negociação", "Ganho", "Perdido"], group: "Negócio" },
 { key: "owner", label: "Responsável", type: "text", group: "Negócio" },
 { key: "value", label: "Valor da venda (R$)", type: "money", group: "Negócio" },
 { key: "product", label: "Produto / serviço", type: "product", group: "Negócio" },
 { key: "temperature", label: "Temperatura do lead", type: "select", options: ["Frio", "Morno", "Quente"], group: "Negócio" },

 { key: "pain", label: "Dor / desejo", type: "textarea", group: "Diagnóstico" },
 { key: "summary", label: "Resumo da conversa", type: "textarea", group: "Diagnóstico" },
 { key: "next_action", label: "Próximo passo", type: "text", group: "Diagnóstico" },
];

const PERSISTED_LEAD_FIELDS = DEFAULT_LEAD_FIELDS.filter((field) =>
 ["name", "email", "phone", "whatsapp", "value"].includes(field.key),
);

// ---- Funis (com campos personalizados próprios) ----
export interface FunnelDef {
 id: string;
 name: string;
 fields: LeadProfileField[];
}

const DEFAULT_FUNNELS: FunnelDef[] = [
 {
 id: "vendas",
 name: "Funil de Vendas",
 fields: [
 { key: "f_vendas_origem_oport", label: "Origem da oportunidade", type: "select", options: ["Inbound", "Outbound", "Indicação", "Evento"] },
 { key: "f_vendas_objecao", label: "Principal objeção", type: "textarea" },
 { key: "f_vendas_concorrente", label: "Concorrente avaliado", type: "text" },
 { key: "f_vendas_proposta_data", label: "Data da proposta", type: "date" },
 { key: "f_vendas_followup", label: "Próximo follow-up", type: "datetime" },
 { key: "f_vendas_decisor", label: "Decisor identificado?", type: "select", options: ["Sim", "Não", "Parcial"] },
 { key: "f_vendas_contrato", label: "Contrato / proposta", type: "file" },
 ],
 },
 {
 id: "pos-vendas",
 name: "Funil de Pós-vendas",
 fields: [
 { key: "f_pos_onboarding_data", label: "Início do onboarding", type: "datetime" },
 { key: "f_pos_csm", label: "CSM responsável", type: "text" },
 { key: "f_pos_nps", label: "NPS", type: "select", options: ["Detrator", "Neutro", "Promotor"] },
 { key: "f_pos_health", label: "Health score", type: "select", options: ["Crítico", "Atenção", "Saudável", "Excelente"] },
 { key: "f_pos_renovacao", label: "Data de renovação", type: "date" },
 { key: "f_pos_upsell", label: "Oportunidades de upsell", type: "multiselect", options: ["Plano superior", "Add-ons", "Serviço extra", "Licenças adicionais"] },
 { key: "f_pos_ticket", label: "Tickets em aberto", type: "text" },
 ],
 },
 {
 id: "reativacao",
 name: "Funil de Reativação",
 fields: [
 { key: "f_rea_motivo_churn", label: "Motivo do churn", type: "select", options: ["Preço", "Concorrente", "Sem uso", "Suporte", "Outro"] },
 { key: "f_rea_ultima_compra", label: "Última compra", type: "date" },
 { key: "f_rea_canal", label: "Canal preferido", type: "select", options: ["WhatsApp", "E-mail", "SMS", "Ligação"] },
 { key: "f_rea_oferta", label: "Oferta enviada", type: "text" },
 { key: "f_rea_data_envio", label: "Data/hora do envio", type: "datetime" },
 { key: "f_rea_interesse", label: "Interesses", type: "multiselect", options: ["Desconto", "Novidades", "Suporte VIP", "Combo"] },
 { key: "f_rea_endereco", label: "Endereço para entrega", type: "address" },
 ],
 },
];

// ---- Produtos disponíveis: vêm dos catálogos do CRM (banco de dados) ----
export interface ProductOption { id: string; name: string; price: number }

type ProfileData = Record<string, string>;

export function LeadProfilePanel({
 leadId,
 leadName,
 defaults,
 onLeadMoved,
 onClose,
}: {
 leadId: string;
 leadName: string;
 defaults?: ProfileData;
 onLeadMoved?: (pipelineId: string, stageId: string) => void;
 onClose: () => void;
}) {
 const [data, setData] = useState<ProfileData>({});
 const [funnels, setFunnels] = useState<FunnelDef[]>(DEFAULT_FUNNELS);
 const [selectedView, setSelectedView] = useState<string>("__main__"); // "__main__" or funnel id
 const [settingsOpen, setSettingsOpen] = useState(false);
 const [savedFlash, setSavedFlash] = useState(false);
 const [savingProfile, setSavingProfile] = useState(false);
 const [createGroupOpen, setCreateGroupOpen] = useState(false);
 const [isMoving, setIsMoving] = useState(false);

 const queryClient = useQueryClient();
 const loadDetail = useServerFn(getLeadDetail);
 const listFunnelsFn = useServerFn(listFunnels);
 const moveLeadFn = useServerFn(moveLead);

 const { data: pipelinesData } = useQuery({
   queryKey: ["crm-funnels-lite"],
   queryFn: () => listFunnelsFn({ data: {} }),
   staleTime: 5 * 60_000,
 });

 const detailQ = useQuery({
  queryKey: ["lead-profile", leadId],
  queryFn: () => loadDetail({ data: { leadId } }),
  staleTime: 15_000,
  });
 const detail = detailQ.data as LeadDetailResponse | undefined;

 // Campos personalizados vêm do banco (workspace), não do navegador:
 // assim aparecem em qualquer perfil/navegador e nas automações/bots.
 const listFields = useServerFn(listLeadCustomFields);
 const loadCatalogsFn = useServerFn(listProductCatalogs);
 const catalogsQ = useQuery({
  queryKey: ["product-catalogs"],
  queryFn: () => loadCatalogsFn(),
  staleTime: 60_000,
 });
 const productOptions: ProductOption[] = useMemo(
  () =>
   (catalogsQ.data ?? []).flatMap((c) =>
    c.products.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, price: p.promoPrice ?? p.price })),
   ),
  [catalogsQ.data],
 );
 const fieldsQ = useQuery({
  queryKey: ["lead-custom-fields"],
  queryFn: () => listFields(),
  staleTime: 0,
  refetchOnMount: "always",
 });
 const customFields: LeadProfileField[] = useMemo(
  () =>
   (fieldsQ.data?.fields ?? []).map((f) => ({
    key: `cf_${f.id}`,
    label: f.name,
    type: (f.fieldType || "text") as LeadFieldType,
    options: f.options ?? [],
    group: "Personalizados",
   })),
  [fieldsQ.data],
 );
 const fieldDraftKey = fieldsQ.isFetchedAfterMount
  ? customFieldDraftKey(fieldsQ.data?.actorId, fieldsQ.data?.workspaceId, `lead:${leadId}`) : null;
 useEffect(() => {
  if (fieldDraftKey && readCustomFieldDraft(fieldDraftKey, null)) setSettingsOpen(true);
 }, [fieldDraftKey]);

 const saveFields = useServerFn(saveLeadCustomFields);
 const saveFieldValue = useServerFn(setLeadCustomFieldValue);
 const saveLead = useServerFn(updateLead);

 useEffect(() => {
  const channel = supabase
   .channel(`lead-fields:${leadId}`)
   .on("postgres_changes", { event: "*", schema: "public", table: "lead_custom_fields" }, () => {
    void queryClient.invalidateQueries({ queryKey: ["lead-custom-fields"] });
   })
   .on("postgres_changes", { event: "*", schema: "public", table: "lead_custom_field_values", filter: `lead_id=eq.${leadId}` }, () => {
    void queryClient.invalidateQueries({ queryKey: ["lead-profile", leadId] });
   })
   .subscribe();
  return () => { void supabase.removeChannel(channel); };
 }, [leadId, queryClient]);

 useEffect(() => {
 if (savingProfile) return;
 const lead = detail?.lead;
 const cfValues: ProfileData = {};
 for (const cf of lead?.customFields ?? []) cfValues[`cf_${cf.id}`] = cf.displayValue;
 setData({
...(defaults?? {}),
...cfValues,
...(lead? {
 name: lead.name,
 email: lead.email?? "",
 phone: lead.phone?? "",
 whatsapp: lead.phone?? "",
  stage: lead.stageName?? "",
  __funnelId: lead.pipelineId ?? "",
  __stageId: lead.stageId ?? "",
  value: String(lead.value?? ""),
 }: {}),
 });
 setFunnels(DEFAULT_FUNNELS.map((f) => ({ ...f, fields: customFields })));
 }, [leadId, detail?.lead?.name, detail?.lead?.phone, detail?.lead?.customFields, customFields, savingProfile]); // eslint-disable-line react-hooks/exhaustive-deps

 const leadDetail = detail?.lead;
 const displayLeadName = leadDetail?.name?? leadName;

 const visibleFields = useMemo(() => {
 if (selectedView === "__main__") return [...PERSISTED_LEAD_FIELDS,...customFields];
 const f = funnels.find((x) => x.id === selectedView);
 return f? f.fields.map((fd) => ({...fd, group: fd.group?? f.name })): [];
 }, [selectedView, customFields, funnels]);

 const grouped = useMemo(() => {
 const m = new Map<string, LeadProfileField[]>();
 for (const f of visibleFields) {
 const g = f.group?? "Personalizados";
 if (!m.has(g)) m.set(g, []);
 m.get(g)!.push(f);
 }
 return Array.from(m.entries());
 }, [visibleFields]);

 function update(k: string, v: string) {
 setData((prev) => {
 const next = {...prev, [k]: v };
 // Auto-atualiza valor quando seleciona produto
 if (k === "product") {
 const prod = productOptions.find((p) => p.id === v || p.name === v);
 if (prod) next.value = String(prod.price);
 }
 return next;
 });
 }

 async function persistCustomValues(source: ProfileData): Promise<number> {
  let changedCount = 0;
  for (const f of customFields) {
   const fieldId = f.key.slice(3);
   const value = source[f.key] ?? "";
   const before = leadDetail?.customFields?.find((item) => item.id === fieldId)?.displayValue ?? "";
   if (String(value) === String(before)) continue;

   try {
    const result = await saveFieldValue({ data: { leadId, fieldId, value } });
    if (!result?.ok || String(result.value ?? "") !== String(value)) {
     throw new Error("o banco não confirmou o valor");
    }
    changedCount += result.changed === false ? 0 : 1;
   } catch (error) {
    const detail = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível salvar "${f.label ?? f.key}": ${detail}`);
   }
  }
  return changedCount;
 }

 async function saveAll() {
  if (savingProfile) return;
  setSavingProfile(true);
  setSavedFlash(false);

  try {
   const parsedValue = Number(data.value || 0);
   const patch: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    value?: number;
   } = {};

   const nextName = data.name?.trim() || displayLeadName;
   const nextEmail = data.email?.trim() || null;
   const nextPhone = data.phone?.trim() || data.whatsapp?.trim() || null;
   const nextValue = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;

   if (nextName !== (leadDetail?.name ?? displayLeadName)) patch.name = nextName;
   if (nextEmail !== (leadDetail?.email ?? null)) patch.email = nextEmail;
   if (nextPhone !== (leadDetail?.phone ?? null)) patch.phone = nextPhone;
   if (nextValue !== Number(leadDetail?.value ?? 0)) patch.value = nextValue;

   if (Object.keys(patch).length > 0) {
    const basicResult = await saveLead({ data: { leadId, patch } });
    if (!basicResult?.ok) throw new Error("O servidor não confirmou os campos básicos.");
   }

   const customChanged = await persistCustomValues(data);
   const refreshed = await detailQ.refetch();
   if (refreshed.error) throw refreshed.error;

   const freshLead = refreshed.data?.lead;
   if (!freshLead) throw new Error("Não foi possível reler o lead depois do salvamento.");

   for (const f of customFields) {
    const expected = data[f.key] ?? "";
    const persisted = freshLead.customFields.find((item) => item.id === f.key.slice(3))?.displayValue ?? "";
    if (String(expected) !== String(persisted)) {
     throw new Error(`O campo "${f.label ?? f.key}" não permaneceu salvo após a releitura.`);
    }
   }

   setSavedFlash(true);
   toast.success(customChanged > 0 ? "Campos personalizados salvos." : "Lead salvo.");
   setTimeout(() => setSavedFlash(false), 1800);
  } catch (error) {
   const message = error instanceof Error ? error.message : "Não foi possível salvar o lead.";
   toast.error(message);
  } finally {
   setSavingProfile(false);
  }
 }

 /** Cria/atualiza/remove campos personalizados direto no banco. */
 async function persistMainFields(next: LeadProfileField[], baselineKeys?: string[]) {
  const current = baselineKeys ? customFields.filter(field => baselineKeys.includes(field.key)) : customFields;
  const nextKeys = new Set(next.map((f) => f.key.replace(/^custom_/, "cf_")));
  const removed = current.filter((old) => !nextKeys.has(old.key));
  // Só entram como "novos" os campos criados no diálogo (`custom_<ts>`).
  // Os campos fixos do lead (nome, e-mail, telefone…) NUNCA viram campo
  // personalizado — antes eles eram reenviados e o banco recusava por nome
  // duplicado, abortando a criação do campo que o usuário acabara de criar.
  const created = next.filter((f) => f.key.startsWith("custom_"));
  const edited = next.filter((f) => {
   if (!f.key.startsWith("cf_")) return false;
   const before = current.find((c) => c.key === f.key);
   return (
    !!before &&
    (before.label !== f.label ||
     before.type !== f.type ||
     JSON.stringify(before.options ?? []) !== JSON.stringify(f.options ?? []))
   );
  });

  const toRecord = (f: LeadProfileField) => ({
   id: f.key.startsWith("cf_") ? f.key.slice(3) : f.key.slice(7),
   name: f.label, fieldType: f.type, options: f.options ?? [],
  });
  await saveFields({ data: {
   deletedIds: removed.map(f => f.key.slice(3)),
   updated: edited.map(toRecord), created: created.map(toRecord),
  } });
  const refreshed = await fieldsQ.refetch();
  if (refreshed.isError) throw new Error("Campos salvos, mas não foi possível atualizar a lista. Tente novamente.");
  queryClient.invalidateQueries({ queryKey: ["lead-custom-fields"] });
  queryClient.invalidateQueries({ queryKey: ["lead-profile", leadId] });
 }




 async function persistFunnelFields(_funnelId: string, next: LeadProfileField[]) {
  await persistMainFields(next);
  setFunnels(DEFAULT_FUNNELS.map((f) => ({ ...f, fields: next })));
 }

 return (
    <aside
      className="w-full h-full flex flex-col border-r shadow-2xl"

 style={{ backgroundColor: "var(--chat-panel)", borderColor: "var(--chat-divider)", color: "var(--chat-text)" }}
 >
 <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--chat-divider)" }}>
 <div className="flex items-center gap-2 min-w-0">
 <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--chat-panel-hover)" }}>
 <User className="w-4 h-4" />
 </div>
 <div className="min-w-0">
 <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--chat-meta)" }}>Perfil do cliente</div>
 <div className="text-sm font-semibold truncate">{displayLeadName}</div>
 </div>
 </div>
  <div className="flex items-center gap-1">
  <button
  onClick={() => setCreateGroupOpen(true)}
  className="h-8 px-2 rounded-md text-[11px] flex items-center gap-1 hover:bg-white/5"
  style={{ color: "var(--chat-text-muted)" }}
  title="Criar um grupo no WhatsApp com este lead"
  >
  <Users className="w-3.5 h-3.5" /> Criar grupo
  </button>
  <button
  onClick={() => {
   if (!fieldDraftKey) {
    void fieldsQ.refetch();
    toast.error("Aguarde a confirmação dos campos desta conta e tente novamente.");
    return;
   }
   setSettingsOpen(true);
  }}
  className="h-8 px-2 rounded-md text-[11px] flex items-center gap-1 hover:bg-white/5"
  style={{ color: "var(--chat-text-muted)" }}
  >
  <Settings2 className="w-3.5 h-3.5" /> Configurações
  </button>
 <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/5" aria-label="Fechar">
 <X className="w-4 h-4" />
 </button>
 </div>
 </div>

  {/* Etapa atual do lead (mover entre funis) */}
  <StagePicker
    funnelId={data.__funnelId || ""}
    stageId={data.__stageId || ""}
    pipelines={pipelinesData?.funnels ?? []}
    isLoading={isMoving}
    onChange={async (fid, sid) => {
      setIsMoving(true);
      try {
        await moveLeadFn({ data: { leadId, toStageId: sid } });
        update("__funnelId", fid);
        update("__stageId", sid);
        toast.success("Lead movimentado com sucesso");
        onLeadMoved?.(fid, sid);
        await queryClient.invalidateQueries({ queryKey: ["lead-profile", leadId] });
      } catch (err: any) {
        toast.error(err.message || "Erro ao movimentar lead");
      } finally {
        setIsMoving(false);
      }
    }}
  />

 {/* Preservar arquivos deste lead */}
 <KeepFilesToggle leadId={leadId} initial={!!leadDetail?.keepFiles} />


 {/* Seletor de visualização (perfil principal x funis) */}
 <div className="px-4 pt-3 pb-2 border-b" style={{ borderColor: "var(--chat-divider)" }}>
 <div className="text-[10px] tracking-widest mb-1.5" style={{ color: "var(--chat-meta)" }}>VISUALIZAR CAMPOS DE</div>
 <div className="relative">
 <select
 value={selectedView}
 onChange={(e) => setSelectedView(e.target.value)}
 className="w-full appearance-none text-xs font-medium rounded-md pl-2.5 pr-7 py-2 outline-none"
 style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
 >
 <option value="__main__">Perfil principal</option>
 {funnels.map((f) => (
 <option key={f.id} value={f.id}>{f.name}</option>
 ))}
 </select>
 <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--chat-meta)" }} />
 </div>
 </div>

 <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
 {detailQ.isLoading && (
 <div className="text-[11px] text-center py-2" style={{ color: "var(--chat-meta)" }}>
 Carregando dados do lead…
 </div>
 )}
 {leadDetail && leadDetail.tags.length > 0 && (
 <section>
 <div className="text-[10px] font-semibold tracking-widest mb-1.5" style={{ color: "var(--chat-meta)" }}>TAGS</div>
 <div className="flex flex-wrap gap-1.5">
 {leadDetail.tags.map((tag: string) => (
 <span
 key={tag}
 className="text-[11px] px-2 py-0.5 rounded-full border"
 style={{ borderColor: "var(--chat-divider)", backgroundColor: "var(--chat-panel-hover)", color: "var(--chat-text)" }}
 >
 {tag}
 </span>
 ))}
 </div>
 </section>
 )}
 {grouped.map(([group, fields]) => (
 <section key={group}>
 <div className="text-[10px] font-semibold tracking-widest mb-2" style={{ color: "var(--chat-meta)" }}>
 {group.toUpperCase()}
 </div>
 <div className="space-y-2">
 {fields.map((f) => (
 <FieldRow key={f.key} field={f} value={data[f.key]?? ""} products={productOptions} onChange={(v) => update(f.key, v)} />
 ))}
 </div>
 </section>
 ))}
 {grouped.length === 0 && (
 <div className="text-[11px] text-center py-8" style={{ color: "var(--chat-meta)" }}>
 Nenhum campo neste funil. Clique em Configurações para criar.
 </div>
 )}

 {/* Visão 360º: empresa, produtos, formulários, arquivos, tarefas e IA */}
 <div className="-mx-4 border-t" style={{ borderColor: "var(--chat-divider)" }}>
 <Lead360Section leadId={leadId} />
 </div>
 </div>


 <div className="px-4 py-3 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--chat-divider)" }}>
 <span className={cn("text-[11px]", savedFlash? "opacity-100": "opacity-0 transition-opacity")} style={{ color: "var(--chat-accent)" }}>
 Salvo na conta
 </span>
 <button
 onClick={() => void saveAll()}
 disabled={savingProfile}
 className="h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
 style={{ backgroundColor: "var(--chat-accent)", color: "oklch(0.12 0.02 162)" }}
 >
 <Save className="w-3.5 h-3.5" /> {savingProfile ? "Salvando..." : "Salvar"}
 </button>
 </div>

 {settingsOpen && (
 <CustomFieldsDialog
 key={fieldDraftKey}
 draftKey={fieldDraftKey}
 mainFields={customFields}
 funnels={[]}
 initialView="__main__"
 onClose={() => setSettingsOpen(false)}
 onSaveMain={(next, baselineKeys) => persistMainFields(next, baselineKeys)}
 onSaveFunnel={(id, next) => persistFunnelFields(id, next)}
 />
  )}
  <CreateGroupFromLeadDialog
  open={createGroupOpen}
  onClose={() => setCreateGroupOpen(false)}
  leadName={displayLeadName}
  leadPhone={leadDetail?.phone ?? data.phone ?? data.whatsapp ?? ""}
  />
  </aside>
 );
}


function FieldRow({
 field,
 products,
 value,
 onChange,
}: {
 field: LeadProfileField;
 products: ProductOption[];
 value: string;
 onChange: (v: string) => void;
}) {
 const fileRef = useRef<HTMLInputElement>(null);
 const commonClass = "w-full text-xs rounded-md px-2.5 py-1.5 outline-none focus:ring-1";
 const commonStyle = {
 backgroundColor: "var(--chat-bg)",
 color: "var(--chat-text)",
 border: "1px solid var(--chat-divider)",
 } as const;

 function formatCPF(raw: string) {
 const d = raw.replace(/\D/g, "").slice(0, 11);
 return d
.replace(/(\d{3})(\d)/, "$1.$2")
.replace(/(\d{3})(\d)/, "$1.$2")
.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
 }

 return (
 <label className="block">
 <div className="text-[10px] mb-1" style={{ color: "var(--chat-meta)" }}>{field.label}</div>

 {field.type === "textarea" || field.type === "address"? (
 <textarea
 rows={field.type === "address"? 2: 3}
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className={commonClass}
 style={commonStyle}
 placeholder={field.type === "address"? "Rua, número, bairro, cidade, CEP": undefined}
 />
 ): field.type === "select"? (
 <select value={value} onChange={(e) => onChange(e.target.value)} className={commonClass} style={commonStyle}>
 <option value="">Selecione</option>
 {field.options?.map((o) => (
 <option key={o} value={o}>{o}</option>
 ))}
 </select>
 ): field.type === "multiselect"? (
 <MultiSelect value={value} options={field.options?? []} onChange={onChange} />
 ): field.type === "product"? (
 <select value={value} onChange={(e) => onChange(e.target.value)} className={commonClass} style={commonStyle}>
 <option value="">Selecione</option>
 {products.length === 0 && <option value="" disabled>Cadastre produtos em CRM → Produtos</option>}
 {products.map((p) => (
 <option key={p.id} value={p.name}>{p.name} - R$ {p.price.toLocaleString("pt-BR")}</option>
 ))}
 </select>
 ): field.type === "file"? (
 <div className="flex items-center gap-2">
 <input
 ref={fileRef}
 type="file"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) onChange(f.name);
 }}
 />
 <button
 type="button"
 onClick={() => fileRef.current?.click()}
 className="flex-1 text-xs rounded-md px-2.5 py-1.5 flex items-center gap-2 hover:opacity-90"
 style={commonStyle}
 >
 <Upload className="w-3.5 h-3.5" />
 <span className="truncate">{value || "Selecionar arquivo"}</span>
 </button>
 {value && (
 <button type="button" onClick={() => onChange("")} className="text-destructive">
 <Trash2 className="w-3.5 h-3.5" />
 </button>
 )}
 </div>
 ): field.type === "cpf"? (
 <input
 type="text"
 value={value}
 onChange={(e) => onChange(formatCPF(e.target.value))}
 placeholder="000.000.000-00"
 className={commonClass}
 style={commonStyle}
 />
 ): (
 <input
 type={
 field.type === "date" || field.type === "birthday"
? "date"
: field.type === "datetime"
? "datetime-local"
: field.type === "email"
? "email"
: field.type === "url"
? "url"
: field.type === "money"
? "number"
: field.type === "phone"
? "tel"
: "text"
 }
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className={commonClass}
 style={commonStyle}
 />
 )}
 </label>
 );
}

function MultiSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
 const selected = value? value.split("|").filter(Boolean): [];
 function toggle(opt: string) {
 const set = new Set(selected);
 if (set.has(opt)) set.delete(opt);
 else set.add(opt);
 onChange(Array.from(set).join("|"));
 }
 return (
 <div className="flex flex-wrap gap-1.5 rounded-md px-2 py-1.5" style={{ backgroundColor: "var(--chat-bg)", border: "1px solid var(--chat-divider)" }}>
 {options.length === 0 && <span className="text-[11px]" style={{ color: "var(--chat-meta)" }}>Sem opções</span>}
 {options.map((o) => {
 const active = selected.includes(o);
 return (
 <button
 type="button"
 key={o}
 onClick={() => toggle(o)}
 className="text-[11px] px-2 py-0.5 rounded-full border"
 style={{
 backgroundColor: active? "var(--chat-accent)": "transparent",
 color: active? "oklch(0.12 0.02 162)": "var(--chat-text-muted)",
 borderColor: active? "var(--chat-accent)": "var(--chat-divider)",
 }}
 >
 {o}
 </button>
 );
 })}
 </div>
 );
}

const FIELD_TYPE_LABELS: { value: LeadFieldType; label: string }[] = [
 { value: "text", label: "Texto curto" },
 { value: "textarea", label: "Texto longo" },
 { value: "phone", label: "Telefone" },
 { value: "email", label: "E-mail" },
 { value: "date", label: "Data" },
 { value: "datetime", label: "Data e hora" },
 { value: "birthday", label: "Data de nascimento" },
 { value: "cpf", label: "CPF" },
 { value: "address", label: "Endereço" },
 { value: "url", label: "URL" },
 { value: "money", label: "Valor (R$)" },
 { value: "file", label: "Arquivo" },
 { value: "product", label: "Produto" },
 { value: "select", label: "Selecionar (1 opção)" },
 { value: "multiselect", label: "Selecionar múltiplos" },
];

function CustomFieldsDialog({
 draftKey = null,
 mainFields,
 funnels,
 initialView,
 onClose,
 onSaveMain,
 onSaveFunnel,
}: {
 draftKey?: string | null;
 mainFields: LeadProfileField[];
 funnels: FunnelDef[];
 initialView: string;
 onClose: () => void;
 onSaveMain: (fields: LeadProfileField[], baselineKeys?: string[]) => Promise<void>;
 onSaveFunnel: (funnelId: string, fields: LeadProfileField[]) => Promise<void>;
}) {
 const [restored] = useState(() => readCustomFieldDraft(draftKey, {
  target: initialView, mainList: mainFields, baselineKeys: mainFields.map(field => field.key),
  funnelLists: Object.fromEntries(funnels.map(f => [f.id, f.fields])),
  label: "", type: "text" as LeadFieldType, optionDraft: "", options: [] as string[],
 }));
 const [target, setTarget] = useState<string>(restored.target);
 const [mainList, setMainList] = useState<LeadProfileField[]>(restored.mainList);
 const [baselineKeys] = useState(restored.baselineKeys);
 const [funnelLists, setFunnelLists] = useState<Record<string, LeadProfileField[]>>(
 () => restored.funnelLists
 );

 const [label, setLabel] = useState(restored.label);
 const [type, setType] = useState<LeadFieldType>(restored.type);
 const [optionDraft, setOptionDraft] = useState(restored.optionDraft);
 const [options, setOptions] = useState<string[]>(restored.options);
 useEffect(() => {
  writeCustomFieldDraft(draftKey, { target, mainList, baselineKeys, funnelLists, label, type, optionDraft, options });
 }, [draftKey, target, mainList, baselineKeys, funnelLists, label, type, optionDraft, options]);
 function closeDialog() { clearCustomFieldDraft(draftKey); onClose(); }

 const isMain = target === "__main__";
 const currentList = isMain? mainList: funnelLists[target]?? [];

 function setCurrentList(next: LeadProfileField[]) {
 if (isMain) setMainList(next);
 else setFunnelLists((prev) => ({...prev, [target]: next }));
 }

 function addOption() {
 const t = optionDraft.trim();
 if (!t) return;
 setOptions((p) => [...p, t]);
 setOptionDraft("");
 }

 function addField() {
 if (!label.trim()) return null;
 const needsOptions = type === "select" || type === "multiselect";
 const finalOptions = [...new Set([...options, optionDraft.trim()].filter(Boolean))];
 if (needsOptions && finalOptions.length === 0) return null;
 const key = `custom_${crypto.randomUUID()}`;
 const newField: LeadProfileField = {
 key,
 label: label.trim(),
 type,
 group: isMain? "Personalizados": undefined,
...(needsOptions? { options: finalOptions }: {}),
 };
 const nextList = [...currentList, newField];
 setCurrentList(nextList);
 setLabel("");
 setType("text");
 setOptions([]);
 setOptionDraft("");
 return nextList;
 }

 function removeField(key: string) {
 setCurrentList(currentList.filter((x) => x.key!== key));
 }

 const [savingFields, setSavingFields] = useState(false);
 const [saveError, setSaveError] = useState<string | null>(null);
 const saveLock = useRef(false);
 async function handleSave() {
  if (saveLock.current) return;
  saveLock.current = true;
  setSavingFields(true);
  setSaveError(null);
  try {
   const pending = label.trim() ? addField() : currentList;
   if (!pending) throw new Error("Adicione as opções do campo de seleção.");
   await onSaveMain(isMain ? pending : mainList, baselineKeys);
   for (const f of funnels) await onSaveFunnel(f.id, funnelLists[f.id] ?? []);
   toast.success("Campos personalizados salvos.");
   closeDialog();
  } catch (error) {
   setSaveError(error instanceof Error ? error.message : "Não foi possível salvar os campos.");
  } finally {
   saveLock.current = false;
   setSavingFields(false);
  }
 }

 const needsOptions = type === "select" || type === "multiselect";

 return (
 <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
 <div
 className="w-full max-w-lg rounded-xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
 style={{ backgroundColor: "var(--chat-panel)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-start justify-between mb-4">
 <div>
 <div className="text-[10px] tracking-widest" style={{ color: "var(--chat-meta)" }}>CONFIGURAÇÕES</div>
 <h3 className="text-base font-semibold">Campos personalizados</h3>
 <p className="text-[11px] mt-1" style={{ color: "var(--chat-text-muted)" }}>
 Configure campos do perfil principal ou de cada funil.
 </p>
 </div>
 <button onClick={closeDialog} disabled={savingFields} className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/5">
 <X className="w-4 h-4" />
 </button>
 </div>

 <fieldset disabled={savingFields} className="contents">
 <div className="mb-3">
 <div className="text-[10px] tracking-widest mb-1.5" style={{ color: "var(--chat-meta)" }}>EDITANDO</div>
 <select
 value={target}
 onChange={(e) => setTarget(e.target.value)}
 className="w-full text-xs rounded-md px-2.5 py-2 outline-none"
 style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
 >
 <option value="__main__">Perfil principal</option>
 {funnels.map((f) => (
 <option key={f.id} value={f.id}>{f.name}</option>
 ))}
 </select>
 </div>

 <div className="space-y-2 mb-3">
 {currentList.length === 0 && (
 <div className="text-[11px]" style={{ color: "var(--chat-meta)" }}>Nenhum campo aqui ainda.</div>
 )}
 {currentList.map((f) => (
 <div key={f.key} className="flex items-center justify-between rounded-md px-2.5 py-2" style={{ backgroundColor: "var(--chat-bg)" }}>
 <div className="text-xs min-w-0">
 <div className="font-medium truncate">{f.label}</div>
 <div className="text-[10px]" style={{ color: "var(--chat-meta)" }}>
 {FIELD_TYPE_LABELS.find((t) => t.value === f.type)?.label?? f.type}
 {f.options && f.options.length > 0 && ` · ${f.options.length} opções`}
 </div>
 </div>
 <button onClick={() => removeField(f.key)} className="text-destructive hover:opacity-80">
 <Trash2 className="w-3.5 h-3.5" />
 </button>
 </div>
 ))}
 </div>

 <div className="rounded-md p-3 space-y-2" style={{ border: "1px dashed var(--chat-divider)" }}>
 <div className="text-[10px] tracking-widest" style={{ color: "var(--chat-meta)" }}>NOVO CAMPO</div>
 <input
 value={label}
 onChange={(e) => setLabel(e.target.value)}
 placeholder="Nome do campo (ex: CNPJ, Data da reunião…)"
 className="w-full text-xs rounded-md px-2.5 py-1.5 outline-none"
 style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
 />
 <select
 value={type}
 onChange={(e) => {
 setType(e.target.value as LeadFieldType);
 setOptions([]);
 }}
 className="w-full text-xs rounded-md px-2.5 py-1.5 outline-none"
 style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
 >
 {FIELD_TYPE_LABELS.map((o) => (
 <option key={o.value} value={o.value}>{o.label}</option>
 ))}
 </select>

 {needsOptions && (
 <div className="space-y-1.5 rounded-md p-2" style={{ border: "1px solid var(--chat-divider)" }}>
 <div className="text-[10px] tracking-widest" style={{ color: "var(--chat-meta)" }}>OPÇÕES</div>
 <div className="flex gap-1.5">
 <input
 value={optionDraft}
 onChange={(e) => setOptionDraft(e.target.value)}
 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
 placeholder="Adicionar opção e Enter"
 className="flex-1 text-xs rounded-md px-2 py-1 outline-none"
 style={{ backgroundColor: "var(--chat-bg)", color: "var(--chat-text)", border: "1px solid var(--chat-divider)" }}
 />
 <button
 type="button"
 onClick={addOption}
 className="px-2 rounded-md text-[11px]"
 style={{ backgroundColor: "var(--chat-panel-hover)", color: "var(--chat-text)" }}
 >
 <Plus className="w-3.5 h-3.5" />
 </button>
 </div>
 <div className="flex flex-wrap gap-1">
 {options.map((o, i) => (
 <span key={i} className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: "var(--chat-bg)", border: "1px solid var(--chat-divider)" }}>
 {o}
 <button onClick={() => setOptions(options.filter((_, idx) => idx!== i))} className="opacity-60 hover:opacity-100">
 <X className="w-3 h-3" />
 </button>
 </span>
 ))}
 {options.length === 0 && (
 <span className="text-[10px]" style={{ color: "var(--chat-meta)" }}>Adicione quantas opções precisar.</span>
 )}
 </div>
 </div>
 )}

 <button
 onClick={addField}
 disabled={!label.trim() || (needsOptions && options.length === 0 && !optionDraft.trim())}
 className="w-full h-8 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
 style={{ backgroundColor: "var(--chat-accent)", color: "oklch(0.12 0.02 162)" }}
 >
 <Plus className="w-3.5 h-3.5" /> Adicionar campo
 </button>
 </div>

 </fieldset>
 {saveError && <p role="alert" className="mt-3 text-xs text-destructive">{saveError}</p>}
 <div className="mt-4 flex items-center justify-end gap-2">
 <button onClick={closeDialog} disabled={savingFields} className="px-3 py-2 text-xs" style={{ color: "var(--chat-text-muted)" }}>
 Cancelar
 </button>
 <button
 onClick={() => void handleSave()}
 disabled={savingFields}
 className="px-3 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5"
 style={{ backgroundColor: "var(--chat-accent)", color: "oklch(0.12 0.02 162)" }}
 >
 <Save className="w-3.5 h-3.5" /> {savingFields ? "Salvando..." : "Salvar tudo"}
 </button>
 </div>
 </div>
 </div>
 );
}

function StagePicker({
  funnelId,
  stageId,
  pipelines,
  isLoading,
  onChange,
}: {
  funnelId: string;
  stageId: string;
  pipelines: any[];
  isLoading?: boolean;
  onChange: (funnelId: string, stageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const funnel = pipelines.find((f) => f.id === funnelId) || pipelines[0];
  if (!funnel) return null;
  const stage = funnel.stages.find((s: any) => s.id === stageId) || funnel.stages[0];
  if (!stage) return null;

 return (
 <div className="px-4 pt-3 pb-2 border-b relative" style={{ borderColor: "var(--chat-divider)" }}>
 <div className="text-[10px] tracking-widest mb-1.5" style={{ color: "var(--chat-meta)" }}>ETAPA DO LEAD</div>
  <button
  type="button"
  disabled={isLoading}
  onClick={() => setOpen((o) =>!o)}
  className={cn(
    "w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left",
    isLoading && "opacity-50 cursor-not-allowed"
  )}
  style={{ backgroundColor: "var(--chat-bg)", border: "1px solid var(--chat-divider)" }}
  >
  <div className="min-w-0 flex items-center gap-2">
  <ArrowRightLeft className={cn("w-3.5 h-3.5 shrink-0", isLoading && "animate-spin")} style={{ color: "var(--chat-accent)" }} />
  <div className="min-w-0">
  <div className="text-[10px] truncate" style={{ color: "var(--chat-meta)" }}>{funnel.name}</div>
  <div className="text-xs font-semibold truncate">{stage.name}</div>
  </div>
  </div>
  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} style={{ color: "var(--chat-meta)" }} />
  </button>

 {open && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
 <div
 className="absolute left-4 right-4 mt-1 z-50 rounded-md shadow-xl max-h-80 overflow-y-auto"
 style={{ backgroundColor: "var(--chat-panel)", border: "1px solid var(--chat-divider)" }}
 >
 {pipelines.map((f: any) => (
 <div key={f.id} className="py-1">
 <div className="px-3 py-1 text-[10px] tracking-widest" style={{ color: "var(--chat-meta)" }}>
 {f.name.toUpperCase()}
 </div>
  {f.stages.map((s: any) => {
  const active = f.id === funnel.id && s.id === stage.id;
  return (
 <button
 key={s.id}
 type="button"
 onClick={() => {
 onChange(f.id, s.id);
 setOpen(false);
 }}
 className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-white/5"
 style={{ color: active? "var(--chat-accent)": "var(--chat-text)" }}
 >
 <span className="flex items-center gap-2">
 <span
 className="w-1.5 h-1.5 rounded-full"
 style={{
 backgroundColor:
 s.status === "ganha"
? "rgb(34 197 94)"
: s.status === "perdida"
? "rgb(239 68 68)"
: "var(--chat-accent)",
 }}
 />
 {s.name}
 </span>
 {active && <Check className="w-3.5 h-3.5" />}
 </button>
 );
 })}
 </div>
 ))}
 </div>
 </>
 )}
 </div>
 );
}

function KeepFilesToggle({ leadId, initial }: { leadId: string; initial: boolean }) {
  const [keep, setKeep] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setKeep(initial); }, [initial, leadId]);
  const save = useServerFn(setLeadKeepFiles);
  const qc = useQueryClient();
  async function toggle() {
    const next = !keep;
    setKeep(next);
    setSaving(true);
    try {
      await save({ data: { leadId, keep: next } });
      qc.invalidateQueries({ queryKey: ["lead-profile", leadId] });
      qc.invalidateQueries({ queryKey: ["crm-arquivos"] });
    } catch {
      setKeep(!next);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: "var(--chat-divider)" }}>
      <Archive className="w-3.5 h-3.5" style={{ color: "var(--chat-meta)" }} />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium" style={{ color: "var(--chat-text)" }}>Salvar arquivos deste lead</div>
        <div className="text-[10px]" style={{ color: "var(--chat-meta)" }}>
          {keep ? "Os arquivos ficam preservados." : "Serão excluídos automaticamente após 15 dias."}
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        role="switch"
        aria-checked={keep}
        className={cn(
          "relative w-9 h-5 rounded-full transition-colors flex-shrink-0",
          keep ? "bg-emerald-500" : "bg-white/15",
          saving && "opacity-60"
        )}
      >
        <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", keep ? "left-[18px]" : "left-0.5")} />
      </button>
    </div>
  );
}
