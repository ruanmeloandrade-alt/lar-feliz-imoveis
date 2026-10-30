import { useMemo, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Shield, Check, Lock, Save, Filter, Copy, Building2, Plus } from "lucide-react";
import { getPermissionsContext, saveUserPermissions, listPermissionTemplates, savePermissionTemplate, deletePermissionTemplate, createWorkSector, setUserSector } from "@/lib/permissions.functions";

import {
  MODULES_MATRIX, matrixForPlan, defaultPermissions, defaultEntityAccess,
  LEAD_SCOPE_LABEL, type UserPermissions, type ModuleAccess, type LeadScope, type EntityAccess,
} from "@/lib/permissions-catalog";

const ACTIONS: { key: keyof EntityAccess; label: string }[] = [
  { key: "create", label: "Criar" },
  { key: "view",   label: "Ver" },
  { key: "edit",   label: "Editar" },
  { key: "delete", label: "Excluir" },
  { key: "export", label: "Exportar" },
];

const SCOPES: LeadScope[] = ["none", "assigned", "team", "all"];
const SCOPE_DOT: Record<LeadScope, string> = {
  none:     "bg-destructive",
  assigned: "bg-amber-500",
  team:     "bg-sky-500",
  all:      "bg-emerald-500",
};

export function UserPermissionsDialog({
  userId, userLabel, onClose, onToast,
}: {
  userId: string;
  userLabel: string;
  onClose: () => void;
  onToast: (m: string, t?: "ok" | "err") => void;
}) {
  const fnCtx = useServerFn(getPermissionsContext);
  const fnSave = useServerFn(saveUserPermissions);
  const ctxQ = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: () => fnCtx({ data: { userId } }),
  });

  const [perms, setPerms] = useState<UserPermissions>(defaultPermissions());

  const [sectorId, setSectorId] = useState<string>("");
  const [newSector, setNewSector] = useState("");

  useEffect(() => {
    if (!ctxQ.data) return;
    const stored = (ctxQ.data as any).permissions as UserPermissions | null;
    // merge com defaults pra garantir novos módulos
    const base = defaultPermissions();
    if (stored?.modules) {
      for (const [k, v] of Object.entries(stored.modules)) {
        base.modules[k] = { ...base.modules[k], ...v } as ModuleAccess;
      }
    }
    setPerms(base);
    setSectorId(((ctxQ.data as any).sectorId as string | null) ?? "");
  }, [ctxQ.data]);

  const sectors: any[] = (ctxQ.data as any)?.sectors ?? [];
  const fnCreateSector = useServerFn(createWorkSector);
  const fnSetSector = useServerFn(setUserSector);
  const mNewSector = useMutation({
    mutationFn: (name: string) => fnCreateSector({ data: { name } }),
    onSuccess: async (r: any) => {
      setNewSector("");
      await ctxQ.refetch();
      setSectorId(r?.sector?.id ?? "");
      onToast("Setor criado.");
    },
    onError: (e: any) => onToast(e.message ?? "Falha ao criar setor", "err"),
  });


  const planModules: string[] = (ctxQ.data as any)?.plan?.modules ?? [];
  const matrix = useMemo(() => matrixForPlan(planModules), [planModules]);
  const pipelines: any[] = (ctxQ.data as any)?.pipelines ?? [];
  const stages: any[] = (ctxQ.data as any)?.stages ?? [];
  const crmSources: any[] = (ctxQ.data as any)?.crmSources ?? [];
  const sourceLinks: any[] = (ctxQ.data as any)?.sourceLinks ?? [];

  /** Funis agrupados pelo CRM (fonte) a que pertencem, pra ficar claro qual CRM está sendo liberado. */
  const pipelineGroups = useMemo(() => {
    const srcName = (s: any) =>
      s?.display_name || (s?.provider === "mkton" ? "CRM MKTOn" : s?.provider === "kommo" ? "Kommo" : s?.provider) || "CRM";
    const byPipeline = new Map<string, string[]>();
    for (const l of sourceLinks) {
      const src = crmSources.find((s) => s.id === l.crm_source_id);
      if (!src) continue;
      const arr = byPipeline.get(l.pipeline_id) ?? [];
      arr.push(srcName(src));
      byPipeline.set(l.pipeline_id, arr);
    }
    const groups = new Map<string, { key: string; label: string; items: any[] }>();
    for (const p of pipelines) {
      const labels = byPipeline.get(p.id);
      const label = labels && labels.length > 0 ? labels.join(" · ") : "Sem CRM vinculado";
      const g = groups.get(label) ?? { key: label, label, items: [] };
      g.items.push(p);
      groups.set(label, g);
    }
    return Array.from(groups.values());
  }, [pipelines, crmSources, sourceLinks]);


  /* ----- Modelos de permissão ----- */
  const fnTplList = useServerFn(listPermissionTemplates);
  const fnTplSave = useServerFn(savePermissionTemplate);
  const fnTplDel = useServerFn(deletePermissionTemplate);
  const tplQ = useQuery({ queryKey: ["permission-templates"], queryFn: () => fnTplList({ data: {} } as any) });
  const templates: any[] = (tplQ.data as any)?.templates ?? [];

  function applyTemplateObj(tpl: any, quiet = false) {
    if (!tpl) return;
    const base = defaultPermissions();
    const stored = tpl.permissions as UserPermissions | null;
    if (stored?.modules) {
      for (const [k, v] of Object.entries(stored.modules)) {
        base.modules[k] = { ...base.modules[k], ...(v as ModuleAccess) };
      }
    }
    setPerms(base);
    if (!quiet) onToast(`Modelo "${tpl.name}" aplicado. Revise e salve.`);
  }
  function applyTemplate(id: string) {
    applyTemplateObj(templates.find((t) => t.id === id));
  }

  const sectorTemplate = templates.find((t: any) => t.sector_id && t.sector_id === sectorId) ?? null;

  function handleSectorChange(id: string) {
    setSectorId(id);
    const tpl = templates.find((t: any) => t.sector_id === id);
    if (tpl) {
      applyTemplateObj(tpl, true);
      onToast(`Permissões padrão do setor aplicadas (modelo "${tpl.name}").`);
    }
  }

  const mTplSave = useMutation({
    mutationFn: (v: { name: string; sectorId: string | null }) =>
      fnTplSave({ data: { name: v.name, permissions: perms, sectorId: v.sectorId } }),
    onSuccess: () => { tplQ.refetch(); onToast("Modelo salvo."); },
    onError: (e: any) => onToast(e.message ?? "Falha ao salvar modelo", "err"),
  });
  const mTplDel = useMutation({
    mutationFn: (id: string) => fnTplDel({ data: { id } }),
    onSuccess: () => { tplQ.refetch(); onToast("Modelo excluído."); },
    onError: (e: any) => onToast(e.message ?? "Falha ao excluir modelo", "err"),
  });

  function handleSaveTemplate(asSectorDefault: boolean) {
    const suggested = asSectorDefault
      ? (sectors.find((s: any) => s.id === sectorId)?.name ?? "")
      : "";
    const name = window.prompt("Nome do modelo de permissões (ex.: Vendedor padrão)", suggested)?.trim();
    if (!name) return;
    mTplSave.mutate({ name, sectorId: asSectorDefault ? sectorId : null });
  }
  function handleDeleteTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    if (!window.confirm(`Excluir o modelo "${tpl.name}"?`)) return;
    mTplDel.mutate(id);
  }


  const mSave = useMutation({
    mutationFn: async () => {
      if (!sectorId) throw new Error("Escolha (ou crie) o setor de trabalho deste usuário.");
      await fnSetSector({ data: { userId, sectorId } });
      return fnSave({ data: { userId, permissions: perms } });
    },
    onSuccess: () => { onToast("Permissões salvas."); onClose(); },

    onError: (e: any) => onToast(e.message ?? "Falha ao salvar", "err"),
  });

  function updateModule(id: string, patch: Partial<ModuleAccess>) {
    setPerms((p) => ({ ...p, modules: { ...p.modules, [id]: { ...p.modules[id], ...patch } } }));
  }
  function updateEntity(modId: string, entityId: string, patch: Partial<EntityAccess>) {
    setPerms((p) => {
      const mod = p.modules[modId] ?? { enabled: false };
      const entities = { ...(mod.entities ?? {}) };
      entities[entityId] = { ...defaultEntityAccess("none"), ...entities[entityId], ...patch };
      return { ...p, modules: { ...p.modules, [modId]: { ...mod, entities } } };
    });
  }
  function bulkScope(modId: string, entityId: string, scope: LeadScope) {
    updateEntity(modId, entityId, defaultEntityAccess(scope));
  }
  /** Aplica um escopo em TODAS as entidades do módulo de uma vez. */
  function bulkScopeModule(modId: string, scope: LeadScope) {
    const mod = matrix.find((m) => m.id === modId);
    if (!mod?.entities?.length) return;
    setPerms((p) => {
      const cur = p.modules[modId] ?? { enabled: false };
      const entities = { ...(cur.entities ?? {}) };
      for (const ent of mod.entities!) entities[ent.id] = defaultEntityAccess(scope);
      return { ...p, modules: { ...p.modules, [modId]: { ...cur, entities } } };
    });
  }

  function updateExtra(modId: string, extraId: string, v: boolean) {
    setPerms((p) => {
      const mod = p.modules[modId] ?? { enabled: false };
      return { ...p, modules: { ...p.modules, [modId]: { ...mod, extras: { ...(mod.extras ?? {}), [extraId]: v } } } };
    });
  }
  function togglePipeline(modId: string, pid: string) {
    setPerms((p) => {
      const mod = p.modules[modId] ?? { enabled: false };
      const cur = new Set(mod.pipelines ?? []);
      if (cur.has(pid)) cur.delete(pid); else cur.add(pid);
      return { ...p, modules: { ...p.modules, [modId]: { ...mod, pipelines: [...cur] } } };
    });
  }
  function toggleStage(modId: string, sid: string) {
    setPerms((p) => {
      const mod = p.modules[modId] ?? { enabled: false };
      const cur = new Set(mod.stages ?? []);
      if (cur.has(sid)) cur.delete(sid); else cur.add(sid);
      return { ...p, modules: { ...p.modules, [modId]: { ...mod, stages: [...cur] } } };
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl bg-card border border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center"><Shield className="w-4 h-4" /></div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate">Permissões · {userLabel}</h2>
              <p className="text-[11px] text-muted-foreground">
                Plano: <strong>{(ctxQ.data as any)?.plan?.name ?? "-"}</strong>, só aparecem os módulos liberados pelo plano.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Setor de trabalho */}
          <section className={`rounded-lg border px-4 py-3 space-y-2 ${sectorId ? "border-border bg-muted/20" : "border-amber-500/50 bg-amber-500/5"}`}>
            <div className="flex items-center gap-2 text-[11px] font-semibold">
              <Building2 className="w-3.5 h-3.5" /> Setor de trabalho <span className="text-destructive">*</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sectorId}
                onChange={(e) => handleSectorChange(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-md border border-border bg-background min-w-[220px]"
              >
                <option value="">{sectors.length ? "Selecione o setor…" : "Nenhum setor criado ainda"}</option>
                {sectors.map((s: any) => {
                  const tpl = templates.find((t: any) => t.sector_id === s.id);
                  return <option key={s.id} value={s.id}>{s.name}{tpl ? ` · modelo: ${tpl.name}` : ""}</option>;
                })}
              </select>

              <input
                value={newSector}
                onChange={(e) => setNewSector(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newSector.trim().length >= 2) { e.preventDefault(); mNewSector.mutate(newSector.trim()); } }}
                placeholder="Criar novo setor (ex.: Comercial)"
                className="text-xs px-2 py-1.5 rounded-md border border-border bg-background min-w-[220px]"
              />
              <button
                type="button"
                disabled={newSector.trim().length < 2 || mNewSector.isPending}
                onClick={() => mNewSector.mutate(newSector.trim())}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-60"
              >
                <Plus className="w-3.5 h-3.5" /> {mNewSector.isPending ? "Criando…" : "Criar setor"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              O usuário só enxerga os fluxos de trabalho do setor dele. É obrigatório definir um setor antes de salvar.
            </p>
          </section>

          {/* Modelos de permissão reutilizáveis */}

          <section className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold">
              <Copy className="w-3.5 h-3.5" /> Modelos de permissão
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value=""
                onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); }}
                className="text-xs px-2 py-1.5 rounded-md border border-border bg-background min-w-[200px]"
              >
                <option value="">
                  {templates.length ? "Aplicar um modelo salvo…" : "Nenhum modelo salvo ainda"}
                </option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => handleSaveTemplate(false)}
                disabled={mTplSave.isPending}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                {mTplSave.isPending ? "Salvando…" : "Salvar como modelo"}
              </button>
              <button
                type="button"
                onClick={() => handleSaveTemplate(true)}
                disabled={!sectorId || mTplSave.isPending}
                title={!sectorId ? "Escolha um setor primeiro" : "Todo novo usuário deste setor já nasce com estas permissões"}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <Building2 className="w-3.5 h-3.5" /> Salvar como padrão do setor
              </button>
              {templates.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) handleDeleteTemplate(e.target.value); }}
                  className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-muted-foreground"
                >
                  <option value="">Excluir modelo…</option>
                  {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {sectorTemplate
                ? `O setor selecionado usa o modelo "${sectorTemplate.name}" — ele é aplicado sozinho em cada novo usuário do setor.`
                : "Configure uma vez, salve como modelo (ou como padrão do setor) e os próximos usuários já entram com tudo pronto."}
            </p>
          </section>


          {ctxQ.isLoading && <div className="text-sm text-muted-foreground py-8 text-center">Carregando…</div>}


          {!ctxQ.isLoading && matrix.map((mod) => {
            const acc = perms.modules[mod.id] ?? { enabled: false };
            const modStages = stages.filter((s) => !acc.pipelines?.length || acc.pipelines?.includes(s.pipeline_id));

            return (
              <section key={mod.id} className={`rounded-lg border ${acc.enabled ? "border-primary/40 bg-primary/[0.02]" : "border-border"}`}>
                <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60">
                  <div>
                    <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">{mod.tag}</div>
                    <div className="text-sm font-semibold">{mod.label}</div>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-muted-foreground">{acc.enabled ? "Acesso liberado" : "Sem acesso"}</span>
                    <input type="checkbox" checked={acc.enabled}
                      onChange={(e) => updateModule(mod.id, { enabled: e.target.checked })}
                      className="h-4 w-8 appearance-none rounded-full bg-muted checked:bg-primary relative cursor-pointer transition
                        before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:h-3 before:w-3 before:rounded-full before:bg-background before:transition
                        checked:before:translate-x-4" />
                  </label>
                </header>

                {acc.enabled && (
                  <div className="px-4 py-4 space-y-4">
                    {/* Matriz CRUD por entidade */}
                    {mod.entities && mod.entities.length > 0 && (
                      <div className="overflow-x-auto -mx-4 px-4">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              <th className="text-left py-1.5 pr-3 font-semibold">Entidade</th>
                              {ACTIONS.map((a) => <th key={a.key} className="py-1.5 px-1 font-semibold text-center">{a.label}</th>)}
                              <th className="py-1.5 pl-3 font-semibold text-right whitespace-nowrap">Aplicar em massa</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            <tr className="bg-muted/40">
                              <td className="py-2 pr-3 text-[10px] uppercase tracking-wider text-muted-foreground" colSpan={1 + ACTIONS.length}>
                                Todas as entidades deste módulo
                              </td>
                              <td className="py-2 pl-3">
                                <div className="flex justify-end gap-1">
                                  {SCOPES.map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => bulkScopeModule(mod.id, s)}
                                      title={`Aplicar "${LEAD_SCOPE_LABEL[s]}" em todas as entidades`}
                                      className={`h-5 w-5 rounded-full border border-border/70 transition hover:scale-110 ${SCOPE_DOT[s]}`}
                                    />
                                  ))}
                                </div>
                              </td>
                            </tr>
                            {mod.entities.map((ent) => {
                              const ea = acc.entities?.[ent.id] ?? defaultEntityAccess("none");
                              return (
                                <tr key={ent.id}>
                                  <td className="py-2 pr-3 font-medium">{ent.label}</td>
                                  {ACTIONS.map((a) => {
                                    const val = ea[a.key];
                                    return (
                                      <td key={a.key} className="py-1.5 px-1 text-center">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const idx = SCOPES.indexOf(val);
                                            const next = SCOPES[(idx + 1) % SCOPES.length];
                                            updateEntity(mod.id, ent.id, { [a.key]: next } as any);
                                          }}
                                          title={LEAD_SCOPE_LABEL[val]}
                                          className={`h-6 w-6 rounded-full border border-border grid place-items-center transition hover:scale-110 ${SCOPE_DOT[val]}`}
                                        >
                                          {val === "all" && <Check className="w-3 h-3 text-white" />}
                                          {val === "none" && <Lock className="w-3 h-3 text-white" />}
                                        </button>
                                      </td>
                                    );
                                  })}
                                  <td className="py-2 pl-3">
                                    <div className="flex justify-end gap-1">
                                      {SCOPES.map((s) => {
                                        const active = ACTIONS.every((a) => ea[a.key] === s);
                                        return (
                                          <button
                                            key={s}
                                            type="button"
                                            onClick={() => bulkScope(mod.id, ent.id, s)}
                                            title={`Aplicar "${LEAD_SCOPE_LABEL[s]}" em ${ent.label}`}
                                            className={`h-5 w-5 rounded-full border transition hover:scale-110 ${SCOPE_DOT[s]} ${active ? "ring-2 ring-offset-1 ring-offset-background ring-primary border-transparent" : "border-border/70"}`}
                                          />
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                          </tbody>
                        </table>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" />Negado</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Se responsável</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" />Da equipe</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Tudo</span>
                          <span className="ml-auto">Clique nos círculos pra ciclar.</span>
                        </div>
                      </div>
                    )}

                    {/* Pipelines / etapas */}
                    {mod.hasPipelines && (
                      <div className={`rounded-md border p-3 ${(acc.pipelines?.length ?? 0) === 0 ? "border-amber-500/50 bg-amber-500/5" : "border-border/60 bg-background"}`}>
                        <div className="text-[11px] font-semibold flex items-center gap-1.5 mb-2"><Filter className="w-3 h-3" />Funis que este usuário pode ver</div>
                        {pipelines.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">Nenhum funil cadastrado ainda.</div>
                        ) : (
                          <>
                            <div className="space-y-2.5 mb-3">
                              {pipelineGroups.map((g) => (
                                <div key={g.key}>
                                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{g.label}</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {g.items.map((p: any) => {
                                      const on = acc.pipelines?.includes(p.id);
                                      return (
                                        <button key={p.id} onClick={() => togglePipeline(mod.id, p.id)}
                                          title={`Funil "${p.name}" · ${g.label}`}
                                          className={`text-[11px] px-2 py-1 rounded-full border transition ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                                          {on ? "✓ " : ""}{p.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {(acc.pipelines?.length ?? 0) > 0 && modStages.length > 0 && (
                              <>
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Etapas permitidas <span className="opacity-70">(vazio = todas as etapas dos funis acima)</span></div>
                                <div className="flex flex-wrap gap-1">
                                  {modStages.map((s) => {
                                    const on = acc.stages?.includes(s.id);
                                    return (
                                      <button key={s.id} onClick={() => toggleStage(mod.id, s.id)}
                                        className={`text-[10px] px-1.5 py-0.5 rounded border transition ${on ? "bg-primary/10 text-primary border-primary/40" : "border-border/60 hover:bg-muted"}`}>
                                        {s.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                            <p className="text-[10px] mt-2 text-muted-foreground">
                              {(acc.pipelines?.length ?? 0) === 0
                                ? "Nenhum funil marcado: o usuário não verá nenhum lead deste módulo. Marque exatamente os funis que ele pode acompanhar."
                                : `O usuário verá apenas ${acc.pipelines?.length} funil(is) marcado(s) — os demais ficam invisíveis pra ele.`}
                            </p>
                          </>
                        )}
                      </div>
                    )}


                    {/* Extras */}
                    {mod.extras && mod.extras.length > 0 && (
                      <div className="space-y-1.5">
                        {mod.extras.map((x) => (
                          <label key={x.id} className="flex items-start gap-2 text-xs cursor-pointer">
                            <input type="checkbox"
                              checked={!!acc.extras?.[x.id]}
                              onChange={(e) => updateExtra(mod.id, x.id, e.target.checked)}
                              className="mt-0.5" />
                            <span>
                              <span className="font-medium">{x.label}</span>
                              {x.desc && <span className="block text-[10px] text-muted-foreground">{x.desc}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {!ctxQ.isLoading && matrix.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
              O plano atual não libera módulos configuráveis. Faça upgrade para liberar mais permissões.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/30">
          <span className="text-[11px] text-muted-foreground">Alterações valem imediatamente após salvar.</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted">Cancelar</button>
            <button onClick={() => mSave.mutate()} disabled={mSave.isPending}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              <Save className="w-3.5 h-3.5" />{mSave.isPending ? "Salvando…" : "Salvar permissões"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
