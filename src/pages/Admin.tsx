import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogOut, Plus, Pencil, Trash2, Loader2, Home, ImagePlus, X, MapPin, BedDouble, Bath, Play, Building2, Users, Calendar as CalendarIcon, FileText, FilePlus } from "lucide-react";
import { isVideoUrl, fileNameFromUrl } from "@/lib/media";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRAND } from "@/lib/brand";
import { LeadsList, LeadsCalendar } from "@/components/admin/LeadsPanel";

type PropertyPlan = { name: string; area_m2: number | null };
type ConstructionStatus = "na_planta" | "pronto";

type Property = {
  id: string;
  title: string;
  city: string;
  address: string | null;
  description: string | null;
  price: number | null;
  subsidy_estimate: number | null;
  monthly_parcel: number | null;
  down_payment: number | null;
  show_parcel: boolean;
  show_down_payment: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  tag: string | null;
  images: string[];
  pdfs: string[];
  plans: PropertyPlan[];
  construction_status: ConstructionStatus;
  launch_date: string | null;
  published: boolean;
};

const emptyForm: Omit<Property, "id"> = {
  title: "", city: "", address: "", description: "",
  price: null, subsidy_estimate: null, monthly_parcel: null,
  down_payment: null, show_parcel: true, show_down_payment: false,
  bedrooms: 2, bathrooms: 1, area_m2: null,
  tag: "Enquadrado MCMV", images: [], pdfs: [], plans: [],
  construction_status: "pronto", launch_date: null,
  published: true,
};

// Formata número como moeda BRL sem centavos: 219000 → "219.000"
const formatBRL = (n: number | null) =>
  n == null ? "" : Math.round(n).toLocaleString("pt-BR");
// Converte string digitada (apenas dígitos) em número
const parseBRL = (s: string): number | null => {
  const digits = s.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : null;
};

