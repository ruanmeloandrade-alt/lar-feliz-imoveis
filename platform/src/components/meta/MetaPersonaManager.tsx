import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  listPersonas, upsertPersona, deletePersona,
  searchMetaDetailedTargeting, searchMetaGeoLocations, listPersonaAssets,
} from "@/lib/meta-personas.functions";
import { MapLocationSelector, type MapPin } from "@/components/meta/MapLocationSelector";

type DetailedItem = { id: string; name: string; type?: string; path?: string[] };
type LocationItem = { key: string; name: string; type?: string; country_code?: string };
type CopyTemplate = { id: string; label: string; headline: string; primary_text: string; description: string; cta: string };
type Persona = {
  id: string;
  name: string;
  description: string | null;
  ad_account_id: string;
  linked_page_ids: string[];
  linked_ig_ids: string[];
  linked_wa_ids: string[];
  detailed_targeting: DetailedItem[];
  demographics: { age_min?: number; age_max?: number; genders?: number[] };
  locations: LocationItem[];
  map_pins: MapPin[];
  copy_templates: CopyTemplate[];
  default_objective: string | null;
};


const CTA_OPTIONS = ["SAIBA_MAIS", "COMPRE_AGORA", "CADASTRE_SE", "FALE_CONOSCO", "ENVIAR_MENSAGEM", "RESERVE_AGORA", "BAIXAR"];

const EMPTY: Omit<Persona, "id"> = {
  name: "", description: "", ad_account_id: "",
  linked_page_ids: [], linked_ig_ids: [], linked_wa_ids: [],
  detailed_targeting: [], demographics: { age_min: 18, age_max: 65, genders: [] }, locations: [],
  map_pins: [], copy_templates: [], default_objective: null,
};