const MoneyInput = ({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) => (
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none">R$</span>
    <Input
      type="text"
      inputMode="numeric"
      className="pl-10"
      value={formatBRL(value)}
      onChange={(e) => onChange(parseBRL(e.target.value))}
      placeholder={placeholder}
    />
  </div>
);


const Admin = () => {
  const nav = useNavigate();
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const [list, setList] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<{ open: boolean; edit: Property | null }>({ open: false, edit: null });
  const [form, setForm] = useState<Omit<Property, "id">>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav("/login", { replace: true }); return; }
    if (!isAdmin) {
      toast.error("Você não tem permissão de administrador.");
      nav("/", { replace: true });
      return;
    }
    fetchList();
  }, [user, isAdmin, authLoading, nav]);

  const fetchList = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setList((data ?? []) as unknown as Property[]);
    setLoading(false);
  };

  const openNew = () => {
    setForm(emptyForm);
    setDlg({ open: true, edit: null });
  };

  const openEdit = (p: Property) => {
    setForm({ ...p, plans: Array.isArray(p.plans) ? p.plans : [] });
    setDlg({ open: true, edit: p });
  };

  const addPlan = () =>
    setForm((f) => ({ ...f, plans: [...(f.plans ?? []), { name: "", area_m2: null }] }));
  const updatePlan = (i: number, patch: Partial<PropertyPlan>) =>
    setForm((f) => ({ ...f, plans: (f.plans ?? []).map((p, idx) => (idx === i ? { ...p, ...patch } : p)) }));
  const removePlan = (i: number) =>
    setForm((f) => ({ ...f, plans: (f.plans ?? []).filter((_, idx) => idx !== i) }));

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      const path = `${user!.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { error } = await supabase.storage.from("property-images").upload(path, f, { upsert: false });
      if (error) { toast.error(`Erro upload: ${error.message}`); continue; }
      const { data } = await supabase.storage.from("property-images").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (data?.signedUrl) urls.push(data.signedUrl);
    }
    setForm((f) => ({ ...f, images: [...f.images, ...urls] }));
    setUploading(false);
    toast.success(`${urls.length} arquivo(s) enviado(s).`);
  };

  const uploadPdf = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPdf(true);
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      if (!/\.pdf$/i.test(f.name)) { toast.error(`${f.name} não é um PDF.`); continue; }
      const path = `${user!.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { error } = await supabase.storage.from("property-pdfs").upload(path, f, { upsert: false, contentType: "application/pdf" });
      if (error) { toast.error(`Erro upload: ${error.message}`); continue; }
      const { data } = await supabase.storage.from("property-pdfs").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (data?.signedUrl) urls.push(data.signedUrl);
    }
    setForm((f) => ({ ...f, pdfs: [...(f.pdfs ?? []), ...urls] }));
    setUploadingPdf(false);
    if (urls.length > 0) toast.success(`${urls.length} PDF(s) enviado(s).`);
  };

  const removePdf = (i: number) =>
    setForm((f) => ({ ...f, pdfs: (f.pdfs ?? []).filter((_, idx) => idx !== i) }));

  const removeImage = (i: number) =>
    setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.title.trim() || !form.city.trim()) {
      toast.error("Preencha ao menos título e cidade.");
      return;
    }
    setSaving(true);
    const payload = { ...form, created_by: user!.id } as never;
    const { error } = dlg.edit
      ? await supabase.from("properties").update(payload).eq("id", dlg.edit.id)
      : await supabase.from("properties").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(dlg.edit ? "Imóvel atualizado." : "Imóvel cadastrado.");
    setDlg({ open: false, edit: null });
    fetchList();
  };

  const remove = async (p: Property) => {
    if (!confirm(`Excluir "${p.title}"?`)) return;
    const { error } = await supabase.from("properties").delete().eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído."); fetchList(); }
  };

  const money = (v: number | null) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  if (authLoading || (!user && !authLoading)) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="divider-sp" />
      <header className="bg-background border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-heading font-bold">V</div>
            <div className="leading-tight">
              <div className="font-heading font-bold text-foreground">Painel Admin</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Cadastro de imóveis</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/"><Button variant="ghost" size="sm"><Home className="w-4 h-4" /> Site</Button></Link>
            <Button variant="outline" size="sm" onClick={signOut}><LogOut className="w-4 h-4" /> Sair</Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <Tabs defaultValue="imoveis" className="w-full">
          <TabsList className="mb-6 grid grid-cols-3 max-w-xl">
            <TabsTrigger value="imoveis" className="gap-1.5"><Building2 className="w-4 h-4" /> Imóveis</TabsTrigger>
            <TabsTrigger value="fichas" className="gap-1.5"><Users className="w-4 h-4" /> Ficha do Cliente</TabsTrigger>
            <TabsTrigger value="calendario" className="gap-1.5"><CalendarIcon className="w-4 h-4" /> Calendário</TabsTrigger>
          </TabsList>

          <TabsContent value="imoveis">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Meus imóveis</h1>
                <p className="text-sm text-muted-foreground">{list.length} cadastrado{list.length !== 1 ? "s" : ""}</p>
              </div>
              <Button onClick={openNew} size="lg"><Plus className="w-4 h-4" /> Novo imóvel</Button>
            </div>

            {loading ? (
              <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : list.length === 0 ? (
              <div className="bg-card rounded-xl border border-dashed border-border p-12 text-center">
                <p className="text-muted-foreground mb-4">Nenhum imóvel cadastrado ainda.</p>
                <Button onClick={openNew}><Plus className="w-4 h-4" /> Cadastrar primeiro imóvel</Button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {list.map((p) => (
                  <div key={p.id} className="bg-card rounded-lg border border-border overflow-hidden shadow-card">
                    <div className="relative aspect-[4/3] bg-muted">
                      {p.images[0] ? (
                        isVideoUrl(p.images[0]) ? (
                          <>
                            <video src={p.images[0]} className="w-full h-full object-cover" muted preload="metadata" />
                            <div className="absolute inset-0 flex items-center justify-center bg-foreground/30">
                              <Play className="w-10 h-10 text-background" />
                            </div>
                          </>
                        ) : (
                          <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <ImagePlus className="w-10 h-10" />
                        </div>
                      )}
                      {!p.published && (
                        <span className="absolute top-2 right-2 bg-muted-foreground text-background text-[10px] px-2 py-0.5 rounded uppercase font-bold">Rascunho</span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-heading font-bold text-foreground">{p.title}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{p.city}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />{p.bedrooms}</span>
                        <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{p.bathrooms}</span>
                        {p.area_m2 && <span>{p.area_m2}m²</span>}
                      </div>
                      <p className="font-heading font-bold text-primary mt-2">{money(p.price)}</p>
                      <p className="text-xs text-accent font-semibold">Parcela {money(p.monthly_parcel)}</p>
                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(p)}><Pencil className="w-3 h-3" /> Editar</Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(p)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="fichas">
            <LeadsList />
          </TabsContent>

          <TabsContent value="calendario">
            <LeadsCalendar />
          </TabsContent>
        </Tabs>
      </main>


      <Dialog open={dlg.open} onOpenChange={(o) => setDlg({ open: o, edit: dlg.edit })}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {dlg.edit ? "Editar imóvel" : "Novo imóvel"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Fotos e vídeos</Label>
              <p className="text-[11px] text-muted-foreground mb-2">Envie quantos arquivos quiser. Formatos: JPG, PNG, WEBP, MP4, MOV, WEBM.</p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {form.images.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded overflow-hidden border bg-muted">
                    {isVideoUrl(url) ? (
                      <>
                        <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
                        <div className="absolute inset-0 flex items-center justify-center bg-foreground/30 pointer-events-none">
                          <Play className="w-6 h-6 text-background" />
                        </div>
                      </>
                    ) : (
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    )}
                    <button type="button" onClick={() => removeImage(i)} className="absolute top-1 right-1 bg-background/90 rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground transition">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <label className="aspect-square border-2 border-dashed border-border rounded flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition">
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ImagePlus className="w-5 h-5 text-muted-foreground" /><span className="text-[10px] text-muted-foreground mt-1">Adicionar</span></>}
                  <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => upload(e.target.files)} />
                </label>
              </div>
            </div>

            <div>
              <Label>PDFs informativos do empreendimento</Label>
              <p className="text-[11px] text-muted-foreground mb-2">Envie um ou mais PDFs. Aparecerão como um modo de visualização no card do imóvel.</p>
              <div className="space-y-2 mb-2">
                {(form.pdfs ?? []).map((url, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded border border-border">
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-foreground truncate flex-1 hover:underline">
                      {fileNameFromUrl(url)}
                    </a>
                    <button type="button" onClick={() => removePdf(i)} className="text-muted-foreground hover:text-destructive transition p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded p-3 cursor-pointer hover:border-primary hover:bg-primary/5 transition text-sm text-muted-foreground">
                {uploadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FilePlus className="w-4 h-4" /> Adicionar PDF</>}
                <input type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => uploadPdf(e.target.files)} />
              </label>
            </div>




            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} />
              </div>
              <div>
                <Label>Cidade *</Label>
                <Select value={form.city || undefined} onValueChange={(v) => setForm({ ...form, city: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a cidade" /></SelectTrigger>
                  <SelectContent>
                    {BRAND.cities.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Etiqueta</Label>
                <Input value={form.tag ?? ""} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="Enquadrado MCMV" maxLength={40} />
              </div>
              <div className="col-span-2">
                <Label>Endereço</Label>
                <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={200} />
              </div>
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Textarea rows={4} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1500} />
              </div>
              <div>
                <Label>Valor do imóvel</Label>
                <MoneyInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} placeholder="219.000" />
                <p className="text-[10px] text-muted-foreground mt-1">Digite o valor cheio, ex: 219000 → R$ 219.000</p>
              </div>
              <div>
                <Label>Subsídio estimado</Label>
                <MoneyInput value={form.subsidy_estimate} onChange={(v) => setForm({ ...form, subsidy_estimate: v })} placeholder="25.000" />
              </div>
              <div>
                <Label>Parcela mensal</Label>
                <MoneyInput value={form.monthly_parcel} onChange={(v) => setForm({ ...form, monthly_parcel: v })} placeholder="990" />
              </div>
              <div>
                <Label>Renda mínima</Label>
                <MoneyInput value={form.down_payment} onChange={(v) => setForm({ ...form, down_payment: v })} placeholder="2.640" />
              </div>

              <div className="col-span-2 p-3 bg-muted/50 rounded-lg border border-border space-y-2">
                <Label className="block mb-1">Exibição no card do imóvel</Label>
                <p className="text-[11px] text-muted-foreground mb-2">Escolha o que aparece em destaque para o visitante. Você pode mostrar os dois, apenas um, ou nenhum.</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.show_parcel}
                    onChange={(e) => setForm({ ...form, show_parcel: e.target.checked })}
                  />
                  Mostrar <strong>Parcela mensal</strong> {form.monthly_parcel ? `(${money(form.monthly_parcel)}/mês)` : ""}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.show_down_payment}
                    onChange={(e) => setForm({ ...form, show_down_payment: e.target.checked })}
                  />
                  Mostrar <strong>Renda mínima</strong> {form.down_payment ? `(${money(form.down_payment)})` : ""}
                </label>
              </div>


              <div>
                <Label>Área principal (m²)</Label>
                <Input type="number" value={form.area_m2 ?? ""} onChange={(e) => setForm({ ...form, area_m2: e.target.value ? +e.target.value : null })} placeholder="42" />
                <p className="text-[10px] text-muted-foreground mt-1">Use "Plantas" abaixo para variações.</p>
              </div>
              <div>
                <Label>Dormitórios</Label>
                <Input type="number" value={form.bedrooms ?? 0} onChange={(e) => setForm({ ...form, bedrooms: +e.target.value })} />
              </div>
              <div>
                <Label>Banheiros</Label>
                <Input type="number" value={form.bathrooms ?? 0} onChange={(e) => setForm({ ...form, bathrooms: +e.target.value })} />
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                <div className="col-span-2">
                  <Label>Status do imóvel</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, construction_status: "pronto", launch_date: null })}
                      className={`px-3 py-2 rounded-md text-sm font-semibold border transition ${form.construction_status === "pronto" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/40"}`}
                    >
                      Pronto para morar
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, construction_status: "na_planta" })}
                      className={`px-3 py-2 rounded-md text-sm font-semibold border transition ${form.construction_status === "na_planta" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/40"}`}
                    >
                      Na planta / lançamento
                    </button>
                  </div>
                </div>
                {form.construction_status === "na_planta" && (
                  <div className="col-span-2">
                    <Label>Data de lançamento / entrega</Label>
                    <Input
                      type="date"
                      value={form.launch_date ?? ""}
                      onChange={(e) => setForm({ ...form, launch_date: e.target.value || null })}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Aparecerá no card como "Lançamento em ...".</p>
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <Label>Plantas / opções de metragem</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addPlan}>
                    <Plus className="w-3 h-3" /> Adicionar planta
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Cadastre variações do empreendimento (ex.: "Planta 1", "Cobertura", "Térreo"). Aparecerão como opções no card do imóvel.
                </p>
                {(form.plans ?? []).length === 0 ? (
                  <div className="border border-dashed border-border rounded p-3 text-center text-xs text-muted-foreground">
                    Nenhuma planta adicional. Use este campo se o empreendimento tiver mais de uma metragem.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(form.plans ?? []).map((plan, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded border border-border">
                        <Input
                          value={plan.name}
                          onChange={(e) => updatePlan(i, { name: e.target.value })}
                          placeholder="Nome (ex: Planta 1)"
                          maxLength={40}
                          className="flex-1 bg-background"
                        />
                        <Input
                          type="number"
                          value={plan.area_m2 ?? ""}
                          onChange={(e) => updatePlan(i, { area_m2: e.target.value ? +e.target.value : null })}
                          placeholder="m²"
                          className="w-24 bg-background"
                        />
                        <button
                          type="button"
                          onClick={() => removePlan(i)}
                          className="text-muted-foreground hover:text-destructive transition p-1"
                          aria-label="Remover planta"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
                Publicar no site
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg({ open: false, edit: null })}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {dlg.edit ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