export function MetaPersonaManager({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPersonas);
  const upsertFn = useServerFn(upsertPersona);
  const deleteFn = useServerFn(deletePersona);
  const assetsFn = useServerFn(listPersonaAssets);
  const targetFn = useServerFn(searchMetaDetailedTargeting);
  const geoFn = useServerFn(searchMetaGeoLocations);

  const [editing, setEditing] = useState<Persona | null>(null);
  const [form, setForm] = useState<Omit<Persona, "id">>(EMPTY);

  const personasQ = useQuery({
    queryKey: ["meta-personas", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
  });
  const assetsQ = useQuery({
    queryKey: ["meta-persona-assets", workspaceId],
    queryFn: () => assetsFn({ data: { workspaceId } }),
  });

  const [targetingQ, setTargetingQ] = useState("");
  const [targetingResults, setTargetingResults] = useState<DetailedItem[]>([]);
  const [searchingTargeting, setSearchingTargeting] = useState(false);
  const [geoQ, setGeoQ] = useState("");
  const [geoResults, setGeoResults] = useState<LocationItem[]>([]);
  const [searchingGeo, setSearchingGeo] = useState(false);

  const personas = ((personasQ.data ?? []) as unknown) as Persona[];
  const assets = assetsQ.data;

  function startEdit(p: Persona | null) {
    if (!p) { setEditing(null); setForm(EMPTY); return; }
    setEditing(p);
    setForm({
      name: p.name, description: p.description ?? "",
      ad_account_id: p.ad_account_id,
      linked_page_ids: p.linked_page_ids ?? [],
      linked_ig_ids: p.linked_ig_ids ?? [],
      linked_wa_ids: p.linked_wa_ids ?? [],
      detailed_targeting: p.detailed_targeting ?? [],
      demographics: p.demographics ?? { age_min: 18, age_max: 65, genders: [] },
      locations: p.locations ?? [],
      map_pins: p.map_pins ?? [],
      copy_templates: p.copy_templates ?? [],
      default_objective: p.default_objective ?? null,
    });
  }

  const doSearchTargeting = async () => {
    if (!targetingQ.trim()) return;
    setSearchingTargeting(true);
    try {
      const r = await targetFn({ data: { workspaceId, q: targetingQ.trim() } });
      setTargetingResults(r.items);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro na busca"); }
    finally { setSearchingTargeting(false); }
  };
  const doSearchGeo = async () => {
    if (!geoQ.trim()) return;
    setSearchingGeo(true);
    try {
      const r = await geoFn({ data: { workspaceId, q: geoQ.trim() } });
      setGeoResults(r.items);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro na busca"); }
    finally { setSearchingGeo(false); }
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Nome é obrigatório");
      if (!form.ad_account_id) throw new Error("Selecione a conta de anúncio");
      if (!form.description || !form.description.trim()) throw new Error("O contexto é obrigatório, descreva a empresa/produto para o Chat Marketing");
      return upsertFn({
        data: {
          workspaceId, id: editing?.id,
          name: form.name.trim(), description: (form.description ?? "").trim(),
          adAccountId: form.ad_account_id,
          linkedPageIds: form.linked_page_ids,
          linkedIgIds: form.linked_ig_ids,
          linkedWaIds: form.linked_wa_ids,
          detailedTargeting: form.detailed_targeting,
          demographics: form.demographics,
          locations: form.locations,
          mapPins: form.map_pins,
          copyTemplates: form.copy_templates,
          defaultObjective: form.default_objective,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Persona atualizada" : "Persona criada");
      qc.invalidateQueries({ queryKey: ["meta-personas", workspaceId] });
      startEdit(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { workspaceId, id } }),
    onSuccess: () => {
      toast.success("Persona removida");
      qc.invalidateQueries({ queryKey: ["meta-personas", workspaceId] });
      startEdit(null);
    },
  });

  function toggleInArray<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  const genderLabels: Record<number, string> = { 1: "Homens", 2: "Mulheres" };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
      {/* Sidebar */}
      <div className="rounded-xl border border-border bg-card p-3 flex flex-col min-h-[500px]">
        <Button size="sm" onClick={() => startEdit(null)} className="mb-2 justify-start" variant="secondary">
          <Plus className="w-4 h-4 mr-1" /> Nova persona
        </Button>
        <div className="overflow-y-auto space-y-1 flex-1">
          {personasQ.isLoading && <div className="text-xs text-muted-foreground p-2">Carregando…</div>}
          {personas.map((p) => (
            <button
              key={p.id}
              onClick={() => startEdit(p)}
              className={cn(
                "w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-muted transition",
                editing?.id === p.id && "bg-muted",
              )}
            >
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {(assets?.adAccounts ?? []).find((a) => a.id === p.ad_account_id)?.name ?? p.ad_account_id}
              </div>
            </button>
          ))}
          {!personasQ.isLoading && personas.length === 0 && (
            <div className="text-xs text-muted-foreground p-2">Nenhuma persona ainda.</div>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 md:col-span-1">
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Mães 25-40 SP" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label>Conta de anúncio</Label>
            <Select value={form.ad_account_id} onValueChange={(v) => setForm({ ...form, ad_account_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione uma conta" /></SelectTrigger>
              <SelectContent>
                {(assets?.adAccounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Contexto da empresa/produto <span className="text-destructive">*</span></Label>
            <Textarea
              rows={5}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descreva o que a empresa vende, o público-alvo, dores que resolve, diferenciais, ticket médio, tom de voz e objeções comuns. Esse contexto é enviado ao Chat Marketing para gerar anúncios com a linguagem certa."
            />
            <p className="text-[11px] text-muted-foreground mt-1">Obrigatório. O Chat Marketing usa esse texto para escrever copy, escolher direcionamento e responder pelo tom da marca.</p>
          </div>
        </div>



        <Card className="p-3 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demografia</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Idade mín.</Label>
              <Input type="number" min={13} max={65} value={form.demographics.age_min ?? 18} onChange={(e) => setForm({ ...form, demographics: { ...form.demographics, age_min: Number(e.target.value) } })} />
            </div>
            <div>
              <Label className="text-xs">Idade máx.</Label>
              <Input type="number" min={13} max={65} value={form.demographics.age_max ?? 65} onChange={(e) => setForm({ ...form, demographics: { ...form.demographics, age_max: Number(e.target.value) } })} />
            </div>
            <div>
              <Label className="text-xs">Gênero</Label>
              <div className="flex gap-1 mt-1">
                {[0, 1, 2].map((g) => {
                  const active = (form.demographics.genders ?? []).length === 0 ? g === 0 : (form.demographics.genders ?? []).includes(g);
                  return (
                    <button key={g} type="button"
                      onClick={() => setForm({ ...form, demographics: { ...form.demographics, genders: g === 0 ? [] : [g] } })}
                      className={cn("px-2 py-1 rounded text-xs border", active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}>
                      {g === 0 ? "Todos" : genderLabels[g]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Direcionamento detalhado</div>
          <div className="flex gap-2">
            <Input placeholder="Ex: fitness, empreendedorismo, cozinha…" value={targetingQ}
              onChange={(e) => setTargetingQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), doSearchTargeting())} />
            <Button size="sm" onClick={doSearchTargeting} disabled={searchingTargeting}>
              {searchingTargeting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {targetingResults.length > 0 && (
            <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
              {targetingResults.map((it) => {
                const already = form.detailed_targeting.some((x) => x.id === it.id);
                return (
                  <button key={it.id} type="button" disabled={already}
                    onClick={() => setForm({ ...form, detailed_targeting: [...form.detailed_targeting, it] })}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50 flex items-center justify-between">
                    <span>
                      <span className="font-medium">{it.name}</span>
                      {it.path && it.path.length > 0 && <span className="text-[10px] text-muted-foreground ml-1">· {it.path.join(" › ")}</span>}
                    </span>
                    {already && <Badge variant="secondary" className="text-[9px]">adicionado</Badge>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {form.detailed_targeting.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1 pr-1">
                {t.name}
                <button onClick={() => setForm({ ...form, detailed_targeting: form.detailed_targeting.filter((x) => x.id !== t.id) })} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            {form.detailed_targeting.length === 0 && <span className="text-xs text-muted-foreground">Nenhum interesse selecionado.</span>}
          </div>
        </Card>

        <Card className="p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Localizações</div>
          <div className="flex gap-2">
            <Input placeholder="Ex: São Paulo, Brasil…" value={geoQ}
              onChange={(e) => setGeoQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), doSearchGeo())} />
            <Button size="sm" onClick={doSearchGeo} disabled={searchingGeo}>
              {searchingGeo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {geoResults.length > 0 && (
            <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
              {geoResults.map((it) => {
                const already = form.locations.some((x) => x.key === it.key);
                return (
                  <button key={it.key} type="button" disabled={already}
                    onClick={() => setForm({ ...form, locations: [...form.locations, it] })}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50 flex items-center justify-between">
                    <span>
                      <span className="font-medium">{it.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">· {it.type}</span>
                    </span>
                    {already && <Badge variant="secondary" className="text-[9px]">adicionado</Badge>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {form.locations.map((t) => (
              <Badge key={t.key} variant="secondary" className="gap-1 pr-1">
                {t.name}
                <button onClick={() => setForm({ ...form, locations: form.locations.filter((x) => x.key !== t.key) })} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            {form.locations.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma localização selecionada.</span>}
          </div>

          <div className="pt-2 border-t mt-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Localização no mapa (raio personalizado)</div>
            <p className="text-[11px] text-muted-foreground mb-2">Clique no mapa ou pesquise um endereço para marcar até 20 pinos com raio de 1 a 80 km. Alternativa ao campo acima quando você precisa mirar em um bairro/CEP específico.</p>
            <MapLocationSelector pins={form.map_pins} onChange={(p) => setForm({ ...form, map_pins: p })} />
          </div>
        </Card>

        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modelos de anúncio</div>
            <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, copy_templates: [...form.copy_templates, { id: crypto.randomUUID(), label: "", headline: "", primary_text: "", description: "", cta: "SAIBA_MAIS" }] })}>
              <Plus className="w-4 h-4 mr-1" /> Novo modelo
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Salve variações prontas de título, texto principal, descrição e call-to-action. O Chat Marketing usa esses modelos ao criar anúncios para esta persona.</p>
          {form.copy_templates.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">Nenhum modelo cadastrado.</div>
          )}
          <div className="space-y-3">
            {form.copy_templates.map((tpl, idx) => (
              <div key={tpl.id} className="border rounded-md p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={`Modelo ${idx + 1} (ex: Promoção, Prova social...)`}
                    value={tpl.label}
                    onChange={(e) => setForm({ ...form, copy_templates: form.copy_templates.map((x) => x.id === tpl.id ? { ...x, label: e.target.value } : x) })}
                    className="flex-1"
                  />
                  <Select value={tpl.cta || "SAIBA_MAIS"} onValueChange={(v) => setForm({ ...form, copy_templates: form.copy_templates.map((x) => x.id === tpl.id ? { ...x, cta: v } : x) })}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CTA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c.replaceAll("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => setForm({ ...form, copy_templates: form.copy_templates.filter((x) => x.id !== tpl.id) })}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <div>
                  <Label className="text-xs">Título (headline)</Label>
                  <Input maxLength={255} value={tpl.headline} onChange={(e) => setForm({ ...form, copy_templates: form.copy_templates.map((x) => x.id === tpl.id ? { ...x, headline: e.target.value } : x) })} placeholder="Ex: Emagreça em 30 dias com acompanhamento" />
                </div>
                <div>
                  <Label className="text-xs">Texto principal</Label>
                  <Textarea rows={3} value={tpl.primary_text} onChange={(e) => setForm({ ...form, copy_templates: form.copy_templates.map((x) => x.id === tpl.id ? { ...x, primary_text: e.target.value } : x) })} placeholder="O corpo do anúncio: dor, benefício, prova social, CTA." />
                </div>
                <div>
                  <Label className="text-xs">Descrição (link description)</Label>
                  <Input maxLength={500} value={tpl.description} onChange={(e) => setForm({ ...form, copy_templates: form.copy_templates.map((x) => x.id === tpl.id ? { ...x, description: e.target.value } : x) })} placeholder="Linha curta que aparece abaixo do título." />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <div>
            {editing && (
              <Button variant="destructive" size="sm" onClick={() => confirm("Remover esta persona?") && delMut.mutate(editing.id)}>
                <Trash2 className="w-4 h-4 mr-1" /> Remover
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => startEdit(null)}>Limpar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editing ? "Salvar alterações" : "Criar persona"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiPicker({ label, options, selected, onToggle }: {
  label: string;
  options: Array<{ id: string; name: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="border rounded-md max-h-32 overflow-y-auto mt-1">
        {options.length === 0 && <div className="p-2 text-[11px] text-muted-foreground">Nenhum disponível.</div>}
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted cursor-pointer">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} />
            <span className="truncate">{o.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
